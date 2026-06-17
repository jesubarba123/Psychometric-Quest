import React, { useCallback, useEffect, useRef, useState } from "react";
import "./Switchboard.css";

// ─── Tipos ──────────────────────────────────────────────────────────────────

export type SwitchTrialResult = {
  trial: number;
  secondRule: boolean;
  choice: "left" | "right";
  correct: "left" | "right";
  ok: boolean;
  rt: number;
};

export type SwitchboardProps = {
  practice?: boolean;
  onComplete: (events: SwitchTrialResult[]) => void;
  onContinue: () => void;
};

// ─── Secuencia de ensayos (forma, color) ─────────────────────────────────────
// Primera mitad → regla COLOR · segunda mitad → regla FORMA

type Shape = "circle" | "diamond";
type Color = "teal" | "ochre";

const FULL_TRIALS: Array<[Shape, Color]> = [
  ["circle", "teal"], ["diamond", "teal"], ["circle", "ochre"], ["diamond", "ochre"],
  ["circle", "teal"], ["diamond", "ochre"], ["diamond", "teal"], ["circle", "ochre"],
  ["circle", "teal"], ["diamond", "teal"], ["circle", "ochre"], ["diamond", "ochre"],
];
const PRACTICE_TRIALS: Array<[Shape, Color]> = FULL_TRIALS.slice(0, 4);

function correctSide(trial: number, shape: Shape, color: Color, switchAt: number): "left" | "right" {
  const secondRule = trial >= switchAt;
  return secondRule
    ? (shape === "circle" ? "left" : "right")
    : (color === "teal" ? "left" : "right");
}

// ─── Pantalla intro ────────────────────────────────────────────────────────────

const Intro: React.FC<{ onStart: () => void }> = ({ onStart }) => (
  <div className="sw-intro">
    <span className="sw-eyebrow">Switchboard · flexibilidad</span>
    <h2 className="sw-intro-title">Clasifica… hasta que la regla cambie</h2>
    <p className="sw-intro-desc">
      Verás una figura con color. Al principio clasificas por <strong>color</strong>.
      A mitad del juego la regla cambiará a <strong>forma</strong> sin aviso previo: adáptate rápido.
    </p>
    <div className="sw-legend-rule" aria-hidden="true">
      <div><span className="sw-glyph sw-glyph--teal sw-glyph--circle" /> Verde / Círculo → izquierda</div>
      <div><span className="sw-glyph sw-glyph--ochre sw-glyph--diamond" /> Ocre / Diamante → derecha</div>
    </div>
    <button className="sw-start-btn" onClick={onStart} autoFocus>Comenzar</button>
  </div>
);

// ─── Resultados ────────────────────────────────────────────────────────────────

const Results: React.FC<{ events: SwitchTrialResult[]; onContinue: () => void }> = ({ events, onContinue }) => {
  const pre = events.filter(e => !e.secondRule);
  const post = events.filter(e => e.secondRule);
  const acc = (arr: SwitchTrialResult[]) => arr.length ? Math.round(arr.filter(e => e.ok).length / arr.length * 100) : 0;
  const meanRt = (arr: SwitchTrialResult[]) => {
    const r = arr.filter(e => e.ok).map(e => e.rt);
    return r.length ? Math.round(r.reduce((a, b) => a + b, 0) / r.length) : 0;
  };
  const switchCost = Math.max(0, meanRt(post) - meanRt(pre));
  const flexLabel =
    acc(post) >= 80 && switchCost < 250 ? { t: "Adaptación ágil", c: "sw-good" } :
    acc(post) >= 60 ? { t: "Adaptación media", c: "sw-mid" } :
    { t: "Adaptación costosa", c: "sw-warn" };

  return (
    <div className="sw-results">
      <div className="sw-results-header">
        <span className="sw-eyebrow">Switchboard</span>
        <h2 className="sw-results-title">Tablero completo</h2>
      </div>
      <div className={`sw-band ${flexLabel.c}`}>{flexLabel.t}</div>
      <div className="sw-results-grid">
        <div className="sw-stat-card"><span className="sw-stat-val sw-good">{acc(pre)}%</span><span className="sw-stat-lbl">Precisión regla color</span></div>
        <div className="sw-stat-card"><span className="sw-stat-val">{acc(post)}%</span><span className="sw-stat-lbl">Precisión tras el cambio</span></div>
        <div className="sw-stat-card"><span className="sw-stat-val">{meanRt(pre)}<span className="sw-stat-unit">ms</span></span><span className="sw-stat-lbl">TR antes</span></div>
        <div className="sw-stat-card"><span className={`sw-stat-val ${switchCost > 250 ? "sw-warn" : "sw-mid"}`}>+{switchCost}<span className="sw-stat-unit">ms</span></span><span className="sw-stat-lbl">Costo de cambio</span></div>
      </div>
      <button className="sw-continue-btn" onClick={onContinue}>Continuar</button>
    </div>
  );
};

// ─── Componente principal ──────────────────────────────────────────────────────

const Switchboard: React.FC<SwitchboardProps> = ({ practice = false, onComplete, onContinue }) => {
  type Screen = "intro" | "playing" | "switching" | "results";
  const TRIALS = practice ? PRACTICE_TRIALS : FULL_TRIALS;
  const SWITCH_AT = practice ? Infinity : FULL_TRIALS.length / 2;
  const [screen, setScreen] = useState<Screen>("intro");
  const [trial, setTrial] = useState(0);
  const [feedback, setFeedback] = useState<"ok" | "wrong" | null>(null);
  const [streak, setStreak] = useState(0);
  const [cardKey, setCardKey] = useState(0);

  const eventsRef = useRef<SwitchTrialResult[]>([]);
  // C-4 — fuente única del índice de ensayo: trialRef refleja el mismo valor que
  // se renderiza (TRIALS[trial]), de modo que el scoring puntúa la figura mostrada.
  const trialRef = useRef(0);
  const startRef = useRef(0);
  const lockRef = useRef(false);
  const timersRef = useRef<number[]>([]);
  const later = (fn: () => void, ms: number) => { timersRef.current.push(window.setTimeout(fn, ms)); };
  useEffect(() => () => { timersRef.current.forEach(t => window.clearTimeout(t)); }, []);

  const [shape, color] = TRIALS[Math.min(trial, TRIALS.length - 1)];
  const secondRule = trial >= SWITCH_AT;

  const beginTrial = useCallback((index: number) => {
    setTrial(index);
    trialRef.current = index;
    setCardKey(k => k + 1);
    startRef.current = performance.now();
    lockRef.current = false;
  }, []);

  const start = useCallback(() => {
    eventsRef.current = [];
    setStreak(0);
    setScreen("playing");
    beginTrial(0);
  }, [beginTrial]);

  const answer = useCallback((choice: "left" | "right") => {
    if (screen !== "playing" || lockRef.current) return;
    lockRef.current = true;
    const idx = trialRef.current;   // C-4: misma fuente que el render
    const [sh, co] = TRIALS[idx];
    const correct = correctSide(idx, sh, co, SWITCH_AT);
    const ok = choice === correct;
    const rt = Math.round(performance.now() - startRef.current);
    eventsRef.current = [...eventsRef.current, { trial: idx, secondRule: idx >= SWITCH_AT, choice, correct, ok, rt }];

    setFeedback(ok ? "ok" : "wrong");
    setStreak(s => (ok ? s + 1 : 0));
    later(() => setFeedback(null), 320);

    const next = idx + 1;
    if (next >= TRIALS.length) {
      later(() => { setScreen("results"); onComplete(eventsRef.current); }, 420);
    } else if (next === SWITCH_AT) {
      // momento del cambio de regla — transición dramática
      later(() => setScreen("switching"), 420);
      later(() => { setScreen("playing"); beginTrial(next); }, 1900);
    } else {
      later(() => beginTrial(next), 420);
    }
  }, [screen, onComplete, beginTrial]);

  // Teclado ← →
  useEffect(() => {
    if (screen !== "playing") return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") { e.preventDefault(); answer("left"); }
      if (e.key === "ArrowRight") { e.preventDefault(); answer("right"); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [screen, answer]);

  const leftLabel = secondRule ? "Círculo" : "Verde";
  const rightLabel = secondRule ? "Diamante" : "Ocre";
  const answered = eventsRef.current.length;

  return (
    <div className="sw-root">
      <div className="sw-header">
        <span className="sw-eyebrow">Switchboard</span>
        <div className="sw-header-right">
          {streak >= 2 && <span className="sw-streak">🔥 {streak}</span>}
          <div className="sw-pips" aria-label={`Ensayo ${answered} de ${TRIALS.length}`}>
            {TRIALS.map((_, i) => (
              <span key={i} className={`sw-pip ${i < answered ? "sw-pip--done" : ""} ${i === answered && screen === "playing" ? "sw-pip--active" : ""}`} />
            ))}
          </div>
        </div>
      </div>

      {screen === "intro" && <Intro onStart={start} />}

      {screen === "switching" && (
        <div className="sw-switch-banner" role="alert">
          <span className="sw-switch-flash">¡La regla cambió!</span>
          <p>Ahora clasifica por <strong>FORMA</strong></p>
          <div className="sw-switch-hint">
            <span><span className="sw-glyph sw-glyph--circle sw-glyph--neutral" /> Círculo → izquierda</span>
            <span><span className="sw-glyph sw-glyph--diamond sw-glyph--neutral" /> Diamante → derecha</span>
          </div>
        </div>
      )}

      {screen === "playing" && (
        <div className={`sw-arena ${feedback ? `sw-arena--${feedback}` : ""}`}>
          <div className={`sw-rule-banner ${secondRule ? "sw-rule-banner--shape" : "sw-rule-banner--color"}`}>
            <span className="sw-rule-eyebrow">Regla activa</span>
            <strong>{secondRule ? "Ordena por FORMA" : "Ordena por COLOR"}</strong>
          </div>

          <div className="sw-stage">
            <div
              key={cardKey}
              className={`sw-glyph-big sw-glyph--${shape} sw-glyph--${color}`}
              aria-label={`Figura: ${shape === "circle" ? "círculo" : "diamante"} ${color === "teal" ? "verde" : "ocre"}`}
            >
              <span>{shape === "circle" ? "●" : "◆"}</span>
            </div>
            {feedback && (
              <div className={`sw-feedback sw-feedback--${feedback}`} aria-live="assertive">
                {feedback === "ok" ? "✓" : "✗"}
              </div>
            )}
          </div>

          <div className="sw-answers">
            <button className="sw-answer sw-answer--left" onClick={() => answer("left")}>
              <kbd>←</kbd> {leftLabel}
            </button>
            <button className="sw-answer sw-answer--right" onClick={() => answer("right")}>
              {rightLabel} <kbd>→</kbd>
            </button>
          </div>
        </div>
      )}

      {screen === "results" && <Results events={eventsRef.current} onContinue={onContinue} />}
    </div>
  );
};

export default Switchboard;
