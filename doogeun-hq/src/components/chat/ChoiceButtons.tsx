"use client";

import { useState } from "react";
import { HelpCircle } from "lucide-react";

interface Props {
  question: string;
  options: string[];
  onChoose: (choice: string) => void;
  disabled?: boolean;
}

/** 에이전트의 객관식 되묻기 — 버튼 클릭으로 답변 */
export default function ChoiceButtons({ question, options, onChoose, disabled }: Props) {
  const [chosen, setChosen] = useState<string | null>(null);
  const pick = (opt: string) => {
    if (disabled || chosen) return;
    setChosen(opt);
    onChoose(opt);
  };

  return (
    <div className="mt-2 rounded-lg border border-sky-400/40 bg-sky-500/10 p-2.5">
      <div className="flex items-start gap-1.5 text-[12px] text-sky-200 mb-1.5">
        <HelpCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <span className="font-bold">{question}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt, i) => {
          const active = chosen === opt;
          return (
            <button
              key={i}
              onClick={() => pick(opt)}
              disabled={disabled || !!chosen}
              className={`text-[12px] px-2.5 py-1 rounded-md border transition-all ${
                active
                  ? "bg-sky-500/30 text-sky-100 border-sky-300 font-bold"
                  : chosen
                  ? "bg-gray-900/30 text-gray-500 border-gray-700/50 cursor-not-allowed"
                  : "bg-gray-900/60 text-gray-200 border-gray-700 hover:border-sky-400 hover:text-sky-200 hover:bg-sky-500/10"
              }`}
            >
              {opt}
            </button>
          );
        })}
      </div>
      {chosen && (
        <div className="text-[10px] text-gray-500 mt-1.5">→ 선택: <span className="text-sky-300">{chosen}</span></div>
      )}
    </div>
  );
}
