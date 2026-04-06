# CLAUDE.md — company-hq 백엔드
> 이 파일은 company-hq/server/ 디렉토리 전용 규칙이다.
> 백엔드팀이 이 영역을 수정할 때 자동 로드된다.
> 상위 CLAUDE.md(CPO 헌법)와 함께 적용된다.

---

## 역할

너는 company-hq의 **백엔드 담당**이다.
`server/` 디렉토리의 모든 API, WebSocket, Claude Runner를 관리한다.

---

## 기술 스택

| 기술 | 버전 | 용도 |
|------|------|------|
| Python | 3.14.3 | 서버 런타임 |
| FastAPI | 0.115.0 | REST API + WebSocket |
| uvicorn | 0.30.0 | ASGI 서버 (포트 8000) |
| websockets | 13.0 | 실시간 채팅 |
| PyGithub | 2.4.0 | GitHub 레포 관리 |
| GitPython | 3.1.43 | 프로젝트 스캔 |
| fastmcp | 3.1.1+ | MCP 서버 통합 |
| Claude Code CLI | 최신 | 에이전트 실행 |

---

## 파일 구조

```
server/
├── main.py               ← FastAPI 메인 (모든 엔드포인트)
├── ws_handler.py          ← WebSocket 채팅 처리 + 취소 로직
├── claude_runner.py       ← Claude CLI 실행 + 세션/토큰/예산 관리
├── github_manager.py      ← GitHub 레포 생성 + CLAUDE.md 자동 생성
├── project_scanner.py     ← 팀 현황 스캔 (커밋, 버전)
├── system_monitor.py      ← CPU/메모리/디스크/네트워크 모니터링
├── auth.py                ← 인증 (오너 로그인, 초대코드)
├── push_notifications.py  ← 웹 푸시 알림 (VAPID)
├── task_queue.py          ← 팀별 작업 큐 + 파이프라인 + 디바운서
├── ttyd_manager.py        ← 팀별 웹터미널 세션 관리
├── mcp_server.py          ← MCP 서버 통합
├── notion_reader.py       ← Notion 페이지 추출
├── teams.json             ← 팀 목록 (source of truth)
├── team_sessions.json     ← 세션 ID 영속 저장
├── team_prompts.json      ← 시스템 프롬프트 저장
├── floor_layout.json      ← 게임 층 배치
├── chat_history/          ← 팀별 채팅 히스토리
├── logs/                  ← 서버 로그
└── .env                   ← 환경변수 (⚠️ 절대 커밋/노출 금지)
```

---

## 코딩 규칙

### 필수
- FastAPI + Pydantic 타입 힌트
- 모든 함수에 타입 어노테이션
- API 응답 형식 통일: `{"ok": bool, ...data, "error": str?}`
- 에러 처리: try/except + logger 기록
- 비동기(async) 우선

### 금지
- `print()` 사용 → `logger.info/warning/error` 사용
- .env 내용 로그/채팅/커밋에 노출
- 동기 I/O로 이벤트 루프 블로킹
- SQL 인젝션 가능한 문자열 포매팅

### 데이터 저장 전략
- 100개 이하 → JSON 파일 (teams.json, sessions 등)
- 100~10만 → SQLite
- 그 이상 → PostgreSQL (현재 불필요)

---

## 핵심 모듈 가이드

### claude_runner.py
- `run_claude()`: 팀별 Claude CLI 실행 (세션 유지, 모델 배정)
- `--resume {session_id}`: 세션 영속
- `--dangerously-skip-permissions`: 도구 전체 사용
- 토큰 예산: 수동 대화 무제한, 자동 실행만 제한 (1M/시간)
- 스파이크 감지: 자동 실행만 적용 (500K/10분)

### ws_handler.py
- WebSocket 연결 → `run_claude()` 스트리밍
- 취소: `action: "cancel"` → SIGTERM → SIGKILL (프로세스 그룹)
- 히스토리: `chat_history/{team_id}.json` 자동 저장

### main.py 엔드포인트 수정 규칙
- 새 엔드포인트 추가 시 `shared/api_spec.md`에 반드시 기록
- 기존 엔드포인트 변경 시 프론트팀에 알림 (api_spec.md 업데이트)
- 서버실(server-monitor), CPO(cpo-claude)는 게임 캐릭터 생성에서 제외 필터 유지

---

## 서버 실행

```bash
cd ~/Developer/my-company/company-hq/server
source venv/bin/activate
python main.py
# → uvicorn 포트 8000, reload 모드
```

---

## 검증 체크리스트 (커밋 전 필수)

```bash
# 1. import 테스트
cd ~/Developer/my-company/company-hq/server
source venv/bin/activate
python3 -c "import main; print('OK')"

# 2. 수정한 엔드포인트 curl 테스트
curl -s http://localhost:8000/api/{endpoint} | python3 -m json.tool

# 3. WebSocket 동작 확인 (채팅 수정 시)
# 웹에서 팀 클릭 → 메시지 전송 → 응답 확인
```

- [ ] `python3 -c "import main"` 성공
- [ ] 수정한 엔드포인트 curl 응답 정상
- [ ] WebSocket 채팅 동작 확인 (ws_handler 수정 시)
- [ ] 로그에 에러 없음 (`logs/company-hq.log`)
- [ ] .env 내용 노출 없음

---

## 팀 간 협업

| 대상 | 참조 파일 | 프로토콜 |
|------|----------|---------|
| 프론트팀 | `shared/api_spec.md` | 엔드포인트 추가/변경 시 스펙 업데이트 필수 |
| 프론트팀 | `shared/api_requests.md` | 프론트 요청 확인 후 구현 |
| CPO | 상위 `CLAUDE.md` | 전체 정책 준수 |

---

## 중요 필터 규칙 (재발 방지)

게임 캐릭터 생성에서 제외해야 하는 ID:
- `cpo-claude` — CPO는 게임에서 별도 렌더링
- `server-monitor` — 서버실은 모니터 그래픽만

이 필터는 아래 위치에 적용되어야 함:
1. `/api/layout/floors` 응답에서 제외
2. `floor_layout.json`에 포함하지 않음
3. 프론트 `ALL_FLOORS` 하드코딩에 포함하지 않음

새 "특수 팀"(캐릭터 없는 팀) 추가 시 세 곳 모두 필터해야 함.
