"""Claude Code CLI 실행기 — 팀별 대화 이어가기 + 모델 지정"""

import asyncio
import os

# 팀별 첫 대화 여부 추적
_team_has_history: set[str] = set()

# 팀별 모델 설정 (기본 sonnet, CPO는 opus)
TEAM_MODELS: dict[str, str] = {
    "cpo-claude": "opus",
}


async def run_claude(prompt: str, project_path: str | None = None, team_id: str = ""):
    """Claude Code CLI를 실행하고 stdout을 한 줄씩 yield한다."""
    cmd = ["claude", "--dangerously-skip-permissions"]

    # 첫 대화가 아니면 --continue로 이어가기
    if team_id in _team_has_history:
        cmd.append("--continue")

    cmd.extend(["-p", prompt])

    # 팀별 모델 (CPO=opus, 나머지=sonnet)
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

    async for line in proc.stdout:
        text = line.decode("utf-8", errors="replace")
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
