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
    // 서울 날씨 (Open-Meteo, 무료, 키 불필요)
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

    // 시계
    const timer = setInterval(() => setTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const icon = weather ? (WEATHER_ICONS[weather.weatherCode] || "🌡") : "⏳";
  const text = weather ? (WEATHER_TEXT[weather.weatherCode] || "알 수 없음") : "로딩중";

  return (
    <div className="bg-[#1a1a2a] border border-[#2a2a4a] rounded p-2.5 text-[10px]">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-gray-500 font-semibold uppercase text-[8px] tracking-wider">게시판</span>
        <span className="text-gray-600">{time.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}</span>
      </div>

      {/* 날씨 */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-2xl">{icon}</span>
        <div>
          <div className="text-white font-semibold text-[13px]">
            {weather ? `${weather.temp}°C` : "--"}
          </div>
          <div className="text-gray-400 text-[9px]">서울 · {text}</div>
        </div>
      </div>

      {weather && (
        <div className="flex gap-3 text-gray-500 text-[9px]">
          <span>💧 {weather.humidity}%</span>
          <span>💨 {weather.windSpeed}km/h</span>
        </div>
      )}

      {/* 오늘 할 일 */}
      <div className="mt-2 pt-2 border-t border-[#2a2a4a]">
        <div className="text-gray-500 text-[8px] mb-1">📋 TODAY</div>
        <div className="text-gray-400 text-[9px] space-y-0.5">
          <div>• 에이전트 상태 확인</div>
          <div>• 사무실 꾸미기</div>
        </div>
      </div>
    </div>
  );
}
