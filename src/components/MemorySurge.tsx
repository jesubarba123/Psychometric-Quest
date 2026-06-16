import React, { useCallback, useEffect, useRef, useState } from "react";
import { AURORA } from "../utils/palette";
import "./MemorySurge.css";

// ─── Tipos ──────────────────────────────────────────────────────────────────

export type MemoryEvent =
  | { type: "hit"; rt: number; step: number }
  | { type: "miss"; step: number }
  | { type: "false_alarm"; step: number }
  | { type: "correct_reject"; step: number };

export type MemorySurgeResult = {
  hits: number;
  misses: number;
  falseAlarms: number;
  correctRejections: number;
  meanRt: number;
  workingMemoryScore: number; // 0-100
};

export type MemorySurgeProps = {
  practice?: boolean;
  onComplete: (result: MemorySurgeResult, events: MemoryEvent[]) => void;
  onContinue: () => void;
};

// ─── Constantes ──────────────────────────────────────────────────────────────

const N_BACK = 2;
const FULL_STEPS = 18;           // 16 puntuables (índices ≥ 2)
const PRACTICE_STEPS = 6;
const MATCH_RATIO = 0.38;        // ~6 coincidencias
const STEP_SHOW_MS = 1350;       // ventana de respuesta
const STEP_GAP_MS = 480;

type Glyph = { sym: string; color: string; name: string };
// Glifos distractores para N-back: 6 colores perceptualmente distintos, todos
// dentro de la paleta aurora (el 6º usa ink claro en vez del lila fuera de sistema).
const GLYPHS: Glyph[] = [
  { sym: "◆", color: AURORA.blue, name: "rombo" },
  { sym: "●", color: AURORA.signal, name: "círculo" },
  { sym: "▲", color: AURORA.amber, name: "triángulo" },
  { sym: "■", color: "#d8e8e4", name: "cuadro" },
  { sym: "★", color: AURORA.green, name: "estrella" },
  { sym: "⬟", color: AURORA.red, name: "pentágono" },
];

function buildSequence(len: number): number[] {
  const seq: number[] = [];
  for (let i = 0; i < len; i++) {
    if (i >= N_BACK && Math.random() < MATCH_RATIO) {
      seq.push(seq[i - N_BACK]);
    } else {
      let g = Math.floor(Math.random() * GLYPHS.length);
      // evita coincidencia accidental con el N-back
      while (i >= N_BACK && g === seq[i - N_BACK]) g = Math.floor(Math.random() * GLYPHS.length);
      seq.push(g);
    }
  }
  return seq;
}

function computeResult(events: MemoryEvent[]): MemorySurgeResult {
  const hits = events.filter(e => e.type === "hit").length;
  const misses = events.filter(e => e.type === "miss").length;
  const falseAlarms = events.filter(e => e.type === "false_alarm").length;
  const correctRejections = events.filter(e => e.type === "correct_reject").length;
  const rts = (events.filter(e => e.type === "hit") as Extract<MemoryEvent, { type: "hit" }>[]).map(e => e.rt);
  const meanRt = rts.length ? Math.round(rts.reduce((a, b) => a + b, 0) / rts.length) : 0;

  const totalTargets = hits + misses;
  const totalNonTargets = falseAlarms + correctRejections;
  const hitRate = totalTargets ? hits / totalTargets : 0;
  const faRate = totalNonTargets ? falseAlarms / totalNonTargets : 0;
  const rtScore = meanRt ? Math.max(0, 1 - (meanRt - 350) / 900) : 0.5;

  const workingMemoryScore = Math.round(
    Math.max(0, Math.min(100, hitRate * 58 + (1 - faRate) * 30 + rtScore * 12)),
  );
  return { hits, misses, falseAlarms, correctRejections, meanRt, workingMemoryScore };
}

// ─── Pantalla intro / tutorial ────────────────────────────────────────────────

const Intro: React.FC<{ onStart: () => void }> = ({ onStart }) => (
  <div className="ms-intro">
    <span className="ms-eyebrow">Memory Surge · {N_BACK}-back</span>
    <h2 className="ms-intro-title">Sostén la secuencia en tu mente</h2>
    <p className="ms-intro-desc">
      Verás figuras de una en una. Pulsa <strong>Coincide</strong> (o la tecla espacio) cuando la figura
      actual sea <strong>igual a la de hace {N_BACK} pasos</strong>. Si es distinta, no hagas nada.
    </p>
    <div className="ms-example" aria-hidden="true">
      <div className="ms-example-row">
        <span className="ms-ex-chip" style={{ color: GLYPHS[0].color }}>{GLYPHS[0].sym}</span>
        <span className="ms-ex-chip" style={{ color: GLYPHS[2].color }}>{GLYPHS[2].sym}</span>
        <span className="ms-ex-chip ms-ex-match" style={{ color: GLYPHS[0].color }}>{GLYPHS[0].sym}</span>
      </div>
      <div className="ms-example-caption">
        <span>hace 2</span>
        <span />
        <span className="ms-ex-now">actual = coincide ✓</span>
      </div>
    </div>
    <button className="ms-start-btn" onClick={onStart} autoFocus>Comenzar</button>
  </div>
);

// ─── Pantalla de resultados ────────────────────────────────────────────────────

const Results: React.FC<{ result: MemorySurgeResult; onContinue: () => void }> = ({ result, onContinue }) => {
  const band =
    result.workingMemoryScore >= 70 ? { label: "Memoria sólida", cls: "ms-good" } :
    result.workingMemoryScore >= 45 ? { label: "Memoria media", cls: "ms-mid" } :
    { label: "Memoria variable", cls: "ms-warn" };
  return (
    <div className="ms-results">
      <div className="ms-results-header">
        <span className="ms-eyebrow">Memory Surge</span>
        <h2 className="ms-results-title">Secuencia completa</h2>
      </div>
      <div className="ms-score-ring-wrap" aria-label={`Memoria de trabajo: ${result.workingMemoryScore} de 100`}>
        <svg viewBox="0 0 120 120" className="ms-ring-svg">
          <circle cx="60" cy="60" r="50" fill="none" stroke="var(--ms-surface)" strokeWidth="8" />
          <circle
            cx="60" cy="60" r="50" fill="none" stroke="var(--ms-signal)" strokeWidth="8"
            strokeDasharray={`${(result.workingMemoryScore / 100) * 314} 314`}
            strokeLinecap="round" transform="rotate(-90 60 60)" className="ms-ring-arc"
          />
        </svg>
        <div className="ms-ring-inner">
          <span className="ms-ring-value">{result.workingMemoryScore}</span>
          <span className="ms-ring-label">memoria</span>
        </div>
      </div>
      <div className={`ms-band ${band.cls}`}>{band.label}</div>
      <div className="ms-stats-grid">
        <div className="ms-stat-card"><span className="ms-stat-val ms-good">{result.hits}</span><span className="ms-stat-lbl">Aciertos</span></div>
        <div className="ms-stat-card"><span className="ms-stat-val ms-warn">{result.misses}</span><span className="ms-stat-lbl">Omisiones</span></div>
        <div className="ms-stat-card"><span className="ms-stat-val ms-warn">{result.falseAlarms}</span><span className="ms-stat-lbl">Falsas alarmas</span></div>
        <div className="ms-stat-card"><span className="ms-stat-val">{result.meanRt}<span className="ms-stat-unit">ms</span></span><span className="ms-stat-lbl">TR medio</span></div>
      </div>
      <button className="ms-continue-btn" onClick={onContinue}>Continuar</button>
    </div>
  );
};

// ─── Componente principal ──────────────────────────────────────────────────────

const MemorySurge: React.FC<MemorySurgeProps> = ({ practice = false, onComplete, onContinue }) => {
  type Screen = "intro" | "playing" | "results";
  const TOTAL_STEPS = practice ? PRACTICE_STEPS : FULL_STEPS;
  const [screen, setScreen] = useState<Screen>("intro");
  const [step, setStep] = useState(-1);
  const [showSymbol, setShowSymbol] = useState(false);
  const [feedback, setFeedback] = useState<MemoryEvent["type"] | null>(null);
  const [streak, setStreak] = useState(0);
  const [result, setResult] = useState<MemorySurgeResult | null>(null);

  const seqRef = useRef<number[]>([]);
  const stepRef = useRef(-1);
  const respondedRef = useRef(false);
  const showStartRef = useRef(0);
  const eventsRef = useRef<MemoryEvent[]>([]);
  const timersRef = useRef<number[]>([]);

  const clearTimers = () => { timersRef.current.forEach(t => window.clearTimeout(t)); timersRef.current = []; };
  const later = (fn: () => void, ms: number) => { timersRef.current.push(window.setTimeout(fn, ms)); };

  useEffect(() => () => clearTimers(), []);

  const flash = useCallback((type: MemoryEvent["type"]) => {
    setFeedback(type);
    later(() => setFeedback(null), 360);
  }, []);

  const finish = useCallback((all: MemoryEvent[]) => {
    const res = computeResult(all);
    setResult(res);
    setShowSymbol(false);
    setScreen("results");
    onComplete(res, all);
  }, [onComplete]);

  // Resuelve el paso que termina (si el jugador no respondió) y avanza
  const advance = useCallback((index: number) => {
    if (index >= TOTAL_STEPS) { finish(eventsRef.current); return; }
    stepRef.current = index;
    respondedRef.current = false;
    setStep(index);
    setShowSymbol(true);
    showStartRef.current = performance.now();

    later(() => {
      // cierre de ventana: si no respondió, evalúa omisión / rechazo correcto
      setShowSymbol(false);
      if (!respondedRef.current && index >= N_BACK) {
        const isMatch = seqRef.current[index] === seqRef.current[index - N_BACK];
        if (isMatch) {
          eventsRef.current = [...eventsRef.current, { type: "miss", step: index }];
          setStreak(0);
          flash("miss");
        } else {
          eventsRef.current = [...eventsRef.current, { type: "correct_reject", step: index }];
        }
      }
      later(() => advance(index + 1), STEP_GAP_MS);
    }, STEP_SHOW_MS);
  }, [finish, flash]);

  const start = useCallback(() => {
    seqRef.current = buildSequence(TOTAL_STEPS);
    eventsRef.current = [];
    setStreak(0);
    setScreen("playing");
    later(() => advance(0), 600);
  }, [advance]);

  const respond = useCallback(() => {
    if (screen !== "playing" || !showSymbol || respondedRef.current) return;
    const index = stepRef.current;
    if (index < N_BACK) { flash("false_alarm"); respondedRef.current = true; setStreak(0);
      eventsRef.current = [...eventsRef.current, { type: "false_alarm", step: index }]; return; }
    respondedRef.current = true;
    const isMatch = seqRef.current[index] === seqRef.current[index - N_BACK];
    if (isMatch) {
      const rt = Math.round(performance.now() - showStartRef.current);
      eventsRef.current = [...eventsRef.current, { type: "hit", rt, step: index }];
      setStreak(s => s + 1);
      flash("hit");
    } else {
      eventsRef.current = [...eventsRef.current, { type: "false_alarm", step: index }];
      setStreak(0);
      flash("false_alarm");
    }
  }, [screen, showSymbol, flash]);

  // Teclado
  useEffect(() => {
    if (screen !== "playing") return;
    const handler = (e: KeyboardEvent) => { if (e.code === "Space") { e.preventDefault(); respond(); } };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [screen, respond]);

  const glyph = step >= 0 && showSymbol ? GLYPHS[seqRef.current[step]] : null;
  const progress = screen === "playing" ? Math.max(0, step) / TOTAL_STEPS : 0;

  return (
    <div className="ms-root">
      <div className="ms-header">
        <span className="ms-eyebrow">Memory Surge</span>
        <div className="ms-header-right">
          <span className="ms-nback-badge">{N_BACK}-back</span>
          {screen === "playing" && (
            <div className="ms-overall-bar" aria-label={`Progreso: ${Math.round(progress * 100)}%`}>
              <div className="ms-overall-fill" style={{ width: `${progress * 100}%` }} />
            </div>
          )}
        </div>
      </div>

      {screen === "intro" && <Intro onStart={start} />}

      {screen === "playing" && (
        <div
          className={`ms-arena ${feedback ? `ms-arena--${feedback}` : ""}`}
          onClick={respond}
          role="button"
          tabIndex={0}
          aria-label="Pulsa cuando la figura coincida con la de hace 2 pasos"
          onKeyDown={e => e.key === " " && respond()}
        >
          {/* marcadores de memoria (N posiciones, sin revelar símbolos) */}
          <div className="ms-trail" aria-hidden="true">
            {Array.from({ length: N_BACK + 1 }, (_, i) => (
              <span key={i} className={`ms-trail-dot ${i === N_BACK ? "ms-trail-now" : ""}`} />
            ))}
            <span className="ms-trail-label">tú vs hace {N_BACK}</span>
          </div>

          {/* escenario principal */}
          <div className="ms-stage">
            <div className={`ms-card ${showSymbol ? "ms-card--show" : "ms-card--gap"}`}>
              {glyph && (
                <span className="ms-symbol" style={{ color: glyph.color, textShadow: `0 0 40px ${glyph.color}88` }}>
                  {glyph.sym}
                </span>
              )}
            </div>
          </div>

          {feedback && (
            <div className={`ms-feedback ms-feedback--${feedback}`} aria-live="assertive">
              {feedback === "hit" ? "✓" : feedback === "false_alarm" ? "✗" : feedback === "miss" ? "—" : ""}
            </div>
          )}

          {streak >= 2 && <div className="ms-streak" aria-hidden="true">🔥 racha {streak}</div>}

          <button className="ms-match-btn" onClick={(e) => { e.stopPropagation(); respond(); }}>
            Coincide <kbd>espacio</kbd>
          </button>
        </div>
      )}

      {screen === "results" && result && <Results result={result} onContinue={onContinue} />}
    </div>
  );
};

export default MemorySurge;
