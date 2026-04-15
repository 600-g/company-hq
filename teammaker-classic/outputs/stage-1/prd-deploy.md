# PRD: 원클릭 배포

**버전**: 1.0
**작성일**: 2026-03-19
**상태**: 기획 완료

---

## 1. 개요

TeamMaker로 생성한 웹사이트를 비개발자도 "배포해줘" 한마디로 실제 URL에 공개할 수 있는 기능.

- **타겟**: 바이브코딩으로 서비스를 만들고 싶은 비개발자
- **배포 플랫폼**: Vercel (npx vercel CLI)
- **DB 지원**: Supabase (선택적)

---

## 2. 기능 우선순위 (MoSCoW)

### Must Have

| ID | 기능 | 설명 |
|----|------|------|
| F4 | 토큰 관리 API | `/api/settings/tokens` — GET/PUT/DELETE, .env.local 저장 + 메모리 캐시 |
| F5 | 토큰 설정 UI | 설정 페이지에 Vercel/Supabase 토큰 입력 필드 |
| F6 | DeployGuideCard | 채팅 내 배포 가이드 카드 (토큰 체크 → 배포 버튼) |
| F7 | Vercel 배포 실행 | `npx vercel deploy --prod --token ... --yes` + 환경변수 전달 |

### Should Have

| ID | 기능 | 설명 |
|----|------|------|
| F1 | storageType 선택 | 기획 시 에이전트가 데이터 저장 방식 질문, 컨텍스트에 저장 |
| F2 | Supabase 자동 프로비저닝 | `/api/deploy/supabase` — 프로젝트 생성, URL+키 반환 |
| F3 | schema.sql 자동 마이그레이션 | `/api/deploy/supabase/migrate` — SQL 실행 |

### Could Have

| ID | 기능 | 설명 |
|----|------|------|
| F8 | 배포 실패 자동 복구 | 에러 로그 → fixErrorWithAI() → 재배포 |

---

## 3. 사용자 스토리

### Must

| ID | 스토리 | 완료 조건 |
|----|--------|-----------|
| US-1 | 설정에서 Vercel 토큰을 입력/수정/삭제할 수 있다 | 토큰 저장 후 재접속해도 유지 |
| US-2 | 설정에서 Supabase 토큰을 입력/수정/삭제할 수 있다 | 토큰 저장 후 재접속해도 유지 |
| US-3 | "배포해줘" 입력 시 배포 가이드 카드가 표시된다 | DeployGuideCard 렌더링 |
| US-4 | 토큰 미입력 시 설정 페이지로 안내받는다 | 진행 차단 + 링크 |
| US-5 | "배포하기" 버튼으로 Vercel에 배포되고 URL을 받는다 | 실제 접속 가능한 URL |

### Should

| ID | 스토리 | 완료 조건 |
|----|--------|-----------|
| US-6 | 기획 시 데이터 저장 방식을 선택할 수 있다 | 선택 결과 컨텍스트에 저장 |
| US-7 | DB 선택 시 Supabase 프로젝트가 자동 생성된다 | URL + 키 반환 |
| US-8 | 코드 생성 완료 후 DB 스키마가 자동 적용된다 | schema.sql 실행됨 |
| US-9 | DB 프로젝트 배포 시 환경변수가 자동 전달된다 | Vercel에 env 설정됨 |

### Could

| ID | 스토리 | 완료 조건 |
|----|--------|-----------|
| US-10 | 배포 실패 시 에러 + "다시 시도" 버튼 표시 | 렌더링 |
| US-11 | "다시 시도" 시 AI가 문제 해결 후 재배포 | 재배포 성공 |

---

## 4. 사용자 흐름

### Flow 1: 정적 사이트 배포

```
유저 요청 → AI 기획 (storageType=none) → 코드 생성 → 완료
→ "배포해줘" → DeployGuideCard → 토큰 확인 → [배포하기]
→ npx vercel deploy → 성공 → URL 표시
```

### Flow 2: DB 프로젝트 배포

```
유저 요청 → AI 기획 → storageType 질문 → "데이터베이스" 선택
→ Supabase 토큰 확인 (없으면 설정 안내)
→ Supabase 프로비저닝 → 코드 생성 (schema.sql 포함) → 완료
→ schema.sql 자동 마이그레이션
→ "배포해줘" → DeployGuideCard → 토큰 확인 → [배포하기]
→ npx vercel deploy + 환경변수 → 성공 → URL 표시
```

### Flow 3: 실패 복구

```
배포 실패 → 에러 표시 + [다시 시도]
→ fixErrorWithAI() → 파일 수정 → 재배포 → 성공/실패 (반복)
```

---

## 5. 기능 상세

### F4. 토큰 관리 API

- **엔드포인트**: `/api/settings/tokens`
- **GET**: `{ tokens: { VERCEL_TOKEN: boolean, SUPABASE_ACCESS_TOKEN: boolean } }` — 존재 여부만 반환
- **PUT**: `{ key: string, value: string }` → .env.local에 저장 + 메모리 캐시 갱신
- **DELETE**: `{ key: string }` → .env.local에서 제거 + 캐시 무효화

### F5. 토큰 설정 UI

- 설정 페이지(`/settings`)에 섹션 추가
- Vercel: 입력 필드 + 저장/삭제 + 발급 링크
- Supabase: 입력 필드 + 저장/삭제 + 발급 링크
- 저장 시 마스킹 표시 (`●●●●●●`)

### F1. storageType 선택

- AI가 기획 구체화 중 데이터 저장이 필요하다고 판단하면 질문
- 채팅 내 StorageTypeCard 표시:
  - 데이터베이스 (Supabase) — "다른 기기에서도, 여러 사용자 지원"
  - 브라우저 저장 (localStorage) — "가입 없이, 이 브라우저에서만"
- 정적 사이트는 질문하지 않음 (storageType = "none")
- 선택 결과를 프로젝트 컨텍스트에 저장

### F2. Supabase 자동 프로비저닝

- **엔드포인트**: `/api/deploy/supabase` (POST)
- Supabase Management API로 프로젝트 생성
- 반환: project URL, anon key, service_role key
- 에이전트 컨텍스트에 DB 정보 주입
- `continueAfterDbSetup()`으로 파이프라인 재개
- 무료 티어 한도(2개) 초과 시 안내 메시지

### F3. schema.sql 자동 마이그레이션

- **엔드포인트**: `/api/deploy/supabase/migrate` (POST)
- 파이프라인 완료 후 프로젝트 디렉토리에서 schema.sql 탐색
- Supabase SQL Editor API로 실행
- `CREATE TABLE IF NOT EXISTS` 패턴 사용 유도

### F6. DeployGuideCard

- **트리거**: "배포해줘" / "배포하기" / "deploy" 등 입력 시
- 토큰 상태 체크 (☑ 확인됨 / ✗ 미입력 + 설정 링크)
- GitHub 업로드 선택 (체크박스, 선택사항)
- [배포하기] 버튼 (토큰 확인 시 활성화)

### F7. Vercel 배포 실행

- `npx vercel deploy --prod --token <TOKEN> --yes`
- DB 프로젝트 시 환경변수: `-e NEXT_PUBLIC_SUPABASE_URL=... -e NEXT_PUBLIC_SUPABASE_ANON_KEY=...`
- 진행 상태 UI (DeployProgressCard): 준비 → 업로드 → 빌드 → 완료
- 성공: URL + [복사] + [열기]
- 실패: 에러 요약 + [다시 시도]

### F8. 배포 실패 자동 복구

- 에러 로그 → `lastDeployErrorRef`에 저장
- "다시 시도" 클릭 → 프로젝트 파일 재로드 → `fixErrorWithAI(에러, 소스)` → 재배포
- fixErrorWithAI는 read_file, write_file, run_command 도구 사용 가능

---

## 6. 화면 구조

### 신규/수정 화면

| # | 화면/컴포넌트 | 유형 |
|---|--------------|------|
| S1 | 설정 - 토큰 관리 섹션 | 기존 페이지 수정 |
| S2 | StorageTypeCard | 신규 채팅 카드 |
| S3 | DeployGuideCard | 신규 채팅 카드 |
| S4 | DeployProgressCard | 신규 채팅 카드 |

---

## 7. 구현 순서

```
Phase A (인프라):  F4 (토큰 API) → F5 (토큰 UI)
Phase B (DB):     F1 (storageType) → F2 (Supabase 프로비저닝) → F3 (마이그레이션)
Phase C (배포):   F6 (DeployGuideCard) → F7 (Vercel 배포) → F8 (실패 복구)
```

Phase A, B, C는 병렬 진행 가능. 각 Phase 내부는 순차.

---

## 8. 범위 외 (나중에)

- OAuth 연동 (Vercel/Supabase)
- 스크린샷 기반 토큰 발급 가이드
- 유료 플랜 대응
- 커스텀 도메인 연결
- Supabase RLS/보안 개선 (별도 TODO)

---

## 9. 참고 자료

- **아이디어 브리프**: `outputs/stage-0/idea-brief-deploy.md`
