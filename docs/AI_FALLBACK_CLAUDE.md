# AI 폴백 시스템 — CLAUDE.md

## 역할 정의

너는 두근컴퍼니의 AI 모델 폴백 시스템을 구축하는 자동화 전문 개발자다.
Claude Max 한도 초과 시 Ollama(Gemma4) 로컬 모델로 자동 전환되는 구조를 구현한다.
이 시스템은 Claude Code, 텔레그램 봇, OpenClaw 세 곳에 모두 적용된다.

---

## 시스템 구조

```
요청 들어옴
    ↓
Claude Max 사용 가능? → YES → Claude 처리
    ↓ NO (한도 초과 또는 실패)
Ollama Gemma4:e4b 로컬 실행 (완전 무료)
    ↓ Ollama 미실행 시
ollama serve 자동 실행 후 재시도
    ↓ 실패 시
텔레그램으로 오류 알림 발송
```

---

## 환경 정보

- **Mac Mini**: Apple M4, 24GB RAM, 17.8GB VRAM
- **Ollama 버전**: 0.21.0 (설치 완료)
- **로컬 모델**: gemma4:e4b (다운로드 완료 후 사용)
- **OpenClaw**: 설치 완료, Ollama 연결 필요
- **텔레그램 봇**: 기존 Python 봇 연동

---

## Phase 1: 폴백 코어 모듈 구축

### 작업 목표
`~/my-company/automation/ai_fallback/` 폴더에 폴백 시스템 구축

### 파일 구조
```
automation/
└── ai_fallback/
    ├── fallback_manager.py   ← 핵심 폴백 로직
    ├── claude_client.py      ← Claude API 래퍼
    ├── ollama_client.py      ← Ollama 래퍼
    ├── usage_tracker.py      ← 사용량 추적
    └── config.json           ← 설정 파일
```

### 구현 순서
1. `usage_tracker.py` 먼저 작성 (사용량 카운팅)
2. `ollama_client.py` 작성 (로컬 모델 연결)
3. `claude_client.py` 작성 (Claude API 래퍼)
4. `fallback_manager.py` 작성 (두 클라이언트 통합)
5. 테스트 후 텔레그램 봇에 연동

---

## Phase 2: 사용량 추적기

### usage_tracker.py 스펙
```python
# 기능
# - 월별 요청 횟수 카운팅 (JSON 파일로 저장)
# - 경고 임계값: 80% 도달 시 WARNING 반환
# - 초과 임계값: 100% 도달 시 EXCEEDED 반환
# - 월 바뀌면 자동 리셋
# - 저장 경로: ~/.claude_usage.json

# 반환값
# "OK"      → 정상 사용 가능
# "WARNING" → 80% 도달, 텔레그램 경고 발송
# "EXCEEDED"→ 한도 초과, 폴백 발동
```

---

## Phase 3: Ollama 클라이언트

### ollama_client.py 스펙
```python
# 기능
# - Ollama 서버 실행 여부 확인
# - 미실행 시 subprocess로 ollama serve 자동 실행
# - gemma4:e4b 모델로 요청 처리
# - 엔드포인트: http://localhost:11434/api/chat
# - 타임아웃: 60초

# 모델 설정
# model = "gemma4:e4b"
# 한국어 응답 가능
# 이미지 입력도 지원 (멀티모달)
```

---

## Phase 4: 폴백 매니저

### fallback_manager.py 스펙
```python
# 메인 함수: ask(prompt, context=None)
# 
# 로직:
# 1. usage_tracker.check() 호출
# 2. OK/WARNING → Claude로 처리 (WARNING이면 텔레그램 경고도 발송)
# 3. EXCEEDED → Ollama로 처리 + 텔레그램 전환 알림
# 4. Ollama 실패 → 텔레그램 오류 알림 + 에러 반환
#
# 텔레그램 알림 메시지:
# WARNING:  "⚠️ Claude 사용량 80% 도달. 곧 Gemma로 전환됩니다."
# EXCEEDED: "🔄 Claude 한도 초과 → Gemma4로 전환됨"
# ERROR:    "❌ AI 시스템 오류. 수동 확인 필요."
```

---

## Phase 5: OpenClaw 연결

### 작업 목표
OpenClaw가 Claude API 대신 Ollama를 기본으로 사용하도록 설정

### 실행 명령어
```bash
# OpenClaw 설정에서 Ollama 연결
openclaw config set model ollama/gemma4:e4b
openclaw config set ollama_url http://localhost:11434

# 설정 확인
openclaw config show
```

### OpenClaw용 스킬 파일 생성
```
~/.openclaw/workspace/skills/use_ollama.md
```
내용: Ollama 로컬 모델 사용 규칙 및 폴백 정책

---

## Phase 6: 텔레그램 봇 연동

### 작업 목표
기존 텔레그램 봇의 AI 호출 부분을 fallback_manager로 교체

### 수정 대상
```python
# 기존 코드 (직접 Claude API 호출)
response = anthropic.messages.create(...)

# 변경 후 (폴백 매니저 통해서)
from ai_fallback.fallback_manager import ask
response = ask(user_message)
```

---

## 에러 대응 (자가수정 루프)

1. 코드 작성 후 `python3 -m pytest` 실행
2. 에러 발생 시 에러 메시지 읽고 수정
3. Ollama 연결 실패 시 → `ollama serve` 실행 여부 확인
4. 3회 실패 시 → 접근 방식 변경 후 재시도
5. 해결 불가 시 → 텔레그램으로 오류 내용 발송

---

## 비용 원칙

- **Ollama(Gemma4)**: 완전 무료, 로컬 실행
- **Claude API 직접 호출 금지**: 반드시 fallback_manager 통해서만
- **유료 서비스 추가 금지**: 사전 고지 없이 유료 옵션 사용 안 함

---

## Git 규칙

파일을 생성하거나 수정한 후 반드시 실행한다:

```bash
git add .
git commit -m "작업 내용 요약"
git push
```

커밋 메시지는 한글로, 무엇을 했는지 명확하게 쓴다.

---

## 작업 시작 명령어

Claude Code에서 이 파일을 읽은 후 아래 순서로 실행:

```
1. ~/my-company/automation/ai_fallback/ 폴더 생성
2. Phase 2부터 순서대로 구현
3. 각 파일 완성 후 단위 테스트
4. 전체 완성 후 텔레그램 봇 연동
5. Git 커밋 및 푸시
```
