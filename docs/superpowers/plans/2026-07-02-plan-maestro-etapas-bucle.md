# Plan maestro por etapas — Psychometric Quest → producción

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Llevar la plataforma de "demo en localStorage con schema Supabase aplicado pero sin usar" a producción multi-tenant en Vercel, ejecutando cada etapa con el bucle **Fable diseña → Sonnet implementa → Fable revisa**.

**Architecture:** Dual-backend detrás de la interfaz `DataRepo` ya existente (`src/lib/data/`): `LocalRepo` (demo/E2E) + `SupabaseRepo` (prod), con un *snapshot hidratado* en memoria para que los componentes sigan leyendo síncrono. La spec de diseño aprobada es `docs/superpowers/specs/2026-06-18-supabase-data-layer-migration-design.md`; este plan la ejecuta y le añade tres mejoras de diseño de sistemas (outcomes server-side, rol admin server-side, CI).

**Tech Stack:** Vite 7 + React 19 + TypeScript, Supabase (Postgres + RLS + Storage + Auth), Vitest, Playwright, Vercel.

## Global Constraints

- **Nunca trabajar sobre `main`**: rama por etapa + PR (regla de `docs/IMPROVEMENT_LOOP.md`).
- **Gates obligatorios por etapa:** `npm run typecheck` + `npm run build` + `npm run test:unit` + `npm run test:e2e`, todos verdes con evidencia antes de cerrar.
- **El modo demo (sin `.env`) debe seguir funcionando idéntico**: los 6 E2E corren sin Supabase y deben permanecer verdes en todas las etapas.
- **Evidencia antes que afirmaciones**: pegar output real de los gates en el PR.
- **Cerrar cada etapa actualizando `docs/pipeline.json`** + `npm run pipeline` (regla del runbook, Fase 6).
- Línea base verificada verde el 2026-07-02: typecheck exit 0, 91 unit (7 archivos), 6/6 E2E.

---

## Protocolo del bucle (Fable diseña → Sonnet implementa → Fable revisa)

Cada etapa se ejecuta así, desde una sesión de Claude Code con Fable como orquestador:

1. **Fable diseña (esta sesión):** convierte la etapa en un *ticket ejecutable*: archivos exactos, contratos/firmas, criterios de aceptación verificables y qué tests añadir. El diseño de detalle vive en el ticket, no se improvisa.
2. **Sonnet implementa:** se despacha un subagente con `model: "sonnet"` (Sonnet 5 — "Sonnet 6" no existe hoy) y el ticket completo. Reglas del ticket: cambios mínimos, TDD donde aplique, correr typecheck+unit antes de entregar, no tocar nada fuera del alcance.
3. **Fable revisa (esta sesión):** lee el diff completo, corre los 4 gates, y verifica los criterios de aceptación uno a uno. Si hay problemas, devuelve un brief de arreglo al MISMO subagente (`SendMessage`) — máximo 2 vueltas; a la tercera, Fable arregla directo o revierte.
4. **Cierre:** commit con mensaje claro, push de la rama, PR contra `main` con evidencia de gates, actualización de `pipeline.json`.

Las etapas E2–E9 reciben su ticket detallado cuando arranca su iteración del bucle (el diseño fino de E5 hecho hoy estaría obsoleto cuando E2–E4 hayan tocado el código). Lo que fija ESTE plan para cada etapa es: alcance, archivos, contrato público y criterios de aceptación — eso no cambia.

---

### Etapa E1 — Store snapshot + cablear `App.tsx` al repo (spec §9 fase 2)

La app deja de importar `src/lib/storage.ts` directo y pasa a leer/escribir vía `src/lib/data/` (hoy `LocalRepo`; en E2+ se enchufa `SupabaseRepo` sin tocar componentes). Es la etapa llave: sin ella, todo lo demás no tiene dónde enchufarse.

**Files:**
- Create: `src/lib/data/store.ts`
- Create: `src/lib/data/store.test.ts`
- Modify: `src/App.tsx` (import de `./lib/storage` en línea 15 y todos los call-sites: líneas ~71, 86, 189, 218, 241, 407, 591, 639, 699, 1398, 1459, 1467, 1496, 1498, 1956, 2088)

**Interfaces:**
- Consumes: `repo: DataRepo` de `src/lib/data/repo.ts`; tipo `Database` de `src/lib/storage.ts`.
- Produces (contrato que E2–E9 dan por hecho):

```ts
// src/lib/data/store.ts
export async function hydrate(): Promise<void>;            // carga repo → snapshot en memoria
export function snapshot(): Database;                       // lectura síncrona para componentes
export async function refresh(): Promise<void>;             // re-hidrata tras escrituras externas
// mutadores: espejo 1:1 de DataRepo, cada uno hace write-through + re-hidrata
export async function upsertCandidate(c: Candidate): Promise<void>;
export async function recordCandidateAccess(c: Candidate): Promise<Candidate>;
export async function createCandidate(input: {...}): Promise<Candidate>;      // misma firma que DataRepo
export async function createPosition(input: {...}): Promise<JobPosition>;     // misma firma que DataRepo
export async function createCandidateAccount(input: {...}): Promise<Candidate>;
export async function findCandidateByCode(code: string): Promise<Candidate | undefined>;
export async function attachCandidateInvitation(a: Candidate, code: string): Promise<Candidate | null>;
export async function exportJson(): Promise<string>;
export async function exportCsv(): Promise<string>;
```

- [ ] **Step 1: test que falla** — `store.test.ts`: (a) `hydrate()` y luego `snapshot()` devuelve el seed (≥2 posiciones, candidato `cand-demo`); (b) `createPosition(...)` seguido de `snapshot()` refleja la posición nueva sin llamar `hydrate()` otra vez; (c) `snapshot()` antes de `hydrate()` devuelve `{candidates: [], positions: []}` sin lanzar. Usar `beforeEach` que limpie `localStorage` (patrón de `localRepo.test.ts`).
- [ ] **Step 2: correr** `npx vitest run src/lib/data/store.test.ts` → FAIL (módulo no existe).
- [ ] **Step 3: implementar `store.ts`** — módulo con `let db: Database = { candidates: [], positions: [] }`; `hydrate/refresh` asignan `db = await repo.loadDatabase()`; cada mutador delega en `repo.x(...)` y termina con `await refresh()`; `snapshot()` devuelve `db`.
- [ ] **Step 4: correr el test** → PASS.
- [ ] **Step 5: cablear `App.tsx`** — sustituir el import de `./lib/storage` por `./lib/data/store`; `loadDatabase().X` en render → `snapshot().X`; en el arranque del componente `App`, `useEffect(() => { hydrate().then(() => setReady(true)); }, [])` con un estado `ready` que muestre un placeholder mínimo (`<div className="app-shell" />`) hasta hidratar; handlers que llaman mutadores pasan a `async` (o `.then()`), y tras cada mutación que la UI deba reflejar, re-render vía el patrón `dbVersion` existente.
- [ ] **Step 6: gates completos** — `npm run typecheck && npm run build && npm run test:unit && npm run test:e2e` → todo verde.
- [ ] **Step 7: criterio de aceptación** — `grep -n 'from "./lib/storage"' src/App.tsx` → 0 resultados (solo `src/lib/data/*` puede importar `storage.ts`).
- [ ] **Step 8: commit** `feat(data): store snapshot + App cableado a DataRepo (fase 2 de la migración)`.

### Etapa E2 — `SupabaseRepo`: sesión + `ensureAdminOrg` + rol admin server-side (spec §9 fase 3, endurecida)

**Files:** Create `src/lib/data/supabaseRepo.ts`, `supabase/migrations/0002_admin_allowlist.sql`; Modify `src/lib/data/repo.ts` (selector `isSupabaseConfigured ? new SupabaseRepo() : new LocalRepo()`).

**Mejora de diseño (nueva, no estaba en la spec):** hoy el rol admin depende de `VITE_ADMIN_EMAILS`, una variable **compilada en el bundle del cliente** — sirve para enrutar UI pero no puede ser la fuente de verdad de seguridad. La fuente de verdad pasa a ser `profiles.role` en Postgres, provisionada server-side: tabla `admin_allowlist(email)` gestionada por el dueño + trigger en `auth.users` que crea el `profile` con `role = 'admin'` si el email está en la allowlist (y `candidate` si no). RLS ya usa `is_admin_for_org`; ninguna ruta de cliente puede autopromoverse.

**Criterios de aceptación:** `getSessionContext()` y `ensureAdminOrg()` implementados según la spec §3; un usuario cuyo email NO está en `admin_allowlist` no puede obtener `role='admin'` ni vía signup con metadata manipulada (test SQL/manual documentado); E2E demo sigue verde (sin `.env` se sigue usando `LocalRepo`).
**Acción del dueño:** aplicar la migración en Supabase y poblar `admin_allowlist` (p. ej. `jesubarba123@gmail.com`).

### Etapa E3 — `SupabaseRepo`: posiciones + invitaciones admin (spec §9 fase 4)

**Files:** Modify `src/lib/data/supabaseRepo.ts`; test de mapeo con cliente mockeado (`supabaseRepo.test.ts`).
**Criterios:** `listPositions`, `createPosition`, `createInvitation` (candidato pre-creado con `invitation_code` + `organization_id`); unit tests del mapeo normalizado↔denormalizado; gates verdes.

### Etapa E4 — `SupabaseRepo`: escritura del candidato (spec §9 fase 5)

**Files:** Modify `src/lib/data/supabaseRepo.ts`; Create RPC `candidate_update_self` en `supabase/migrations/0003_candidate_update_self.sql` si no existe en el schema aplicado.
**Criterios:** `attachInvitation` (enlaza `user_id = auth.uid()` a la fila pre-creada), `saveAssessment`, `insertGameEvents`, `savePersonality`; el candidato no puede tocar columnas sensibles (RLS + RPC); unit tests del mapeo; gates verdes.

### Etapa E5 — `SupabaseRepo`: lectura admin + export (spec §9 fase 6)

**Criterios:** `listCandidatesForOrg` ensambla el `Candidate` denormalizado (candidates + assessments + personality_results + game_events) que el dashboard ya espera; export CSV/JSON idéntico en columnas al actual (`storage.ts:367`); prueba de humo manual contra el proyecto Supabase real documentada en el PR; gates verdes.

### Etapa E6 — CV → Supabase Storage (spec §9 fase 7)

**Criterios:** `uploadCv` al bucket `candidate-cvs` con ruta `{candidateId}/{filename}` + `getCvSignedUrl` para el admin; `LocalRepo` conserva `dataUrl`; límite ≤3.5 MB se mantiene; fallo de subida no bloquea el resto del perfil; gates verdes.

### Etapa E7 — Outcomes server-side (cierra N1 de `docs/PSYCHOMETRIC_AUDIT.md` §3.B)

**Mejora de diseño (nueva):** hoy el criterio de desempeño (`OutcomePanel`, `App.tsx:1941`) se guarda solo en el localStorage del navegador del admin — el dato que habilita TODO el estudio de validez puede perderse con un "borrar datos de navegación". Nueva tabla:

```sql
create table public.candidate_outcomes (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  organization_id uuid not null references public.organizations(id),
  hiring_decision text,          -- hired / rejected / offer_declined
  performance_rating numeric,    -- criterio principal
  retention_6m boolean,
  retention_12m boolean,
  predictor_snapshot jsonb not null,  -- scores CONGELADOS al momento de evaluar (mismas columnas que buildValidationCsv)
  recorded_by uuid references public.profiles(id),
  recorded_at timestamptz not null default now(),
  unique (candidate_id)
);
-- RLS: solo admins de la org leen/escriben; el candidato JAMÁS ve su outcome.
```

**Criterios:** `saveOutcome`/`getOutcomes` en `DataRepo` (LocalRepo mantiene comportamiento actual); `predictor_snapshot` se congela al guardar (no se recalcula al leer); `buildValidationCsv` lee del repo; RLS verificada con `get_advisors`; gates verdes.
**Acción del dueño:** aprobar el schema y aplicar la migración (decisión N1 de la auditoría).

### Etapa E8 — Validación multi-tenant + hardening RLS (spec §9 fase 8)

**Criterios:** flujo completo org A/org B sin fugas (admin A no ve candidatos de B; candidato no ve pool); `get_advisors` (security) sin hallazgos críticos; documentar postura de PII y confirmación de que la auth SHA-256 local es solo demo; gates verdes.

### Etapa E9 — CI + Deploy Vercel + smoke post-deploy

**Files:** Create `.github/workflows/ci.yml` (typecheck + build + unit + E2E demo, sin secretos).
**Criterios:** CI verde en PR; deploy de producción en Vercel con `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`; smoke manual post-deploy (login admin, crear invitación, flujo candidato) documentado; `pipeline.json` marca la etapa deploy como done.
**Acciones del dueño (bloqueantes):** (1) el token gh actual no tiene scope `workflow` — subir el workflow desde su cuenta o renovar token; (2) configurar env vars en Vercel; (3) crear/confirmar el usuario admin en Supabase.

---

## Fuera de alcance (YAGNI, heredado de la spec §10)

Realtime, migración de datos históricos de localStorage, co-admins, OAuth social (requiere apps OAuth del dueño), y refactor big-bang de `App.tsx` — solo se extraen módulos cuando una etapa toca esa pantalla y el archivo estorbe.

## Orden y dependencias

E1 → E2 → (E3 → E4 → E5) → E6 → E7 → E8 → E9. E7 puede adelantarse tras E2 si el dueño aprueba el schema antes. Cada etapa = una rama + un PR verificable.
