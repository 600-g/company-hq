# Lessons Learned — company-hq

## 규칙: 스크롤 컨테이너에 absolute inset-0 절대 사용 금지
- **날짜**: 2026-03-26
- **문제**: 스크롤 컨테이너를 `absolute inset-0`으로 변경하면 메시지가 전부 가려짐 (2회 반복 실수)
- **원인**: flex 레이아웃 안에서 absolute 요소는 부모 높이 계산에 참여하지 않아 레이아웃이 깨짐
- **재발 방지**: 스크롤 컨테이너는 항상 `flex-1 overflow-y-auto min-h-0` 유지. 오버레이 버튼이 필요하면 부모를 `relative`로 감싸고, 스크롤 div는 flex-1 그대로, 버튼만 absolute로 배치

## 규칙: 수정 후 반드시 시각적 검증 항목 체크
- **날짜**: 2026-03-26
- **문제**: CSS 레이아웃 변경 후 메시지 노출 여부를 검증하지 않고 배포
- **원인**: 빌드 성공 = 동작 성공이라고 착각
- **재발 방지**: CSS/레이아웃 변경 시 체크리스트: (1) 메시지가 보이는가 (2) 스크롤이 되는가 (3) 입력창이 보이는가. 빌드 성공만으로 완료 보고하지 않는다

## 규칙: 알림 읽음 처리 시 서버 응답의 unread 값 사용
- **날짜**: 2026-03-26
- **문제**: 클라이언트에서 `prev - 1`로 계산하면 서버 상태와 불일치 발생
- **원인**: 이미 읽은 알림을 다시 클릭하면 카운트가 음수가 되거나, 폴링이 덮어씀
- **재발 방지**: mark_read API 응답의 `unread` 필드를 사용하여 서버와 동기화

## 규칙: gameRef.getTeamFloor()로 층 배치를 결정하지 말 것
- **날짜**: 2026-03-26
- **문제**: 서버에서 2층으로 저장한 팀이 새로고침 시 1층으로 원복됨
- **원인**: gameRef.getTeamFloor()이 기본값(1층)을 반환 → 서버/localStorage 데이터를 덮어씀 → 잘못된 데이터가 다시 서버에 저장
- **재발 방지**: 저장된 배치(서버 → localStorage)를 source of truth로 사용. 게임 씬은 저장 데이터를 받아서 반영하는 방향으로만 동기화

## 규칙: CSS 포지셔닝 트릭 금지 — 일반 flex 아이템 사용
- **날짜**: 2026-03-26
- **문제**: absolute, sticky, z-index 오버레이 버튼이 반복적으로 안 보이거나 클릭 불가
- **원인**: overflow 컨텍스트, 부모 높이 미계산, z-index 충돌 등 디버깅이 어려움
- **재발 방지**: 오버레이 UI가 필요하면 포지셔닝 대신 일반 flex 아이템으로 삽입 (shrink-0). 공간을 약간 차지하지만 100% 확실하게 보임. "보이는 게 예쁜 것보다 중요하다"

## 규칙: UI 기능은 모든 모드에서 통일 구현
- **날짜**: 2026-03-26
- **문제**: 취소 버튼이 인라인/모달/통합채팅에서 각각 다르게 동작
- **원인**: 모드별로 따로 구현하다 보니 불일치 발생
- **재발 방지**: 공통 기능(취소, 스크롤 등)은 하나의 로직으로 통일하고, UI만 모드별로 다르게 렌더링
- [2026-04-10 02:23] design-team: env: node: No such file or directory
- [2026-04-10 02:39] cpo-claude: env: node: No such file or directory
- [2026-04-27 21:31] agent-0ca86d: No conversation found with session ID: aa44c622-8880-4572-a4c2-4000b73145cf
- [2026-04-27 21:31] agent-0ca86d: No conversation found with session ID: aa44c622-8880-4572-a4c2-4000b73145cf
- [2026-04-28 01:58] agent-0ca86d: No conversation found with session ID: aa44c622-8880-4572-a4c2-4000b73145cf
- [2026-04-28 02:11] agent-0ca86d: No conversation found with session ID: aa44c622-8880-4572-a4c2-4000b73145cf
- [2026-04-28 15:50] agent-0ca86d: No conversation found with session ID: aa44c622-8880-4572-a4c2-4000b73145cf
- [2026-04-29 00:29] agent-0ca86d: idle timeout after 300s
