"use client";

import { useState } from "react";

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!nickname.trim() || !code.trim()) {
      setError("닉네임과 초대코드를 입력하세요");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${getApiBase()}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname: nickname.trim(), code: code.trim() }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || "등록 실패");
        setLoading(false);
        return;
      }
      // 토큰 저장
      localStorage.setItem("hq-auth-token", data.token);
      localStorage.setItem("hq-auth-user", JSON.stringify({
        user_id: data.user_id,
        nickname: data.nickname,
        role: data.role,
        permissions: data.permissions,
      }));
      onLogin(data);
    } catch {
      setError("서버 연결 실패");
      setLoading(false);
    }
  };

  return (
    <div className="h-screen bg-[#1a1a2e] flex flex-col items-center justify-center relative overflow-hidden">
      {/* 배경: 간단한 도시 실루엣 */}
      <div className="absolute inset-0 pointer-events-none">
        {/* 하늘 그라디언트 */}
        <div className="absolute inset-0" style={{
          background: "linear-gradient(180deg, #0a1628 0%, #1a2a48 40%, #2a3a58 70%, #1a1a2e 100%)"
        }} />
        {/* 별 */}
        {[...Array(30)].map((_, i) => (
          <div key={i} className="absolute w-[1px] h-[1px] bg-white rounded-full"
            style={{
              left: `${(i * 37 + 13) % 100}%`,
              top: `${(i * 23 + 7) % 40}%`,
              opacity: 0.3 + (i % 5) * 0.15,
            }} />
        ))}
        {/* 빌딩 실루엣 */}
        <div className="absolute bottom-0 left-0 right-0 flex items-end justify-center gap-[2px]">
          {[40, 65, 50, 80, 45, 70, 55, 90, 60, 75, 42, 68, 52, 85, 48].map((h, i) => (
            <div key={i} className="bg-[#0a0e1a] relative" style={{
              width: `${18 + (i % 3) * 8}px`,
              height: `${h + 20}px`,
              borderRadius: "2px 2px 0 0",
            }}>
              {/* 건물 창문 */}
              {[...Array(Math.floor(h / 12))].map((_, j) => (
                <div key={j} className="absolute" style={{
                  left: "3px", right: "3px",
                  top: `${6 + j * 12}px`,
                  height: "4px",
                  backgroundColor: (i + j) % 3 === 0 ? "#f0df6020" : "#f0df6008",
                }} />
              ))}
            </div>
          ))}
        </div>
        {/* 메인 빌딩 (두근컴퍼니) */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[120px] bg-[#12162a] border-x border-t border-[#2a3050] rounded-t-md"
          style={{ height: "180px" }}>
          <div className="text-center pt-3">
            <span className="text-2xl">🏢</span>
            <p className="text-[8px] text-yellow-400/60 mt-1">(주)두근 컴퍼니</p>
          </div>
          {/* 건물 창문 */}
          <div className="grid grid-cols-3 gap-1 px-3 mt-3">
            {[...Array(12)].map((_, i) => (
              <div key={i} className="h-3 rounded-[1px]"
                style={{ backgroundColor: i % 4 === 0 ? "#f0df6025" : "#1a2040" }} />
            ))}
          </div>
          {/* 입구 */}
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-10 h-8 bg-[#0a0e1a] border-t border-x border-[#3a4060] rounded-t-sm">
            <div className="w-full h-full flex items-center justify-center">
              <div className="w-[1px] h-full bg-[#3a4060]" />
            </div>
          </div>
        </div>
        {/* 바닥 */}
        <div className="absolute bottom-0 left-0 right-0 h-4 bg-[#0e1220]" />
      </div>

      {/* 로그인 카드 */}
      <div className="relative z-10 bg-[#0f0f1f]/95 border border-[#3a3a5a] rounded-xl p-6 w-[320px] shadow-2xl backdrop-blur-sm">
        <div className="text-center mb-5">
          <span className="text-3xl">🏢</span>
          <h1 className="text-sm font-bold text-yellow-400 mt-2">(주)두근 컴퍼니</h1>
          <p className="text-[10px] text-gray-500 mt-1">초대코드로 입장하세요</p>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-[9px] text-gray-500 block mb-1">닉네임</label>
            <input
              autoFocus
              value={nickname}
              onChange={e => setNickname(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !loading && submit()}
              placeholder="사무실에서 쓸 이름"
              className="w-full bg-[#1a1a2e] border border-[#3a3a5a] text-white px-3 py-2 text-xs rounded-lg
                         placeholder-gray-600 focus:outline-none focus:border-yellow-400/50"
            />
          </div>
          <div>
            <label className="text-[9px] text-gray-500 block mb-1">초대코드</label>
            <input
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === "Enter" && !loading && submit()}
              placeholder="8자리 코드"
              maxLength={8}
              className="w-full bg-[#1a1a2e] border border-[#3a3a5a] text-white px-3 py-2 text-xs rounded-lg
                         placeholder-gray-600 focus:outline-none focus:border-yellow-400/50 font-mono tracking-widest text-center"
            />
          </div>

          {error && <p className="text-[10px] text-red-400 text-center">{error}</p>}

          <button
            onClick={submit}
            disabled={loading}
            className="w-full bg-yellow-500 text-black py-2.5 text-xs font-bold rounded-lg
                       hover:bg-yellow-400 disabled:opacity-50 transition-colors"
          >
            {loading ? "입장중..." : "🚪 입장하기"}
          </button>
        </div>

        <p className="text-[8px] text-gray-700 text-center mt-4">
          초대코드가 없으면 관리자에게 문의하세요
        </p>
      </div>
    </div>
  );
}
