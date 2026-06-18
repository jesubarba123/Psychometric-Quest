# Spec: Migración de la capa de datos a Supabase (dual-backend, multi-tenant)

**Fecha:** 2026-06-18
**Estado:** Diseño aprobado — pendiente plan de implementación (writing-plans)
**Proyecto Supabase:** `dbklawcznqldcivtwwse` (schema ya aplicado, RLS activo)

## 1. Contexto y objetivo

Hoy la app persiste **todo** en `localStorage` vía `src/lib/storage.ts`: de forma **síncrona** y con un modelo **desnormalizado** (un `Candidate` con `events`, `behavioral`, `personality` y el CV como `dataUrl` embebidos). El dashboard admin lee de ahí, por lo que los datos son **por-dispositivo**, no compartidos.

Existe un schema Supabase **normalizado** con RLS (`supabase/schema.sql`), ya aplicado al proyecto. La auth ya enruta admin/candidato (rama `feat/admin-auth`).

**Objetivo:** migrar la capa de datos a Supabase como backend real **multi-tenant**, **preservando el modo demo (localStorage)** para desarrollo, E2E y el bucle de mejora continua.

## 2. Decisiones aprobadas

1. **Dual-backend con interfaz común** (`DataRepo`): `LocalRepo` (demo) + `SupabaseRepo` (prod), seleccionados por `isSupabaseConfigured`.
2. **Alcance completo:** candidatos, posiciones, assessments, game_events, personality (respuestas + resultados), export, y **CV → Storage**.
3. **Multi-tenant completo:** cada admin gestiona su organización; scoping por `organization_id`; aislamiento por RLS.
4. **Estrategia sync→async = "snapshot hidratado":** el repo (async) hidrata un snapshot en memoria; los componentes siguen leyendo **síncrono** ese snapshot; las escrituras son write-through async + `refresh()`. Sin tiempo real (refresco manual; ya existe el patrón `dbVersion`/botón refrescar).

## 3. Arquitectura

Nuevo paquete `src/lib/data/`:

- **`types.ts` — interfaz `DataRepo` (async).** Contrato único con todas las operaciones que la app necesita. Esbozo (no final):

  ```ts
  interface DataRepo {
    // contexto de sesión
    getSessionContext(): Promise<{ profile: Profile; organizationId: string; role: Role } | null>;
    ensureAdminOrg(user): Promise<{ organizationId: string }>; // provisiona org+profile admin si faltan
    // organizaciones / posiciones / invitaciones (admin)
    listPositions(orgId): Promise<JobPosition[]>;
    listOpenPositions(orgId): Promise<JobPosition[]>;
    createPosition(input): Promise<JobPosition>;
    createInvitation(input): Promise<Candidate>;   // candidato pre-creado con invitation_code
    // candidato
    getCandidateByUser(userId): Promise<Candidate | null>;
    attachInvitation(code, user): Promise<Candidate | null>;
    updateCandidateSelf(patch): Promise<void>;      // vía RPC candidate_update_self
    recordAccess(candidate): Promise<Candidate>;
    // assessments / eventos / personality
    saveAssessment(candidateId, behavioral, personality): Promise<void>;
    insertGameEvents(candidateId, events): Promise<void>;
    savePersonality(candidateId, responses, results): Promise<void>;
    // lectura admin + export
    listCandidatesForOrg(orgId): Promise<Candidate[]>; // ensamblado denormalizado
    // CV
    uploadCv(candidateId, file): Promise<{ path: string; url: string }>;
    getCvSignedUrl(path): Promise<string>;
  }
  ```

- **`localRepo.ts` — `LocalRepo`.** Envuelve la lógica actual de `storage.ts` (async wrappers). Preserva el modo demo: una **org por defecto implícita**, el seed (posiciones + invitación `DEMO-2026`), y el CV como `dataUrl`. No cambia el comportamiento demo observable.

- **`supabaseRepo.ts` — `SupabaseRepo`.** Implementación real: `supabase-js` + schema normalizado + Storage (`candidate-cvs`) + RPC `candidate_update_self`. Contiene el **mapeo normalizado ↔ denormalizado** (§4).

- **`store.ts` — snapshot en memoria.** `hydrate()` carga del repo al snapshot desnormalizado que esperan los componentes; `snapshot()` lo devuelve **síncrono**; los mutadores llaman `repo.x()` y luego `refresh()` (re-hidrata). Reemplaza el `loadDatabase()`/`dbVersion` actual con mínima fricción.

- **Selector:** `export const repo = isSupabaseConfigured ? new SupabaseRepo(supabase) : new LocalRepo()`.

## 4. Modelo de datos y mapeo (el corazón)

`SupabaseRepo` traduce entre el modelo **normalizado** (Postgres) y el **denormalizado** (UI):

| UI (denormalizado) | Supabase (normalizado) |
|---|---|
| `Candidate` (campos básicos, cv, status) | `candidates` (+ `organization_id`, `user_id`) |
| `Candidate.behavioral` + dimensiones cognitivas | `assessments` (una fila por candidato) |
| `Candidate.personality` (dominios) | `personality_results` |
| respuestas crudas Big Five | `personality_responses` |
| `Candidate.events[]` (eventos de juego) | `game_events` |
| `Candidate.cvFile.dataUrl` | objeto en bucket `candidate-cvs` + `cv_file_url` |

- **Lectura (hydrate):** consultas por org → ensambla cada `Candidate` con su `assessment`, `personality_results`, `events`.
- **Escritura (write-through):** `upsert`/`insert` en las tablas correspondientes; el candidato usa la **RPC `candidate_update_self`** (RLS impide UPDATE directo de columnas sensibles).

## 5. Multi-tenant y auth

- **Admin:** al primer login (allowlist/rol), `ensureAdminOrg` garantiza `profiles` (role=admin) y `organizations`; si no tiene org, se crea (nombrada por el admin). RLS lo acota a su org vía `is_admin_for_org`.
- **Candidato:** signup Supabase → ingresa **código de invitación** → `attachInvitation` enlaza la fila `candidates` pre-creada por el admin (trae `organization_id` + `position_id`) y fija `user_id = auth.uid()`. La org la hereda de la invitación.
- **Seeding:** en Supabase **no hay seed automático**; el admin crea org + posiciones + invitaciones. El demo (`DEMO-2026`, posiciones de ejemplo) vive solo en `LocalRepo`.

## 6. CV → Storage

Subida al bucket privado `candidate-cvs` con ruta `{candidateId}/{filename}`; se guarda `cv_file_name/size/type/url` vía `candidate_update_self`. El admin lo abre con **signed URL** (la policy `admins read cv files in org` lo permite). `LocalRepo` mantiene `dataUrl`. Límite de tamaño actual (≤3.5 MB) se mantiene.

## 7. Manejo de errores

- Métodos del repo **lanzan** en fallo; el `store` expone `error`; la UI muestra estados de **carga / vacío / error** (el `frontend-dev` ya exige esos estados).
- Casos explícitos: **confirmación de email** pendiente al registrarse; **denegación RLS** → "no autorizado"; fallo de red → mensaje + reintento; fallo de subida de CV → no bloquear el resto del perfil.

## 8. Testing

- **E2E demo (sin credenciales) se mantiene verde** — ejercita `LocalRepo`; CI y el bucle quedan intactos (corren sin `.env`).
- **Unit tests del mapeo** normalizado ↔ denormalizado (la pieza más propensa a bugs) con un cliente Supabase mockeado.
- **(Opcional, fase final) E2E en modo Supabase** contra un proyecto/instancia de test, gateado por env/secret en CI.

## 9. Fases de implementación (alcance completo, entrega incremental ≈9 PRs)

1. `DataRepo` + `LocalRepo` (refactor de `storage.ts` detrás de la interfaz; comportamiento demo idéntico; E2E verde).
2. `store` (snapshot) + cablear componentes a `store.snapshot()` (aún LocalRepo; E2E verde).
3. `SupabaseRepo`: contexto de sesión + `ensureAdminOrg` (org/profile).
4. `SupabaseRepo`: posiciones + invitaciones (admin).
5. `SupabaseRepo`: escritura del candidato (perfil, assessments, eventos, personality) + RPC.
6. `SupabaseRepo`: lectura admin (dashboard) + export.
7. CV → Storage.
8. Flujos multi-tenant (creación de org, gestión de posiciones/invitaciones por org) + validación RLS.
9. Tests en modo Supabase.

Cada fase es un PR verificable (typecheck + build + E2E demo). Las fases pueden repartirse al bucle de mejora.

## 10. Fuera de alcance (YAGNI por ahora)

- Suscripciones en tiempo real (realtime).
- Migrar datos históricos de `localStorage` a Supabase.
- Invitación de **co-admins** dentro de una org (solo el admin dueño por ahora).
- OAuth social (Google/GitHub/…): depende de configurar apps OAuth; track aparte.

## 11. Riesgos

- **Refactor sync→async amplio:** mitigado por el snapshot hidratado (componentes casi sin cambios) y la entrega por fases.
- **Divergencia de mapeo** normalizado↔denormalizado: mitigado con unit tests del mapeo.
- **RLS mal calibrado** → fugas o bloqueos: validar con `get_advisors` y pruebas por rol tras cada fase.
- **Estados de datos compartidos vs snapshot** (staleness): aceptable para piloto (refresco manual); revisitar si molesta.
- **Confirmación de email** fricciona el onboarding: decidir si se desactiva o se documenta.
