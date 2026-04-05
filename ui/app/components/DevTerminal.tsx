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
