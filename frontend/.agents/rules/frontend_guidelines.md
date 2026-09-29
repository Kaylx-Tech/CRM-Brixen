# Frontend Development Guidelines

1. **Use Existing UI Components First:** Before building a new component or page, ALWAYS scan the `frontend/src/components/ui/` folder. You MUST use the existing shadcn components if they are available instead of building custom ones.
2. **No Hardcoded Colors:** Do NOT add hardcoded colors (e.g., `#FFFFFF`, `blue-500`) in your styling or components. You MUST use CSS variables defined in `frontend/src/index.css` (e.g., `bg-background`, `text-muted-foreground`).
3. **No Extra Custom Styling:** Rely on the provided UI components and their default styles as much as possible to maintain consistency.
4. **Reference Existing Layouts:** When asked to create a new page, DO NOT start from scratch. You MUST first inspect an existing page to understand the established layout structure, component usage, and backend data flow. Build the new page to strictly match these existing patterns.
