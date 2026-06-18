# Fase 1 — Interfaz DataRepo + LocalRepo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introducir una capa de datos abstracta (`DataRepo`) con una implementación local que envuelve `src/lib/storage.ts`, sin cambiar el comportamiento de la app, y montar Vitest para probarla.

**Architecture:** Se define `DataRepo` (interfaz async, app-facing/denormalizada) en `src/lib/data/types.ts`. `LocalRepo` la implementa delegando a las funciones existentes de `storage.ts`. `repo.ts` exporta un selector que por ahora siempre devuelve `LocalRepo` (la rama Supabase llega en la Fase 3). **La app NO se modifica en esta fase** (sigue usando `storage.ts` directo); el cableado de componentes es la Fase 2.

**Tech Stack:** TypeScript, Vitest + jsdom (nuevo), localStorage. Vite 7, React 19.

## Global Constraints

- Dual-backend: no romper el modo demo. La suite **E2E (Playwright) debe seguir verde** sin credenciales.
- El `DataRepo` es **async** (todos los métodos devuelven `Promise`).
- La interfaz es **denormalizada / app-facing** (espeja `storage.ts`); la descomposición a tablas normalizadas será interna de `SupabaseRepo` en fases posteriores.
- No se modifica el comportamiento observable de la app en esta fase.
- Node 24; los tests unitarios corren con `npm run test:unit`.

---

### Task 1: Montar el arnés de Vitest

**Files:**
- Modify: `package.json` (devDependencies + script `test:unit`)
- Create: `vitest.config.ts`
- Modify: `tsconfig.json` (excluir archivos de test del typecheck de producción)
- Create: `src/lib/data/smoke.test.ts` (test trivial, se borra en Task 3)

**Interfaces:**
- Consumes: nada.
- Produces: comando `npm run test:unit` ejecutando Vitest con entorno jsdom sobre `src/**/*.test.ts`.

- [ ] **Step 1: Instalar dependencias de test**

Run:
```bash
npm install -D vitest jsdom
```
Expected: `added N packages`. Sin errores.

- [ ] **Step 2: Crear `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
    globals: false,
  },
});
```

- [ ] **Step 3: Añadir el script `test:unit` a `package.json`**

En `"scripts"`, junto a los existentes, añadir:
```json
"test:unit": "vitest run",
```

- [ ] **Step 4: Excluir tests del typecheck de producción en `tsconfig.json`**

Añadir la clave `"exclude"` al objeto raíz (junto a `"include": ["src"]`):
```json
"exclude": ["src/**/*.test.ts"]
```

- [ ] **Step 5: Escribir un test smoke**

Crear `src/lib/data/smoke.test.ts`:
```ts
import { describe, it, expect } from "vitest";

describe("vitest harness", () => {
  it("localStorage está disponible (jsdom)", () => {
    localStorage.setItem("k", "v");
    expect(localStorage.getItem("k")).toBe("v");
    localStorage.clear();
  });
});
```

- [ ] **Step 6: Correr el test y verificar que pasa**

Run: `npm run test:unit`
Expected: PASS (1 test). Confirma que jsdom y `localStorage` funcionan.

- [ ] **Step 7: Verificar que el typecheck de producción sigue limpio**

Run: `npm run typecheck`
Expected: exit 0 (sin errores; los `.test.ts` quedan excluidos).

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json vitest.config.ts tsconfig.json src/lib/data/smoke.test.ts
git commit -m "test: montar arnés de Vitest (jsdom) para unit tests"
```

---

### Task 2: Definir la interfaz `DataRepo` y exportar `Database`

**Files:**
- Modify: `src/lib/storage.ts:10-14` (exportar el tipo `Database`)
- Create: `src/lib/data/types.ts`

**Interfaces:**
- Consumes: tipos `Candidate`, `JobPosition` de `src/types.ts`.
- Produces: `interface DataRepo` y `type Database` (re-exportado), usados por `LocalRepo` (Task 3) y el selector (Task 4).

- [ ] **Step 1: Exportar `Database` desde `storage.ts`**

En `src/lib/storage.ts`, cambiar la declaración local del tipo (línea ~10):
```ts
type Database = {
```
por:
```ts
export type Database = {
```

- [ ] **Step 2: Crear `src/lib/data/types.ts` con la interfaz**

```ts
import type { Candidate, JobPosition } from "../types";
import type { Database } from "../storage";

export type { Database };

// Interfaz de acceso a datos, app-facing y denormalizada (espeja storage.ts).
// Todas las operaciones son async para permitir un backend remoto (Supabase).
export interface DataRepo {
  loadDatabase(): Promise<Database>;
  upsertCandidate(candidate: Candidate): Promise<void>;
  recordCandidateAccess(candidate: Candidate): Promise<Candidate>;
  createCandidate(input: {
    name: string;
    email: string;
    phone?: string;
    roleTarget: string;
    positionId?: string;
  }): Promise<Candidate>;
  createPosition(input: {
    title: string;
    department?: string;
    location?: string;
    jd: string;
    enabledAssessments?: string[];
  }): Promise<JobPosition>;
  createCandidateAccount(input: {
    name: string;
    email: string;
    phone?: string;
    passwordDigest?: string;
    provider?: Candidate["authProvider"];
    roleTarget?: string;
    positionId?: string;
  }): Promise<Candidate>;
  findCandidateByCode(code: string): Promise<Candidate | undefined>;
  attachCandidateInvitation(account: Candidate, code: string): Promise<Candidate | null>;
  exportJson(): Promise<string>;
  exportCsv(): Promise<string>;
}
```

- [ ] **Step 3: Verificar typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/lib/storage.ts src/lib/data/types.ts
git commit -m "feat(data): definir interfaz DataRepo y exportar Database"
```

---

### Task 3: Implementar `LocalRepo` con unit tests (TDD)

**Files:**
- Create: `src/lib/data/localRepo.ts`
- Create: `src/lib/data/localRepo.test.ts`
- Delete: `src/lib/data/smoke.test.ts` (ya cumplió su función)

**Interfaces:**
- Consumes: `DataRepo`, `Database` de `./types`; funciones de `../storage`.
- Produces: `class LocalRepo implements DataRepo`, usada por el selector (Task 4).

- [ ] **Step 1: Escribir los tests que fallan**

Crear `src/lib/data/localRepo.test.ts`:
```ts
import { describe, it, expect, beforeEach } from "vitest";
import { LocalRepo } from "./localRepo";

const repo = new LocalRepo();

beforeEach(() => {
  localStorage.clear();
});

describe("LocalRepo", () => {
  it("loadDatabase devuelve el seed cuando el storage está vacío", async () => {
    const db = await repo.loadDatabase();
    expect(db.positions).toHaveLength(2);
    expect(db.candidates.some((c) => c.invitationCode === "DEMO-2026")).toBe(true);
  });

  it("upsertCandidate agrega un candidato nuevo y actualiza uno existente", async () => {
    const created = await repo.createCandidate({
      name: "Nuevo Candidato",
      email: "nuevo@example.com",
      roleTarget: "QA",
    });
    let db = await repo.loadDatabase();
    expect(db.candidates.some((c) => c.id === created.id)).toBe(true);

    await repo.upsertCandidate({ ...created, name: "Nombre Cambiado" });
    db = await repo.loadDatabase();
    expect(db.candidates.find((c) => c.id === created.id)?.name).toBe("Nombre Cambiado");
  });

  it("findCandidateByCode encuentra por código sin distinguir mayúsculas", async () => {
    const found = await repo.findCandidateByCode("demo-2026");
    expect(found?.invitationCode).toBe("DEMO-2026");
  });

  it("attachCandidateInvitation fusiona la cuenta en la invitación y marca verificación", async () => {
    const account = await repo.createCandidateAccount({
      name: "Persona Real",
      email: "real@example.com",
      provider: "email",
    });
    const merged = await repo.attachCandidateInvitation(account, "DEMO-2026");
    expect(merged).not.toBeNull();
    expect(merged?.name).toBe("Persona Real");
    expect(merged?.invitationCode).toBe("DEMO-2026");
    expect(merged?.invitationVerifiedAt).toBeTruthy();
  });

  it("exportJson no incluye passwordDigest", async () => {
    await repo.createCandidateAccount({
      name: "Con Password",
      email: "pw@example.com",
      passwordDigest: "secreto-hash",
      provider: "email",
    });
    const json = await repo.exportJson();
    expect(json).not.toContain("secreto-hash");
    expect(json).not.toContain("passwordDigest");
  });

  it("exportCsv devuelve una cabecera y una fila por candidato", async () => {
    const csv = await repo.exportCsv();
    const lines = csv.split("\n");
    const db = await repo.loadDatabase();
    expect(lines[0]).toContain("name,email");
    expect(lines).toHaveLength(db.candidates.length + 1);
  });
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npm run test:unit`
Expected: FAIL — `Cannot find module './localRepo'` (aún no existe).

- [ ] **Step 3: Implementar `LocalRepo`**

Crear `src/lib/data/localRepo.ts`:
```ts
import type { Candidate, JobPosition } from "../types";
import type { Database, DataRepo } from "./types";
import {
  loadDatabase,
  upsertCandidate,
  recordCandidateAccess,
  createCandidate,
  createPosition,
  createCandidateAccount,
  findCandidateByCode,
  attachCandidateInvitation,
  exportJson,
  exportCsv,
} from "../storage";

// Implementación demo: envuelve storage.ts (localStorage). Comportamiento idéntico
// al actual; solo añade la fachada async de DataRepo.
export class LocalRepo implements DataRepo {
  async loadDatabase(): Promise<Database> {
    return loadDatabase();
  }
  async upsertCandidate(candidate: Candidate): Promise<void> {
    upsertCandidate(candidate);
  }
  async recordCandidateAccess(candidate: Candidate): Promise<Candidate> {
    return recordCandidateAccess(candidate);
  }
  async createCandidate(input: {
    name: string;
    email: string;
    phone?: string;
    roleTarget: string;
    positionId?: string;
  }): Promise<Candidate> {
    return createCandidate(input);
  }
  async createPosition(input: {
    title: string;
    department?: string;
    location?: string;
    jd: string;
    enabledAssessments?: string[];
  }): Promise<JobPosition> {
    return createPosition(input);
  }
  async createCandidateAccount(input: {
    name: string;
    email: string;
    phone?: string;
    passwordDigest?: string;
    provider?: Candidate["authProvider"];
    roleTarget?: string;
    positionId?: string;
  }): Promise<Candidate> {
    return createCandidateAccount(input);
  }
  async findCandidateByCode(code: string): Promise<Candidate | undefined> {
    return findCandidateByCode(code);
  }
  async attachCandidateInvitation(account: Candidate, code: string): Promise<Candidate | null> {
    return attachCandidateInvitation(account, code);
  }
  async exportJson(): Promise<string> {
    return exportJson();
  }
  async exportCsv(): Promise<string> {
    return exportCsv();
  }
}
```

- [ ] **Step 4: Borrar el test smoke**

```bash
git rm src/lib/data/smoke.test.ts
```

- [ ] **Step 5: Correr los tests y verificar que pasan**

Run: `npm run test:unit`
Expected: PASS (6 tests de LocalRepo).

- [ ] **Step 6: Commit**

```bash
git add src/lib/data/localRepo.ts src/lib/data/localRepo.test.ts
git commit -m "feat(data): LocalRepo envuelve storage.ts con tests"
```

---

### Task 4: Selector `repo` + verificación integral

**Files:**
- Create: `src/lib/data/repo.ts`

**Interfaces:**
- Consumes: `LocalRepo` de `./localRepo`; `DataRepo` de `./types`.
- Produces: `export const repo: DataRepo` — el punto de entrada único que la Fase 2 cableará en los componentes.

- [ ] **Step 1: Crear el selector**

Crear `src/lib/data/repo.ts`:
```ts
import { LocalRepo } from "./localRepo";
import type { DataRepo } from "./types";

// Selector del backend de datos. En esta fase solo existe LocalRepo (modo demo).
// La Fase 3 añadirá SupabaseRepo y el branch `isSupabaseConfigured ? supabase : local`.
export const repo: DataRepo = new LocalRepo();
```

- [ ] **Step 2: Verificación integral (typecheck + build + unit + E2E)**

Run:
```bash
npm run typecheck && npm run build && npm run test:unit && npx playwright test
```
Expected: typecheck exit 0; build OK; unit PASS (6); **E2E 6/6 PASS** (la app no cambió, sigue en modo demo).

- [ ] **Step 3: Commit**

```bash
git add src/lib/data/repo.ts
git commit -m "feat(data): selector repo (LocalRepo) como punto de entrada de datos"
```

---

## Notas de seguimiento (fuera de esta fase)

- **CI:** cuando el workflow `.github/workflows/ci.yml` esté en GitHub (pendiente del scope `workflow` del token), añadir un paso `npm run test:unit` antes del build.
- **Fase 2:** reemplazar en `src/App.tsx` los imports directos de `storage.ts` por el `store` (snapshot) que consume `repo`; mantener E2E verde.

## Self-Review (hecha)

- **Cobertura del spec:** esta fase implementa la pieza "interfaz `DataRepo` + `LocalRepo`" y el arnés de unit tests del spec (§3, §8, Fase 1). El resto del spec son fases posteriores con sus propios planes.
- **Placeholders:** sin TBD/TODO en código; todo paso lleva código o comando real.
- **Consistencia de tipos:** los nombres y firmas de `DataRepo` (Task 2) coinciden con los usados en `LocalRepo` (Task 3) y el selector (Task 4), y espejan las firmas reales de `storage.ts`.
