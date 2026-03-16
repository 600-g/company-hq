"""WebSocket 핸들러 — 채팅 메시지를 받아 Claude CLI 결과를 스트리밍 전송"""

import json
from fastapi import WebSocket, WebSocketDisconnect
from claude_runner import run_claude


class ConnectionManager:
    """활성 WebSocket 연결 관리"""

    def __init__(self):
        self.active: dict[str, WebSocket] = {}  # team_id -> ws

    async def connect(self, team_id: str, ws: WebSocket):
        await ws.accept()
        self.active[team_id] = ws

    def disconnect(self, team_id: str):
        self.active.pop(team_id, None)

    async def send_json(self, team_id: str, data: dict):
        ws = self.active.get(team_id)
        if ws:
            await ws.send_json(data)


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

            # 사용자 메시지 에코
            await manager.send_json(team_id, {
                "type": "user",
                "content": prompt,
            })

            # Claude 응답 스트리밍
            await manager.send_json(team_id, {"type": "ai_start"})

            full_response = ""
            async for chunk in run_claude(prompt, project_path):
                full_response += chunk
                await manager.send_json(team_id, {
                    "type": "ai_chunk",
                    "content": chunk,
                })

            await manager.send_json(team_id, {
                "type": "ai_end",
                "content": full_response,
            })

    except WebSocketDisconnect:
        manager.disconnect(team_id)
