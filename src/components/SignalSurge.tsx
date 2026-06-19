import React, { useCallback, useEffect, useRef, useState } from "react";
import "./SignalSurge.css";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SignalEvent =
  | { type: "hit";  rt: number; phase: number }
  | { type: "miss"; phase: number }
  | { type: "false_alarm"; phase: number };

export type SignalSurgeResult = {
  hits: number;
  misses: number;
  falseAlarms: number;
  /** Tiempo de reacción medio en ms. undefined cuando no hubo hits (C3: eliminado
   *  placeholder 999 que contaminaba rtScore y los agregados de atención). */
  meanRt: number | undefined;
  rtVariability: number;   // std-dev of reaction times — measure of consistency
  decayIndex: number;      // performance drop from phase 1→3, 0–1
  attentionScore: number;  // composite 0–100
};

export type SignalSurgeProps = {
  practice?: boolean;
  onComplete: (result: SignalSurgeResult, events: SignalEvent[]) => void;
  onContinue: () => void;
};

// ─── Constants ────────────────────────────────────────────────────────────────
// ver docs/SCORING.md §4.2 para justificación de cada parámetro.

const FULL_PHASES = 3;
const PRACTICE_PHASES = 1;
const TRIALS_PER_PHASE = 10;          // 30 total trials
const TARGET_RATIO = 0.4;             // 40 % of trials are targets
const SIGNAL_DURATION_MS = [900, 700, 550]; // ventana de señal por fase (ms); PROVISIONAL
const ISI_MIN = 800;                  // inter-stimulus interval min (ms)
const ISI_MAX = 2000;                 // inter-stimulus interval max (ms)
const GRID_COLS = 5;
const GRID_ROWS = 4;
const TOTAL_CELLS = GRID_COLS * GRID_ROWS;

// ─── Constantes de scoring attentionScore — ver docs/SCORING.md §4.2 ──────────
// Pesos del composite de atención sostenida en SignalSurge.tsx.
// Nota: psychometricCalculations.ts usa constantes paralelas para el mismo
// cálculo sobre los eventos crudos. Los valores deben mantenerse sincronizados.
// PROVISIONAL — sin calibrar (requiere datos)
const SS_HIT_RATE_WEIGHT = 50;  // peso del hit-rate en el composite de atención
const SS_FA_WEIGHT = 25;        // peso del componente de falsas alarmas
const SS_RT_WEIGHT = 25;        // peso del componente de RT (omitido si meanRt=undefined)
const SS_FA_SCALE = 5;          // escala de penalización de FA: min(faRate * SS_FA_SCALE, 1)
const SS_DECAY_FACTOR = 0.2;    // fracción de decayIndex que penaliza el composite
// RT de referencia para rtScore = max(0, 1 - (meanRt - SS_RT_FLOOR_MS) / SS_RT_RANGE_MS).
// Sincronizado con RT_FLOOR_MS / RT_RANGE_MS de psychometricCalculations.ts.
// PROVISIONAL — sin calibrar (requiere datos)
const SS_RT_FLOOR_MS = 200;     // TR por debajo de este valor produce rtScore=1
const SS_RT_RANGE_MS = 700;     // rango de normalización de RT (ms)

// Symbols: targets are the filled triangle (▲), distractors are the rest
const TARGET_SYMBOL = "▲";
const DISTRACTOR_SYMBOLS = ["◆", "●", "■", "◀", "▶", "◉", "▼", "◈"];

function stdDev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  return Math.sqrt(arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length);
}

// C3 — computeResult es exportada para permitir tests unitarios sin instanciar el componente.
export function computeResult(events: SignalEvent[]): SignalSurgeResult {
  const hits = events.filter(e => e.type === "hit").length;
  const misses = events.filter(e => e.type === "miss").length;
  const falseAlarms = events.filter(e => e.type === "false_alarm").length;
  const rts = (events.filter(e => e.type === "hit") as Extract<SignalEvent, { type: "hit" }>[]).map(e => e.rt);

  // C3 — meanRt es undefined cuando no hay hits, no 999.
  // Un meanRt=999 era un placeholder inventado que entraba a rtScore y deformaba
  // attentionScore. undefined indica "dato no disponible" y se excluye del cálculo.
  const meanRt: number | undefined = rts.length
    ? Math.round(rts.reduce((a, b) => a + b, 0) / rts.length)
    : undefined;
  const rtVariability = Math.round(stdDev(rts));

  // decayIndex: compare hit rate in phase 1 vs phase 3
  const p1Hits = events.filter(e => e.type === "hit" && e.phase === 1).length;
  const p3Hits = events.filter(e => e.type === "hit" && e.phase === 3).length;
  const totalTargetsPerPhase = Math.round(TRIALS_PER_PHASE * TARGET_RATIO);
  const p1Rate = p1Hits / totalTargetsPerPhase;
  const p3Rate = p3Hits / totalTargetsPerPhase;
  const decayIndex = parseFloat(Math.max(0, p1Rate - p3Rate).toFixed(2));

  // composite score (0–100)
  // C4 — `e.type !== "hit" || true` was always true (tautology), so faRate was
  //      computed against the total event count instead of the distractor count.
  //      The denominator must be the number of distractor trials only.
  const hitRate = (hits + misses) > 0 ? hits / (hits + misses) : 0;
  // Total trials = hits + misses + correct-rejections + false-alarms.
  // Distractor trials = total - target trials = (events count has no correct-rejections
  // logged). We use the known distribution: TRIALS_PER_PHASE * (1 - TARGET_RATIO) per phase.
  const PHASES_PLAYED = Math.max(1, ...events.map(e => e.phase));
  const distractorTrials = Math.round(TRIALS_PER_PHASE * (1 - TARGET_RATIO)) * PHASES_PLAYED;
  const faRate = falseAlarms / Math.max(1, distractorTrials);
  // C3 — rtScore solo se calcula cuando hay un meanRt real; sin hits no aporta al composite.
  // Decisión: excluir el componente RT del composite cuando no hay datos de RT,
  // redistribuyendo su peso implícitamente. ver docs/SCORING.md §4.2 — SS_RT_FLOOR_MS, SS_RT_RANGE_MS
  const rtScore = meanRt !== undefined ? Math.max(0, 1 - (meanRt - SS_RT_FLOOR_MS) / SS_RT_RANGE_MS) : null;
  const rtComponent = rtScore !== null ? rtScore * SS_RT_WEIGHT : 0;
  // CRIT-1 — renormalización por maxPossible, igual que calculateSignalMetrics en psychometricCalculations.ts.
  // Sin hits, rtComponent=0 y el máximo alcanzable del composite base es 75 (50+25).
  // Sin renormalizar, un candidato con 0 hits pero sin falsas alarmas obtendría 25 sobre 75 → ~33
  // al mostrar en pantalla, pero el admin veía el valor ya renormalizado (33) desde el pipeline.
  // La división por maxPossible escala siempre al rango 0-100 sea cual sea el subconjunto disponible.
  // ver docs/SCORING.md §4.2 — SS_HIT_RATE_WEIGHT, SS_FA_WEIGHT, SS_RT_WEIGHT, SS_FA_SCALE, SS_DECAY_FACTOR
  const maxPossible = SS_HIT_RATE_WEIGHT + SS_FA_WEIGHT + (rtScore !== null ? SS_RT_WEIGHT : 0);
  const attentionScore = Math.max(0, Math.min(100, Math.round(
    (hitRate * SS_HIT_RATE_WEIGHT + (1 - Math.min(faRate * SS_FA_SCALE, 1)) * SS_FA_WEIGHT + rtComponent)
    / maxPossible * 100
    * (1 - decayIndex * SS_DECAY_FACTOR)
  )));

  return { hits, misses, falseAlarms, meanRt, rtVariability, decayIndex, attentionScore };
}

// ─── Phase intro screen ───────────────────────────────────────────────────────

const PhaseIntro: React.FC<{ phase: number; phases: number; onStart: () => void }> = ({ phase, phases, onStart }) => (
  <div className="ss-phase-intro">
    <span className="ss-phase-eyebrow">Fase {phase} de {phases}</span>
    <p className="ss-phase-desc">
      {phase === 1 && "Toca o presiona la tecla espacio cuando veas el símbolo ▲. Ignora los demás."}
      {phase === 2 && "Los símbolos aparecerán más rápido. Mantén el foco."}
      {phase === 3 && "Velocidad máxima. Precisión sobre velocidad."}
    </p>
    <button className="ss-start-btn" onClick={onStart} autoFocus>
      {phase === 1 ? "Comenzar" : "Siguiente fase"}
    </button>
  </div>
);

// ─── Results screen ───────────────────────────────────────────────────────────

const ResultsScreen: React.FC<{ result: SignalSurgeResult; onContinue: () => void }> = ({
  result, onContinue,
}) => {
  const decayLabel =
    result.decayIndex < 0.1 ? "Estable" :
    result.decayIndex < 0.25 ? "Leve descenso" : "Descenso notable";
  const decayColor =
    result.decayIndex < 0.1 ? "ss-good" :
    result.decayIndex < 0.25 ? "ss-mid" : "ss-warn";

  return (
    <div className="ss-results">
      <div className="ss-results-header">
        <span className="ss-eyebrow">Signal Surge</span>
        <h2 className="ss-results-title">Sesión completa</h2>
      </div>

      <div className="ss-score-ring-wrap" aria-label={`Puntuación de atención: ${result.attentionScore} de 100`}>
        <svg viewBox="0 0 120 120" className="ss-ring-svg">
          <circle cx="60" cy="60" r="50" fill="none" stroke="var(--ss-surface)" strokeWidth="8" />
          <circle
            cx="60" cy="60" r="50" fill="none"
            stroke="var(--ss-signal)" strokeWidth="8"
            strokeDasharray={`${(result.attentionScore / 100) * 314} 314`}
            strokeLinecap="round"
            transform="rotate(-90 60 60)"
            className="ss-ring-arc"
          />
        </svg>
        <div className="ss-ring-inner">
          <span className="ss-ring-value">{result.attentionScore}</span>
          <span className="ss-ring-label">atención</span>
        </div>
      </div>

      <div className="ss-stats-grid">
        <div className="ss-stat-card">
          <span className="ss-stat-val ss-good">{result.hits}</span>
          <span className="ss-stat-lbl">Detecciones</span>
        </div>
        <div className="ss-stat-card">
          <span className="ss-stat-val ss-warn">{result.misses}</span>
          <span className="ss-stat-lbl">Omisiones</span>
        </div>
        <div className="ss-stat-card">
          <span className="ss-stat-val ss-warn">{result.falseAlarms}</span>
          <span className="ss-stat-lbl">Falsas alarmas</span>
        </div>
        <div className="ss-stat-card">
          <span className="ss-stat-val">
            {result.meanRt !== undefined
              ? <>{result.meanRt}<span className="ss-stat-unit">ms</span></>
              : <span className="ss-stat-na" aria-label="Sin datos de tiempo de reacción">—</span>}
          </span>
          <span className="ss-stat-lbl">TR medio</span>
        </div>
        <div className="ss-stat-card">
          <span className="ss-stat-val">{result.rtVariability}<span className="ss-stat-unit">ms</span></span>
          <span className="ss-stat-lbl">Variabilidad TR</span>
        </div>
        <div className="ss-stat-card">
          <span className={`ss-stat-val ${decayColor}`}>{decayLabel}</span>
          <span className="ss-stat-lbl">Sostenimiento</span>
        </div>
      </div>

      <button className="ss-continue-btn" onClick={onContinue}>
        Continuar
      </button>
    </div>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

const SignalSurge: React.FC<SignalSurgeProps> = ({ practice = false, onComplete, onContinue }) => {
  type Screen = "intro" | "playing" | "results";
  const PHASES = practice ? PRACTICE_PHASES : FULL_PHASES;

  const [screen, setScreen] = useState<Screen>("intro");
  const [phase, setPhase] = useState(1);
  const [trialInPhase, setTrialInPhase] = useState(0);

  // Active signal state
  const [activeCell, setActiveCell] = useState<number | null>(null);
  const [isTarget, setIsTarget] = useState(false);
  const [symbol, setSymbol] = useState("");
  const [signalVisible, setSignalVisible] = useState(false);

  // Per-trial feedback flash
  const [feedback, setFeedback] = useState<"hit" | "miss" | "false_alarm" | null>(null);

  // Progress bar for signal duration
  const [progress, setProgress] = useState(1); // 1 → 0

  const [result, setResult] = useState<SignalSurgeResult | null>(null);
  const events = useRef<SignalEvent[]>([]);
  const signalStart = useRef<number>(0);
  const trialActive = useRef(false);
  const phaseRef = useRef(1);
  const trialRef = useRef(0);
  // Sync refs for signalVisible / isTarget so handleResponse never reads a
  // stale closure value (fixes the "ghost false alarm" race condition).
  const signalVisibleRef = useRef(false);
  const isTargetRef = useRef(false);
  // M1 — collect all timer IDs so they can be cleared on unmount (prevents leak)
  const timerIds = useRef<ReturnType<typeof setTimeout>[]>([]);
  // E-1 — track the progress-bar rAF so we can cancel it on unmount.
  const progressRaf = useRef<number>(0);

  // Track phase accurately in refs for callbacks
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { trialRef.current = trialInPhase; }, [trialInPhase]);
  useEffect(() => { signalVisibleRef.current = signalVisible; }, [signalVisible]);
  useEffect(() => { isTargetRef.current = isTarget; }, [isTarget]);

  // M1 — cleanup: clear all pending timeouts on unmount to prevent state updates
  //      on an already-unmounted component.
  useEffect(() => {
    return () => {
      timerIds.current.forEach((id) => clearTimeout(id));
      timerIds.current = [];
      if (progressRaf.current) cancelAnimationFrame(progressRaf.current);
    };
  }, []);

  // Helper: schedule a timeout and register it for cleanup
  const scheduleTimeout = useCallback((fn: () => void, delay: number) => {
    const id = setTimeout(() => {
      timerIds.current = timerIds.current.filter((t) => t !== id);
      fn();
    }, delay);
    timerIds.current.push(id);
    return id;
  }, []);

  const showFeedback = useCallback((type: "hit" | "miss" | "false_alarm") => {
    setFeedback(type);
    scheduleTimeout(() => setFeedback(null), 400);
  }, [scheduleTimeout]);

  const endGame = useCallback((finalEvents: SignalEvent[]) => {
    const res = computeResult(finalEvents);
    setResult(res);
    setScreen("results");
    onComplete(res, finalEvents);
  }, [onComplete]);

  const runTrial = useCallback((currentPhase: number, currentTrial: number, allEvents: SignalEvent[]) => {
    // Check if done
    if (currentTrial >= TRIALS_PER_PHASE) {
      if (currentPhase >= PHASES) {
        setSignalVisible(false);
        trialActive.current = false;
        endGame(allEvents);
        return;
      }
      // Next phase
      setSignalVisible(false);
      trialActive.current = false;
      setPhase(currentPhase + 1);
      setTrialInPhase(0);
      setScreen("intro");
      return;
    }

    // ISI pause — M1: use scheduleTimeout so ID is tracked for cleanup
    const isi = ISI_MIN + Math.random() * (ISI_MAX - ISI_MIN);
    scheduleTimeout(() => {
      // Pick random cell and whether it's a target
      const cell = Math.floor(Math.random() * TOTAL_CELLS);
      const target = Math.random() < TARGET_RATIO;
      const sym = target
        ? TARGET_SYMBOL
        : DISTRACTOR_SYMBOLS[Math.floor(Math.random() * DISTRACTOR_SYMBOLS.length)];

      setActiveCell(cell);
      setIsTarget(target);
      setSymbol(sym);
      setSignalVisible(true);
      setProgress(1);
      signalStart.current = performance.now();
      trialActive.current = true;

      const duration = SIGNAL_DURATION_MS[currentPhase - 1];

      // Animate progress bar
      const startTime = performance.now();
      const animFrame = () => {
        const elapsed = performance.now() - startTime;
        const remaining = Math.max(0, 1 - elapsed / duration);
        setProgress(remaining);
        // E-1: detener el rAF cuando termina la fase o el trial deja de estar activo.
        if (remaining > 0 && trialActive.current) progressRaf.current = requestAnimationFrame(animFrame);
      };
      progressRaf.current = requestAnimationFrame(animFrame);

      // Auto-expire — M1: use scheduleTimeout so ID is tracked for cleanup
      scheduleTimeout(() => {
        if (!trialActive.current) return;
        trialActive.current = false;
        setSignalVisible(false);
        setActiveCell(null);

        if (target) {
          // Miss
          const newEvent: SignalEvent = { type: "miss", phase: currentPhase };
          const nextEvents = [...allEvents, newEvent];
          events.current = nextEvents;
          showFeedback("miss");
          const nextTrial = currentTrial + 1;
          setTrialInPhase(nextTrial);
          runTrial(currentPhase, nextTrial, nextEvents);
        } else {
          // Correct rejection — no event logged, just advance
          const nextTrial = currentTrial + 1;
          setTrialInPhase(nextTrial);
          runTrial(currentPhase, nextTrial, allEvents);
        }
      }, duration);
    }, isi);
  }, [endGame, showFeedback, scheduleTimeout]);

  const startPhase = useCallback(() => {
    setScreen("playing");
    events.current = events.current; // keep existing
    runTrial(phaseRef.current, 0, events.current);
  }, [runTrial]);

  const handleResponse = useCallback(() => {
    // Read from refs to avoid stale closure values — prevents ghost false alarms
    // that can occur when the timer auto-expires (trialActive=false) before the
    // re-render that sets signalVisible=false has been committed.
    const visibleNow = signalVisibleRef.current;
    const targetNow = isTargetRef.current;

    if (!trialActive.current) {
      // Only register a false alarm when a distractor was genuinely still visible
      if (visibleNow && !targetNow) {
        const newEvent: SignalEvent = { type: "false_alarm", phase: phaseRef.current };
        events.current = [...events.current, newEvent];
        showFeedback("false_alarm");
      }
      return;
    }

    if (!visibleNow) return;

    if (targetNow) {
      // Hit
      const rt = Math.round(performance.now() - signalStart.current);
      const newEvent: SignalEvent = { type: "hit", rt, phase: phaseRef.current };
      events.current = [...events.current, newEvent];
      trialActive.current = false;
      setSignalVisible(false);
      setActiveCell(null);
      showFeedback("hit");
      const nextTrial = trialRef.current + 1;
      setTrialInPhase(nextTrial);
      runTrial(phaseRef.current, nextTrial, events.current);
    } else {
      // False alarm on distractor (trial still active)
      const newEvent: SignalEvent = { type: "false_alarm", phase: phaseRef.current };
      events.current = [...events.current, newEvent];
      showFeedback("false_alarm");
    }
  }, [runTrial, showFeedback]);

  // Keyboard support
  useEffect(() => {
    if (screen !== "playing") return;
    const handler = (e: KeyboardEvent) => {
      if (e.code === "Space") { e.preventDefault(); handleResponse(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [screen, handleResponse]);

  const totalTrials = PHASES * TRIALS_PER_PHASE;
  const completedTrials = (phase - 1) * TRIALS_PER_PHASE + trialInPhase;
  const overallProgress = completedTrials / totalTrials;

  return (
    <div className="ss-root">
      {/* Header — always visible */}
      <div className="ss-header">
        <span className="ss-eyebrow">Signal Surge</span>
        <div className="ss-header-right">
          <span className="ss-phase-badge">F{phase}/{PHASES}</span>
          {screen === "playing" && (
            <div className="ss-overall-bar" aria-label={`Progreso: ${Math.round(overallProgress * 100)}%`}>
              <div className="ss-overall-fill" style={{ width: `${overallProgress * 100}%` }} />
            </div>
          )}
        </div>
      </div>

      {/* Screens */}
      {screen === "intro" && (
        <PhaseIntro phase={phase} phases={PHASES} onStart={startPhase} />
      )}

      {screen === "playing" && (
        <div
          className={`ss-arena ${feedback ? `ss-arena--${feedback}` : ""}`}
          onClick={handleResponse}
          role="button"
          tabIndex={0}
          aria-label="Campo de señales. Pulsa espacio o toca cuando veas el símbolo objetivo ▲"
          onKeyDown={e => e.key === " " && handleResponse()}
        >
          {/* Target reminder */}
          <div className="ss-target-reminder" aria-live="off">
            <span className="ss-target-symbol">{TARGET_SYMBOL}</span>
            <span className="ss-target-hint">Objetivo</span>
          </div>

          {/* Grid */}
          <div className="ss-grid" aria-hidden="true">
            {Array.from({ length: TOTAL_CELLS }, (_, i) => (
              <div
                key={i}
                className={[
                  "ss-cell",
                  activeCell === i && signalVisible ? "ss-cell--active" : "",
                  activeCell === i && signalVisible && isTarget ? "ss-cell--target" : "",
                  activeCell === i && signalVisible && !isTarget ? "ss-cell--distractor" : "",
                ].filter(Boolean).join(" ")}
              >
                {activeCell === i && signalVisible && (
                  <>
                    <span className="ss-symbol">{symbol}</span>
                    <div
                      className="ss-signal-progress"
                      style={{ transform: `scaleX(${progress})` }}
                    />
                  </>
                )}
              </div>
            ))}
          </div>

          {/* Feedback flash */}
          {feedback && (
            <div className={`ss-feedback ss-feedback--${feedback}`} aria-live="assertive">
              {feedback === "hit" ? "✓" : feedback === "miss" ? "—" : "✗"}
            </div>
          )}

          {/* Space bar hint */}
          <div className="ss-spacebar-hint" aria-hidden="true">
            <kbd>espacio</kbd> o toca la pantalla
          </div>
        </div>
      )}

      {screen === "results" && result && (
        <ResultsScreen result={result} onContinue={onContinue} />
      )}
    </div>
  );
};

export default SignalSurge;
