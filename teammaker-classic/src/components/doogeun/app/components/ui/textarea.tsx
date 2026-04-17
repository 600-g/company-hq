import * as React from "react";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className = "", ...props }, ref) => (
    <textarea
      ref={ref}
      className={`w-full rounded border border-[#3a3a5a] bg-[#1a1a2e] text-white text-xs px-2 py-1.5 focus:outline-none focus:border-yellow-400/60 resize-y ${className}`}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";
