// ReliabilitySection.tsx — Sección de fiabilidad Big Five para el panel admin (C2).
//
// Muestra α de Cronbach, N y badge "no interpretable" por dominio.
// Reutiliza tokens CSS del sistema de diseño (--green, --amber, --red, --muted,
// --line, --surface, --ink). Sin colores hardcodeados.

import { useMemo } from "react";
import { bigFiveDomains } from "../../data/bigfive";
import { bigFiveDomainAlphas, type DomainReliability } from "../../utils/reliability";
import type { Candidate } from "../../types";
import type { BigFiveDomainKey } from "../../data/bigfive";

interface ReliabilitySectionProps {
  candidates: Candidate[];
}

/** Badge que indica si el dominio es interpretable o no. */
function InterpretabilityBadge({ interpretable }: { interpretable: boolean }) {
  if (interpretable) {
    return (
      <span className="reliability-badge reliability-badge--ok" aria-label="Interpretable">
        Interpretable
      </span>
    );
  }
  return (
    <span className="reliability-badge reliability-badge--low" aria-label="No interpretable">
      No interpretable
    </span>
  );
}

/** Una fila de dominio con α, N y badge. */
function DomainRow({
  domainKey,
  domainName,
  domainColor,
  reliability,
}: {
  domainKey: BigFiveDomainKey;
  domainName: string;
  domainColor: string;
  reliability: DomainReliability;
}) {
  const alphaDisplay =
    reliability.alpha !== null ? reliability.alpha.toFixed(2) : "—";

  return (
    <div className="reliability-row" key={domainKey}>
      <span
        className="reliability-domain-name"
        style={{ color: domainColor }}
        aria-label={`Dominio ${domainName}`}
      >
        {domainName}
      </span>
      <dl className="reliability-stats">
        <div>
          <dt>α</dt>
          <dd
            className={
              reliability.alpha === null
                ? "reliability-alpha--null"
                : reliability.alpha >= 0.8
                ? "reliability-alpha--good"
                : reliability.alpha >= 0.6
                ? "reliability-alpha--ok"
                : "reliability-alpha--low"
            }
            aria-label={`Alpha de Cronbach: ${alphaDisplay}`}
          >
            {alphaDisplay}
          </dd>
        </div>
        <div>
          <dt>N</dt>
          <dd
            className={
              reliability.n >= 10 ? "reliability-n--ok" : "reliability-n--low"
            }
            aria-label={`Número de respondientes: ${reliability.n}`}
          >
            {reliability.n}
          </dd>
        </div>
      </dl>
      <InterpretabilityBadge interpretable={reliability.interpretable} />
    </div>
  );
}

/**
 * ReliabilitySection — lista α + N + badge por dominio Big Five.
 *
 * Diseñada para incrustarse en MeasurementReference o en el panel admin.
 * El N mostrado es honesto: solo cuenta candidatos con respuestas completas
 * para ese dominio.
 */
export function ReliabilitySection({ candidates }: ReliabilitySectionProps) {
  const alphas = useMemo(() => bigFiveDomainAlphas(candidates), [candidates]);

  const totalWithAnswers = candidates.filter((c) => c.surveyAnswers && Object.keys(c.surveyAnswers).length > 0).length;

  return (
    <section className="reliability-section" aria-labelledby="reliability-title">
      <h3 id="reliability-title" className="reliability-title">
        Fiabilidad Big Five (α de Cronbach)
      </h3>
      <p className="muted-copy reliability-intro">
        Consistencia interna del cuestionario IPIP-50 sobre la muestra actual.
        Se calcula a nivel de pool (no por individuo). Umbral mínimo: α ≥ 0.60 y N ≥ 10.
        {totalWithAnswers > 0 && (
          <> Candidatos con cuestionario completo en algún dominio: <strong>{totalWithAnswers}</strong>.</>
        )}
      </p>

      {totalWithAnswers === 0 ? (
        <div className="reliability-empty">
          Aún no hay candidatos con cuestionario Big Five respondido.
          Los coeficientes aparecerán cuando haya al menos 2 respondientes por dominio.
        </div>
      ) : (
        <div className="reliability-table" role="table" aria-label="Fiabilidad por dominio Big Five">
          <div className="reliability-table-head" role="row" aria-hidden="true">
            <span>Dominio</span>
            <span>α</span>
            <span>N</span>
            <span>Estado</span>
          </div>
          {bigFiveDomains.map((domain) => (
            <DomainRow
              key={domain.key}
              domainKey={domain.key}
              domainName={domain.name}
              domainColor={domain.color}
              reliability={alphas[domain.key]}
            />
          ))}
        </div>
      )}

      <p className="reliability-note">
        Con N pequeño ({"<"}10) el coeficiente α es inestable y su IC es amplio;
        no debe interpretarse como indicativo de la fiabilidad real del instrumento.
        El IPIP-50 tiene α &gt; 0.80 en muestras grandes (Goldberg, 1999).
      </p>
    </section>
  );
}
