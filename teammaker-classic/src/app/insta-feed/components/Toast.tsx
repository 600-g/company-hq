'use client';

import { useEffect, useRef } from 'react';
import { CheckCircleIcon, AlertTriangleIcon, XIcon } from 'lucide-react';

export interface ToastMessage {
  id: string;
  text: string;
  variant: 'success' | 'warning' | 'info';
}

interface Props {
  toasts: ToastMessage[];
  onRemove: (id: string) => void;
}

export default function Toast({ toasts, onRemove }: Props) {
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    toasts.forEach((t) => {
      if (!timers.current.has(t.id)) {
        const timer = setTimeout(() => {
          onRemove(t.id);
          timers.current.delete(t.id);
        }, 3000);
        timers.current.set(t.id, timer);
      }
    });
  }, [toasts, onRemove]);

  const borderColor = (v: ToastMessage['variant']) =>
    v === 'success' ? '#34C98E' : v === 'warning' ? '#F59E0B' : '#7C5CBF';

  const Icon = (v: ToastMessage['variant']) =>
    v === 'success' ? CheckCircleIcon : v === 'warning' ? AlertTriangleIcon : CheckCircleIcon;

  return (
    <div className="fixed bottom-6 right-6 flex flex-col gap-2 z-50 pointer-events-none">
      {toasts.map((t) => {
        const Ic = Icon(t.variant);
        return (
          <div
            key={t.id}
            className="flex items-center gap-3 px-4 py-3 rounded-[10px] text-white shadow-lg pointer-events-auto animate-in slide-in-from-right-4 fade-in duration-240"
            style={{
              background: '#1A1A2E',
              borderLeft: `4px solid ${borderColor(t.variant)}`,
              minWidth: 280,
            }}
          >
            <Ic size={16} style={{ color: borderColor(t.variant), flexShrink: 0 }} />
            <span className="text-sm font-normal flex-1">{t.text}</span>
            <button
              onClick={() => onRemove(t.id)}
              className="opacity-60 hover:opacity-100 transition-opacity"
            >
              <XIcon size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
