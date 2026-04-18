"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  widthClass?: string;  // e.g. "max-w-md"
}

export default function Modal({ open, onClose, title, subtitle, children, widthClass = "max-w-xl" }: Props) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className={cn(
          "w-full rounded-xl border border-gray-800/80 bg-[var(--background)] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]",
          widthClass
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {(title || subtitle) && (
          <div className="flex items-start justify-between gap-2 p-4 border-b border-gray-800/60 shrink-0">
            <div>
              {title && <div className="text-[14px] font-bold text-sky-300">{title}</div>}
              {subtitle && <div className="text-[12px] text-gray-500 mt-0.5">{subtitle}</div>}
            </div>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-200 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        <div className="overflow-y-auto flex-1">
          {children}
        </div>
      </div>
    </div>
  );
}
