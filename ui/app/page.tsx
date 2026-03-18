"use client";

import { useState, useEffect } from "react";
import Office from "./components/Office";
import LoginPage from "./components/LoginPage";

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

  return <Office user={user} onLogout={handleLogout} />;
}
