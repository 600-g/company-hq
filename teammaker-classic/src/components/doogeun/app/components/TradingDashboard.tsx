"use client";

import { useState, useEffect, useCallback } from "react";

function getApiBase(): string {
  if (typeof window === "undefined") return "";
  const h = window.location.hostname;
  const isLocal = h === "localhost" || h.startsWith("192.168.");
  return isLocal ? `http://${h}:8000` : "https://api.600g.net";
}

interface Position {
  coin: string;
  batch: string;
  buy_price: number;
  amount: number;
  profit_rate: number;
  cur_price: number;
  cur_amount: number;
  hold_min: number;
}

interface RecentTrade {
  time: string;
  coin: string;
  profit: number;
  profit_rate: number;
  batch: string;
}

interface StatusData {
  ok: boolean;
  balance: number;
  krw_balance: number;
  pos_value: number;
  total_pnl: number;
  total_asset_pnl: number;
  total_trades: number;
  wins: number;
  losses: number;
  draws: number;
  win_rate: number;
  today_pnl: number;
  today_trades: number;
  today_wr: number;
  positions: Position[];
  recent: RecentTrade[];
  bot_running: boolean;
  bot_mode: string;
  market?: { grade: string; color: string; btc_chg: number; alt_chg: number };
  momentum?: { top10: { coin: string; score: number }[] };
  equity_curve?: { date: string; equity: number }[];
  updated: string;
}

function fmt(n: number): string {
  return n.toLocaleString("ko-KR", { maximumFractionDigits: 0 });
}

function pnlColor(n: number): string {
  if (n > 0) return "text-red-400";   // 한국식: 빨강=상승
  if (n < 0) return "text-blue-400";  // 파랑=하락
  return "text-gray-400";
}

function pnlSign(n: number): string {
  return n > 0 ? `+${fmt(n)}` : fmt(n);
}

export default function TradingDashboard({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"overview" | "positions" | "recent">("overview");
  const [switching, setSwitching] = useState(false);

  const switchMode = useCallback(async (toReal: boolean) => {
    const target = toReal ? "real" : "demo";
    let pin = "";
    if (toReal) {
      pin = window.prompt("⚠️ REAL 모드 전환\n실제 자금으로 거래됩니다.\n\nPIN 4자리를 입력하세요:") || "";
      if (pin.length !== 4) return;
    } else {
      if (!window.confirm("DEMO 모드로 전환하시겠습니까?")) return;
    }
    setSwitching(true);
    try {
      const res = await fetch(`${getApiBase()}/api/trading-bot/mode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: target, pin }),
      });
      const d = await res.json();
      if (d.ok) {
        // 30초간 폴링하며 모드 변경 확인
        const start = Date.now();
        const poll = setInterval(async () => {
          if (Date.now() - start > 30000) { clearInterval(poll); setSwitching(false); return; }
          try {
            const sr = await fetch(`${getApiBase()}/api/trading-bot/status`);
            const sd = await sr.json();
            if (sd.bot_mode === target) {
              setData(sd as StatusData);
              clearInterval(poll);
              setSwitching(false);
            }
          } catch { /* ignore */ }
        }, 3000);
      } else {
        window.alert(d.error || "전환 실패");
        setSwitching(false);
      }
    } catch {
      setSwitching(false);
    }
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`${getApiBase()}/api/trading-bot/status`);
      const d = await res.json();
      if (d.ok !== false) setData(d as StatusData);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    const iv = setInterval(fetchData, 30000); // 30초마다 갱신
    return () => clearInterval(iv);
  }, [fetchData]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  if (loading) {
    return (
      <div className="absolute inset-0 z-50 bg-[#0a0a18]/95 flex items-center justify-center rounded-lg">
        <span className="text-gray-400 text-sm animate-pulse">로딩 중...</span>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="absolute inset-0 z-50 bg-[#0a0a18]/95 flex flex-col items-center justify-center rounded-lg gap-2">
        <span className="text-gray-500 text-sm">데이터 없음</span>
        <button onClick={onClose} className="text-[12px] text-gray-600 hover:text-white">닫기</button>
      </div>
    );
  }

  const tabBtn = (id: typeof tab, label: string) => (
    <button
      onClick={() => setTab(id)}
      className={`text-[12px] px-2 py-1 rounded transition-colors ${
        tab === id
          ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30"
          : "text-gray-500 hover:text-gray-300"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="absolute inset-0 z-50 bg-[#0a0a18]/98 flex flex-col rounded-lg overflow-hidden">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#2a2a5a] shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-semibold text-white">📊 매매봇 대시보드</span>
          <span className={`text-[13px] px-1.5 py-0.5 rounded border ${
            data.bot_running
              ? "bg-green-900/30 text-green-400 border-green-800"
              : "bg-red-900/30 text-red-400 border-red-800"
          }`}>
            {data.bot_running ? "실행중" : "중지"}
          </span>
          {/* 모드 토글 */}
          <button
            onClick={() => switchMode(data.bot_mode !== "real")}
            disabled={switching}
            className={`text-[13px] px-2 py-0.5 rounded border font-mono transition-colors ${
              switching ? "opacity-50 cursor-wait" :
              data.bot_mode === "real"
                ? "bg-red-900/30 text-red-400 border-red-800 hover:bg-red-900/50"
                : "bg-gray-800/50 text-gray-400 border-gray-700 hover:bg-gray-700/50"
            }`}
          >
            {switching ? "전환중..." : data.bot_mode?.toUpperCase()}
          </button>
        </div>
        <button onClick={onClose} className="text-gray-500 hover:text-white text-sm transition-colors">✕</button>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 px-3 py-1.5 border-b border-[#1a1a3a] shrink-0">
        {tabBtn("overview", "요약")}
        {tabBtn("positions", `포지션 (${data.positions?.length || 0})`)}
        {tabBtn("recent", "최근 거래")}
      </div>

      {/* 콘텐츠 */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3 text-[13px]">
        {tab === "overview" && (
          <>
            {/* 총 자산 카드 */}
            <div className="bg-[#12122a] rounded-lg p-3 border border-[#2a2a5a]">
              <div className="text-gray-500 text-[13px] mb-1">총 자산</div>
              <div className="text-[18px] font-bold text-white">{fmt(data.balance)}원</div>
              <div className={`text-[12px] font-mono ${pnlColor(data.total_asset_pnl)}`}>
                {pnlSign(data.total_asset_pnl)}원
              </div>
            </div>

            {/* 오늘 성적 */}
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-[#12122a] rounded-lg p-2 border border-[#1a1a3a] text-center">
                <div className="text-gray-600 text-[13px]">오늘 손익</div>
                <div className={`text-[13px] font-mono font-bold ${pnlColor(data.today_pnl)}`}>
                  {pnlSign(data.today_pnl)}
                </div>
              </div>
              <div className="bg-[#12122a] rounded-lg p-2 border border-[#1a1a3a] text-center">
                <div className="text-gray-600 text-[13px]">오늘 거래</div>
                <div className="text-[13px] font-mono font-bold text-white">{data.today_trades}건</div>
              </div>
              <div className="bg-[#12122a] rounded-lg p-2 border border-[#1a1a3a] text-center">
                <div className="text-gray-600 text-[13px]">오늘 승률</div>
                <div className="text-[13px] font-mono font-bold text-white">{data.today_wr?.toFixed(0) || 0}%</div>
              </div>
            </div>

            {/* 전체 통계 */}
            <div className="bg-[#12122a] rounded-lg p-3 border border-[#1a1a3a]">
              <div className="text-gray-500 text-[13px] mb-2">전체 성적</div>
              <div className="grid grid-cols-2 gap-y-1.5 text-[12px]">
                <div className="text-gray-500">거래 수</div>
                <div className="text-white text-right font-mono">{data.total_trades}건</div>
                <div className="text-gray-500">승/패/무</div>
                <div className="text-right font-mono">
                  <span className="text-red-400">{data.wins}</span>
                  <span className="text-gray-600">/</span>
                  <span className="text-blue-400">{data.losses}</span>
                  <span className="text-gray-600">/</span>
                  <span className="text-gray-400">{data.draws}</span>
                </div>
                <div className="text-gray-500">승률</div>
                <div className="text-white text-right font-mono">{data.win_rate?.toFixed(1)}%</div>
                <div className="text-gray-500">누적 손익</div>
                <div className={`text-right font-mono ${pnlColor(data.total_pnl)}`}>{pnlSign(data.total_pnl)}원</div>
              </div>
            </div>

            {/* 시장 상태 */}
            {data.market && (
              <div className="bg-[#12122a] rounded-lg p-3 border border-[#1a1a3a]">
                <div className="text-gray-500 text-[13px] mb-2">시장 상태</div>
                <div className="flex items-center gap-2">
                  <span className="text-[14px] font-bold" style={{ color: data.market.color }}>
                    {data.market.grade}
                  </span>
                  <div className="text-[12px] font-mono ml-auto">
                    <span className="text-gray-500">BTC</span>{" "}
                    <span className={pnlColor(data.market.btc_chg)}>{data.market.btc_chg > 0 ? "+" : ""}{data.market.btc_chg?.toFixed(1)}%</span>
                    <span className="text-gray-700 mx-1">|</span>
                    <span className="text-gray-500">ALT</span>{" "}
                    <span className={pnlColor(data.market.alt_chg)}>{data.market.alt_chg > 0 ? "+" : ""}{data.market.alt_chg?.toFixed(1)}%</span>
                  </div>
                </div>
              </div>
            )}

            {/* 업데이트 시각 */}
            <div className="text-[13px] text-gray-600 text-right">갱신: {data.updated}</div>
          </>
        )}

        {tab === "positions" && (
          <>
            {(!data.positions || data.positions.length === 0) ? (
              <div className="text-gray-600 text-center py-8">보유 포지션 없음</div>
            ) : (
              data.positions.map((p, i) => (
                <div key={i} className="bg-[#12122a] rounded-lg p-3 border border-[#1a1a3a]">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-white font-bold">{p.coin}</span>
                    <span className={`font-mono text-[12px] font-bold ${pnlColor(p.profit_rate)}`}>
                      {p.profit_rate > 0 ? "+" : ""}{p.profit_rate?.toFixed(2)}%
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-y-1 text-[12px]">
                    <div className="text-gray-500">매수가</div>
                    <div className="text-right font-mono text-gray-300">{fmt(p.buy_price)}</div>
                    <div className="text-gray-500">현재가</div>
                    <div className="text-right font-mono text-gray-300">{fmt(p.cur_price)}</div>
                    <div className="text-gray-500">투자금</div>
                    <div className="text-right font-mono text-gray-300">{fmt(p.amount)}원</div>
                    <div className="text-gray-500">평가액</div>
                    <div className={`text-right font-mono ${pnlColor(p.cur_amount - p.amount)}`}>{fmt(p.cur_amount)}원</div>
                    <div className="text-gray-500">보유 시간</div>
                    <div className="text-right font-mono text-gray-300">{p.hold_min}분</div>
                  </div>
                </div>
              ))
            )}
          </>
        )}

        {tab === "recent" && (
          <>
            {(!data.recent || data.recent.length === 0) ? (
              <div className="text-gray-600 text-center py-8">최근 거래 없음</div>
            ) : (
              <div className="space-y-1">
                {data.recent.map((t, i) => (
                  <div key={i} className="flex items-center justify-between bg-[#12122a] rounded px-3 py-2 border border-[#1a1a3a]">
                    <div>
                      <span className="text-white font-mono text-[13px]">{t.coin}</span>
                      <span className="text-gray-600 text-[13px] ml-1.5">{t.time}</span>
                    </div>
                    <div className="text-right">
                      <span className={`font-mono text-[13px] ${pnlColor(t.profit)}`}>
                        {pnlSign(t.profit)}
                      </span>
                      <span className={`font-mono text-[13px] ml-1 ${pnlColor(t.profit_rate)}`}>
                        ({t.profit_rate > 0 ? "+" : ""}{t.profit_rate?.toFixed(1)}%)
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
