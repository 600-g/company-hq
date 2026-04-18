"use client";

import { useState, useRef, useEffect } from "react";

const PRESETS = [
  "🤖","🧠","🎨","💻","🐍","⚛","🎯","📊","📝","🔧",
  "🎮","🏢","🏭","🧪","🔬","🚀","⚡","✨","💡","🌟",
  "🎪","🎭","🖼","📸","🎬","📻","📺","🎧","🔔","📢",
  "💎","🛡","⚙","🔩","⚗","🧬","🧮","📐","📏","🧭",
  "🐙","🦊","🐱","🐶","🐻","🐼","🦁","🐯","🐸","🐵",
];

interface Props {
  value: string;
  onChange: (emoji: string) => void;
  className?: string;
}

export default function EmojiPicker({ value, onChange, className }: Props) {
  const [open, setOpen] = useState(false);
  const [manual, setManual] = useState(value);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setManual(value); }, [value]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div ref={rootRef} className={`relative ${className || ""}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full h-10 flex items-center justify-center text-2xl rounded-md border border-gray-700 bg-gray-900/60 hover:border-sky-400/50 transition-colors"
        title="이모지 선택"
      >
        {value || "🤖"}
      </button>
      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 w-64 p-2 rounded-lg border border-gray-700 bg-[var(--background)] shadow-2xl">
          <div className="grid grid-cols-10 gap-0.5 max-h-40 overflow-y-auto mb-2">
            {PRESETS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => { onChange(e); setOpen(false); }}
                className="h-7 text-lg rounded hover:bg-sky-500/20 transition-colors"
              >
                {e}
              </button>
            ))}
          </div>
          <div className="flex gap-1 border-t border-gray-800/60 pt-2">
            <input
              value={manual}
              onChange={(e) => setManual(e.target.value.slice(0, 4))}
              placeholder="직접 입력"
              className="flex-1 h-7 rounded border border-gray-700 bg-gray-900/60 px-2 text-xs text-gray-100"
            />
            <button
              type="button"
              onClick={() => { if (manual.trim()) { onChange(manual.trim()); setOpen(false); } }}
              className="h-7 px-2 rounded bg-sky-500/20 text-sky-200 text-xs hover:bg-sky-500/30"
            >
              적용
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
