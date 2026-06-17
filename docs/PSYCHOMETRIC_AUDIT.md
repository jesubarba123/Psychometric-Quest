# Auditoría de validez psicométrica — Psychometric Quest

**Fecha:** 2026-06-16
**Auditor:** agente `psychometrics-auditor`
**Alcance:** validez estadística de inicio a fin (fiabilidad, validez de constructo, criterio, normas, equidad, scoring, calidad de datos) sobre el código real.
**Estándares de referencia:** AERA/APA/NCME *Standards* (2014); *Uniform Guidelines on Employee Selection Procedures* (EEOC).

---

## 1. Resumen ejecutivo

El instrumento está **bien construido como demo y razonablemente honesto en su comunicación**, pero **NO tiene aún validez de criterio demostrada y no debe usarse para tomar decisiones de selección (contratar/rechazar/rankear) de forma automatizada**. Lo defendible hoy es: (a) el Big Five IPIP-50 tiene contenido y keying correctos y produce un perfil *descriptivo* de personalidad; (b) los juegos cognitivos miden los constructos que dicen medir *en forma de paradigma* (n-back, CPT, task-switching, BART, Raven); (c) el código separa correctamente la descripción de la predicción (`insights.ts` lo declara explícitamente) y bloquea afirmaciones de criterio cuando faltan datos (`App.tsx:1442` exige ~30+ contrataciones).

La brecha principal es triple: **(1) cero datos de criterio reales** (la tabla de outcomes existe en el frontend pero no en Supabase ni con N>0 real); **(2) los puntajes cognitivos y compuestos se construyen con pesos y umbrales arbitrarios hand-tuned, sin calibración ni evidencia de fiabilidad**; **(3) N efectivo = 4 candidatos semilla**, por lo que ninguna norma, percentil, correlación ni "fit" es interpretable. Hasta cerrar (1)–(3), la plataforma es una herramienta de *cribado asistido / generación de hipótesis para entrevista*, no un test de selección validado.

**Marca clara:** los campos `positionFit`, `cvAptitudeGap`, `compositeProfile`, `behavioral.profile` (arquetipo) y cualquier ranking derivado **NO deben mostrarse como criterio de decisión** hasta tener estudio de validación.

---

## 2. Hallazgos por capa

### 2.1 Fiabilidad — **CRÍTICO**

No existe ninguna estimación de fiabilidad en el sistema (ni alfa/omega, ni test-retest, ni split-half, ni SEM). Esto invalida la interpretación de cualquier puntaje individual con precisión de punto.

- **Big Five sin consistencia interna.** `calculateBigFive` (`src/lib/assessment.ts:53`) suma los 10 ítems por dominio y normaliza a 0–100, pero nunca calcula alfa de Cronbach. Con 10 ítems IPIP por dominio lo esperable es α≈0.70–0.85 en población general; **hay que medirlo en esta traducción al español, no asumirlo**. El "índice de inconsistencia" (`assessment.ts:75`) es un *check* de careless responding (directos vs inversos), **no** una medida de fiabilidad.
- **Juegos sin fiabilidad y con demasiados pocos ensayos.** Raven: 6 ítems (`RavenMatrices.tsx:192`, `assessmentCatalog.ts` "6 ítems"); Switchboard: 12 ensayos, mitad post-cambio (`Switchboard.tsx:27`); Ops Queue: 4 rondas (`OpsQueue.tsx`); Route Risk: 6 rondas; Signal Surge: 30 ensayos (3×10); Memory Surge: 18 pasos 2-back. Con 4–6 ítems la fiabilidad split-half es típicamente <0.5: **el puntaje individual es casi ruido**. Una CPT/n-back necesita ~50–100 ensayos para d′ estable; aquí hay 30/18.
- **d′ con muy pocos ensayos.** `signalMetrics` calcula d′ vía `zScore` (Acklam, `psychometricCalculations.ts:161,275`) sobre ~12 targets y ~18 distractores totales. d′ con esas frecuencias tiene SEM enorme y casos extremos (0 ó 1) que la corrección clamp a 0.001/0.999 no resuelve estadísticamente.

> **Severidad: CRÍTICO.** Sin fiabilidad reportada, los puntajes no son interpretables a nivel individual y no cumplen *Standards* 2.x.

### 2.2 Validez de constructo — **ALTO**

- **Compuestos por proyección fija, no por evidencia factorial.** `compositeAxes.ts:computeComposite` promedia métricas heterogéneas (control ejecutivo + atención + memoria + razonamiento + velocidad → "Cognición") asumiendo que cargan en un factor común. **No hay EFA/CFA que lo respalde**; con N=4 no se puede hacer. El promedio simple impone pesos iguales y trata como intercambiables medidas con escalas y fiabilidades distintas.
- **Arquetipos conductuales = artefacto de construcción.** `chooseProfile` (`assessment.ts:104`) clasifica por la *forma* del vector de 4 ejes contra firmas fijas `[1,0,0,1]`, etc. (`assessment.ts:92`). Es una etiqueta geométrica determinista, **no un tipo psicológico con evidencia**. Riesgo de sobre-interpretación por parte del reclutador.
- **Big Five: constructo de contenido correcto, validez factorial sin verificar.** El keying coincide con el banco canónico IPIP-50 (`bigfive.ts:80`, verificado ítem a ítem: E/A/C/N/O intercalados, inversos correctos como ipip-2, 6, 8, 9...). Pero la *estructura de 5 factores* en esta traducción no se ha confirmado (requiere CFA con N≥200).
- **Solapamiento atención/velocidad.** "Cognición" incluye `sustainedAttention` y `processingSpeed`, ambos derivados del mismo meanRt de Signal Surge (`psychometricCalculations.ts:163,197`) → doble conteo de la misma varianza.

> **Severidad: ALTO.** Los compuestos son interpretables como *resúmenes operativos*, no como constructos validados. El arquetipo debe degradarse a texto descriptivo.

### 2.3 Validez de criterio — **CRÍTICO (bloqueante para selección)**

- **No hay datos de desempeño reales.** El tipo `CandidateOutcome` (decisión + rating 1–5 a 3–6 meses) existe en `src/types.ts:5` y se captura vía `OutcomePanel`/`App.tsx`, pero **no existe tabla en `supabase/schema.sql`** (grep confirmado: sin columnas outcome/performance). Hoy vive solo en localStorage y con 0 candidatos contratados/evaluados.
- **El propio código lo reconoce.** `insights.ts` (cabecera) declara que NO produce afirmaciones de criterio; `App.tsx:1442` exige ~30+ contrataciones con desempeño. Esto es correcto y honesto.
- **`positionFit` y `DEFAULT_TARGET` son supuestos, no criterio.** El perfil objetivo `{cognition:80, strategy:80, riskCalibrated:70}` (`insights.ts:137`) está fijado a ojo. Sin validación, "fit" mide cercanía a un ideal inventado, no a desempeño real.

> **Severidad: CRÍTICO.** Cero validez predictiva demostrada. **Prohibido afirmar que la herramienta predice desempeño o usarla para rankear/descartar.**

### 2.4 Normas y estandarización — **ALTO**

- **No hay normas poblacionales.** Los percentiles se calculan *contra el propio pool* (`percentileInPool`, `insights.ts:101`), que son 4 candidatos semilla (`storage.ts:36`). `percentileBand` (`insights.ts:109`) ya degrada el ancho a ±25 con N<10 — bien diseñado, pero confirma que hoy todo percentil es ruido.
- **Puntajes 0–100 sin anclaje normativo.** `calculateBigFive` mapea suma 10–50 → 0–100 linealmente (`assessment.ts:71`). Un "64 en Apertura" no significa percentil 64; es solo la posición en el rango teórico de la escala. Riesgo de mala interpretación.
- **Clamps que distorsionan la distribución.** `calculateBehavioral` (`assessment.ts:34-37`) recorta a rangos como [18,96], [20,97]: comprime los extremos y crea pseudo-puntajes que no reflejan la métrica subyacente.

> **Severidad: ALTO.** Sin muestra normativa (mín. ~200 para descriptivo, más para subgrupos), los percentiles y bandas no son publicables.

### 2.5 Equidad / adverse impact — **ALTO (riesgo legal latente)**

- **No se captura ningún dato demográfico** (género, edad, etnia) en `schema.sql` ni en `types.ts`. Sin ellos **es imposible evaluar la regla 4/5 ni DIF**, lo que es a la vez una protección (no se puede discriminar con datos que no se tienen) y un riesgo (no se puede *demostrar* ausencia de sesgo si la herramienta se usa para decidir).
- **Sesgos conocidos de las pruebas no mitigados.** Las tareas con fuerte componente de velocidad (Signal Surge, Switchboard RT en `assessment.ts:36`) tienen sesgo documentado por edad y por familiaridad con dispositivos; Raven tiene varianza por exposición educativa. Sin estudio de DIF no se puede afirmar equidad.
- **CV-match como fuente de sesgo.** `cvAptitudeGap` (`insights.ts:120`) compara aptitud vs `cvMatch.score`; el matching de CV es un vector clásico de adverse impact (nombres, brechas laborales) que debe auditarse aparte.

> **Severidad: ALTO.** Antes de cualquier uso decisional hay que decidir la estrategia de equidad (recoger demografía bajo consentimiento para *monitorear*, o prohibir uso decisional).

### 2.6 Solidez del scoring — **ALTO**

- **Pesos mágicos sin justificación.** Ejemplos: `adaptability = secondAccuracy*72 + switchAccuracy*18 + recovery*10` (`assessment.ts:34`); `executiveControl = switchAccuracy*55 + (1200-avgRt)/18 + opsOptimal*15` (`assessment.ts:36`); `attentionScore = (hitRate*50 + ... + rtScore*25)*(1-decayIndex*0.2)` (`SignalSurge.tsx:79`); `workingMemoryScore = hitRate*58 + (1-faRate)*30 + rtScore*12` (`MemorySurge.tsx:78`). Todos los coeficientes son elegidos a mano sin derivación ni calibración.
- **Constantes ad-hoc.** Banda de riesgo 40–75 con `slope:2.4` (`compositeAxes.ts:34`); `riskAdjustedScore/80` y `/700`, `/900` en normalizaciones de RT. Cambian el resultado y nadie los validó.
- **Sobre-precisión.** Se reporta un entero 0–100 (`Math.round`) sobre medidas con SEM de decenas de puntos → falsa exactitud. Debería mostrarse banda/categoría, no punto.
- **Defaults silenciosos.** Ítems Big Five faltantes → 3 (neutral) (`assessment.ts:64`); riesgo de subdiagnosticar abandono parcial. `meanRt` default 999 (`SignalSurge.tsx:56`) puede contaminar agregados.
- **Recovery con placeholder 0.65.** `recoveryAfterLoss` devuelve 0.65 cuando no hay pérdida (`assessment.ts:143`); un valor inventado entra directo a `calculatedRisk`.

> **Severidad: ALTO.** El scoring es plausible pero no defendible; debe documentarse, justificarse o reemplazarse por agregaciones estandarizadas (z-scores) y reportarse con incertidumbre.

### 2.7 Integridad / calidad de datos — **MEDIO**

Esta capa es la **más fuerte** del sistema.

- **Detección de careless responding correcta.** `dataQuality` (`insights.ts:57`) marca RT <200ms, straight-lining (SD<0.4), rachas largas e inconsistencia Big Five >60. Bien diseñado.
- **Completitud por sesión.** `isAssessmentDone` exige ≥6 eventos para Route Risk (`assessmentCatalog.ts:106`), evitando contar un clic suelto. Bien.
- **Ítems Raven generados al azar por sesión.** `RavenMatrices.tsx:163` (`genItem` con `Math.random`) → **cada candidato ve ítems distintos no equiparados**. Esto rompe la comparabilidad entre candidatos (no es el mismo test) y es incompatible con cualquier norma o equiparación TRI. Severidad puntual ALTA dentro de esta capa.
- **Fechas semilla fijas** (`storage.ts:13`) para no contaminar métricas temporales: buena práctica.

> **Severidad: MEDIO** (con un punto ALTO: ítems Raven no equiparados).

---

## 3. Propuesta de mejoras priorizada

| # | Mejora | Severidad que resuelve | Impacto | Esfuerzo |
|---|--------|------------------------|---------|----------|
| 1 | **Cerrar el bucle de criterio**: persistir outcomes en Supabase + protocolo de seguimiento de desempeño | Crítico (criterio) | Muy alto | Medio |
| 2 | **Reportar fiabilidad**: α/ω del Big Five y split-half de juegos; mostrar SEM/bandas en vez de puntos | Crítico (fiabilidad) | Alto | Medio |
| 3 | **Bancos de ítems fijos y equiparados** (Raven y demás) + ampliar nº de ensayos a mínimos psicométricos | Crítico/Alto (fiab., calidad) | Alto | Medio-alto |
| 4 | **Gobernanza de uso**: degradar fit/arquetipo a descriptivo, etiquetar "no apto para decisión", gating en UI | Crítico (criterio/legal) | Alto | Bajo |
| 5 | **Estandarizar el scoring**: reemplazar pesos mágicos por z-scores documentados; quitar sobre-precisión | Alto (scoring/constructo) | Alto | Medio |
| 6 | **Plan de normas**: muestra normativa, percentiles normados (no contra pool) | Alto (normas) | Medio | Alto (depende de datos) |
| 7 | **Estrategia de equidad**: recolección opcional de demografía + pipeline 4/5 y DIF | Alto (equidad/legal) | Medio | Medio |
| 8 | **Validez de constructo**: EFA/CFA del Big Five y de los compuestos cuando N lo permita | Alto (constructo) | Medio | Alto (depende de datos) |
| 9 | **Revisión de la traducción IPIP al español** contra fuente oficial | Medio (constructo/contenido) | Medio | Bajo |

---

## 4. Equipo de agentes (un agente por mejora)

> Convención: cada agente recibe un *brief* preciso, archivos que toca y criterio de aceptación. Las dependencias indican qué debe existir antes.

### Mejora 1 → `criterion-data-engineer`
- **Brief:** Diseñar y persistir el bucle de outcomes. Crear tabla `candidate_outcomes` en `supabase/schema.sql` (decision, performance_rating 1–5, performance_at, evaluator, criterion_source) con RLS admin-only; conectar `OutcomePanel`/`App.tsx` y `src/lib/storage.ts` para escribir/leer; añadir export del criterio en `exportCsv`. Definir el esquema del *predictor matrix* (un registro por candidato con todos los puntajes congelados en el momento de evaluación).
- **Archivos:** `supabase/schema.sql`, `src/lib/storage.ts`, `src/App.tsx`, `src/types.ts`.
- **Criterio de aceptación:** outcomes persisten en Supabase con RLS; existe vista/export que une predictores ↔ outcomes lista para análisis; 0 cálculo de validez se muestra hasta N≥30 (gate ya presente en `App.tsx:1442`, reusarlo).
- **Dependencias:** ninguna (es la base).

### Mejora 2 → `reliability-engineer`
- **Brief:** Implementar y reportar fiabilidad. Calcular α de Cronbach por dominio Big Five sobre `personality_responses`; split-half (Spearman-Brown) para juegos con ítem-nivel; estimar SEM y sustituir el puntaje-punto por banda de confianza en la UI/reportes.
- **Archivos:** nuevo `src/utils/reliability.ts`, `src/lib/assessment.ts` (exponer ítems crudos), componentes de reporte.
- **Criterio de aceptación:** cada dominio/juego reporta α o split-half y SEM; la UI muestra ±banda; α<0.60 se marca como "no interpretable".
- **Dependencias:** requiere respuestas a nivel ítem persistidas (parcial de Mejora 1 / `personality_responses` ya existe en schema).

### Mejora 3 → `test-content-expert`
- **Brief:** Sustituir la generación aleatoria de ítems Raven por un **banco fijo calibrado** (mismos ítems para todos); revisar dificultad y aumentar el nº de ensayos de cada juego hasta mínimos psicométricos (Raven ≥12, Signal Surge/CPT ≥60, n-back ≥40). Documentar paradigma y propiedades por ítem.
- **Archivos:** `src/components/RavenMatrices.tsx` (+ nuevo banco de datos), `SignalSurge.tsx`, `MemorySurge.tsx`, `Switchboard.tsx`, `OpsQueue.tsx`, `FrogRiskRun.tsx`, `assessmentCatalog.ts`.
- **Criterio de aceptación:** todos los candidatos reciben los mismos ítems (equiparable); nº de ensayos cumple mínimos; catálogo actualizado.
- **Dependencias:** coordina con `reliability-engineer` (más ítems → fiabilidad medible) y `scoring-normer` (re-escalar).

### Mejora 4 → `usage-governance-officer`
- **Brief:** Implantar la gobernanza de uso. Degradar `behavioral.profile` (arquetipo) y `positionFit`/`cvAptitudeGap` a *texto descriptivo* con disclaimers; añadir banner "Herramienta de apoyo, no apta para decisiones automáticas de selección"; gating que oculta scores comparativos hasta N≥ umbral.
- **Archivos:** `src/utils/insights.ts`, `src/lib/assessment.ts` (`chooseProfile`), componentes de dashboard admin, copy de UI.
- **Criterio de aceptación:** ningún ranking/decisión se presenta como predictivo; disclaimers visibles; arquetipo etiquetado como descriptivo.
- **Dependencias:** ninguna (puede ir en paralelo; es de bajo esfuerzo y alto valor legal).

### Mejora 5 → `scoring-normer`
- **Brief:** Reemplazar pesos mágicos y clamps por agregación estandarizada: convertir métricas crudas a z-scores (contra norma cuando exista; provisional contra pool documentado), combinar con pesos justificados o iguales y *documentar cada constante*. Eliminar `Math.round` a entero en favor de banda/categoría. Quitar placeholders (recovery 0.65, meanRt 999) o marcarlos como faltantes.
- **Archivos:** `src/lib/assessment.ts`, `src/utils/compositeAxes.ts`, `src/utils/psychometricCalculations.ts`, `SignalSurge.tsx`, `MemorySurge.tsx`.
- **Criterio de aceptación:** existe un documento de scoring que justifica cada peso/umbral; no hay constantes sin nota; salidas con incertidumbre.
- **Dependencias:** `reliability-engineer` (SEM) y `stats-reviewer` (revisa la derivación).

### Mejora 6 → `norming-statistician`
- **Brief:** Diseñar el plan de normas: tamaño muestral, recolección, cálculo de percentiles normados (no contra pool actual), y bandas por subgrupo cuando haya datos. Sustituir `percentileInPool` por percentiles normativos una vez exista la muestra.
- **Archivos:** `src/utils/insights.ts`, documento de normas.
- **Criterio de aceptación:** percentiles provienen de muestra normativa documentada; mientras no exista, la UI muestra "relativo al pool (N=x), no normado".
- **Dependencias:** requiere datos (Jesús) y `test-content-expert` (ítems estables) antes de poder normar.

### Mejora 7 → `fairness-auditor`
- **Brief:** Diseñar la estrategia de equidad: definir qué demografía recoger (opcional, con consentimiento explícito, separada de la decisión), construir el pipeline de la regla 4/5 (impact ratio por subgrupo) y un screening de DIF cuando N lo permita. Auditar el CV-match como fuente de sesgo.
- **Archivos:** `supabase/schema.sql` (tabla demografía separada con RLS estricta), `src/utils/` (módulo fairness), `types.ts`.
- **Criterio de aceptación:** existe reporte 4/5 reproducible; demografía aislada y nunca usada en scoring; documento de riesgo de CV-match.
- **Dependencias:** Mejora 1 (criterio) para análisis de impacto sobre decisiones; decisión legal de Jesús.

### Mejora 8 → `construct-validator`
- **Brief:** Ejecutar EFA/CFA del Big Five (5 factores) y análisis factorial de los compuestos cuando N≥200; reportar cargas, ajuste (CFI/RMSEA) y validez convergente/discriminante; recomendar si "Cognición/Estrategia/Riesgo" se sostienen o deben redefinirse.
- **Archivos:** scripts de análisis (R/Python, fuera de la app), informe; posibles ajustes en `compositeAxes.ts`.
- **Criterio de aceptación:** informe factorial con N suficiente; recomendación basada en evidencia sobre los compuestos.
- **Dependencias:** datos (Jesús) + Mejora 3 (ítems estables) + Mejora 2 (fiabilidad).

### Mejora 9 → `translation-reviewer`
- **Brief:** Cotejar los 50 ítems en español (`bigfive.ts`) contra la versión oficial IPIP y/o una back-translation; verificar equivalencia semántica y keying; documentar discrepancias.
- **Archivos:** `src/data/bigfive.ts`, documento de equivalencia.
- **Criterio de aceptación:** cada ítem verificado contra fuente; keying confirmado (ya correcto en la auditoría); cambios de redacción justificados.
- **Dependencias:** ninguna; bajo esfuerzo.

**Coordinador transversal → `stats-reviewer`:** revisa la corrección estadística de las salidas de Mejoras 2, 5, 6, 7 y 8 (tamaños muestrales, multiplicidad, estabilidad de correlaciones, sobreajuste). Es revisor, no autor.

---

## 5. Qué debe hacer el dueño humano (Jesús)

| Mejora | Decisiones / datos / revisiones que dependen de Jesús |
|--------|--------------------------------------------------------|
| **1 (criterio)** | Definir el **criterio de desempeño** (rating supervisor, KPIs, retención a 6/12m). Conseguir y registrar outcomes de cada contratado. Meta mínima: **N≥30 contrataciones con desempeño** para un primer estudio; idealmente más para subgrupos. |
| **2 (fiabilidad)** | Aprobar que los reportes muestren **bandas en vez de puntos** (cambio de expectativa de cliente). |
| **3 (ítems)** | Validar el contenido de los nuevos ítems Raven/juegos; aprobar que las pruebas se alarguen (impacto en duración de la sesión). |
| **4 (gobernanza)** | **Decisión de política:** confirmar que la herramienta se usa como *apoyo a entrevista / cribado asistido*, no como filtro automático, hasta validar. Aprobar disclaimers. |
| **5 (scoring)** | Aprobar el documento de scoring; decidir pesos de negocio si se justifican empíricamente. |
| **6 (normas)** | Conseguir la **muestra normativa** (mín. ~200 respuestas representativas) y autorizar su uso. |
| **7 (equidad)** | **Revisión legal** (laboral/privacidad GDPR-equivalente) sobre recolectar demografía y sobre uso decisional; consentimiento informado de candidatos; decidir jurisdicciones. |
| **8 (constructo)** | Asegurar N≥200 para análisis factorial; aprobar posible redefinición de los compuestos. |
| **9 (traducción)** | Conseguir/validar la **traducción oficial IPIP al español** o contratar revisión profesional. |

**Regla de oro para Jesús:** mientras (1) no esté cerrado con datos reales y revisados por `stats-reviewer`, **no comunicar a clientes que la herramienta "predice desempeño" ni usarla para descartar candidatos automáticamente.** Hoy es defendible decir: "mide constructos reconocidos y genera hipótesis estructuradas para la entrevista".

---

## 6. Hoja de ruta

**Fase 0 — Inmediato (semanas, sin datos nuevos):**
- Mejora 4 (gobernanza/disclaimers) y Mejora 9 (revisión traducción): bajo esfuerzo, alto valor de cumplimiento.
- Mejora 5 (estandarizar scoring) y Mejora 2 (fiabilidad Big Five con respuestas crudas ya existentes en schema).
- Mejora 3 (ítems fijos + más ensayos): prepara el terreno para todo lo demás.

**Fase 1 — Habilitar el estudio (en paralelo a la operación):**
- Mejora 1 (persistir criterio en Supabase) + arrancar la **recolección de outcomes** y de muestra normativa.
- Mejora 7 (definir estrategia de equidad y pipeline 4/5, aún sin datos suficientes).

**Fase 2 — Validación (cuando haya N):**
- Con N≥200 respuestas → Mejora 6 (normas) y Mejora 8 (EFA/CFA).
- Con N≥30 contrataciones con desempeño → primer **estudio de validez de criterio** (correlación predictor↔outcome, corrección por restricción de rango y fiabilidad; utilidad Taylor-Russell/BCG). Revisado por `stats-reviewer` y `fairness-auditor`.

**Condición para afirmar validez de criterio:** outcomes reales con N suficiente, predictores congelados al momento de evaluación, fiabilidad reportada, análisis de adverse impact (4/5) y revisión estadística independiente. **Hasta entonces, la herramienta NO debe usarse como base única ni automática de decisiones de selección.**
