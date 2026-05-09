"use client";

/**
 * InfoBadge — 비개발자 친화 헬프 배지.
 *
 * 사용:
 *   <InfoBadge text="간단 설명" detail="자세한 풀이" link="https://..." />
 *
 * - hover: 간단 설명 (native title)
 * - click: 팝오버 (제목 + 풀이 + (선택) 링크)
 * - Portal 사용 — 부모 stacking context 무시하고 화면 최상단 렌더 (다른 모달/채팅창에 가려지지 않음)
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface InfoBadgeProps {
  text: string;
  detail?: string;
  /** 외부 링크 (선택) — 새 탭에서 열림 */
  link?: { href: string; label: string };
  className?: string;
}

export default function InfoBadge({ text, detail, link, className = "" }: InfoBadgeProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);

  // 트리거 위치 계산 — 화면 좌표 (Portal 은 document 기준이라 absolute 좌표 필요)
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const POPOVER_W = 320;
    let left = rect.left + rect.width / 2 - POPOVER_W / 2;
    if (left < 8) left = 8;
    if (left + POPOVER_W > window.innerWidth - 8) left = window.innerWidth - POPOVER_W - 8;
    setPos({
      top: rect.bottom + window.scrollY + 6,
      left: left + window.scrollX,
    });
  }, [open]);

  // 외부 클릭 / ESC 닫기
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (
        popRef.current && !popRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        title={text}
        aria-label={text}
        className={`w-4 h-4 inline-flex items-center justify-center rounded-full bg-sky-500/15 text-sky-300 text-[10px] font-bold hover:bg-sky-500/30 hover:text-sky-100 transition-colors leading-none cursor-pointer ${className}`}
      >
        ⓘ
      </button>
      {open && pos && typeof document !== "undefined" && createPortal(
        <div
          ref={popRef}
          style={{ position: "absolute", top: pos.top, left: pos.left, zIndex: 9999, width: 320 }}
          className="p-3 rounded-md bg-gray-900 border border-sky-400/40 text-[12px] text-gray-100 shadow-2xl whitespace-pre-wrap leading-snug"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="font-bold text-sky-300 mb-1.5 pr-5">{text}</div>
          {detail && <div className="text-gray-300 mb-2">{detail}</div>}
          {link && (
            <a
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-sky-300 hover:text-sky-200 hover:underline"
            >
              🔗 {link.label}
            </a>
          )}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="absolute top-1.5 right-2 text-gray-500 hover:text-gray-200 text-[11px] w-4 h-4 flex items-center justify-center"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>,
        document.body,
      )}
    </>
  );
}
