import * as React from "react";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "secondary" | "outline" | "destructive";
}

export function Badge({ className = "", variant = "default", ...props }: BadgeProps) {
  const variantClass =
    variant === "secondary" ? "bg-[#2a2a4a] text-gray-200 border-[#3a3a5a]"
      : variant === "outline" ? "bg-transparent text-gray-300 border-gray-600"
      : variant === "destructive" ? "bg-red-900/40 text-red-300 border-red-700/40"
      : "bg-yellow-500/20 text-yellow-300 border-yellow-500/40";
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 border text-[12px] font-medium ${variantClass} ${className}`}
      {...props}
    />
  );
}
