"""Claude Code CLI 실행기 — subprocess로 CLI 호출 후 실시간 스트리밍"""

import asyncio
import os
import json


SYSTEM_PROMPT = """너는 (주)두근 컴퍼니의 AI 에이전트다.
사용자가 자연어로 명령하면 해당 프로젝트에서 실제 작업을 수행한다.
코드 수정, 버그 수정, 배포, 상태 확인 등 모든 터미널 작업이 가능하다.
항상 한국어로 응답하고, 결과를 간결하게 보고한다.
에러가 발생하면 원인과 해결방법을 함께 알려준다."""


async def run_claude(prompt: str, project_path: str | None = None, history: list | None = None):
    """Claude Code CLI를 실행하고 stdout을 한 줄씩 yield한다."""

    # 이전 대화 맥락이 있으면 프롬프트에 포함
    full_prompt = ""
    if history:
        full_prompt += "이전 대화:\n"
        for msg in history[-6:]:  # 최근 6개만
            role = "사용자" if msg.get("type") == "user" else "AI"
            content = msg.get("content", "")[:200]  # 너무 길면 자르기
            full_prompt += f"[{role}] {content}\n"
        full_prompt += "\n현재 명령:\n"

    full_prompt += prompt

    cmd = [
        "claude",
        "--dangerously-skip-permissions",
        "-p", full_prompt,
        "--model", "sonnet",
    ]

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
