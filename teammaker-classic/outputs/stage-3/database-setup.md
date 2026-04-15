# Step 3.4: Database Setup

**Date**: 2026-02-19
**Status**: Skipped (MVP)

---

## Decision: No Database for MVP

MVP에서는 별도의 데이터베이스를 사용하지 않습니다.

### 데이터 저장 방식
- **API Key**: Zustand `persist` middleware -> `localStorage`
- **팀/오피스 상태**: Zustand in-memory (세션 동안만 유지)
- **채팅 히스토리**: Zustand in-memory

### 이유
1. 단일 사용자 MVP (멀티유저 없음)
2. 서버 사이드 로직 최소화 (Claude API는 클라이언트에서 직접 호출)
3. 빠른 프로토타이핑 우선

### 향후 (v1.1+)
- Supabase 또는 Firebase로 데이터 영속화
- 멀티유저 지원 시 서버 사이드 DB 필요
