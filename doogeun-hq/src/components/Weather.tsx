"use client";

import { create } from "zustand";
import { useEffect } from "react";
import { Sun, Cloud, CloudRain, CloudSnow, CloudFog, Zap, Moon } from "lucide-react";

type Icon = typeof Sun;

export type TimeOfDay = "dawn" | "day" | "sunset" | "night";

export interface WeatherState {
  temp: number | null;
  code: number;
  label: string;
  iconName: "sun" | "moon" | "cloud" | "rain" | "snow" | "fog" | "thunder";
  city: string;
  hour: number;          // 현재 시각 0~23
  tod: TimeOfDay;
  /** Phaser 씬 오버레이용 하늘 그라디언트 */
  skyTop: string;
  skyBottom: string;
  /** 전체 화면 과녁 틴트 (비/눈/밤 어둡게) */
  ambientTint: string;
  fetch: () => Promise<void>;
}

function computeTod(hour: number): TimeOfDay {
  if (hour >= 5 && hour < 8) return "dawn";
  if (hour >= 8 && hour < 17) return "day";
  if (hour >= 17 && hour < 20) return "sunset";
  return "night";
}

function computeSky(tod: TimeOfDay, code: number): { top: string; bottom: string; ambient: string } {
  const isRain = (code >= 51 && code <= 67) || (code >= 80 && code <= 82);
  const isSnow = (code >= 71 && code <= 77) || (code >= 85 && code <= 86);
  const isFog = code === 45 || code === 48;
  const isThunder = code >= 95;
  const isCloudy = code >= 2 && code <= 3;

  // 기본 팔레트
  let top = "#1e3a8a", bottom = "#3b82f6"; // day default
  if (tod === "dawn") { top = "#1e1b4b"; bottom = "#fb923c"; }
  else if (tod === "sunset") { top = "#1e3a8a"; bottom = "#f97316"; }
  else if (tod === "night") { top = "#020617"; bottom = "#1e293b"; }
  else if (tod === "day") { top = "#1e40af"; bottom = "#93c5fd"; }

  // 날씨 보정
  if (isRain || isThunder) { top = "#1e293b"; bottom = "#475569"; }
  else if (isSnow) { top = "#334155"; bottom = "#94a3b8"; }
  else if (isFog) { top = "#64748b"; bottom = "#94a3b8"; }
  else if (isCloudy) { top = mix(top, "#64748b", 0.35); bottom = mix(bottom, "#94a3b8", 0.35); }

  // ambient (전경 어두움) — 사무실 내부가 너무 어두워지지 않게 크게 낮춤
  const ambient =
    tod === "night" ? "rgba(0,0,0,0.12)"
    : tod === "dawn" || tod === "sunset" ? "rgba(30,27,75,0.05)"
    : isRain || isThunder ? "rgba(15,23,42,0.08)"
    : "rgba(0,0,0,0)";

  return { top, bottom, ambient };
}

function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ar = (pa >> 16) & 255, ag = (pa >> 8) & 255, ab = pa & 255;
  const br = (pb >> 16) & 255, bg = (pb >> 8) & 255, bb = pb & 255;
  const r = Math.round(ar * (1 - t) + br * t);
  const g = Math.round(ag * (1 - t) + bg * t);
  const bl = Math.round(ab * (1 - t) + bb * t);
  return `#${((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1)}`;
}

function codeInfo(code: number, hour: number): { label: string; icon: WeatherState["iconName"] } {
  const isNight = hour >= 20 || hour < 5;
  if (code === 0) return { label: isNight ? "맑은 밤" : "맑음", icon: isNight ? "moon" : "sun" };
  if (code <= 3) return { label: "구름", icon: "cloud" };
  if (code <= 48) return { label: "안개", icon: "fog" };
  if (code <= 67) return { label: "비", icon: "rain" };
  if (code <= 77) return { label: "눈", icon: "snow" };
  if (code <= 82) return { label: "소나기", icon: "rain" };
  if (code >= 95) return { label: "뇌우", icon: "thunder" };
  return { label: "흐림", icon: "cloud" };
}

const ICON_MAP: Record<WeatherState["iconName"], Icon> = {
  sun: Sun,
  moon: Moon,
  cloud: Cloud,
  rain: CloudRain,
  snow: CloudSnow,
  fog: CloudFog,
  thunder: Zap,
};

export const useWeatherStore = create<WeatherState>((set) => {
  const now = new Date();
  const hour = now.getHours();
  const tod = computeTod(hour);
  const sky = computeSky(tod, 0);
  return {
    temp: null, code: 0, label: "로딩", iconName: "cloud",
    city: "서울", hour, tod,
    skyTop: sky.top, skyBottom: sky.bottom, ambientTint: sky.ambient,
    fetch: async () => {
      // 위치 얻기 — 브라우저 geolocation 시도, 실패/거부 시 서울 기본
      let lat = 37.5665, lon = 126.978, cityLabel = "서울";
      try {
        const cached = typeof window !== "undefined" ? localStorage.getItem("doogeun-hq-geo") : null;
        if (cached) {
          const c = JSON.parse(cached);
          if (Number.isFinite(c.lat) && Number.isFinite(c.lon) && Date.now() - (c.ts || 0) < 24 * 60 * 60 * 1000) {
            lat = c.lat; lon = c.lon; cityLabel = c.city || "현재 위치";
          }
        }
        if (typeof navigator !== "undefined" && "geolocation" in navigator) {
          const pos = await new Promise<GeolocationPosition | null>((resolve) => {
            navigator.geolocation.getCurrentPosition(
              (p) => resolve(p),
              () => resolve(null),
              { timeout: 5000, maximumAge: 60 * 60 * 1000 }
            );
          });
          if (pos) {
            lat = pos.coords.latitude;
            lon = pos.coords.longitude;
            cityLabel = "현재 위치";
            try {
              localStorage.setItem("doogeun-hq-geo", JSON.stringify({ lat, lon, city: cityLabel, ts: Date.now() }));
            } catch {}
          }
        }
      } catch {}
      try {
        const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&timezone=auto`);
        const d = await r.json();
        const temp = d?.current?.temperature_2m ?? null;
        const code = d?.current?.weather_code ?? 0;
        const h = new Date().getHours();
        const t = computeTod(h);
        const { label, icon } = codeInfo(code, h);
        const sky2 = computeSky(t, code);
        set({
          temp, code, label, iconName: icon, hour: h, tod: t,
          city: cityLabel,
          skyTop: sky2.top, skyBottom: sky2.bottom, ambientTint: sky2.ambient,
        });
      } catch {}
    },
  };
});

/** 간이 위젯 (호출하면 스토어 구독 + 자동 폴링) */
export default function Weather({ compact = false }: { compact?: boolean }) {
  const { temp, label, iconName, city, hour, tod, fetch } = useWeatherStore();

  useEffect(() => {
    fetch();
    const id = setInterval(fetch, 30 * 60 * 1000); // 30분마다
    return () => clearInterval(id);
  }, [fetch]);

  const Icon = ICON_MAP[iconName];
  const todLabel = { dawn: "새벽", day: "낮", sunset: "노을", night: "밤" }[tod];

  if (compact) {
    return (
      <div className="inline-flex items-center gap-1.5 text-[12px] text-gray-300">
        <Icon className="w-3.5 h-3.5 text-sky-300" />
        <span className="font-mono">{temp != null ? `${temp.toFixed(0)}°` : "-"}</span>
        <span className="text-gray-500">{label}</span>
        <span className="text-gray-600 text-[10px]">· {todLabel}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-gray-800/60 bg-gray-900/40">
      <Icon className="w-8 h-8 text-sky-300" />
      <div className="flex-1">
        <div className="text-[11px] text-gray-500">{city} · {String(hour).padStart(2, "0")}:00 · {todLabel}</div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-gray-100">{temp != null ? `${temp.toFixed(1)}°` : "-"}</span>
          <span className="text-[13px] text-gray-400">{label}</span>
        </div>
      </div>
    </div>
  );
}
