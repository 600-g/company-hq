"""Task Queue — 역할 대기 큐 + 순차 파이프라인 + 입력 디바운스

v1.0 2026-03-29
"""

import asyncio
import time
import uuid
import json
import logging
from datetime import datetime
from dataclasses import dataclass, field
from typing import Any, Callable, Awaitable

logger = logging.getLogger("task_queue")

# ── 데이터 모델 ────────────────────────────────────────

@dataclass
class Task:
    id: str
    team_id: str
    prompt: str
    priority: int = 0          # 높을수록 먼저 (0=보통, 1=긴급)
    status: str = "pending"    # pending | running | done | error | cancelled
    result: str = ""
    error: str = ""
    created: float = field(default_factory=time.time)
    started: float = 0.0
    completed: float = 0.0
    dispatch_id: str = ""      # 파이프라인에 속한 경우
    step_index: int = 0        # 파이프라인 내 순서

    def to_dict(self) -> dict:
        return {
            "id": self.id, "team_id": self.team_id, "prompt": self.prompt[:200],
            "priority": self.priority, "status": self.status,
            "result": self.result[:500], "error": self.error,
            "created": self.created, "started": self.started,
            "completed": self.completed, "dispatch_id": self.dispatch_id,
            "step_index": self.step_index,
        }


@dataclass
class Pipeline:
    """순차 실행 파이프라인 — A팀 완료 → B팀 자동 트리거"""
    id: str
    name: str
    steps: list[dict]          # [{"team": "...", "prompt": "...", "depends_on_prev": True}]
    status: str = "pending"    # pending | running | done | error
    current_step: int = 0
    results: list[dict] = field(default_factory=list)
    created: float = field(default_factory=time.time)

    def to_dict(self) -> dict:
        return {
            "id": self.id, "name": self.name, "status": self.status,
            "current_step": self.current_step, "total_steps": len(self.steps),
            "results": self.results, "created": self.created,
        }


# ── Task Queue (팀별 대기 큐) ────────────────────────────

class TaskQueue:
    """팀별 작업 큐 — 한 팀에 동시 1개만 실행, 나머지는 대기"""

    def __init__(self):
        self.queues: dict[str, asyncio.Queue] = {}      # team_id -> Queue
        self.running: dict[str, Task | None] = {}        # team_id -> 현재 실행 중인 Task
        self.all_tasks: dict[str, Task] = {}             # task_id -> Task
        self.workers: dict[str, asyncio.Task] = {}       # team_id -> worker task
        self._run_claude: Callable | None = None         # run_claude 함수 참조
        self._get_team_path: Callable | None = None      # 팀 경로 조회 함수
        self._on_task_start: Callable | None = None      # 콜백: 작업 시작
        self._on_task_done: Callable | None = None       # 콜백: 작업 완료

    def init(self, run_claude_fn, get_team_path_fn,
             on_start=None, on_done=None):
        """의존성 주입 — main.py에서 서버 시작 시 호출"""
        self._run_claude = run_claude_fn
        self._get_team_path = get_team_path_fn
        self._on_task_start = on_start
        self._on_task_done = on_done

    def _ensure_queue(self, team_id: str):
        if team_id not in self.queues:
            self.queues[team_id] = asyncio.Queue()
            self.running[team_id] = None

    async def enqueue(self, team_id: str, prompt: str,
                      priority: int = 0, dispatch_id: str = "",
                      step_index: int = 0) -> Task:
        """작업을 팀 큐에 추가"""
        self._ensure_queue(team_id)
        task = Task(
            id=str(uuid.uuid4())[:8],
            team_id=team_id,
            prompt=prompt,
            priority=priority,
            dispatch_id=dispatch_id,
            step_index=step_index,
        )
        self.all_tasks[task.id] = task
        await self.queues[team_id].put(task)
        logger.info("[Queue] %s에 작업 추가: %s (큐 크기: %d)",
                    team_id, task.id, self.queues[team_id].qsize())

        # 워커가 없으면 시작
        if team_id not in self.workers or self.workers[team_id].done():
            self.workers[team_id] = asyncio.create_task(self._worker(team_id))

        return task

    async def _worker(self, team_id: str):
        """팀별 워커 — 큐에서 하나씩 꺼내 순차 실행"""
        queue = self.queues[team_id]
        while not queue.empty():
            task = await queue.get()
            if task.status == "cancelled":
                continue

            task.status = "running"
            task.started = time.time()
            self.running[team_id] = task
            logger.info("[Queue] %s 작업 시작: %s", team_id, task.id)

            if self._on_task_start:
                try:
                    await self._on_task_start(task)
                except Exception:
                    pass

            try:
                project_path = self._get_team_path(team_id) if self._get_team_path else None
                result_text = ""
                # 큐/파이프라인 실행은 자동 트리거 → is_auto=True (낮은 예산 상한)
                async for chunk in self._run_claude(task.prompt, project_path, team_id, is_auto=True):
                    if chunk["kind"] == "text":
                        result_text += chunk["content"]

                task.result = result_text
                task.status = "done"
                task.completed = time.time()
                logger.info("[Queue] %s 작업 완료: %s (%.1f초)",
                            team_id, task.id, task.completed - task.started)

            except Exception as e:
                task.status = "error"
                task.error = str(e)
                task.completed = time.time()
                logger.error("[Queue] %s 작업 실패: %s - %s", team_id, task.id, e)

            self.running[team_id] = None
            if self._on_task_done:
                try:
                    await self._on_task_done(task)
                except Exception:
                    pass

    def get_queue_status(self, team_id: str) -> dict:
        """팀 큐 상태 조회"""
        self._ensure_queue(team_id)
        running = self.running.get(team_id)
        return {
            "team_id": team_id,
            "queue_size": self.queues[team_id].qsize(),
            "running": running.to_dict() if running else None,
        }

    def get_all_status(self) -> list[dict]:
        """전체 큐 상태"""
        return [self.get_queue_status(tid) for tid in self.queues]

    def cancel_task(self, task_id: str) -> bool:
        """대기 중인 작업 취소"""
        task = self.all_tasks.get(task_id)
        if task and task.status == "pending":
            task.status = "cancelled"
            return True
        return False


# ── Pipeline Engine (순차 파이프라인) ──────────────────

class PipelineEngine:
    """A팀 → B팀 → C팀 순차 실행, 이전 결과를 다음 팀에 전달"""

    def __init__(self, task_queue: TaskQueue):
        self.queue = task_queue
        self.pipelines: dict[str, Pipeline] = {}
        self._on_pipeline_done: Callable | None = None

    async def create_and_run(self, name: str, steps: list[dict],
                              on_done: Callable | None = None) -> Pipeline:
        """파이프라인 생성 및 실행

        steps: [{"team": "backend-team", "prompt": "API 설계해줘"}]
        프롬프트에 {prev_result} 포함 시 이전 팀 결과로 치환
        """
        pipeline = Pipeline(
            id=str(uuid.uuid4())[:8],
            name=name,
            steps=steps,
        )
        self.pipelines[pipeline.id] = pipeline
        self._on_pipeline_done = on_done

        # 비동기 실행
        asyncio.create_task(self._run_pipeline(pipeline))
        return pipeline

    async def _run_pipeline(self, pipeline: Pipeline):
        """파이프라인 순차 실행"""
        pipeline.status = "running"
        prev_result = ""

        for i, step in enumerate(pipeline.steps):
            pipeline.current_step = i
            team_id = step["team"]
            prompt = step["prompt"]

            # {prev_result} 치환
            if prev_result and "{prev_result}" in prompt:
                prompt = prompt.replace("{prev_result}", prev_result)

            logger.info("[Pipeline:%s] Step %d/%d → %s",
                        pipeline.id, i + 1, len(pipeline.steps), team_id)

            # 큐에 넣고 완료 대기
            task = await self.queue.enqueue(
                team_id, prompt,
                dispatch_id=pipeline.id,
                step_index=i,
            )

            # 완료 대기 (폴링)
            while task.status in ("pending", "running"):
                await asyncio.sleep(0.5)

            step_result = {
                "step": i + 1,
                "team": team_id,
                "status": task.status,
                "result": task.result[:2000] if task.status == "done" else "",
                "error": task.error,
                "duration": round(task.completed - task.started, 1) if task.completed else 0,
            }
            pipeline.results.append(step_result)

            if task.status == "done":
                prev_result = task.result
            else:
                pipeline.status = "error"
                logger.error("[Pipeline:%s] Step %d 실패, 파이프라인 중단", pipeline.id, i + 1)
                break

        if pipeline.status == "running":
            pipeline.status = "done"
            logger.info("[Pipeline:%s] 완료 (%d steps)", pipeline.id, len(pipeline.steps))

        if self._on_pipeline_done:
            try:
                await self._on_pipeline_done(pipeline)
            except Exception:
                pass

    def get_status(self, pipeline_id: str) -> dict | None:
        p = self.pipelines.get(pipeline_id)
        return p.to_dict() if p else None


# ── Input Debouncer (입력 배칭) ──────────────────────

class InputDebouncer:
    """빠른 연속 입력을 합쳐서 1번에 처리

    5초 윈도우 내 같은 team_id로 들어온 메시지를 합침.
    → 토큰 절약 + 맥락 유지
    """

    def __init__(self, window_sec: float = 5.0):
        self.window = window_sec
        self._buffers: dict[str, list[str]] = {}     # team_id -> [prompt1, prompt2, ...]
        self._timers: dict[str, asyncio.Task] = {}   # team_id -> 대기 타이머
        self._callbacks: dict[str, Callable] = {}    # team_id -> 실행 콜백

    async def add(self, team_id: str, prompt: str,
                  callback: Callable[[str, str], Awaitable]) -> bool:
        """메시지 추가. 윈도우 내 첫 메시지면 타이머 시작, 이미 대기 중이면 합침.

        callback(team_id, merged_prompt) — 윈도우 종료 시 호출됨.
        Returns: True=버퍼에 추가됨(대기), False=즉시 실행(버퍼 없음)
        """
        if team_id not in self._buffers:
            # 첫 메시지 — 타이머 시작
            self._buffers[team_id] = [prompt]
            self._callbacks[team_id] = callback
            self._timers[team_id] = asyncio.create_task(self._flush_after(team_id))
            return False  # 첫 메시지는 타이머 대기
        else:
            # 추가 메시지 — 버퍼에 합침
            self._buffers[team_id].append(prompt)
            logger.info("[Debounce] %s에 메시지 합침 (총 %d개)", team_id, len(self._buffers[team_id]))
            return True  # 합쳐짐

    async def _flush_after(self, team_id: str):
        """윈도우 시간 후 버퍼 플러시"""
        await asyncio.sleep(self.window)
        await self._flush(team_id)

    async def _flush(self, team_id: str):
        """버퍼 내용 합쳐서 콜백 실행"""
        prompts = self._buffers.pop(team_id, [])
        callback = self._callbacks.pop(team_id, None)
        self._timers.pop(team_id, None)

        if not prompts or not callback:
            return

        if len(prompts) == 1:
            merged = prompts[0]
        else:
            merged = (
                f"[다음 {len(prompts)}개 요청을 한 번에 처리해줘]\n\n"
                + "\n\n---\n\n".join(f"요청 {i+1}: {p}" for i, p in enumerate(prompts))
            )
            logger.info("[Debounce] %s: %d개 메시지 병합", team_id, len(prompts))

        try:
            await callback(team_id, merged)
        except Exception as e:
            logger.error("[Debounce] 플러시 콜백 오류: %s", e)

    def flush_now(self, team_id: str):
        """윈도우 무시하고 즉시 실행"""
        timer = self._timers.get(team_id)
        if timer and not timer.done():
            timer.cancel()
        asyncio.create_task(self._flush(team_id))

    def pending_count(self, team_id: str) -> int:
        return len(self._buffers.get(team_id, []))

    def get_status(self) -> dict:
        return {
            tid: {"buffered": len(msgs), "waiting_sec": self.window}
            for tid, msgs in self._buffers.items()
        }


# ── 싱글턴 인스턴스 ──────────────────────────────────

task_queue = TaskQueue()
pipeline_engine = PipelineEngine(task_queue)
debouncer = InputDebouncer(window_sec=5.0)
