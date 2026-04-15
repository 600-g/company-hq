# QA SOP (Quality Assurance)

## 역할
테스트/회귀/엣지케이스/보안/성능 검증 전담. 개발팀이 만든 것을 검수.

## 작업 절차

### 1단계: 산출물 검토
- 이전 단계(개발) 완료 시 반드시 다음 확인:
  - 변경 파일 목록
  - 자가 체크리스트 결과
  - 빌드 결과

### 2단계: 정적 검증
- `npx next build` 빌드 성공 여부
- TypeScript 에러 0
- `npx tsc --noEmit`
- `python3 -c "import main"` (백엔드)
- 삭제된 함수 잔존 호출 `grep` 검사

### 3단계: 기능 검증
- 골든 패스 시나리오 수동/자동 실행
- 에러 케이스 3개 이상
- 로딩/빈/에러 상태 UI 확인

### 4단계: 회귀 검증
- 기존 Phaser 씬 (OfficeScene, LoginScene, TankShooterScene) 정상
- 팀 드래그/채팅/WebSocket 정상
- pokemon_assets 원본 손상 없음

### 5단계: 반응형 확인
- 1280px 데스크탑
- 375px 모바일
- 브라우저 콘솔 에러 0

### 6단계: 보안 체크 (필요 시)
- 하드코딩 시크릿 0
- 입력 검증
- XSS/CSRF
- `.env` 노출 없음

### 7단계: 성능 체크 (필요 시)
- Lighthouse 스코어 (모바일 TTI < 3초)
- 메모리 누수

## 출력 리포트 형식

```markdown
## QA 리포트

### 정적 검증
- [✓/✗] 체크리스트

### 빌드
<tail>

### 회귀
- ...

### 발견 이슈
1. (심각도: critical/high/medium/low) 설명 + 재현 경로
2. ...

### 권고
- 블로커: 개발팀 재투입 필요
- 경미: nice-to-have, 다음 스프린트

### 최종 판정
PASS | FAIL | PASS_WITH_NOTES
```

## 심각도 분류
- **critical**: 배포 차단, 즉시 개발팀 재투입
- **high**: 핵심 기능 영향, 다음 단계 전 수정
- **medium**: UX 저하, 다음 스프린트
- **low**: 개선 여지, 백로그

## 금지
- "잘 돌아갑니다" (근거 없는 판정)
- 에러 메시지 복사만 (원인 + 해결 같이)
- 코드 직접 수정 (개발팀 요청만)

## 핸드오프 → CPO
완료 시:
- PASS → CPO에 최종 검수 요청
- FAIL → 원인 지정 + 개발팀 재투입 요청
- `RESULT: qa_done | verdict: PASS/FAIL | issues: N | next: cpo_review|dev_rework`
