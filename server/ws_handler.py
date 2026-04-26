"""WebSocket 핸들러 — 채팅 메시지를 받아 Claude CLI 결과를 스트리밍 전송 + 대화 영구 저장"""

import asyncio
import json
from datetime import datetime
from pathlib import Path
from fastapi import WebSocket, WebSocketDisconnect
from websockets.exceptions import ConnectionClosedError, ConnectionClosedOK
from claude_runner import run_claude
from push_notifications import send_agent_complete, set_online_checker
from trading_stats import has_trading_keywords, format_trading_context
import sessions_store

# ── 팀 정보 룩업 (push 알림용) ────────────────────────
_TEAM_LOOKUP: dict[str, dict] = {}

def set_team_lookup(teams: list[dict]):
    """main.py에서 팀 목록 전달받아 룩업 초기화"""
    _TEAM_LOOKUP.clear()
    for t in teams:
        _TEAM_LOOKUP[t["id"]] = {"name": t.get("name", ""), "emoji": t.get("emoji", "")}

# ── 대화 기록 영구 저장 (세션 스토어 경유) ────────────
# 기존 단일 파일 구조 → 세션 분리 구조로 전환.
# add_message/get_history는 session_id를 받고, 없으면 해당 팀의 active 세션 사용.
# 과거 chat_history/{team_id}.json 은 sessions_store._ensure_default_session 호출 시 자동 마이그레이션.


# ── 에이전트 실시간 상태 (대시보드용) ─────────────────
AGENT_STATUS: dict[str, dict] = {}
RECENT_ACTIVITY: list[dict] = []  # 최근 20개

# ── 캐릭터 협업 상태 ────────────────────────────────
# char_state: "idle" | "working" | "collaborating" | "moving"
CHAR_STATE: dict[str, dict] = {}
# 진행 중인 협업 세션 {dispatch_id: {teams, action, started}}
ACTIVE_COLLABS: dict[str, dict] = {}

def get_char_state(team_id: str) -> dict:
    return CHAR_STATE.get(team_id, {"state": "idle", "collab_with": [], "action": None})

def _set_char_state(team_id: str, state: str, collab_with: list[str] | None = None, action: str | None = None):
    CHAR_STATE[team_id] = {
        "state": state,
        "collab_with": collab_with or [],
        "action": action,
        "updated": datetime.now().strftime("%H:%M:%S"),
    }

def _update_status(team_id: str, **kwargs):
    if team_id not in AGENT_STATUS:
        AGENT_STATUS[team_id] = {"working": False, "tool": None, "last_active": None, "last_prompt": "", "working_since": None}
    AGENT_STATUS[team_id].update(kwargs)
    # working 시작/종료 시간 자동 기록
    if "working" in kwargs:
        if kwargs["working"]:
            AGENT_STATUS[team_id]["working_since"] = datetime.now().timestamp()
        else:
            AGENT_STATUS[team_id]["working_since"] = None
    # working 변경 시 char_state 자동 동기화
    if "working" in kwargs:
        cur = get_char_state(team_id)
        if kwargs["working"] and cur["state"] == "idle":
            _set_char_state(team_id, "working")
        elif not kwargs["working"] and cur["state"] == "working":
            _set_char_state(team_id, "idle")

def _log_activity(team_id: str, content: str):
    RECENT_ACTIVITY.append({
        "time": datetime.now().strftime("%H:%M:%S"),
        "team": team_id,
        "content": content,
    })
    if len(RECENT_ACTIVITY) > 20:
        RECENT_ACTIVITY.pop(0)


class ConnectionManager:
    """활성 WebSocket 연결 + 세션 기반 대화 기록 관리 (팀당 다중 연결 지원)

    세션 전환은 WS 메시지 `{action: "switch_session", session_id}` 로 수행.
    각 WS 연결은 "현재 보고 있는 세션"을 기억해서, add_message 시 해당 세션에 저장하고
    그 세션을 구독 중인 연결에만 브로드캐스트한다.
    """

    def __init__(self):
        self.active: dict[str, list[WebSocket]] = {}  # team_id -> [ws, ...]
        # ws → 현재 보고 있는 session_id (팀당 여러 탭이 서로 다른 세션 보는 케이스)
        self.ws_session: dict[int, str] = {}

    async def connect(self, team_id: str, ws: WebSocket, session_id: str | None = None):
        await ws.accept()
        if team_id not in self.active:
            self.active[team_id] = []
        self.active[team_id].append(ws)
        sid = sessions_store.resolve_session_id(team_id, session_id)
        self.ws_session[id(ws)] = sid
        return sid

    def disconnect(self, team_id: str, ws: WebSocket):
        conns = self.active.get(team_id, [])
        if ws in conns:
            conns.remove(ws)
        if not conns:
            self.active.pop(team_id, None)
        self.ws_session.pop(id(ws), None)

    def set_ws_session(self, ws: WebSocket, session_id: str) -> None:
        self.ws_session[id(ws)] = session_id

    def get_ws_session(self, ws: WebSocket) -> str | None:
        return self.ws_session.get(id(ws))

    async def send_json(
        self,
        team_id: str,
        data: dict,
        sender_ws: WebSocket | None = None,
        session_id: str | None = None,
    ):
        """team_id의 연결에 전송.

        session_id가 지정되면 해당 세션을 보고 있는 연결에만 전송.
        미지정 시 이전 호환 동작(팀의 모든 연결).
        """
        for ws in self.active.get(team_id, []):
            if session_id is not None:
                if self.ws_session.get(id(ws)) != session_id:
                    continue
            try:
                await ws.send_json(data)
            except Exception:
                pass

    async def broadcast_all(self, data: dict):
        """활성 모든 WS 채널에 이벤트 브로드캐스트 (협업/상태 이벤트용)"""
        sent: set[int] = set()
        for conns in self.active.values():
            for ws in conns:
                ws_id = id(ws)
                if ws_id in sent:
                    continue
                sent.add(ws_id)
                try:
                    await ws.send_json(data)
                except Exception:
                    pass

    def add_message(
        self,
        team_id: str,
        msg_type: str,
        content: str,
        session_id: str | None = None,
    ) -> str:
        """세션에 메시지 추가. 사용된 session_id 반환."""
        return sessions_store.add_message(team_id, msg_type, content, session_id)

    def get_history(self, team_id: str, session_id: str | None = None) -> list[dict]:
        return sessions_store.get_messages(team_id, session_id)

    def clear_history(self, team_id: str, session_id: str | None = None) -> str:
        return sessions_store.clear_session(team_id, session_id)

    def has_active_connections(self) -> bool:
        """하나라도 활성 WS 연결이 있으면 True (= 유저가 웹에서 보고 있음)"""
        return any(conns for conns in self.active.values())


manager = ConnectionManager()
# 푸시 알림: 유저가 웹 접속 중이면 푸시 스킵
set_online_checker(manager.has_active_connections)


# ── 협업 브로드캐스트 (main.py dispatch에서 호출) ──────
async def collab_broadcast(dispatch_id: str, event: str, teams: list[str], action: str = "discussion"):
    """협업 시작/종료/스텝 이벤트를 모든 WS 채널에 브로드캐스트

    event: "collab_start" | "collab_step" | "collab_end"
    """
    now = datetime.now().strftime("%H:%M:%S")

    if event == "collab_start":
        ACTIVE_COLLABS[dispatch_id] = {"teams": teams, "action": action, "started": now}
        for tid in teams:
            others = [t for t in teams if t != tid]
            _set_char_state(tid, "collaborating", collab_with=others, action=action)
        await manager.broadcast_all({
            "type": "collab_start",
            "dispatch_id": dispatch_id,
            "teams": teams,
            "action": action,
            "time": now,
        })

    elif event == "collab_step":
        await manager.broadcast_all({
            "type": "collab_step",
            "dispatch_id": dispatch_id,
            "teams": teams,
            "action": action,
            "time": now,
        })

    elif event == "collab_end":
        ACTIVE_COLLABS.pop(dispatch_id, None)
        for tid in teams:
            # working 상태면 working 유지, 아니면 idle로
            is_working = AGENT_STATUS.get(tid, {}).get("working", False)
            _set_char_state(tid, "working" if is_working else "idle")
        await manager.broadcast_all({
            "type": "collab_end",
            "dispatch_id": dispatch_id,
            "teams": teams,
            "time": now,
        })
        # 각 팀 채널에도 개별 상태 업데이트 전송
        for tid in teams:
            await manager.send_json(tid, {
                "type": "char_state",
                "team_id": tid,
                **get_char_state(tid),
            })


async def emit_char_state(team_id: str):
    """특정 팀의 캐릭터 상태를 해당 팀 채널에 전송"""
    await manager.send_json(team_id, {
        "type": "char_state",
        "team_id": team_id,
        **get_char_state(team_id),
    })


async def _do_cancel(team_id: str):
    """작업 취소 — 프로세스 그룹 kill + 히스토리 정리 + 클라이언트 동기화"""
    from claude_runner import AGENT_PIDS
    import signal, os as _os
    pid = AGENT_PIDS.get(team_id)
    if pid:
        try:
            # 프로세스 그룹 전체 kill (Claude CLI + 자식 프로세스 모두)
            pgid = _os.getpgid(pid)
            _os.killpg(pgid, signal.SIGTERM)
            await asyncio.sleep(0.3)
            try:
                _os.killpg(pgid, signal.SIGKILL)
            except (ProcessLookupError, PermissionError):
                pass
        except (ProcessLookupError, PermissionError):
            # 이미 종료된 프로세스
            pass
        except Exception:
            # fallback: 단일 프로세스 kill
            try:
                _os.kill(pid, signal.SIGKILL)
            except Exception:
                pass
        AGENT_PIDS.pop(team_id, None)
    _update_status(team_id, working=False, tool=None)
    # 히스토리에서 마지막 user 메시지에 취소 표시 + 이후 ai 응답 제거
    sid = sessions_store.get_active_session_id(team_id)
    hist = manager.get_history(team_id, sid)
    last_user_idx = -1
    for i in range(len(hist) - 1, -1, -1):
        if hist[i].get("type") == "user":
            last_user_idx = i
            break
    if last_user_idx >= 0:
        hist[last_user_idx]["cancelled"] = True
        trimmed = hist[:last_user_idx + 1]
        sessions_store.set_messages(team_id, sid, trimmed)
    await manager.send_json(
        team_id,
        {"type": "history_sync", "messages": manager.get_history(team_id, sid), "session_id": sid},
        session_id=sid,
    )


# 팀별 취소 플래그 — run_claude 루프에서 체크
_cancel_flags: dict[str, bool] = {}


async def handle_chat(
    ws: WebSocket,
    team_id: str,
    project_path: str | None,
    session_id: str | None = None,
):
    """WebSocket 연결 하나를 처리한다. 각 팀은 독립적으로 병렬 실행된다.

    session_id를 URL 쿼리로 받아 초기 구독 세션 결정. 이후 `switch_session` 액션으로 변경 가능.
    """
    current_sid = await manager.connect(team_id, ws, session_id)

    # ── keepalive ping (20초 간격) — 연결 끊김 방지 ──
    _ws_alive = True

    async def _keepalive():
        """주기적으로 ping 전송 — 프록시/로드밸런서 타임아웃 방지"""
        while _ws_alive:
            try:
                await asyncio.sleep(20)
                if not _ws_alive:
                    break
                await ws.send_json({"type": "ping", "ts": datetime.now().strftime("%H:%M:%S")})
            except Exception:
                break
    ping_task = asyncio.create_task(_keepalive())

    # 접속 시 세션 목록 + 현재 세션 히스토리 전송
    try:
        await ws.send_json({
            "type": "sessions_sync",
            "sessions": sessions_store.list_sessions(team_id),
            "session_id": current_sid,
        })
        history = manager.get_history(team_id, current_sid)
        if history:
            await ws.send_json({
                "type": "history_sync",
                "messages": history,
                "session_id": current_sid,
            })
    except Exception:
        pass

    try:
        while True:
            raw = await ws.receive_text()
            msg = json.loads(raw)
            prompt = msg.get("prompt", "")
            image_paths = msg.get("images", [])
            action = msg.get("action")
            msg_sid = msg.get("session_id") or current_sid

            # ── 세션 관리 액션 ─────────────────────────────
            if action == "switch_session":
                target = msg.get("session_id")
                if target and target != current_sid:
                    # E3: 기존 세션의 agentStatus 스냅샷 저장 (working/tool/working_since 등)
                    try:
                        snap = dict(AGENT_STATUS.get(team_id, {}))
                        if snap:
                            sessions_store.set_session_meta(team_id, current_sid, "agentStatus", snap)
                    except Exception:
                        pass
                if target and sessions_store.switch_session(team_id, target):
                    current_sid = target
                    manager.set_ws_session(ws, current_sid)
                    # 새 세션으로 전환 — 저장된 스냅샷 있으면 복원
                    try:
                        restored = sessions_store.get_session_meta(team_id, current_sid, "agentStatus")
                        if isinstance(restored, dict):
                            AGENT_STATUS[team_id] = dict(restored)
                    except Exception:
                        pass
                    try:
                        await ws.send_json({
                            "type": "history_sync",
                            "messages": manager.get_history(team_id, current_sid),
                            "session_id": current_sid,
                        })
                    except Exception:
                        pass
                continue

            if action == "create_session":
                title = (msg.get("title") or "").strip() or None
                sess = sessions_store.create_session(team_id, title)
                current_sid = sess["id"]
                manager.set_ws_session(ws, current_sid)
                try:
                    await ws.send_json({
                        "type": "sessions_sync",
                        "sessions": sessions_store.list_sessions(team_id),
                        "session_id": current_sid,
                    })
                    await ws.send_json({
                        "type": "history_sync",
                        "messages": [],
                        "session_id": current_sid,
                    })
                except Exception:
                    pass
                continue

            if action == "delete_session":
                target = msg.get("session_id")
                if target:
                    sessions_store.delete_session(team_id, target)
                    # 이 연결이 해당 세션을 보고 있었으면 active로 전환
                    if current_sid == target:
                        current_sid = sessions_store.get_active_session_id(team_id)
                        manager.set_ws_session(ws, current_sid)
                    await manager.send_json(team_id, {
                        "type": "sessions_sync",
                        "sessions": sessions_store.list_sessions(team_id),
                        "session_id": current_sid,
                    })
                    try:
                        await ws.send_json({
                            "type": "history_sync",
                            "messages": manager.get_history(team_id, current_sid),
                            "session_id": current_sid,
                        })
                    except Exception:
                        pass
                continue

            if action == "rename_session":
                target = msg.get("session_id")
                title = (msg.get("title") or "").strip()
                if target and title and sessions_store.rename_session(team_id, target, title):
                    await manager.send_json(team_id, {
                        "type": "sessions_sync",
                        "sessions": sessions_store.list_sessions(team_id),
                        "session_id": current_sid,
                    })
                continue

            # 대화 지우기 요청 — 현재 세션만 비움
            if action == "clear_history":
                manager.clear_history(team_id, current_sid)
                await manager.send_json(
                    team_id,
                    {"type": "history_cleared", "session_id": current_sid},
                    session_id=current_sid,
                )
                continue

            # 작업 취소 요청 — 별도 처리 (run_claude 실행 중에도 동작)
            if action == "cancel":
                _cancel_flags[team_id] = True
                await _do_cancel(team_id)
                continue

            if not prompt and not image_paths:
                continue

            # 메시지에 session_id가 있으면 그 세션으로 업데이트
            if msg_sid and msg_sid != current_sid:
                if sessions_store.switch_session(team_id, msg_sid):
                    current_sid = msg_sid
                    manager.set_ws_session(ws, current_sid)

            # 이미지가 있으면 프롬프트에 파일 경로 추가
            if image_paths:
                img_instruction = "\n\n[첨부된 이미지 파일 — Read 도구로 직접 확인하세요]"
                for ip in image_paths:
                    img_instruction += f"\n- {ip}"
                prompt = (prompt or "이 이미지를 분석해줘") + img_instruction

            # 사용자 메시지
            display_msg = prompt.split("\n\n[첨부된 이미지")[0] if image_paths else prompt
            img_badge = f" 📷×{len(image_paths)}" if image_paths else ""
            await manager.send_json(
                team_id,
                {"type": "user", "content": display_msg + img_badge, "session_id": current_sid},
                session_id=current_sid,
            )
            manager.add_message(team_id, "user", display_msg + img_badge, current_sid)

            # Claude 응답 — run_claude를 태스크로, WS 수신을 동시에 처리
            await manager.send_json(team_id, {"type": "ai_start", "session_id": current_sid}, session_id=current_sid)
            await manager.send_json(team_id, {"type": "status", "content": "🧠 생각 중...", "session_id": current_sid}, session_id=current_sid)
            _update_status(team_id, working=True, tool=None, last_active=datetime.now().strftime("%H:%M:%S"), last_prompt=prompt[:60])
            _log_activity(team_id, f"📨 {prompt[:50]}")

            # 이전 작업 실행 중이면 취소하지 않고 큐에 추가 (TM 패턴)
            from claude_runner import AGENT_PIDS
            from task_queue import debouncer, task_queue
            if AGENT_PIDS.get(team_id):
                try:
                    await manager.send_json(
                        team_id,
                        {"type": "status", "content": "📋 이전 작업 중 — 끝나는 대로 이어서 처리합니다", "session_id": current_sid},
                        session_id=current_sid,
                    )
                except Exception:
                    pass
                await debouncer.add(
                    team_id, prompt,
                    callback=lambda tid, merged: task_queue.enqueue(tid, merged, session_id=current_sid)
                )
                # 이전 작업 유지 — 이번 메시지는 큐에 예약됨, 메인 루프는 다음 receive로
                continue

            # 🧑‍💼 스태프 — 모든 응답 무료 LLM, 복잡 작업은 CPO 멘션 위임
            if team_id == "staff":
                try:
                    # ai_start 먼저 → 클라가 streaming 상태 인지 (말풍선 표시)
                    await manager.send_json(
                        team_id,
                        {"type": "ai_start", "session_id": current_sid},
                        session_id=current_sid,
                    )
                    from staff_engine import handle as staff_handle
                    # 이어지는 대화 — 최근 히스토리 주입 (인사 반복 방지)
                    try:
                        prior_history = manager.get_history(team_id, current_sid) or []
                    except Exception:
                        prior_history = []
                    result = await staff_handle(prompt, language="ko", history=prior_history)
                    reply = result.get("reply") or ""
                    await manager.send_json(
                        team_id,
                        {"type": "ai_chunk", "content": reply, "session_id": current_sid},
                        session_id=current_sid,
                    )
                    await manager.send_json(
                        team_id,
                        {"type": "ai_end", "session_id": current_sid},
                        session_id=current_sid,
                    )
                    manager.add_message(team_id, "ai", reply, current_sid)
                    _update_status(team_id, working=False, tool=None,
                                   last_active=datetime.now().strftime("%H:%M:%S"))
                    # CPO 위임 필요 → 자동 디스패치 트리거 (스태프 채팅창에 결과 보이지 않고 별도 처리)
                    if result.get("escalate"):
                        try:
                            await manager.send_json(team_id, {
                                "type": "status",
                                "content": "🔔 CPO에 디스패치 요청 전달 중",
                                "session_id": current_sid,
                            }, session_id=current_sid)
                        except Exception:
                            pass
                        # 백그라운드로 CPO 직접 호출 (Claude full)
                        async def _bg_cpo():
                            try:
                                cpo_team = next((t for t in __import__("main").TEAMS if t["id"] == "cpo-claude"), None)
                                if not cpo_team:
                                    return
                                cpo_path = os.path.expanduser(cpo_team["localPath"])
                                async for chunk in run_claude(result["escalate_prompt"], cpo_path, "cpo-claude"):
                                    pass  # CPO 결과는 cpo-claude 채팅창에 자동 저장됨
                            except Exception as e:
                                logger.warning("[staff/escalate] %s", e)
                        asyncio.create_task(_bg_cpo())
                    try:
                        sessions_store.end_job(team_id, current_sid, "done")
                    except Exception:
                        pass
                    continue  # Claude 호출 스킵 (스태프는 항상 무료 LLM)
                except Exception as e:
                    logger.warning("[staff] 실패: %s", e)
                    # 폴백: 기본 Claude 흐름

            # 🤖 비서 1차 처리 (CPO 채팅에만, Claude 토큰 절감)
            if team_id == "cpo-claude":
                try:
                    from secretary import try_secretary
                    sec_reply = await try_secretary(prompt)
                    if sec_reply:
                        await manager.send_json(
                            team_id,
                            {"type": "ai_chunk", "content": sec_reply, "session_id": current_sid},
                            session_id=current_sid,
                        )
                        await manager.send_json(
                            team_id,
                            {"type": "ai_end", "session_id": current_sid},
                            session_id=current_sid,
                        )
                        manager.add_message(team_id, "ai", sec_reply, current_sid)
                        _update_status(team_id, working=False, tool=None,
                                       last_active=datetime.now().strftime("%H:%M:%S"))
                        try:
                            sessions_store.end_job(team_id, current_sid, "done")
                        except Exception:
                            pass
                        continue  # Claude 호출 스킵
                except Exception as e:
                    logger.warning("[secretary] 실패, Claude 폴백: %s", e)

            _cancel_flags[team_id] = False
            full_response = ""
            cancelled = False

            # Claude 스트리밍 (장시간 작업 대비 15분, 이벤트 수신 시 타이머 리셋)
            _CLAUDE_IDLE_TIMEOUT = 900  # 15분 — 아무 이벤트도 없을 때만 강제 종료
            event_queue: asyncio.Queue = asyncio.Queue()

            # ── 매매봇 컨텍스트 자동 주입 (CPO 채팅에서 매매 키워드 감지 시) ──
            _claude_prompt = prompt
            if team_id == "cpo-claude" and has_trading_keywords(prompt):
                _trading_ctx = format_trading_context()
                if _trading_ctx:
                    _claude_prompt = (
                        f"{prompt}\n\n"
                        f"───── 참고: 매매봇 실시간 데이터 ─────\n"
                        f"{_trading_ctx}\n"
                        f"───── 데이터 끝 ─────"
                    )

            # 세션 = 작업 단위: 새 프롬프트마다 job 시작
            try:
                sessions_store.start_job(team_id, current_sid, prompt)
            except Exception:
                pass

            async def _stream_claude():
                try:
                    async for event in run_claude(_claude_prompt, project_path, team_id, session_id=current_sid):
                        await event_queue.put(event)
                except Exception as e:
                    await event_queue.put({"kind": "error", "content": str(e)})
                finally:
                    await event_queue.put(None)  # 종료 신호

            async def _listen_ws():
                """run_claude 실행 중 WS 메시지 수신 (cancel 처리)"""
                nonlocal cancelled
                try:
                    while True:
                        raw2 = await ws.receive_text()
                        msg2 = json.loads(raw2)
                        if msg2.get("action") == "cancel":
                            _cancel_flags[team_id] = True
                            cancelled = True
                            await _do_cancel(team_id)
                            return
                        elif msg2.get("action") == "clear_history":
                            manager.clear_history(team_id, current_sid)
                            await manager.send_json(
                                team_id,
                                {"type": "history_cleared", "session_id": current_sid},
                                session_id=current_sid,
                            )
                        elif msg2.get("action") == "pong":
                            # keepalive 응답 — 무시
                            pass
                        elif msg2.get("prompt"):
                            # 작업 중 추가 메시지 → 디바운서로 전달 (배칭)
                            from task_queue import debouncer, task_queue
                            _sid_for_queue = current_sid
                            await debouncer.add(
                                team_id, msg2["prompt"],
                                callback=lambda tid, merged: task_queue.enqueue(tid, merged, session_id=_sid_for_queue)
                            )
                            await manager.send_json(
                                team_id,
                                {"type": "status", "content": f"📋 추가 메시지 대기 중 — 현재 작업 완료 후 이어서 처리합니다", "session_id": current_sid},
                                session_id=current_sid,
                            )
                except WebSocketDisconnect:
                    # 연결 끊김 — Claude 작업은 계속 진행 (결과는 히스토리에 저장됨)
                    return
                except Exception:
                    return

            # 두 태스크를 동시에 실행 (idle timeout 감시)
            stream_task = asyncio.create_task(_stream_claude())
            listen_task = asyncio.create_task(_listen_ws())
            _last_event_time = asyncio.get_event_loop().time()

            # 이벤트 큐에서 소비하면서 클라이언트에 전송
            while True:
                if cancelled or _cancel_flags.get(team_id):
                    stream_task.cancel()
                    break
                # idle 타임아웃: 마지막 이벤트 이후 _CLAUDE_IDLE_TIMEOUT 경과
                idle = asyncio.get_event_loop().time() - _last_event_time
                if idle > _CLAUDE_IDLE_TIMEOUT:
                    _cancel_flags[team_id] = True
                    await _do_cancel(team_id)
                    stream_task.cancel()
                    msg_txt = f"⚠️ {_CLAUDE_IDLE_TIMEOUT // 60}분간 응답 없음 — 강제 종료."
                    full_response = full_response + ("\n\n" if full_response else "") + msg_txt
                    await manager.send_json(
                        team_id,
                        {"type": "ai_chunk", "content": msg_txt, "session_id": current_sid},
                        session_id=current_sid,
                    )
                    break
                try:
                    event = await asyncio.wait_for(event_queue.get(), timeout=0.5)
                except asyncio.TimeoutError:
                    continue
                # 이벤트 수신 → idle 타이머 리셋
                _last_event_time = asyncio.get_event_loop().time()
                if event is None:
                    break  # 스트리밍 완료
                if _cancel_flags.get(team_id):
                    break
                kind = event.get("kind")
                if kind == "status":
                    _update_status(team_id, tool=event["content"])
                    _log_activity(team_id, event["content"])
                    try:
                        await manager.send_json(
                            team_id,
                            {"type": "status", "content": event["content"], "session_id": current_sid},
                            session_id=current_sid,
                        )
                    except Exception:
                        pass
                elif kind == "tool_use":
                    # 도구 호출 시작 — 실시간 진행 카드
                    summary = event.get("summary", "")
                    _update_status(team_id, tool=summary)
                    _log_activity(team_id, summary)
                    try:
                        await manager.send_json(
                            team_id,
                            {
                                "type": "tool_use",
                                "tool": event.get("tool", "?"),
                                "tool_id": event.get("tool_id", ""),
                                "input": event.get("input", {}),
                                "summary": summary,
                                "session_id": current_sid,
                            },
                            session_id=current_sid,
                        )
                    except Exception:
                        pass
                elif kind == "tool_result":
                    # 도구 완료 — 진행 카드에 체크 표시
                    try:
                        await manager.send_json(
                            team_id,
                            {
                                "type": "tool_result",
                                "tool": event.get("tool", "?"),
                                "tool_id": event.get("tool_id", ""),
                                "is_error": event.get("is_error", False),
                                "summary": event.get("summary", ""),
                                "session_id": current_sid,
                            },
                            session_id=current_sid,
                        )
                    except Exception:
                        pass
                elif kind == "error":
                    try:
                        await manager.send_json(
                            team_id,
                            {"type": "ai_chunk", "content": f"\n❌ 오류: {event['content']}", "session_id": current_sid},
                            session_id=current_sid,
                        )
                    except Exception:
                        pass
                else:
                    full_response += event.get("content", "")
                    try:
                        await manager.send_json(
                            team_id,
                            {"type": "ai_chunk", "content": event.get("content", ""), "session_id": current_sid},
                            session_id=current_sid,
                        )
                    except Exception:
                        pass

            listen_task.cancel()
            try:
                await listen_task
            except (asyncio.CancelledError, Exception):
                pass

            # 취소 체크 — stream이 먼저 끝나도 cancel 플래그가 있으면 저장하지 않음
            if cancelled or _cancel_flags.get(team_id):
                _cancel_flags.pop(team_id, None)
                try: sessions_store.end_job(team_id, current_sid, "cancelled")
                except Exception: pass
                # _do_cancel이 이미 히스토리 정리 + history_sync 전송함
                await manager.send_json(
                    team_id,
                    {"type": "ai_end", "content": "", "session_id": current_sid},
                    session_id=current_sid,
                )
                continue

            # 정상 완료 — 빈 응답 시 정확한 원인 안내 (rate limit 오진 방지)
            if not full_response.strip():
                try: sessions_store.end_job(team_id, current_sid, "failed", "빈 응답")
                except Exception: pass
                full_response = "⚠️ 응답이 비어있습니다. 세션이 초기화되었거나 일시적 오류일 수 있어요. 다시 메시지를 보내주세요."
                await manager.send_json(
                    team_id,
                    {"type": "ai_chunk", "content": full_response, "session_id": current_sid},
                    session_id=current_sid,
                )

            manager.add_message(team_id, "ai", full_response, current_sid)
            try: sessions_store.end_job(team_id, current_sid, "done")
            except Exception: pass
            _update_status(team_id, working=False, tool=None)
            _log_activity(team_id, f"✅ 완료 ({len(full_response)}자)")
            try:
                await manager.send_json(
                    team_id,
                    {"type": "ai_end", "content": full_response, "session_id": current_sid},
                    session_id=current_sid,
                )
            except Exception:
                pass  # WS 끊김 — 히스토리에 저장됨, 재접속 시 history_sync로 복원

            # 푸시 알림: 응답 완료 알림 (비동기 발송, 실패해도 무시)
            try:
                # 팀 이름/이모지 조회
                _team_info = _TEAM_LOOKUP.get(team_id, {})
                _t_name = _team_info.get("name", team_id)
                _t_emoji = _team_info.get("emoji", "🤖")
                _preview = full_response[:100].replace("\n", " ")
                import functools
                asyncio.get_event_loop().run_in_executor(
                    None, functools.partial(send_agent_complete, _t_name, _t_emoji, _preview, team_id=team_id)
                )
            except Exception:
                pass

    except WebSocketDisconnect:
        _ws_alive = False
        ping_task.cancel()
        _update_status(team_id, working=False, tool=None)
        manager.disconnect(team_id, ws)
    except (ConnectionClosedError, ConnectionClosedOK):
        _ws_alive = False
        ping_task.cancel()
        _update_status(team_id, working=False, tool=None)
        manager.disconnect(team_id, ws)
    except Exception:
        _ws_alive = False
        ping_task.cancel()
        _update_status(team_id, working=False, tool=None)
        manager.disconnect(team_id, ws)
