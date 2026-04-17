# 팀메이커 패리티 로드맵

팀메이커 스샷(GH issue #7) 기준. **전부 ✅**.

## Sprint A — 상태 시각화 ✅
- [x] **A1** 캐릭 머리 위 상태 라벨 (작업 중 / 배분 중 / 완료 / 에러) + 펄스
- [~] **A2** B1에 통합
- [x] **A3** 배분 시 "배분 중" 뱃지 다수 팀에 동시 표시 (`hq:dispatching` 이벤트)

## Sprint B — 진행상황 가시화 ✅
- [x] **B1** 하단 고정 "⚙ N팀 작업 중" 바
- [x] **B2** 사이드 메뉴 "📋 실시간 로그"
- [x] **B3** 팀 spec 팝오버에 "작업 중" 섹션 (도구 + 경과초)

## Sprint C — 아티팩트 ✅
- [x] **C1** ZIP 다운로드 · [x] **C2** 폴더에 저장 · [x] **C3** 전체 보기 모달 · [x] **C4** 핸드오프 카드 포맷

## Sprint D — 에이전트 생성 UX ✅
- [x] **D1** 사이드바 "+ 드래그 배치" 점선 카드 (draggable)
- [x] **D2** Phaser 메인 영역 onDragOver/onDrop → 좌표 저장 + AddTeamModal 오픈

## Sprint E — 잔버그 + 안정화 ✅
- [x] **E1** 이슈 cleanup (GH #1~6 close)
- [x] **E2** 메모리 누수 방지 — 모든 window listener를 명시적 핸들러화 + `events.once("shutdown")` 에서 일괄 해제 + `time.removeAllEvents` + `tweens.killAll`
- [x] **E3** 세션 전환 시 agentStatus 스냅샷 — `sessions_store.set_session_meta` / `get_session_meta` 활용

## Sprint F — 버그 트래커 ✅
- [x] **F1** issue_url/number/status 기록
- [x] **F2** 10분 자동 cleanup
- [x] **F3** 관리자 🗂 버그 리스트 UI
- [x] **F4** 중복 탐지 (유사도 0.75+, note substring) → 기존 이슈 코멘트 병합
- [x] **F5** 자동 cleanup + UI + 중복 탐지로 충족

## 배포 히스토리
- `222ddfc5b-1776420370` 잔상/뒤로걷기/실종 수정
- `222ddfc5b-1776422097` A1 + B1 + B2
- `222ddfc5b-1776422281` C1~C4
- `222ddfc5b-1776423348` F1 + F2 + F3
- `222ddfc5b-1776423810` B3 + F4 + F5
- `222ddfc5b-1776424445` **A3 + D1 + D2 + E2 + E3** (스프린트 완결)

## 완료
**모든 스프린트 항목 ✅ 100%.** 다음 단계는 `plans/self-improvement.md` 의 Phase 2 (무료 LLM 브릿지 → 자가 트리아지).
