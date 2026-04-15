# Step 3.8: Authentication

**Date**: 2026-02-19
**Status**: Complete

---

## Authentication Model: API Key Only

별도 로그인/회원가입 없이 사용자의 Anthropic API Key로 인증합니다.

### Flow
1. 첫 접속 -> `/setup` 페이지에서 API Key 입력
2. API Key 검증 (Claude API에 테스트 요청)
3. 유효하면 Zustand `settingsStore`에 저장 (localStorage persist)
4. 이후 접속 시 저장된 Key 자동 사용
5. 설정 페이지에서 Key 변경/삭제 가능

### Implementation
- `src/app/setup/page.tsx` - API Key 입력 UI (구현 완료)
- `src/stores/settingsStore.ts` - Key 저장/관리 (구현 완료)
- `src/app/page.tsx` - Key 유무에 따라 리다이렉트 (구현 완료)
- `src/app/office/page.tsx` - Key 없으면 `/setup`으로 리다이렉트 (구현 완료)

### Security Note
- API Key는 localStorage에 저장 (MVP 한정)
- 프로덕션에서는 서버 사이드 프록시를 통해 Key를 안전하게 관리해야 함
