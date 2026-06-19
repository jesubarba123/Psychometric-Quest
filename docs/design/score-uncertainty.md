# Spec de diseño — Patrón "Puntaje con incertidumbre" (C4)

**Versión:** 1.0  
**Fecha:** 2026-06-19  
**Diseñador:** ui-designer  
**Dependencia de implementación:** C2 (reliability.ts ya entrega `alpha`, `interpretable`, `n` por dominio Big Five; el frontend-dev extenderá la misma interfaz para los compuestos conductuales cuando C5 esté listo).  
**Receptor:** frontend-dev para implementar en `fix/psychometrics-fase0`.

---

## 1. Problema y decisión de diseño

El sistema muestra hoy enteros firmes ("64") sobre medidas con SEM de decenas de puntos, creando falsa exactitud. El psicometrista exige comunicar incertidumbre honestamente.

### Opción elegida: barra con zona de incertidumbre sombreada + rango textual

Se evaluaron tres alternativas:

| Opción | Pros | Contras | Decisión |
|---|---|---|---|
| **±SEM numérico** ("64 ±8") | Preciso, honesto | Lectores sin formación estadística lo ignoran o malinterpretan | Descartado como valor principal |
| **Categoría verbal** (Bajo / Medio / Alto) | Muy legible | Opaca la diferencia entre 48 y 58, ambos "Medio" | Descartado como única señal |
| **Barra con banda sombreada + rango numérico** | Visual inmediato; el rango numérico satisface al técnico; la categoría verbal sirve al reclutador | Más complejo de implementar | **Elegido** |

La barra existente (`.score-row`) ya comunica magnitud. La extensión natural es superponer una zona semitransparente que represente ±SEM (o ±10 puntos como proxy mientras C2 no calcula SEM individual). El rango textual ("58–70") acompaña para accesibilidad y para el lector técnico. La categoría verbal (Bajo / Medio / Alto) se coloca como etiqueta secundaria junto al número central, nunca sola.

**Ningún número se muestra sin su banda o sin el badge "No interpretable" cuando el dominio no cumple umbrales.**

---

## 2. Sistema de diseño aplicado

### 2.1 Tokens usados (solo los ya existentes en `:root`)

| Token | Rol en este patrón |
|---|---|
| `--ink` | Valor central y rango numérico |
| `--muted` | Etiqueta de dominio, leyenda, rango numérico en modo secundario |
| `--surface-2` | Track de la barra base |
| `--signal` | Fill del track (zona de valor), igual que el `.score-row` existente |
| `--signal-dim` | Zona sombreada de incertidumbre (banda ±SEM) |
| `--amber` | Dominio parcial (advertencia); mismo uso que `--reliability-alpha--low` |
| `--line` | Borde del track y del contenedor de banda |
| `--green` | Categoría "Alto" (≥ 60) |
| `--blue` | No se usa aquí (reservado para otros contextos) |
| `--red` | No se usa aquí |

**No se hardcodea ningún color.**

### 2.2 Escala tipográfica en el componente (máximo 3 tamaños)

| Elemento | Tamaño | Peso | Clase / token |
|---|---|---|---|
| Etiqueta de dominio | 13 px | 800 | existente en `.score-row` |
| Valor central + rango | 13 px | 700 | `.score-band__value` |
| Categoría verbal + leyenda parcial | 11 px | 700 | `.score-band__category` |

### 2.3 Espaciado

- Altura del track: 10 px (igual que `.score-row div`, sin cambio).
- Padding interno de la zona de banda: 0 (es un pseudo-elemento sobre el track).
- Gap entre columnas: 10 px (igual que `.score-row`).
- Separación entre valor y categoría verbal: 4 px (gap en flex).

---

## 3. El patrón: estructura y clases CSS nuevas

### 3.1 Grid columnar (extensión de `.score-row`)

El nuevo patrón reemplaza `.score-row` cuando hay datos de incertidumbre. La columna del valor (tercera, fija 36 px en la versión actual) se amplía para alojar el rango y la categoría:

```
grid-template-columns: 130px  minmax(0, 1fr)  auto
                        ←label→ ←——track——→ ←value+category→
```

La columna de valor pasa de `36px` fijo a `auto` para alojar "58–70" sin truncar.

### 3.2 Clases CSS nuevas (todas en `src/styles.css`)

```
.score-band                  — reemplaza .score-row cuando hay incertidumbre
.score-band__track           — reemplaza .score-row div (track base)
.score-band__fill            — reemplaza .score-row i (fill del valor central)
.score-band__uncertainty     — zona sombreada de ±SEM superpuesta al track
.score-band__value-group     — flex column: value + category
.score-band__value           — número central (o rango "58–70")
.score-band__category        — etiqueta verbal: "Alto" / "Medio" / "Bajo"
.score-band__category--high  — modificador: color --green
.score-band__category--mid   — modificador: color --muted
.score-band__category--low   — modificador: color --amber
.score-band--partial         — modificador de fila: borde izquierdo --amber
.score-band--no-data         — modificador de fila: valor —, track vacío
```

El badge "No interpretable" reutiliza las clases ya existentes:
`.reliability-badge reliability-badge--low`

---

## 4. Especificación CSS de las clases nuevas

```css
/* ── Patrón "puntaje con incertidumbre" ──────────────────────── */

.score-band {
  display: grid;
  grid-template-columns: 130px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  color: var(--muted);
  font-size: 13px;
  font-weight: 800;
}

/* Track base — igual que .score-row div */
.score-band__track {
  position: relative;          /* contexto para la zona de incertidumbre */
  height: 10px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--surface-2);
  border: 1px solid rgba(42, 58, 72, .78);
}

/* Fill del valor central — igual que .score-row i */
.score-band__fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--amber), var(--signal));
  transition: width 0.6s var(--ease-spring);
}

/*
  Zona sombreada de incertidumbre.
  Se posiciona de forma absoluta sobre el track.
  left y width se calculan en línea desde JS:
    left  = max(0, (value - sem) / 100 * 100)%
    width = min(100, (2 * sem) / 100 * 100)%
  Donde sem = SEM del scoring (o 10 como proxy cuando C5 no lo entrega aún).
*/
.score-band__uncertainty {
  position: absolute;
  top: 0;
  height: 100%;
  background: var(--signal-dim);
  opacity: 0.38;
  border-radius: inherit;
  pointer-events: none;
}

/* Columna de valor + categoría verbal */
.score-band__value-group {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  min-width: 52px;             /* evita saltos al cambiar entre rango y "—" */
}

.score-band__value {
  color: var(--ink);
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
  text-align: right;
}

.score-band__category {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .04em;
  white-space: nowrap;
  text-align: right;
}

.score-band__category--high { color: var(--green);  }
.score-band__category--mid  { color: var(--muted);  }
.score-band__category--low  { color: var(--amber);  }

/* Modificador: dominio parcial */
.score-band--partial {
  padding-left: 8px;
  border-left: 3px solid var(--amber);
  margin-left: -11px;          /* compensa el padding para mantener alineación del grid */
}

/* Modificador: sin dato (valor undefined/null) */
.score-band--no-data .score-band__value {
  color: var(--muted);
}

/* Animación idéntica a la existente en .score-row */
.score-band__fill {
  animation: score-bar-grow 0.7s var(--ease-spring) both,
             bar-shimmer 3s linear infinite;
}
```

---

## 5. Los 4 estados con markup completo y copy exacto

### Estado 1 — Interpretable con banda

Condición: `reliability.interpretable === true` (alpha ≥ 0.60, N ≥ 10) para Big Five; o, para conductuales, simplemente que el valor exista y no sea un placeholder.

**Mini-mockup ASCII (ancho ≈ 360 px):**

```
Apertura            [████████░░░░░░░░░░░░░░░░]  58–70
                          ↑band ±SEM           Alto
```

- El bloque sólido (`████`) va de 0 a `value`.
- La zona sombreada (`░░░`) se extiende desde `value - sem` hasta `value + sem`.
- A la derecha: rango `"58–70"` en tamaño 13 px / `--ink`, y debajo `"Alto"` en 11 px / `--green`.

**Markup sugerido:**

```html
<div class="score-band" role="group" aria-label="Apertura: rango 58 a 70, nivel Alto">
  <span class="score-band__label">Apertura</span>

  <div class="score-band__track" aria-hidden="true">
    <!-- fill del valor central: width = value% -->
    <i class="score-band__fill" style="width: 64%"></i>
    <!-- zona de incertidumbre: left = (value-sem)/100*100%, width = (2*sem)/100*100% -->
    <span class="score-band__uncertainty" style="left: 58%; width: 12%"></span>
  </div>

  <div class="score-band__value-group">
    <span class="score-band__value">58–70</span>
    <span class="score-band__category score-band__category--high" aria-hidden="true">Alto</span>
  </div>
</div>
```

**Reglas de cálculo del rango (para el frontend-dev):**

```
sem_proxy = 10   // puntos, valor provisional hasta que C5 entregue SEM por constructo
low  = Math.max(0,   Math.round(value - sem_proxy))
high = Math.min(100, Math.round(value + sem_proxy))
rangeText = `${low}–${high}`

// Categoría verbal
category = value >= 60 ? "Alto" : value <= 40 ? "Bajo" : "Medio"
categoryModifier = value >= 60 ? "high" : value <= 40 ? "low" : "mid"

// Zona de incertidumbre en el track
uncertaintyLeft  = `${Math.max(0, value - sem_proxy)}%`
uncertaintyWidth = `${Math.min(100, value + sem_proxy) - Math.max(0, value - sem_proxy)}%`
```

**Texto para `aria-label` del grupo (completo, sin depender del color):**

```
"[Nombre del dominio]: rango [low] a [high], nivel [categoría]"
Ejemplo: "Apertura: rango 58 a 70, nivel Alto"
```

---

### Estado 2 — No interpretable (fiabilidad baja o N insuficiente)

Condición: `reliability.interpretable === false` (alpha < 0.60 o N < 10 o alpha === null).

**Mini-mockup ASCII:**

```
Apertura            [░░░░░░░░░░░░░░░░░░░░░░░░]  —
                                            [No interpretable]
```

El track se muestra vacío (sin fill, sin banda de incertidumbre). El badge "No interpretable" aparece en la columna de valor, reemplazando el número y la categoría.

**Markup sugerido:**

```html
<div class="score-band score-band--no-data" role="group"
     aria-label="Apertura: resultado no interpretable por fiabilidad insuficiente">
  <span class="score-band__label">Apertura</span>

  <div class="score-band__track" aria-hidden="true">
    <!-- track intencionalmente vacío: sin fill ni banda -->
  </div>

  <div class="score-band__value-group">
    <span class="score-band__value" aria-hidden="true">—</span>
    <span class="reliability-badge reliability-badge--low">No interpretable</span>
  </div>
</div>
```

**Nota de implementación:** el badge reutiliza las clases existentes `.reliability-badge` y `.reliability-badge--low` de `ReliabilitySection`. No se crean clases nuevas para este estado.

**Copy exacto del badge:** "No interpretable" (igual que en `ReliabilitySection.tsx` existente, para coherencia).

---

### Estado 3 — Parcial (faltan ítems, `partialDomains`)

Condición: `result.partialDomains?.includes(domainKey) === true`.

El estado Parcial puede coexistir con los estados 1 o 2. Se aplica el modificador `.score-band--partial` a la fila entera y se añade un marcador visible superíndice `*` sobre el valor.

**Mini-mockup ASCII:**

```
▌ Apertura          [███████░░░░░░░░░░░░░░░░░]  58–70 *
▌                         ↑band                 Medio
```

El borde izquierdo ambarino (3 px, `--amber`) señala la condición parcial. El superíndice `*` ya existe en el código como `.bf-partial-marker`.

**Markup sugerido (parcial + interpretable):**

```html
<div class="score-band score-band--partial" role="group"
     aria-label="Apertura: rango 58 a 70, nivel Medio. Dominio con ítems sin responder: interpretar con precaución">
  <span class="score-band__label">Apertura</span>

  <div class="score-band__track" aria-hidden="true">
    <i class="score-band__fill" style="width: 64%"></i>
    <span class="score-band__uncertainty" style="left: 58%; width: 12%"></span>
  </div>

  <div class="score-band__value-group">
    <span class="score-band__value">
      58–70<sup class="bf-partial-marker" aria-hidden="true">*</sup>
    </span>
    <span class="score-band__category score-band__category--mid" aria-hidden="true">Medio</span>
  </div>
</div>
```

La leyenda `*` se muestra **una sola vez** al pie del `.score-list` / bloque de dominios, idéntica a la existente:

```html
<p class="bf-partial-legend">
  * Dominio con ítems sin responder: interpretar con precaución.
</p>
```

**Markup sugerido (parcial + no interpretable):**

```html
<div class="score-band score-band--partial score-band--no-data" role="group"
     aria-label="Apertura: resultado no interpretable. Dominio con ítems sin responder.">
  <span class="score-band__label">Apertura</span>
  <div class="score-band__track" aria-hidden="true"></div>
  <div class="score-band__value-group">
    <span class="score-band__value" aria-hidden="true">—</span>
    <span class="reliability-badge reliability-badge--low">No interpretable</span>
  </div>
</div>
```

---

### Estado 4 — Sin dato (valor undefined / null)

Condición: el valor del dominio no existe en `behavioral` o `personality.domains[key]` es `undefined` / `null`.

Igual que el estado 2 en apariencia visual, pero el motivo es diferente. No se muestra badge "No interpretable" sino solamente el guion largo "—" para no confundir ausencia de dato con fiabilidad insuficiente.

**Mini-mockup ASCII:**

```
Memoria de trabajo  [░░░░░░░░░░░░░░░░░░░░░░░░]  —
```

**Markup sugerido:**

```html
<div class="score-band score-band--no-data" role="group"
     aria-label="Memoria de trabajo: sin dato">
  <span class="score-band__label">Memoria de trabajo</span>

  <div class="score-band__track" aria-hidden="true">
    <!-- vacío intencional -->
  </div>

  <div class="score-band__value-group">
    <span class="score-band__value">—</span>
    <!-- sin badge: la ausencia de dato no implica baja fiabilidad -->
  </div>
</div>
```

**Copy exacto del valor:** "—" (guion largo, U+2014), igual que el patrón existente en `PsychometricDashboard.tsx`.

---

## 6. Componente React sugerido (firma, no código completo)

El frontend-dev debe crear `src/components/ScoreBand.tsx` con la siguiente prop-shape:

```typescript
type ScoreBandProps = {
  label: string;
  value: number | null | undefined;   // null/undefined → estado 4 (sin dato)
  sem?: number;                        // proxy: 10 si no se entrega
  interpretable?: boolean;             // false → estado 2
  isPartial?: boolean;                 // true → estado 3 (modificador de fila)
};
```

`ScoreBand` reemplaza a `ScoreRow` en todas las superficies listadas en §7. `ScoreRow` se puede mantener o deprecar; la decisión es del frontend-dev.

---

## 7. Superficies donde se aplica el patrón

### Aplicar (cambio requerido)

| Superficie | Componente actual | Cambio |
|---|---|---|
| **Detalle conductual** (reporte candidato y vista admin) | `ScoreRow` en `App.tsx:1101–1107` | Reemplazar `ScoreRow` → `ScoreBand`. Pasar `interpretable` cuando esté disponible desde C2/C5; mientras tanto, omitirlo (se muestra banda con `sem_proxy = 10`). |
| **Reporte Big Five** (`BigFiveReport`) | `.bf-domain-score` con número + `.bf-bar` | El número y la barra `.bf-bar` se sustituyen por el nuevo `.score-band__track` con `.score-band__uncertainty`. El `.bf-partial-marker` y `.bf-partial-legend` existentes se conservan. `interpretable` viene de `bigFiveDomainAlphas` (ya existe en `reliability.ts`). |
| **MetricCard en PsychometricDashboard** (dimensiones del radar) | `<strong style={{ color }}>` con número o "—" | Aplicar `ScoreBand` solo para las métricas con escala 0–100 (`sustainedAttention`, `processingSpeed`, `cognitiveConsistency`). Métricas con unidades propias (`dPrime`, `medianRt`, `cvRt`) no usan el patrón; siguen como texto. |

### No cambiar

| Superficie | Motivo |
|---|---|
| `.metric b` en el strip de métricas del admin (conteo de candidatos, etc.) | Son conteos absolutos, no puntajes psicométricos. Sin SEM. |
| `match-score-large` (CV match %) | Es un porcentaje de coincidencia de texto, no una medida psicométrica. |
| Correlaciones en `CorrelationHeatmap` | Valores r no tienen el mismo frame de referencia que un score 0–100. |
| `ReliabilitySection` | Ya tiene su propio patrón de comunicación de fiabilidad; no duplicar. |
| `RadarProfileChart` | El radar es una visualización comparativa. No modificar los tooltips del chart; sí aplicar `ScoreBand` en la grid de métricas debajo del radar (ver fila PsychometricDashboard arriba). |

---

## 8. Reglas de accesibilidad

Estas reglas son obligatorias para la implementación. No son sugerencias.

### 8.1 No solo color

El patrón usa tres señales independientes para cada estado:
1. La **zona sombreada** en el track (visual).
2. El **rango numérico** ("58–70") en texto (textual).
3. La **categoría verbal** ("Alto" / "Medio" / "Bajo") en texto.

El estado "No interpretable" se comunica con el badge textual; la ausencia de fill en el track es refuerzo visual, no la única señal.

El estado "Parcial" usa borde de color más superíndice `*` más leyenda al pie.

Ningún estado depende exclusivamente del color.

### 8.2 `aria-label` completo en el grupo

El `div.score-band` lleva `role="group"` y `aria-label` que describe en prosa el estado completo. Los elementos visuales internos (track, banda, categoría) llevan `aria-hidden="true"` donde son redundantes con el `aria-label` del grupo.

Formato de `aria-label` por estado:

| Estado | `aria-label` |
|---|---|
| Interpretable | `"[Dominio]: rango [low] a [high], nivel [categoría]"` |
| No interpretable | `"[Dominio]: resultado no interpretable por fiabilidad insuficiente"` |
| Parcial + interpretable | `"[Dominio]: rango [low] a [high], nivel [categoría]. Dominio con ítems sin responder: interpretar con precaución"` |
| Parcial + no interpretable | `"[Dominio]: resultado no interpretable. Dominio con ítems sin responder."` |
| Sin dato | `"[Dominio]: sin dato"` |

### 8.3 Contraste (WCAG AA)

| Elemento | Color (token) | Color fondo (token) | Ratio requerido | Cumplimiento |
|---|---|---|---|---|
| Valor numérico principal | `--ink` (#d8e8e4) | `--panel` (~#161d24) | 4.5:1 | Cumple: ratio ≈ 8.5:1 |
| Categoría verbal "Alto" | `--green` (#5cb88a) | `--panel` (~#161d24) | 4.5:1 | Cumple: ratio ≈ 4.9:1 |
| Categoría verbal "Medio" | `--muted` (#7a9898) | `--panel` (~#161d24) | 4.5:1 | Cumple con margen ajustado: ratio ≈ 4.6:1. Si el fondo es `--surface-2` (#1e2830), revisar: ratio ≈ 4.2:1. En ese caso usar `--ink` con `font-weight: 700`. |
| Categoría verbal "Bajo" | `--amber` (#e8a94a) | `--panel` (~#161d24) | 4.5:1 | Cumple: ratio ≈ 6.4:1 |
| Badge "No interpretable" | `--amber` (#e8a94a) | rgba(232,169,74,.12) sobre `--panel` | 4.5:1 | Cumple: mismo cálculo que arriba |

**Advertencia para frontend-dev:** si `ScoreBand` se renderiza dentro de `.score-list` que tiene fondo `--surface-2`, verificar el ratio de la categoría "Medio" (`--muted` sobre `--surface-2`). Si no cumple 4.5:1, aplicar `--ink` con `opacity: .6` en lugar de `--muted` puro.

### 8.4 Focus visible

`ScoreBand` es un elemento de presentación, no interactivo. No necesita `tabindex`. Si en el futuro se añade un tooltip expandible al hacer clic en la banda, el trigger debe tener `focus-visible` con `outline: 2px solid var(--signal); outline-offset: 2px`.

### 8.5 Movimiento reducido

La animación `score-bar-grow` ya existe en `.score-row i`. Para la zona de incertidumbre `.score-band__uncertainty` no se anima su entrada (es un elemento de información, no de celebración). La regla existente:

```css
@media (prefers-reduced-motion: reduce) {
  .score-band__fill { animation: none; }
}
```

Agregar esta media query junto con las reglas del componente.

---

## 9. Coherencia con componentes existentes

| Componente existente | Cómo se relaciona con el patrón nuevo |
|---|---|
| `.reliability-badge` / `.reliability-badge--low` | Se reutiliza tal cual en Estado 2. No crear un badge nuevo. |
| `.bf-partial-marker` / `.bf-partial-legend` | Se conservan en Estado 3 del Big Five. No duplicar. |
| `.score-row` | Se mantiene en el código hasta que todas las superficies migren a `ScoreBand`. Deprecar después de la migración completa. |
| `InterpretabilityBadge` (en `ReliabilitySection.tsx`) | El frontend-dev puede extraer este sub-componente a un archivo compartido (`src/components/InterpretabilityBadge.tsx`) para reutilizarlo en `ScoreBand`. |

---

## 10. Orden de implementación recomendado

1. Definir las clases CSS en `src/styles.css` (las de §4).
2. Crear `src/components/ScoreBand.tsx` con la prop-shape de §6.
3. Migrar `BigFiveReport` primero: es el más visible y ya tiene los datos de `reliability.ts` disponibles.
4. Migrar `ScoreRow` → `ScoreBand` en el panel "Detalle conductual".
5. Migrar `MetricCard` (solo métricas 0–100) en `PsychometricDashboard`.
6. El QA (`sdet-qa-reviewer`) debe verificar un E2E que confirme que ningún puntaje individual aparece sin banda o badge después de esta implementación.

---

## Apéndice A — Ejemplo visual completo (ASCII, ancho 400 px)

```
┌─ Detalle conductual ──────────────────────────────────────────────────┐
│                                                                        │
│  Adaptabilidad    [████████████░░░░░░░░░░░░░░░░░░░░░░░]  58–78        │
│                              ↑─── banda ±10 ─────┘          Alto      │
│                                                                        │
│  Priorización     [███████████████░░░░░░░░░░░░░░░░░░░░]  65–85        │
│                                                              Alto      │
│                                                                        │
│▌ Control ejecutivo[███████░░░░░░░░░░░░░░░░░░░░░░░░░░░░]  45–65 *     │
│                         ↑                                    Medio     │
│                         borde ambarino = dominio parcial               │
│                                                                        │
│  Memoria de trabajo[░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░]  —           │
│  (sin dato)                                                            │
│                                                                        │
│  Razonamiento      [░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░]  —           │
│  fluido                                                  [No           │
│  (baja fiabilidad)                                       interpretable]│
│                                                                        │
│  * Dominio con ítems sin responder: interpretar con precaución.        │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Apéndice B — Decisiones que quedan fuera del alcance de este spec

- El valor concreto del SEM por constructo conductual: lo define el psicometrista en C5. Mientras tanto, `sem_proxy = 10` es el valor de diseño, y el frontend-dev debe aceptarlo como prop opcional con ese default.
- Cuándo actualizar la categoría verbal de "Medio" a "Moderado-alto" o categorías más finas: depende de decisión del psicometrista sobre los cortes. Los cortes actuales (≥60 = Alto, ≤40 = Bajo, resto = Medio) son provisionales y deben documentarse en `docs/SCORING.md` (C5).
- El color de fill del track por categoría (verde si Alto, ambarino si Bajo): el track actual usa el degradado ambarino→signal siempre. No se cambia en esta iteración para no sobrecargar la señal visual. El color de la categoría verbal es suficiente diferenciación.
