"""WebSocket 핸들러 — 채팅 메시지를 받아 Claude CLI 결과를 스트리밍 전송"""

import json
from datetime import datetime
from fastapi import WebSocket, WebSocketDisconnect
from claude_runner import run_claude

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
    """활성 WebSocket 연결 + 대화 기록 관리"""

    def __init__(self):
        self.active: dict[str, WebSocket] = {}
        self.history: dict[str, list] = {}  # team_id -> 대화 기록

    async def connect(self, team_id: str, ws: WebSocket):
        await ws.accept()
        self.active[team_id] = ws
        if team_id not in self.history:
            self.history[team_id] = []

    def disconnect(self, team_id: str):
        self.active.pop(team_id, None)

    async def send_json(self, team_id: str, data: dict):
        ws = self.active.get(team_id)
        if ws:
            await ws.send_json(data)

    def add_message(self, team_id: str, msg_type: str, content: str):
        if team_id not in self.history:
            self.history[team_id] = []
        self.history[team_id].append({"type": msg_type, "content": content})
        # 최근 20개만 유지
        if len(self.history[team_id]) > 20:
            self.history[team_id] = self.history[team_id][-20:]


manager = ConnectionManager()


async def handle_chat(ws: WebSocket, team_id: str, project_path: str | None):
    """WebSocket 연결 하나를 처리한다."""
    await manager.connect(team_id, ws)
    try:
        while True:
            raw = await ws.receive_text()
            msg = json.loads(raw)
            prompt = msg.get("prompt", "")

            if not prompt:
                continue

            # 사용자 메시지
            await manager.send_json(team_id, {"type": "user", "content": prompt})
            manager.add_message(team_id, "user", prompt)

            # Claude 응답 스트리밍
            await manager.send_json(team_id, {"type": "ai_start"})
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

            manager.add_message(team_id, "ai", full_response)
            _update_status(team_id, working=False, tool=None)
            await manager.send_json(team_id, {"type": "ai_end", "content": full_response})

    except WebSocketDisconnect:
        manager.disconnect(team_id)
