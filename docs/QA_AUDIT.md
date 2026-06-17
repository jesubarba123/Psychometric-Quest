# QA Audit — Psychometric Quest (RE-AUDITORÍA de seguimiento)

**Auditor:** sdet-qa-reviewer · **Fecha:** 2026-06-16 · **Commit base:** `main` (MVP localStorage)
**Alcance:** verificación en código de los fixes aplicados a los hallazgos del informe previo + búsqueda de regresiones.
**Método:** lectura directa del código (no se asume). Cada veredicto cita `archivo:línea`.

---

## 1. Resumen ejecutivo

**Veredicto:** los **7 hallazgos accionables verificados (C-1, C-2, C-3, C-4, E-1, D-1, D-2) quedaron RESUELTOS** en el
código actual. No se detectaron regresiones introducidas por los fixes. `npx tsc --noEmit` → **exit 0** (verificado
en esta sesión).

> **No quedan hallazgos críticos ni altos accionables abiertos en el código.** El único "Alto" del informe anterior
> (C-1, eventos duplicados al re-tomar) está corregido por reemplazo basado en el `type` de evento, tanto en juegos
> (`Assessments.onDone`) como en el survey (`Survey.goNext`).

Los hallazgos restantes son los **medios/bajos no accionables-en-código del informe original** (S-1 KDF de demo,
A-1/A-2/A-3 accesibilidad, P-1/P-2/P-3 rendimiento, T-1/T-2 type-safety) que dependen de decisiones del dueño o de
trabajo de mejora no urgente, más la **brecha de testing (0 pruebas automatizadas)**, que sigue siendo el riesgo de
proceso número uno.

### Top 3 focos restantes (no bloqueantes)
1. **Sin pruebas automatizadas.** Los fixes de C-1/C-3/C-4 son exactamente el tipo de invariante que una suite
   protegería contra futuras regresiones. Prioridad: red de seguridad (Vitest + RTL).
2. **Persistencia con `dataUrl` de CV en localStorage.** D-1/D-2 ya evitan el crash y versionan el esquema, pero la
   decisión de fondo (subir CV a Supabase Storage vs. cuota ~5 MB) sigue pendiente del dueño.
3. **Validez psicométrica.** C-3 ya elimina el atajo "elige 3 figuras"; queda la revisión de validez de las fórmulas
   de scoring (no es un bug, es criterio de dominio).

---

## 2. Verificación de hallazgos previos

| # | Sev orig. | Estado | Evidencia del fix | Notas de verificación |
|---|-----------|--------|-------------------|-----------------------|
| **C-1** | Alto | ✅ **RESUELTO** | `src/App.tsx:701-705` y `:947-953` | Ver §2.1. Reemplazo por `type`, no acumulación. Sin regresión. |
| **C-2** | Bajo | ✅ **RESUELTO** | `src/App.tsx:826` | `onStart={() => setStage("practice")}` directo; ternario tautológico eliminado. |
| **C-3** | Bajo | ✅ **RESUELTO** | `src/components/RavenMatrices.tsx:55-58` | `countOffset` aleatorio por ítem; respuesta ya no es siempre 3. Regla sigue inferible; distractores únicos. Ver §2.3. |
| **C-4** | Bajo | ✅ **RESUELTO** | `src/components/Switchboard.tsx:106-108, 118-124, 133-141` | `trialRef` sellado en `beginTrial`; render y scoring leen la misma fuente. Ver §2.4. |
| **E-1** | Medio | ✅ **RESUELTO** | `src/components/SignalSurge.tsx:207-208, 222, 293, 295` | rAF guardado en `progressRaf`; se detiene si `!trialActive.current`; cancelado en cleanup de desmontaje. Ver §2.5. |
| **D-1** | Medio-Alto | ✅ **RESUELTO** | `src/lib/storage.ts:149-159` | `saveDatabase` en try/catch, loguea, devuelve `boolean`. Ver §2.6. |
| **D-2** | Medio | ✅ **RESUELTO** | `src/lib/storage.ts:8, 13, 134, 153` | `SCHEMA_VERSION = 3` sellado al guardar y normalizado al cargar. Ver §2.6. |

### 2.1 C-1 — Re-tomar prueba duplica eventos · ✅ RESUELTO

**Juegos** (`src/App.tsx:701-705`):
```ts
return <GamePlayer key={active} gameKey={active} onDone={(events) => {
  const incomingTypes = new Set(events.map((event) => event.type));
  const kept = (work.events ?? []).filter((event) => !incomingTypes.has(event.type));
  back({ ...work, events: [...kept, ...events] });
}} onBack={() => back()} />;
```
El set de tipos se construye **a partir de los eventos realmente entregados**, no de una lista hardcodeada. Esto cubre
correctamente los juegos que emiten **dos tipos** por sesión: `memory_result`+`memory_event`, `raven_result`+`raven_item`,
`signal_surge_result`+`signal_surge_event` (ver `store` en `:802-808`), así como los de un solo tipo (`switch_answer`,
`ops_choice`). Al re-tomar, todos los eventos previos de esos tipos se eliminan antes de concatenar → **reemplazo, no
acumulación.** Confirmado.

**Survey** (`src/App.tsx:947-953`): la rama `isLast` filtra `survey_result` previo antes de añadir el nuevo. Como el survey
emite un único evento, el filtro por `type !== "survey_result"` es suficiente. Confirmado.

**Sin regresión / edge cases revisados:**
- `route_risk`: `onDone(rEvents.current)` solo se llama si `rComplete` (`:845`). Si el jugador abandona sin completar las
  6 rondas, `onDone` no se invoca → no hay reemplazo ni borrado de un intento previo válido. Correcto (no se pierde un
  intento anterior completo si el actual no se termina).
- El reemplazo es por **tipo de evento**, no por prueba. Como cada prueba tiene tipos de evento disjuntos respecto de las
  demás, re-tomar la prueba A no toca los eventos de la prueba B. Verificado contra el catálogo de `store`.

### 2.3 C-3 — Fuga de patrón en Raven · ✅ RESUELTO

`src/components/RavenMatrices.tsx:55-58`:
```ts
const countOffset = Math.floor(Math.random() * 3);
const cell = (r, c) => ({ ..., count: ((c + countOffset) % 3) + 1, ... });
```
- **Atajo eliminado:** la respuesta correcta (celda `grid[8]`, columna `c=2`) ahora tiene `count = ((2+offset)%3)+1`,
  que toma valores **1, 2 o 3** según `offset` aleatorio por ítem. Ya no es "siempre 3".
- **Regla sigue inferible:** la progresión "+1 cíclico por columna" se observa en las dos filas completas visibles
  (`grid.slice(0,8)` muestra filas 0 y 1 enteras), así que el candidato puede deducir el conteo de la celda oculta.
- **Distractores válidos y únicos:** el bloque `tries` perturba un atributo a la vez y se filtra con
  `!cellEq(t, correct) && !distractors.some(...)` (`:76-79`); el relleno aleatorio (`:85-89`) también deduplica vía
  `cellEq`. El distractor de conteo `((correct.count)%3)+1` siempre difiere del correcto y queda dentro de {1,2,3}.
  No se introdujo colisión ni opción duplicada. Confirmado.

### 2.4 C-4 — Doble fuente del índice de ensayo en Switchboard · ✅ RESUELTO

`src/components/Switchboard.tsx`:
- `trialRef` se inicializa y se sella en `beginTrial(index)` (`:108`, `:118-124`), que también hace `setTrial(index)` y
  `setCardKey`. Render y scoring quedan acoplados al mismo `index`.
- `answer` lee `const idx = trialRef.current` (`:136`) y deriva figura, regla y corrección de ese índice
  (`TRIALS[idx]`, `correctSide(idx, ...)`, `idx >= SWITCH_AT`). El evento se registra con `trial: idx` (`:141`).
- Ya **no** se usa `eventsRef.current.length` como índice de scoring. La fuente de verdad es única. Confirmado.
- Nota: el render del glifo usa `TRIALS[Math.min(trial, ...)]` (estado `trial`), que `beginTrial` mantiene en sincronía
  con `trialRef` (ambos se fijan al mismo `index` en la misma llamada). El `lockRef` evita doble registro intra-trial.
  Sin desincronización observable.

### 2.5 E-1 — rAF de la barra de progreso de Signal Surge · ✅ RESUELTO

`src/components/SignalSurge.tsx`:
- `progressRaf = useRef<number>(0)` (`:208`).
- El loop se auto-reagenda **solo si** `remaining > 0 && trialActive.current` (`:293`), guardando el id en
  `progressRaf.current` (`:295`). Al expirar el trial (`trialActive.current=false` en auto-expire `:299-302` o en hit
  `:353`), el siguiente frame no se reagenda.
- El cleanup de desmontaje cancela el rAF: `if (progressRaf.current) cancelAnimationFrame(progressRaf.current)` (`:222`),
  junto con el clear de timeouts. **No quedan rAF huérfanos** ni `setProgress` sobre componente desmontado. Confirmado.

### 2.6 D-1 / D-2 — Persistencia · ✅ RESUELTO

`src/lib/storage.ts`:
- **D-1:** `saveDatabase` (`:149-159`) envuelve `localStorage.setItem` en try/catch, hace `console.error` con mensaje de
  cuota/almacenamiento deshabilitado y **devuelve `boolean`**. Ya no puede tumbar la app por `QuotaExceededError` ni por
  modo privado de Safari. Confirmado.
- **D-2:** `SCHEMA_VERSION = 3` (`:8`). `saveDatabase` sella `{ ...db, schemaVersion: SCHEMA_VERSION }` en cada escritura
  (`:153`). `loadDatabase` normaliza al cargar: `if (parsed.schemaVersion !== SCHEMA_VERSION) parsed.schemaVersion = SCHEMA_VERSION`
  (`:134`). El tipo `Database` incluye `schemaVersion?: number` (`:13`). Confirmado.

  **Observación menor (no regresión, mejora futura):** la normalización D-2 hoy solo re-sella el número de versión; no hay
  una función de migración por-shape (si en el futuro cambia la forma de `Candidate`, se re-sella la versión sin transformar
  los datos viejos). Es suficiente para el estado actual (no hubo cambio de shape entre v2→v3), pero cuando se introduzca un
  cambio de esquema real conviene añadir un `migrate(parsed, fromVersion)` antes de re-sellar. **No accionable ahora.**

---

## 3. Hallazgos NUEVOS

Ninguno de severidad crítica/alta introducido por los fixes. Observaciones de bajo impacto detectadas durante la
re-auditoría:

| # | Sev | Evidencia | Hallazgo y fix sugerido |
|---|-----|-----------|--------------------------|
| N-1 | ✅ RESUELTO | `src/lib/storage.ts:loadDatabase` | `loadDatabase` ahora captura el resultado de `saveDatabase` tras migrar/reinyectar semilla y emite `console.warn` si la persistencia falla (el estado en memoria sigue siendo coherente). Ya no se ignora el `boolean`. |
| N-2 | ✅ RESUELTO | `src/lib/storage.ts:migrate` | Se añadió la función `migrate(db)` por-forma: normaliza `positions`/`candidates`/`events`, expone el punto de extensión versionado (`if (from < N) { … }`) y sella `SCHEMA_VERSION`. `loadDatabase` la invoca en cada carga. |
| N-3 | Info | `src/App.tsx:736` | `calculateBehavioral(work.events ?? [])` consume el historial ya deduplicado por C-1; el fix de C-1 es justo lo que mantiene este cálculo estable al re-tomar. Sin acción — confirmación de que el contrato se respeta. |

---

## 4. Estado de la brecha de testing (sin cambios)

**Sigue en 0 pruebas automatizadas.** Es la recomendación pendiente de mayor valor. Tras los fixes, los tests de
regresión más rentables son exactamente:
1. **C-1:** jugar Switchboard (u Ops) 2× y verificar que `switch_answer`/`ops_choice` no se duplican; survey 2× sin
   duplicar `survey_result`. (Vitest + RTL sobre `Assessments`/`Survey`.)
2. **C-3:** propiedad sobre `genItem` con 10k seeds — la opción correcta no es siempre la de 3 figuras; 6 opciones
   únicas; `answer` válido.
3. **C-4:** Switchboard — input rápido bajo `lockRef` no desincroniza figura mostrada vs. puntuada.
4. **E-1:** montar/desmontar SignalSurge a mitad de trial sin warnings de setState; spy en `cancelAnimationFrame`.
5. **D-1:** mock de `setItem` que lanza `QuotaExceededError` → `saveDatabase` devuelve `false` y no propaga.

**Setup recomendado (sin cambios):** Vitest + @testing-library/react + jsdom; Playwright para el flujo E2E del candidato.

---

## 5. Qué debe hacer el dueño (Jesús)

Pendientes del informe anterior que NO son fixes de código y siguen vigentes:
1. **Aprobar framework de test + CI** (`tsc`, `build`, `test` por PR). Hoy no hay red de seguridad automatizada.
2. **Decidir almacenamiento del CV/foto** (Supabase Storage vs. `dataUrl` en localStorage). D-1/D-2 ya cubren el fallo de
   cuota, pero la decisión de fondo sigue abierta.
3. **Verificar RLS en Supabase** y postura de PII (la anon key viaja al cliente por diseño).
4. **Confirmar/documentar que la auth local SHA-256 es solo demo** (S-1) y que producción usa Supabase.
5. **Validación psicométrica** de las fórmulas de scoring (C-3 ya cierra el atajo de Raven; falta criterio de dominio).

---

## 6. Conclusión

Los fixes aplicados a C-1, C-2, C-3, C-4, E-1, D-1 y D-2 están **correctamente implementados y verificados en el código
actual**, sin regresiones detectadas. `tsc --noEmit` pasa limpio. **No quedan hallazgos críticos ni altos accionables en
el código.** El backlog restante es: (a) red de seguridad de pruebas automatizadas, (b) decisiones del dueño
(almacenamiento CV, RLS, framework de test), y (c) mejoras no urgentes de accesibilidad/rendimiento/type-safety ya
catalogadas en el informe original. Recomendación inmediata: instalar Vitest + RTL y blindar C-1/C-3/C-4 con tests de
regresión antes del próximo cambio funcional.
