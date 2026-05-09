# 에이전트 전수 감사 + 사이트 분리 후보 (2026-05-09)

## 📊 13개 에이전트 분류

### 🛠 system (5개) — 내부 컨트롤 플레인 / 분리 불가

| 이모지 | 이름 | id | 역할 | 비고 |
|---|---|---|---|---|
| 🧠 | CPO | `cpo-claude` | 총괄 디스패치·결정 | company-hq 자체 |
| 📊 | 두근컴퍼니 관리자 | `hq-ops` | 운영·1차 패치·정책 | company-hq 자체 |
| 🤖 | MD 메이커 | `agent-6d883e` | 신규 에이전트 채용/MD | light, sandbox |
| 🧑‍💼 | 스태프 | `staff` | 무료 LLM 라우터 (즉답/escalate) | company-hq 자체 |
| 🖥 | 서버실 | `server-monitor` | 시스템 헬스·복구 | company-hq 자체 |

→ **분리 X** — 두근컴퍼니 운영 자체. 외부 노출 안 됨.

### 💻 dev (5개) — 내부 개발 협업

| 이모지 | 이름 | id | 역할 | 현재 repo | 외부 사이트? |
|---|---|---|---|---|---|
| 🖼 | 프론트엔드 | `frontend-team` | UI 구현 | `frontend-team` | ❌ 도구 |
| ⚙️ | 백엔드 | `backend-team` | API/DB | `backend-team` | ❌ 도구 |
| 🎨 | 디자인팀 | `design-team` | 시안/에셋 | `design-team` | ❌ 도구 |
| 🔍 | QA | `qa-agent` | 테스트/검증 | company-hq | ❌ 도구 |
| 🔬 | 콘텐츠랩 | `content-lab` | 콘텐츠 작성 | `content-lab` | ❌ 도구 |

→ **분리 X** — 다른 product 에이전트의 작업을 돕는 협업 도구. 자기 사이트 없음.

### 🚀 product (3개) — 외부 사용자 대상 / 분리 대상

| 이모지 | 이름 | id | 외부 사이트 | 호스팅 | 상태 |
|---|---|---|---|---|---|
| 🗺️ | 데이트지도 | `date-map` | https://600-g.github.io/date-map/ | GH Pages | ✅ **이미 분리** |
| 📚 | AI900 → exam-hub | `ai900` | https://600-g.github.io/exam-hub/ | GH Pages | ✅ **이미 분리** |
| 🤖 | 마케팅디자이너 | `agent-a90ce6` | 없음 (light, sandbox) | — | ⚠️ 미정 |

### ❓ 누락 / 별도 운영

| 이름 | 상태 |
|---|---|
| 코인봇 (`~/coinbot/`) | teams.json 미등록, launchd로 별도 운영. 대시보드는 `600-g/upbit-auto-trading-bot` GH Pages |
| 주식자동봇 (`~/Desktop/주식 자동봇/`) | 미등록 |

→ trading 영역은 **이미 분리되어 있고** company-hq 와 완전 독립 운영 중. 두근컴퍼니에서 채팅 채널만 추가하면 OK.

## 🎯 분리 패턴 매트릭스

| 분리 단계 | 정의 | 예 | 비용 |
|---|---|---|---|
| **🔴 미분리** | company-hq 백엔드에 강결합 | system / dev 5+5개 | n/a |
| **🟡 코드 분리** | 자체 GitHub repo 있음 | frontend-team / backend-team | 호스팅 X |
| **🟢 호스팅 분리** | 자체 도메인+호스팅 | date-map / exam-hub | **무료** |
| **🟢🟢 완전 독립** | 자체 백엔드까지 | coinbot (launchd) | **무료** |

## 📋 분리 우선순위 (작업 가치 ↓)

### 🥇 1순위 — 이미 됨 (확인만)
- ✅ **date-map** — 이미 GH Pages 분리. 작업 X
- ✅ **ai900 → exam-hub** — 이미 GH Pages 분리. 작업 X

### 🥈 2순위 — 채팅 채널만 추가
- 🟡 **coinbot/주식봇** — 코드는 분리됨, 두근컴퍼니에서 "🤖 트레이딩봇" 에이전트 1개 등록만 (status 모니터링 + 채팅 입구)
- 작업: `teams.json` 에 trading-bot 추가 (light) + status 폴링 어댑터 (이미 `/api/trading-bot/status` 있음)
- 효과: 사용자가 두근컴퍼니에서 트레이딩봇과 대화 가능

### 🥉 3순위 — 추후
- agent-a90ce6 (마케팅디자이너): 산출물(광고/이미지/배너)을 어디 호스팅할지 결정. 일단 sandbox 유지.

### ❌ 분리 불가
- system 5개 (CPO/hq-ops/MD메이커/스태프/서버실)
- dev 5개 (프론트/백엔드/디자인/QA/콘텐츠) — 이건 도구이지 제품이 아님

## 🏗 표준 구조 (분리된 product 에이전트 기준)

```
두근컴퍼니 (Mac mini, 내부)
├── 에이전트 페르소나 (TEAMS 등록)
├── 시스템 프롬프트 (server/team_prompts.json)
├── 채팅 (사용자 ↔ 에이전트)
└── 코드 작성/커밋 (Claude Code CLI → 자기 repo)

해당 product 사이트 (외부 호스팅, 독립)
├── 자체 GitHub repo (600-g/{name})
├── 자체 호스팅 (GH Pages or CF Pages)
├── 자체 도메인 (subdomain.600g.net or github.io path)
├── 자체 DB (있으면 Firebase/Supabase/CF D1)
└── 두근컴퍼니 죽어도 정상 작동
```

## 📝 권장 액션

1. **즉시**: trading-bot light 에이전트 등록 (10분 작업)
2. **이번 주**: agent 카드에 외부사이트 링크 칩 추가 (이미 ai900에 🔗 있음, 패턴 확장)
3. **다음 주**: 신규 에이전트 생성 폼에 "호스팅 옵션" 드롭다운 (GH Pages / 두근컴퍼니 내부) 추가
4. **장기**: 마케팅디자이너 산출물 호스팅 결정

## 📊 종합

- **외부 노출 사이트**: 2개 이미 분리 (date-map, exam-hub) + 1개 별도 운영 (coinbot)
- **분리 비율**: product 3개 중 2개 (66%) 이미 외부 호스팅, 1개 sandbox
- **추가 분리 필요한 product**: 사실상 없음 — 패턴은 이미 정착됨
- **고도화 포인트**: 신규 에이전트 만들 때 자동으로 "외부 호스팅 선택지" 제공 → 패턴 자동 확산
