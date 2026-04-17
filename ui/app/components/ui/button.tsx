"use client";
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-xs font-medium transition-all disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400/50",
  {
    variants: {
      variant: {
        default: "bg-yellow-500 text-black hover:bg-yellow-400 active:bg-yellow-600 shadow-sm",
        secondary: "bg-[#2a2a5a] text-white hover:bg-[#3a3a6a]",
        ghost: "text-gray-300 hover:text-white hover:bg-[#2a2a5a]",
        outline: "border border-[#3a3a5a] text-gray-300 hover:border-yellow-400/50 hover:text-yellow-300 hover:bg-[#1a1a2e]",
        destructive: "bg-red-500/90 text-white hover:bg-red-500",
        link: "text-yellow-400 underline-offset-2 hover:underline",
      },
      size: {
        default: "h-8 px-3 py-1.5",
        sm: "h-6 px-2 text-[12px]",
        lg: "h-10 px-5 text-sm",
        icon: "h-8 w-8",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
