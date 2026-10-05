---
name: vercel-react-best-practices
description: "Use when: working on Next.js, React, or Vercel components and hooks."
---

# Vercel & React Best Practices

## Core Directives
- Write clean, component-isolated TypeScript matching modern Next.js App Router infrastructure.
- Cut down on AI-generated hook bugs and side-effect anti-patterns.
- Prevent structural prop drilling by using React Context or Server Components appropriately.

## Execution Rules
1. Prefer Server Components by default; only use `"use client"` when interactivity or state is strictly required.
2. Co-locate tests, styles, and data-fetching near the component.
3. Rely on Next.js native routing, `<Link>`, and `<Image>` optimization components.