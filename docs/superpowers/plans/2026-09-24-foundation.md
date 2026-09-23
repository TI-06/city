# PR #1 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish a production-grade browser-game foundation for `TI-06/city` with strict architecture boundaries, reproducible quality gates, a React + Phaser boot shell, Cloudflare deployment configuration, and enforceable save/request-size guardrails before gameplay systems are added.

**Architecture:** The browser shell is split into React UI and Phaser presentation, while shared contracts live outside both. This PR intentionally does **not** implement roads, zoning, population, or the real simulation kernel. It creates the toolchain and guardrails those later PRs must obey, especially bounded persistence and bounded request/response payloads.

**Tech Stack:** Node 24, TypeScript 5.9.3, React 19.3.0, Phaser 4.2.1, Vite 8.3.0, Vitest 5.0.1, Playwright 1.63.0, ESLint 10.11.0, typescript-eslint 8.70.0, Prettier 3.9.8, Wrangler 4.135.0.

**Spec:** `docs/superpowers/specs/2026-09-24-city-core-design.md`

## Global Constraints

- TypeScript strict mode is mandatory.
- Simulation/business logic must not depend on React or Phaser.
- React and Phaser must not own authoritative simulation state.
- Random gameplay code must never call `Math.random()` directly; deterministic RNG arrives in PR #2.
- Normal saves represent current state, not unbounded historical operations.
- Full-state snapshots must never be embedded in command deduplication records.
- Ordinary command target: <= 64 KiB.
- Ordinary command hard application guard: <= 256 KiB.
- Ordinary mutation response target: <= 128 KiB.
- Starter save budget: <= 2 MiB serialized.
- Representative 10-year save budget: <= 5 MiB.
- Representative 50-year save budget: <= 15 MiB.
- Autosave generations must be bounded.
- All persisted save structures must contain `saveVersion`.
- No feature PR merges without format, lint, typecheck, tests, build, and relevant E2E checks passing.
- New behavior follows RED -> GREEN -> REFACTOR.
- Use `superpowers:systematic-debugging` for unexpected failures rather than speculative patching.
- Use `superpowers:requesting-code-review` before merge and `superpowers:verification-before-completion` before claiming completion.
- Product UI/art direction beyond this neutral boot shell must go through `product-design/get-context`, `product-design/ideate`, and later `product-design/design-qa`.

## Review Focus

1. **Large command payloads:** commands larger than 256 KiB must be rejected before transport; add a unit test in Task 4.
2. **Historical save growth:** adding synthetic operation history outside the save envelope must not change the serialized save size; add a unit test in Task 5.
3. **Non-UTF-8-size assumptions:** payload measurement must use UTF-8 byte size, not JavaScript string length; add a multibyte Japanese-text test in Task 4.
4. **Browser boot failure:** the app must expose a stable root and Phaser canvas host and boot without console errors; add E2E coverage in Task 3.
5. **Cloudflare SPA deep-link handling:** Wrangler config must use `single-page-application` fallback so refresh on a client route remains renderable; verify config in Task 7.

---

## File Structure Locked By This Plan

```text
city/
├─ .github/
│  └─ workflows/
│     └─ quality.yml
├─ docs/
│  └─ superpowers/
│     ├─ specs/
│     │  └─ 2026-09-24-city-core-design.md
│     └─ plans/
│        └─ 2026-09-24-foundation.md
├─ src/
│  ├─ app/
│  │  ├─ App.tsx
│  │  └─ app.css
│  ├─ game/
│  │  ├─ create-game.ts
│  │  └─ scenes/
│  │     └─ BootScene.ts
│  ├─ persistence/
│  │  ├─ save/
│  │  │  ├─ save-budget.ts
│  │  │  └─ save-envelope.ts
│  │  └─ slots/
│  │     └─ save-slot-policy.ts
│  ├─ shared/
│  │  ├─ serialization/
│  │  │  └─ measure-json-bytes.ts
│  │  └─ transport/
│  │     ├─ command-budget.ts
│  │     └─ game-command.ts
│  └─ main.tsx
├─ tests/
│  ├─ e2e/
│  │  └─ app-shell.spec.ts
│  ├─ simulation/
│  │  └─ foundation-invariants.test.ts
│  └─ unit/
│     ├─ persistence/
│     │  └─ save-budget.test.ts
│     └─ transport/
│        └─ command-budget.test.ts
├─ .gitignore
├─ .nvmrc
├─ eslint.config.js
├─ index.html
├─ package.json
├─ package-lock.json
├─ playwright.config.ts
├─ prettier.config.mjs
├─ tsconfig.app.json
├─ tsconfig.json
├─ tsconfig.node.json
├─ vite.config.ts
└─ wrangler.jsonc
```

---

### Task 1: Scaffold the pinned toolchain and quality scripts

**Files:**
- Create: `package.json`
- Create: `package-lock.json` via `npm install`
- Create: `.nvmrc`
- Create: `.gitignore`
- Create: `tsconfig.json`
- Create: `tsconfig.app.json`
- Create: `tsconfig.node.json`
- Create: `vite.config.ts`
- Create: `eslint.config.js`
- Create: `prettier.config.mjs`
- Create: `playwright.config.ts`

**Interfaces:**
- Consumes: none.
- Produces: standard commands `dev`, `build`, `typecheck`, `lint`, `format`, `format:check`, `test`, `test:simulation`, `e2e`, and `verify`.

- [ ] **Step 1: Create `.nvmrc`**

```text
24
```

- [ ] **Step 2: Create `package.json` with exact runtime dependencies and scripts**

```json
{
  "name": "city",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "engines": {
    "node": ">=24 <25"
  },
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "typecheck": "tsc -b --pretty false",
    "lint": "eslint .",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "test": "vitest run tests/unit",
    "test:simulation": "vitest run tests/simulation",
    "e2e": "playwright test",
    "verify": "npm run format:check && npm run lint && npm run typecheck && npm run test && npm run test:simulation && npm run build"
  },
  "dependencies": {
    "phaser": "4.2.1",
    "react": "19.3.0",
    "react-dom": "19.3.0"
  },
  "devDependencies": {
    "@eslint/js": "10.0.1",
    "@playwright/test": "1.63.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "6.1.1",
    "eslint": "10.11.0",
    "prettier": "3.9.8",
    "typescript": "5.9.3",
    "typescript-eslint": "8.70.0",
    "vite": "8.3.0",
    "vitest": "5.0.1",
    "wrangler": "4.135.0"
  }
}
```

- [ ] **Step 3: Install dependencies and generate the lockfile**

Run:

```bash
npm install
```

Expected: `package-lock.json` is generated and install exits 0.

- [ ] **Step 4: Create strict TypeScript project references**

`tsconfig.json`:

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ]
}
```

`tsconfig.app.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true
  },
  "include": ["src", "tests"]
}
```

`tsconfig.node.json`:

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "strict": true
  },
  "include": [
    "vite.config.ts",
    "playwright.config.ts"
  ]
}
```

- [ ] **Step 5: Create Vite configuration**

```ts
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 4173,
  },
});
```

- [ ] **Step 6: Create ESLint flat configuration**

```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist', 'node_modules', 'playwright-report', 'test-results'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error'
    },
  },
);
```

- [ ] **Step 7: Create Prettier configuration**

```js
export default {
  singleQuote: true,
  trailingComma: 'all',
  printWidth: 100,
};
```

- [ ] **Step 8: Create Playwright configuration**

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
```

- [ ] **Step 9: Create `.gitignore`**

```text
node_modules/
dist/
coverage/
playwright-report/
test-results/
.env
.env.*
!.env.example
.DS_Store
```

- [ ] **Step 10: Run configuration checks**

Run:

```bash
npm run typecheck
npm run lint
```

Expected: both exit 0 with the repository still containing no application source.

- [ ] **Step 11: Commit**

```bash
git add package.json package-lock.json .nvmrc .gitignore tsconfig*.json vite.config.ts eslint.config.js prettier.config.mjs playwright.config.ts
git commit -m "chore: scaffold city game toolchain"
```

---

### Task 2: Add the React + Phaser boot shell using an E2E RED/GREEN cycle

**Files:**
- Create: `index.html`
- Create: `src/main.tsx`
- Create: `src/app/App.tsx`
- Create: `src/app/app.css`
- Create: `src/game/create-game.ts`
- Create: `src/game/scenes/BootScene.ts`
- Create: `tests/e2e/app-shell.spec.ts`

**Interfaces:**
- Consumes: Vite/React/Playwright setup from Task 1.
- Produces: `createGame(parent: HTMLElement): Phaser.Game`; stable test selectors `city-app` and `game-canvas-host`.

- [ ] **Step 1: Write the failing browser test**

```ts
import { expect, test } from '@playwright/test';

test('boots the city shell and Phaser canvas without browser errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/');

  await expect(page.getByTestId('city-app')).toBeVisible();
  await expect(page.getByTestId('game-canvas-host').locator('canvas')).toHaveCount(1);
  await expect(page.getByText('CITY')).toBeVisible();
  expect(errors).toEqual([]);
});
```

- [ ] **Step 2: Run E2E and verify RED**

Run:

```bash
npx playwright install chromium
npm run e2e
```

Expected: FAIL because the app entrypoint / selectors do not exist.

- [ ] **Step 3: Create `index.html`**

```html
<!doctype html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#101820" />
    <title>CITY</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 4: Create the Phaser boot scene**

```ts
import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  public constructor() {
    super('boot');
  }

  public create(): void {
    this.cameras.main.setBackgroundColor('#dbe6df');

    const graphics = this.add.graphics();
    graphics.lineStyle(1, 0xaebbb2, 0.45);

    const spacing = 32;
    for (let x = 0; x <= 1280; x += spacing) {
      graphics.lineBetween(x, 0, x, 720);
    }
    for (let y = 0; y <= 720; y += spacing) {
      graphics.lineBetween(0, y, 1280, y);
    }
  }
}
```

- [ ] **Step 5: Create the Phaser factory**

```ts
import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';

export function createGame(parent: HTMLElement): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: 1280,
    height: 720,
    backgroundColor: '#dbe6df',
    scene: [BootScene],
    render: {
      antialias: true,
      pixelArt: false,
    },
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
  });
}
```

- [ ] **Step 6: Create the React shell**

```tsx
import { useEffect, useRef } from 'react';
import type Phaser from 'phaser';
import { createGame } from '../game/create-game';
import './app.css';

export function App() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const game: Phaser.Game = createGame(host);
    return () => game.destroy(true);
  }, []);

  return (
    <main className="city-app" data-testid="city-app">
      <header className="city-hud">
        <strong>CITY</strong>
        <span>Development Build</span>
      </header>
      <div className="game-canvas-host" data-testid="game-canvas-host" ref={hostRef} />
    </main>
  );
}
```

- [ ] **Step 7: Create minimal responsive shell CSS**

```css
html,
body,
#root {
  width: 100%;
  height: 100%;
  margin: 0;
}

body {
  overflow: hidden;
  font-family:
    Inter, "Noto Sans JP", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: #101820;
}

* {
  box-sizing: border-box;
}

.city-app {
  position: relative;
  width: 100%;
  height: 100%;
}

.game-canvas-host {
  position: absolute;
  inset: 0;
}

.city-hud {
  position: absolute;
  z-index: 10;
  top: 12px;
  left: 12px;
  display: flex;
  gap: 10px;
  align-items: baseline;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgb(16 24 32 / 82%);
  color: #fff;
  pointer-events: none;
}

.city-hud span {
  font-size: 12px;
  opacity: 0.72;
}
```

- [ ] **Step 8: Create the React entrypoint**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 9: Run E2E and verify GREEN**

Run:

```bash
npm run e2e
```

Expected: 1 passed, zero captured browser errors.

- [ ] **Step 10: Run full non-E2E quality checks**

Run:

```bash
npm run verify
```

Expected: exit 0.

- [ ] **Step 11: Commit**

```bash
git add index.html src tests/e2e
git commit -m "feat: add React and Phaser game shell"
```

---

### Task 3: Add UTF-8 serialization measurement as a shared primitive

**Files:**
- Create: `src/shared/serialization/measure-json-bytes.ts`
- Create: `tests/unit/serialization/measure-json-bytes.test.ts`

**Interfaces:**
- Consumes: none.
- Produces: `measureJsonBytes(value: unknown): number`, used by transport and save budget guards.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { measureJsonBytes } from '../../../src/shared/serialization/measure-json-bytes';

describe('measureJsonBytes', () => {
  it('measures the UTF-8 encoded JSON payload', () => {
    const value = { city: '街' };
    expect(measureJsonBytes(value)).toBe(new TextEncoder().encode(JSON.stringify(value)).byteLength);
  });

  it('does not use JavaScript string length for multibyte text', () => {
    const value = { city: '習志野市' };
    expect(measureJsonBytes(value)).toBeGreaterThan(JSON.stringify(value).length);
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npx vitest run tests/unit/serialization/measure-json-bytes.test.ts
```

Expected: FAIL because `measureJsonBytes` does not exist.

- [ ] **Step 3: Implement the minimal utility**

```ts
const encoder = new TextEncoder();

export function measureJsonBytes(value: unknown): number {
  return encoder.encode(JSON.stringify(value)).byteLength;
}
```

- [ ] **Step 4: Run focused test and verify GREEN**

Run:

```bash
npx vitest run tests/unit/serialization/measure-json-bytes.test.ts
```

Expected: 2 passed.

- [ ] **Step 5: Run unit suite**

Run:

```bash
npm run test
```

Expected: all unit tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/shared/serialization tests/unit/serialization
git commit -m "feat: add UTF-8 payload measurement"
```

---

### Task 4: Lock the compact command/response contract and request-size guards

**Files:**
- Create: `src/shared/transport/game-command.ts`
- Create: `src/shared/transport/command-budget.ts`
- Create: `tests/unit/transport/command-budget.test.ts`

**Interfaces:**
- Consumes: `measureJsonBytes(value)`.
- Produces:
  - `GameCommand<TType, TPayload>`
  - `MutationResponse<TDelta, TEvent>`
  - `assertOrdinaryCommandSize(command)`
  - transport budget constants.

- [ ] **Step 1: Write failing transport tests**

```ts
import { describe, expect, it } from 'vitest';
import {
  ORDINARY_COMMAND_HARD_LIMIT_BYTES,
  ORDINARY_COMMAND_TARGET_BYTES,
  ORDINARY_RESPONSE_TARGET_BYTES,
  assertOrdinaryCommandSize,
} from '../../../src/shared/transport/command-budget';
import type { GameCommand } from '../../../src/shared/transport/game-command';

describe('command payload budgets', () => {
  it('defines the architecture budgets from the design spec', () => {
    expect(ORDINARY_COMMAND_TARGET_BYTES).toBe(64 * 1024);
    expect(ORDINARY_COMMAND_HARD_LIMIT_BYTES).toBe(256 * 1024);
    expect(ORDINARY_RESPONSE_TARGET_BYTES).toBe(128 * 1024);
  });

  it('accepts a compact ordinary command', () => {
    const command: GameCommand<'BUILD_ROAD', { start: [number, number]; end: [number, number] }> = {
      commandId: 'cmd-1',
      baseRevision: 12,
      type: 'BUILD_ROAD',
      payload: { start: [1, 2], end: [9, 2] },
    };

    expect(() => assertOrdinaryCommandSize(command)).not.toThrow();
  });

  it('rejects an ordinary command larger than the hard application limit', () => {
    const command: GameCommand<'DEBUG_BULK', { data: string }> = {
      commandId: 'cmd-too-large',
      baseRevision: 12,
      type: 'DEBUG_BULK',
      payload: { data: 'x'.repeat(ORDINARY_COMMAND_HARD_LIMIT_BYTES + 1024) },
    };

    expect(() => assertOrdinaryCommandSize(command)).toThrow(/exceeds ordinary command hard limit/i);
  });
});
```

- [ ] **Step 2: Run focused test and verify RED**

Run:

```bash
npx vitest run tests/unit/transport/command-budget.test.ts
```

Expected: FAIL because transport modules do not exist.

- [ ] **Step 3: Define the compact command/response contract**

```ts
export type GameCommand<TType extends string, TPayload> = Readonly<{
  commandId: string;
  baseRevision: number;
  type: TType;
  payload: TPayload;
}>;

export type MutationResponse<TDelta, TEvent = never> = Readonly<{
  commandId: string;
  revision: number;
  delta: TDelta;
  events: readonly TEvent[];
}>;

export type RevisionConflict = Readonly<{
  kind: 'REVISION_CONFLICT';
  expectedRevision: number;
  actualRevision: number;
}>;
```

- [ ] **Step 4: Implement budget constants and hard guard**

```ts
import { measureJsonBytes } from '../serialization/measure-json-bytes';

export const ORDINARY_COMMAND_TARGET_BYTES = 64 * 1024;
export const ORDINARY_COMMAND_HARD_LIMIT_BYTES = 256 * 1024;
export const ORDINARY_RESPONSE_TARGET_BYTES = 128 * 1024;

export function assertOrdinaryCommandSize(command: unknown): void {
  const bytes = measureJsonBytes(command);
  if (bytes > ORDINARY_COMMAND_HARD_LIMIT_BYTES) {
    throw new RangeError(
      `Command is ${bytes} bytes and exceeds ordinary command hard limit of ${ORDINARY_COMMAND_HARD_LIMIT_BYTES} bytes`,
    );
  }
}
```

- [ ] **Step 5: Run focused test and verify GREEN**

Run:

```bash
npx vitest run tests/unit/transport/command-budget.test.ts
```

Expected: 3 passed.

- [ ] **Step 6: Run unit suite and typecheck**

Run:

```bash
npm run test
npm run typecheck
```

Expected: both exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/shared/transport tests/unit/transport
git commit -m "feat: enforce compact command budgets"
```

---

### Task 5: Lock bounded save envelopes, autosave generations, and save-size budgets

**Files:**
- Create: `src/persistence/save/save-envelope.ts`
- Create: `src/persistence/save/save-budget.ts`
- Create: `src/persistence/slots/save-slot-policy.ts`
- Create: `tests/unit/persistence/save-budget.test.ts`

**Interfaces:**
- Consumes: `measureJsonBytes(value)`.
- Produces:
  - generic current-state-only `SaveEnvelope<TState>`
  - save budget constants,
  - `assertSaveWithinBudget(save, budget)`
  - fixed autosave/manual slot policy.

- [ ] **Step 1: Write failing persistence tests**

```ts
import { describe, expect, it } from 'vitest';
import {
  SAVE_BUDGET_10_YEAR_BYTES,
  SAVE_BUDGET_50_YEAR_BYTES,
  SAVE_BUDGET_STARTER_BYTES,
  assertSaveWithinBudget,
} from '../../../src/persistence/save/save-budget';
import type { SaveEnvelope } from '../../../src/persistence/save/save-envelope';
import {
  AUTOSAVE_GENERATIONS,
  MANUAL_SAVE_SLOTS,
} from '../../../src/persistence/slots/save-slot-policy';
import { measureJsonBytes } from '../../../src/shared/serialization/measure-json-bytes';

type FixtureState = {
  cityName: string;
  roads: string[];
};

function makeSave(state: FixtureState): SaveEnvelope<FixtureState> {
  return {
    saveVersion: 1,
    revision: 7,
    savedAtIso: '2026-09-24T00:00:00.000Z',
    state,
  };
}

describe('save architecture budgets', () => {
  it('keeps the fixed project budgets explicit', () => {
    expect(SAVE_BUDGET_STARTER_BYTES).toBe(2 * 1024 * 1024);
    expect(SAVE_BUDGET_10_YEAR_BYTES).toBe(5 * 1024 * 1024);
    expect(SAVE_BUDGET_50_YEAR_BYTES).toBe(15 * 1024 * 1024);
  });

  it('uses bounded save generations', () => {
    expect(AUTOSAVE_GENERATIONS).toBe(3);
    expect(MANUAL_SAVE_SLOTS).toBe(3);
  });

  it('does not grow the save when external command history grows', () => {
    const save = makeSave({ cityName: 'テスト市', roads: ['r1'] });
    const before = measureJsonBytes(save);

    const commandHistory = Array.from({ length: 100_000 }, (_, index) => ({
      commandId: `cmd-${index}`,
      response: { revision: index },
    }));

    expect(commandHistory).toHaveLength(100_000);
    expect(measureJsonBytes(save)).toBe(before);
  });

  it('rejects a save that exceeds an explicit budget', () => {
    const save = makeSave({ cityName: 'x'.repeat(4096), roads: [] });
    expect(() => assertSaveWithinBudget(save, 1024)).toThrow(/save budget/i);
  });
});
```

- [ ] **Step 2: Run focused test and verify RED**

Run:

```bash
npx vitest run tests/unit/persistence/save-budget.test.ts
```

Expected: FAIL because persistence modules do not exist.

- [ ] **Step 3: Define the generic current-state-only save envelope**

```ts
export type SaveEnvelope<TState> = Readonly<{
  saveVersion: number;
  revision: number;
  savedAtIso: string;
  state: TState;
}>;
```

Do not add operation history, undo history, previous full snapshots, or deduplication responses to this type.

- [ ] **Step 4: Define save budgets and guard**

```ts
import { measureJsonBytes } from '../../shared/serialization/measure-json-bytes';

export const SAVE_BUDGET_STARTER_BYTES = 2 * 1024 * 1024;
export const SAVE_BUDGET_10_YEAR_BYTES = 5 * 1024 * 1024;
export const SAVE_BUDGET_50_YEAR_BYTES = 15 * 1024 * 1024;

export function assertSaveWithinBudget(save: unknown, budgetBytes: number): void {
  const bytes = measureJsonBytes(save);
  if (bytes > budgetBytes) {
    throw new RangeError(`Save is ${bytes} bytes and exceeds save budget of ${budgetBytes} bytes`);
  }
}
```

- [ ] **Step 5: Define fixed slot limits**

```ts
export const AUTOSAVE_GENERATIONS = 3;
export const MANUAL_SAVE_SLOTS = 3;
```

- [ ] **Step 6: Run focused test and verify GREEN**

Run:

```bash
npx vitest run tests/unit/persistence/save-budget.test.ts
```

Expected: 4 passed.

- [ ] **Step 7: Run unit suite and typecheck**

Run:

```bash
npm run test
npm run typecheck
```

Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add src/persistence tests/unit/persistence
git commit -m "feat: establish bounded save architecture"
```

---

### Task 6: Add foundation simulation invariants that later systems must preserve

**Files:**
- Create: `tests/simulation/foundation-invariants.test.ts`

**Interfaces:**
- Consumes: transport/save policies from Tasks 4-5.
- Produces: a stable simulation-test entrypoint that later PRs extend rather than replacing.

- [ ] **Step 1: Write the foundation invariant suite**

```ts
import { describe, expect, it } from 'vitest';
import { ORDINARY_COMMAND_HARD_LIMIT_BYTES } from '../../src/shared/transport/command-budget';
import {
  SAVE_BUDGET_10_YEAR_BYTES,
  SAVE_BUDGET_50_YEAR_BYTES,
  SAVE_BUDGET_STARTER_BYTES,
} from '../../src/persistence/save/save-budget';
import { AUTOSAVE_GENERATIONS } from '../../src/persistence/slots/save-slot-policy';

describe('foundation architecture invariants', () => {
  it('keeps all size limits finite and positive', () => {
    for (const value of [
      ORDINARY_COMMAND_HARD_LIMIT_BYTES,
      SAVE_BUDGET_STARTER_BYTES,
      SAVE_BUDGET_10_YEAR_BYTES,
      SAVE_BUDGET_50_YEAR_BYTES,
      AUTOSAVE_GENERATIONS,
    ]) {
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThan(0);
    }
  });

  it('orders save budgets by expected city maturity', () => {
    expect(SAVE_BUDGET_STARTER_BYTES).toBeLessThan(SAVE_BUDGET_10_YEAR_BYTES);
    expect(SAVE_BUDGET_10_YEAR_BYTES).toBeLessThan(SAVE_BUDGET_50_YEAR_BYTES);
  });
});
```

- [ ] **Step 2: Run simulation suite**

Run:

```bash
npm run test:simulation
```

Expected: 2 passed.

- [ ] **Step 3: Commit**

```bash
git add tests/simulation
git commit -m "test: add foundation simulation invariants"
```

---

### Task 7: Configure Cloudflare Static Assets and CI quality gates

**Files:**
- Create: `wrangler.jsonc`
- Create: `.github/workflows/quality.yml`

**Interfaces:**
- Consumes: `npm run verify`, `npm run e2e`, Vite `dist/`.
- Produces: repeatable PR CI and a Workers Static Assets configuration suitable for GitHub-connected deployment.

- [ ] **Step 1: Create Workers Static Assets configuration**

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "city",
  "compatibility_date": "2026-09-24",
  "assets": {
    "directory": "./dist/",
    "not_found_handling": "single-page-application"
  }
}
```

- [ ] **Step 2: Create GitHub Actions quality workflow**

```yaml
name: quality

on:
  pull_request:
  push:
    branches:
      - main

concurrency:
  group: quality-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  quality:
    runs-on: ubuntu-latest
    timeout-minutes: 15

    steps:
      - uses: actions/checkout@v5

      - uses: actions/setup-node@v5
        with:
          node-version: 24
          cache: npm

      - run: npm ci

      - run: npm run verify

      - run: npx playwright install --with-deps chromium

      - run: npm run e2e
```

- [ ] **Step 3: Build production assets**

Run:

```bash
npm run build
```

Expected: `dist/index.html` and hashed client assets exist.

- [ ] **Step 4: Verify Wrangler can parse the project**

Run:

```bash
npx wrangler deploy --dry-run
```

Expected: exit 0; static assets resolve from `./dist/`.

- [ ] **Step 5: Run the complete local gate**

Run:

```bash
npm run verify
npm run e2e
```

Expected: both exit 0.

- [ ] **Step 6: Commit**

```bash
git add wrangler.jsonc .github/workflows/quality.yml
git commit -m "ci: add Cloudflare and quality gates"
```

---

### Task 8: Perform branch-level verification and open PR #1

**Files:**
- No new product files expected.
- Update only files required by verified formatter/linter output.

**Interfaces:**
- Consumes: all previous tasks.
- Produces: reviewed PR `Foundation` against `main`.

- [ ] **Step 1: Run formatter in write mode once**

Run:

```bash
npm run format
```

Expected: source/config files are normalized.

- [ ] **Step 2: Run the full non-browser gate fresh**

Run:

```bash
npm run verify
```

Expected: exit 0 with no warnings treated as errors.

- [ ] **Step 3: Run browser E2E fresh**

Run:

```bash
npm run e2e
```

Expected: Chromium suite passes and no app-shell console/page errors are reported.

- [ ] **Step 4: Run Cloudflare dry-run fresh**

Run:

```bash
npx wrangler deploy --dry-run
```

Expected: exit 0.

- [ ] **Step 5: Inspect repository status and diff**

Run:

```bash
git status --short
git diff --check
git diff origin/main...HEAD --stat
```

Expected:
- no unexpected generated files,
- `git diff --check` exits 0,
- diff is limited to Foundation scope.

- [ ] **Step 6: Commit formatter-only changes if Task 1-7 left any**

```bash
git add .
git commit -m "chore: normalize foundation files"
```

If `git status --short` is already clean, do not create an empty commit.

- [ ] **Step 7: Invoke `superpowers:requesting-code-review`**

Reviewer focus:
- React/Phaser teardown correctness under React StrictMode,
- ESLint/TypeScript config compatibility,
- save envelope does not contain history,
- request hard limit measures UTF-8 bytes,
- Wrangler SPA fallback and CI commands match local scripts.

Important/Critical review findings must be resolved before proceeding.

- [ ] **Step 8: Re-run verification after review fixes**

Run:

```bash
npm run verify
npm run e2e
npx wrangler deploy --dry-run
```

Expected: all exit 0.

- [ ] **Step 9: Invoke `superpowers:verification-before-completion` and create PR**

PR title:

```text
Foundation: establish game shell, quality gates, and size budgets
```

PR body must state:
- this is infrastructure only, not gameplay,
- exact verification commands and observed pass counts,
- save/request architecture guardrails introduced,
- Cloudflare deployment setup still requires the repository to be connected in the Cloudflare dashboard if not already connected.

---

## Plan Self-Review

### Spec coverage for PR #1

Covered:
- strict TypeScript/tooling foundation,
- React/Phaser separation starting point,
- Cloudflare Static Assets configuration,
- GitHub CI quality gate,
- browser boot verification,
- current-state-only save envelope,
- bounded autosave policy,
- save-size project budgets,
- compact command contract,
- ordinary request hard guard,
- UTF-8 byte measurement,
- dedicated simulation-test command.

Intentionally deferred to separate plans:
- PR #2 deterministic Simulation Kernel and seeded RNG,
- PR #3 map/camera,
- PR #4 roads,
- PR #5 zoning,
- PR #6 automatic buildings,
- PR #7 population/jobs,
- PR #8 economy/demand,
- later land value, services, traffic, real IndexedDB persistence, Japanese-city systems, and visual art production.

### Placeholder scan

No TBD/TODO/“implement later” steps are required to execute this PR. Deferred subsystems are explicitly out of PR #1 scope rather than placeholders inside it.

### Type consistency

- `measureJsonBytes(value: unknown): number` is used by both budget modules.
- `GameCommand<TType, TPayload>` is used by transport tests.
- `SaveEnvelope<TState>` is used by persistence tests.
- All budget constants use bytes and are integer values.

### Review Focus coverage

- Oversized commands: Task 4.
- Historical save growth: Task 5.
- Multibyte UTF-8 measurement: Task 3.
- Browser boot/console errors: Task 2.
- Cloudflare SPA handling: Task 7.

---

## Next Plans After PR #1

After Foundation is merged, create a separate written plan for **PR #2 Simulation Kernel**. That plan will introduce deterministic seeded RNG, simulation clock, immutable revision progression, command dispatch, headless stepping, and deterministic soak fixtures. It must reuse the save/request constraints established here rather than inventing new transport or persistence patterns.
