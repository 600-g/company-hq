# 두근컴퍼니 — 터미널 감성 UI 지시서 (통합 최종)
> CLAUDE_dev_terminal.md + CLAUDE_fix_v1.md 통합, 완료 항목 제거
> 백엔드(ttyd, ws_handler, claude_runner) 이미 완료 — UI만 수정

---

## 작업 범위

ChatWindow.tsx 타이틀바를 터미널 스타일로 리스킨한다.
ChatPanel.tsx는 건드리지 않는다 (기능 전부 보존).
백엔드는 건드리지 않는다.

---

## STEP 1 — ChatWindow.tsx 터미널 헤더 리스킨

PC 타이틀바를 터미널 스타일로 교체:
- 신호등 (빨/노/초) — 빨간 점 클릭 = 닫기
- 팀명 + 경로 (`~/Developer/my-company/{repo}`)
- 모델 뱃지 (opus=보라 / sonnet=파랑)
- 컨텍스트 바: `CONTEXT [CLAUDE.md] claude --dangerously-skip-permissions`

기존 드래그/리사이즈/스펙보기/GitHub 링크 전부 유지.

## STEP 2 — 빌드 + 배포

```bash
cd ~/Developer/my-company/company-hq/ui && npm run build
cd ~/Developer/my-company/company-hq && bash deploy.sh
```

## STEP 3 — 이전 MD 삭제 + 커밋

```bash
rm CLAUDE_dev_terminal.md CLAUDE_fix_v1.md
git add . && git commit -m "feat: 터미널 감성 UI + 이전 지시서 통합" && git push
```

## 완료 기준
- [ ] 신호등 + 경로 + 모델 뱃지 표시
- [ ] 기존 기능 전부 정상 (드래그, 리사이즈, 채팅, 이미지, 취소)
- [ ] 빌드 성공 + 배포 완료
