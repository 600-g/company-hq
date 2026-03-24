"""WebSocket 핸들러 — 채팅 메시지를 받아 Claude CLI 결과를 스트리밍 전송 + 대화 영구 저장"""

import json
from datetime import datetime
from pathlib import Path
from fastapi import WebSocket, WebSocketDisconnect
from claude_runner import run_claude

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

def _update_status(team_id: str, **kwargs):
    if team_id not in AGENT_STATUS:
        AGENT_STATUS[team_id] = {"working": False, "tool": None, "last_active": None, "last_prompt": ""}
    AGENT_STATUS[team_id].update(kwargs)

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


manager = ConnectionManager()


async def handle_chat(ws: WebSocket, team_id: str, project_path: str | None):
    """WebSocket 연결 하나를 처리한다. 각 팀은 독립적으로 병렬 실행된다."""
    await manager.connect(team_id, ws)

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

            # 대화 지우기 요청
            if msg.get("action") == "clear_history":
                manager.clear_history(team_id)
                await manager.send_json(team_id, {"type": "history_cleared"})
                continue

            # 작업 취소 요청
            if msg.get("action") == "cancel":
                from claude_runner import AGENT_PIDS
                import signal
                pid = AGENT_PIDS.get(team_id)
                if pid:
                    try:
                        import os
                        os.kill(pid, signal.SIGTERM)
                    except Exception:
                        pass
                    AGENT_PIDS.pop(team_id, None)
                _update_status(team_id, working=False, tool=None)
                await manager.send_json(team_id, {"type": "ai_chunk", "content": "\n⏹ 작업이 취소되었습니다."})
                await manager.send_json(team_id, {"type": "ai_end", "content": "⏹ 취소됨"})
                continue

            if not prompt:
                continue

            # 사용자 메시지
            await manager.send_json(team_id, {"type": "user", "content": prompt})
            manager.add_message(team_id, "user", prompt)

            # Claude 응답 스트리밍
            await manager.send_json(team_id, {"type": "ai_start"})
            await manager.send_json(team_id, {"type": "status", "content": "🧠 생각 중..."})
            _update_status(team_id, working=True, tool=None, last_active=datetime.now().strftime("%H:%M:%S"), last_prompt=prompt[:60])
            _log_activity(team_id, f"📨 {prompt[:50]}")

            full_response = ""
            async for event in run_claude(prompt, project_path, team_id):
                if event["kind"] == "status":
                    _update_status(team_id, tool=event["content"])
                    _log_activity(team_id, event["content"])
                    await manager.send_json(team_id, {"type": "status", "content": event["content"]})
                else:
                    full_response += event["content"]
                    await manager.send_json(team_id, {"type": "ai_chunk", "content": event["content"]})

            # 빈 응답이면 fallback
            if not full_response.strip():
                full_response = "✅ 작업을 처리했습니다."
                await manager.send_json(team_id, {"type": "ai_chunk", "content": full_response})

            manager.add_message(team_id, "ai", full_response)
            _update_status(team_id, working=False, tool=None)
            _log_activity(team_id, f"✅ 완료 ({len(full_response)}자)")
            await manager.send_json(team_id, {"type": "ai_end", "content": full_response})

    except WebSocketDisconnect:
        manager.disconnect(team_id, ws)
