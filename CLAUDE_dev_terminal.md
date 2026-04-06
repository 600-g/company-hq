# /dev 웹터미널 구축 — Claude Code 실행 지시서

## 역할
너는 두근컴퍼니(company-hq) 백엔드/프론트엔드 시니어 개발자다.
이 파일의 지시에 따라 /dev 웹터미널 기능을 구축한다.

## 작업 전 필수 확인
1. 현재 경로: `~/Developer/my-company/company-hq/`
2. 백엔드 실행 중인지 확인: `curl http://localhost:8000/api/dashboard`
3. 기존 파일 절대 삭제/덮어쓰기 금지 — 추가/수정만

---

## 전체 작업 순서

### STEP 1 — ttyd 설치 및 설정

```bash
# 1-1. ttyd 설치
brew install ttyd

# 1-2. 설치 확인
ttyd --version

# 1-3. 테스트 실행 (포트 7681)
ttyd -p 7681 -W bash
# 브라우저에서 http://localhost:7681 접속 확인 후 Ctrl+C
```

### STEP 2 — ttyd LaunchAgent 등록 (자동시작)

`scripts/com.ttyd.plist` 파일을 아래 내용으로 생성:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.ttyd</string>
  <key>ProgramArguments</key>
  <array>
    <string>/opt/homebrew/bin/ttyd</string>
    <string>-p</string>
    <string>7681</string>
    <string>-W</string>
    <string>-t</string>
    <string>fontSize=14</string>
    <string>-t</string>
    <string>theme={"background":"#080818","foreground":"#c8c8d8","cursor":"#f5c842"}</string>
    <string>bash</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/tmp/ttyd.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/ttyd.err</string>
</dict>
</plist>
```

그 다음 LaunchAgent 등록:
```bash
cp scripts/com.ttyd.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.ttyd.plist
launchctl start com.ttyd
# 확인
curl -s http://localhost:7681 | head -5
```

### STEP 3 — Cloudflare Tunnel 설정 추가

`~/.cloudflared/config.yml` 파일을 열어서 ingress 항목에 추가:

```yaml
# 기존 내용 유지하고 아래 항목 추가 (api.600g.net 항목 위에 삽입)
- hostname: terminal.600g.net
  service: http://localhost:7681
```

터널 재시작:
```bash
launchctl stop com.cloudflared
launchctl start com.cloudflared
# 확인 (30초 후)
curl -s https://terminal.600g.net | head -5
```

### STEP 4 — 백엔드: 팀별 터미널 세션 API 추가

`server/ttyd_manager.py` 신규 생성:

```python
import subprocess
import os
import json
import signal
from pathlib import Path

TEAMS_FILE = Path(__file__).parent / "teams.json"
BASE_DIR = Path.home() / "Developer" / "my-company"
BASE_PORT = 7700  # 팀별 포트: 7700, 7701, 7702...

# 실행 중인 팀별 ttyd 프로세스
_sessions: dict[str, dict] = {}

def load_teams() -> list[dict]:
    with open(TEAMS_FILE) as f:
        return json.load(f)

def get_team_port(team_id: str) -> int:
    teams = load_teams()
    for i, t in enumerate(teams):
        if t["id"] == team_id:
            return BASE_PORT + i
    return BASE_PORT

def get_team_dir(team_id: str) -> str:
    teams = load_teams()
    for t in teams:
        if t["id"] == team_id:
            repo = t.get("github_repo", team_id)
            path = BASE_DIR / repo
            if path.exists():
                return str(path)
    return str(BASE_DIR)

def start_team_terminal(team_id: str) -> dict:
    """팀별 ttyd 세션 시작. 이미 있으면 기존 포트 반환."""
    if team_id in _sessions:
        proc = _sessions[team_id]["process"]
        if proc.poll() is None:  # 살아있음
            return {"port": _sessions[team_id]["port"], "status": "running"}

    port = get_team_port(team_id)
    team_dir = get_team_dir(team_id)

    # 팀 디렉토리에서 bash 시작하는 init 스크립트
    init_script = f"""cd {team_dir} && echo "✓ {team_id} 팀 디렉토리: {team_dir}" && echo "✓ claude 명령어로 에이전트 시작" && bash"""

    proc = subprocess.Popen([
        "/opt/homebrew/bin/ttyd",
        "-p", str(port),
        "-W",
        "-t", "fontSize=14",
        "-t", 'theme={"background":"#080818","foreground":"#c8c8d8","cursor":"#f5c842"}',
        "bash", "-c", init_script
    ])

    _sessions[team_id] = {"process": proc, "port": port, "dir": team_dir}
    return {"port": port, "status": "started"}

def stop_team_terminal(team_id: str):
    if team_id in _sessions:
        proc = _sessions[team_id]["process"]
        if proc.poll() is None:
            proc.terminate()
        del _sessions[team_id]

def get_session_info(team_id: str) -> dict:
    if team_id not in _sessions:
        return {"status": "stopped"}
    proc = _sessions[team_id]["process"]
    if proc.poll() is not None:
        del _sessions[team_id]
        return {"status": "stopped"}
    return {
        "status": "running",
        "port": _sessions[team_id]["port"],
        "dir": _sessions[team_id]["dir"]
    }
```

### STEP 5 — 백엔드: main.py에 터미널 API 엔드포인트 추가

`server/main.py` 열어서 기존 import 아래에 추가:

```python
from ttyd_manager import start_team_terminal, stop_team_terminal, get_session_info
```

라우터 섹션에 추가 (기존 라우터 건드리지 말고 아래에 추가):

```python
@app.post("/api/terminal/{team_id}/start")
async def start_terminal(team_id: str, user=Depends(get_current_user)):
    """팀별 웹터미널 세션 시작"""
    result = start_team_terminal(team_id)
    return result

@app.delete("/api/terminal/{team_id}/stop")
async def stop_terminal(team_id: str, user=Depends(get_current_user)):
    """팀별 웹터미널 세션 종료"""
    stop_team_terminal(team_id)
    return {"status": "stopped"}

@app.get("/api/terminal/{team_id}/status")
async def terminal_status(team_id: str, user=Depends(get_current_user)):
    """팀별 터미널 세션 상태 확인"""
    return get_session_info(team_id)
```

서버 재시작:
```bash
# uvicorn 재시작 (reload 모드면 자동)
curl http://localhost:8000/api/terminal/test/status
```

### STEP 6 — 프론트엔드: DevTerminal.tsx 생성

`ui/app/components/DevTerminal.tsx` 신규 생성:

```tsx
'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

interface Team {
  id: string
  name: string
  emoji: string
  github_repo?: string
}

interface DevTerminalProps {
  team: Team
  onClose?: () => void
}

export default function DevTerminal({ team, onClose }: DevTerminalProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [port, setPort] = useState<number | null>(null)
  const [errorMsg, setErrorMsg] = useState('')

  const startTerminal = useCallback(async () => {
    setStatus('loading')
    try {
      const token = localStorage.getItem('auth_token')
      const res = await fetch(`/api/terminal/${team.id}/start`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) throw new Error('터미널 시작 실패')
      const data = await res.json()
      setPort(data.port)
      // ttyd 준비될 때까지 잠깐 대기
      setTimeout(() => setStatus('ready'), 1200)
    } catch (e: any) {
      setErrorMsg(e.message)
      setStatus('error')
    }
  }, [team.id])

  useEffect(() => {
    startTerminal()
    return () => {
      // 언마운트 시 세션 종료
      const token = localStorage.getItem('auth_token')
      fetch(`/api/terminal/${team.id}/stop`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      }).catch(() => {})
    }
  }, [team.id])

  const terminalUrl = port
    ? `http://localhost:${port}`
    : null

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: '#1a1a2e',
      borderRadius: '8px',
      overflow: 'hidden',
      border: '1px solid #2a2a5a'
    }}>
      {/* 헤더 */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '8px 14px',
        background: '#0f0f1f',
        borderBottom: '1px solid #2a2a5a',
        flexShrink: 0
      }}>
        {/* 신호등 */}
        <div style={{ display: 'flex', gap: '5px' }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff5f57' }} />
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ffbd2e' }} />
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#28c940' }} />
        </div>

        <span style={{ fontSize: 13, color: '#888', fontFamily: 'SF Mono, monospace' }}>
          {team.emoji} {team.name}
        </span>

        <span style={{ fontSize: 10, color: '#60a0e0', fontFamily: 'SF Mono, monospace' }}>
          ~/Developer/my-company/{team.github_repo || team.id}
        </span>

        {/* 상태 */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{
            width: 7, height: 7, borderRadius: '50%',
            background: status === 'ready' ? '#50d070' : status === 'error' ? '#ff6b6b' : '#f5c842',
            animation: status === 'loading' ? 'pulse 1s infinite' : 'none'
          }} />
          <span style={{ fontSize: 10, color: '#888', fontFamily: 'SF Mono, monospace' }}>
            {status === 'loading' ? '시작 중...' : status === 'ready' ? 'READY' : 'ERROR'}
          </span>
        </div>

        {onClose && (
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: '#888',
            cursor: 'pointer', fontSize: 16, padding: '0 4px',
            lineHeight: 1
          }}>✕</button>
        )}
      </div>

      {/* 터미널 본체 */}
      <div style={{ flex: 1, position: 'relative' }}>
        {status === 'loading' && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            background: '#080818', gap: 12
          }}>
            <div style={{ fontFamily: 'SF Mono, monospace', color: '#f5c842', fontSize: 12 }}>
              ▶ {team.emoji} {team.name} 터미널 준비 중...
            </div>
            <div style={{ fontFamily: 'SF Mono, monospace', color: '#50d070', fontSize: 11 }}>
              CLAUDE.md 로드 중
            </div>
          </div>
        )}

        {status === 'error' && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            background: '#080818', gap: 12
          }}>
            <div style={{ color: '#ff6b6b', fontSize: 12, fontFamily: 'SF Mono, monospace' }}>
              ✗ {errorMsg}
            </div>
            <button onClick={startTerminal} style={{
              background: '#f5c842', color: '#1a1a2e',
              border: 'none', borderRadius: 6,
              padding: '6px 16px', fontSize: 11,
              fontWeight: 600, cursor: 'pointer'
            }}>
              재시도
            </button>
          </div>
        )}

        {status === 'ready' && terminalUrl && (
          <iframe
            ref={iframeRef}
            src={terminalUrl}
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
              display: 'block'
            }}
            allow="clipboard-read; clipboard-write"
          />
        )}
      </div>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
      `}</style>
    </div>
  )
}
```

### STEP 7 — 프론트엔드: Office.tsx에 /dev 진입 연결

`ui/app/components/Office.tsx` 열어서 팀 클릭 핸들러 찾기.
기존 ChatPanel 열던 부분을 DevTerminal로 교체:

```tsx
// 기존 import에 추가
import DevTerminal from './DevTerminal'

// 기존 상태 변수 (있으면 재사용, 없으면 추가)
const [devTeam, setDevTeam] = useState<Team | null>(null)

// 팀 클릭 핸들러에서 교체
// 기존: setSelectedTeam(team) 또는 setChatOpen(true) 등
// 교체: 
const handleTeamClick = (team: Team) => {
  setDevTeam(team)
}

// JSX에서 ChatPanel 대신 DevTerminal 렌더링
{devTeam && (
  <div style={{
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.7)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1000, padding: 20
  }}>
    <div style={{ width: '90vw', height: '85vh', maxWidth: 1200 }}>
      <DevTerminal
        team={devTeam}
        onClose={() => setDevTeam(null)}
      />
    </div>
  </div>
)}
```

### STEP 8 — 빌드 및 배포

```bash
# 프론트엔드 빌드
cd ui
npm run build

# 빌드 성공 확인 후 배포
cd ..
./deploy.sh

# 백엔드 재시작 확인
curl http://localhost:8000/api/terminal/test/status
```

---

## Git 규칙

각 스텝 완료 후 커밋:
```bash
git add .
git commit -m "STEP N 완료: 작업내용"
git push
```

전체 완료 후:
```bash
git add .
git commit -m "/dev 웹터미널 구축 완료 — ttyd + 팀별 세션 관리"
git push
```

---

## 에러 대응

| 에러 | 원인 | 해결 |
|------|------|------|
| ttyd: command not found | brew 설치 안 됨 | `brew install ttyd` |
| 포트 7681 already in use | 기존 ttyd 실행 중 | `pkill ttyd` 후 재시작 |
| iframe blocked | CORS 또는 CSP | server/main.py에 CORS 헤더 확인 |
| terminal.600g.net 안 열림 | Cloudflare Tunnel 미적용 | config.yml 확인 후 터널 재시작 |
| 팀 디렉토리 없음 | 클론 안 됨 | `git clone` 후 재시도 |

---

## 완료 기준

- [ ] `http://localhost:7681` 브라우저에서 터미널 열림
- [ ] `https://terminal.600g.net` 외부 접속 가능
- [ ] 팀 클릭 → 해당 팀 디렉토리에서 터미널 열림
- [ ] `claude --dangerously-skip-permissions` 실행 → CLAUDE.md 로드 확인
- [ ] 빌드 성공 + 배포 완료
