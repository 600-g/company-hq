# SESSION_STATE — 두근컴퍼니 자가개선

> 세션 크래시 대비 체크포인트. 새 세션 시작 시 이 파일을 먼저 읽을 것.

## 마지막 세션 (2026-04-13 ~16:33 KST)
- **크래시 원인**: `An image in the conversation exceeds the dimension limit for many-image requests (2000px)` — 스크린샷 반복 첨부로 many-image 제한 초과.
- **로그**: `~/.claude/projects/-Users-600mac/58609f8c-7939-49ad-b27d-1f6cdc288f21.jsonl`
- **모드**: 소크라테스 자가개선 ("못하면 잘린다" 압박 모드)

## 직전 작업 맥락
- **대상**: `ui/app/game/LoginScene.ts` — 타이쿤 사무실 외부 마을(시티뷰)
- **최근 커밋**: `7f2310e3 feat: 마을 품질 개선 - 타일 기반 공원/HGSS 간판/HQ 부각`
- **uncommitted**: `LoginScene.ts` (+20/-18), 새 에셋 `ui/public/assets/original/tiles/fountain.png`
- **사용자 피드백 (가장 최근)**:
  1. "스스로 봤을때 잘만든거같아?" — 자가평가 요청
  2. "못하면 잘린다 개념 넣고 빡세게, 자가개선 소크라테스 모드"
  3. **"에셋 활용안하면 이전 건물보다 저퀄리티 (시티 느낌 없음)"** ← 크래시 직전 마지막 피드백

## 다음 할 일 (추정)
- 기존 에셋(`ui/public/assets/original/tiles/`, Pixel Agents, HGSS 타일셋) 활용해서 **시티 느낌** 강화
- fountain.png 가 uncommitted — 공원 분수 배치 작업이 중간 상태일 가능성
- 자가평가 → 소크라테스 토론 → 수정 루프 재개

## 재개 절차
```bash
cd ~/Developer/my-company/company-hq
git diff ui/app/game/LoginScene.ts   # uncommitted 변경 확인
ls ui/public/assets/original/tiles/  # 가용 에셋 확인
```

## 크래시 방지 규칙
- 스크린샷 3회 이상 반복 시 "diff만 말씀해 주세요" 요청
- 마일스톤마다 `git commit` (wip: 프리픽스 OK)
- 200k 토큰 감 오면 이 파일 업데이트 후 `/compact` 권장
