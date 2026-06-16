import React, { useCallback, useEffect, useRef, useState } from "react";
import "./OpsQueue.css";

// ─── Tipos ──────────────────────────────────────────────────────────────────

type Ticket = { title: string; urgency: number; impact: number; effort: number };

export type OpsChoiceResult = {
  round: number;
  choice: number;
  best: number;
  optimal: boolean;
  urgency: number;
  impact: number;
  effort: number;
};

export type OpsQueueProps = {
  practice?: boolean;
  onComplete: (events: OpsChoiceResult[]) => void;
  onContinue: () => void;
};

// ─── Rondas ──────────────────────────────────────────────────────────────────

const ALL_ROUNDS: Ticket[][] = [
  [
    { title: "Cliente estratégico bloqueado", urgency: 4, impact: 5, effort: 3 },
    { title: "Reporte interno atrasado", urgency: 5, impact: 2, effort: 2 },
    { title: "Bug visible, poco frecuente", urgency: 3, impact: 3, effort: 1 },
  ],
  [
    { title: "Equipo espera definición", urgency: 5, impact: 4, effort: 2 },
    { title: "Nueva idea de crecimiento", urgency: 1, impact: 5, effort: 4 },
    { title: "Solicitud repetida de soporte", urgency: 4, impact: 2, effort: 1 },
  ],
  [
    { title: "Riesgo legal emergente", urgency: 4, impact: 5, effort: 4 },
    { title: "Optimización de dashboard", urgency: 2, impact: 3, effort: 2 },
    { title: "Alerta de datos inconsistentes", urgency: 5, impact: 4, effort: 3 },
  ],
  [
    { title: "Decisión de roadmap", urgency: 3, impact: 5, effort: 2 },
    { title: "Mensaje público sensible", urgency: 5, impact: 3, effort: 1 },
    { title: "Automatización interna", urgency: 2, impact: 4, effort: 4 },
  ],
];

const ticketValue = (t: Ticket) => t.impact * 2 + t.urgency - t.effort * 0.8;
const bestIndex = (round: Ticket[]) => {
  const values = round.map(ticketValue);
  return values.indexOf(Math.max(...values));
};

// ─── Sub-componentes ──────────────────────────────────────────────────────────

const Pips: React.FC<{ value: number; tone: string }> = ({ value, tone }) => (
  <span className="oq-pips" aria-hidden="true">
    {Array.from({ length: 5 }, (_, i) => (
      <span key={i} className={`oq-pip ${i < value ? "oq-pip--on" : ""}`} style={i < value ? { background: tone } : undefined} />
    ))}
  </span>
);

const urgencyTone = (u: number) => (u >= 5 ? "#e05c5c" : u >= 4 ? "#e8a94a" : "#5cb88a");

// ─── Resultados ────────────────────────────────────────────────────────────────

const Results: React.FC<{ events: OpsChoiceResult[]; onContinue: () => void }> = ({ events, onContinue }) => {
  const optimal = events.filter(e => e.optimal).length;
  const rate = events.length ? Math.round(optimal / events.length * 100) : 0;
  const band =
    rate >= 75 ? { t: "Priorización certera", c: "oq-good" } :
    rate >= 50 ? { t: "Priorización sólida", c: "oq-mid" } :
    { t: "Priorización a afinar", c: "oq-warn" };
  return (
    <div className="oq-results">
      <div className="oq-results-header">
        <span className="oq-eyebrow">Ops Queue</span>
        <h2 className="oq-results-title">Bandeja despejada</h2>
      </div>
      <div className="oq-score-ring-wrap" aria-label={`Decisiones óptimas: ${rate}%`}>
        <svg viewBox="0 0 120 120" className="oq-ring-svg">
          <circle cx="60" cy="60" r="50" fill="none" stroke="var(--oq-surface)" strokeWidth="8" />
          <circle cx="60" cy="60" r="50" fill="none" stroke="var(--oq-signal)" strokeWidth="8"
            strokeDasharray={`${(rate / 100) * 314} 314`} strokeLinecap="round" transform="rotate(-90 60 60)" className="oq-ring-arc" />
        </svg>
        <div className="oq-ring-inner">
          <span className="oq-ring-value">{rate}<span className="oq-ring-pct">%</span></span>
          <span className="oq-ring-label">óptimas</span>
        </div>
      </div>
      <div className={`oq-band ${band.c}`}>{band.t}</div>
      <p className="oq-results-note">{optimal} de {events.length} tickets priorizados con el mejor balance impacto/urgencia/esfuerzo.</p>
      <button className="oq-continue-btn" onClick={onContinue}>Continuar</button>
    </div>
  );
};

// ─── Intro ──────────────────────────────────────────────────────────────────

const Intro: React.FC<{ onStart: () => void }> = ({ onStart }) => (
  <div className="oq-intro">
    <span className="oq-eyebrow">Ops Queue · priorización</span>
    <h2 className="oq-intro-title">Despeja la bandeja con criterio</h2>
    <p className="oq-intro-desc">
      Cada ronda llegan tres tickets. Elige el que mejor equilibra <strong>impacto</strong> alto,
      <strong> urgencia</strong> real y <strong>esfuerzo</strong> razonable. Solo puedes atender uno.
    </p>
    <div className="oq-legend">
      <span><i style={{ background: "#6aa8ff" }} /> Impacto</span>
      <span><i style={{ background: "#e8a94a" }} /> Urgencia</span>
      <span><i style={{ background: "#7a9898" }} /> Esfuerzo</span>
    </div>
    <button className="oq-start-btn" onClick={onStart} autoFocus>Comenzar</button>
  </div>
);

// ─── Componente principal ──────────────────────────────────────────────────────

const OpsQueue: React.FC<OpsQueueProps> = ({ practice = false, onComplete, onContinue }) => {
  type Screen = "intro" | "playing" | "results";
  const ROUNDS = practice ? ALL_ROUNDS.slice(0, 1) : ALL_ROUNDS;
  const [screen, setScreen] = useState<Screen>("intro");
  const [round, setRound] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);

  const eventsRef = useRef<OpsChoiceResult[]>([]);
  const timersRef = useRef<number[]>([]);
  const later = (fn: () => void, ms: number) => { timersRef.current.push(window.setTimeout(fn, ms)); };
  useEffect(() => () => { timersRef.current.forEach(t => window.clearTimeout(t)); }, []);

  const start = useCallback(() => {
    eventsRef.current = [];
    setRound(0);
    setPicked(null);
    setScreen("playing");
  }, []);

  const choose = useCallback((index: number) => {
    if (picked !== null) return;
    const tickets = ROUNDS[round];
    const best = bestIndex(tickets);
    const t = tickets[index];
    setPicked(index);
    eventsRef.current = [...eventsRef.current, {
      round, choice: index, best, optimal: index === best,
      urgency: t.urgency, impact: t.impact, effort: t.effort,
    }];

    const next = round + 1;
    later(() => {
      if (next >= ROUNDS.length) {
        setScreen("results");
        onComplete(eventsRef.current);
      } else {
        setRound(next);
        setPicked(null);
      }
    }, 1250);
  }, [picked, round, onComplete]);

  const tickets = ROUNDS[round];
  const best = picked !== null ? bestIndex(tickets) : -1;

  return (
    <div className="oq-root">
      <div className="oq-header">
        <span className="oq-eyebrow">Ops Queue</span>
        {screen === "playing" && (
          <div className="oq-pips-rounds" aria-label={`Ronda ${round + 1} de ${ROUNDS.length}`}>
            {ROUNDS.map((_, i) => (
              <span key={i} className={`oq-round-pip ${i < round ? "oq-round-pip--done" : ""} ${i === round ? "oq-round-pip--active" : ""}`} />
            ))}
          </div>
        )}
      </div>

      {screen === "intro" && <Intro onStart={start} />}

      {screen === "playing" && (
        <div className="oq-arena">
          <p className="oq-turn-label">Ronda {round + 1} de {ROUNDS.length} — ¿qué atiendes primero?</p>
          <div className="oq-grid">
            {tickets.map((t, i) => {
              const state =
                picked === null ? "" :
                i === best ? "oq-ticket--best" :
                i === picked ? "oq-ticket--picked-wrong" : "oq-ticket--dim";
              return (
                <button
                  key={t.title}
                  className={`oq-ticket ${state}`}
                  style={{ animationDelay: `${i * 0.07}s` }}
                  onClick={() => choose(i)}
                  disabled={picked !== null}
                  aria-label={`${t.title}. Impacto ${t.impact} de 5, urgencia ${t.urgency} de 5, esfuerzo ${t.effort} de 5`}
                >
                  <div className="oq-ticket-head">
                    <span className="oq-urgency-badge" style={{ color: urgencyTone(t.urgency), borderColor: urgencyTone(t.urgency) }}>
                      {t.urgency >= 5 ? "Crítico" : t.urgency >= 4 ? "Urgente" : "Normal"}
                    </span>
                    {picked !== null && i === best && <span className="oq-best-tag">óptimo ✓</span>}
                  </div>
                  <h3 className="oq-ticket-title">{t.title}</h3>
                  <div className="oq-metric"><span>Impacto</span><Pips value={t.impact} tone="#6aa8ff" /></div>
                  <div className="oq-metric"><span>Urgencia</span><Pips value={t.urgency} tone="#e8a94a" /></div>
                  <div className="oq-metric"><span>Esfuerzo</span><Pips value={t.effort} tone="#7a9898" /></div>
                </button>
              );
            })}
          </div>
          {picked !== null && (
            <div className={`oq-verdict ${picked === best ? "oq-verdict--ok" : "oq-verdict--miss"}`} aria-live="polite">
              {picked === best ? "✓ Mejor balance de la ronda" : "Había una opción con mejor balance"}
            </div>
          )}
        </div>
      )}

      {screen === "results" && <Results events={eventsRef.current} onContinue={onContinue} />}
    </div>
  );
};

export default OpsQueue;
