# API 스펙 (백엔드 → 프론트 공유)
> 백엔드팀이 관리, 프론트팀이 참조
> 엔드포인트 추가/변경 시 반드시 여기에 기록

---

## 기존 API

### 인증
| 메서드 | 경로 | 요청 | 응답 |
|--------|------|------|------|
| POST | /api/auth/owner | `{password}` | `{ok, token}` |
| POST | /api/auth/register | `{invite_code, username}` | `{ok, token}` |
| POST | /api/auth/verify | `{token}` | `{ok, user}` |

### 팀 관리
| 메서드 | 경로 | 요청 | 응답 |
|--------|------|------|------|
| GET | /api/teams | - | `{ok, data: [teams]}` |
| POST | /api/teams | `{name, emoji, desc, type}` | `{ok, data: team}` |
| DELETE | /api/teams/{id} | - | `{ok}` |
| GET | /api/teams/{id}/guide | - | `{ok, data: markdown}` |
| PUT | /api/teams/{id}/guide | `{content}` | `{ok}` |

### 모니터링
| 메서드 | 경로 | 요청 | 응답 |
|--------|------|------|------|
| GET | /api/dashboard | - | `{ok, data: dashboard}` |
| POST | /api/agents/{id}/restart | - | `{ok}` |

### 실시간
| 타입 | 경로 | 설명 |
|------|------|------|
| WS | /ws/chat/{team_id} | 팀별 실시간 채팅 |

---

## 변경 기록

| 날짜 | 변경 | 담당 |
|------|------|------|
| 2026-03-29 | 초기 스펙 문서화 | 고도화 작업 |
