"use client";

import { useState, useEffect } from "react";

interface Weather {
  temp: number;
  weatherCode: number;
  humidity: number;
  windSpeed: number;
}

const WEATHER_ICONS: Record<number, string> = {
  0: "☀️", 1: "🌤", 2: "⛅", 3: "☁️",
  45: "🌫", 48: "🌫",
  51: "🌦", 53: "🌧", 55: "🌧",
  61: "🌧", 63: "🌧", 65: "🌧️",
  71: "🌨", 73: "🌨", 75: "❄️",
  80: "🌦", 81: "🌧", 82: "⛈",
  95: "⛈", 96: "⛈", 99: "⛈",
};

const WEATHER_TEXT: Record<number, string> = {
  0: "맑음", 1: "대체로 맑음", 2: "구름 조금", 3: "흐림",
  45: "안개", 48: "안개",
  51: "이슬비", 53: "비", 55: "강한 비",
  61: "비", 63: "비", 65: "강한 비",
  71: "눈", 73: "눈", 75: "폭설",
  80: "소나기", 81: "소나기", 82: "폭우",
  95: "뇌우", 96: "뇌우", 99: "뇌우",
};

export default function WeatherBoard() {
  const [weather, setWeather] = useState<Weather | null>(null);
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    fetch("https://api.open-meteo.com/v1/forecast?latitude=37.5665&longitude=126.978&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=Asia/Seoul")
      .then(r => r.json())
      .then(data => {
        if (data.current) {
          setWeather({
            temp: Math.round(data.current.temperature_2m),
            weatherCode: data.current.weather_code,
            humidity: data.current.relative_humidity_2m,
            windSpeed: Math.round(data.current.wind_speed_10m),
          });
        }
      })
      .catch(() => {});

    const timer = setInterval(() => setTime(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  const icon = weather ? (WEATHER_ICONS[weather.weatherCode] || "🌡") : "⏳";
  const text = weather ? (WEATHER_TEXT[weather.weatherCode] || "알 수 없음") : "불러오는 중...";
  const timeStr = time.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
  const dateStr = time.toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" });

  return (
    <div className="bg-[#12122a] border border-[#252548] rounded-lg overflow-hidden">
      {/* 헤더 */}
      <div className="px-3 py-2 border-b border-[#1e1e40] flex items-center justify-between">
        <span className="text-[12px] font-semibold text-[#6464a0] uppercase tracking-widest">두근 HQ</span>
        <div className="text-right">
          <div className="text-white font-bold text-sm leading-none">{timeStr}</div>
          <div className="text-[#5050a0] text-[12px] mt-0.5">{dateStr}</div>
        </div>
      </div>

      {/* 날씨 */}
      <div className="px-3 py-2.5 flex items-center gap-3">
        <span className="text-3xl leading-none">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1.5">
            <span className="text-white font-bold text-xl leading-none">
              {weather ? `${weather.temp}°` : "--"}
            </span>
            <span className="text-[#7070b0] text-xs">서울</span>
          </div>
          <div className="text-[#9090c0] text-[13px] mt-0.5">{text}</div>
        </div>
        {weather && (
          <div className="text-right shrink-0">
            <div className="text-[#7070b0] text-[12px]">💧 {weather.humidity}%</div>
            <div className="text-[#7070b0] text-[12px] mt-0.5">💨 {weather.windSpeed}㎞/h</div>
          </div>
        )}
      </div>

      {/* 오늘 할 일 */}
      <div className="px-3 pb-2.5 border-t border-[#1a1a38]">
        <div className="text-[#5050a0] text-[13px] font-semibold uppercase tracking-wider mt-2 mb-1.5">
          📋 Today
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-[#8888b8] text-[13px]">
            <span className="w-1 h-1 rounded-full bg-[#4a4a8a] shrink-0" />
            에이전트 상태 확인
          </div>
          <div className="flex items-center gap-1.5 text-[#8888b8] text-[13px]">
            <span className="w-1 h-1 rounded-full bg-[#4a4a8a] shrink-0" />
            사무실 꾸미기
          </div>
        </div>
      </div>
    </div>
  );
}
