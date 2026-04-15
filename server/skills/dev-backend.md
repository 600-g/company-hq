# 백엔드 개발 SOP (Python + FastAPI)

## 역할
FastAPI / WebSocket / Python API / DB / Claude Runner 전담.

## 전제 확인

### 1단계: 프로젝트 구조 파악
- `server/CLAUDE.md` 읽기
- 기술 스택: Python 3.14.3 / FastAPI 0.115 / uvicorn / websockets
- 주요 파일: `main.py`, `claude_runner.py`, `ws_handler.py`, `github_manager.py`

### 2단계: 규칙 확인
- 모든 함수 타입 힌트
- async 우선
- API 응답 형식: `{"ok": bool, ...data, "error": str?}`
- 로깅은 `logger.info/warning/error` (print 금지)

## 구현 규칙

### 엔드포인트 추가
- 새 엔드포인트 추가 시 `shared/api_spec.md` 업데이트 필수
- Pydantic 모델로 request/response 정의
- 에러는 try/except + logger

### 데이터 저장
- 100개 이하 → JSON 파일 (`teams.json`, `team_sessions.json` 등)
- 100~10만 → SQLite
- 그 이상 → PostgreSQL (현재 불필요)

### WebSocket
- `ws_handler.py` 패턴 따르기
- 취소: `action: "cancel"` → SIGTERM → SIGKILL
- 히스토리: `chat_history/{team_id}.json` 자동 저장

### Claude Runner
- `run_claude()` 사용 (세션 유지)
- `is_auto=True` 시 예산 체크 (1M/시간)
- Max 플랜 경로 (Claude CLI) 우선, API 키는 non-owner만

### 에러 자가학습
- 에러 발생 시 `lessons.md` 자동 기록 (이미 claude_runner.py 구현됨)

## 검증

```bash
cd ~/Developer/my-company/company-hq/server
source venv/bin/activate
python3 -c "import main; print('OK')"

# 수정한 엔드포인트
curl -s http://localhost:8000/api/<endpoint> | python3 -m json.tool
```

- [ ] `import main` 성공
- [ ] 엔드포인트 curl 응답 정상
- [ ] 로그 에러 없음 (`logs/company-hq.log`)
- [ ] `shared/api_spec.md` 업데이트 (신규 엔드포인트 시)
- [ ] `.env` 내용 노출 없음

## 재시작

```bash
launchctl kickstart -k gui/$(id -u)/com.company-hq-server
```

## 핸드오프 → QA
완료 시 다음 산출:
- 변경 파일 목록
- 신규/수정 엔드포인트 curl 예시
- `shared/api_spec.md` diff
- `RESULT: done | endpoints: [...] | next: qa`
