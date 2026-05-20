# 🧠 두근 스킬 수집 에이전트 — Claude Code 프로젝트 설계서

## 프로젝트 개요

링크를 입력하면 자동으로 스크래핑 → AI 분석 → 노션 DB 등록까지 처리하는 웹 에이전트.
iPhone/PC 어디서든 `skill.{도메인}.com`으로 접속해서 사용.

## 기술 스택

```
Python 3.11+
├── Flask (웹 서버)
├── Playwright (스크래핑 — JS 렌더링 지원)
├── yt-dlp (유튜브 자막/메타 추출)
├── Google Gemini API (무료 티어 — 분석/분류/등급)
├── Notion API (DB 등록)
└── Cloudflare Tunnel (외부 접속)
```

## 디렉토리 구조

```
skill-agent/
├── CLAUDE.md              # Claude Code용 컨텍스트
├── app.py                 # Flask 메인 서버
├── requirements.txt
├── .env                   # API 키 (gitignore)
├── scraper/
│   ├── __init__.py
│   ├── router.py          # URL 판별 → 적절한 스크래퍼 호출
│   ├── web.py             # Playwright 범용 스크래퍼
│   ├── youtube.py         # yt-dlp 유튜브 전용
│   ├── tiktok.py          # 틱톡 캡션/해시태그
│   └── instagram.py       # 인스타 캡션/해시태그
├── analyzer/
│   ├── __init__.py
│   ├── gemini.py          # Gemini API 호출
│   └── prompt.py          # 분석 프롬프트 (스킬수집기_v3 기반)
├── notion_client/
│   ├── __init__.py
│   ├── register.py        # DB 페이지 생성
│   ├── duplicate_check.py # 중복 체크
│   └── hub_update.py      # 허브 페이지 카테고리 링크 추가
├── templates/
│   └── index.html          # 웹 UI
└── static/
    └── style.css
```

## CLAUDE.md (Claude Code가 읽을 파일)

```markdown
# 두근 스킬 수집 에이전트

## 이 프로젝트가 뭔지
링크 → 스크래핑 → AI 분석 → 노션 DB 등록을 자동화하는 웹 에이전트.
Mac Mini M4에서 상시 가동, Cloudflare Tunnel로 외부 접속.

## 핵심 흐름
1. 유저가 URL 입력 (웹 UI 또는 iOS 단축어)
2. URL 종류 자동 판별 (scraper/router.py)
   - youtube.com → yt-dlp로 자막+설명 추출
   - tiktok.com → Playwright로 캡션+해시태그
   - instagram.com → Playwright로 캡션+해시태그
   - notion.site → Playwright (JS 렌더링 필수)
   - 기타 웹 → Playwright 범용
3. 추출된 텍스트 → Gemini API로 분석
   - 카테고리 분류 (8종)
   - 등급 판정 (S/A/B/C)
   - 핵심요약, 적용메모, 적용대상 등
4. Notion API로 스킬 마스터 DB에 페이지 생성
5. 허브 페이지(📒 AI 스킬 수집소)에 카테고리별 링크 추가

## 환경 변수 (.env)
GEMINI_API_KEY=xxx
NOTION_API_KEY=xxx
NOTION_DB_ID=490d8ced-a27b-40a7-b9bb-bd03549ebbc6
NOTION_HUB_PAGE_ID=35d14362-1b4b-81bd-99e5-ecea5910644a
FLASK_PORT=5000

## 노션 DB 속성 (등록 시 필수)
- 스킬명: title (핵심을 담은 짧은 제목)
- 카테고리: select → 프롬프트 / 에이전트·자동화 / 영상·콘텐츠 / 디자인·이미지 / 코딩·개발 / 업무효율 / 마케팅·SNS / 기타
- 등급: select → S-즉시적용 / A-참고가치 / B-나중에 / C-스킵
- 적용대상: multi_select → 두근펫 / 매매봇 / 검은별 / 클로드코드 / AI900 / 첼시인스타 / 이모티콘 / 공통
- 상태: select → 신규
- 출처유형: select → 노션 / 웹 / 유튜브 / GitHub / 기타
- 출처URL: url
- 핵심요약: rich_text (2~3줄)
- 적용메모: rich_text
- 수집일: date (오늘)
- AI도구: multi_select
- 태그: multi_select
- 난이도: select

## 페이지 본문 구조 (마크다운)
## 핵심 요약
3줄 이내.

## 상세 내용
원본에서 핵심만. 프롬프트는 복붙 가능하게.

## 적용 방법
1, 2, 3 단계별. 유료 필요하면 💰, 무료 대안 ✅.

## 💡 아이디어 & 활용
두근 환경에서 현실적 활용 제안.

## 출처
원본 링크 + 저자.

## 등급 기준
- S: 지금 바로 쓸 수 있음. 무료 도구로 실행 가능.
- A: 바로는 아니지만 가까운 미래에 활용 가능.
- B: 현재 직접 관련 없지만 미래에 쓸 수 있음.
- C: 품질 낮거나 활용 불가. DB 등록 안 함.

## 두근의 환경 (분석 시 참고)
- 유료: Claude Max
- 무료: Gemini, ChatGPT, Gemma4(로컬), Bing Image Creator, Leonardo AI, CapCut, Canva
- 장비: Mac Mini M4, iPhone
- 코딩: 초보 (Python 기초, Claude Code)
- 강점: CX 운영 11년, 기획력, AI 빠른 습득

## 적용 대상 판단 기준
- 클로드코드: CLAUDE.md, 프롬프트, MCP, CLI
- 두근펫: Electron, 데스크톱 앱
- 매매봇: 트레이딩, API, 자동매매
- 검은별: 게임 기획, RPG
- AI900: Azure AI, 자격증
- 첼시인스타: 인스타, 콘텐츠, 릴스
- 이모티콘: 이모티콘, 캐릭터 디자인
- 공통: 범용 스킬

## 코딩 규칙
- 한국어 주석
- 에러 처리 꼼꼼히 (스크래핑 실패 → 로그 + 유저에게 알림)
- .env로 API 키 관리
- C-스킵 등급은 DB 등록 안 함, 사유만 반환
- 여러 스킬이 한 문서에 있으면 카테고리별 팩으로 묶기

## 실행 방법
pip install -r requirements.txt
playwright install chromium
python app.py
```

## 구현 세부 사항

### 1. scraper/router.py — URL 판별 로직
```python
from urllib.parse import urlparse

def detect_source(url: str) -> str:
    """URL을 보고 적절한 스크래퍼 타입 반환"""
    domain = urlparse(url).netloc.lower()
    
    if 'youtube.com' in domain or 'youtu.be' in domain:
        return 'youtube'
    elif 'tiktok.com' in domain:
        return 'tiktok'
    elif 'instagram.com' in domain:
        return 'instagram'
    elif 'notion.site' in domain or 'notion.so' in domain:
        return 'notion_external'
    elif 'github.com' in domain:
        return 'github'
    else:
        return 'web'
```

### 2. analyzer/prompt.py — Gemini 분석 프롬프트
스킬수집기_v3.md의 핵심을 시스템 프롬프트로 변환.
JSON 포맷으로 응답받아 구조화된 데이터로 파싱.

```python
ANALYSIS_PROMPT = """
너는 두근컴퍼니의 AI 스킬 분석기다.

주어진 텍스트에서 AI 스킬을 추출하고 아래 JSON 형식으로 응답해.
광고/홍보는 제거하고 핵심 스킬만 추출해.

{
  "skill_name": "핵심을 담은 짧은 제목",
  "category": "8종 중 택1",
  "grade": "S/A/B/C 중 택1",
  "grade_reason": "등급 판정 사유",
  "targets": ["적용대상 배열"],
  "summary": "2~3줄 핵심요약",
  "memo": "적용메모",
  "source_type": "출처유형",
  "ai_tools": ["관련 AI 도구"],
  "tags": ["태그"],
  "difficulty": "초급/중급/고급",
  "body_content": "페이지 본문 (마크다운)"
}

[두근의 환경 정보 포함]
[등급 기준 포함]
"""
```

### 3. notion_client/register.py — 노션 등록
Notion API (notion-client 파이썬 패키지) 사용.
페이지 생성 + 허브 페이지 업데이트.

### 4. 웹 UI (templates/index.html)
- URL 입력칸 + 수집 버튼
- 카테고리/대상/등급 수동 오버라이드 (선택)
- 실시간 처리 상태 표시 (SSE 또는 폴링)
- 최근 수집 목록
- 노션 연결 상태 표시

### 5. iOS 단축어 연동
```
단축어 구성:
1. "공유 시트"에서 URL 받기
2. HTTP POST → https://skill.{도메인}.com/api/collect
   Body: {"url": "받은 URL"}
3. 응답 알림 표시
```

## 배포 순서

### Phase 1: 로컬 테스트 (30분)
```bash
cd skill-agent
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
playwright install chromium
cp .env.example .env  # API 키 입력
python app.py
# http://localhost:5000 에서 테스트
```

### Phase 2: Cloudflare Tunnel (10분)
```bash
brew install cloudflare/cloudflare/cloudflared
cloudflared tunnel login
cloudflared tunnel create skill-agent
cloudflared tunnel route dns skill-agent skill.{도메인}.com
cloudflared tunnel run --url http://localhost:5000 skill-agent
```

### Phase 3: 상시 가동 (10분)
```bash
# launchd로 자동 시작 등록
# ~/Library/LaunchAgents/com.dugeun.skill-agent.plist
```

## API 엔드포인트

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | / | 웹 UI |
| POST | /api/collect | URL 수집 요청 |
| GET | /api/status/{job_id} | 처리 상태 조회 |
| GET | /api/recent | 최근 수집 목록 |
| GET | /api/stats | DB 통계 (등급별/카테고리별) |

## 확장 계획 (2단계)

콘텐츠 마케팅 모드 추가:
- /api/collect에 mode 파라미터 (skill / content)
- 콘텐츠 마케팅용 별도 DB + 분석 프롬프트
- 틱톡/릴스 트렌드 분석 강화
- 경쟁사 콘텐츠 벤치마킹

## 비용

| 항목 | 비용 |
|------|------|
| Gemini API | 무료 (일 1,500회) |
| Notion API | 무료 |
| Playwright | 무료 |
| Cloudflare Tunnel | 무료 |
| yt-dlp | 무료 |
| **합계** | **월 0원** |
