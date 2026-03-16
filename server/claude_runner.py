"""Claude Code CLI 실행기 — subprocess로 CLI 호출 후 실시간 스트리밍"""

import asyncio
import os


async def run_claude(prompt: str, project_path: str | None = None):
    """Claude Code CLI를 실행하고 stdout을 한 줄씩 yield한다."""
    cmd = ["claude", "--dangerously-skip-permissions", "-p", prompt]

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

    if proc.returncode != 0:
        stderr = await proc.stderr.read()
        err_msg = stderr.decode("utf-8", errors="replace").strip()
        if err_msg:
            yield f"\n⚠️ 오류: {err_msg}"
