"""초대코드 기반 인증 시스템 — DB 없이 JSON 파일로 관리"""

import json
import uuid
import hashlib
import os
from datetime import datetime
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

_AUTH_DIR = Path(__file__).parent / "auth_data"
_AUTH_DIR.mkdir(exist_ok=True)
_USERS_FILE = _AUTH_DIR / "users.json"
_CODES_FILE = _AUTH_DIR / "invite_codes.json"

# ── 권한 레벨 ─────────────────────────────────────────
ROLES = {
    "owner": {"level": 5, "label": "오너", "can_code": True, "can_create_team": True, "can_manage": True},
    "admin": {"level": 4, "label": "관리자", "can_code": True, "can_create_team": True, "can_manage": False},
    "manager": {"level": 3, "label": "매니저", "can_code": False, "can_create_team": False, "can_manage": False},
    "member": {"level": 2, "label": "사원", "can_code": False, "can_create_team": False, "can_manage": False},
    "guest": {"level": 1, "label": "게스트", "can_code": False, "can_create_team": False, "can_manage": False},
}


def _load_json(path: Path) -> dict | list:
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {} if "users" in path.name else []


def _save_json(path: Path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


# ── 초대코드 관리 ─────────────────────────────────────
def create_invite_code(role: str = "member", created_by: str = "system", max_uses: int = 1) -> str:
    """초대코드 생성. 오너/관리자만 호출 가능."""
    codes = _load_json(_CODES_FILE)
    if not isinstance(codes, list):
        codes = []

    code = uuid.uuid4().hex[:8].upper()  # 8자리 대문자
    codes.append({
        "code": code,
        "role": role,
        "created_by": created_by,
        "created_at": datetime.now().isoformat(),
        "max_uses": max_uses,
        "used_count": 0,
        "active": True,
    })
    _save_json(_CODES_FILE, codes)
    return code


def validate_invite_code(code: str) -> dict | None:
    """초대코드 검증. 유효하면 역할 정보 반환."""
    codes = _load_json(_CODES_FILE)
    if not isinstance(codes, list):
        return None

    for c in codes:
        if c["code"] == code.upper() and c["active"] and c["used_count"] < c["max_uses"]:
            return c
    return None


def use_invite_code(code: str):
    """초대코드 사용 횟수 증가."""
    codes = _load_json(_CODES_FILE)
    if not isinstance(codes, list):
        return

    for c in codes:
        if c["code"] == code.upper():
            c["used_count"] += 1
            if c["used_count"] >= c["max_uses"]:
                c["active"] = False
            break
    _save_json(_CODES_FILE, codes)


# ── 사용자 관리 ───────────────────────────────────────
def register_user(nickname: str, code: str) -> dict | None:
    """초대코드로 사용자 등록. 세션 토큰 반환."""
    code_info = validate_invite_code(code)
    if not code_info:
        return None

    users = _load_json(_USERS_FILE)
    if not isinstance(users, dict):
        users = {}

    user_id = uuid.uuid4().hex[:12]
    token = uuid.uuid4().hex

    users[user_id] = {
        "nickname": nickname,
        "role": code_info["role"],
        "tokens": [hashlib.sha256(token.encode()).hexdigest()],
        "created_at": datetime.now().isoformat(),
        "last_active": datetime.now().isoformat(),
        "invite_code": code.upper(),
    }
    _save_json(_USERS_FILE, users)
    use_invite_code(code)

    return {
        "user_id": user_id,
        "nickname": nickname,
        "role": code_info["role"],
        "permissions": ROLES.get(code_info["role"], ROLES["guest"]),
        "token": token,  # 클라이언트에 저장할 원본 토큰
    }


def verify_token(token: str) -> dict | None:
    """토큰으로 사용자 인증.

    user.token (legacy 단일) 또는 user.tokens (배열, 최대 5개 멀티세션) 어느 쪽이든 매칭.
    멀티 디바이스/탭 로그인 가능 — 이전 세션 안 끊김.
    """
    if not token:
        return None

    users = _load_json(_USERS_FILE)
    if not isinstance(users, dict):
        return None

    token_hash = hashlib.sha256(token.encode()).hexdigest()
    for user_id, user in users.items():
        legacy_match = user.get("token") == token_hash
        array_match = token_hash in (user.get("tokens") or [])
        if legacy_match or array_match:
            user["last_active"] = datetime.now().isoformat()
            _save_json(_USERS_FILE, users)
            return {
                "user_id": user_id,
                "nickname": user["nickname"],
                "role": user["role"],
                "permissions": ROLES.get(user["role"], ROLES["guest"]),
            }
    return None


def get_all_codes() -> list:
    """모든 초대코드 목록 (관리용)."""
    codes = _load_json(_CODES_FILE)
    return codes if isinstance(codes, list) else []


def deactivate_code(code: str) -> bool:
    """초대코드 즉시 비활성화 (오너/관리자만 호출 예정)."""
    codes = _load_json(_CODES_FILE)
    if not isinstance(codes, list):
        return False
    target = code.upper()
    for c in codes:
        if c["code"] == target:
            c["active"] = False
            _save_json(_CODES_FILE, codes)
            return True
    return False


def get_all_users() -> dict:
    """모든 사용자 목록 (관리용)."""
    users = _load_json(_USERS_FILE)
    if not isinstance(users, dict):
        return {}
    # 토큰 해시는 제거
    return {uid: {k: v for k, v in u.items() if k != "token"} for uid, u in users.items()}


# ── 초기 오너 설정 ────────────────────────────────────
def ensure_owner_code():
    """오너 초대코드가 없으면 생성."""
    codes = _load_json(_CODES_FILE)
    if not isinstance(codes, list):
        codes = []

    has_owner = any(c["role"] == "owner" for c in codes)
    if not has_owner:
        code = create_invite_code(role="owner", created_by="system", max_uses=1)
        print(f"🔑 오너 초대코드 생성: {code}")
        return code
    return None


# ── per-user API 키 저장소 ────────────────────────────
_USER_KEYS_DIR = _AUTH_DIR / "user_keys"
_USER_KEYS_DIR.mkdir(exist_ok=True)


def _user_keys_path(user_id: str) -> Path:
    safe = "".join(c for c in user_id if c.isalnum())
    return _USER_KEYS_DIR / f"{safe}.json"


def get_user_keys(user_id: str) -> dict:
    """사용자별 API 키 (비공개 raw 값). 없으면 빈 dict."""
    p = _user_keys_path(user_id)
    if not p.exists():
        return {}
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return {}


def set_user_keys(user_id: str, keys: dict) -> dict:
    """사용자 키 저장 — None/공백 값은 제거. 파일 권한 600.

    keys 예: {"github_token": "ghp_...", "gemini_api_key": "AIza...", "anthropic_api_key": "sk-ant-..."}
    """
    p = _user_keys_path(user_id)
    cur = get_user_keys(user_id)
    for k, v in keys.items():
        if v is None or (isinstance(v, str) and v.strip() == ""):
            cur.pop(k, None)
        else:
            cur[k] = v.strip() if isinstance(v, str) else v
    p.write_text(json.dumps(cur, ensure_ascii=False, indent=2), encoding="utf-8")
    try:
        os.chmod(p, 0o600)
    except Exception:
        pass
    return cur


def get_user_keys_status(user_id: str) -> dict:
    """API 키 설정 현황 — raw 값 노출 X. 비개발자 가이드용.

    반환: {github_token, gemini_api_key, anthropic_api_key, cloudflare_token, cloudflare_zone}
    cloudflare_zone 은 도메인 이름이라 마스킹 없이 그대로 표시.
    """
    keys = get_user_keys(user_id)
    def _mask(v: str) -> str:
        if not v or len(v) < 10:
            return "****"
        return v[:4] + "…" + v[-4:]
    return {
        "github_token": {"set": bool(keys.get("github_token")), "masked": _mask(keys.get("github_token", ""))},
        "gemini_api_key": {"set": bool(keys.get("gemini_api_key")), "masked": _mask(keys.get("gemini_api_key", ""))},
        "anthropic_api_key": {"set": bool(keys.get("anthropic_api_key")), "masked": _mask(keys.get("anthropic_api_key", ""))},
        "cloudflare_token": {"set": bool(keys.get("cloudflare_token")), "masked": _mask(keys.get("cloudflare_token", ""))},
        "cloudflare_zone": {"set": bool(keys.get("cloudflare_zone")), "masked": keys.get("cloudflare_zone", "") or ""},
    }


# ── 권한 체크 헬퍼 ────────────────────────────────────
class AuthError(Exception):
    """인증/권한 실패 — FastAPI 라우터에서 HTTPException 으로 변환."""

    def __init__(self, status_code: int, detail: str):
        self.status_code = status_code
        self.detail = detail
        super().__init__(detail)


def require_user(token: str, min_level: int = 1) -> dict:
    """토큰 검증 + 최소 권한 레벨 체크.

    레벨: owner=5 / admin=4 / manager=3 / member=2 / guest=1
    실패 시 AuthError(401/403) 발생 — 호출자가 HTTPException 으로 래핑.
    """
    if not token:
        raise AuthError(401, "로그인이 필요합니다.")
    user = verify_token(token)
    if not user:
        raise AuthError(401, "토큰이 유효하지 않습니다. 다시 로그인해주세요.")
    level = ROLES.get(user["role"], {}).get("level", 0)
    if level < min_level:
        need = next((r["label"] for r in ROLES.values() if r["level"] == min_level), str(min_level))
        raise AuthError(403, f"권한이 부족합니다 ({need} 이상 필요).")
    return user


def is_owner_of(team: dict, user: dict) -> bool:
    """에이전트 소유 여부 — owner_id 일치 또는 user.role == owner."""
    if not user:
        return False
    if user["role"] == "owner":
        return True
    return team.get("owner_id") == user.get("user_id")


def extract_token_from_request(headers: dict, query_params: dict | None = None, body_token: str = "") -> str:
    """Authorization 헤더 / 쿼리 / 바디 어느 것이든 token 추출."""
    auth = headers.get("authorization") or headers.get("Authorization") or ""
    if auth.lower().startswith("bearer "):
        return auth[7:].strip()
    if query_params:
        qt = query_params.get("token") or ""
        if qt:
            return qt
    return body_token or ""


def owner_login(password: str) -> dict | None:
    """오너 비밀번호 로그인. .env의 OWNER_PASSWORD와 비교."""
    owner_pw = os.getenv("OWNER_PASSWORD", "")
    if not owner_pw or password != owner_pw:
        return None

    users = _load_json(_USERS_FILE)
    if not isinstance(users, dict):
        users = {}

    # 기존 오너 계정 찾기 — 새 토큰을 배열에 append 만 함 (이전 세션 유지!)
    for uid, u in users.items():
        if u.get("role") == "owner":
            token = uuid.uuid4().hex
            new_hash = hashlib.sha256(token.encode()).hexdigest()
            # legacy 단일 token 도 첫 호출 시 배열로 이주
            tokens_list = list(u.get("tokens") or [])
            legacy = u.get("token")
            if legacy and legacy not in tokens_list:
                tokens_list.append(legacy)
            tokens_list.append(new_hash)
            # 최대 5개 (멀티 디바이스) 유지, 오래된 것부터 폐기
            u["tokens"] = tokens_list[-5:]
            u.pop("token", None)  # legacy 필드 제거 — 배열로 통일
            u["last_active"] = datetime.now().isoformat()
            _save_json(_USERS_FILE, users)
            return {
                "user_id": uid,
                "nickname": u["nickname"],
                "role": "owner",
                "permissions": ROLES["owner"],
                "token": token,
            }

    # 오너 계정 없으면 새로 생성
    user_id = "owner"
    token = uuid.uuid4().hex
    users[user_id] = {
        "nickname": "두근",
        "role": "owner",
        "tokens": [hashlib.sha256(token.encode()).hexdigest()],
        "created_at": datetime.now().isoformat(),
        "last_active": datetime.now().isoformat(),
        "invite_code": "OWNER",
    }
    _save_json(_USERS_FILE, users)
    return {
        "user_id": user_id,
        "nickname": "두근",
        "role": "owner",
        "permissions": ROLES["owner"],
        "token": token,
    }
