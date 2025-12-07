# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Gateway Auction is a Next.js 16 web application built with TypeScript, React 19, and Tailwind CSS v4. It uses shadcn/ui for its component library (53 pre-built components in `src/components/ui/`).

## Commands

```bash
# Development
bun dev              # Start dev server at localhost:3000

# Build & Production
bun build            # Create production build
bun start            # Run production server

# Code Quality
bun run lint         # Run Biome linter
bun run format       # Auto-format code with Biome
```

## Architecture

**Stack:**
- Next.js 16 App Router (file-based routing in `src/app/`)
- React 19 with Server Components by default
- shadcn/ui components (Radix UI primitives + Tailwind styling)
- React Hook Form + Zod for form validation
- Biome for linting/formatting (replaces ESLint/Prettier)

**Key Directories:**
- `src/app/` - Pages and layouts (App Router)
- `src/components/ui/` - shadcn/ui components (locally owned, customizable)
- `src/hooks/` - Custom React hooks
- `src/lib/` - Utility functions

**Import Aliases:**
```typescript
import { Button } from "@/components/ui/button"
import { useIsMobile } from "@/hooks/use-mobile"
import { cn } from "@/lib/utils"
```

## Code Patterns

**Component Variants:** Uses `class-variance-authority` (CVA) for styled variants:
```typescript
const buttonVariants = cva("base-styles", {
  variants: { variant: { default: "...", destructive: "..." } },
  defaultVariants: { variant: "default" }
})
```

**Class Merging:** Always use `cn()` utility for combining Tailwind classes:
```typescript
cn("base-class", conditional && "conditional-class", className)
```

**Data Attributes:** Components use `data-slot` attributes for styling hooks (e.g., `data-slot="card"`)

## Styling

- Tailwind CSS v4 with CSS variables for theming
- Dark mode via `next-themes`
- Mobile breakpoint: 768px
- shadcn/ui uses "new-york" style variant with neutral base color
