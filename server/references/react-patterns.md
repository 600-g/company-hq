# React Patterns Reference

## Component design
- Single responsibility, composition-first
- Define props with TypeScript interface

## State management
- Local: useState
- Derived values: useMemo (do not turn into state)
- Forms: object state + handleChange pattern
- Global: Zustand (project/pipeline/handoff stores)

## Conditional rendering
- Ternary: {isLoading ? <Spinner /> : <Content />}
- AND: {error && <Error />}
- Early return: if (loading) return <Spinner />;

## Lists: use stable IDs for key (never index)
