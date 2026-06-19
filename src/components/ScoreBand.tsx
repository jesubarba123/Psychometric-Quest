// ScoreBand.tsx — Patrón "puntaje con incertidumbre" (C4).
//
// Spec: docs/design/score-uncertainty.md
//
// Implementa los 4 estados:
//   1. Interpretable con banda (value definido, interpretable !== false)
//   2. No interpretable (interpretable === false)
//   3. Parcial (isPartial === true) — puede coexistir con estado 1 o 2
//   4. Sin dato (value === null | undefined)
//
// Accesibilidad (§8 del spec):
//   - role="group" + aria-label en prosa por cada fila
//   - track, banda y categoría llevan aria-hidden="true" (redundantes con el label)
//   - Ningún estado depende solo del color
//
// TODO C5: cuando el psicometrista entregue el SEM real por constructo,
//          bastará pasar `sem={semValue}` al componente. Sin tocar el resto de la UI.

import { scoreBand } from "../utils/scoreBand";

export type ScoreBandProps = {
  /** Etiqueta del dominio/métrica (p.ej. "Apertura", "Adaptabilidad"). */
  label: string;
  /** Valor del puntaje (0–100). null/undefined → estado 4 (sin dato). */
  value: number | null | undefined;
  /** Error estándar de medición. Default: 10 (proxy C4 hasta que C5 lo entregue). */
  sem?: number;
  /** false → estado 2 (no interpretable por fiabilidad insuficiente). */
  interpretable?: boolean;
  /** true → estado 3 (dominio parcial: faltan ítems). Puede coexistir con 1 o 2. */
  isPartial?: boolean;
};

export function ScoreBand({ label, value, sem, interpretable, isPartial }: ScoreBandProps) {
  const hasValue = value !== null && value !== undefined;
  const isNotInterpretable = interpretable === false;
  const isNoData = !hasValue;

  // Calcular banda solo cuando hay valor
  const band = hasValue ? scoreBand(value, sem) : null;

  // Construir aria-label según estado (spec §8.2)
  let ariaLabel: string;
  if (isNoData) {
    ariaLabel = `${label}: sin dato`;
  } else if (isNotInterpretable && isPartial) {
    ariaLabel = `${label}: resultado no interpretable. Dominio con ítems sin responder.`;
  } else if (isNotInterpretable) {
    ariaLabel = `${label}: resultado no interpretable por fiabilidad insuficiente`;
  } else if (isPartial && band) {
    ariaLabel = `${label}: rango ${band.low} a ${band.high}, nivel ${band.category}. Dominio con ítems sin responder: interpretar con precaución`;
  } else if (band) {
    ariaLabel = `${label}: rango ${band.low} a ${band.high}, nivel ${band.category}`;
  } else {
    ariaLabel = `${label}: sin dato`;
  }

  // Clases del contenedor
  const containerClasses = [
    "score-band",
    isPartial ? "score-band--partial" : "",
    isNoData || isNotInterpretable ? "score-band--no-data" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={containerClasses} role="group" aria-label={ariaLabel}>
      <span className="score-band__label">{label}</span>

      <div className="score-band__track" aria-hidden="true">
        {/* Estado 1 y 3 (interpretable con banda): fill + zona de incertidumbre */}
        {hasValue && !isNotInterpretable && band && (
          <>
            <i className="score-band__fill" style={{ width: `${value}%` }} />
            <span
              className="score-band__uncertainty"
              style={{ left: band.uncertaintyLeft, width: band.uncertaintyWidth }}
            />
          </>
        )}
        {/* Estado 2 y 4: track intencionalmente vacío */}
      </div>

      <div className="score-band__value-group">
        {/* Estado 4 — sin dato */}
        {isNoData && (
          <span className="score-band__value">&mdash;</span>
        )}

        {/* Estado 2 — no interpretable (con dato pero fiabilidad insuficiente) */}
        {!isNoData && isNotInterpretable && (
          <>
            <span className="score-band__value" aria-hidden="true">&mdash;</span>
            <span className="reliability-badge reliability-badge--low">No interpretable</span>
          </>
        )}

        {/* Estado 1 y 3 — interpretable con banda */}
        {!isNoData && !isNotInterpretable && band && (
          <>
            <span className="score-band__value">
              {band.rangeText}
              {isPartial && (
                <sup className="bf-partial-marker" aria-hidden="true">*</sup>
              )}
            </span>
            <span
              className={`score-band__category score-band__category--${band.categoryModifier}`}
              aria-hidden="true"
            >
              {band.category}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
