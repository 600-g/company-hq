# shadcn/ui Reference

## Required dependencies
class-variance-authority, clsx, tailwind-merge, lucide-react, @radix-ui/react-slot
Per component: @radix-ui/react-dialog, @radix-ui/react-dropdown-menu, @radix-ui/react-select, etc.

## Key components
Button: variant=(default|destructive|outline|secondary|ghost|link) size=(sm|default|lg)
Card: Card > CardHeader > CardTitle + CardDescription > CardContent > CardFooter
Input + Label: <Label htmlFor="x">Label</Label><Input id="x" />
Dialog: Dialog > DialogTrigger > DialogContent > DialogHeader > DialogTitle

## CSS variables (globals.css)
:root { --background: 0 0% 100%; --foreground: 0 0% 3.9%; --primary: 0 0% 9%; --muted: 0 0% 96.1%; --border: 0 0% 89.8%; --radius: 0.5rem; }

## File structure
src/components/ui/button.tsx, card.tsx, input.tsx, ...
src/lib/utils.ts (cn function)
