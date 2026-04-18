"use client";

import { useEffect, useState } from "react";
import { Sun, Cloud, CloudRain, CloudSnow, CloudFog, Zap } from "lucide-react";

type Icon = typeof Sun;

interface WxState {
  temp: number | null;
  code: number;  // WMO code
  label: string;
  icon: Icon;
  city: string;
}

/** WMO weather code → 한글 라벨 + 아이콘 */
function codeInfo(code: number): { label: string; icon: Icon } {
  if (code === 0) return { label: "맑음", icon: Sun };
  if (code <= 3) return { label: "구름", icon: Cloud };
  if (code <= 48) return { label: "안개", icon: CloudFog };
  if (code <= 67) return { label: "비", icon: CloudRain };
  if (code <= 77) return { label: "눈", icon: CloudSnow };
  if (code <= 82) return { label: "소나기", icon: CloudRain };
  if (code >= 95) return { label: "뇌우", icon: Zap };
  return { label: "흐림", icon: Cloud };
}

/** 오픈 Meteo 무료 API — 서울 고정, 3시간 갱신 */
export default function Weather({ compact = false }: { compact?: boolean }) {
  const [wx, setWx] = useState<WxState>({ temp: null, code: 0, label: "로딩", icon: Cloud, city: "서울" });

  useEffect(() => {
    const fetchWx = async () => {
      try {
        const r = await fetch("https://api.open-meteo.com/v1/forecast?latitude=37.5665&longitude=126.978&current=temperature_2m,weather_code&timezone=Asia%2FSeoul");
        const d = await r.json();
        const temp = d?.current?.temperature_2m ?? null;
        const code = d?.current?.weather_code ?? 0;
        const { label, icon } = codeInfo(code);
        setWx({ temp, code, label, icon, city: "서울" });
      } catch {}
    };
    fetchWx();
    const id = setInterval(fetchWx, 3 * 60 * 60 * 1000);  // 3시간
    return () => clearInterval(id);
  }, []);

  const Icon = wx.icon;

  if (compact) {
    return (
      <div className="inline-flex items-center gap-1.5 text-[12px] text-gray-300">
        <Icon className="w-3.5 h-3.5 text-blue-300" />
        <span className="font-mono">{wx.temp != null ? `${wx.temp.toFixed(0)}°` : "-"}</span>
        <span className="text-gray-500">{wx.label}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-gray-800/60 bg-gray-900/40">
      <Icon className="w-8 h-8 text-blue-300" />
      <div>
        <div className="text-[11px] text-gray-500">{wx.city} 현재</div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-gray-100">{wx.temp != null ? `${wx.temp.toFixed(1)}°` : "-"}</span>
          <span className="text-[13px] text-gray-400">{wx.label}</span>
        </div>
      </div>
    </div>
  );
}
