"""인증 엔드포인트 — main.py 분할 9차 (안정화 2026-05-08).

이동: /api/auth/owner, /register, /verify, /create-code, /codes, /users, /roles
신규 (2026-06-07 멀티유저 베타):
  - /codes, /users 권한 가드 (admin+)
  - /codes/{code}/deactivate (admin+)
  - /me/setup — 신규유저 API 키 셋업 현황 (가입해야 할 것 + 왜)
  - /me/keys (GET/PUT) — per-user 키 저장
자체 완결: auth 모듈 위임만, 공유 상태 0.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

from auth import (
    register_user, verify_token, create_invite_code,
    get_all_codes, get_all_users, ROLES, owner_login,
    require_user, deactivate_code, extract_token_from_request, AuthError,
    get_user_keys, set_user_keys, get_user_keys_status,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _auth(request: Request, body: dict | None = None, min_level: int = 1) -> dict:
    """라우터 공용 권한 헬퍼 (main.py 의 _auth_user 와 동일 패턴)."""
    token = extract_token_from_request(
        dict(request.headers),
        dict(request.query_params),
        (body or {}).get("token", ""),
    )
    try:
        return require_user(token, min_level=min_level)
    except AuthError as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail)


@router.post("/owner")
async def auth_owner(body: dict):
    """오너 비밀번호 로그인"""
    password = body.get("password", "")
    result = owner_login(password)
    if not result:
        return {"ok": False, "error": "비밀번호가 틀렸습니다."}
    return {"ok": True, **result}


@router.post("/register")
async def auth_register(body: dict):
    """초대코드로 회원가입"""
    nickname = body.get("nickname", "").strip()
    code = body.get("code", "").strip()
    if not nickname or not code:
        return {"ok": False, "error": "닉네임과 초대코드를 입력하세요."}
    result = register_user(nickname, code)
    if not result:
        return {"ok": False, "error": "초대코드가 유효하지 않습니다."}
    return {"ok": True, **result}


@router.post("/verify")
async def auth_verify(body: dict):
    """토큰 검증"""
    token = body.get("token", "")
    user = verify_token(token)
    if not user:
        return {"ok": False}
    return {"ok": True, **user}


@router.post("/create-code")
async def auth_create_code(body: dict, request: Request):
    """초대코드 생성 (오너/관리자만)"""
    user = _auth(request, body, min_level=4)
    role = body.get("role", "member")
    max_uses = body.get("max_uses", 1)
    if role not in ROLES:
        return {"ok": False, "error": f"존재하지 않는 역할: {role}"}
    code = create_invite_code(role=role, created_by=user["nickname"], max_uses=max_uses)
    return {"ok": True, "code": code, "role": role, "max_uses": max_uses}


@router.get("/codes")
async def auth_list_codes(request: Request):
    """초대코드 목록 — 🔐 admin+ 만."""
    _auth(request, body=None, min_level=4)
    return get_all_codes()


@router.post("/codes/{code}/deactivate")
async def auth_deactivate_code(code: str, request: Request):
    """초대코드 즉시 비활성화 (admin+)."""
    _auth(request, body=None, min_level=4)
    ok = deactivate_code(code)
    return {"ok": ok}


@router.get("/users")
async def auth_list_users(request: Request):
    """사용자 목록 — 🔐 admin+ 만."""
    _auth(request, body=None, min_level=4)
    return get_all_users()


@router.get("/roles")
async def auth_roles():
    """역할 목록"""
    return ROLES


# ── 신규유저 가이드/셋업 ─────────────────────────────
@router.get("/me/setup")
async def auth_me_setup(request: Request):
    """신규유저 가이드 — 무엇을 가입해야 하는지, 왜 필요한지, 어디서 받는지.

    응답: 사용자 정보 + 키 셋업 현황 + 각 키별 안내(label/why/where/required_for)
    """
    user = _auth(request, body=None, min_level=1)
    status = get_user_keys_status(user["user_id"])
    role_label = ROLES.get(user["role"], {}).get("label", user["role"])

    guides = [
        {
            "key": "gemini_api_key",
            "label": "Gemini API 키",
            "set": status["gemini_api_key"]["set"],
            "masked": status["gemini_api_key"]["masked"],
            "required": False,
            "why": (
                "Google 의 무료 LLM. 두근컴퍼니가 이미 공용 키로 무료 LLM(분류·요약·대화) 제공 중이라 "
                "친구는 안 넣어도 일단 작동해요. 본인 할당량 따로 쓰고 싶거나, 트래픽 많을 때 권장."
            ),
            "where": "https://aistudio.google.com/app/apikey",
            "signup_steps": [
                "구글 계정으로 aistudio.google.com 접속",
                "[Create API key] 클릭",
                "키 복사 → 두근컴퍼니 [설정 → 내 API 키] 에 붙여넣기",
            ],
            "free": "✅ 완전 무료 (분15회, 일1500회)",
        },
        {
            "key": "github_token",
            "label": "GitHub 개인 토큰 (PAT)",
            "set": status["github_token"]["set"],
            "masked": status["github_token"]["masked"],
            "required": False,
            "why": (
                "본인 GitHub 계정에 자동으로 코드 저장소(repo) 만들고 싶을 때 필요. "
                "이게 없으면 'Light 에이전트(빠르게 만들기)' 만 가능 — 코딩 자동화 없는 페르소나 에이전트."
            ),
            "where": "https://github.com/settings/tokens?type=beta",
            "signup_steps": [
                "GitHub 가입 (없으면 github.com/signup)",
                "Settings → Developer settings → Personal access tokens (fine-grained)",
                "[Generate new token] — name: doogeun-hq, expiration: 1년",
                "권한: Repository access = All repos, Permissions = Contents/Metadata/Pages 모두 'Read and write'",
                "생성된 ghp_… 토큰 복사 → 두근컴퍼니 [설정 → 내 API 키] 붙여넣기",
            ],
            "free": "✅ 완전 무료 (GitHub 무료 계정으로 OK)",
        },
        {
            "key": "cloudflare_token",
            "label": "Cloudflare API 토큰",
            "set": status["cloudflare_token"]["set"],
            "masked": status["cloudflare_token"]["masked"],
            "required": False,
            "why": (
                "본인 도메인(예: myname.com) 에 서브도메인(예: agent-X.myname.com) 자동 발급. "
                "이게 있어야 풀 에이전트 만들 때 인터넷에 공개되는 진짜 주소가 자동으로 붙어요. "
                "본인 도메인 없으면 호스트(600g.net) 의 서브도메인 받음 (관리자만)."
            ),
            "where": "https://dash.cloudflare.com/profile/api-tokens",
            "signup_steps": [
                "이미 갖고 있는 도메인이 Cloudflare 에 등록돼야 함 (가비아·후이즈 등에서 산 도메인 → Cloudflare nameserver 로 전환).",
                "dash.cloudflare.com 로그인 → 우상단 프로필 → My Profile → API Tokens → Create Token.",
                "'Edit zone DNS' 템플릿 → Use template.",
                "Zone Resources → Specific zone → 본인 도메인 선택 → Continue → Create Token.",
                "토큰 복사 → 두근컴퍼니 [내 API 키 → Cloudflare 토큰] 붙여넣기.",
            ],
            "free": "✅ 토큰 발급 무료. 도메인은 별도 (가비아 1년 1만원~).",
        },
        {
            "key": "cloudflare_zone",
            "label": "Cloudflare 도메인 (zone)",
            "set": status["cloudflare_zone"]["set"],
            "masked": status["cloudflare_zone"]["masked"],
            "required": False,
            "why": (
                "본인이 Cloudflare 에 등록한 도메인 이름. 예: 'myname.com' (https:// X, www. X). "
                "Cloudflare 토큰과 함께 넣어야 서브도메인 자동 발급이 동작."
            ),
            "where": "https://dash.cloudflare.com/",
            "signup_steps": [
                "Cloudflare 대시보드 상단에 본인 도메인 카드가 보이면 → 그 이름을 그대로 입력.",
                "여러 개면 자주 쓰는 것 1개만 (나중에 변경 가능).",
            ],
            "free": "ℹ️ 입력만 — 가입/결제 없음.",
        },
        {
            "key": "anthropic_api_key",
            "label": "Anthropic API 키 (선택)",
            "set": status["anthropic_api_key"]["set"],
            "masked": status["anthropic_api_key"]["masked"],
            "required": False,
            "why": (
                "Claude(Anthropic) 만든 회사의 직접 API 키. 본인 결제로 Claude 쓰고 싶을 때만 추가. "
                "기본적으로는 호스트(이두근) 의 Max 플랜을 공유하니까 안 넣어도 됨."
            ),
            "where": "https://console.anthropic.com/settings/keys",
            "signup_steps": [
                "console.anthropic.com 가입 + 결제 카드 등록 ($5~ 부터 충전)",
                "[Create Key] 클릭 → sk-ant-… 복사",
                "두근컴퍼니 [설정 → 내 API 키] 에 붙여넣기",
            ],
            "free": "❌ 유료 (사용한 만큼 과금). 안 넣으면 호스트 토큰 공유.",
        },
    ]

    return {
        "ok": True,
        "user": {
            "user_id": user["user_id"],
            "nickname": user["nickname"],
            "role": user["role"],
            "role_label": role_label,
        },
        "permissions": user.get("permissions") or ROLES.get(user["role"], {}),
        "keys_status": status,
        "guides": guides,
        "next_steps": [
            "왼쪽 사이드바 [+ 에이전트] 를 눌러 본인 첫 에이전트를 만들어보세요. '⚡빠르게 만들기' 모드는 API 키 0개로도 됩니다.",
            "에이전트 만든 후 우클릭 → ⚙ 설정 에서 AI 모델 (Gemini 무료 ↔ Claude 유료) 바꿀 수 있어요.",
            "다른 사람의 에이전트(이두근의 두근/CPO 등)는 대화는 가능, 설정 변경·삭제는 불가능.",
        ],
    }


@router.get("/me/keys")
async def auth_me_keys_get(request: Request):
    """내 API 키 현황 (마스킹된 상태만)."""
    user = _auth(request, body=None, min_level=1)
    return {"ok": True, "keys_status": get_user_keys_status(user["user_id"])}


@router.put("/me/keys")
async def auth_me_keys_put(body: dict, request: Request):
    """내 API 키 저장. body: {keys: {github_token?, gemini_api_key?, anthropic_api_key?}}

    빈 문자열은 해당 키 삭제로 처리. raw 값은 응답에 절대 노출 X.
    """
    user = _auth(request, body, min_level=1)
    keys = body.get("keys") or {}
    if not isinstance(keys, dict):
        return {"ok": False, "error": "keys 는 object 여야 합니다."}
    ALLOWED = {"github_token", "gemini_api_key", "anthropic_api_key", "cloudflare_token", "cloudflare_zone"}
    filtered = {k: v for k, v in keys.items() if k in ALLOWED}
    set_user_keys(user["user_id"], filtered)
    return {"ok": True, "keys_status": get_user_keys_status(user["user_id"])}


@router.post("/logout")
async def auth_logout(body: dict, request: Request):
    """로그아웃 — 현재 토큰 무효화 (해시 제거)."""
    user = _auth(request, body, min_level=1)
    try:
        from auth import _load_json, _save_json, _USERS_FILE
        users = _load_json(_USERS_FILE)
        if isinstance(users, dict) and user["user_id"] in users:
            users[user["user_id"]].pop("token", None)
            _save_json(_USERS_FILE, users)
        return {"ok": True}
    except Exception as e:
        return {"ok": False, "error": str(e)}
