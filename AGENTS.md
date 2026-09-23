# AGENTS.md

## Project

CITY is a long-running browser city-building simulation. The player shapes roads, zoning, services, transport, and policy while the simulation owns authoritative city growth.

## Required architecture

- `src/simulation/**`: deterministic business/simulation logic only. No React, ReactDOM, Phaser, DOM, or browser rendering ownership.
- `src/game/**`: Phaser presentation and input.
- `src/app/**` / `src/ui/**`: React HUD, menus, inspectors, charts.
- `src/persistence/**`: save/load, migration, storage adapters.
- Presentation submits commands; it does not mutate authoritative simulation state directly.

## Determinism

- Never use `Math.random()` in simulation code.
- Random behavior uses the serializable seeded RNG.
- Bugs found in long-run simulation must be reproducible from seed + command sequence.
- Headless tests must run without Phaser or React.

## Long-term save discipline

- Save current authoritative state, not historical play length.
- Never put unbounded operation logs into normal saves.
- Never store full save snapshots inside command/dedup records.
- References use stable IDs instead of embedding duplicate entities.
- Autosave generations are bounded.
- Every durable format has an explicit `saveVersion` and migration path.
- Measure representative starter / 10-year / 50-year save sizes.

## Request/response discipline

- Normal mutations send intent-only commands and return compact deltas.
- Ordinary command target: <= 64 KiB.
- Ordinary command hard guard: <= 256 KiB.
- Ordinary response target: <= 128 KiB.
- Full snapshots are exceptional recovery/load operations.
- Command deduplication is bounded by count/TTL and never stores full-state responses.

## Development workflow

Use the installed shared skills rather than duplicating them into project-specific Skills:

- New mechanics or product behavior: `superpowers:brainstorming`.
- Multi-step implementation: `superpowers:writing-plans`.
- Features and bug fixes: `superpowers:test-driven-development`.
- Unexpected failures: `superpowers:systematic-debugging`.
- Before completion/merge claims: `superpowers:verification-before-completion`.
- Product UI/art: `product-design/get-context` → `product-design/ideate` → `product-design/design-qa`.

Project-specific conventions belong in this file, not in a custom reusable Skill.

## Graphics

- Select one coherent art direction before mass asset production.
- Keep camera angle, lighting direction, scale, saturation, shadows, and footprint conventions consistent.
- Prefer a small high-quality asset set before expanding content volume.
- Maintain fixed-seed/fixed-camera visual regression fixtures once real city rendering starts.

## Quality gate

Before a PR is ready:
- `npm run verify`
- `npm run e2e`
- `npx wrangler deploy --dry-run`
- focused long-run simulation tests for affected systems
- review save/request size impact for changes that add persistent or transported state
