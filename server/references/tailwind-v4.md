# Tailwind CSS v4 Reference

## Configuration
postcss.config.mjs: export default { plugins: { "@tailwindcss/postcss": {} } }
globals.css: @import "tailwindcss"
tailwind.config.js is not needed (v4 uses CSS-based configuration)

## Dependencies
tailwindcss: ^4.0.0, @tailwindcss/postcss: ^4.0.0, postcss: ^8.0.0

## Custom theme (CSS variables)
@import "tailwindcss";
@theme {
  --color-primary: #3b82f6;
  --font-sans: "Inter", sans-serif;
}

## cn() utility
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }
