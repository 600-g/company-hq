"""WebSocket 핸들러 — 채팅 메시지를 받아 Claude CLI 결과를 스트리밍 전송 + 대화 영구 저장"""

import asyncio
import json
from datetime import datetime
from pathlib import Path
from fastapi import WebSocket, WebSocketDisconnect
from claude_runner import run_claude
from push_notifications import send_agent_complete, set_online_checker
from trading_stats import has_trading_keywords, format_trading_context

# ── 팀 정보 룩업 (push 알림용) ────────────────────────
_TEAM_LOOKUP: dict[str, dict] = {}

def set_team_lookup(teams: list[dict]):
    """main.py에서 팀 목록 전달받아 룩업 초기화"""
    _TEAM_LOOKUP.clear()
    for t in teams:
        _TEAM_LOOKUP[t["id"]] = {"name": t.get("name", ""), "emoji": t.get("emoji", "")}

# ── 대화 기록 영구 저장 ─────────────────────────────
_CHAT_DIR = Path(__file__).parent / "chat_history"
_CHAT_DIR.mkdir(exist_ok=True)
_MAX_MESSAGES = 100  # 팀당 최대 저장 메시지 수

def _chat_path(team_id: str) -> Path:
    return _CHAT_DIR / f"{team_id}.json"

def _load_chat(team_id: str) -> list[dict]:
    p = _chat_path(team_id)
    if p.exists():
        try:
            return json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            pass
    return []

def _save_chat(team_id: str, messages: list[dict]):
    # 최근 N개만 유지
    trimmed = messages[-_MAX_MESSAGES:]
    _chat_path(team_id).write_text(json.dumps(trimmed, ensure_ascii=False, indent=None), encoding="utf-8")


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
    """활성 WebSocket 연결 + 대화 기록 관리 (팀당 다중 연결 지원)"""

    def __init__(self):
        self.active: dict[str, list[WebSocket]] = {}  # team_id -> [ws, ...]
        self.history: dict[str, list] = {}  # team_id -> 대화 기록 (메모리 캐시)

    async def connect(self, team_id: str, ws: WebSocket):
        await ws.accept()
        if team_id not in self.active:
            self.active[team_id] = []
        self.active[team_id].append(ws)
        # 디스크에서 기록 로드
        if team_id not in self.history:
            self.history[team_id] = _load_chat(team_id)

    def disconnect(self, team_id: str, ws: WebSocket):
        conns = self.active.get(team_id, [])
        if ws in conns:
            conns.remove(ws)
        if not conns:
            self.active.pop(team_id, None)

    async def send_json(self, team_id: str, data: dict, sender_ws: WebSocket | None = None):
        """team_id의 모든 연결에 전송 (sender 포함)"""
        for ws in self.active.get(team_id, []):
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

    def add_message(self, team_id: str, msg_type: str, content: str):
        if team_id not in self.history:
            self.history[team_id] = _load_chat(team_id)
        self.history[team_id].append({"type": msg_type, "content": content})
        # 최근 N개만 유지
        if len(self.history[team_id]) > _MAX_MESSAGES:
            self.history[team_id] = self.history[team_id][-_MAX_MESSAGES:]
        # 디스크에 저장
        _save_chat(team_id, self.history[team_id])

    def get_history(self, team_id: str) -> list[dict]:
        if team_id not in self.history:
            self.history[team_id] = _load_chat(team_id)
        return self.history[team_id]

    def clear_history(self, team_id: str):
        self.history[team_id] = []
        _save_chat(team_id, [])

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
    hist = manager.get_history(team_id)
    last_user_idx = -1
    for i in range(len(hist) - 1, -1, -1):
        if hist[i].get("type") == "user":
            last_user_idx = i
            break
    if last_user_idx >= 0:
        # user 메시지에 cancelled 마킹, 이후 AI 응답은 제거
        hist[last_user_idx]["cancelled"] = True
        manager.history[team_id] = hist[:last_user_idx + 1]
        _save_chat(team_id, manager.history[team_id])
    await manager.send_json(team_id, {"type": "history_sync", "messages": manager.get_history(team_id)})


# 팀별 취소 플래그 — run_claude 루프에서 체크
_cancel_flags: dict[str, bool] = {}


async def handle_chat(ws: WebSocket, team_id: str, project_path: str | None):
    """WebSocket 연결 하나를 처리한다. 각 팀은 독립적으로 병렬 실행된다."""
    await manager.connect(team_id, ws)

    # ── keepalive ping (30초 간격) — 연결 끊김 방지 ──
    _ws_alive = True

    async def _keepalive():
        """주기적으로 ping 전송 — 프록시/로드밸런서 타임아웃 방지"""
        while _ws_alive:
            try:
                await asyncio.sleep(25)
                if not _ws_alive:
                    break
                await ws.send_json({"type": "ping", "ts": datetime.now().strftime("%H:%M:%S")})
            except Exception:
                break
    ping_task = asyncio.create_task(_keepalive())

    # 접속 시 과거 대화 전송 (동기화)
    history = manager.get_history(team_id)
    if history:
        try:
            await ws.send_json({"type": "history_sync", "messages": history})
        except Exception:
            pass

    try:
        while True:
            raw = await ws.receive_text()
            msg = json.loads(raw)
            prompt = msg.get("prompt", "")
            image_paths = msg.get("images", [])

            # 대화 지우기 요청
            if msg.get("action") == "clear_history":
                manager.clear_history(team_id)
                await manager.send_json(team_id, {"type": "history_cleared"})
                continue

            # 작업 취소 요청 — 별도 처리 (run_claude 실행 중에도 동작)
            if msg.get("action") == "cancel":
                _cancel_flags[team_id] = True
                await _do_cancel(team_id)
                continue

            if not prompt and not image_paths:
                continue

            # 이미지가 있으면 프롬프트에 파일 경로 추가
            if image_paths:
                img_instruction = "\n\n[첨부된 이미지 파일 — Read 도구로 직접 확인하세요]"
                for ip in image_paths:
                    img_instruction += f"\n- {ip}"
                prompt = (prompt or "이 이미지를 분석해줘") + img_instruction

            # 사용자 메시지
            display_msg = prompt.split("\n\n[첨부된 이미지")[0] if image_paths else prompt
            img_badge = f" 📷×{len(image_paths)}" if image_paths else ""
            await manager.send_json(team_id, {"type": "user", "content": display_msg + img_badge})
            manager.add_message(team_id, "user", display_msg + img_badge)

            # Claude 응답 — run_claude를 태스크로, WS 수신을 동시에 처리
            await manager.send_json(team_id, {"type": "ai_start"})
            await manager.send_json(team_id, {"type": "status", "content": "🧠 생각 중..."})
            _update_status(team_id, working=True, tool=None, last_active=datetime.now().strftime("%H:%M:%S"), last_prompt=prompt[:60])
            _log_activity(team_id, f"📨 {prompt[:50]}")

            # 이전 작업 실행 중이면 자동 취소 (동일 팀 블로킹 방지)
            from claude_runner import AGENT_PIDS
            if AGENT_PIDS.get(team_id):
                _cancel_flags[team_id] = True
                await _do_cancel(team_id)
                await asyncio.sleep(0.5)

            _cancel_flags[team_id] = False
            full_response = ""
            cancelled = False

            # Claude 스트리밍을 큐 기반으로 처리 (3분 타임아웃)
            _CLAUDE_TIMEOUT = 180  # 3분
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

            async def _stream_claude():
                try:
                    async for event in run_claude(_claude_prompt, project_path, team_id):
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
                            manager.clear_history(team_id)
                            await manager.send_json(team_id, {"type": "history_cleared"})
                        elif msg2.get("action") == "pong":
                            # keepalive 응답 — 무시
                            pass
                        elif msg2.get("prompt"):
                            # 작업 중 추가 메시지 → 디바운서로 전달 (배칭)
                            from task_queue import debouncer, task_queue
                            await debouncer.add(
                                team_id, msg2["prompt"],
                                callback=lambda tid, merged: task_queue.enqueue(tid, merged)
                            )
                            await manager.send_json(team_id, {"type": "status", "content": f"📋 추가 메시지 대기 중 — 현재 작업 완료 후 이어서 처리합니다"})
                except WebSocketDisconnect:
                    # 연결 끊김 — Claude 작업은 계속 진행 (결과는 히스토리에 저장됨)
                    return
                except Exception:
                    return

            # 두 태스크를 동시에 실행 (타임아웃 감시 포함)
            stream_task = asyncio.create_task(_stream_claude())
            listen_task = asyncio.create_task(_listen_ws())
            _stream_start = asyncio.get_event_loop().time()

            # 이벤트 큐에서 소비하면서 클라이언트에 전송
            while True:
                if cancelled or _cancel_flags.get(team_id):
                    stream_task.cancel()
                    break
                # 타임아웃 체크
                elapsed = asyncio.get_event_loop().time() - _stream_start
                if elapsed > _CLAUDE_TIMEOUT and not full_response:
                    # 3분 동안 출력 없음 → 강제 종료
                    _cancel_flags[team_id] = True
                    await _do_cancel(team_id)
                    stream_task.cancel()
                    full_response = f"⚠️ ���답 타임아웃 ({_CLAUDE_TIMEOUT}초). 다시 시도해주세요."
                    await manager.send_json(team_id, {"type": "ai_chunk", "content": full_response})
                    break
                try:
                    event = await asyncio.wait_for(event_queue.get(), timeout=0.5)
                except asyncio.TimeoutError:
                    continue
                if event is None:
                    break  # 스트리밍 완료
                if _cancel_flags.get(team_id):
                    break
                if event["kind"] == "status":
                    _update_status(team_id, tool=event["content"])
                    _log_activity(team_id, event["content"])
                    await manager.send_json(team_id, {"type": "status", "content": event["content"]})
                elif event["kind"] == "error":
                    await manager.send_json(team_id, {"type": "ai_chunk", "content": f"\n❌ 오류: {event['content']}"})
                else:
                    full_response += event["content"]
                    await manager.send_json(team_id, {"type": "ai_chunk", "content": event["content"]})

            listen_task.cancel()
            try:
                await listen_task
            except (asyncio.CancelledError, Exception):
                pass

            # 취소 체크 — stream이 먼저 끝나도 cancel 플래그가 있으면 저장하지 않음
            if cancelled or _cancel_flags.get(team_id):
                _cancel_flags.pop(team_id, None)
                # _do_cancel이 이미 히스토리 정리 + history_sync 전송함
                await manager.send_json(team_id, {"type": "ai_end", "content": ""})
                continue

            # 정상 완료 — 빈 응답 시 정확한 원인 안내 (rate limit 오진 방지)
            if not full_response.strip():
                full_response = "⚠️ 응답이 비어있습니다. 세션이 초기화되었거나 일시적 오류일 수 있어요. 다시 메시지를 보내주세요."
                await manager.send_json(team_id, {"type": "ai_chunk", "content": full_response})

            manager.add_message(team_id, "ai", full_response)
            _update_status(team_id, working=False, tool=None)
            _log_activity(team_id, f"✅ 완료 ({len(full_response)}자)")
            await manager.send_json(team_id, {"type": "ai_end", "content": full_response})

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
    except Exception:
        _ws_alive = False
        ping_task.cancel()
        _update_status(team_id, working=False, tool=None)
        manager.disconnect(team_id, ws)
