"use client";

import { useEffect, useState } from "react";
import { Bell, X, Check, Info, AlertTriangle, AlertCircle } from "lucide-react";
import { useNotifStore, type NotifLevel } from "@/stores/notifyStore";
import { cn } from "@/lib/utils";

const ICON: Record<NotifLevel, React.ComponentType<{ className?: string }>> = {
  info: Info,
  success: Check,
  warning: AlertTriangle,
  error: AlertCircle,
};

const LEVEL_COLOR: Record<NotifLevel, string> = {
  info: "border-sky-400/40 bg-sky-500/15 text-sky-200",
  success: "border-green-400/40 bg-green-500/15 text-green-200",
  warning: "border-amber-400/40 bg-amber-500/15 text-amber-200",
  error: "border-red-400/40 bg-red-500/15 text-red-200",
};

/** 화면 우하단 토스트 스택 */
export function ToastStack() {
  const toasts = useNotifStore((s) => s.toasts);
  const pop = useNotifStore((s) => s._popToast);
  return (
    <div className="fixed bottom-4 right-4 z-[100] space-y-2 pointer-events-none">
      {toasts.map((t) => {
        const Icon = ICON[t.level];
        return (
          <div
            key={t.id}
            className={cn("pointer-events-auto flex items-start gap-2 px-3 py-2 rounded-lg border backdrop-blur shadow-lg min-w-[280px] max-w-sm", LEVEL_COLOR[t.level])}
          >
            <Icon className="w-4 h-4 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-bold truncate">{t.title}</div>
              {t.body && <div className="text-[11px] mt-0.5 opacity-80 line-clamp-2">{t.body}</div>}
            </div>
            <button onClick={() => pop(t.id)} className="opacity-60 hover:opacity-100">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

/** TopBar/사이드바 옆에 쓰는 벨 아이콘 + 드롭다운 */
export function BellButton() {
  const [open, setOpen] = useState(false);
  const items = useNotifStore((s) => s.items);
  const markAllRead = useNotifStore((s) => s.markAllRead);
  const markRead = useNotifStore((s) => s.markRead);
  const remove = useNotifStore((s) => s.remove);
  const clear = useNotifStore((s) => s.clear);

  const unread = items.filter((i) => !i.read).length;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="relative">
      <button
        onClick={() => {
          setOpen((v) => !v);
          if (!open) markAllRead();
        }}
        className="relative h-9 w-9 flex items-center justify-center rounded-md text-gray-400 hover:text-sky-200 hover:bg-gray-800/50 transition-colors"
        title="알림"
      >
        <Bell className="w-4 h-4" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1 w-80 max-h-[70vh] z-50 rounded-lg border border-gray-800/80 bg-[var(--background)] shadow-2xl flex flex-col">
            <div className="flex items-center justify-between p-3 border-b border-gray-800/60">
              <div className="text-[13px] font-bold text-gray-200">알림 {items.length}</div>
              <div className="flex gap-2 text-[11px]">
                <button onClick={() => markAllRead()} className="text-gray-500 hover:text-sky-200">전체 읽음</button>
                <button onClick={() => clear()} className="text-gray-500 hover:text-red-400">비우기</button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {items.length === 0 ? (
                <div className="py-8 text-center text-[12px] text-gray-500">알림 없음</div>
              ) : items.map((n) => {
                const Icon = ICON[n.level];
                return (
                  <div
                    key={n.id}
                    className={cn("flex items-start gap-2 p-3 border-b border-gray-800/40 hover:bg-gray-800/30 transition-colors",
                      !n.read && "bg-sky-500/5")}
                  >
                    <Icon className={cn("w-4 h-4 mt-0.5 shrink-0",
                      n.level === "success" && "text-green-400",
                      n.level === "warning" && "text-amber-400",
                      n.level === "error" && "text-red-400",
                      n.level === "info" && "text-sky-300",
                    )} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] text-gray-200 font-bold truncate">{n.title}</span>
                        {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />}
                      </div>
                      {n.body && <div className="text-[11px] text-gray-400 mt-0.5 line-clamp-2">{n.body}</div>}
                      <div className="text-[10px] text-gray-600 font-mono mt-0.5">
                        {new Date(n.ts).toLocaleString("ko-KR", { hour12: false })}
                        {n.source && ` · ${n.source}`}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      {!n.read && (
                        <button onClick={() => markRead(n.id)} className="text-gray-500 hover:text-sky-200 text-[10px]">
                          <Check className="w-3 h-3" />
                        </button>
                      )}
                      <button onClick={() => remove(n.id)} className="text-gray-500 hover:text-red-400">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
