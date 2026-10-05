---
name: remotion-best-practices
description: "Use when: working with Remotion, programmatic video generation, or specialized canvas/React animations."
---

# Remotion Best Practices

## Core Directives
- Follow strict rules for frame timing, interpolation curves, and asset bundling.

## Execution Rules
1. Use `useCurrentFrame` and `useVideoConfig` correctly to bind animations to video time perfectly.
2. Rely on Spring physics or specialized interpolation functions instead of generic CSS transitions.
3. Bundle assets correctly via Remotion's static asset standards to avoid dropped frames during rendering.