# SESSION_STATE — Option B 착수 대기

> 세션 크래시 대비 체크포인트. 새 세션 시작 시 이 파일을 먼저 읽을 것.

## 🔴 결정 사항 (2026-04-18)

**Option B 확정**: 팀메이커(`teammaker-classic/`)를 몸통으로 승격 + 픽셀 오피스를 그 위에 이식.

### 왜 Option B
지금까지 부분 포팅(약 30%)으로는 "안정성"/"업무 처리 방식"이 체감 안 됨. 사용자 반복 지적:
- "만들고 삭제도 자유롭고"
- "끊기면 연결되는 구조 알아서"
- "역할분배"
- "업무 처리방식 쟤내(팀메이커)가 더 안정적임"
- "폰트/말주머니 팀메이커가 훨씬 깨끗. 우린 초기 세팅 잘못한 건지 계속 나아지지 않음"

팀메이커 검증 코드(`useChatSend.ts` 1845줄 + `lib/claude.ts` + stores) + shadcn 디자인 토큰 + next/font 기본 설정이 이미 해결. 부분 포팅 대신 베이스 승격이 정답.

### 우리가 유지할 고유 강점 (사용자 확인)
1. **픽셀 오피스** (`ui/app/game/OfficeScene.ts` + 에셋)
2. **에이전트 @멘션 통합 채팅**
3. **에이전트별 스펙/활동 로그 축적** (spec popup)

### 장독대로 미룬 항목 (추후 유저 배포시)
- 팀메이커 설정/토큰 시스템 (API key / 모델 선택 / GitHub·Vercel·Supabase 토큰 입력 UI) → `project_jangdokdae.md` 섹션 7 참조

## 🎯 Option B 실행 플랜

### Phase 0 — 베이스 승격 (0.5일)
- `teammaker-classic/` 을 베이스로 승격. 현재 `ui/` 는 보존 (legacy).
- `package.json` 이미 `USE_MAX_PLAN=1` 로 로컬 실행 중.
- Cloudflare Pages 배포 타겟을 `teammaker-classic/` 로 변경 (`deploy.sh` 수정).

### Phase 1 — 픽셀 오피스 이식 (1일)
- `teammaker-classic/src/app/office/page.tsx` 신설 (Next.js 라우트)
- `ui/app/game/*.ts` 전체 복사 → `teammaker-classic/src/components/office/`
- `ui/public/assets/*` 전체 복사 → `teammaker-classic/public/assets/`
- Phaser import 동적 (`dynamic({ ssr: false })`)

### Phase 2 — 우리 고유 기능 이식 (1일)
- 통합 채팅 (에이전트 멘션 + DispatchChat) → TM chatStore 확장
- 팀별 활동 로그 → TM agentStore에 activity 필드 추가
- 기존 API `/api/dispatch/smart`, `/api/chat/{team}/send`, `/api/sessions/*` → TM API 라우트로 이식

### Phase 3 — 백엔드 통합 결정 (0.5일)
- **B1**: FastAPI 서버 유지 (Python). TM 프론트 → 우리 FastAPI 호출
- **B2**: TM Next.js API route 그대로 사용 (Anthropic API 직접). 우리 FastAPI는 점진 폐기
- **권장 B2**: 팀메이커 안정성 유지 + 단일 런타임

### Phase 4 — Cloudflare 배포 전환 (0.25일)
- `deploy.sh` 를 `teammaker-classic/` 빌드하게 수정
- `version.json` 형식 유지

## 📂 현재 리포 구조 (변경 전)
```
company-hq/
├── ui/                   ← 현재 메인 (Next.js 16 + Phaser 3)
├── server/               ← FastAPI 백엔드 (포트 8000)
├── teammaker-classic/    ← 이 베이스로 승격 예정 ✨
├── shared/ plans/ scripts/ ...
```

## 📂 변경 후 (Option B)
```
company-hq/
├── teammaker-classic/    ← 메인 (픽셀 오피스 이식됨)
│   ├── src/app/office/   ← 픽셀 오피스 라우트
│   ├── src/components/office/  ← OfficeScene.ts + 에셋 로직
│   └── public/assets/    ← 우리 에셋 전체
├── ui/                   ← legacy (보존)
├── server/               ← 상황에 따라 유지 or 폐기
```

## 🔧 이번 세션 (2026-04-18) 완료 사항

### 🔴 치명 수정
- idle 5분 타임아웃 (Claude CLI subprocess)
- 단일 @mention → direct dispatch (CPO 거치지 않음)
- CPO 채팅 오염 제거
- `renderUserLayout` floorMap/blockedByFurn 리셋 버그 (검은영역 차단 실패 원인)
- L-desk walkableCells 복원 (꺾인 공간만 통과)
- pollPositions walking 중 rebuild 스킵 (캐릭 "덜덜떨림/날라감" 방지)
- buildFloor walkout/walking 캐릭 + orphan 청소 (할루시네이션 방지)

### Phase 1~7 (진행)
- Phase 1: 컨텍스트 자동 주입 (furniture_overrides + layout + 최근 5 결정)
- Phase 2: Pipeline DAG 순차/병렬 시각화
- Phase 3: Artifact 수집 (Write/Edit tool_use)
- Phase 4: Session→Project 필드 (workingDirectory/githubRepo)
- Phase 5: `/api/deploy/project/{team_id}/github` + ChatPanel 🚀 push 버튼
- Phase 6: 응답 validator (빈/짧은 응답 1회 재시도)
- Phase 7: Zustand stores 3개 생성 (project/pipeline/handoff)

### Sprint 8~10
- Sprint 8: `server/policies.md` 자동 주입 (에이전트 정책 숙지)
- Sprint 9: 🚀 GitHub push 버튼 UI
- Sprint 10: 📁 프로젝트 메타 편집 팝오버

### 속도
- 단순 요청 haiku 자동 다운그레이드 (2~3x 빠름)
- SOP 스킵 (80자 미만 + 한줄)

### 스킬/레퍼런스 이식 (80% 완료)
- 팀메이커 skill 5개 → `server/skills/` 복사
- 팀메이커 reference 6개 → `server/references/` (auth/api/react/nextjs/tailwind/shadcn)
- 키워드 매칭 기반 자동 주입 (최대 3개)

### 캐릭 애니메이션
- working/dispatching 시 제자리 걷기 + Y 2px 바운스 (타이핑 느낌)
- 배지 해제 시 트윈 kill + baseY 리셋

### UI/UX
- 버전 라벨 `{sha}·{ts뒤4자리}` — 배포마다 숫자 변함
- 캐시 삭제 5단계 진행표시 + 로그인 자동 복원
- 이어하기 버튼 조건 엄격화 (정상 응답 오탐 제거)

## 🔄 최근 배포
- 마지막 빌드: `601e1f090-1776448301`
- 배포 URL: `https://600g.net`
- 라벨: `601e1f09·8301`

## 🚀 새 세션 시작 지시

```bash
cd ~/Developer/my-company/company-hq

# 1. 현 상태 확인
git status
git log --oneline -5

# 2. Option B Phase 0 착수
#    teammaker-classic/ 를 메인으로 승격
#    자세한 Phase 체크리스트는 이 SESSION_STATE.md 참조

# 3. 먼저 할 것
cat SESSION_STATE.md      # 이 파일
cat server/policies.md    # 코드 정책 (에이전트 자동 숙지)
```

## 📝 크래시 방지 규칙
- 스크린샷 3회 이상 반복 시 "diff만 말씀해 주세요" 요청
- 마일스톤마다 `git commit` (wip: 프리픽스 OK)
- 200k 토큰 감 오면 이 파일 업데이트 후 `/compact` 권장

## 💡 다음 세션 첫 액션
1. **이 파일 먼저 읽고** Option B 결정 확인
2. `teammaker-classic/` 로 이동 후 로컬 실행 (`npm run dev`) 확인
3. Phase 0 시작: 픽셀 오피스 라우트 추가 (`src/app/office/page.tsx`)
