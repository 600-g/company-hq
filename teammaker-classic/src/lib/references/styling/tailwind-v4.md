# Tailwind CSS v4

## Setup

### postcss.config.mjs
```js
export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
```

### globals.css
```css
@import "tailwindcss";
```

### package.json dependencies
```json
{
  "devDependencies": {
    "tailwindcss": "^4.0.0",
    "@tailwindcss/postcss": "^4.0.0",
    "postcss": "^8.0.0"
  }
}
```

## Key Changes in v4 (compared to v3)

- `tailwind.config.js` no longer needed → CSS-based configuration
- `@tailwind base/components/utilities` → `@import "tailwindcss"`
- Custom themes: CSS variable based (`@theme` directive)

```css
@import "tailwindcss";

@theme {
  --color-primary: #3b82f6;
  --color-secondary: #64748b;
  --font-sans: "Inter", sans-serif;
}
```

## Utility Classes

### Layout
```
flex flex-col items-center justify-between gap-4
grid grid-cols-3 gap-6
container mx-auto px-4
```

### Spacing
```
p-4 px-6 py-2        (padding)
m-4 mx-auto mt-8     (margin)
space-y-4             (vertical spacing between children)
gap-4                 (flex/grid gap)
```

### Typography
```
text-sm text-base text-lg text-xl text-2xl
font-normal font-medium font-semibold font-bold
text-gray-900 text-muted-foreground
leading-relaxed tracking-tight
```

### Colors
```
bg-white bg-gray-100 bg-primary
text-gray-900 text-primary
border-gray-200
```

### Responsive
```
sm:  (640px+)
md:  (768px+)
lg:  (1024px+)
xl:  (1280px+)
```

```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
```

## cn() Utility (clsx + tailwind-merge)

```tsx
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```
