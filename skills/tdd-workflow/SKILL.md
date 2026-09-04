---
name: tdd-workflow
description: Use when a task explicitly calls for TDD or when behavior can be usefully specified with a regression test before implementation.
disable-model-invocation: true
---

# Test-Driven Development Workflow

Use red-green-refactor where a failing behavior test provides useful design
feedback or protects against a regression.

## When to Use

- The user or task explicitly requires TDD
- A bug can be reproduced with a focused automated test
- New behavior has a stable contract that can be tested before implementation
- A risky refactor needs characterization tests before structural changes

## TDD Cycle

### 1. Red — Write Failing Tests First

```
Define the observable behavior before changing the implementation.
Run the focused test and confirm it fails for the expected reason.
```

### 2. Green — Minimal Implementation

```
Write the minimum coherent change needed to make the focused test pass.
Run that test again before broadening the verification scope.
```

### 3. Refactor — Improve While Green

```
Improve structure only where the change benefits from it. Keep the focused test
green, then run the repository's relevant broader checks.
```

## Proportional Scope

- Prefer the narrowest test level that exercises real behavior.
- Add integration or end-to-end coverage only when the changed boundary needs it.
- Cover material error paths and edge cases; do not chase an arbitrary coverage percentage.
- For generated files, configuration-only changes, or behavior that cannot be
  tested economically, use the most relevant validation command and explain the
  limitation.

## Principles

- Follow the repository's existing test organization and conventions.
- Test observable behavior, not implementation details.
- Keep tests deterministic and isolate mutable state.
- Prefer real collaborators when practical; mock only the boundary the test
  needs to control.
- Do not claim the red or green state without fresh command output.
