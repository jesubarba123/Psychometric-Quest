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

const SEM_PROXY = 10;

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

  const category: "Alto" | "Medio" | "Bajo" =
    value >= 60 ? "Alto" : value <= 40 ? "Bajo" : "Medio";

  const categoryModifier: "high" | "mid" | "low" =
    value >= 60 ? "high" : value <= 40 ? "low" : "mid";

  const rangeText = `${low}–${high}`; // U+2013 en dash

  // Posición y ancho de la zona de incertidumbre en el track
  const leftRaw = Math.max(0, value - sem);
  const rightRaw = Math.min(100, value + sem);
  const uncertaintyLeft = `${leftRaw}%`;
  const uncertaintyWidth = `${rightRaw - leftRaw}%`;

  return { low, high, category, categoryModifier, rangeText, uncertaintyLeft, uncertaintyWidth };
}
