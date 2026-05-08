"""
디스패치 (다중 에이전트 협업) — main.py 분할 12차 (안정화 2026-05-08).

이동:
- DISPATCH_TASKS / PENDING_APPROVALS / APPROVAL_DECISIONS / APPROVAL_FEEDBACK
- DISCUSS_TASKS
- POST /api/dispatch/approve
- POST /api/dispatch
- GET  /api/dispatch/{dispatch_id}
- GET  /api/dispatch
- POST /api/dispatch/smart
- POST /api/dispatch/discuss
- GET  /api/dispatch/discuss/{discuss_id}

Lazy import:
- main.TEAMS / _load_evolution / _save_evolution
- claude_runner.run_claude / run_claude_light
- ws_handler.manager / _log_activity / collab_broadcast
- task_queue.task_queue
- free_llm.smart_call / _bump
"""
from __future__ import annotations

import asyncio
import json
import logging
import uuid
from datetime import datetime

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

logger = logging.getLogger(__name__)
router = APIRouter(tags=["dispatch"])

# ── 디스패치 작업 저장소 ──────────────────────────────────────
DISPATCH_TASKS: dict[str, dict] = {}
PENDING_APPROVALS: dict[str, asyncio.Event] = {}
APPROVAL_DECISIONS: dict[str, str] = {}
APPROVAL_FEEDBACK: dict[str, str] = {}
DISCUSS_TASKS: dict[str, dict] = {}


@router.post("/api/dispatch/approve")
async def dispatch_approve(body: dict):
    """인라인 핸드오프 승인 게이트 응답. TM 피드백+재작업 패턴 지원."""
    dispatch_id = body.get("dispatch_id", "")
    decision = body.get("decision", "")
    feedback = (body.get("feedback") or "").strip()
    if decision not in ("approve", "cancel"):
        return {"ok": False, "error": "decision은 approve|cancel"}
    ev = PENDING_APPROVALS.get(dispatch_id)
    if not ev:
        return {"ok": False, "error": "대기중인 승인 없음"}
    APPROVAL_DECISIONS[dispatch_id] = decision
    if feedback:
        APPROVAL_FEEDBACK[dispatch_id] = feedback
    ev.set()
    return {"ok": True, "feedback_applied": bool(feedback)}


@router.post("/api/dispatch")
async def dispatch_task(body: dict):
    """CPO가 여러 팀에 작업을 분배하고 결과를 수집."""
    import main as _main
    from claude_runner import run_claude, run_claude_light
    from ws_handler import _log_activity, collab_broadcast

    instruction = body.get("instruction", "")
    steps = body.get("steps", [])
    if not instruction:
        return {"ok": False, "error": "instruction이 필요합니다"}

    dispatch_id = str(uuid.uuid4())[:8]
    DISPATCH_TASKS[dispatch_id] = {
        "instruction": instruction,
        "status": "running",
        "steps": [],
        "started": datetime.now().isoformat(),
    }
    _log_activity("cpo-claude", f"📋 디스패치 시작: {instruction[:50]}")

    if not steps:
        plan_prompt = (
            f"다음 작업을 수행하려고 해:\n\n{instruction}\n\n"
            f"현재 팀 목록:\n"
            + "\n".join(f"- {t['emoji']} {t['name']} ({t['id']}): {t['repo']}" for t in _main.TEAMS if t['id'] not in ('cpo-claude',))
            + "\n\n"
            "이 작업을 어떤 팀에 어떤 순서로 시킬지 JSON으로 답해줘. 형식:\n"
            '[{"team": "team-id", "prompt": "팀에게 줄 구체적 지시"}]\n'
            "JSON만 답해. 설명 없이."
        )
        cpo_path = next((t["localPath"] for t in _main.TEAMS if t["id"] == "cpo-claude"), None)
        plan_result = await run_claude_light(plan_prompt, cpo_path)

        import re
        json_match = re.search(r'\[.*\]', plan_result, re.DOTALL)
        if json_match:
            try:
                steps = json.loads(json_match.group())
            except json.JSONDecodeError:
                DISPATCH_TASKS[dispatch_id]["status"] = "failed"
                DISPATCH_TASKS[dispatch_id]["error"] = "CPO 분배 계획 파싱 실패"
                return {"ok": False, "dispatch_id": dispatch_id, "error": "CPO 분배 계획 파싱 실패", "raw": plan_result}
        else:
            DISPATCH_TASKS[dispatch_id]["status"] = "failed"
            return {"ok": False, "dispatch_id": dispatch_id, "error": "CPO가 분배 계획을 생성하지 못함", "raw": plan_result}

    prev_result = ""
    all_results = []

    valid_step_teams = [
        s.get("team", "") for s in steps
        if any(t["id"] == s.get("team") for t in _main.TEAMS)
    ]

    if len(valid_step_teams) >= 2:
        await collab_broadcast(dispatch_id, "collab_start", valid_step_teams, action=instruction[:60])

    for i, step in enumerate(steps):
        team_id = step.get("team", "")
        prompt = step.get("prompt", "")

        team = next((t for t in _main.TEAMS if t["id"] == team_id), None)
        if not team:
            step_result = {"step": i + 1, "team": team_id, "status": "skipped", "error": f"팀 '{team_id}'을 찾을 수 없음"}
            all_results.append(step_result)
            continue

        actual_prompt = prompt.replace("{prev_result}", prev_result)

        if len(valid_step_teams) >= 2:
            await collab_broadcast(dispatch_id, "collab_step", [team_id], action=f"step {i+1}: {actual_prompt[:40]}")

        _log_activity(team_id, f"📨 디스패치 작업 수신: {actual_prompt[:50]}")
        result_text = ""
        project_path = team["localPath"]

        try:
            async for chunk in run_claude(actual_prompt, project_path, team_id, is_auto=True):
                if chunk["kind"] == "text":
                    result_text += chunk["content"]
        except Exception as e:
            step_result = {"step": i + 1, "team": team_id, "status": "error", "error": str(e)}
            all_results.append(step_result)
            continue

        prev_result = result_text
        step_result = {
            "step": i + 1,
            "team": team_id,
            "team_name": team["name"],
            "prompt": actual_prompt[:200],
            "result": result_text[:2000],
            "status": "done",
        }
        all_results.append(step_result)
        DISPATCH_TASKS[dispatch_id]["steps"] = all_results
        logger.info(f"[DISPATCH] Step {i+1}/{len(steps)} 완료: {team_id}")

    if len(valid_step_teams) >= 2:
        await collab_broadcast(dispatch_id, "collab_end", valid_step_teams)

    DISPATCH_TASKS[dispatch_id]["status"] = "done"
    DISPATCH_TASKS[dispatch_id]["completed"] = datetime.now().isoformat()
    _log_activity("cpo-claude", f"✅ 디스패치 완료: {instruction[:50]}")

    return {
        "ok": True,
        "dispatch_id": dispatch_id,
        "instruction": instruction,
        "steps": all_results,
    }


@router.get("/api/dispatch/{dispatch_id}")
async def get_dispatch(dispatch_id: str):
    """디스패치 작업 상태 조회"""
    task = DISPATCH_TASKS.get(dispatch_id)
    if not task:
        return {"ok": False, "error": "디스패치를 찾을 수 없습니다"}
    return {"ok": True, **task}


@router.get("/api/dispatch")
async def list_dispatches():
    """모든 디스패치 작업 목록"""
    return [{"id": k, **v} for k, v in DISPATCH_TASKS.items()]


@router.post("/api/dispatch/smart")
async def smart_dispatch(body: dict):
    """CPO 주도 디스패치: 필터링 → 관련 팀만 실행 → CPO 통합 보고. SSE stream."""
    import main as _main
    from claude_runner import run_claude, run_claude_light
    from ws_handler import _log_activity, manager as ws_manager

    message = body.get("message", "")
    if not message:
        return {"ok": False, "error": "message가 필요합니다"}

    dispatch_id = str(uuid.uuid4())[:8]
    DISPATCH_TASKS[dispatch_id] = {
        "instruction": message,
        "status": "running",
        "phase": "routing",
        "steps": [],
        "started": datetime.now().isoformat(),
    }

    async def stream():
        import re as _re

        ws_manager.add_message("cpo-claude", "user", message)
        try:
            await ws_manager.send_json("cpo-claude", {"type": "user", "content": message})
            await ws_manager.send_json("cpo-claude", {"type": "ai_start"})
        except Exception:
            pass
        _cpo_log: list[str] = []
        _cpo_closed = {"v": False}

        async def _cpo_emit(text: str):
            _cpo_log.append(text)
            try:
                await ws_manager.send_json("cpo-claude", {"type": "ai_chunk", "content": text})
            except Exception:
                pass

        async def _cpo_close(extra_text: str = ""):
            if _cpo_closed["v"]:
                return
            _cpo_closed["v"] = True
            final = "".join(_cpo_log) + (extra_text if extra_text and extra_text not in "".join(_cpo_log) else "")
            ws_manager.add_message("cpo-claude", "ai", final or "(완료)")
            try:
                await ws_manager.send_json("cpo-claude", {"type": "ai_end", "content": final})
            except Exception:
                pass

        available_teams = [t for t in _main.TEAMS if t["id"] not in ("cpo-claude",)]
        team_map = {t["id"]: t for t in available_teams}
        name_to_id = {}
        for t in available_teams:
            name_to_id[t["id"]] = t["id"]
            name_to_id[t["name"]] = t["id"]
            name_to_id[f'{t["emoji"]}{t["name"]}'] = t["id"]
        for t in _main.TEAMS:
            if t["id"] == "cpo-claude":
                name_to_id["cpo"] = "cpo-claude"
                name_to_id["CPO"] = "cpo-claude"
                name_to_id["cpo-claude"] = "cpo-claude"

        mention_pattern = r'@(\S+)'
        mentions = _re.findall(mention_pattern, message)
        mentioned_ids = []
        for m in mentions:
            tid = name_to_id.get(m)
            if tid and tid not in mentioned_ids:
                mentioned_ids.append(tid)

        clean_message = _re.sub(mention_pattern, '', message).strip() or message

        if mentioned_ids:
            if mentioned_ids == ["cpo-claude"]:
                yield f"data: {json.dumps({'phase': 'summarizing', 'message': '🧠 CPO 직접 응답 중...'})}\n\n"
                cpo_team = next((t for t in _main.TEAMS if t["id"] == "cpo-claude"), None)
                if not cpo_team:
                    yield f"data: {json.dumps({'phase': 'error', 'error': 'CPO 팀 없음'})}\n\n"
                    return
                direct_text = ""
                async for chunk in run_claude(clean_message, cpo_team["localPath"], "cpo-claude", is_auto=False):
                    if chunk["kind"] == "text":
                        direct_text += chunk["content"]
                        yield f"data: {json.dumps({'phase': 'summary_chunk', 'content': chunk['content']})}\n\n"
                DISPATCH_TASKS[dispatch_id]["status"] = "done"
                DISPATCH_TASKS[dispatch_id]["summary"] = direct_text
                yield f"data: {json.dumps({'phase': 'done', 'dispatch_id': dispatch_id, 'summary': direct_text, 'team_results': {}})}\n\n"
                _log_activity("cpo-claude", f"✅ @CPO 멘션 응답: {clean_message[:50]}")
                await _cpo_close(direct_text)
                return

            routed_steps = []
            for tid in mentioned_ids:
                if tid in team_map:
                    routed_steps.append({"team": tid, "prompt": clean_message})
            if routed_steps:
                routed_team_ids = [s["team"] for s in routed_steps]
                yield f"data: {json.dumps({'phase': 'direct_dispatch', 'direct': True, 'teams': routed_team_ids, 'message': f'→ {len(routed_steps)}팀에 직접 전달'})}\n\n"

                team_results: dict[str, dict] = {}

                async def run_mentioned_team(step: dict):
                    _tid = step["team"]
                    _team = team_map[_tid]
                    _prompt = f"[유저 원래 요청: {message}]\n\n{step['prompt']}"
                    ws_manager.add_message(_tid, "user", _prompt)
                    try:
                        await ws_manager.send_json(_tid, {"type": "user", "content": _prompt})
                        await ws_manager.send_json(_tid, {"type": "ai_start"})
                    except Exception:
                        pass
                    _result = ""
                    try:
                        async for chunk in run_claude(_prompt, _team["localPath"], _tid, is_auto=False):
                            if chunk["kind"] == "text":
                                _result += chunk["content"]
                                try:
                                    await ws_manager.send_json(_tid, {"type": "ai_chunk", "content": chunk["content"]})
                                except Exception:
                                    pass
                        ws_manager.add_message(_tid, "assistant", _result)
                        try:
                            await ws_manager.send_json(_tid, {"type": "ai_end", "content": _result})
                        except Exception:
                            pass
                        team_results[_tid] = {"status": "done", "team_name": _team["name"], "emoji": _team["emoji"], "result": _result}
                    except Exception as e:
                        team_results[_tid] = {"status": "error", "error": str(e)}

                    agent_mentions = _re.findall(r'@(\S+)', _result)
                    for am in agent_mentions:
                        next_tid = name_to_id.get(am)
                        if next_tid and next_tid != _tid and next_tid in team_map:
                            _log_activity(_tid, f"🔗 @{am} 태그 → {next_tid}에 후속 작업 전달")
                            from task_queue import task_queue
                            await task_queue.enqueue(next_tid, f"[{_team['name']}이(가) 요청] {_result[:500]}")

                await asyncio.gather(*[run_mentioned_team(s) for s in routed_steps])

                done_teams = list(team_results.keys())
                yield f"data: {json.dumps({'phase': 'team_done', 'done': len(done_teams), 'total': len(routed_steps), 'teams': done_teams})}\n\n"

                all_results_text = ""
                for tid, result in team_results.items():
                    txt = result.get("result", "")
                    all_results_text += txt + "\n"
                    yield f"data: {json.dumps({'phase': 'summary_chunk', 'content': txt})}\n\n"

                DISPATCH_TASKS[dispatch_id]["status"] = "done"
                meta = {"routed_count": len(routed_steps), "total_teams": len(available_teams), "mention": True, "direct": True}
                yield f"data: {json.dumps({'phase': 'done', 'dispatch_id': dispatch_id, 'direct': True, 'summary': all_results_text.strip(), 'team_results': team_results, 'meta': meta})}\n\n"
                return

        dev_teams = [t for t in available_teams if t.get("category") == "dev"]
        product_teams = [t for t in available_teams if t.get("category") == "product"]
        team_list_str = "【개발/서포트팀】 company-hq 개발·디자인·콘텐츠 담당\n"
        team_list_str += "\n".join(f'- {t["id"]}: {t["emoji"]} {t["name"]}' for t in dev_teams)
        team_list_str += "\n\n【독자 프로젝트팀】 각자 독립 프로젝트 PM\n"
        team_list_str += "\n".join(f'- {t["id"]}: {t["emoji"]} {t["name"]}' for t in product_teams)

        route_prompt = (
            f"유저 메시지:\n\"{message}\"\n\n"
            f"팀 목록:\n{team_list_str}\n\n"
            "이 메시지를 처리하기 위해 어떤 팀이 필요한지 판단해.\n\n"
            "규칙:\n"
            "1. company-hq UI/서버/디자인 관련 → 개발/서포트팀에서 선택\n"
            "2. 특정 프로젝트(매매봇/데이트지도 등) → 해당 독자 프로젝트팀만\n"
            "3. 개발팀과 프로젝트팀을 동시에 선택하지 마 (성격이 다름)\n"
            "4. 관련 팀이 없으면 (일반 질문, 인사) → 빈 배열 []로 답해\n"
            "5. 관련 없는 팀은 절대 포함하지 마\n\n"
            "【의존성 판단】\n"
            "- 프론트+백엔드+QA 같이 협업(동일 기능 크로스컷팅) → deps 없음 (병렬)\n"
            "- 디자인 → 프론트 (에셋 받아서 구현) → 프론트 step에 deps=[\"design-team\"]\n"
            "- 백엔드 API → 프론트 연동 → 프론트 step에 deps=[\"backend-team\"]\n"
            "- 독립된 여러 작업 (X 수정 + Y 수정) → deps 없음 (병렬)\n\n"
            "형식 (JSON만, 설명 없이):\n"
            '[{"team": "team-id", "prompt": "구체 지시", "deps": ["prev-team-id"]}]\n'
            "deps 생략 가능 (없으면 [] 또는 필드 생략 = 병렬 실행).\n"
            "deps 있으면 이전 팀 결과가 {prev_result}로 prompt에 주입됨.\n"
            "예 1 (크로스컷팅 병렬):\n"
            '  [{"team":"frontend-team","prompt":"..."},{"team":"backend-team","prompt":"..."}]\n'
            "예 2 (순차 전달):\n"
            '  [{"team":"design-team","prompt":"로고 시안 3개"},{"team":"frontend-team","prompt":"아래 시안 중 하나로 구현: {prev_result}","deps":["design-team"]}]\n'
            "관련 팀 없으면: []"
        )

        cpo_team = next((t for t in _main.TEAMS if t["id"] == "cpo-claude"), None)
        if not cpo_team:
            yield f"data: {json.dumps({'phase': 'error', 'error': 'CPO 팀 없음'})}\n\n"
            return

        yield f"data: {json.dumps({'phase': 'routing', 'message': '🧠 CPO가 관련 팀 분석 중...'})}\n\n"

        route_result = await run_claude_light(route_prompt, cpo_team["localPath"])

        json_match = _re.search(r'\[.*\]', route_result, _re.DOTALL)
        if not json_match:
            yield f"data: {json.dumps({'phase': 'summary_chunk', 'content': route_result})}\n\n"
            yield f"data: {json.dumps({'phase': 'done', 'dispatch_id': dispatch_id, 'summary': route_result, 'team_results': {}})}\n\n"
            DISPATCH_TASKS[dispatch_id]["status"] = "done"
            DISPATCH_TASKS[dispatch_id]["summary"] = route_result
            await _cpo_close(route_result)
            return

        try:
            routed_steps = json.loads(json_match.group())
        except json.JSONDecodeError:
            yield f"data: {json.dumps({'phase': 'error', 'error': 'JSON 파싱 실패'})}\n\n"
            await _cpo_close("⚠️ 라우팅 JSON 파싱 실패")
            return

        if not routed_steps:
            yield f"data: {json.dumps({'phase': 'summarizing', 'message': '🧠 CPO가 직접 답변 중...'})}\n\n"
            direct_prompt = (
                f"유저 메시지: \"{message}\"\n\n"
                "이 메시지는 특정 팀에 전달할 필요 없이 CPO가 직접 답할 수 있다.\n"
                "유저에게 도움되는 답변을 해줘. 짧고 명확하게."
            )
            direct_text = ""
            async for chunk in run_claude(direct_prompt, cpo_team["localPath"], "cpo-claude", is_auto=False):
                if chunk["kind"] == "text":
                    direct_text += chunk["content"]
                    yield f"data: {json.dumps({'phase': 'summary_chunk', 'content': chunk['content']})}\n\n"

            DISPATCH_TASKS[dispatch_id]["status"] = "done"
            DISPATCH_TASKS[dispatch_id]["summary"] = direct_text
            yield f"data: {json.dumps({'phase': 'done', 'dispatch_id': dispatch_id, 'summary': direct_text, 'team_results': {}})}\n\n"
            _log_activity("cpo-claude", f"✅ CPO 직접 응답: {message[:50]}")
            await _cpo_close(direct_text)
            return

        routed_team_ids = [s["team"] for s in routed_steps]
        skipped_teams = [t for t in available_teams if t["id"] not in routed_team_ids]

        yield f"data: {json.dumps({'phase': 'routed', 'teams': routed_team_ids, 'skipped': [t['id'] for t in skipped_teams]})}\n\n"

        if len(routed_steps) >= 2:
            preview_steps = [
                {
                    "team": s["team"],
                    "team_name": team_map.get(s["team"], {}).get("name", s["team"]),
                    "emoji": team_map.get(s["team"], {}).get("emoji", "🤖"),
                    "prompt": (s.get("prompt") or "")[:200],
                }
                for s in routed_steps
            ]
            ev = asyncio.Event()
            PENDING_APPROVALS[dispatch_id] = ev
            APPROVAL_DECISIONS.pop(dispatch_id, None)
            yield f"data: {json.dumps({'phase': 'handoff_request', 'dispatch_id': dispatch_id, 'steps': preview_steps})}\n\n"
            try:
                await ws_manager.send_json("cpo-claude", {
                    "type": "handoff_request", "dispatch_id": dispatch_id, "steps": preview_steps,
                })
            except Exception:
                pass
            try:
                await asyncio.wait_for(ev.wait(), timeout=180)
            except asyncio.TimeoutError:
                yield f"data: {json.dumps({'phase': 'handoff_cancelled', 'reason': 'timeout'})}\n\n"
                PENDING_APPROVALS.pop(dispatch_id, None)
                DISPATCH_TASKS[dispatch_id]["status"] = "cancelled"
                await _cpo_close("⏱️ 핸드오프 승인 시간 초과 — 취소됨")
                return
            decision = APPROVAL_DECISIONS.pop(dispatch_id, "cancel")
            fb = APPROVAL_FEEDBACK.pop(dispatch_id, "")
            PENDING_APPROVALS.pop(dispatch_id, None)
            if decision != "approve":
                yield f"data: {json.dumps({'phase': 'handoff_cancelled', 'reason': 'user_cancel'})}\n\n"
                DISPATCH_TASKS[dispatch_id]["status"] = "cancelled"
                await _cpo_close("❌ 사용자가 핸드오프를 취소했습니다")
                return
            if fb:
                for s in routed_steps:
                    s["prompt"] = f"[유저 피드백] {fb}\n\n{s.get('prompt','')}"
                yield f"data: {json.dumps({'phase': 'handoff_approved', 'feedback': fb})}\n\n"
            else:
                yield f"data: {json.dumps({'phase': 'handoff_approved'})}\n\n"

        yield f"data: {json.dumps({'phase': 'executing', 'message': f'⚡ {len(routed_steps)}개 팀 작업 중...'})}\n\n"

        team_results: dict[str, dict] = {}

        async def run_team(step: dict):
            team_id = step["team"]
            prompt = f"[유저 원래 요청: {message}]\n\n{step['prompt']}"
            team = next((t for t in _main.TEAMS if t["id"] == team_id), None)
            if not team:
                team_results[team_id] = {"status": "skipped", "error": "팀 없음"}
                return

            result_text = ""
            ws_manager.add_message(team_id, "user", prompt)
            try:
                await ws_manager.send_json(team_id, {"type": "user", "content": prompt})
                await ws_manager.send_json(team_id, {"type": "ai_start"})
            except Exception:
                pass
            try:
                async for chunk in run_claude(prompt, team["localPath"], team_id, is_auto=False):
                    if chunk["kind"] == "text":
                        result_text += chunk["content"]
                        try:
                            await ws_manager.send_json(team_id, {"type": "ai_chunk", "content": chunk["content"]})
                        except Exception:
                            pass
                ws_manager.add_message(team_id, "assistant", result_text)
                try:
                    await ws_manager.send_json(team_id, {"type": "ai_end", "content": result_text})
                except Exception:
                    pass
                team_results[team_id] = {
                    "status": "done",
                    "team_name": team["name"],
                    "emoji": team["emoji"],
                    "result": result_text,
                }
            except Exception as e:
                team_results[team_id] = {"status": "error", "error": str(e)}

        remaining = list(routed_steps)
        executed: set[str] = set()
        while remaining:
            runnable = [s for s in remaining if all(d in executed for d in (s.get("deps") or []))]
            if not runnable:
                for s in remaining:
                    tid = s["team"]
                    team_results[tid] = {"status": "error", "error": f"의존성 해결 불가: deps={s.get('deps')}"}
                break
            def _inject_prev(step: dict) -> dict:
                prev_key = "{prev_result}"
                p = step.get("prompt", "")
                if prev_key in p and step.get("deps"):
                    prev_texts = []
                    for d in step["deps"]:
                        r = team_results.get(d, {})
                        if r.get("status") == "done":
                            prev_texts.append(f"[{d} 결과]\n{r.get('result', '')}")
                    p = p.replace(prev_key, "\n\n".join(prev_texts) if prev_texts else "(이전 결과 없음)")
                return {**step, "prompt": p}
            batch = [_inject_prev(s) for s in runnable]
            yield f"data: {json.dumps({'phase': 'batch_start', 'teams': [s['team'] for s in batch], 'parallel': len(batch) > 1})}\n\n"
            await asyncio.gather(*[run_team(step) for step in batch])
            for s in runnable:
                executed.add(s["team"])
                remaining.remove(s)

        done_teams = list(team_results.keys())
        yield f"data: {json.dumps({'phase': 'team_done', 'done': len(done_teams), 'total': len(routed_steps), 'teams': done_teams})}\n\n"

        if len(team_results) == 1:
            tid, result = next(iter(team_results.items()))
            summary_text = result.get("result", "")
            yield f"data: {json.dumps({'phase': 'summary_chunk', 'content': summary_text})}\n\n"
            _log_activity("cpo-claude", f"✅ 단일 팀 결과 직통: {tid}")
        else:
            yield f"data: {json.dumps({'phase': 'summarizing', 'message': '🧠 CPO가 통합 보고서 작성 중...'})}\n\n"

            summary_parts = []
            for tid, result in team_results.items():
                if result["status"] == "done":
                    full = result["result"]
                    condensed = full[-500:] if len(full) > 500 else full
                    summary_parts.append(
                        f"=== {result['emoji']} {result['team_name']} ({tid}) ===\n"
                        f"{condensed}"
                    )
                else:
                    summary_parts.append(f"=== {tid} === ❌ 실패: {result.get('error', '알 수 없음')}")

            summary_prompt = (
                f"유저의 원래 요청:\n\"{message}\"\n\n"
                f"각 팀의 답변 요약:\n\n{''.join(s + chr(10) + chr(10) for s in summary_parts)}\n"
                "위 답변들을 종합해서 유저에게 통합 보고해줘.\n"
                "형식:\n"
                "1. 전체 요약 (2-3줄)\n"
                "2. 팀별 할 일 정리 (팀이름: 할 일)\n"
                "3. 우선순위 또는 의존성 있으면 언급\n"
                "짧고 명확하게."
            )

            summary_text = ""
            async for chunk in run_claude(summary_prompt, cpo_team["localPath"], "cpo-claude", is_auto=False):
                if chunk["kind"] == "text":
                    summary_text += chunk["content"]
                    yield f"data: {json.dumps({'phase': 'summary_chunk', 'content': chunk['content']})}\n\n"
                    await _cpo_emit(chunk["content"])

        ws_manager.add_message("cpo-claude", "ai", summary_text)
        try:
            await ws_manager.send_json("cpo-claude", {"type": "ai_end", "content": summary_text})
        except Exception:
            pass

        DISPATCH_TASKS[dispatch_id]["status"] = "done"
        DISPATCH_TASKS[dispatch_id]["completed"] = datetime.now().isoformat()
        DISPATCH_TASKS[dispatch_id]["steps"] = [
            {"team": tid, **r} for tid, r in team_results.items()
        ]
        DISPATCH_TASKS[dispatch_id]["summary"] = summary_text

        meta = {
            "routed_count": len(routed_steps),
            "skipped_count": len(skipped_teams),
            "total_teams": len(available_teams),
            "routing_model": "haiku",
            "summary_model": "opus" if len(team_results) > 1 else "direct",
        }
        yield f"data: {json.dumps({'phase': 'done', 'dispatch_id': dispatch_id, 'summary': summary_text, 'meta': meta, 'team_results': {tid: {'status': r['status'], 'result': r.get('result', '')[:2000]} for tid, r in team_results.items()}})}\n\n"

        _log_activity("cpo-claude", f"✅ 스마트 디스패치 완료: {message[:50]}")

    return StreamingResponse(stream(), media_type="text/event-stream")


@router.post("/api/dispatch/discuss")
async def dispatch_discuss(body: dict):
    """CPO 주도 토론: 개발진 의견 수렴 → 토론 → QA 검증 → CPO 최종 결정"""
    import main as _main
    from claude_runner import run_claude, run_claude_light
    from ws_handler import _log_activity
    import re as _re

    instruction = body.get("instruction", "")
    forced_teams = body.get("teams", [])
    if not instruction:
        return {"ok": False, "error": "instruction이 필요합니다"}

    discuss_id = str(uuid.uuid4())[:8]
    DISCUSS_TASKS[discuss_id] = {
        "instruction": instruction,
        "status": "running",
        "phases": [],
        "started": datetime.now().isoformat(),
    }

    async def stream():
        cpo_team = next((t for t in _main.TEAMS if t["id"] == "cpo-claude"), None)
        if not cpo_team:
            yield f"data: {json.dumps({'phase': 'error', 'error': 'CPO 없음'})}\n\n"
            return

        dev_teams = [t for t in _main.TEAMS if t.get("category") == "dev" and t.get("status") == "운영중"]

        yield f"data: {json.dumps({'phase': 'analyzing', 'message': '🧠 CPO가 작업을 분석하고 참여 팀을 선정 중...'})}\n\n"

        if forced_teams:
            selected_ids = forced_teams
        else:
            route_prompt = (
                f"작업: {instruction}\n\n"
                f"개발진 목록:\n" + "\n".join(f"- {t['id']}: {t['emoji']} {t['name']}" for t in dev_teams) + "\n\n"
                "이 작업에 참여해야 할 팀 ID만 JSON 배열로 답해. 설명 없이.\n"
                '예: ["frontend-team", "backend-team"]'
            )
            route_result = await run_claude_light(route_prompt, cpo_team["localPath"])
            json_match = _re.search(r'\[.*?\]', route_result, _re.DOTALL)
            selected_ids = json.loads(json_match.group()) if json_match else [t["id"] for t in dev_teams]

        if "qa-agent" not in selected_ids:
            selected_ids.append("qa-agent")

        selected_teams = [t for t in _main.TEAMS if t["id"] in selected_ids]
        yield f"data: {json.dumps({'phase': 'team_selected', 'teams': [{'id': t['id'], 'name': t['name'], 'emoji': t['emoji']} for t in selected_teams]})}\n\n"

        yield f"data: {json.dumps({'phase': 'opinions', 'message': f'💬 {len(selected_teams)}팀 의견 수렴 중...'})}\n\n"

        opinions: dict[str, dict] = {}

        async def get_opinion(team: dict):
            tid = team["id"]
            role = "QA 엔지니어" if tid == "qa-agent" else team["name"]
            prompt = (
                f"[토론 참여 요청]\n"
                f"작업: {instruction}\n\n"
                f"너는 {role} 역할이야. 이 작업에 대해:\n"
                f"1. 접근 방법 제안 (구체적으로)\n"
                f"2. 예상 리스크 또는 주의점\n"
                f"3. 다른 팀과의 의존성\n"
                f"한국어로 간결하게 답해 (300자 이내)."
            )
            try:
                from free_llm import smart_call, _bump
                text, provider = await smart_call("default", prompt, max_out=600)
                if provider in ("gemini", "gemma_e4b", "gemma_main") and text and len(text.strip()) > 20:
                    _bump(provider)
                    opinions[tid] = {"name": team["name"], "emoji": team["emoji"], "opinion": text.strip()}
                    return
            except Exception as e:
                logger.warning("[discuss/opinion] %s 무료 LLM 실패, Claude 폴백: %s", tid, e)

            result = ""
            try:
                async for chunk in run_claude(prompt, team["localPath"], tid, is_auto=True):
                    if chunk["kind"] == "text":
                        result += chunk["content"]
                opinions[tid] = {"name": team["name"], "emoji": team["emoji"], "opinion": result}
            except Exception as e:
                opinions[tid] = {"name": team["name"], "emoji": team["emoji"], "opinion": f"❌ 오류: {e}"}

        await asyncio.gather(*[get_opinion(t) for t in selected_teams])

        for tid, op in opinions.items():
            yield f"data: {json.dumps({'phase': 'opinion', 'team_id': tid, **op})}\n\n"

        yield f"data: {json.dumps({'phase': 'discussion', 'message': '⚖️ CPO가 토론을 주도합니다...'})}\n\n"

        opinion_summary = "\n\n".join(
            f"[{op['emoji']} {op['name']}]\n{op['opinion']}" for op in opinions.values()
        )

        discuss_prompt = (
            f"작업: {instruction}\n\n"
            f"각 팀의 의견:\n{opinion_summary}\n\n"
            "너는 CPO(프로덕트 오너)야. 위 의견을 종합해서:\n"
            "1. 각 팀 의견의 강점과 약점을 짚어줘\n"
            "2. 충돌하는 부분이 있으면 어떤 게 더 나은지 판단해\n"
            "3. QA 관점의 리스크를 반영해서 최종 실행 계획을 세워\n"
            "4. 팀별 구체적 할 일을 배정해\n\n"
            "형식:\n"
            "## 토론 요약\n(2-3줄)\n\n"
            "## 최종 결정\n(실행 계획)\n\n"
            "## 팀별 할 일\n- 팀명: 할 일\n"
        )

        decision_text = ""
        async for chunk in run_claude(discuss_prompt, cpo_team["localPath"], "cpo-claude", is_auto=False):
            if chunk["kind"] == "text":
                decision_text += chunk["content"]
                yield f"data: {json.dumps({'phase': 'decision_chunk', 'content': chunk['content']})}\n\n"

        DISCUSS_TASKS[discuss_id]["status"] = "done"
        DISCUSS_TASKS[discuss_id]["completed"] = datetime.now().isoformat()
        DISCUSS_TASKS[discuss_id]["phases"] = [
            {"phase": "opinions", "data": opinions},
            {"phase": "decision", "data": decision_text},
        ]
        DISCUSS_TASKS[discuss_id]["teams"] = selected_ids
        DISCUSS_TASKS[discuss_id]["decision"] = decision_text

        evo = _main._load_evolution()
        for tid in selected_ids:
            if tid not in evo:
                evo[tid] = {"version": "1.0", "history": []}
        _main._save_evolution(evo)

        _log_activity("cpo-claude", f"✅ 토론 완료: {instruction[:50]}")

        yield f"data: {json.dumps({'phase': 'done', 'discuss_id': discuss_id, 'decision': decision_text, 'teams': selected_ids, 'opinions': {tid: op['opinion'][:500] for tid, op in opinions.items()}})}\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream")


@router.get("/api/dispatch/discuss/{discuss_id}")
async def get_discuss(discuss_id: str):
    """토론 결과 조회"""
    task = DISCUSS_TASKS.get(discuss_id)
    if not task:
        return {"ok": False, "error": "토론을 찾을 수 없습니다"}
    return {"ok": True, **task}
