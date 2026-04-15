# React Component Patterns

## Component Design Principles

- **Single Responsibility**: Each component should perform only one role
- **Composition over Inheritance**: Use composition instead of inheritance
- **Props Interface**: Define props types with TypeScript interface

## Basic Component Structure

```tsx
interface ButtonProps {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}

export function Button({ variant = "primary", size = "md", children, onClick, disabled }: ButtonProps) {
  return (
    <button onClick={onClick} disabled={disabled} className={cn(baseStyles, variants[variant], sizes[size])}>
      {children}
    </button>
  );
}
```

## State Management Patterns

### Local State
```tsx
const [count, setCount] = useState(0);
const [items, setItems] = useState<Item[]>([]);
```

### Derived State (don't make computed values into state)
```tsx
// ❌ Bad
const [filteredItems, setFilteredItems] = useState<Item[]>([]);
useEffect(() => setFilteredItems(items.filter(i => i.active)), [items]);

// ✅ Good
const filteredItems = useMemo(() => items.filter(i => i.active), [items]);
```

### Form State
```tsx
const [form, setForm] = useState({ name: "", email: "" });
const handleChange = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
  setForm(prev => ({ ...prev, [field]: e.target.value }));
};
```

## Custom Hook Patterns

```tsx
function useToggle(initial = false) {
  const [value, setValue] = useState(initial);
  const toggle = useCallback(() => setValue(v => !v), []);
  return [value, toggle] as const;
}
```

## Conditional Rendering

```tsx
// Ternary operator (for simple cases)
{isLoading ? <Spinner /> : <Content />}

// Logical AND (show/hide)
{error && <ErrorMessage message={error} />}

// Early return (for complex conditions)
if (isLoading) return <Spinner />;
if (error) return <ErrorMessage />;
return <Content />;
```

## List Rendering

```tsx
{items.map(item => (
  <ListItem key={item.id} item={item} />
))}
```

- Use a stable unique ID for `key` (never use array index)
- Extract list items into separate components
