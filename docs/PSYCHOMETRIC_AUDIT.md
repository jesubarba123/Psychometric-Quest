# Auditoría de validez psicométrica — Psychometric Quest

**Fecha:** 2026-06-18 (reescritura del estado de hoy; sustituye a la versión 2026-06-16)
**Rama auditada:** `fix/psychometrics-fase0` (basada en `main`)
**Auditor:** psicométrico senior
**Alcance:** validez estadística de inicio a fin (fiabilidad, validez de constructo, criterio, normas, equidad, scoring, calidad de datos) sobre el código real.
**Estándares de referencia:** AERA/APA/NCME *Standards* (2014); *Uniform Guidelines on Employee Selection Procedures* (EEOC).
**Verificación técnica:** `npx tsc --noEmit` → 0 errores. 5 candidatos semilla (`storage.ts`), 0 con `outcome` poblado.

---

## 0. Qué cambió desde la auditoría previa (2026-06-16)

| Hallazgo previo | Estado hoy | Evidencia |
|---|---|---|
| Gobernanza de uso ausente | **RESUELTO (parcial)** | `DecisionDisclaimer` en `App.tsx:1332`; banner "no apta para decisión" `App.tsx:1446`; disclaimer en reporte candidato `App.tsx:1118`. |
| Arquetipo presentado como tipo psicológico | **RESUELTO** | `App.tsx:1096` etiqueta `behavioral.profile` como "etiqueta descriptiva, no diagnóstico ni criterio de selección". |
| Arquetipo por umbrales con fallback masivo | **RESUELTO** | `chooseProfile` clasifica por forma del vector (proyección unitaria), `assessment.ts:104`. |
| Sin captura de criterio (outcomes) | **PARCIAL** | UI de captura `OutcomePanel` (`App.tsx:1885`) + export `buildValidationCsv` (`App.tsx:1133`) existen, pero **solo en localStorage**: no hay tabla en `supabase/schema.sql`. |
| Gate de validez de criterio | **RESUELTO** | `App.tsx:1456` exige `withPerf >= 30` antes de habilitar el análisis. |
| Honestidad descriptiva vs criterio | **RESUELTO** | `insights.ts` cabecera; copy de `GraphHelp` en fit/correlación/Big Five (`App.tsx:1301,1652,1662`). |
| Ítems Raven aleatorios no equiparados | **ABIERTO** | `RavenMatrices.tsx:42` (`genItem` con `Math.random`) — cada candidato ve ítems distintos. |
| Fiabilidad (α/ω, split-half, SEM) | **ABIERTO** | No existe ningún cálculo de fiabilidad en el código. |
| Pesos mágicos / sobre-precisión / placeholders | **ABIERTO** | `assessment.ts:34-37`, `SignalSurge.tsx:78`, `MemorySurge.tsx:78`, `psychometricCalculations.ts:84`, placeholder `recovery 0.65` (`assessment.ts:143`), `meanRt 999` (`SignalSurge.tsx:56`). |
| Normas poblacionales / percentiles | **ABIERTO** (mitigado) | `percentileInPool` contra pool; banda degradada `percentileBand` (`insights.ts:109`). |
| Equidad / demografía / 4-5 / DIF | **ABIERTO** | Sin demografía en `types.ts` ni `schema.sql`. |
| Validez de constructo (EFA/CFA) | **ABIERTO** (necesita N) | Compuestos por proyección fija `compositeAxes.ts:51`. |
| Traducción IPIP español | **ABIERTO** (bajo) | `bigfive.ts:1-9` advierte verificar contra fuente oficial. |

---

## 1. Resumen ejecutivo

El proyecto avanzó de forma **material y correcta en la capa de gobernanza**: hoy comunica con honestidad que es una herramienta de apoyo sin validez de criterio demostrada, el arquetipo es una etiqueta descriptiva, hay captura de outcomes y un gate de N≥30 antes de hablar de validez predictiva. Eso cierra el riesgo más urgente (uso indebido como filtro automático), **a nivel de comunicación**.

Lo que **sigue abierto y es bloqueante** para cualquier afirmación cuantitativa: (1) **cero fiabilidad reportada** — ningún puntaje individual es interpretable con precisión de punto; (2) **scoring con pesos y umbrales elegidos a mano** sin documentar ni calibrar, y con placeholders que entran al cálculo; (3) **ítems Raven aleatorios por sesión** — los candidatos no resuelven el mismo test, lo que rompe toda comparabilidad; (4) **N efectivo ≈ 5 semilla, 0 outcomes** → normas, percentiles, correlaciones y "fit" no son interpretables; (5) **outcomes solo en localStorage** (sin tabla Supabase) → el criterio no se acumula de forma fiable.

**Brecha principal:** la herramienta es defendible como *cribado asistido / generador de hipótesis para entrevista*, **no** como test de selección validado. Hasta cerrar fiabilidad + scoring documentado + ítems equiparados (todo CODE-NOW) y luego datos de criterio (NEEDS-DATA), **no debe usarse para rankear, descartar o contratar de forma automática**. Esta restricción ya está escrita en la UI; el trabajo pendiente es hacer que los *números* sean tan honestos como el *texto* (bandas en vez de puntos, "no interpretable" cuando α<0.6, mismos ítems para todos).

---

## 2. Hallazgos por capa

### 2.1 Fiabilidad — **CRÍTICO (abierto)**

No existe ninguna estimación de fiabilidad (α/ω, test-retest, split-half, SEM) en todo el código. Esto invalida la interpretación de cualquier puntaje individual con precisión de punto, y contradice de facto el reporte numérico (se muestra "64" como dato firme).

- **Big Five sin consistencia interna.** `calculateBigFive` (`assessment.ts:53`) suma 10 ítems por dominio → 0–100, pero nunca calcula α. El "índice de inconsistencia" (`assessment.ts:75`) es un *check* de careless responding, **no** fiabilidad.
- **Dato disponible para calcularla YA.** Las respuestas a nivel ítem se persisten: `survey_answer`/`surveyAnswers` (Big Five), y eventos crudos `raven_item`, `signal_surge_event`, `memory_event`, `switch_answer` (`App.tsx:804-806`). → **α de Cronbach del Big Five y split-half (Spearman-Brown) de los juegos son computables sin datos nuevos** (es CODE-NOW), aunque con N=5 las estimaciones serán inestables y deben marcarse como provisionales.
- **Demasiados pocos ensayos para fiabilidad alta.** Raven 6 ítems; Switchboard 12 ensayos (6 post-cambio, `Switchboard.tsx:27`); Ops Queue 4; Route Risk 6; Signal Surge 30 (3×10, `psychometricCalculations.ts:19-21`); Memory Surge 18 (16 puntuables, `MemorySurge.tsx:31`). Con 4–6 ítems la split-half típica es <0.5. Una CPT/n-back fiable necesita ~50–100 ensayos.
- **d′ con muy pocos ensayos.** `dPrime` vía `zScore` (Acklam) sobre ~12 targets / 18 distractores (`psychometricCalculations.ts:161`): SEM enorme; los extremos (0/1) se *clampan* a 0.001/0.999, lo que es un parche numérico, no una solución estadística.

> **Severidad: CRÍTICO.** Mientras no se reporte fiabilidad y no se sustituya el punto por banda/SEM, los números mostrados sugieren más precisión de la que tienen (Standards 2.x).

### 2.2 Validez de constructo — **ALTO (abierto, parcialmente mitigado)**

- **Compuestos por proyección fija, no por evidencia factorial.** `computeComposite` (`compositeAxes.ts:41`) promedia métricas heterogéneas (control ejecutivo + atención + memoria + razonamiento + velocidad → "Cognición") con pesos iguales implícitos. No hay EFA/CFA; con N=5 no se puede hacer (NEEDS-DATA).
- **Doble conteo de varianza.** "Cognición" incluye `sustainedAttention` y `processingSpeed`, ambos derivados del mismo `meanRt` de Signal Surge (`psychometricCalculations.ts:163,197`). La misma varianza pesa dos veces. **Corregible hoy** (quitar uno o documentar el solapamiento) → CODE-NOW.
- **Arquetipo: artefacto geométrico, ya etiquetado como descriptivo.** `chooseProfile` (`assessment.ts:92,104`) proyecta la forma del candidato sobre firmas fijas. Es determinista, no un tipo validado, **pero la UI ya lo declara descriptivo** (`App.tsx:1096`). Riesgo residual: bajo.
- **Big Five: contenido y keying correctos; estructura factorial sin verificar.** Keying canónico IPIP-50 verificado ítem a ítem (`bigfive.ts:80`; inversos correctos: ipip-2,6,8,9,10,12,16,18,19,20,22,26,28,30,32,36,38,46). La estructura de 5 factores en español no se ha confirmado (CFA con N≥200 → NEEDS-DATA).

> **Severidad: ALTO.** Compuestos interpretables como *resúmenes operativos*, no como constructos validados. El doble conteo atención/velocidad es corregible hoy.

### 2.3 Validez de criterio — **CRÍTICO (bloqueante para selección; parcialmente preparado)**

- **Sin datos de criterio reales.** 0 candidatos con `outcome.performanceRating`. El gate `withPerf >= 30` (`App.tsx:1456`) impide afirmar validez: correcto y honesto.
- **Persistencia frágil.** `OutcomePanel` (`App.tsx:1885`) y `buildValidationCsv` (`App.tsx:1133`) existen, pero el outcome se guarda con `upsertCandidate` en **localStorage**; `supabase/schema.sql` **no tiene tabla de outcomes ni columnas de desempeño** (tablas existentes: organizations, profiles, positions, candidates, assessments, game_events, personality_responses, personality_results, report_downloads, audit_events). Un estudio de criterio necesita que el predictor quede **congelado** al momento de evaluar y que el outcome persista server-side. Hoy ese dato vive en el navegador del admin. → la persistencia server-side es **NEEDS-DATA/OWNER** (decisión de backend + RLS); el congelado del predictor en el CSV ya está bien resuelto.
- **`positionFit` / `DEFAULT_TARGET` son supuestos, no criterio.** Perfil objetivo `{cognition:80, strategy:80, riskCalibrated:70}` fijado a ojo (`insights.ts:137`). La UI ya advierte "debe validarse con datos de desempeño" (`App.tsx:1303`).

> **Severidad: CRÍTICO.** Cero validez predictiva demostrada. La comunicación ya lo bloquea; falta robustecer la persistencia del criterio antes de poder acumularlo.

### 2.4 Normas y estandarización — **ALTO (abierto, mitigado en UI)**

- **Sin normas poblacionales.** Percentiles contra el propio pool (`percentileInPool`, `insights.ts:101`), hoy 5 semilla. `percentileBand` degrada a ±25 con N<10 (`insights.ts:109`) y la UI lo rotula "relativo al pool, no normado" (`App.tsx:1264`). Diseño honesto, pero confirma que hoy todo percentil es ruido.
- **Puntajes 0–100 sin anclaje normativo.** `calculateBigFive` mapea suma 10–50 → 0–100 lineal (`assessment.ts:71`). Un "64 en Apertura" es posición en el rango teórico de la escala, **no** percentil 64. Riesgo de mala lectura por el reclutador.
- **Clamps que distorsionan la distribución.** `calculateBehavioral` recorta a [18,96], [20,97], etc. (`assessment.ts:34-37`): comprime extremos y crea pseudo-puntajes. Documentar o eliminar → CODE-NOW.

> **Severidad: ALTO.** Sin muestra normativa (~200 mínimo) los percentiles no son publicables; la UI lo dice, pero el rango 0–100 del Big Five aún invita a leerlo como percentil.

### 2.5 Equidad / adverse impact — **ALTO (riesgo legal latente; abierto)**

- **No se captura demografía** (`types.ts`, `schema.sql`): imposible evaluar regla 4/5 ni DIF. Es a la vez protección (no se discrimina con lo que no se tiene) y límite (no se puede *demostrar* ausencia de sesgo si se usa para decidir).
- **Sesgos conocidos no mitigados.** Tareas con fuerte componente de velocidad (Signal Surge, Switchboard RT en `assessment.ts:36`) tienen sesgo por edad/familiaridad con dispositivos; Raven varía por exposición educativa.
- **CV-match como vector de sesgo.** `cvAptitudeGap` (`insights.ts:120`) usa `cvMatch.score`; el matching de CV (nombres, brechas) es un adverse impact clásico que debe auditarse aparte.

> **Severidad: ALTO.** Antes de uso decisional hay que decidir estrategia de equidad: recoger demografía bajo consentimiento solo para *monitorear* (aislada del scoring), o prohibir uso decisional. **NEEDS-DATA/OWNER + revisión legal.**

### 2.6 Solidez del scoring — **ALTO (abierto)**

- **Pesos mágicos sin justificación.** `adaptability = secondAccuracy*72 + switchAccuracy*18 + recovery*10` (`assessment.ts:34`); `executiveControl = switchAccuracy*55 + (1200-avgRt)/18 + opsOptimal*15` (`assessment.ts:36`); `attentionScore = (hitRate*50 + (1-min(faRate*5,1))*25 + rtScore*25)*(1-decayIndex*0.2)` (`SignalSurge.tsx:79`); `workingMemoryScore = hitRate*58 + (1-faRate)*30 + rtScore*12` (`MemorySurge.tsx:78`). Coeficientes a mano, sin derivación.
- **Constantes ad-hoc.** Banda de riesgo 40–75 `slope:2.4` (`compositeAxes.ts:34`); `riskAdjustedScore/80` y `/700`, `/900` en normalizaciones de RT. Nadie los validó.
- **Sobre-precisión.** Entero 0–100 (`Math.round`) sobre medidas con SEM de decenas de puntos → falsa exactitud. Debe mostrarse banda/categoría.
- **Placeholders que contaminan el cálculo.** `recoveryAfterLoss` devuelve **0.65 inventado** cuando no hubo pérdida (`assessment.ts:143`) y entra directo a `calculatedRisk`. `meanRt` default **999** (`SignalSurge.tsx:56`) puede ensuciar agregados. Ítems Big Five faltantes → **3 neutral** (`assessment.ts:64`) enmascara abandono parcial.
- **Lógica de scoring duplicada.** Atención/memoria se calculan en el componente (`SignalSurge.tsx`, `MemorySurge.tsx`) y se vuelven a leer en `assessment.ts`; un cambio de fórmula en un solo sitio descuadra el otro.

> **Severidad: ALTO.** El scoring es plausible pero no defendible. Documentar cada constante, estandarizar a z-scores, eliminar placeholders y reportar con incertidumbre → todo CODE-NOW.

### 2.7 Integridad / calidad de datos — **MEDIO (la capa más fuerte; un punto ALTO abierto)**

- **Careless responding correcto.** `dataQuality` (`insights.ts:57`) marca RT<200ms, straight-lining (SD<0.4), rachas largas (≥12) e inconsistencia Big Five>60. Bien diseñado.
- **Completitud por sesión.** `isAssessmentDone` exige ≥6 eventos para Route Risk (`assessmentCatalog.ts:106`). Bien.
- **Ítems Raven aleatorios por sesión — ALTO.** `genItem` con `Math.random` (`RavenMatrices.tsx:42,55`): cada candidato ve ítems distintos no equiparados → **no es el mismo test**, rompe comparabilidad, normas y TRI. (Contraste: Switchboard sí usa un banco fijo de 12 trials, `Switchboard.tsx:27`.) Convertir a banco fijo es CODE-NOW.
- **Fechas semilla fijas** para no contaminar métricas temporales: buena práctica.

> **Severidad: MEDIO** global, con un punto **ALTO** (ítems Raven no equiparados).

---

## 3. Clasificación de mejoras (CODE-NOW vs NEEDS-DATA/OWNER)

### 3.A — CODE-NOW (resolubles hoy, solo código, sin datos nuevos) — TABLA PRIORIZADA

| # | Mejora | Agente | Archivos exactos | Qué cambiar | Criterio de aceptación (verificable) | Prioridad |
|---|--------|--------|------------------|-------------|--------------------------------------|-----------|
| C1 | **Banco fijo de ítems Raven** | `frontend-dev` | `src/components/RavenMatrices.tsx`, nuevo `src/data/ravenBank.ts`, `src/data/assessmentCatalog.ts` | Reemplazar `genItem`/`Math.random` por un banco fijo de ≥8 ítems con respuesta y distractores predefinidos, idénticos para todos. Practice puede seguir generado. Actualizar `items` en catálogo. | Dos sesiones distintas reciben **los mismos ítems en el mismo orden**; test unitario que afirma determinismo del banco (sin `Math.random` en la ruta real); `tsc` limpio. | **P0** |
| C2 | **Reportar fiabilidad (α Big Five + split-half juegos) y marcar "no interpretable"** | `frontend-dev` | nuevo `src/utils/reliability.ts`, consumir en `src/App.tsx` (ficha admin) | α de Cronbach por dominio sobre `surveyAnswers` (re-keyando inversos); split-half Spearman-Brown para Raven/Signal/Memory/Switchboard desde eventos `*_item`/`*_event`/`switch_answer`. Mostrar α/ρ y marcar `α<0.60 → "no interpretable"`. Indicar N. | `reliability.ts` exporta `cronbachAlpha`/`splitHalf` con tests unitarios (vector conocido → α esperado ±0.01); la ficha admin muestra α por dominio y badge "no interpretable" cuando <0.60. | **P0** |
| C3 | **Eliminar placeholders que entran al cálculo** | `frontend-dev` | `src/lib/assessment.ts`, `src/components/SignalSurge.tsx` | `recoveryAfterLoss` → devolver `undefined`/excluir del cálculo cuando no hubo pérdida (no 0.65). `meanRt` 999 → `undefined` + propagar como "sin dato". Ítem Big Five faltante: contar respuestas faltantes y reflejarlo en calidad de datos en vez de imputar 3 en silencio (o documentar la imputación explícita). | Test: candidato sin pérdidas no recibe `calculatedRisk` inflado por 0.65; candidato sin hits no contamina agregados con 999; `dataQuality` marca ítems Big Five faltantes. | **P0** |
| C4 | **Mostrar bandas/SEM en vez de punto + quitar sobre-precisión** | `frontend-dev` (impl.) + `ui-designer` (diseño de banda) | `src/components/analytics/*` y `src/App.tsx` (`ScoreRow`, anillos de `RavenMatrices.tsx`/`MemorySurge.tsx`/`SignalSurge.tsx`), usar salida de C2 | Sustituir el número entero por banda ±SEM (o categoría alto/medio/bajo con corte documentado). Donde no haya SEM aún, mostrar categoría, no punto exacto. `ui-designer` define cómo se ve la banda antes de codificar. | Ningún score individual se presenta como entero "firme" sin banda/categoría; revisión visual aprobada por `ui-designer`; al menos Big Five y los 3 índices cognitivos muestran banda. | **P1** (depende de C2) |
| C5 | **Documentar/estandarizar el scoring (z-scores + justificar cada constante)** | `frontend-dev` | `src/lib/assessment.ts`, `src/utils/compositeAxes.ts`, `src/utils/psychometricCalculations.ts`, `src/components/SignalSurge.tsx`, `src/components/MemorySurge.tsx`, nuevo `docs/SCORING.md` | Escribir `docs/SCORING.md` que justifique cada peso/umbral/divisor. Donde sea posible, pasar a agregación z-score contra pool documentado. Centralizar la fórmula (evitar duplicación componente↔assessment). Comentar cada constante con su origen. | `docs/SCORING.md` cubre cada constante citada en §2.6; no quedan números mágicos sin nota en los archivos listados; comportamiento numérico equivalente verificado por test de regresión. | **P1** |
| C6 | **Quitar el doble conteo atención/velocidad en "Cognición"** | `frontend-dev` | `src/utils/compositeAxes.ts`, `src/utils/psychometricCalculations.ts` | En `computeComposite`, no incluir a la vez `sustainedAttention` y `processingSpeed` (ambos del mismo `meanRt`); usar uno, o ponderar para no contar la varianza dos veces. Documentar la decisión. | Test: cambiar `meanRt` no mueve `cognition` por dos canales independientes; nota en `docs/SCORING.md`. | **P2** |
| C7 | **Anclar la lectura del Big Five (no es percentil) + clamps documentados** | `frontend-dev` | `src/lib/assessment.ts` (comentario), `src/App.tsx`/reporte Big Five (copy) | Añadir copy: "puntaje = posición en el rango de la escala, no percentil poblacional". Documentar (o suavizar) los clamps [18,96]/[20,97] de `calculateBehavioral`. | La UI del Big Five aclara que 0–100 no es percentil; clamps comentados con justificación o eliminados. | **P2** |
| C8 | **Revisión de la traducción IPIP español** | `frontend-dev` (aplica cambios) tras insumo de Jesús | `src/data/bigfive.ts`, nuevo `docs/IPIP_ES.md` | Cotejar los 50 ítems contra la versión oficial IPIP/back-translation; corregir redacción si difiere; keying ya verificado correcto. | Cada ítem trazado a la fuente; discrepancias documentadas en `docs/IPIP_ES.md`. | **P3** |

> **Validación (no implementan):** `reviewer` revisa C1–C8 (corrección estadística, ausencia de regresión funcional, que no se reintroduzcan afirmaciones de criterio). `sdet-qa-reviewer` añade/valida tests unitarios de C1 (determinismo Raven), C2 (α/split-half con vectores conocidos), C3 (placeholders), y un E2E que confirme que el reporte ya no muestra puntos sin banda tras C4.

### 3.B — NEEDS-DATA/OWNER (requieren datos reales o decisión de Jesús; NO código todavía)

| Mejora | Qué necesita Jesús (datos / decisión / legal) | Umbral mínimo |
|--------|-----------------------------------------------|---------------|
| **N1 — Persistir el criterio server-side** | Decisión de backend: crear tabla de outcomes en Supabase con RLS admin-only y predictor congelado al momento de evaluar (el `buildValidationCsv` ya define las columnas). Es trabajo de backend/seguridad, no de psicometría; por eso queda fuera de CODE-NOW hasta que Jesús apruebe el esquema y las políticas RLS. | — (precondición de N2) |
| **N2 — Estudio de validez de criterio** | Conseguir y registrar **outcomes reales**: definir el criterio (rating de supervisor, KPIs, retención 6/12m), recolectarlo por contratado. | **N≥30** contrataciones con desempeño (idealmente más para subgrupos). El gate `App.tsx:1456` ya lo exige. |
| **N3 — Normas poblacionales** | Reunir muestra normativa representativa y autorizar su uso; sustituir percentil-vs-pool por percentil normado. | **N≥200** respuestas (más para normas por subgrupo). |
| **N4 — Validez de constructo (EFA/CFA)** | Asegurar N para análisis factorial del Big Five (5 factores) y de los compuestos; aprobar posible redefinición de "Cognición/Estrategia/Riesgo". | **N≥200**. |
| **N5 — Estrategia de equidad / adverse impact** | **Revisión legal** (laboral + privacidad GDPR-equivalente) sobre recolectar demografía; consentimiento informado; decidir si se recoge demografía aislada solo para monitorear 4/5 y DIF, o se prohíbe uso decisional. Auditar CV-match como fuente de sesgo. | Datos demográficos bajo consentimiento + N por subgrupo. |
| **N6 — Ampliar nº de ensayos a mínimos psicométricos** | Decisión de producto/UX: alargar las pruebas (Raven ≥12, CPT ≥60, n-back ≥40) impacta duración de sesión y abandono. Requiere validar contenido de los ítems nuevos. | Decisión de Jesús + posible `ux-researcher` sobre tolerancia de duración. |

**Regla de oro:** mientras N2 no esté cerrado con datos reales y revisión estadística independiente, **no comunicar que la herramienta "predice desempeño" ni usarla para descartar/rankear/contratar automáticamente.** Hoy es defendible decir: *"mide constructos reconocidos y genera hipótesis estructuradas para la entrevista"*.

---

## 4. Equipo de agentes (mapeado a agentes reales)

> Solo se asignan agentes de implementación a las mejoras **CODE-NOW**. Las NEEDS-DATA/OWNER no reciben agente de código hasta que Jesús aporte datos/decisión.

| Mejora | Agente implementador | Validación | Decisión de diseño previa |
|--------|---------------------|------------|---------------------------|
| C1 Banco Raven fijo | `frontend-dev` | `reviewer` + `sdet-qa-reviewer` | — |
| C2 Fiabilidad | `frontend-dev` | `reviewer` + `sdet-qa-reviewer` | — |
| C3 Placeholders | `frontend-dev` | `reviewer` + `sdet-qa-reviewer` | — |
| C4 Bandas/SEM | `frontend-dev` | `reviewer` + `sdet-qa-reviewer` | `ui-designer` (cómo se muestra la banda) |
| C5 Scoring documentado | `frontend-dev` | `reviewer` | — |
| C6 Doble conteo | `frontend-dev` | `reviewer` | — |
| C7 Anclaje Big Five | `frontend-dev` | `reviewer` | — |
| C8 Traducción IPIP | `frontend-dev` (tras insumo de Jesús) | `reviewer` | — |

**Dependencias entre agentes:** C2 antes que C4 (C4 consume α/SEM). C5 idealmente antes/junto a C6 (ambos tocan `compositeAxes`/`psychometricCalculations`). C1, C3 son independientes y pueden ir primero. `ui-designer` debe entregar el patrón visual de banda antes de que `frontend-dev` codifique C4.

---

## 5. Qué debe hacer el dueño humano (Jesús)

| Mejora | Decisión / dato / revisión |
|--------|----------------------------|
| C4 (bandas) | Aprobar que los reportes muestren **bandas/categorías en vez de puntos** (cambio de expectativa de cliente). |
| C8 (traducción) | Conseguir/validar la **traducción oficial IPIP al español** o contratar revisión profesional. |
| N1 (persistencia) | Aprobar el **esquema de outcomes en Supabase** y las políticas RLS (trabajo de backend). |
| N2 (criterio) | Definir el **criterio de desempeño** y recolectar **N≥30** outcomes reales de contratados. |
| N3 (normas) | Conseguir **muestra normativa N≥200** representativa y autorizar su uso. |
| N4 (constructo) | Asegurar N≥200; aprobar posible redefinición de compuestos. |
| N5 (equidad) | **Revisión legal** (laboral/privacidad), consentimiento, decidir recolección de demografía aislada o prohibición de uso decisional. |
| N6 (más ensayos) | Decidir el trade-off duración↔fiabilidad; validar contenido de ítems nuevos. |
| Política general | Confirmar y comunicar que la herramienta es **apoyo a entrevista / cribado asistido**, no filtro automático, hasta validar. |

---

## 6. Hoja de ruta

**Fase 0 — Inmediato (CODE-NOW, sin datos nuevos):** C1, C3 (independientes, P0) → C2 (fiabilidad, P0) → C4 (bandas, depende de C2) → C5/C6 (scoring) → C7/C8. Esto hace que **los números sean tan honestos como el texto** y prepara el terreno para todo lo demás.

**Fase 1 — Habilitar el estudio (requiere Jesús):** N1 (persistir criterio en Supabase) y arranque de recolección de outcomes (N2) y muestra normativa (N3). Definir estrategia de equidad N5 (pipeline 4/5 aún sin datos suficientes).

**Fase 2 — Validación (cuando haya N):** con N≥200 → N3 (normas) y N4 (EFA/CFA). Con N≥30 contrataciones con desempeño → **primer estudio de validez de criterio** (correlación predictor↔outcome con corrección por restricción de rango y fiabilidad; utilidad Taylor-Russell/BCG), más análisis 4/5 (N5), revisado por un estadístico independiente.

**Condición para afirmar validez de criterio:** outcomes reales con N suficiente + predictores congelados al momento de evaluar + fiabilidad reportada (C2) + ítems equiparados (C1) + análisis de adverse impact + revisión estadística independiente. **Hasta entonces, la herramienta NO debe usarse como base única ni automática de decisiones de selección.**
