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
    require_user, deactivate_code, delete_code, extract_token_from_request, AuthError,
    get_user_keys, set_user_keys, get_user_keys_status,
    CAPABILITIES, ROLE_DEFAULTS,
    set_user_capabilities, get_user_with_capabilities, has_capability,
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
    """초대코드로 회원가입 또는 같은 닉네임 재로그인"""
    nickname = body.get("nickname", "").strip()
    code = body.get("code", "").strip()
    if not nickname or not code:
        return {"ok": False, "error": "닉네임과 초대코드를 입력하세요."}
    result = register_user(nickname, code)
    if not result:
        return {"ok": False, "error": "초대코드가 존재하지 않습니다."}
    # 닉네임 불일치 케이스 — 명확한 메시지 + 등록된 닉네임 힌트
    if isinstance(result, dict) and result.get("_error") == "nickname_mismatch":
        registered = result.get("registered_nickname", "")
        if registered:
            return {
                "ok": False,
                "error": f"닉네임이 다릅니다. 이 코드는 '{registered}' 로 등록돼있어요. 첫 가입 시 입력한 닉네임으로 다시 시도해주세요.",
            }
        return {"ok": False, "error": "닉네임이 다릅니다."}
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
    """초대코드 생성 — invite_users capability 필요.

    body:
      role: "guest"|"member"|"admin"...  (필수 — 역할 기본값 정의)
      max_uses: int (선택, 기본 1)
      capabilities: list[str] (선택 — 역할 기본 위에 추가 grant 할 권한)
    """
    user = _auth(request, body, min_level=1)
    if not has_capability(user, "invite_users"):
        return {"ok": False, "error": "사용자 초대 권한이 없어요 (invite_users 체크 필요)."}
    role = body.get("role", "member")
    if role not in ROLES:
        return {"ok": False, "error": f"존재하지 않는 역할: {role}"}
    # 🔒 오너 역할은 시스템 부트스트랩 외 절대 발급 불가 — 오너 유일성 보장
    if role == "owner":
        return {"ok": False, "error": "오너 역할은 초대코드로 발급할 수 없어요 (오너는 유일)."}
    extra_caps = [c for c in (body.get("capabilities") or []) if c in CAPABILITIES]
    # 1 코드 = 1 계정. 사용 후 자동 소진. 추후 계정 단위 권한 재발급으로 운영.
    code = create_invite_code(role=role, created_by=user["nickname"], max_uses=1)
    # 코드에 capabilities 추가 (register_user 에서 적용)
    if extra_caps:
        try:
            from auth import _load_json, _save_json, _CODES_FILE
            codes = _load_json(_CODES_FILE)
            for c in codes:
                if c["code"] == code:
                    c["extra_caps"] = extra_caps
                    break
            _save_json(_CODES_FILE, codes)
        except Exception:
            pass
    return {"ok": True, "code": code, "role": role, "extra_caps": extra_caps}


@router.get("/codes")
async def auth_list_codes(request: Request):
    """초대코드 목록 — 🔐 admin+ 만."""
    _auth(request, body=None, min_level=4)
    return get_all_codes()


@router.post("/codes/{code}/deactivate")
async def auth_deactivate_code(code: str, request: Request):
    """초대코드 완전 삭제 + 해당 코드로 가입한 사용자 계정도 함께 삭제.

    효과: 가입했던 사용자의 토큰 무효화 → 다음 요청에서 401 → 자동 로그아웃.
    🔐 manage_users 필요. 오너 계정은 cascade 삭제 대상에서 제외.
    """
    user = _auth(request, body=None, min_level=1)
    if not has_capability(user, "manage_users"):
        raise HTTPException(status_code=403, detail="권한 변경 권한이 없어요 (manage_users 필요).")
    # 1) 코드 디스크에서 제거
    ok = delete_code(code)
    # 2) cascade: 해당 코드로 등록한 사용자 계정도 삭제 (오너 제외)
    affected: list[str] = []
    try:
        from auth import _load_json, _save_json, _USERS_FILE, _user_keys_path
        users = _load_json(_USERS_FILE)
        if isinstance(users, dict):
            target = code.upper()
            for uid in list(users.keys()):
                u = users[uid]
                if u.get("invite_code") == target and u.get("role") != "owner":
                    affected.append(u.get("nickname", uid))
                    del users[uid]
                    # API 키 파일도 디스크에서 정리
                    try:
                        p = _user_keys_path(uid)
                        if p.exists():
                            p.unlink()
                    except Exception:
                        pass
            _save_json(_USERS_FILE, users)
    except Exception as e:
        return {"ok": ok, "code_deleted": ok, "users_deleted": [], "error": str(e)}
    return {"ok": ok, "code_deleted": ok, "users_deleted": affected}


@router.get("/users")
async def auth_list_users(request: Request):
    """사용자 목록 — 🔐 admin+ 만."""
    _auth(request, body=None, min_level=4)
    return get_all_users()


@router.get("/roles")
async def auth_roles():
    """역할 목록"""
    return ROLES


@router.get("/capabilities")
async def auth_capabilities():
    """전체 capability 목록 + 라벨/설명 + 역할별 기본 묶음.

    프론트 권한 관리 UI 가 이걸 받아서 체크박스 렌더링.
    """
    return {
        "ok": True,
        "capabilities": CAPABILITIES,
        "role_defaults": ROLE_DEFAULTS,
    }


@router.get("/users/full")
async def auth_users_full(request: Request):
    """오너/관리자 권한 관리용 — 모든 사용자 + 최종 capabilities + 토큰 카운트.

    🔐 manage_users 필요. 없으면 401/403.
    """
    user = _auth(request, body=None, min_level=1)
    if not has_capability(user, "manage_users"):
        raise HTTPException(status_code=403, detail="다른 사용자 권한 변경 권한이 없어요 (manage_users 필요).")
    users_raw = get_all_users()  # 토큰 제거된 dict
    result = []
    for uid in users_raw.keys():
        info = get_user_with_capabilities(uid)
        if info:
            result.append(info)
    return {"ok": True, "users": result, "all_capabilities": CAPABILITIES}


@router.delete("/users/{user_id}")
async def auth_delete_user(user_id: str, request: Request):
    """사용자 계정 완전 삭제.

    🔐 manage_users 필요. 오너 본인 + 자기 자신 셀프 삭제 차단.
    """
    user = _auth(request, body=None, min_level=1)
    if not has_capability(user, "manage_users"):
        raise HTTPException(status_code=403, detail="권한 변경 권한이 없어요 (manage_users 필요).")
    if user["user_id"] == user_id:
        raise HTTPException(status_code=400, detail="본인 계정은 삭제할 수 없어요.")
    target = get_user_with_capabilities(user_id)
    if not target:
        return {"ok": False, "error": "사용자를 찾을 수 없음"}
    # 오너 삭제 규칙: 마지막 오너는 보호 (lockout 방지). 중복 오너는 정리 허용.
    if target["role"] == "owner":
        from auth import _load_json, _USERS_FILE
        users_all = _load_json(_USERS_FILE) or {}
        owner_count = sum(1 for u in users_all.values() if u.get("role") == "owner")
        if owner_count <= 1:
            raise HTTPException(
                status_code=400,
                detail="유일한 오너 계정은 삭제할 수 없어요 (시스템 lockout 방지).",
            )
        # else: 중복 오너 → 정리 허용
    try:
        from auth import _load_json, _save_json, _USERS_FILE
        users = _load_json(_USERS_FILE)
        if isinstance(users, dict) and user_id in users:
            del users[user_id]
            _save_json(_USERS_FILE, users)
        # 사용자별 API 키 파일도 제거 (디스크 정리)
        try:
            from auth import _user_keys_path
            p = _user_keys_path(user_id)
            if p.exists():
                p.unlink()
        except Exception:
            pass
        return {"ok": True, "deleted": user_id, "nickname": target.get("nickname", "")}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@router.put("/users/{user_id}/capabilities")
async def auth_set_user_caps(user_id: str, body: dict, request: Request):
    """사용자 capabilities 일괄 설정 — 체크박스 UI 가 호출.

    body: {"capabilities": ["chat", "edit_scene", ...]}
    🔐 manage_users 필요.
    """
    user = _auth(request, body, min_level=1)
    if not has_capability(user, "manage_users"):
        raise HTTPException(status_code=403, detail="권한 변경 권한이 없어요 (manage_users 필요).")
    if user["user_id"] == user_id and not has_capability(user, "manage_users"):
        # 자기 자신의 manage_users 권한을 셀프 박탈 시도 차단 (lockout 방지)
        raise HTTPException(status_code=400, detail="본인의 manage_users 권한은 직접 끌 수 없어요 (lockout 방지).")
    caps = body.get("capabilities") or []
    if not isinstance(caps, list):
        return {"ok": False, "error": "capabilities 는 배열이어야 합니다."}
    # 셀프 lockout 방어 — 본인이 본인의 manage_users 를 빼려고 하면 거부
    target = get_user_with_capabilities(user_id)
    if not target:
        return {"ok": False, "error": "사용자를 찾을 수 없음"}
    if user["user_id"] == user_id and "manage_users" not in caps:
        return {"ok": False, "error": "본인의 manage_users 는 직접 끌 수 없어요."}
    result = set_user_capabilities(user_id, caps)
    if not result.get("ok"):
        return result
    return {"ok": True, "user": get_user_with_capabilities(user_id)}


# ── 신규유저 가이드/셋업 ─────────────────────────────
@router.get("/me/setup")
async def auth_me_setup(request: Request):
    """신규유저 가이드 — 무엇을 가입해야 하는지, 왜 필요한지, 어디서 받는지.

    응답: 사용자 정보 + 키 셋업 현황 + 각 키별 안내(label/why/where/required_for)
    """
    user = _auth(request, body=None, min_level=1)
    status = get_user_keys_status(user["user_id"])
    role_label = ROLES.get(user["role"], {}).get("label", user["role"])
    user_caps = user.get("capabilities") or []

    guides = [
        {
            "key": "gemini_api_key",
            "label": "Gemini API 키",
            "set": status["gemini_api_key"]["set"],
            "masked": status["gemini_api_key"]["masked"],
            "required": False,
            "why": (
                "Google 의 무료 LLM. 두근컴퍼니가 이미 공용 키로 무료 LLM(분류·요약·대화) 제공 중이라 "
                "사용자는 안 넣어도 일단 작동해요. 본인 할당량 따로 쓰고 싶거나, 트래픽 많을 때 권장."
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
        "capabilities": user_caps,
        "keys_status": status,
        "guides": guides,
        "next_steps": [
            "왼쪽 사이드바 [+ 에이전트] 를 눌러 본인 첫 에이전트를 만들어보세요. '⚡빠르게 만들기' 모드는 API 키 0개로도 됩니다.",
            "에이전트 만든 후 우클릭 → ⚙ 설정 에서 AI 모델 (Gemini 무료 ↔ Claude 유료) 바꿀 수 있어요.",
            "다른 사용자의 에이전트는 대화는 가능, 설정 변경·삭제는 불가능.",
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
    """로그아웃 — 현재 토큰만 무효화 (다른 기기 세션은 유지)."""
    import hashlib as _h
    from auth import extract_token_from_request
    user = _auth(request, body, min_level=1)
    raw_token = extract_token_from_request(dict(request.headers), dict(request.query_params), body.get("token", ""))
    try:
        from auth import _load_json, _save_json, _USERS_FILE
        users = _load_json(_USERS_FILE)
        if isinstance(users, dict) and user["user_id"] in users:
            u = users[user["user_id"]]
            target_hash = _h.sha256(raw_token.encode()).hexdigest() if raw_token else ""
            # 단일 토큰 legacy
            if u.get("token") == target_hash:
                u.pop("token", None)
            # 배열 토큰 — 현재 거만 제거
            tokens_list = list(u.get("tokens") or [])
            if target_hash in tokens_list:
                tokens_list.remove(target_hash)
                u["tokens"] = tokens_list
            _save_json(_USERS_FILE, users)
        return {"ok": True}
    except Exception as e:
        return {"ok": False, "error": str(e)}
