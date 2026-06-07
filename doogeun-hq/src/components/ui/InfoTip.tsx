"use client";

import { useState, useRef, useEffect } from "react";
import { INFO_TIPS, InfoTipEntry } from "@/lib/infoTips";

interface InfoTipProps {
  /** infoTips.ts 사전 key. 또는 인라인 entry override 가능. */
  term?: keyof typeof INFO_TIPS | string;
  inline?: InfoTipEntry;
  /** 아이콘 크기 (px) — 기본 14 */
  size?: number;
  /** 옆에 함께 보일 텍스트 (없으면 ⓘ 아이콘만) */
  label?: string;
}

/** 어려운 용어 옆에 붙이는 작은 ⓘ 버튼.
 *  데스크탑: 호버 시 팝오버 / 모바일: 탭 시 팝오버.
 *
 *  예) <InfoTip term="invite_code" label="초대코드" />
 *      → "초대코드 ⓘ" 형태로 렌더, 호버/탭 시 설명 박스.
 */
export default function InfoTip({ term, inline, size = 14, label }: InfoTipProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLSpanElement>(null);

  const entry: InfoTipEntry | undefined = inline || (term ? INFO_TIPS[term as keyof typeof INFO_TIPS] : undefined);

  // 바깥 클릭 시 닫기
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  if (!entry) {
    return label ? <span>{label}</span> : null;
  }

  return (
    <span ref={wrapperRef} className="relative inline-flex items-center gap-1 align-baseline">
      {label && <span>{label}</span>}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className="inline-flex items-center justify-center rounded-full bg-sky-400/15 text-sky-300 hover:bg-sky-400/30 transition-colors leading-none"
        style={{ width: size, height: size, fontSize: Math.round(size * 0.75) }}
        aria-label={`${entry.title} 설명 보기`}
        title={entry.title}
      >
        ⓘ
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute z-50 left-0 top-full mt-1 w-[260px] sm:w-[320px] p-3 rounded-lg border border-sky-400/40 bg-gray-950/98 shadow-xl text-[12px] leading-relaxed text-gray-200"
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
        >
          <div className="font-bold text-sky-300 mb-1.5">{entry.title}</div>
          <div className="whitespace-pre-wrap">{entry.body}</div>
          {entry.link && (
            <a
              href={entry.link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block text-sky-400 hover:text-sky-300 underline underline-offset-2"
              onClick={(e) => e.stopPropagation()}
            >
              → {entry.link.label}
            </a>
          )}
        </span>
      )}
    </span>
  );
}
