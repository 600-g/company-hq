"""Claude Code CLI 실행기 — 속도 최적화"""

import asyncio
import os

_team_has_history: set[str] = set()

TEAM_MODELS: dict[str, str] = {
    "cpo-claude": "opus",
}


async def run_claude(prompt: str, project_path: str | None = None, team_id: str = ""):
    """Claude Code CLI 실행 — 최소 오버헤드"""
    cmd = ["claude", "--dangerously-skip-permissions"]

    if team_id in _team_has_history:
        cmd.append("--continue")

    cmd.extend(["-p", prompt, "--no-markdown"])

    model = TEAM_MODELS.get(team_id, "sonnet")
    cmd.extend(["--model", model])

    env = os.environ.copy()
    cwd = os.path.expanduser(project_path) if project_path else None

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        cwd=cwd,
        env=env,
    )

    # 바이트 단위로 즉시 읽기 (라인 대기 안 함)
    while True:
        chunk = await proc.stdout.read(256)
        if not chunk:
            break
        text = chunk.decode("utf-8", errors="replace")
        if text.strip():
            yield text

    await proc.wait()

    if proc.returncode == 0:
        _team_has_history.add(team_id)
    else:
        stderr = await proc.stderr.read()
        err_msg = stderr.decode("utf-8", errors="replace").strip()
        if err_msg:
            yield f"\n⚠️ 오류: {err_msg}"
