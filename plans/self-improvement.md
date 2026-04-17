# 자가 개선 루프 설계 (Auto-triage)

> 장기 목표: 버그 리포트가 올라오면 **에이전트가 자동으로 읽고 패치 PR 만들기**.
> 선행 조건: 핵심 시스템 안정화 (팀메이커 패리티 완료 후).

## 현재 준비된 인프라 ✅
- `POST /api/diag/report` — 리포트 수신 + jsonl 저장
- GH Issue 자동 생성 (bug, auto, urgent 라벨)
- `bug_reports.jsonl` — status(open/resolved/merged) + issue_number 링킹
- 10분 cron `_diag_cleanup_loop` — closed 이슈 자동 정리
- 중복 탐지 `_find_duplicate_report` — 유사 리포트는 기존 이슈에 코멘트 병합
- `GET /api/diag/logs` — 최근 500줄 콘솔 로그
- 관리자 UI 🗂 버그 리스트

## Phase 1 — 수동 트리아지 (지금)
사용자가 리포트 → 관리자가 UI에서 확인 → 수동 수정.

## Phase 2 — 세미오토 (무료 LLM 연결 이후)
**트리거**: 새 리포트 open 상태 10분 유지 → 자동 분류 파이프라인 시작

1. **분류 에이전트** (cheap LLM: Gemma/Qwen/Haiku)
   - 입력: title + note + 최근 로그 80줄
   - 출력: `{category, severity, suspected_file, patch_strategy}`
   - category: `ui-layout` / `race-condition` / `memory-leak` / `data-sync` / `cosmetic`
2. **수정 에이전트** (코드 모델)
   - 입력: 분류 결과 + suspected_file 전체
   - 출력: 패치 diff + PR description
3. **검증 에이전트** (QA)
   - 입력: 패치 diff
   - 출력: `{safe: bool, risks: [...]}`
4. **머지 게이트**
   - safe=true → PR 자동 생성 + 사용자 알림 (수동 머지)
   - safe=false → 이슈에 분석 코멘트만 추가

## Phase 3 — 완전 자동 (안정화 후)
- 머지 게이트 통과 + 테스트 녹색 → **자동 배포**
- 배포 후 30분 모니터링 → 에러 ↑ 시 자동 롤백

## 필요한 추가 엔드포인트 (Phase 2 시작 전)
- [ ] `POST /api/diag/triage/{issue_number}` — 수동 트리아지 트리거
- [ ] `GET /api/diag/triage/status` — 진행 중 트리아지 상태
- [ ] `POST /api/auto-patch/propose` — 수정 제안 수신
- [ ] `POST /api/auto-patch/merge` — 사용자 승인 시 머지
- [ ] `.github/workflows/auto-triage.yml` — GH Action 대체

## 필요한 프론트 UI
- [ ] 관리자 🗂 목록에 "🤖 자동 트리아지" 버튼
- [ ] 분석 결과 표시 (category/severity)
- [ ] 제안된 패치 diff 뷰어 + 승인 버튼

## 무료 LLM 연결 준비
- OpenClaw 로컬 API 또는 Gemma/Qwen Ollama
- 우리 `claude_runner.py`에 `use_cheap_model=True` 분기 추가
- 환경변수: `HQ_TRIAGE_LLM_URL`, `HQ_TRIAGE_LLM_MODEL`

## 완료 전 체크리스트
1. 팀메이커 패리티 100% (A/B/C/D/E/F)
2. 24시간 연속 운영 테스트 — 리포트 없음
3. `plans/teammaker-parity.md` 모든 ✅
