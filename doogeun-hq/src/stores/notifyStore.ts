"use client";
import { create } from "zustand";

export type NotifLevel = "info" | "success" | "warning" | "error";

export interface NotifItem {
  id: string;
  level: NotifLevel;
  title: string;
  body?: string;
  ts: number;
  read: boolean;
  source?: string;
}

interface NotifState {
  items: NotifItem[];
  /** 화면 우하단 토스트 대기열 (자동 제거 3.5초) */
  toasts: NotifItem[];
  push: (level: NotifLevel, title: string, body?: string, source?: string) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  remove: (id: string) => void;
  clear: () => void;
  _popToast: (id: string) => void;
}

export const useNotifStore = create<NotifState>((set, get) => ({
  items: [],
  toasts: [],
  push: (level, title, body, source) => {
    const item: NotifItem = {
      id: crypto.randomUUID(),
      level, title, body, source,
      ts: Date.now(),
      read: false,
    };
    set((s) => ({
      items: [item, ...s.items].slice(0, 100),
      toasts: [...s.toasts, item],
    }));
    setTimeout(() => get()._popToast(item.id), 3500);
  },
  markRead: (id) => set((s) => ({ items: s.items.map((n) => n.id === id ? { ...n, read: true } : n) })),
  markAllRead: () => set((s) => ({ items: s.items.map((n) => ({ ...n, read: true })) })),
  remove: (id) => set((s) => ({ items: s.items.filter((n) => n.id !== id) })),
  clear: () => set({ items: [] }),
  _popToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
