"""초대코드 기반 인증 시스템 — DB 없이 JSON 파일로 관리"""

import json
import uuid
import hashlib
from datetime import datetime
from pathlib import Path

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
        "token": hashlib.sha256(token.encode()).hexdigest(),
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
    """토큰으로 사용자 인증."""
    if not token:
        return None

    users = _load_json(_USERS_FILE)
    if not isinstance(users, dict):
        return None

    token_hash = hashlib.sha256(token.encode()).hexdigest()
    for user_id, user in users.items():
        if user.get("token") == token_hash:
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

    # 이미 오너 코드가 있는지 확인
    has_owner = any(c["role"] == "owner" for c in codes)
    if not has_owner:
        code = create_invite_code(role="owner", created_by="system", max_uses=1)
        print(f"🔑 오너 초대코드 생성: {code}")
        return code
    return None
