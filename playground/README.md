# Playground

Code under test for Merge Desk's demo pull requests. It has no dependencies and its
`node --test` suite runs in a couple of seconds, so a run can show real test output.

The `[Demo]` pull requests change these files on `demo/*` branches that target `demo/base`,
never `main`. Scenario sources live in `demo/scenarios/`.
