"""WebSocket 핸들러 — 채팅 메시지를 받아 Claude CLI 결과를 스트리밍 전송 + 대화 영구 저장"""

import asyncio
import json
import re
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


# ── 자동 에러 복구 (오케스트레이션) ──────────────────────────────────
# 에이전트가 빈 응답/예외로 사용자 요청을 못 처리하면 CPO 에게 자동 보고.
# CPO 가 진단 → 수정 → 원래 에이전트에게 재발사 → 결과 사용자에게 표시.
# 같은 (team_id, original_prompt) 무한 루프 방지용 캐시.
_AUTO_RECOVERY_RECENT: dict[str, float] = {}  # key: f"{team_id}:{prompt_hash}" → ts


async def _auto_recovery_dispatch(
    team_id: str,
    original_prompt: str,
    error_summary: str,
    error_log_tail: list[str] | None = None,
):
    """에이전트 실패 시 CPO 에게 자동 보고 + 재시도 트리거.
    - CPO 가 진단/수정 후 원래 prompt 를 해당 에이전트에 재발사
    - 사용자 채팅창에 진행 메시지 + CPO 채팅창에도 작업 표시
    - 무한 루프 방지: 같은 (team, prompt) 가 5분 내 재발생하면 스킵
    """
    import hashlib, time
    if team_id == "cpo-claude" or team_id == "staff":
        return  # CPO 자신은 자동 보고 안 함
    key = f"{team_id}:{hashlib.md5(original_prompt.encode()).hexdigest()[:12]}"
    now = time.time()
    last_entry = _AUTO_RECOVERY_RECENT.get(key)
    last_ts = last_entry[0] if isinstance(last_entry, tuple) else (last_entry or 0)
    last_ticket_ts = last_entry[1] if isinstance(last_entry, tuple) else None
    if now - last_ts < 300:
        logger.warning("[auto-recovery] %s 5분 내 재발 — CPO 자동 복구도 실패 → 사용자 알림", key)
        # 직전 ticket 이 있으면 critical 마킹
        if last_ticket_ts:
            try:
                from main import _mark_auto_recovery_critical
                _mark_auto_recovery_critical(last_ticket_ts)
            except Exception as _e:
                logger.warning("[auto-recovery] critical 마킹 실패: %s", _e)
        # 죽어도 안 되는 케이스 — 사용자에게 명시적 알림 + 푸시
        team_info_x = _TEAM_LOOKUP.get(team_id, {})
        try:
            await manager.send_json(team_id, {
                "type": "ai_chunk",
                "content": (
                    f"\n\n🚨 자동 복구 실패 (5분 내 같은 오류 재발)\n"
                    f"   원인: {error_summary[:200]}\n"
                    f"   CPO 자동 진단/수정도 효과 없음 — 사용자 직접 결정 필요.\n"
                    f"   • 다른 표현으로 재요청\n"
                    f"   • 이 작업이 너무 복잡하면 분할\n"
                    f"   • 기술적 제약(모델 limit/API 한도) 가능성\n"
                ),
                "session_id": "default",
            })
        except Exception:
            pass
        # OS 푸시 알림
        try:
            from push_notifications import send_push as _spush
            t_name = team_info_x.get("name", team_id)
            t_emoji = team_info_x.get("emoji", "🤖")
            _spush(
                title=f"🚨 {t_emoji} {t_name} 자동 복구 실패",
                body=f"{error_summary[:120]} — 직접 결정 필요",
                tag=f"recovery-fail-{team_id}",
                url="/hub",
                team_id=team_id,
            )
        except Exception:
            pass
        return

    team_info = _TEAM_LOOKUP.get(team_id, {})
    team_name = team_info.get("name", team_id)
    team_emoji = team_info.get("emoji", "🤖")

    # 자체 ticket 작성 — bug_reports.jsonl 에 자동 기록 (CPO 가 완료 시 ts 로 resolved 마킹)
    ticket_ts: str | None = None
    try:
        from main import _record_auto_recovery_ticket
        ticket_ts = _record_auto_recovery_ticket(
            team_id=team_id,
            team_name=team_name,
            error_summary=error_summary,
            original_prompt=original_prompt,
        )
    except Exception as _e:
        logger.warning("[auto-recovery] ticket 작성 실패: %s", _e)
    _AUTO_RECOVERY_RECENT[key] = (now, ticket_ts)

    # 사용자 채팅창에 진행 시스템 메시지
    try:
        await manager.send_json(team_id, {
            "type": "ai_chunk",
            "content": (
                f"\n\n🛠 자동 진단 시작 — CPO 가 처리 중...\n"
                f"   원인 분석 + 수정 + 재시도까지 자동 진행. "
                f"최대 1~2분 소요. 사용자 추가 작업 불필요.\n"
            ),
            "session_id": "default",
        })
    except Exception:
        pass

    # CPO 에 자동 보고 prompt 구성
    log_section = ""
    if error_log_tail:
        log_section = "\n[로그 마지막]\n" + "\n".join(error_log_tail[-15:])
    ticket_section = (
        f"\n\n[ticket]\n"
        f"이 사고는 자동 ticket 으로 기록됨 (ts={ticket_ts}).\n"
        f"수정+재시도 성공하면 반드시 다음 호출로 ticket 을 resolved 로 마킹:\n"
        f"```bash\n"
        f"curl -s -X POST http://localhost:8000/api/diag/report/status \\\n"
        f"  -H 'Content-Type: application/json' \\\n"
        f"  -d '{{\"ts\":\"{ticket_ts}\",\"status\":\"resolved\"}}'\n"
        f"```\n"
        f"이 호출이 빠지면 /bugs 페이지에 영구 'open' 으로 남아 사용자가 수동 처리해야 함.\n"
    ) if ticket_ts else ""
    recovery_prompt = (
        f"[자동 에러 복구]\n"
        f"실패 에이전트: {team_emoji} {team_name} ({team_id})\n"
        f"원본 사용자 요청: {original_prompt[:500]}\n"
        f"에러 요약: {error_summary}\n"
        f"{log_section}{ticket_section}\n\n"
        f"━━━━━ 자동 복구 절차 (반드시 따를 것) ━━━━━\n"
        f"1. 진단: 에러 원인 분석 (시스템 프롬프트 / 작업 폴더 / 권한 / 코드 / 모델 limit 중 어디인지)\n"
        f"2. 수정: 즉시 적용 가능한 변경 시도\n"
        f"   - 시스템 프롬프트 문제 → server/team_prompts.json 의 {team_id} 항목 수정\n"
        f"   - 작업 폴더 권한 문제 → ~/Developer/agents/{team_id}/ 점검\n"
        f"   - 코드/설정 문제 → 해당 파일 수정 + git commit (배포는 X — 사용자가 결정)\n"
        f"3. 재시도: 수정 직후 원본 사용자 요청을 해당 에이전트에 재발사\n"
        f"   응답 본문에 정확히 다음 형식 포함 (백엔드가 자동 라우팅):\n"
        f"   ```dispatch\n"
        f"   [{{\"team\": \"{team_id}\", \"prompt\": \"<원본 요청 그대로>\"}}]\n"
        f"   ```\n"
        f"4. 결과 보고: 무엇을 진단/수정했는지 + 재시도 결과 (성공/실패) 1~2문장\n"
        f"5. 코드 변경 했으면 git commit 명시 (사용자가 [업데이트] 버튼으로 배포할 수 있게)\n"
        f"6. ticket 자동 마킹 — 위 [ticket] 섹션의 curl 명령 실행 (Bash tool 사용)\n"
        f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n"
        f"🚨 절대 사용자에게 '다시 해보세요' 같은 핑계 거절 금지. 직접 수정+재시도+ticket 마킹까지 책임.\n"
    )

    cpo_path = "~/Developer/my-company/company-hq"
    logger.info("[auto-recovery] CPO 에 자동 보고: team=%s prompt=%s", team_id, original_prompt[:60])
    try:
        async for _chunk in run_claude(recovery_prompt, cpo_path, "cpo-claude"):
            pass  # CPO 응답 처리는 본인 ws 채널에서 자동 표시 (handle_chat 의 cpo-claude WS)
    except Exception as e:
        logger.warning("[auto-recovery] CPO 호출 실패: %s", e)


# ── Dispatch block 자동 라우팅 ──────────────────────────────────────────────
# CPO 또는 다른 에이전트가 응답에 ```dispatch [{"team":"...", "prompt":"..."}, ...] ``` 블록을
# 포함하면 백엔드가 자동 파싱해 해당 팀에 prompt 를 재발사. 깊이 제한으로 무한 루프 방지.
_DISPATCH_RE = re.compile(r"```dispatch\s*\n([\s\S]*?)```")
_DISPATCH_DEPTH_LIMIT = 3   # 한 사용자 요청에서 발생할 수 있는 자동 디스패치 체인 최대 깊이
_DISPATCH_RECENT: dict[str, int] = {}    # 최근 디스패치 깊이 추적


def _parse_dispatch_blocks(text: str) -> list[dict]:
    """응답 본문에서 dispatch 블록 파싱. 형식 잘못이면 무시."""
    out: list[dict] = []
    if not text or "```dispatch" not in text:
        return out
    for m in _DISPATCH_RE.finditer(text):
        try:
            body = m.group(1).strip()
            arr = json.loads(body)
            if not isinstance(arr, list):
                continue
            for entry in arr:
                if not isinstance(entry, dict):
                    continue
                team = entry.get("team")
                prm = entry.get("prompt")
                if not team or not prm:
                    continue
                out.append({"team": str(team), "prompt": str(prm)})
        except Exception as e:
            logger.warning("[dispatch] parse 실패: %s", e)
    return out


async def _route_dispatch(source_team: str, target_team: str, prompt: str, depth: int = 0):
    """target_team 에 prompt 재발사 — 백그라운드로 run_claude + 채팅창에 메시지 표시."""
    if depth >= _DISPATCH_DEPTH_LIMIT:
        logger.warning("[dispatch] 깊이 한계 도달 — 추가 라우팅 스킵 (%s → %s)", source_team, target_team)
        return
    target_info = _TEAM_LOOKUP.get(target_team)
    if not target_info:
        logger.warning("[dispatch] 알 수 없는 target team: %s", target_team)
        return
    target_path = target_info.get("localPath", "~/Developer/my-company/company-hq")

    # target 팀 채팅창에 system 메시지로 디스패치 사실 표시
    src_info = _TEAM_LOOKUP.get(source_team, {})
    src_label = f"{src_info.get('emoji','🤖')} {src_info.get('name', source_team)}"
    try:
        await manager.send_json(target_team, {
            "type": "ai_chunk",
            "content": f"\n\n📨 [{src_label} 으로부터 자동 디스패치]\n사용자 요청: {prompt[:300]}\n\n",
            "session_id": "default",
        })
    except Exception:
        pass

    logger.info("[dispatch] %s → %s (depth=%d): %s", source_team, target_team, depth, prompt[:80])
    full = ""
    try:
        async for event in run_claude(prompt, target_path, target_team):
            if isinstance(event, dict):
                content = event.get("content", "")
                if content:
                    full += content
                    try:
                        await manager.send_json(target_team, {
                            "type": "ai_chunk", "content": content, "session_id": "default",
                        })
                    except Exception:
                        pass
        # 완료 시 ai_end + 메시지 저장
        try:
            await manager.send_json(target_team, {
                "type": "ai_end", "content": full, "session_id": "default",
            })
        except Exception:
            pass
        try:
            manager.add_message(target_team, "ai", full, "default")
        except Exception:
            pass

        # 🔁 source 팀(리드) 채팅창에도 결과 echo — 리드가 협업 진행 가시화
        # 이미 _route_dispatch 가 다시 source 로 보내는 중첩 dispatch 면 자동 처리, 없으면 정보성 cross-channel 알림
        nested = _parse_dispatch_blocks(full)
        if not any(nd["team"] == source_team for nd in nested):
            # target 응답에 source 로 회신하는 dispatch 가 없으면, 진행 상황 echo
            try:
                target_label = f"{target_info.get('emoji','🤖')} {target_info.get('name', target_team)}"
                preview = full[:200].replace("\n", " ")
                await manager.send_json(source_team, {
                    "type": "ai_chunk",
                    "content": f"\n\n📬 [{target_label} 응답 도착]\n   {preview}{'...' if len(full) > 200 else ''}\n",
                    "session_id": "default",
                })
            except Exception:
                pass

        # target 팀 응답에도 dispatch 블록 있으면 재귀 (깊이+1)
        for nd in nested:
            asyncio.create_task(_route_dispatch(target_team, nd["team"], nd["prompt"], depth + 1))
    except Exception as e:
        logger.warning("[dispatch] %s → %s 실행 실패: %s", source_team, target_team, e)
        # 디스패치 자체 실패 → source 팀(리드) 채팅창에 ❌ 표시 (리드가 사용자에게 알림 가능)
        try:
            target_label = target_info.get('name', target_team) if target_info else target_team
            await manager.send_json(source_team, {
                "type": "ai_chunk",
                "content": f"\n\n❌ [협업 실패: → {target_label}] {str(e)[:200]}\n   리드는 이 사실을 사용자에게 알리고 우회안 제시 권장.\n",
                "session_id": "default",
            })
        except Exception:
            pass


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

            # CPO 채팅 인터셉트 제거 — 사용자가 CPO 호출 시 본인(Claude)이 직접 답변
            # 비서 역할은 staff 팀 채팅에서만 작동 (스태프 채팅 → 무료 LLM 즉답)
            # (이전 secretary 인터셉트는 "🤖 비서:" 프리픽스 혼란 유발 → 제거)

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
                    msg_txt = (
                        f"⚠️ 세션 타임아웃 — {_CLAUDE_IDLE_TIMEOUT // 60}분간 응답 없음.\n"
                        f"🛠 자동 진단 시작합니다..."
                    )
                    full_response = full_response + ("\n\n" if full_response else "") + msg_txt
                    await manager.send_json(
                        team_id,
                        {"type": "ai_chunk", "content": msg_txt, "session_id": current_sid},
                        session_id=current_sid,
                    )
                    # 자동 복구 트리거 — timeout 도 동일 흐름
                    try:
                        asyncio.create_task(_auto_recovery_dispatch(
                            team_id=team_id,
                            original_prompt=prompt,
                            error_summary=f"세션 타임아웃 ({_CLAUDE_IDLE_TIMEOUT // 60}분 idle)",
                            error_log_tail=None,
                        ))
                    except Exception as _e:
                        logger.warning("[auto-recovery] timeout hook 실패: %s", _e)
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
                    _err_msg = str(event.get('content', '알 수 없는 에러'))
                    try:
                        await manager.send_json(
                            team_id,
                            {"type": "ai_chunk", "content": f"\n❌ 오류: {_err_msg}", "session_id": current_sid},
                            session_id=current_sid,
                        )
                    except Exception:
                        pass
                    # 자동 에러 복구 — kind=error 케이스도 커버 (Exception, timeout, claude crash 등)
                    try:
                        asyncio.create_task(_auto_recovery_dispatch(
                            team_id=team_id,
                            original_prompt=prompt,
                            error_summary=f"run_claude 예외/오류: {_err_msg[:300]}",
                            error_log_tail=None,
                        ))
                    except Exception as _e:
                        logger.warning("[auto-recovery] error hook 실패: %s", _e)
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

            # 정상 완료 — 빈 응답 시 정확한 원인 진단 + 자동 session reset
            if not full_response.strip():
                try: sessions_store.end_job(team_id, current_sid, "failed", "빈 응답")
                except Exception: pass

                # 1) Claude session_id 깨짐 자동 감지 + 자동 reset (가장 흔한 케이스)
                #    "No conversation found with session ID: ..." 패턴은 stderr 에 찍힘
                #    → claude_runner 가 quit 했을 때 TEAM_SESSIONS 와 sessions_store 둘 다 정리
                session_corruption_detected = False
                try:
                    from claude_runner import TEAM_SESSIONS, _save_sessions
                    if team_id in TEAM_SESSIONS:
                        broken_sid = TEAM_SESSIONS.pop(team_id, None)
                        _save_sessions(TEAM_SESSIONS)
                        # sessions_store 의 claudeSessionId 도 reset (_meta.json 직접)
                        try:
                            _meta = sessions_store._load_meta(team_id)
                            for _s in _meta:
                                if _s.get("id") == current_sid:
                                    _s["claudeSessionId"] = None
                            sessions_store._save_meta(team_id, _meta)
                        except Exception:
                            pass
                        session_corruption_detected = True
                        logger.warning("[%s] 세션 깨짐 의심 — Claude session_id 자동 reset (broken=%s)", team_id, broken_sid)
                except Exception as _se:
                    logger.warning("[%s] session reset 실패: %s", team_id, _se)

                # 2) 사용자에게 명확한 원인 + 다음 액션 안내
                if session_corruption_detected:
                    full_response = (
                        "⚠️ Claude 세션 깨짐 — 자동 reset 완료.\n"
                        "🛠 CPO 에 자동 보고 + 다음 호출은 새 세션으로 시작됨.\n"
                        "[재시도] 누르면 즉시 복구됩니다."
                    )
                else:
                    full_response = (
                        "⚠️ 응답이 비어있습니다.\n"
                        "원인 가능: Claude 세션 초기화 / 시스템 프롬프트 문제 / 일시적 API 한도.\n"
                        "🛠 CPO 자동 진단 시작합니다..."
                    )
                await manager.send_json(
                    team_id,
                    {"type": "ai_chunk", "content": full_response, "session_id": current_sid},
                    session_id=current_sid,
                )

                # 3) 자동 복구 dispatch — CPO 에 진단/수정/재시도 위임
                logger.info("[%s] auto-recovery 트리거 — corruption=%s", team_id, session_corruption_detected)
                try:
                    asyncio.create_task(_auto_recovery_dispatch(
                        team_id=team_id,
                        original_prompt=prompt,
                        error_summary=(
                            f"Claude session 깨짐 (자동 reset 완료) — 다음 호출은 새 세션으로"
                            if session_corruption_detected
                            else "에이전트가 빈 응답 반환 — Claude 세션 또는 시스템 프롬프트 문제"
                        ),
                        error_log_tail=None,
                    ))
                except Exception as _e:
                    logger.warning("[auto-recovery] dispatch 실패: %s", _e)

            manager.add_message(team_id, "ai", full_response, current_sid)
            try: sessions_store.end_job(team_id, current_sid, "done")
            except Exception: pass
            _update_status(team_id, working=False, tool=None)
            _log_activity(team_id, f"✅ 완료 ({len(full_response)}자)")

            # Dispatch 블록 자동 라우팅 — 응답 본문에 ```dispatch [...] ``` 있으면 해당 팀에 재발사
            # CPO 자동 복구의 "재시도" 단계 + 일반 협업/오케스트레이션 동시 지원
            try:
                _dispatches = _parse_dispatch_blocks(full_response)
                for _d in _dispatches:
                    asyncio.create_task(_route_dispatch(team_id, _d["team"], _d["prompt"], depth=0))
                if _dispatches:
                    logger.info("[dispatch] %s 응답에서 %d개 라우팅 시작", team_id, len(_dispatches))
            except Exception as _de:
                logger.warning("[dispatch] 자동 라우팅 hook 실패: %s", _de)
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
