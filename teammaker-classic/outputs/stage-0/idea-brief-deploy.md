# Idea Brief: 원클릭 배포

## 한줄 요약

TeamMaker로 만든 웹사이트를 비개발자도 "배포해줘" 한마디로 실제 URL에 공개할 수 있게 하는 기능

## 타겟 유저

바이브코딩으로 서비스를 만들고 싶은 비개발자

## 해결하는 문제

AI가 만들어준 웹사이트가 로컬에만 존재하면 공유할 수 없다. 비개발자는 배포 과정(CLI, 호스팅, 환경변수, DB 설정)을 스스로 수행할 수 없다.

## 유저 여정

```
유저 요청 ("투두리스트 만들어줘")
  ↓
Phase 1: storageType 결정
  - AI가 기획 구체화 중 데이터 저장 방식 질문
  - database (Supabase) / localStorage / none
  - 결과를 프로젝트 컨텍스트에 저장
  ↓
Phase 2: Supabase 프로비저닝 (DB 선택 시)
  - /api/deploy/supabase로 프로젝트 자동 생성
  - URL, anon key, service_role key 반환
  - 에이전트 컨텍스트에 DB 정보 주입
  - 파이프라인 재개
  ↓
Phase 3: 에이전트 코드 생성
  - 기존 파이프라인 그대로
  - DB 프로젝트는 schema.sql artifact 생성 유도
  ↓
Phase 4: 자동 마이그레이션 (DB 선택 시)
  - 파이프라인 완료 후 schema.sql 탐색
  - /api/deploy/supabase/migrate로 SQL 실행
  ↓
Phase 5: 배포 가이드 (DeployGuideCard)
  - 유저가 "배포해줘" 입력 시 채팅에 카드 표시
  - Step 1: GitHub에 올릴지 선택 (선택사항)
  - Step 2: 토큰 입력 (Vercel 필수, Supabase는 DB 선택 시)
    - 발급 페이지 링크 제공 + 붙여넣기 입력
  ↓
Phase 6: 배포 실행
  - npx vercel deploy --prod --token ... 실행
  - DB 환경변수(URL, ANON KEY 등) 함께 전달
  - 각 단계 결과를 채팅에 순차 표시
  - 성공 → 배포 URL 표시
  - 실패 → "다시 시도" 버튼
  ↓
Phase 7: 실패 자동 복구
  - 에러 로그를 lastDeployErrorRef에 저장
  - "다시 시도" → 프로젝트 파일 재로드 → fixErrorWithAI(에러+소스) → 재배포
  - fixErrorWithAI는 read_file, write_file, run_command 도구 사용 가능
```

## 핵심 기능

| # | 기능 | 설명 |
|---|------|------|
| F1 | storageType 선택 | 기획 시 에이전트가 데이터 저장 방식 질문, 컨텍스트에 저장 |
| F2 | Supabase 자동 프로비저닝 | `/api/deploy/supabase` — 프로젝트 생성, 키 반환 |
| F3 | schema.sql 자동 마이그레이션 | `/api/deploy/supabase/migrate` — SQL 실행 |
| F4 | 토큰 관리 API | `/api/settings/tokens` — GET/PUT/DELETE, .env.local 저장 + 메모리 캐시 |
| F5 | 토큰 설정 UI | 설정 페이지에 Vercel/Supabase 토큰 입력 필드 |
| F6 | DeployGuideCard | 채팅 내 배포 단계별 카드 UI |
| F7 | Vercel CLI 배포 | `npx vercel deploy --prod --token ...` + 환경변수 전달 |
| F8 | 배포 실패 자동 복구 | 에러 로그 → fixErrorWithAI() → 재배포 |

## 구현 순서

```
Phase A (인프라):       F4 (토큰 API) → F5 (토큰 UI)
Phase B (DB 지원):      F1 (storageType 선택) → F2 (Supabase 프로비저닝) → F3 (마이그레이션)
Phase C (배포):         F6 (DeployGuideCard) → F7 (Vercel 배포) → F8 (실패 복구)
```

Phase A, B, C는 병렬 진행 가능. 각 Phase 내부는 순차.

## 기술 스택

- **배포**: Vercel (npx vercel CLI)
- **DB**: Supabase (Management API로 프로젝트 생성)
- **토큰 저장**: .env.local + 서버 메모리 캐시

## 범위 외 (나중에)

- OAuth 연동 (Vercel/Supabase)
- 스크린샷 기반 토큰 발급 가이드
- 유료 플랜 대응
- 커스텀 도메인 연결
- Supabase RLS/보안 개선 (별도 TODO 존재)
