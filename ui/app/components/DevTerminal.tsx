'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

function getApiBase(): string {
  if (typeof window === "undefined") return "https://api.600g.net";
  const h = window.location.hostname;
  const isLocal = h === "localhost" || h === "127.0.0.1" || h.endsWith(".local");
  return isLocal ? `http://${h}:8000` : "https://api.600g.net";
}

interface Team {
  id: string
  name: string
  emoji: string
  github_repo?: string
  repo?: string
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

  // 리사이즈
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 900, h: 600 })
  const resizing = useRef(false)
  const startPos = useRef({ x: 0, y: 0, w: 0, h: 0 })

  const onResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    resizing.current = true
    startPos.current = { x: e.clientX, y: e.clientY, w: size.w, h: size.h }

    const onMove = (ev: MouseEvent) => {
      if (!resizing.current) return
      const dw = ev.clientX - startPos.current.x
      const dh = ev.clientY - startPos.current.y
      setSize({
        w: Math.max(480, startPos.current.w + dw),
        h: Math.max(320, startPos.current.h + dh),
      })
    }
    const onUp = () => {
      resizing.current = false
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [size])

  const startTerminal = useCallback(async () => {
    setStatus('loading')
    try {
      const token = localStorage.getItem('auth_token')
      const res = await fetch(`${getApiBase()}/api/terminal/${team.id}/start`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) throw new Error('터미널 시작 실패')
      const data = await res.json()
      setPort(data.port)
      setTimeout(() => setStatus('ready'), 1500)
    } catch (e: any) {
      setErrorMsg(e.message)
      setStatus('error')
    }
  }, [team.id])

  useEffect(() => {
    startTerminal()
    return () => {
      const token = localStorage.getItem('auth_token')
      fetch(`${getApiBase()}/api/terminal/${team.id}/stop`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      }).catch(() => {})
    }
  }, [team.id])

  // 초기 크기: 뷰포트의 90%/85% 또는 기본값
  useEffect(() => {
    if (typeof window !== "undefined") {
      setSize({
        w: Math.min(1200, Math.floor(window.innerWidth * 0.9)),
        h: Math.min(800, Math.floor(window.innerHeight * 0.85)),
      })
    }
  }, [])

  const isLocal = typeof window !== "undefined" &&
    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1" || window.location.hostname.endsWith(".local"))

  const terminalUrl = port
    ? isLocal ? `http://localhost:${port}` : `https://terminal.600g.net`
    : null

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: size.w,
        height: size.h,
        background: '#1a1a2e',
        borderRadius: '8px',
        overflow: 'hidden',
        border: '1px solid #2a2a5a',
        position: 'relative',
      }}
    >
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
          <div
            onClick={onClose}
            style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff5f57', cursor: 'pointer' }}
            title="닫기"
          />
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ffbd2e' }} />
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#28c940' }} />
        </div>

        <span style={{ fontSize: 13, color: '#888', fontFamily: 'SF Mono, monospace' }}>
          {team.emoji} {team.name} — Claude Code
        </span>

        <span style={{ fontSize: 10, color: '#60a0e0', fontFamily: 'SF Mono, monospace' }}>
          ~/Developer/my-company/{team.repo || team.github_repo || team.id}
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
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {status === 'loading' && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            background: '#080818', gap: 12
          }}>
            <div style={{ fontFamily: 'SF Mono, monospace', color: '#f5c842', fontSize: 12 }}>
              ▶ {team.emoji} {team.name} Claude Code 시작 중...
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

      {/* 리사이즈 핸들 (우하단) */}
      <div
        onMouseDown={onResizeStart}
        style={{
          position: 'absolute',
          right: 0,
          bottom: 0,
          width: 18,
          height: 18,
          cursor: 'nwse-resize',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#555',
          fontSize: 10,
          userSelect: 'none',
        }}
      >
        ⌟
      </div>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
      `}</style>
    </div>
  )
}
