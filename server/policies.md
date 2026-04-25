# 두근컴퍼니 정책/규칙 (에이전트 필독)

> 이 문서는 **모든 팀 에이전트의 시스템 프롬프트에 자동 주입**된다.
> 코드 수정 전 반드시 이 정책을 먼저 확인한다.
> GitHub에 이 파일이 저장되므로, 에이전트가 코드 변경 시 함께 업데이트 가능.

## 언어 정책 (필수)
- **모든 응답은 한국어로 한다.** (사용자 명시 요청 없으면)
- 코드 주석/변수명은 영문 가능, 사용자 향한 텍스트만 한국어
- 외국어 답변 금지 — 영어로 시작하면 즉시 한국어로 전환
- 공식적이지 않게, 친근한 동료 톤으로

---

## 오피스 씬(OfficeScene.ts) 정책

### Grid / Walkability (사용자 핵심 요구)
1. **검은 영역 차단**: 가구/타일이 렌더되지 않은 셀은 grid = true (통과 금지).
   - `_applyBlackAreaBlock()` 이 `floorMap` 기반으로 bidirectional 갱신.
   - 팀 점유 셀 + `blockedByFurn` 은 보존.
2. **벽(wall_tile) 차단**: `WALKABLE_CATEGORIES` 에서 제외 — 벽 셀은 점유됨.
   - `wall_decor` 는 walkable 유지 (장식은 통과 허용).
3. **L-desk 꺾인 공간만 통과**: `walkableCells` 명시된 가구(L-desk `[[2,2]]` / `[[0,2]]`)는 해당 셀만 통과, 나머지 차단.
4. **쇼파/일반 책상**: Y-sort 가구 중 `walkableCells` 없는 건 전체 통과 (row 기반 z-sort로 앞/뒤 자연 갈림).
5. **복도(하단 3줄)**: 다른 셀과 **동일 규칙**. 타일/가구 있으면 통과, 없으면 차단.
   - 이전의 `_clearCorridorGrid` 강제 unblock 로직은 **제거됨**. 복원 금지.
6. **bfsPath**: 복도 우회 예외 없음. grid 그대로 따름.

### Z-order (Y-sort)
1. **isYSortPiece**: 쇼파/코너/서류/desk/의자 앞·옆 → baseZ=3000, 앵커 `(row + min(H, 2) - 0.5)`.
2. **chair_back (isBackView)**: baseZ=3500 → 항상 캐릭 가림.
3. **top 1줄만 캐릭을 가림** — 2행+ 가구의 상단 셀은 가구가 캐릭 위에, 하단은 캐릭이 위에.

### 팀(캐릭) 배치
1. 드래그 시 `canPlace()` 로 grid 검증.
2. 복도(하단 3줄)에도 팀 배치 허용. 단 해당 셀이 walkable여야 함.
3. `pollPositions`: 걷기 중(`walking`/`walkout` flag)이면 rebuild 스킵 — "덜덜떨림/날라감" 방지.

### 캐릭 애니메이션
1. **working/dispatching 배지**: 캐릭 `walk_down` 애니 + Y 바운스 2px (타이핑 느낌).
2. **walkout 복귀 / null 배지**: 트윈 kill + baseY 리셋 + `setFrame(0)`.
3. 할루시네이션 방지: `buildFloor()` 시 `walking`/`walkout` flag 캐릭 모두 destroy + orphan 스프라이트 청소.

---

## 디스패치 정책

### 단일 @mention
- CPO 라우팅/요약 **스킵**. 해당 팀에 직접 전달.
- `phase: "direct_dispatch"` 로 프론트에 신호 → DAG에 CPO 노드 숨김.
- CPO 채팅 히스토리 오염 금지 (`_cpo_close()` 호출 금지).

### 복수 팀 디스패치
- CPO haiku 라우팅 → deps 기반 DAG 실행.
- deps 있는 step은 이전 결과를 `{prev_result}` 로 prompt에 주입.

### Timeout / Retry
- Claude CLI subprocess: **idle 5분** 초과 시 kill + 에러 surface.
- 응답 validator: 빈 응답 또는 10자 미만 짧은 응답 → 1회 자동 재시도.

---

## 프롬프트 조립 순서 (run_claude)

1. `team_prompts.json`의 팀별 시스템 프롬프트
2. **프로젝트 컨텍스트** (furniture_overrides + layout + 최근 5 결정)
3. **정책(policies.md, 이 파일)** ← 지금 읽는 부분
4. **SOP** (`server/skills/{role}.md`) — 단순요청(80자 미만+한줄) 시 스킵
5. **References** (`server/references/*.md`) — 프론트/백/디자인 팀에만, 키워드 매칭 최대 3개
6. `--model haiku` (단순요청) / `sonnet` (기본)

---

## 배포 정책

1. 프론트 변경 시 `cd ~/Developer/my-company/company-hq && bash deploy.sh` 필수.
2. 버전 라벨 `{git_sha}·{timestamp 뒤4자리}` — 배포마다 숫자 변함.
3. 캐시 삭제 시 **로그인 보존** (`hq-auth-token`/`hq-auth-user`).

---

## 금지 사항 (이력상 반복 실수)

- [ ] `chair_back` 스프라이트를 캐릭 뒤에 자동 추가 금지 (의자 붙이기 이슈 #12 외)
- [ ] 복도 `_clearCorridorGrid` 강제 unblock 추가 금지 (검은영역 차단 깨짐)
- [ ] wall_tile 을 WALKABLE_CATEGORIES 에 되돌리지 말 것
- [ ] uvicorn `--reload` 모드에서 `.py` 외 파일 감시 금지 (이미 exclude 설정됨)
- [ ] 에디터에서 바닥 타일 없는 셀에 가구 배치 시 grid 차단 해제 방지

---

## 컨텍스트 업데이트 규칙

이 파일 내용이 오래되면 에이전트가 틀린 정책 따름. 코드 변경 시:
1. 이 파일 (policies.md) 먼저 업데이트
2. 관련 코드 변경
3. 커밋 메시지에 "policy: ..." 태그

**마지막 업데이트**: 2026-04-18
