"use client";

/**
 * InfoBadge — 비개발자 친화 헬프 배지.
 *
 * 사용:
 *   <InfoBadge text="간단 설명" detail="자세한 풀이 (클릭 시)" />
 *
 * - hover: 간단 설명 (native title — 시스템 툴팁)
 * - click: 자세한 설명 팝오버 (한 줄~여러 줄, 마크다운 X 단순 텍스트)
 *
 * 디자인:
 * - 14px ⓘ 아이콘
 * - 클릭 영역 작아서 다른 UI 방해 X
 * - 외부 클릭 시 팝오버 자동 닫힘
 */

import { useEffect, useRef, useState } from "react";

interface InfoBadgeProps {
  /** hover 시 표시 (시스템 툴팁) */
  text: string;
  /** 클릭 시 표시 (자세한 풀이). 없으면 클릭 시에도 text 만 보여줌 */
  detail?: string;
  /** 추가 className */
  className?: string;
}

export default function InfoBadge({ text, detail, className = "" }: InfoBadgeProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <span
      ref={ref}
      className={`relative inline-flex items-center ${className}`}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        title={text}
        aria-label={text}
        className="w-4 h-4 inline-flex items-center justify-center rounded-full bg-sky-500/15 text-sky-300 text-[10px] font-bold hover:bg-sky-500/30 hover:text-sky-100 transition-colors leading-none"
      >
        ⓘ
      </button>
      {open && (
        <span
          className="absolute left-1/2 -translate-x-1/2 top-full mt-1 z-50 min-w-[200px] max-w-[320px] p-2.5 rounded-md bg-gray-900 border border-sky-400/40 text-[12px] text-gray-100 shadow-xl whitespace-pre-wrap leading-snug"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="font-bold text-sky-300 mb-1">{text}</div>
          {detail && <div className="text-gray-300">{detail}</div>}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="absolute top-1 right-1.5 text-gray-500 hover:text-gray-200 text-[11px] w-4 h-4 flex items-center justify-center"
            aria-label="닫기"
          >
            ✕
          </button>
        </span>
      )}
    </span>
  );
}
