"use client";

import React, { useState, useEffect } from "react";
import Office from "./components/Office";
import LoginPage from "./components/LoginPage";
import { initDiag } from "./lib/diag";

// 진단 로그 수집 — console.info/warn/error 자동 서버 포워드 (전역 1회)
if (typeof window !== "undefined") initDiag();

// ── 에러 바운더리 (Office 크래시 시 localStorage 초기화 옵션 제공) ──
class OfficeBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div className="h-screen bg-[#1a1a2e] flex items-center justify-center">
          <div className="text-center max-w-sm">
            <span className="text-3xl">⚠️</span>
            <p className="text-sm text-red-400 mt-3 font-bold">화면 로딩 오류</p>
            <p className="text-[12px] text-gray-500 mt-1 break-all">{this.state.error.message}</p>
            <div className="flex gap-2 mt-4 justify-center">
              <button onClick={() => window.location.reload()}
                className="px-3 py-1.5 bg-[#2a2a4a] text-gray-300 text-xs rounded hover:bg-[#3a3a5a]">
                새로고침
              </button>
              <button onClick={() => {
                const keys = ["hq-floor-teams-order", "hq-chat-history", "hq-floor-layout"];
                keys.forEach(k => localStorage.removeItem(k));
                window.location.reload();
              }}
                className="px-3 py-1.5 bg-yellow-500/20 text-yellow-400 text-xs rounded hover:bg-yellow-500/30">
                캐시 초기화 + 새로고침
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

interface AuthUser {
  user_id: string;
  nickname: string;
  role: string;
  permissions: {
    level: number;
    label: string;
    can_code: boolean;
    can_create_team: boolean;
    can_manage: boolean;
  };
}

function getApiBase(): string {
  if (typeof window === "undefined") return "";
  const h = window.location.hostname;
  const isLocal = h === "localhost" || h.startsWith("192.168.");
  return isLocal ? `http://${h}:8000` : "https://api.600g.net";
}

export default function Home() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checking, setChecking] = useState(true);

  // 저장된 토큰으로 자동 로그인
  useEffect(() => {
    const token = localStorage.getItem("hq-auth-token");
    if (!token) {
      setChecking(false);
      return;
    }
    fetch(`${getApiBase()}/api/auth/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.ok) {
          setUser({
            user_id: data.user_id,
            nickname: data.nickname,
            role: data.role,
            permissions: data.permissions,
          });
        } else {
          localStorage.removeItem("hq-auth-token");
          localStorage.removeItem("hq-auth-user");
        }
        setChecking(false);
      })
      .catch(() => {
        // 서버 연결 실패 시 로컬 저장된 정보로 진입 허용
        const saved = localStorage.getItem("hq-auth-user");
        if (saved) {
          try { setUser(JSON.parse(saved)); } catch {}
        }
        setChecking(false);
      });
  }, []);

  if (checking) {
    return (
      <div className="h-screen bg-[#1a1a2e] flex items-center justify-center">
        <div className="text-center">
          <span className="text-3xl">🏢</span>
          <p className="text-xs text-gray-500 mt-2">확인중...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage onLogin={(u) => setUser(u)} />;
  }

  const handleLogout = () => {
    localStorage.removeItem("hq-auth-token");
    localStorage.removeItem("hq-auth-user");
    setUser(null);
  };

  return <OfficeBoundary><Office user={user} onLogout={handleLogout} /></OfficeBoundary>;
}
