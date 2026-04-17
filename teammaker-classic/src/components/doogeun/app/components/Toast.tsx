"use client";

import { useEffect, useState } from "react";

interface Toast {
  id: number;
  text: string;
  variant: "info" | "success" | "error";
  expires: number;
  center?: boolean;
}

export default function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    let nextId = 1;
    const onToast = (e: Event) => {
      const d = (e as CustomEvent).detail as { text?: string; variant?: Toast["variant"]; ms?: number; center?: boolean } | undefined;
      if (!d?.text) return;
      const id = nextId++;
      const ms = d.ms ?? 3500;
      setToasts((prev) => [...prev, { id, text: d.text!, variant: d.variant ?? "info", expires: Date.now() + ms, center: !!d.center }]);
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), ms);
    };
    window.addEventListener("hq:toast", onToast);
    return () => window.removeEventListener("hq:toast", onToast);
  }, []);

  if (toasts.length === 0) return null;
  const centerList = toasts.filter(t => t.center);
  const cornerList = toasts.filter(t => !t.center);
  return (
    <>
      {/* 우상단 기본 */}
      {cornerList.length > 0 && (
        <div className="fixed top-14 right-3 z-[200] flex flex-col gap-1.5 pointer-events-none">
          {cornerList.map((t) => (
            <div key={t.id}
              className={`pointer-events-auto px-3 py-2 rounded-md shadow-lg border text-xs font-medium flex items-center gap-2 min-w-[220px] max-w-[360px] animate-slide-in-right ${
                t.variant === "success" ? "bg-green-900/90 text-green-100 border-green-500/40"
                : t.variant === "error" ? "bg-red-900/90 text-red-100 border-red-500/40"
                : "bg-[#1a1a2e]/95 text-gray-100 border-[#3a3a5a]"
              }`}>
              <span>{t.variant === "success" ? "✅" : t.variant === "error" ? "❌" : "ℹ️"}</span>
              <span className="flex-1 break-words">{t.text}</span>
            </div>
          ))}
        </div>
      )}
      {/* 가운데 (detail.center=true) */}
      {centerList.length > 0 && (
        <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[210] flex flex-col gap-1.5 pointer-events-none items-center">
          {centerList.map((t) => (
            <div key={t.id}
              className={`pointer-events-auto px-5 py-3 rounded-xl shadow-2xl border text-sm font-bold flex items-center gap-2 max-w-[420px] ${
                t.variant === "success" ? "bg-green-900/95 text-green-100 border-green-400/60"
                : t.variant === "error" ? "bg-red-900/95 text-red-100 border-red-400/60"
                : "bg-[#0f0f1f]/98 text-yellow-300 border-yellow-400/60"
              }`}>
              <span className="flex-1 break-words text-center">{t.text}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
