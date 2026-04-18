import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold",
  {
    variants: {
      variant: {
        default: "bg-yellow-500/20 text-yellow-300",
        secondary: "bg-gray-700/40 text-gray-300",
        success: "bg-green-500/20 text-green-300",
        warning: "bg-amber-500/20 text-amber-300",
        destructive: "bg-red-500/20 text-red-300",
        outline: "border border-gray-700 text-gray-400",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant, className }))} {...props} />;
}
