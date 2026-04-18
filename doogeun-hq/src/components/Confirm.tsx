"use client";

import { useCallback } from "react";
import { create } from "zustand";
import Modal from "@/components/Modal";
import { Button } from "@/components/ui/button";

interface ConfirmOpts {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
}

interface ConfirmState {
  open: boolean;
  opts: ConfirmOpts | null;
  resolver: ((v: boolean) => void) | null;
  ask: (opts: ConfirmOpts) => Promise<boolean>;
  resolve: (v: boolean) => void;
}

const useConfirmStore = create<ConfirmState>((set, get) => ({
  open: false,
  opts: null,
  resolver: null,
  ask: (opts) => new Promise((resolve) => {
    set({ open: true, opts, resolver: resolve });
  }),
  resolve: (v) => {
    const r = get().resolver;
    if (r) r(v);
    set({ open: false, opts: null, resolver: null });
  },
}));

/** 훅 — const confirm = useConfirm(); await confirm({ message: "..." }) */
export function useConfirm() {
  const ask = useConfirmStore((s) => s.ask);
  return useCallback((opts: ConfirmOpts) => ask(opts), [ask]);
}

/** 루트 레이아웃 한 번만 렌더 — 앱 전역 confirm 모달 */
export function ConfirmRoot() {
  const open = useConfirmStore((s) => s.open);
  const opts = useConfirmStore((s) => s.opts);
  const resolve = useConfirmStore((s) => s.resolve);

  return (
    <Modal open={open} onClose={() => resolve(false)} title={opts?.title || "확인"} widthClass="max-w-sm">
      <div className="p-5 space-y-4">
        <p className="text-[13px] text-gray-200 whitespace-pre-wrap leading-relaxed">{opts?.message}</p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => resolve(false)}>
            {opts?.cancelText || "취소"}
          </Button>
          <Button
            variant={opts?.destructive ? "destructive" : "default"}
            onClick={() => resolve(true)}
          >
            {opts?.confirmText || "확인"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
