# QA Audit — Psychometric Quest (Lote P0 · psychometrics-fase0)

**Auditor:** sdet-qa-reviewer · **Fecha:** 2026-06-18 · **Rama:** `fix/psychometrics-fase0`
**Commit HEAD:** `628a396` (docs: auditoría psicométrica actualizada)
**Alcance:** gates de CI del lote de mejoras psicométricas P0 (scoring, tipos, fiabilidad, UI admin).
**Método:** ejecución real de los cuatro gates; salida capturada verbatim.

---

## 1. Resultado de los cuatro gates

| # | Gate | Comando | Resultado | Evidencia |
|---|------|---------|-----------|-----------|
| 1 | Typecheck | `npm run typecheck` | **PASÓ** | `tsc --noEmit` → exit 0, sin líneas de error |
| 2 | Build | `npm run build` | **PASÓ** | `✓ 1114 modules transformed. built in 2.09s` |
| 3 | Unit tests | `npm run test:unit` | **PASÓ** | `Test Files 3 passed (3) · Tests 34 passed (34)` |
| 4 | E2E Playwright | `npm run test:e2e` | **PASÓ** | `6 passed (6.2s)` |

### Gate 1 — Typecheck (`tsc --noEmit`)

```
> psychometric-quest-platform@0.2.0 typecheck
> tsc --noEmit
(sin salida de error — exit 0)
```

### Gate 2 — Build (`tsc && vite build`)

```
> psychometric-quest-platform@0.2.0 build
> tsc && vite build

vite v7.3.5 building client environment for production...
transforming...
✓ 1114 modules transformed.
dist/index.html                              1.24 kB │ gzip:   0.59 kB
dist/assets/pdf.worker.min-yatZIOMy.mjs  1,375.84 kB
dist/assets/index-BP8oizsQ.css             117.41 kB │ gzip:  22.73 kB
dist/assets/d3-D7pkwnt6.js                  92.04 kB │ gzip:  29.76 kB
dist/assets/pdfjs-D_7eWOn-.js              334.91 kB │ gzip:  98.78 kB
dist/assets/recharts-xefQSNGZ.js           367.91 kB │ gzip: 104.07 kB
dist/assets/index-BodfsyzI.js              375.37 kB │ gzip: 117.60 kB
✓ built in 2.09s
```

### Gate 3 — Unit tests (Vitest · 3 archivos nuevos del lote P0)

```
> psychometric-quest-platform@0.2.0 test:unit
> vitest run

 RUN  v4.1.9

 Test Files  3 passed (3)
      Tests  34 passed (34)
   Start at  23:56:33
   Duration  868ms (transform 164ms, setup 0ms, import 215ms, tests 13ms, environment 1.99s)
```

Archivos cubiertos:
- `src/data/ravenBank.test.ts`
- `src/lib/assessment.test.ts`
- `src/utils/reliability.test.ts`

### Gate 4 — E2E Playwright (6 specs · modo demo · puerto 5317)

```
> psychometric-quest-platform@0.2.0 test:e2e
> playwright test

Running 6 tests using 4 workers

  ✓  [chromium] › e2e/admin.spec.ts:4:3   › Admin › el admin demo entra al dashboard con exportaciones        (3.1s)
  ✓  [chromium] › e2e/admin.spec.ts:13:3  › Admin › el dashboard muestra el disclaimer de gobernanza          (2.9s)
  ✓  [chromium] › e2e/candidate.spec.ts:5:3  › Flujo de candidato › signup por email llega a pantalla de intro (2.5s)
  ✓  [chromium] › e2e/candidate.spec.ts:10:3 › Flujo de candidato › onboarding completo llega al menú de pruebas (4.0s)
  ✓  [chromium] › e2e/smoke.spec.ts:4:3   › Smoke › la pantalla de login carga con sus accesos                (1.1s)
  ✓  [chromium] › e2e/smoke.spec.ts:11:3  › Smoke › modo demo local está activo (sin Supabase)                (1.0s)

  6 passed (6.2s)
```

---

## 2. Bugs / fallos detectados

**Ninguno.** Los cuatro gates completaron en verde en la primera pasada. No hay fallos que clasificar ni reintentos necesarios.

---

## 3. Briefs de arreglo delegados

**No aplica.** Sin fallos, no se emiten briefs.

---

## 4. Estado tras reintentos

No se requirió ningún reintento. Todo verde en ronda 1.

---

## 5. Brechas de testing

Las siguientes áreas no tienen cobertura automatizada y representan el próximo valor máximo de inversión en tests:

| Prioridad | Brecha | Test recomendado | Agente |
|-----------|--------|------------------|--------|
| Alta | Lógica de scoring de `assessment.ts` (normalización IRT, bancos de ítems) | Vitest unit — cubrir al menos p50/p95 del espacio de inputs | `test-author` |
| Alta | `reliability.ts` — alpha de Cronbach y split-half con N pequeño (N=1, N=2) | Vitest unit — edge cases de división por cero y arrays vacíos | `test-author` |
| Alta | Flujo candidato completo: terminar UNA prueba y verificar que el resultado aparece en el admin | Playwright E2E — extender `candidate.spec.ts` | `test-author` |
| Media | `ravenBank` — propiedad: ningún ítem tiene la respuesta correcta siempre en la misma posición | Vitest property-based (fast-check) sobre `genItem` | `test-author` |
| Media | Badge "no interpretable" visible en admin cuando fiabilidad < umbral | Playwright E2E — extender `admin.spec.ts` | `test-author` |
| Baja | Re-tomar prueba no duplica eventos (regresión de C-1) | Vitest + RTL sobre `Assessments` | `test-author` |
| Baja | `saveDatabase` devuelve `false` y no propaga cuando `setItem` lanza `QuotaExceededError` | Vitest unit con mock de `localStorage` | `test-author` |

---

## 6. Veredicto de despliegue

**La suite respalda avanzar. El lote P0 está LISTO.**

Los cuatro gates de CI del lote `fix/psychometrics-fase0` pasaron sin fallos ni reintentos:

- `tsc --noEmit` — exit 0 (sin errores de tipo en los tipos nuevos `partialDomains`, `meanRt?: number`).
- `vite build` — 1114 módulos, sin warnings que bloqueen.
- Vitest — 34 tests / 3 archivos (ravenBank, assessment, reliability), todos verdes.
- Playwright — 6/6 specs E2E en modo demo (sin Supabase, sin `.env`), todos verdes.

**Pendientes no bloqueantes** heredados del audit anterior que siguen vigentes:
1. Aprobación del framework de CI por PR (hoy se corre manualmente).
2. Decisión sobre almacenamiento del CV/foto (Supabase Storage vs. localStorage).
3. Verificación de RLS en Supabase y postura de PII.
4. Confirmar/documentar que la auth local SHA-256 es solo demo.
5. Validación psicométrica formal de las fórmulas de scoring (criterio de dominio, no bug de código).

---

*Audit generado automáticamente por el agente sdet-qa-reviewer en la sesión de 2026-06-18.*
