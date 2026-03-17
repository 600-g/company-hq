"""Claude Code CLI 실행기 — 팀별 대화 이어가기"""

import asyncio
import os

# 팀별 첫 대화 여부
_team_has_history: set[str] = set()

# 팀별 모델
TEAM_MODELS: dict[str, str] = {
    "cpo-claude": "opus",
}


async def run_claude(prompt: str, project_path: str | None = None, team_id: str = ""):
    """Claude Code CLI 실행 + stdout 스트리밍"""
    cmd = ["claude", "--dangerously-skip-permissions"]

    # 이전 대화 이어가기
    if team_id in _team_has_history:
        cmd.append("--continue")

    # 자연어 대화 유도 시스템 프롬프트
    sys_prompt = "너는 (주)두근 컴퍼니의 팀원이다. 사용자(CEO 두근)와 자연어로 대화한다. 명령어나 코드 블록보다 대화체로 답하되, 필요할 때만 코드를 보여준다. 항상 한국어로 간결하게 응답한다."
    full_prompt = f"{sys_prompt}\n\n사용자: {prompt}"
    cmd.extend(["-p", full_prompt])

    # 모델
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
