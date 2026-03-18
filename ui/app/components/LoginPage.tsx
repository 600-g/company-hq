"use client";

import { useState, useEffect } from "react";

interface AuthUser {
  user_id: string;
  nickname: string;
  role: string;
  permissions: { level: number; label: string; can_code: boolean; can_create_team: boolean; can_manage: boolean };
  token: string;
}

function getApiBase(): string {
  if (typeof window === "undefined") return "";
  const h = window.location.hostname;
  const isLocal = h === "localhost" || h.startsWith("192.168.");
  return isLocal ? `http://${h}:8000` : "https://api.600g.net";
}

// 계절/시간대 감지
function getSeasonTime() {
  const now = new Date();
  const mon = now.getMonth() + 1;
  const hr = now.getHours();
  const season = mon >= 3 && mon <= 5 ? "spring" : mon >= 6 && mon <= 8 ? "summer" : mon >= 9 && mon <= 11 ? "autumn" : "winter";
  const time = hr >= 6 && hr < 17 ? "day" : hr >= 17 && hr < 20 ? "sunset" : "night";
  return { season, time };
}

export default function LoginPage({ onLogin }: { onLogin: (user: AuthUser) => void }) {
  const [nickname, setNickname] = useState("");
  const [code, setCode] = useState("");
  const [ownerPw, setOwnerPw] = useState("");
  const [showOwnerPopup, setShowOwnerPopup] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const { season, time } = getSeasonTime();
  // 로그인 배경: 밤이면 night, 아니면 계절
  const loginBg = time === "night" ? "/assets/gen/login_night.png" : `/assets/gen/login_${season}.png`;

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

  // 날씨 가져오기
  const [weather, setWeather] = useState<string>("clear");
  useEffect(() => {
    fetch("https://api.open-meteo.com/v1/forecast?latitude=37.5665&longitude=126.978&current=weather_code&timezone=Asia/Seoul")
      .then(r => r.json())
      .then(d => {
        const wc = d.current?.weather_code ?? 0;
        if (wc >= 51 && wc <= 82) setWeather("rain");
        else if (wc >= 71 && wc <= 77) setWeather("snow");
        else if (wc >= 95) setWeather("thunder");
        else setWeather("clear");
      }).catch(() => {});
  }, []);

  return (
    <div className="h-screen relative overflow-hidden">
      {/* ── 배경 이미지 (계절/시간대별) ── */}
      <div className="absolute inset-0">
        <img src={loginBg} alt="" className="w-full h-full object-cover" />
        {/* 어두운 오버레이 (밤) */}
        {time === "night" && <div className="absolute inset-0 bg-black/20" />}
        {time === "sunset" && <div className="absolute inset-0 bg-orange-900/10" />}
      </div>

      {/* ── 움직이는 구름 ── */}
      <style>{`
        @keyframes cloudDrift { from { transform: translateX(-100%); } to { transform: translateX(100vw); } }
        @keyframes cloudDrift2 { from { transform: translateX(100vw); } to { transform: translateX(-100%); } }
        @keyframes treeSway { 0%,100% { transform: rotate(0deg); } 50% { transform: rotate(1.5deg); } }
        @keyframes treeSwayR { 0%,100% { transform: rotate(0deg); } 50% { transform: rotate(-1.2deg); } }
        @keyframes walkRight { from { transform: translateX(-30px); } to { transform: translateX(calc(100vw + 30px)); } }
        @keyframes walkLeft { from { transform: translateX(calc(100vw + 30px)); } to { transform: translateX(-30px); } }
        @keyframes rainFall { from { transform: translateY(-10px); } to { transform: translateY(100vh); } }
        @keyframes snowFall { 0% { transform: translateY(-10px) translateX(0); } 50% { transform: translateY(50vh) translateX(15px); } 100% { transform: translateY(100vh) translateX(-5px); } }
        @keyframes fadeInUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
      `}</style>

      {weather === "clear" && (
        <>
          <div className="absolute top-[5%] opacity-30" style={{ animation: "cloudDrift 60s linear infinite" }}>
            <img src="/assets/gen/clouds.png" alt="" className="h-[60px] w-auto" />
          </div>
          <div className="absolute top-[12%] opacity-20" style={{ animation: "cloudDrift2 80s linear 10s infinite" }}>
            <img src="/assets/gen/clouds.png" alt="" className="h-[40px] w-auto" />
          </div>
        </>
      )}

      {/* ── 비 효과 ── */}
      {weather === "rain" && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {[...Array(40)].map((_, i) => (
            <div key={i} className="absolute w-[1px] bg-blue-300/30" style={{
              left: `${(i * 2.5) % 100}%`,
              height: `${12 + (i % 5) * 4}px`,
              animation: `rainFall ${0.5 + (i % 4) * 0.15}s linear ${i * 0.05}s infinite`,
            }} />
          ))}
          <div className="absolute inset-0 bg-blue-900/15" />
        </div>
      )}

      {/* ── 눈 효과 ── */}
      {weather === "snow" && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {[...Array(30)].map((_, i) => (
            <div key={i} className="absolute rounded-full bg-white/60" style={{
              left: `${(i * 3.3) % 100}%`,
              width: `${2 + (i % 3)}px`,
              height: `${2 + (i % 3)}px`,
              animation: `snowFall ${3 + (i % 5)}s linear ${i * 0.2}s infinite`,
            }} />
          ))}
        </div>
      )}

      {/* ── 나무 흔들림 (배경 위 오버레이) ── */}
      {/* CSS로 배경 이미지 위 특정 영역에 sway 효과 */}

      {/* ── 로그인 카드 ── */}
      <div className="absolute inset-0 flex items-center justify-center z-10" style={{ animation: "fadeInUp 0.5s ease" }}>
        <div className="bg-black/60 backdrop-blur-md border border-white/10 rounded-2xl p-6 w-[300px] shadow-2xl">
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
                           placeholder-white/25 focus:outline-none focus:border-yellow-400/50 backdrop-blur-sm" />
            </div>
            <div>
              <label className="text-[9px] text-white/40 block mb-1">초대코드</label>
              <input value={code} onChange={e => setCode(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === "Enter" && !loading && submitInvite()}
                placeholder="8자리 코드" maxLength={8}
                className="w-full bg-white/10 border border-white/15 text-white px-3 py-2 text-xs rounded-lg
                           placeholder-white/25 focus:outline-none focus:border-yellow-400/50 font-mono tracking-widest text-center backdrop-blur-sm" />
            </div>
            {error && <p className="text-[10px] text-red-400 text-center">{error}</p>}
            <button onClick={submitInvite} disabled={loading}
              className="w-full bg-white/90 text-black py-2.5 text-xs font-bold rounded-lg
                         hover:bg-white disabled:opacity-50 transition-colors">
              {loading ? "입장중..." : "입장하기"}
            </button>
          </div>
          <p className="text-[8px] text-white/20 text-center mt-4">초대코드가 없으면 관리자에게 문의하세요</p>

          {/* 오너 비밀번호 팝업 */}
          {showOwnerPopup && (
            <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60" onClick={() => setShowOwnerPopup(false)}>
              <div className="bg-[#0a0e1a]/95 border border-white/10 rounded-xl p-4 w-[240px] shadow-2xl backdrop-blur-md" onClick={e => e.stopPropagation()}>
                <input autoFocus type={showPw ? "text" : "password"} value={ownerPw} onChange={e => setOwnerPw(e.target.value)}
                  onKeyDown={e => { if (e.key === "Escape") setShowOwnerPopup(false); if (e.key === "Enter") submitOwner(); }}
                  placeholder="비밀번호"
                  className="w-full bg-white/10 border border-white/15 text-white px-3 py-2 text-xs rounded-lg
                             placeholder-white/25 focus:outline-none focus:border-yellow-400/50 text-center" />
                <div className="flex gap-2 mt-2">
                  <button onClick={() => setShowPw(v => !v)}
                    className="px-2 py-1.5 bg-white/5 text-white/40 rounded-lg hover:text-white transition-colors">
                    {showPw ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                        <line x1="1" y1="1" x2="23" y2="23"/>
                      </svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                        <circle cx="12" cy="12" r="3"/>
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
      </div>
    </div>
  );
}
