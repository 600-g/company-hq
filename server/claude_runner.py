"""Claude Code CLI 실행기 — 팀별 세션 유지 (--resume)"""

import asyncio
import os
import json

# 팀별 세션 ID 저장 파일
SESSION_FILE = os.path.expanduser("~/Developer/my-company/company-hq/server/.sessions.json")

# 팀별 모델
TEAM_MODELS: dict[str, str] = {
    "cpo-claude": "opus",
}


def load_sessions() -> dict[str, str]:
    try:
        with open(SESSION_FILE, "r") as f:
            return json.load(f)
    except:
        return {}


def save_sessions(sessions: dict[str, str]):
    try:
        with open(SESSION_FILE, "w") as f:
            json.dump(sessions, f)
    except:
        pass


async def run_claude(prompt: str, project_path: str | None = None, team_id: str = ""):
    """Claude Code CLI를 실행하고 stdout을 한 줄씩 yield한다.

    세션이 있으면 --resume으로 이전 대화 이어가기.
    없으면 새 세션 시작 후 ID 저장.
    """
    sessions = load_sessions()
    session_id = sessions.get(team_id)

    cmd = ["claude", "--dangerously-skip-permissions"]

    if session_id:
        cmd.extend(["--resume", session_id])

    cmd.extend(["-p", prompt])

    model = TEAM_MODELS.get(team_id, "sonnet")
    cmd.extend(["--model", model])

    # JSON 출력으로 세션 ID 추출
    cmd.extend(["--output-format", "stream-json"])

    env = os.environ.copy()
    cwd = os.path.expanduser(project_path) if project_path else None

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        cwd=cwd,
        env=env,
    )

    new_session_id = None
    async for line in proc.stdout:
        text = line.decode("utf-8", errors="replace").strip()
        if not text:
            continue

        # JSON 스트림 파싱
        try:
            data = json.loads(text)
            # 세션 ID 추출
            if data.get("type") == "system" and data.get("session_id"):
                new_session_id = data["session_id"]
            # 텍스트 응답 추출
            elif data.get("type") == "assistant" and data.get("message"):
                msg = data["message"]
                if isinstance(msg, dict):
                    for block in msg.get("content", []):
                        if isinstance(block, dict) and block.get("type") == "text":
                            yield block["text"]
                elif isinstance(msg, str):
                    yield msg
            elif data.get("type") == "result" and data.get("result"):
                yield data["result"]
        except json.JSONDecodeError:
            # JSON이 아니면 그냥 텍스트로
            yield text

    await proc.wait()

    # 세션 ID 저장
    if new_session_id:
        sessions[team_id] = new_session_id
        save_sessions(sessions)

    if proc.returncode != 0:
        stderr = await proc.stderr.read()
        err_msg = stderr.decode("utf-8", errors="replace").strip()
        if err_msg:
            yield f"\n⚠️ 오류: {err_msg}"
