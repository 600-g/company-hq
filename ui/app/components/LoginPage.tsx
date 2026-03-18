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

  // 건물 데이터 (좌→우, 높이%, 폭px)
  const buildings = [
    { h: 35, w: 40 }, { h: 55, w: 32 }, { h: 42, w: 36 }, { h: 65, w: 28 },
    { h: 48, w: 34 }, { h: 72, w: 30 }, { h: 38, w: 38 },
    // 메인 빌딩은 별도 렌더
    { h: 50, w: 36 }, { h: 68, w: 30 }, { h: 44, w: 34 },
    { h: 58, w: 32 }, { h: 40, w: 38 }, { h: 62, w: 28 }, { h: 36, w: 40 },
  ];

  // 사람 애니메이션 데이터
  const people = [
    { x: 12, speed: 18, delay: 0 },
    { x: 30, speed: 22, delay: 3 },
    { x: 55, speed: 15, delay: 7 },
    { x: 75, speed: 20, delay: 1 },
    { x: 88, speed: 17, delay: 5 },
  ];

  return (
    <div className="h-screen bg-[#0a1020] flex items-end justify-center relative overflow-hidden">
      {/* ── 하늘 ── */}
      <div className="absolute inset-0" style={{
        background: "linear-gradient(180deg, #060d1a 0%, #0e1a30 25%, #1a2848 50%, #1e3050 75%, #1a2040 100%)"
      }} />

      {/* 별 */}
      {[...Array(50)].map((_, i) => (
        <div key={i} className="absolute bg-white rounded-full"
          style={{
            width: i % 7 === 0 ? "2px" : "1px",
            height: i % 7 === 0 ? "2px" : "1px",
            left: `${(i * 31 + 7) % 100}%`,
            top: `${(i * 19 + 3) % 35}%`,
            opacity: 0.2 + (i % 6) * 0.12,
          }} />
      ))}

      {/* 달 */}
      <div className="absolute top-[8%] right-[15%] w-8 h-8 rounded-full bg-[#f0e8cc] shadow-[0_0_20px_#f0e8cc40,0_0_60px_#f0e8cc15]" />

      {/* ── 뒤쪽 빌딩 (어두운, 작은) ── */}
      <div className="absolute bottom-[15%] left-0 right-0 flex items-end justify-center gap-[1px] px-2">
        {[28, 45, 35, 52, 30, 48, 38, 55, 32, 50, 28, 42, 36, 50, 32, 46, 30, 40, 34, 48].map((h, i) => (
          <div key={`bg-${i}`} className="flex-1 max-w-[40px] relative" style={{
            height: `${h * 0.8}%`,
            backgroundColor: "#080c16",
            borderRadius: "1px 1px 0 0",
          }}>
            {[...Array(Math.floor(h / 10))].map((_, j) => (
              <div key={j} className="absolute" style={{
                left: "20%", right: "20%",
                top: `${10 + j * (100 / Math.max(Math.floor(h / 10), 1))}%`,
                height: "3px",
                backgroundColor: (i + j) % 4 === 0 ? "#f0df6012" : "#f0df6006",
              }} />
            ))}
          </div>
        ))}
      </div>

      {/* ── 앞쪽 빌딩 (밝은, 큰) ── */}
      <div className="absolute bottom-[8%] left-0 right-0 flex items-end gap-[2px] px-1">
        {buildings.slice(0, 7).map((b, i) => (
          <div key={`l-${i}`} className="flex-1 relative" style={{
            height: `${b.h}%`,
            backgroundColor: "#0c1020",
            borderRadius: "2px 2px 0 0",
            borderTop: "1px solid #1a2040",
            borderLeft: "1px solid #151a30",
            borderRight: "1px solid #151a30",
          }}>
            {/* 창문 그리드 */}
            <div className="absolute inset-x-[4px] top-[8px] bottom-[4px] grid grid-cols-2 gap-y-[6px] gap-x-[3px]">
              {[...Array(Math.floor(b.h / 8))].map((_, j) => (
                <div key={j} className="rounded-[0.5px]" style={{
                  height: "5px",
                  backgroundColor: (i * 3 + j) % 5 === 0 ? "#f0df6022" : (i + j) % 3 === 0 ? "#4080c018" : "#0a0e18",
                }} />
              ))}
            </div>
          </div>
        ))}

        {/* ── 메인 빌딩 (두근컴퍼니) ── */}
        <div className="flex-[2] relative mx-1" style={{
          height: "55%",
          backgroundColor: "#10152a",
          borderRadius: "3px 3px 0 0",
          border: "1px solid #2a3055",
          borderBottom: "none",
        }}>
          {/* 간판 */}
          <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-[#1a2040] border border-[#3a4060] rounded px-3 py-1">
            <p className="text-[9px] text-yellow-400 font-bold whitespace-nowrap">(주)두근 컴퍼니</p>
          </div>
          {/* 창문 */}
          <div className="absolute inset-x-[6px] top-[28px] bottom-[30px] grid grid-cols-3 gap-[4px]">
            {[...Array(15)].map((_, j) => (
              <div key={j} className="rounded-[1px]" style={{
                backgroundColor: j % 4 === 0 ? "#f0df6028" : j % 3 === 1 ? "#4080c020" : "#0e1428",
              }} />
            ))}
          </div>
          {/* 입구 */}
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[36px] h-[26px] bg-[#080c18] border-t border-x border-[#3a4060] rounded-t-sm">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-[1px] h-full bg-[#2a3050]" />
            </div>
            {/* 입구 불빛 */}
            <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-1 bg-yellow-400/30 rounded-full blur-[2px]" />
          </div>
        </div>

        {buildings.slice(7).map((b, i) => (
          <div key={`r-${i}`} className="flex-1 relative" style={{
            height: `${b.h}%`,
            backgroundColor: "#0c1020",
            borderRadius: "2px 2px 0 0",
            borderTop: "1px solid #1a2040",
            borderLeft: "1px solid #151a30",
            borderRight: "1px solid #151a30",
          }}>
            <div className="absolute inset-x-[4px] top-[8px] bottom-[4px] grid grid-cols-2 gap-y-[6px] gap-x-[3px]">
              {[...Array(Math.floor(b.h / 8))].map((_, j) => (
                <div key={j} className="rounded-[0.5px]" style={{
                  height: "5px",
                  backgroundColor: (i * 5 + j) % 5 === 0 ? "#f0df6022" : (i + j) % 3 === 0 ? "#4080c018" : "#0a0e18",
                }} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* ── 도로 ── */}
      <div className="absolute bottom-0 left-0 right-0 h-[8%] bg-[#101420]">
        {/* 인도 */}
        <div className="absolute top-0 left-0 right-0 h-[30%] bg-[#181e30]" />
        {/* 도로 중앙선 */}
        <div className="absolute top-[55%] left-0 right-0 h-[2px] flex gap-3">
          {[...Array(20)].map((_, i) => (
            <div key={i} className="flex-1 bg-[#f0df6018] rounded" />
          ))}
        </div>
        {/* 가로등 */}
        {[15, 40, 65, 90].map((x, i) => (
          <div key={i} className="absolute" style={{ left: `${x}%`, bottom: "100%" }}>
            <div className="w-[2px] h-[24px] bg-[#2a3050] mx-auto" />
            <div className="w-[8px] h-[3px] bg-[#3a4060] rounded-full mx-auto -mt-[1px]" />
            <div className="w-[6px] h-[4px] bg-yellow-400/20 rounded-full mx-auto blur-[3px]" />
          </div>
        ))}
      </div>

      {/* ── 나무 ── */}
      {[8, 22, 47, 63, 78, 93].map((x, i) => (
        <div key={`tree-${i}`} className="absolute" style={{ left: `${x}%`, bottom: "8%" }}>
          <div className="relative">
            {/* 줄기 */}
            <div className="w-[3px] h-[10px] bg-[#2a1a10] mx-auto" />
            {/* 수관 (겹친 원) */}
            <div className="absolute -top-[14px] left-1/2 -translate-x-1/2">
              <div className="w-[12px] h-[10px] bg-[#0c2010] rounded-full absolute -left-[2px] top-[2px]" />
              <div className="w-[14px] h-[12px] bg-[#0e2812] rounded-full absolute -left-[3px] -top-[2px]" />
              <div className="w-[10px] h-[9px] bg-[#102a14] rounded-full absolute left-[2px] -top-[1px]" />
            </div>
          </div>
        </div>
      ))}

      {/* ── 걸어다니는 사람들 ── */}
      <style>{`
        @keyframes walkRight { from { transform: translateX(-20px); } to { transform: translateX(calc(100vw + 20px)); } }
        @keyframes walkLeft { from { transform: translateX(calc(100vw + 20px)); } to { transform: translateX(-20px); } }
      `}</style>
      {people.map((p, i) => (
        <div key={`person-${i}`} className="absolute" style={{
          bottom: `${8.5 + (i % 2) * 0.8}%`,
          animation: `${i % 2 === 0 ? "walkRight" : "walkLeft"} ${p.speed}s linear ${p.delay}s infinite`,
        }}>
          {/* 머리 */}
          <div className="w-[4px] h-[4px] bg-[#d0b890] rounded-full mx-auto" />
          {/* 몸 */}
          <div className="w-[4px] h-[6px] mx-auto" style={{
            backgroundColor: ["#3a5080", "#804040", "#406040", "#605040", "#404080"][i],
          }} />
          {/* 다리 */}
          <div className="flex gap-[1px] justify-center">
            <div className="w-[1px] h-[3px] bg-[#1a1a2a]" />
            <div className="w-[1px] h-[3px] bg-[#1a1a2a]" />
          </div>
        </div>
      ))}

      {/* ── 로그인 카드 (건물 위에 오버레이) ── */}
      <div className="absolute inset-0 flex items-center justify-center z-10">
        <div className="bg-[#0a0e1a]/90 border border-[#2a3050] rounded-xl p-6 w-[300px] shadow-2xl backdrop-blur-md">
          <div className="text-center mb-5">
            <h1 className="text-sm font-bold text-yellow-400">(주)두근 컴퍼니</h1>
            <p className="text-[10px] text-gray-500 mt-1">초대코드로 입장하세요</p>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-[9px] text-gray-500 block mb-1">닉네임</label>
              <input autoFocus value={nickname} onChange={e => setNickname(e.target.value)}
                onKeyDown={e => e.key === "Enter" && !loading && submit()}
                placeholder="사무실에서 쓸 이름"
                className="w-full bg-[#101828] border border-[#2a3050] text-white px-3 py-2 text-xs rounded-lg
                           placeholder-gray-600 focus:outline-none focus:border-yellow-400/50" />
            </div>
            <div>
              <label className="text-[9px] text-gray-500 block mb-1">초대코드</label>
              <input value={code} onChange={e => setCode(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === "Enter" && !loading && submit()}
                placeholder="8자리 코드" maxLength={8}
                className="w-full bg-[#101828] border border-[#2a3050] text-white px-3 py-2 text-xs rounded-lg
                           placeholder-gray-600 focus:outline-none focus:border-yellow-400/50 font-mono tracking-widest text-center" />
            </div>
            {error && <p className="text-[10px] text-red-400 text-center">{error}</p>}
            <button onClick={submit} disabled={loading}
              className="w-full bg-yellow-500 text-black py-2.5 text-xs font-bold rounded-lg
                         hover:bg-yellow-400 disabled:opacity-50 transition-colors">
              {loading ? "입장중..." : "입장하기"}
            </button>
          </div>
          <p className="text-[8px] text-gray-700 text-center mt-4">초대코드가 없으면 관리자에게 문의하세요</p>
        </div>
      </div>
    </div>
  );
}
