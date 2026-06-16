// MeasurementReference.tsx — Ficha oficial de medición (admin).
// Resume, para cada prueba, el constructo, paradigma de origen, lectura alto/bajo,
// nº de ítems, fuente y una nota de cautela. Defendible y honesto: medición
// conductual/autoinforme, no diagnóstico, sin validez de criterio sin datos de desempeño.

import { useEffect, useRef } from "react";
import { assessmentCatalog } from "../../data/assessmentCatalog";
import { bigFiveDomains } from "../../data/bigfive";

export function MeasurementReference({ onClose }: { onClose: () => void }) {
  const cardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const card = cardRef.current;
    const prevFocus = document.activeElement as HTMLElement | null;
    const focusables = () =>
      card
        ? Array.from(card.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')).filter(
            (el) => !el.hasAttribute("disabled")
          )
        : [];
    focusables()[0]?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      prevFocus?.focus();
    };
  }, [onClose]);

  return (
    <div className="measref-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="measref-title">
      <div className="measref-card" ref={cardRef} onClick={(event) => event.stopPropagation()}>
        <button className="graph-help-close" onClick={onClose} aria-label="Cerrar">×</button>
        <p className="eyebrow">Ficha de medición</p>
        <h2 id="measref-title">Qué mide cada prueba</h2>
        <p className="muted-copy">Información de referencia para el reclutador. Todo es medición conductual o de autoinforme: <strong>no es diagnóstico clínico</strong> y no constituye validez de criterio sin datos de desempeño.</p>

        <div className="measref-list">
          {assessmentCatalog.map((meta) => (
            <section className="measref-item" key={meta.key}>
              <div className="measref-item-head">
                <h3>{meta.name}</h3>
                <span className="measref-tag">{meta.construct}</span>
              </div>
              <dl>
                <div><dt>Paradigma</dt><dd>{meta.paradigm}</dd></div>
                <div><dt>Puntuación alta</dt><dd>{meta.highMeans}</dd></div>
                <div><dt>Puntuación baja</dt><dd>{meta.lowMeans}</dd></div>
                <div><dt>Ítems</dt><dd>{meta.items}</dd></div>
                <div><dt>Fuente</dt><dd>{meta.source}</dd></div>
              </dl>
              {meta.key === "personality" && (
                <div className="measref-domains">
                  {bigFiveDomains.map((domain) => (
                    <div key={domain.key} className="measref-domain">
                      <strong style={{ color: domain.color }}>{domain.name}</strong>
                      <span>{domain.description}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>

        <p className="measref-caution">⚠ Nota de cautela: estos resultados describen estilo y desempeño en condiciones de prueba. No deben usarse como criterio único de selección ni interpretarse como diagnóstico. Su valor predictivo solo puede afirmarse tras un estudio de validación con datos reales de desempeño.</p>
      </div>
    </div>
  );
}
