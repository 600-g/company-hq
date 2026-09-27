# company-hq 플랫폼 상세 노트

> 2026-09-27 `~/CLAUDE.md` 에서 원문 그대로 옮김 (홈 CLAUDE.md 가 매 세션·모든 `claude -p` 에 실려 48KB → 슬림화). 멀티유저 베타·Showcase·앱 배포·운영 함정의 단일 위치.

### company-hq (두근컴퍼니 — aimaker.600g.net)

```bash
# Production deploy (doogeun-hq → aimaker.600g.net)
cd ~/Developer/my-company/company-hq && bash deploy.sh

# Legacy ui/ deploy (별도 CF Pages 프로젝트, 평소 안 씀)
cd ~/Developer/my-company/company-hq && bash deploy-legacy-ui.sh

# Local dev frontend
cd ~/Developer/my-company/company-hq/doogeun-hq && npm run dev

# Backend reload — ★ launchd 서비스는 --reload 없이 뜬다 (scripts/hq_server_start.sh). 코드 수정 후 반드시 실행
#   (`python main.py` 개발 실행만 reload 모드. 2026-09-15 ps 로 확인)
launchctl kickstart -k "gui/$(id -u)/com.company-hq-server"

# Backend import sanity check
cd ~/Developer/my-company/company-hq/server && source venv/bin/activate && python3 -c "import main; print('OK')"

# Backend health
curl -s http://localhost:8000/api/teams | head -c 200
curl -s https://api.600g.net/api/teams | head -c 200    # CF Tunnel
```
### LLM Router Verification

```bash
# Gemini 2.5 Flash (key in server/.env)
curl -s "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=$GEMINI_API_KEY" \
  -H "Content-Type: application/json" -d '{"contents":[{"parts":[{"text":"hi"}]}]}'

# Gemma 4 26B (Ollama local)
ollama list                                              # gemma4:26b + gemma4:e4b 확인
curl http://localhost:11434/api/generate -d '{"model":"gemma4:26b","prompt":"hi","stream":false}'

# Staff agent stats
curl -s http://localhost:8000/api/staff/stats | python3 -m json.tool
```
## Architecture Highlights (company-hq)

### Multi-LLM Cost Optimization

Every dispatch/classify/refine call goes through `server/free_llm.py:smart_call(task_type, prompt)` which tries:
1. **Gemini 2.5 Flash** (cloud, free 15/min · 1500/day)
2. **Gemma 4 26B/E4B** (local Ollama, unlimited)
3. **Claude haiku** (Max plan, fallback only)

Routing chains live in `ROUTING_CHAINS` dict per task type (`routing`, `classify`, `refine`, `summarize`, `default`). `run_claude_light()` in `server/claude_runner.py` is the single chokepoint that auto-routes — never call Claude haiku directly for routing/classification.

### Staff Agent (Critical Architectural Pattern)

`staff` team is the **default user entry point**:
- `server/staff_engine.py` classifies intent → handles directly via free LLM (chat/status/lookup/calc/summarize) OR escalates to CPO (`escalate_prompt` triggers background `run_claude("cpo-claude", ...)`)
- `server/ws_handler.py` intercepts `team_id == "staff"` before regular `run_claude` flow — Claude is **never called** for staff chat
- Stats persisted to `server/staff_stats.json` (gitignored). Surface via `GET /api/staff/stats`

When working on chat flow, ensure staff intercept stays **before** the general WS handler so token savings keep working.

### Frontend State Sync (HTTP-only, no WebSocket)

`doogeun-hq/src/lib/useStateSync.ts` syncs `agentStore` + `layoutStore` to server:
- Mount: `GET /api/doogeun/state` → applyRemote (with empty-data protection — never overwrites local with empty server state)
- Local change: debounced 1s → `PUT /api/doogeun/state` (with hourly snapshot rotation, 24 backups in `server/doogeun_state_backups/`)
- 30s polling for multi-device sync

WebSocket was removed because **CF Tunnel doesn't support WS for `/ws/doogeun/*`** (different from `/ws/chat/*` which works through CF Tunnel). If reintroducing WS, host on a separate path or use SSE.

### policies.md Auto-Injection

`server/policies.md` is automatically prepended to every team's system prompt at runtime (`run_claude` does this). Korean-only response is enforced here. Updates here propagate to all agents next call — no restart needed.

### Deploy Pipeline

`deploy.sh` builds **`doogeun-hq/`** with `NEXT_EXPORT=1`, uploads to Cloudflare Pages project `company-hq` (production = 600g.net). Build ID format `{git_sha}-{timestamp}` written to `out/version.json`. Frontend has `VersionCheck` polling for new builds with 15s grace period before reload.

`deploy-legacy-ui.sh` builds the legacy `ui/` dir to a separate CF Pages project `company-hq-legacy` — **must not collide with the main `company-hq` project**.

### Untracked / Sensitive Files (`.gitignore`)

- `server/teams.json`, `server/team_prompts.json` — team registry (treated as runtime data, not code)
- `server/chat_history/` — per-team / per-user chat transcripts (`_meta.json` 에 user_id 필드)
- `server/doogeun_state.json` + `_backups/` — agent + layout state
- `server/notifications.json`, `server/push_subscriptions.json` — Web Push endpoints
- `server/staff_stats.json` — staff usage counters
- `server/.env` — Anthropic + Gemini keys + Telegram bot token + `OWNER_PASSWORD`
- `server/auth_data/users.json` — 멀티유저 사용자 DB (토큰 해시 배열, granted/revoked caps)
- `server/auth_data/invite_codes.json` — 초대코드 발급 내역
- `server/auth_data/user_keys/{user_id}.json` — per-user API 키 (GitHub PAT, Gemini, Anthropic, Cloudflare). 파일 권한 600.

When adding new backend state files, decide: code (commit) vs runtime data (gitignore). Default to gitignore for anything containing user data, tokens, or rapidly-changing state.

## 멀티유저 베타 시스템 (capability 기반 — 2026-06)

`company-hq` 가 단일 owner 도구에서 다중 사용자 베타 플랫폼으로 전환. 핵심 아키텍처:

### 인증 (`server/auth.py`, `server/auth_data/`)
- 5 역할 (`owner/admin/manager/member/guest`) — 프리셋, 그 위에 `granted_caps`/`revoked_caps` 로 개별 override.
- 13 capability (체크박스 단위, 2026-06-21 `manage_showcase` 추가):
  `chat`, `create_own_light`, `create_own_full`, `delete_others_agents`, `edit_others_prompts`,
  `edit_scene`, `edit_furniture`, `invite_users`, `manage_users`, `manage_showcase`,
  `deploy`, `terminal`, `restart_server`.
- 토큰: SHA-256 해시 배열 (`u.tokens`) → 멀티 디바이스 5세션 동시 유지. legacy `u.token` 단일 필드와 양쪽 호환.
- 초대코드: 1코드=1계정. 코드 삭제 시 cascade — 해당 코드로 가입한 사용자 계정도 자동 삭제 (=강제 로그아웃 + 권한 회수).
- 오너 유일성: `create_invite_code(role="owner")` 거부 + `register_user` 안전망 (이미 오너 있으면 admin 강등) + `DELETE /users/{id}` 가 중복 오너는 정리 허용 / 유일 오너는 보호.

### per-user 채팅 세션 (`server/sessions_store.py`)
- `_meta.json` 의 각 세션에 `user_id` 필드 (1회 마이그레이션 — `.user_id_migrated` 플래그).
- `_active_{user_id}.json` 사용자별 active 세션 파일 분리.
- `list_sessions(team_id, user_id)`, `get_active_session_id(team_id, user_id)`, `resolve_session_id(team_id, sid, user_id)` — `manager.connect()` 가 user_id 받아 cross-user 세션 차단.
- WS `?session_id=…` 가 다른 사용자 세션이면 자동 fallback (가짜 query 로 owner 대화 못 봄).

### 시야 필터 (`server/routers/teams.py`, `doogeun_state.py`, `main.py:ws_chat`)
- `_is_shared_team(t)` 헬퍼: 시스템 5개 ID + `role ∈ {system, dev}` 모두 공용.
- GET `/api/teams`, `/api/teams/info`, `/api/doogeun/state`, WS `/ws/chat/{id}` 모두 같은 필터.
- 일반 사용자: 공용 + 본인 소유 + `is_public:true` 만. `manage_users` 보유자: 전체.
- `PUT /api/teams/{id}/visibility` — 본인 에이전트를 다른 사용자에 공개 (per-agent 토글).

### 프론트 자동 권한 부착 (`doogeun-hq/src/lib/`)
- `api.ts` — `authFetch(path, opts)` Bearer 자동 부착 + WS URL `?token=…` + 401/403 자동 토스트 (mutating 메서드만, GET 은 silent), `readToken()` 은 localStorage + cookie 양쪽에서 조회 (캐시 삭제 복원).
- `useCapabilities.ts` — 마운트 시 항상 fresh fetch (sessionStorage 캐시는 깜빡임 방지용만). `has()`, `hasAny()`. 401 시 캐시 무효화.
- `toast.ts` — 외부 라이브러리 없이 DOM 직접. `toast(msg, kind)`, `toastNoPermission(label)`.
- `infoTips.ts` + `ui/InfoTip.tsx` — 17 용어 사전 + 호버/탭 ⓘ 팝오버.

### 권한 관리 페이지 (`/permissions`)
- 신규 라우트 — 사이드바 [권한 관리] 메뉴 (`invite_users` 또는 `manage_users` 보유 시 노출).
- `PermissionManager.tsx` — 2 탭 (사용자 권한 / 초대 코드). 12 capability 체크박스, 역할 기본은 `🔒` 잠금 (변경 불가).
- 사용자 행 옆에 발급 초대코드 표시 + 복사 버튼.
- 코드 [삭제] = cascade (코드 + 사용자 계정).

### 토큰 / 데이터 정리 패턴
- `get_all_users()` 가 SENSITIVE 셋 (`token`, `tokens`, `invite_code`) 응답에서 제외 (manage_users 보유자에게도).
- `/api/settings/tokens` 의 masked 값은 `manage_users` 보유자만 노출 — 일반 사용자엔 `configured: bool` 만.
- per-user API 키 (`auth_data/user_keys/{user_id}.json`) — 파일 권한 600. `get_user_keys_status()` 가 masked 값만 응답.

### 로그아웃 패턴 (사용자 전환 시 잔존 데이터)
zustand persist 가 `state` 변경 직후 자동 저장하므로 `localStorage.removeItem` 만으론 부족.
`authStore.logout()` 이:
1. `doogeun-hq-*` localStorage 키 일괄 제거 (`theme`, `version-dismiss` 만 보존)
2. `sessionStorage.clear()`
3. `window.location.replace("/auth")` 강제 reload → zustand in-memory state 완전 폐기

### 업데이트 알림 권한 분리 (`VersionBanner.tsx`)
- 관리자(`canDeploy`): 배포 모달만 (refresh notice 절대 X — 본인이 배포 후 자동 reload).
- 일반 사용자: refresh notice 만 (배포 모달 절대 X). `showRefreshNotice = !canDeploy && browserBehind && !refreshDismissed`.
- 둘 다 release-notes 자유 조회.

### 사이드바 고정 순서 (`AgentSelector.tsx`, `hub/Sidebar.tsx`)
`FIXED_AGENT_CONFIG` 매핑 — 시스템·개발 9 에이전트는 활동·핀 무관하게 항상 같은 슬롯:
- 시스템: cpo-claude(1), hq-ops(2), staff(3)
- 개발: agent-6d883e(11, MD메이커), frontend-team(12), backend-team(13), design-team(14), content-lab(15), qa-agent(16)
- 비고정 사용자 에이전트는 슬롯 100+ (활동 기반, 고정 아래)
- `WorkingAgentsStrip` (🔥 활동중 패널) 도 같은 슬롯 정렬.

## 오케스트레이션 체계

세부 가이드: [docs/orchestration.md](docs/orchestration.md) — 7단계 리드 룰, dispatch block 자동 라우팅, `_auto_recovery_dispatch`, Light 에이전트 sandbox 격리, SQLite 마이그레이션, 무중단 배포, `/api/admin/*` 엔드포인트.

## 임베드 위젯 시스템

세부 가이드: [docs/embed-widgets.md](docs/embed-widgets.md) — `hidden:true` 외부 사이트(date-map, ai900 등)용 drop-in 위젯. 인증 쿠키(`.600g.net` 공유), 패치로그 endpoint, 세션 자동 제목, `embed-only` commit 분리, CORS regex, `_headers` 함정, CF API 토큰 한계.

## Showcase API (메인 허브 카드 관리, 2026-06-21)

`server/showcase.json` + `server/routers/showcase.py`:
- `GET /api/showcase` — 공개, `visible:true` 만 order 순. CORS allow_origins=`*` 으로 600g.net 에서 직접 호출
- `GET /api/showcase?all=1` — admin (manage_showcase capability **OR** `X-Admin-Password` 헤더)
- `PUT /api/showcase` — 전체 items 교체, admin 인증 필수, atomic write (tmp + os.replace)

인증 2-track 패턴 (`_require_admin`):
1. **두근컴퍼니 토큰 + `manage_showcase` capability** (aimaker.600g.net 안 `/admin/showcase` 페이지가 사용)
2. **`X-Admin-Password` 헤더** (env `SHOWCASE_ADMIN_PASSWORD` — 실제 값은 `server/.env` 참조, gitignore) — 600g.net 메인 허브의 5번 탭 게이트가 사용. 별도 인증 시스템 없이 빠른 진입용

icon 필드 처리 (showcase.json `_sanitize_item` + index.html `iconUrl` / `isInlineSvg`):
- max 길이 4096 (inline SVG 수용)
- prefix 형식 `lucide:name` → Iconify CDN
- 절대 URL → 그대로
- `<svg...>` 시작 → inline 으로 박고 `currentColor` → 흰색 치환

## 앱 배포 (600g.net 파일/exe 업로드, 2026-08-30)

허브에서 exe/dmg/apk 같은 실행파일을 배포한다. **파일 실체는 GitHub Releases** 에 두고 허브는 다운로드 버튼만 노출 — 집 맥 회선으로 다운로드 트래픽이 흐르지 않는다.

- 배포 저장소: `600-g/app-releases` (**public 이어야 익명 다운로드 가능**). env `APPS_GH_REPO` 로 변경
- 앱 1개 = 릴리스 1개 (tag `app-{id}`). 같은 id 로 재업로드하면 옛 에셋 삭제 후 교체, 다운로드 카운트는 승계
- 코드: `server/routers/apps.py` · `server/gh_releases.py` · `server/admin_gate.py` (showcase 와 인증 공유)
- 메타: `server/apps.json` (gitignore)

```
GET    /api/apps                  공개. visible 만
GET    /api/apps?all=1            admin. 전체 + max_upload_mb
GET    /api/apps/_status          admin. 배포 저장소 public 여부 진단
POST   /api/apps/upload           admin. 브라우저 multipart (95MB 상한)
POST   /api/apps/upload-local     admin + loopback 전용. 로컬 경로 → 대용량
PUT    /api/apps                  admin. 메타 편집 (누락으로는 삭제 안 됨)
DELETE /api/apps/{id}             admin. GitHub 릴리스까지 삭제
GET    /api/apps/{id}/download    공개. 카운트 후 GitHub 로 302
```

**GitHub 릴리스 연동 앱 (2026-09-15)**: 파일을 허브에 올리는 대신 외부 public 저장소의 **최신 릴리스**를 가리키는 앱. `POST /api/apps/link` (admin) `{id, source_repo:"owner/repo", source_asset:"File.zip", name?, platform?, …}` — 등록 시 최신 릴리스·에셋 존재를 검증하고, 같은 id 의 업로드 앱이 있으면 app-releases 릴리스를 지우고 다운로드 수를 승계한다. 이후 `GET /api/apps` 가 최신 릴리스(태그→version, 에셋 크기→size, published_at→uploaded_at)를 10분 캐시(`APPS_LATEST_TTL`)로 갱신해 apps.json 에도 써 두고, `/download` 는 항상 `github.com/{repo}/releases/latest/download/{asset}` 로 302 한다. **새 버전은 그 저장소에 태그만 push 하면 허브가 따라온다.** `source_repo/source_asset` 은 PUT 으로 못 바꾸고 link 로만 설정. 관리 UI [앱 배포] 탭 하단 'GitHub 저장소 연동' 폼으로도 등록한다. **비공개 저장소도 된다** — 등록 때 `source_private` 를 판별하고, 다운로드 때 `GITHUB_TOKEN` 으로 에셋 서명 URL(수 분 유효)을 받아 넘긴다. 한 저장소에 성격이 다른 릴리스가 섞여도 `source_asset` 이 든 가장 최근 릴리스를 찾는다(`/latest` 에 없으면 목록 탐색). 태그에서 숫자부터 버전으로 쓴다(`client-v1.5` → 1.5). 첫 사례: `autotimer` ← `600-g/shutdown-timer` / `AutoShutdownTimer.zip` (`~/Developer/shutdown-timer`, main 에 소스 올리면 Actions 가 build 번호로 자동 태그·빌드·Release). 테스트: `cd server && venv/bin/python3 -m unittest tests.test_apps_link -v` (14건, 네트워크 없음).

**다운로드 잠금 (2026-09-28)**: 앱마다 `locked` + `lock_code` (관리 UI 🔒 토글·코드 칸, 업로드 폼·link body 로도 설정). 잠긴 앱의 `GET /download` 는 코드 입력 페이지, `POST /download` (form `code`) 가 맞으면 303. IP 단위 5분 8회 실패 → 15분 잠금(관리자 게이트와 카운터 분리). 공개 응답엔 `locked` 만, 코드는 `?all=1` 관리자 응답에만. PUT 에 잠금 필드가 없으면 기존값 유지(옛 관리 화면이 잠금을 풀지 않게), 잠금+빈 코드는 400. 업로드 앱 저장소 `600-g/app-releases` 는 2026-09-28 부터 **비공개** — 모든 다운로드가 사이트 [받기] 경유(토큰 서명 URL)라 GitHub 직링크는 404. 연동 앱은 그 저장소 공개 여부를 따른다(shutdown-timer 는 공개) (첫 사례: `digimononline-setup` ← `600-g/digimon-online-server`).

**파일 교체**: 관리 UI 앱 행의 ⇪ = `POST /api/apps/upload` 에 `replace=true` + 기존 `app_id`. 순서·다운로드 수·잠금 유지, 없는 id 는 404, GitHub 연동 앱은 400(저장소에 릴리스로 바꿀 것). 예전엔 한글 이름만 넣으면 id 가 매번 랜덤이라 재업로드가 새 카드로 생겼다. 업로드 앱 다운로드는 에셋 id 서명 URL 로 넘겨 교체 직후 GitHub 가 옛 파일을 캐시해 주는 문제를 피한다. 테스트: `venv/bin/python3 -m unittest tests.test_apps_link tests.test_apps_lock` (31건).

**95MB 상한의 이유**: Cloudflare 무료 플랜이 프록시 요청 본문을 100MB 에서 자른다. 그보다 큰 파일은 맥에서 CLI 로 — 터널을 안 거치므로 2GB 까지 가능:

```bash
~/Developer/my-company/aimaker-hub/upload-app.py ~/Desktop/MyApp.exe \
  --name "마이앱" --version 1.2.0 --icon lucide:rocket --color "#0ea5e9"
```

관리 UI 는 600g.net 푸터 `© 600g` **5번 탭 → 비번** → [앱 배포] 탭.

**공유 링크** (`server/routers/app_share.py`): `https://600g.net/a/{id}` — 허브 `_redirects` 가 `api.600g.net/a/{id}` 로 302, 백엔드가 앱 1개짜리 페이지를 서버 렌더링한다. 정적 사이트는 앱마다 다른 OG 태그를 못 만들어서 백엔드로 뺐다.

- `GET /a/{id}` — 공유 페이지 (OG/Twitter 태그 + [내려받기])
- `GET /a/{id}/og.png` — Pillow 로 그리는 1200×630 미리보기 카드 (앱 색 배경 + 한글 이름). 폰트는 `/System/Library/Fonts/AppleSDGothicNeo.ttc`
- 숨김(`visible:false`) 앱은 둘 다 404. 단 **og.png 는 CF 캐시에 최대 수 시간 남을 수 있다** (origin 은 404 인데 `cf-cache-status: HIT`) — 페이지·다운로드는 즉시 차단되므로 실질 영향은 미리보기 썸네일뿐
- 관리자 [앱 배포] 탭의 🔗 버튼이 이 링크를 복사 (모바일은 `navigator.share` 공유시트)

**한글 파일명 불가 (GitHub 제약)**: GitHub 은 릴리스 에셋 이름의 non-ASCII 를 뭉갠다 (`내앱-테스트.zip` → `-.zip` 실측 확인). 따라서 `_file_ext` 로 확장자를 **먼저** 떼고 스템만 ASCII 정규화한다 — 순서를 바꾸면 한글 이름의 확장자까지 날아가 400 이 난다 (2026-08-30 버그). 다운로드 파일명을 지정하려면 업로드 폼의 **영문 파일명** 칸(= app id)을 채운다. 앱 **이름·설명은 한글 그대로** 저장·표시된다.

**PUT 은 병합**: payload 에 없는 앱은 지워지지 않는다. 파일이 딸린 레코드를 목록 누락만으로 지우면 GitHub 릴리스가 고아로 남기 때문. 삭제는 `DELETE` 한 경로로만.

**보안**: `admin_gate.require_admin` 에 IP 단위 무차별 대입 방어 (5분 8회 실패 → 15분 잠금). 이 게이트가 "GitHub 공개 저장소 파일 게시" 권한까지 지키므로 `SHOWCASE_ADMIN_PASSWORD` 를 반드시 .env 에 설정할 것 (코드 기본값 사용 금지). 값은 `server/.env` 에만 두고 문서에 적지 말 것.
## 운영 함정 (company-hq)

### Port 8000 squatter pattern

If FastAPI fails to start with `Address already in use`, it's likely a stray `python -m http.server 8000` from another terminal. `~/claude_112.sh` auto-detects this and kills non-uvicorn processes on port 8000 within ~3min, but for immediate recovery: `lsof -ti:8000 | xargs kill -9`.

### State recovery from backup

If `doogeun_state.json` gets corrupted (e.g., empty agents from a buggy PUT), restore from `server/doogeun_state_backups/doogeun_state.YYYYMMDD-HH.json`:
```bash
cp server/doogeun_state_backups/doogeun_state.20260425-07.json server/doogeun_state.json
```
Backups rotate hourly, 24 retained.

### Frontend build is fragile to Phaser/TS edits

Edits to `doogeun-hq/src/components/HubOffice.tsx` (1000+ lines, Phaser scene) frequently break TypeScript build. Always verify with `npx next build` before `bash deploy.sh` if touching that file. Common errors: missing identifiers in scene closure (e.g., `sprite` vs `container.getData("sprite")`), invalid Phaser API names (e.g., `setMaxParallelDownloads` doesn't exist — use `this.load.maxParallelDownloads = N`).

### Character pool integrity

Character sprites live in `doogeun-hq/public/assets/chars/char_*.png` (and mirrored in `ui/public/assets/chars/`). All files **must be 128×192** (32×48 frame, 4×4 grid). When adding new sprites from `ui/public/assets/pokemon_assets/Characters/`, filter out non-standard resolutions (160×192, 192×192, 129×192) — they cause visible right-edge cropping. `CHAR_COUNT` in `HubOffice.tsx` and `PRIMARY_CHAR_POOL_SIZE` in `ui/app/game/sprites.ts` must match the actual file count.

### Persistent agent character assignment

`pickSpriteKey()` in `HubOffice.tsx` uses hash-based assignment but **persists the result via `updateAgent({spriteKey})` on first render** (in a `migrationDoneRef`-guarded effect). This prevents character reassignment when `CHAR_COUNT` changes. Don't remove the migration guard — it's there to prevent infinite re-render loops that PUT-flooded the server.

### 멀티유저 베타 — 자주 재발하는 footgun
- **plain `fetch` 잔존**: 신규 백엔드 권한 가드 추가 후 프론트가 plain `fetch` 면 401/403. **모든 mutating 호출은 `authFetch`** (`doogeun-hq/src/lib/api.ts`). `GET /api/teams` 도 `authFetch` 아니면 시야 필터가 user 인식 못 해 시스템 5개만 반환 → "오너인데 본인 에이전트 안 보임" 증상.
- **chatStore conditional replace race**: `useChatWs.ts` 가 history_sync 받을 때 `if (restored.length >= cur.length)` 식으로 조건부 replace 하면, 사용자 전환 시 옛 사용자 메시지가 잔존 (서버가 0 보내고 클라가 5 보유 → 안 덮어씀). **항상 unconditional replace** — 서버 응답이 authoritative.
- **logout 이 zustand state 안 비움**: `localStorage.removeItem` 직후 `set({…})` 호출하면 persist 가 즉시 재저장. 반드시 일괄 정리 후 `window.location.replace("/auth")` 강제 reload. 캐시 정리만으론 부족.
- **agent 기하급수적 중복**: `importTeamsFromServer` 의 `existing = new Map(state.agents.map(…))` snapshot 이 `useStateSync.applyRemote` 와 race → 두 path 가 동시에 push → exponential duplication. 매 iteration `useAgentStore.getState().agents` 로 fresh check + `PUT /api/doogeun/state` 백엔드 측 dedupe (id 기준).
- **session_id query 우회**: WS 가 `?session_id=…` 받으면 user 검증 없이 `manager.connect` 가 그 세션의 history 송신 → 게스트가 owner 세션 ID 알면 owner 대화 노출. `manager.connect(user_id=…)` + `sessions_store.resolve_session_id(team_id, sid, user_id)` 가 ownership 검증 후 본인 default 로 fallback.
- **useCapabilities stale cache**: sessionStorage 캐시 (5분) 가 사용자 전환 시 옛 권한 그대로 → 사이드바 메뉴/모달 오작동. 마운트 시 항상 fresh fetch (캐시는 깜빡임 방지용만), 401/403 시 캐시 무효화.
- **scrollbar gutter 시프트**: 탭/버튼 클릭 시 콘텐츠 변화 → 스크롤바 등장/소멸 → 페이지 좌우 미세 흔들림. `globals.css` 의 `html { scrollbar-gutter: stable; overflow-y: scroll }` 로 전역 예약.
- **다중 owner 사고**: `create_invite_code(role="owner")` 가 검증 없으면 누구든 오너 코드 발급 → owner 2명. `routers/auth.py` 의 create-code 가 `role == "owner"` 거부 + `auth.py:register_user` 가 안전망 (이미 owner 있으면 admin 강등) + `DELETE /users/{id}` 가 유일 owner 보호 / 중복 owner 정리 허용.
