"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";

const LoginGame = dynamic(() => import("../game/LoginGame"), { ssr: false });

interface AuthUser {
  user_id: string; nickname: string; role: string;
  permissions: { level: number; label: string; can_code: boolean; can_create_team: boolean; can_manage: boolean };
  token: string;
}

function getApiBase(): string {
  if (typeof window === "undefined") return "";
  const h = window.location.hostname;
  const isLocal = h === "localhost" || h.startsWith("192.168.");
  return isLocal ? `http://${h}:8000` : "https://api.600g.net";
}

export default function LoginPage({ onLogin }: { onLogin: (user: AuthUser) => void }) {
  const [nickname, setNickname] = useState("");
  const [code, setCode] = useState("");
  const [ownerPw, setOwnerPw] = useState("");
  const [showOwnerPopup, setShowOwnerPopup] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submitInvite = async () => {
    if (!nickname.trim() || !code.trim()) { setError("닉네임과 초대코드를 입력하세요"); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch(`${getApiBase()}/api/auth/register`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname: nickname.trim(), code: code.trim() }),
      });
      const data = await res.json();
      if (!data.ok) { setError(data.error || "등록 실패"); setLoading(false); return; }
      localStorage.setItem("hq-auth-token", data.token);
      localStorage.setItem("hq-auth-user", JSON.stringify({ user_id: data.user_id, nickname: data.nickname, role: data.role, permissions: data.permissions }));
      onLogin(data);
    } catch { setError("서버 연결 실패"); setLoading(false); }
  };

  const submitOwner = async () => {
    if (!ownerPw.trim()) return;
    setLoading(true); setError("");
    try {
      const res = await fetch(`${getApiBase()}/api/auth/owner`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: ownerPw.trim() }),
      });
      const data = await res.json();
      if (!data.ok) { setError(data.error || "실패"); setLoading(false); return; }
      localStorage.setItem("hq-auth-token", data.token);
      localStorage.setItem("hq-auth-user", JSON.stringify({ user_id: data.user_id, nickname: data.nickname, role: data.role, permissions: data.permissions }));
      onLogin(data);
    } catch { setError("서버 연결 실패"); setLoading(false); }
  };

  return (
    <div className="h-screen relative overflow-hidden">
      {/* Phaser 게임 배경 (야외 거리) */}
      <div className="absolute inset-0">
        <LoginGame />
      </div>

      {/* 로그인 카드 (게임 위 오버레이) */}
      <div className="absolute inset-0 flex items-center justify-center z-20">
        <div className="bg-black/55 backdrop-blur-md border border-white/10 rounded-2xl p-6 w-[300px] shadow-2xl
                        animate-[fadeInUp_0.5s_ease]">
          <style>{`@keyframes fadeInUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }`}</style>

          <div className="text-center mb-5">
            <h1 className="text-base font-bold text-white cursor-default select-none"
              onDoubleClick={() => setShowOwnerPopup(true)}>
              (주)두근 컴퍼니
            </h1>
            <p className="text-[10px] text-white/50 mt-1">초대코드로 입장하세요</p>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-[9px] text-white/40 block mb-1">닉네임</label>
              <input autoFocus value={nickname} onChange={e => setNickname(e.target.value)}
                onKeyDown={e => e.key === "Enter" && !loading && submitInvite()}
                placeholder="사무실에서 쓸 이름"
                className="w-full bg-white/10 border border-white/15 text-white px-3 py-2 text-xs rounded-lg
                           placeholder-white/25 focus:outline-none focus:border-yellow-400/50" />
            </div>
            <div>
              <label className="text-[9px] text-white/40 block mb-1">초대코드</label>
              <input value={code} onChange={e => setCode(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === "Enter" && !loading && submitInvite()}
                placeholder="8자리 코드" maxLength={8}
                className="w-full bg-white/10 border border-white/15 text-white px-3 py-2 text-xs rounded-lg
                           placeholder-white/25 focus:outline-none focus:border-yellow-400/50 font-mono tracking-widest text-center" />
            </div>
            {error && <p className="text-[10px] text-red-400 text-center">{error}</p>}
            <button onClick={submitInvite} disabled={loading}
              className="w-full bg-white/90 text-black py-2.5 text-xs font-bold rounded-lg
                         hover:bg-white disabled:opacity-50 transition-colors">
              {loading ? "입장중..." : "입장하기"}
            </button>
          </div>
          <p className="text-[8px] text-white/20 text-center mt-4">초대코드가 없으면 관리자에게 문의하세요</p>
        </div>
      </div>

      {/* 오너 비밀번호 팝업 */}
      {showOwnerPopup && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60" onClick={() => setShowOwnerPopup(false)}>
          <div className="bg-[#0a0e1a]/95 border border-white/10 rounded-xl p-4 w-[240px] shadow-2xl backdrop-blur-md" onClick={e => e.stopPropagation()}>
            <input autoFocus type={showPw ? "text" : "password"} value={ownerPw} onChange={e => setOwnerPw(e.target.value)}
              onKeyDown={e => { if (e.key === "Escape") setShowOwnerPopup(false); if (e.key === "Enter") submitOwner(); }}
              placeholder="비밀번호"
              className="w-full bg-white/10 border border-white/15 text-white px-3 py-2 text-xs rounded-lg placeholder-white/25 focus:outline-none focus:border-yellow-400/50 text-center" />
            <div className="flex gap-2 mt-2">
              <button onClick={() => setShowPw(v => !v)} className="px-2 py-1.5 bg-white/5 text-white/40 rounded-lg hover:text-white transition-colors">
                {showPw ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                  </svg>
                )}
              </button>
              <button onClick={submitOwner} disabled={loading}
                className="flex-1 bg-white/10 text-white/70 py-1.5 text-[10px] rounded-lg hover:bg-white/20 transition-colors">
                {loading ? "..." : "확인"}
              </button>
            </div>
            {error && <p className="text-[9px] text-red-400 text-center mt-1">{error}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
