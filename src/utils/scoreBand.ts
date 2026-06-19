// scoreBand.ts — Helper puro para el patrón "puntaje con incertidumbre" (C4).
//
// UMBRALES DE CATEGORÍA (provisionales; C5/psicometrista puede afinarlos):
//   value >= 60  → "Alto"   (modificador CSS: "high")
//   value <= 40  → "Bajo"   (modificador CSS: "low")
//   41–59        → "Medio"  (modificador CSS: "mid")
//
// SEM PROXY:
//   sem_proxy = 10 puntos mientras C5 no entregue el SEM real por constructo.
//   Cuando C5 lo entregue, bastará pasar `sem` como argumento; no hay que tocar la UI.
//
// CÁLCULO DE BANDA:
//   low  = Math.max(0,   Math.round(value - sem))
//   high = Math.min(100, Math.round(value + sem))
//
// ZONAS VISUALES DEL TRACK (para .score-band__uncertainty):
//   uncertaintyLeft  = `${Math.max(0, value - sem)}%`
//   uncertaintyWidth = `${Math.min(100, value + sem) - Math.max(0, value - sem)}%`
//
// Referencia: docs/design/score-uncertainty.md §5 Estado 1.

export type ScoreBandResult = {
  /** Extremo inferior del rango (clampeado a 0). */
  low: number;
  /** Extremo superior del rango (clampeado a 100). */
  high: number;
  /** Categoría verbal para el reclutador. */
  category: "Alto" | "Medio" | "Bajo";
  /** Modificador CSS para .score-band__category--{modifier}. */
  categoryModifier: "high" | "mid" | "low";
  /** Texto del rango para mostrar al usuario: "58–70". */
  rangeText: string;
  /** Posición izquierda de la zona de incertidumbre en el track (en %). */
  uncertaintyLeft: string;
  /** Ancho de la zona de incertidumbre en el track (en %). */
  uncertaintyWidth: string;
};

// SEM proxy de 10 puntos: sustituye al SEM real por dominio mientras no se
// tenga suficiente N para calcularlo desde la fiabilidad (α de Cronbach).
// ver docs/SCORING.md §6 — PROVISIONAL (requiere datos).
const SEM_PROXY = 10;

// Cortes de categoría. ver docs/SCORING.md §6
// PROVISIONAL — sin calibrar (requiere datos con percentiles normativos reales).
const CATEGORY_HIGH_THRESHOLD = 60; // value >= umbral → "Alto"
const CATEGORY_LOW_THRESHOLD = 40;  // value <= umbral → "Bajo"

/**
 * Calcula la banda de incertidumbre y la categoría verbal para un puntaje 0–100.
 *
 * @param value - Valor del puntaje (0–100).
 * @param sem   - Error estándar de medición. Defaults a 10 (proxy C4) hasta que C5
 *               entregue el SEM real por constructo.
 */
export function scoreBand(value: number, sem: number = SEM_PROXY): ScoreBandResult {
  const low = Math.max(0, Math.round(value - sem));
  const high = Math.min(100, Math.round(value + sem));

  // ver docs/SCORING.md §6 — CATEGORY_HIGH_THRESHOLD, CATEGORY_LOW_THRESHOLD
  const category: "Alto" | "Medio" | "Bajo" =
    value >= CATEGORY_HIGH_THRESHOLD ? "Alto" : value <= CATEGORY_LOW_THRESHOLD ? "Bajo" : "Medio";

  const categoryModifier: "high" | "mid" | "low" =
    value >= CATEGORY_HIGH_THRESHOLD ? "high" : value <= CATEGORY_LOW_THRESHOLD ? "low" : "mid";

  const rangeText = `${low}–${high}`; // U+2013 en dash

  // IMP-1 — posición y ancho de la zona de incertidumbre derivados de los valores YA
  // redondeados (low / high), de modo que el texto "rangeText" y la banda visual
  // siempre muestren exactamente el mismo rango. Antes usaban value±sem sin redondear,
  // lo que producía ligeras discrepancias (ej. "54%–74%" vs texto "54–74").
  const uncertaintyLeft = `${low}%`;
  const uncertaintyWidth = `${high - low}%`;

  return { low, high, category, categoryModifier, rangeText, uncertaintyLeft, uncertaintyWidth };
}
