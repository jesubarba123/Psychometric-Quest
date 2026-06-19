# SCORING.md — Documentación del sistema de scoring

**Versión:** C5 (2026-06-19)
**Propósito:** trazar cada constante, peso, umbral y clamp del pipeline de scoring.
Cada ítem indica su valor, qué hace y su justificación —o está marcado
explícitamente como **PROVISIONAL — sin calibrar (requiere datos)** si no hay
evidencia empírica que lo respalde.

Este documento es la referencia que deben citar los comentarios `// ver docs/SCORING.md §N`
repartidos por el código.

---

## §1 Principios de diseño actuales

- Los scores son escalas 0–100 construidas con proyecciones lineales ponderadas
  de variables de comportamiento de juego y cuestionario.
- **No se usan z-scores contra el pool actual** porque con N pequeño (≤ 5)
  las transformaciones normativas son ruidosas y engañosas (un grupo
  de cinco produce z-scores que no son comparables a ninguna norma poblacional).
- Las fórmulas buscan _transparencia e interpretabilidad_ sobre _precisión estadística_.
  Precisión estadística sólo es alcanzable con datos reales suficientes.
- El estado correcto de cada constante no-calibrada es **"PROVISIONAL"**, no
  un número sin etiquetar. Los valores provisionales se aceptan como punto de
  partida mientras se recopilan datos para calibración real.

---

## §2 `calculateBehavioral` — `src/lib/assessment.ts`

Calcula cuatro ejes conductuales (0–100) a partir de eventos de juego.

### 2.1 Adaptabilidad

```
adaptability = clamp(
  round(secondAccuracy * W_SECOND_ACCURACY + switchAccuracy * W_SWITCH_ACCURACY
        + (recovery !== null ? recovery * W_RECOVERY : 0)),
  CLAMP_MIN, CLAMP_MAX
)
```

| Constante | Valor | Qué hace | Justificación |
|---|---|---|---|
| `ADAPTABILITY_W_SECOND_ACCURACY` | 72 | Peso de la precisión en la segunda mitad del task (regla compleja) | PROVISIONAL — sin calibrar. La segunda mitad es más difícil → mayor peso. Requiere regresión contra criterio externo. |
| `ADAPTABILITY_W_SWITCH_ACCURACY` | 18 | Peso de la precisión global de switch de regla | PROVISIONAL — sin calibrar. Complemento al anterior. |
| `ADAPTABILITY_W_RECOVERY` | 10 | Peso de la recuperación conductual post-pérdida | PROVISIONAL — sin calibrar. Solo se incluye cuando hay datos reales (`recovery !== null`). C3: eliminado el placeholder 0.65 que fingía un valor inventado. |
| `ADAPTABILITY_CLAMP_MIN` | 18 | Suelo de la escala de salida | PROVISIONAL — sin calibrar. Evita que outliers de precisión cero produzcan 0 (reserva espacio para la incertidumbre de medición). |
| `ADAPTABILITY_CLAMP_MAX` | 96 | Techo de la escala de salida | PROVISIONAL — sin calibrar. Previene saturación en 100 cuando los datos de juego son perfectos pero no validados contra criterio externo. |

### 2.2 Priorización

```
prioritization = clamp(
  round(opsOptimal * W_OPS_OPTIMAL + impactBias * W_IMPACT_BIAS
        + max(0, impactBias - urgencyBias) * W_IMPACT_OVER_URGENCY),
  CLAMP_MIN, CLAMP_MAX
)
```

| Constante | Valor | Qué hace | Justificación |
|---|---|---|---|
| `PRIORITIZATION_W_OPS_OPTIMAL` | 74 | Peso de la tasa de elecciones óptimas en el juego de operaciones | PROVISIONAL — domina el composite por ser la señal directa de calidad de decisión. Sin calibrar. |
| `PRIORITIZATION_W_IMPACT_BIAS` | 5 | Peso del sesgo hacia ítems de alto impacto | PROVISIONAL — señal débil; contribución modesta. Sin calibrar. |
| `PRIORITIZATION_W_IMPACT_OVER_URGENCY` | 7 | Premio por preferir impacto sobre urgencia | PROVISIONAL — captura el rasgo de pensar en consecuencias vs. reactividad. Sin calibrar. |
| `PRIORITIZATION_CLAMP_MIN` | 20 | Suelo | PROVISIONAL — asimétrico respecto a otros ejes sin justificación documentada. Sin calibrar. |
| `PRIORITIZATION_CLAMP_MAX` | 97 | Techo | PROVISIONAL. Sin calibrar. |

### 2.3 Control ejecutivo

```
executiveControl = clamp(
  round(switchAccuracy * W_SWITCH_ACCURACY + max(0, RT_CEILING - avgRt) / RT_DIVISOR
        + opsOptimal * W_OPS_OPTIMAL),
  CLAMP_MIN, CLAMP_MAX
)
```

| Constante | Valor | Qué hace | Justificación |
|---|---|---|---|
| `EXEC_W_SWITCH_ACCURACY` | 55 | Peso dominante: precisión de cambio de regla | PROVISIONAL — sin calibrar. Es la señal principal de inhibición de respuesta prepotente. |
| `EXEC_RT_CEILING_MS` | 1200 | Techo de RT usado en penalización de velocidad | PROVISIONAL — RTs por encima de 1200 ms no añaden penalización adicional. Sin calibrar. |
| `EXEC_RT_DIVISOR` | 18 | Divisor para normalizar la ganancia de velocidad | PROVISIONAL — produce ~66 pts máx para RT=0 (range 0-1200 / 18 ≈ 66). Sin calibrar; derivado de criterio experto. |
| `EXEC_W_OPS_OPTIMAL` | 15 | Peso de calidad de decisión operacional | PROVISIONAL — señal complementaria. Sin calibrar. |
| `EXEC_CLAMP_MIN` | 18 | Suelo | PROVISIONAL. Sin calibrar. |
| `EXEC_CLAMP_MAX` | 95 | Techo | PROVISIONAL. Sin calibrar. |

### 2.4 Riesgo calculado

```
calculatedRisk = clamp(
  round(RISK_BASE + riskLevel * W_RISK_LEVEL
        + (recovery !== null ? recovery * W_RECOVERY : 0)),
  CLAMP_MIN, CLAMP_MAX
)
```

| Constante | Valor | Qué hace | Justificación |
|---|---|---|---|
| `RISK_BASE` | 42 | Valor de anclaje cuando riskLevel=0 y sin recovery | PROVISIONAL — "punto de partida neutro" sin respaldo empírico. Sin calibrar. |
| `RISK_W_RISK_LEVEL` | 62 | Peso del nivel de riesgo promedio en rutas | PROVISIONAL — sin calibrar. |
| `RISK_W_RECOVERY` | 18 | Peso de la recuperación post-pérdida | PROVISIONAL — solo entra cuando hay datos reales. C3: eliminado placeholder. |
| `RISK_CLAMP_MIN` | 18 | Suelo | PROVISIONAL. Sin calibrar. |
| `RISK_CLAMP_MAX` | 96 | Techo | PROVISIONAL. Sin calibrar. |

### 2.5 Perfil conductual (arquetipos)

| Constante | Valor | Qué hace | Justificación |
|---|---|---|---|
| `BALANCED_SPREAD_THRESHOLD` | 7 | Desviación estándar mínima entre los 4 ejes para que el perfil no sea "plano" | PROVISIONAL — valor de criterio experto. Por debajo, se clasifica como "Resolvedor situacional". Sin calibrar con datos. |

Los arquetipos son proyecciones geométricas sobre firmas binarias; no hay constantes
numéricas adicionales, solo las signaturas de cada arquetipo (ver código).

---

## §3 `computeComposite` — `src/utils/compositeAxes.ts`

Reduce los 4 ejes conductuales + métricas de juego a 3 índices compuestos.

### 3.1 Zona ideal

| Constante | Valor | Qué hace | Justificación |
|---|---|---|---|
| `COMPOSITE_IDEAL_MIN` | 65 | Umbral mínimo en las 3 dimensiones para que el perfil sea "ideal" | PROVISIONAL — criterio de negocio inicial. Equivale aproximadamente al percentil 65 de la escala sin calibrar. Sin validar contra criterio externo. |

### 3.2 Banda de riesgo calibrado

El índice `riskCalibrated` vale 100 dentro de la banda [lo, hi] y decae
linealmente fuera de ella.

| Constante | Valor | Qué hace | Justificación |
|---|---|---|---|
| `RISK_BAND.lo` | 40 | Límite inferior de la zona de riesgo saludable | PROVISIONAL — sin calibrar. Asume que un candidato que no toma ningún riesgo (≤40) es subóptimo. |
| `RISK_BAND.hi` | 75 | Límite superior de la zona de riesgo saludable | PROVISIONAL — sin calibrar. Por encima de 75 el riesgo es excesivo para la mayoría de roles. |
| `RISK_BAND.slope` | 2.4 | Penalización por punto de distancia fuera de la banda | PROVISIONAL — 1/2.4 ≈ 0.42 pts/pt de desviación. A 41 pts fuera del límite el score llega a 0. Sin calibrar. |

### 3.3 Composite cognition, strategy, riskCalibrated

Los tres índices son medias aritméticas sin ponderar (`meanDefined`) de los
sub-scores disponibles (los `undefined`/`null` se excluyen automáticamente).
No hay pesos adicionales que documentar aquí.

---

## §4 Métricas de los juegos

### §4.1 FrogLeap (tarea de riesgo) — `src/utils/psychometricCalculations.ts`

#### Parámetros de tarea

| Constante | Valor | Qué hace | Justificación |
|---|---|---|---|
| `RISK_META.safe.reward` | 6 | Recompensa de la ruta segura | Diseño de tarea: ratio riesgo/recompensa graduado. PROVISIONAL — sin calibrar contra curvas psicofísicas reales. |
| `RISK_META.safe.risk` | 0.08 | Probabilidad de fallo de la ruta segura | PROVISIONAL. |
| `RISK_META.probe.reward` | 12 | Recompensa de la ruta moderada | PROVISIONAL. |
| `RISK_META.probe.risk` | 0.32 | Probabilidad de fallo de la ruta moderada | PROVISIONAL. |
| `RISK_META.leap.reward` | 22 | Recompensa de la ruta arriesgada | PROVISIONAL. |
| `RISK_META.leap.risk` | 0.56 | Probabilidad de fallo de la ruta arriesgada | PROVISIONAL. |

#### Scoring derivado

| Constante | Valor | Qué hace | Justificación |
|---|---|---|---|
| `FROG_DECISION_QUALITY_DIVISOR` | 80 | Normaliza riskAdjustedScore a 0-100 | PROVISIONAL — asume que un score sin riesgo de 80 pts equivale al rendimiento perfecto. Sin calibrar. |
| `FROG_DECISION_CONSERVATIVE_THRESHOLD` | 0.2 | meanRisk por debajo → perfil "conservative" | PROVISIONAL — valor de corte de criterio experto. Sin calibrar con datos. |
| `FROG_DECISION_RECKLESS_THRESHOLD` | 0.44 | meanRisk por encima → perfil "reckless" | PROVISIONAL. Sin calibrar. |
| `FROG_FAILURE_DELTA_THRESHOLD` | 0.05 | Delta absoluto de riesgo post-fallo para clasificar cambio de conducta | PROVISIONAL — umbral de criterio experto. Sin calibrar. |

### §4.2 Signal Surge (CPT — atención sostenida) — `src/utils/psychometricCalculations.ts` y `src/components/SignalSurge.tsx`

**Nota:** la misma lógica de composite existe en dos lugares:
- `calculateSignalMetrics` en `psychometricCalculations.ts` (pipeline de análisis completo)
- `computeResult` en `SignalSurge.tsx` (resultado en tiempo real mostrado al candidato)

Ambas deben mantenerse sincronizadas. Los nombres de constantes son paralelos
(prefijo `RT_*` / `SIGNAL_*` en `psychometricCalculations.ts`; prefijo `SS_*` en `SignalSurge.tsx`).

#### Estructura de tarea

| Constante | Valor | Qué hace | Justificación |
|---|---|---|---|
| `SIGNAL_TRIALS_PER_PHASE` | 10 | Ensayos por fase (30 total en 3 fases) | Diseño de tarea: balance entre fatiga y fiabilidad. PROVISIONAL. |
| `TARGET_RATIO` | 0.4 | Proporción de ensayos que son objetivos (40 %) | Estándar de CPT: ratio bajo para mantener vigilancia. PROVISIONAL. |
| `SIGNAL_DURATION_MS` | [900, 700, 550] | Ventana de señal por fase (ms) | Diseño de dificultad progresiva. PROVISIONAL — sin calibrar contra percentiles normativos. |

#### Normalización de RT

| Constante | Valor | Qué hace | Justificación |
|---|---|---|---|
| `RT_FLOOR_MS` / `SS_RT_FLOOR_MS` | 200 | TR por debajo de este valor produce rtScore=1 | PROVISIONAL — corresponde aproximadamente al límite inferior fisiológico plausible del TR visual-motor. Sin calibrar con datos propios. |
| `RT_RANGE_MS` / `SS_RT_RANGE_MS` | 700 | Rango de normalización: rtScore = 1 - (rt - 200) / 700; un RT de 900 ms produce rtScore=0 | PROVISIONAL — el techo efectivo de 900 ms se eligió por criterio experto. Sin calibrar. |

#### Composite de atención sostenida

```
rawComposite = hitRate * HIT_RATE_WEIGHT
             + (1 - min(faRate * FA_SCALE, 1)) * FA_WEIGHT
             + rtScore * RT_WEIGHT           (0 si no hay hits)

maxPossible  = HIT_RATE_WEIGHT + FA_WEIGHT + (RT_WEIGHT si hay hits, else 0)

sustainedAttention = clamp(round(rawComposite / maxPossible * 100
                    * (1 - decayIndex * DECAY_FACTOR)), 0, 100)
```

| Constante | Valor | Qué hace | Justificación |
|---|---|---|---|
| `SIGNAL_HIT_RATE_WEIGHT` / `SS_HIT_RATE_WEIGHT` | 50 | Peso del hit-rate | PROVISIONAL — domina el composite como señal principal de detección. Sin calibrar con datos. |
| `SIGNAL_FA_WEIGHT` / `SS_FA_WEIGHT` | 25 | Peso del componente de falsas alarmas | PROVISIONAL — captura la impulsividad/inhibición de respuesta. Sin calibrar. |
| `SIGNAL_RT_WEIGHT` / `SS_RT_WEIGHT` | 25 | Peso del componente de RT | PROVISIONAL — velocidad de procesamiento como señal complementaria. Se excluye si no hay hits (CRIT-1: excluir > inventar). |
| `SIGNAL_FA_SCALE` / `SS_FA_SCALE` | 5 | Escala de penalización de FA: min(faRate × scale, 1) | PROVISIONAL — satura en faRate=0.2; por encima, penalización máxima. Sin calibrar. |
| `SIGNAL_DECAY_FACTOR` / `SS_DECAY_FACTOR` | 0.2 | Fracción del decayIndex que penaliza el composite | PROVISIONAL — un decayIndex=1 (caída total) aplica -20% al composite. Sin calibrar. |

#### Consistencia cognitiva

| Constante | Valor | Qué hace | Justificación |
|---|---|---|---|
| `CV_MAX` | 0.5 | Coeficiente de variación de RT al que cognitiveConsistency=0 | PROVISIONAL — CV ≥ 0.5 se considera variabilidad de RT máxima. Sin calibrar. |

### §4.3 Memory Surge (N-back — memoria de trabajo) — `src/components/MemorySurge.tsx`

#### Estructura de tarea

| Constante | Valor | Qué hace | Justificación |
|---|---|---|---|
| `N_BACK` | 2 | Distancia de comparación N-back | 2-back es el protocolo estándar en la literatura de memoria de trabajo (Owen et al. 2005; Jaeggi et al. 2008). No es provisional. |
| `FULL_STEPS` | 18 | Pasos totales (16 puntuables: índices ≥ 2) | PROVISIONAL — sin calibrar contra fiabilidad split-half. |
| `MATCH_RATIO` | 0.38 | Proporción de ensayos que son coincidencia (~6/16) | PROVISIONAL — valor de criterio experto; la literatura sugiere 30-40 %. |
| `STEP_SHOW_MS` | 1350 | Ventana de respuesta en ms | PROVISIONAL — sin calibrar contra datos de TR poblacionales para 2-back. |
| `STEP_GAP_MS` | 480 | Pausa inter-estímulo en ms | PROVISIONAL. |

#### Composite de memoria de trabajo

```
workingMemoryScore = round(clamp(
  hitRate × WM_HIT_WEIGHT + (1 - faRate) × WM_FA_WEIGHT + rtScore × WM_RT_WEIGHT,
  0, 100
))

rtScore = meanRt > 0 ? max(0, 1 - (meanRt - WM_RT_FLOOR_MS) / WM_RT_RANGE_MS) : 0.5
```

| Constante | Valor | Qué hace | Justificación |
|---|---|---|---|
| `WM_HIT_WEIGHT` | 58 | Peso del hit-rate en el composite de memoria | PROVISIONAL — señal primaria de recuperación en N-back. Sin calibrar. |
| `WM_FA_WEIGHT` | 30 | Peso del factor de falsas alarmas | PROVISIONAL — captura la inhibición de respuesta inapropiada. Sin calibrar. |
| `WM_RT_WEIGHT` | 12 | Peso del componente de RT | PROVISIONAL — señal complementaria de velocidad de recuperación. Sin calibrar. |
| `WM_RT_FLOOR_MS` | 350 | TR mínimo esperado para rtScore=1 | PROVISIONAL — superior al piso de Signal Surge (200 ms) por ser una tarea de comparación más compleja. Sin calibrar. |
| `WM_RT_RANGE_MS` | 900 | Rango de normalización de RT | PROVISIONAL — un TR de 1250 ms produce rtScore=0. Sin calibrar. |

**Nota sobre el rtScore=0.5 cuando meanRt=0:** cuando no hubo hits, se usa 0.5
como valor neutro. Esto es un placeholder documentado, análogo al eliminado 0.65
de `calculatedRisk` (C3). A diferencia de ese, aquí el impacto es pequeño
(WM_RT_WEIGHT=12) y se mantiene para evitar que el score colapse artificialmente.
**Siguiente paso recomendado:** evaluar si corresponde excluir el componente
y renormalizar, como se hizo en Signal Surge.

---

## §5 Arquetipo conductual — `src/lib/assessment.ts`

| Constante | Valor | Qué hace | Justificación |
|---|---|---|---|
| `BALANCED_SPREAD_THRESHOLD` | 7 | Desviación estándar entre los 4 ejes por debajo de la cual el perfil es "Resolvedor situacional" | PROVISIONAL — sin calibrar. Un valor de 7 en una escala 0-100 es arbitrario pero bajo; la mayoría de candidatos con variación real supera este umbral. Requiere análisis con datos reales para determinar el corte correcto. |

---

## §6 `scoreBand` — `src/utils/scoreBand.ts`

| Constante | Valor | Qué hace | Justificación |
|---|---|---|---|
| `SEM_PROXY` | 10 | Error estándar de medición proxy (puntos) | PROVISIONAL — sustituye al SEM real por dominio hasta que haya suficiente N para calcularlo desde la fiabilidad (α de Cronbach vía `SEM = SD × √(1 − α)`). Ver §6.1. |
| `CATEGORY_HIGH_THRESHOLD` | 60 | Umbral para categoría "Alto": value ≥ 60 | PROVISIONAL — sin percentiles normativos reales. La escala conductual efectiva tiene suelo práctico en 18–20 (clamps de `calculateBehavioral`), por lo que el corte ≥ 60 corresponde aproximadamente al cuartil 55 de la distribución conductual esperada, no al tercio superior de una escala 0-100 uniforme. La justificación correcta requiere percentiles normativos de un pool real (N ≥ 50) para calibrar el corte contra el percentil deseado (ej. P67). Sin calibrar. |
| `CATEGORY_LOW_THRESHOLD` | 40 | Umbral para categoría "Bajo": value ≤ 40 | PROVISIONAL — simétrico al anterior. Con el suelo efectivo en 18–20, el corte ≤ 40 queda por encima del cuartil 25 de la distribución conductual. Requiere calibración con datos reales. |

### §6.1 SEM real derivado de fiabilidad (próximo paso)

La tarea C2 calcula el α de Cronbach por dominio Big Five. El SEM real sería:

```
SEM = SD × √(1 − α)
```

donde SD es la desviación estándar observada del dominio en el pool y α es la
fiabilidad interna calculada en C2.

**Razón por la que NO se implementó en C5:** con N actual pequeño, tanto SD
como α son estimaciones muy ruidosas. Inyectar un SEM calculado desde α
sobre N=5 podría producir valores extremos (α cercano a 0 → SEM ≈ SD, o
α negativo en casos degenerados) que son peor que el proxy de 10.

**Condición para implementar:** cuando el pool tenga N ≥ 30 por rol, α sea
interpretable (0.6 ≤ α ≤ 0.95) y SD sea estable entre sesiones, calcular
SEM por dominio y pasarlo a `scoreBand(value, sem)` desde el consumidor que
ya recibe `partialDomains` y `consistency`. No hay que tocar `scoreBand`;
solo el caller.

---

## §7 Test de regresión — `src/lib/scoring.regression.test.ts`

Los valores fijados en el test de regresión corresponden a los fixtures descritos aquí.

### Fixture A — escenario conductual moderado

| Variable | Valor fijado |
|---|---|
| `adaptability` | 73 |
| `prioritization` | 68 |
| `executiveControl` | 95 |
| `calculatedRisk` | 83 |

Derivación:
- `switchAccuracy = 5/6`, `secondAccuracy = 2/3`, `avgRt = 500 ms`
- `opsOptimal = 2/3`, `impactBias = 10/3`, `urgencyBias = 3.0`
- `riskLevel = (0.3+0.4+0.4)/3 ≈ 0.3667`, `recovery = 1.0`
- `adaptability = clamp(round(0.667×72 + 0.833×18 + 1.0×10), 18, 96) = 73`
- `prioritization = clamp(round(0.667×74 + 3.333×5 + 0.333×7), 20, 97) = 68`
- `executiveControl = clamp(round(0.833×55 + 700/18 + 0.667×15), 18, 95) = 95`
- `calculatedRisk = clamp(round(42 + 0.3667×62 + 1.0×18), 18, 96) = 83`

### Fixture B — sin rutas (recovery=null)

| Variable | Valor fijado |
|---|---|
| `adaptability` | 90 |
| `prioritization` | 97 (techo) |
| `executiveControl` | 95 (techo) |
| `calculatedRisk` | 42 (solo RISK_BASE) |

### Fixture composite (Fixture A behavioral only)

| Variable | Valor fijado |
|---|---|
| `cognition` | 95 (≈ solo executiveControl disponible) |
| `strategy` | 70.5 (media de 68 y 73) |
| `riskCalibrated` | 80.8 (riskCalibration(83): dist=8, 100−8×2.4=80.8) |

---

## §8 Siguientes pasos recomendados (psicometrista)

1. **Calibración de pesos (§2):** con datos reales de ≥30 candidatos por rol,
   ejecutar regresión logística o correlaciones con métricas de desempeño externo
   (evaluación del hiring manager) para validar o ajustar los pesos de
   `calculateBehavioral`.

2. **Percentiles normativos para cortes (§6):** reemplazar los cortes 40/60 de
   `scoreBand` con los percentiles 33/67 del pool real una vez que N ≥ 50.

3. **SEM real por dominio Big Five (§6.1):** implementar cuando N ≥ 30 y α
   sea interpretable. El consumidor del componente ya puede recibir `sem`
   como parámetro; no hay que tocar `scoreBand`.

4. **Revisión del rtScore=0.5 en MemorySurge (§4.3):** evaluar si es mejor
   excluir el componente RT cuando no hay hits (como en Signal Surge) o
   mantener el 0.5 como neutro documentado.

5. **Revisión de RISK_BASE=42 (§2.4):** el valor de anclaje es el más
   arbitrario del pipeline. Sin datos de calibración, su efecto es inflar
   `calculatedRisk` a 42 incluso con cero eventos de ruta.
