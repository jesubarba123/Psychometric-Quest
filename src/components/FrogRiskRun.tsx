import React, { useEffect, useRef, useState } from "react";
import "./FrogRiskRun.css";

// ─── Types ───────────────────────────────────────────────────────────────────

export type RiskChoice = {
  id: "safe" | "probe" | "leap";
  label: string;
  text: string;
  reward: number;
  risk: number;
};

export type FrogRiskRunProps = {
  round: number;
  score: number;
  history: number[];
  complete: boolean;
  choices: RiskChoice[];
  totalRounds?: number;
  onAnswer: (id: "safe" | "probe" | "leap") => void;
  onContinue: () => void;
};

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_TOTAL_ROUNDS = 6;
const PATH_POSITIONS = 7; // 0 (start) … 6 (goal)
const MAX_SCORE = 132; // 6 × 22

// ─── Sub-components ──────────────────────────────────────────────────────────

/** Minimal SVG frog, expressive but editorial */
const FrogSVG: React.FC<{ state: "idle" | "jump" | "fall" | "land" }> = ({ state }) => (
  <svg
    viewBox="0 0 64 64"
    xmlns="http://www.w3.org/2000/svg"
    className={`frr-frog-svg frr-frog--${state}`}
    aria-hidden="true"
  >
    {/* body */}
    <ellipse cx="32" cy="38" rx="16" ry="13" fill="#5a8a5a" />
    {/* head */}
    <circle cx="32" cy="24" r="13" fill="#6aab5e" />
    {/* left eye bulge */}
    <circle cx="24" cy="18" r="6" fill="#8ace7e" />
    {/* right eye bulge */}
    <circle cx="40" cy="18" r="6" fill="#8ace7e" />
    {/* pupils */}
    <circle cx="24" cy="18" r="3.2" fill="#1a2e1a" />
    <circle cx="40" cy="18" r="3.2" fill="#1a2e1a" />
    {/* eye glint */}
    <circle cx="25.2" cy="16.8" r="1" fill="white" />
    <circle cx="41.2" cy="16.8" r="1" fill="white" />
    {/* mouth – changes subtly per state */}
    {state === "fall" ? (
      <path d="M27 30 Q32 27 37 30" stroke="#2d4a2d" strokeWidth="1.8" fill="none" strokeLinecap="round" />
    ) : state === "land" ? (
      <path d="M27 29 Q32 33 37 29" stroke="#2d4a2d" strokeWidth="1.8" fill="none" strokeLinecap="round" />
    ) : (
      <path d="M27 29 Q32 32 37 29" stroke="#2d4a2d" strokeWidth="1.8" fill="none" strokeLinecap="round" />
    )}
    {/* belly */}
    <ellipse cx="32" cy="40" rx="9" ry="7" fill="#8ace7e" opacity="0.6" />
    {/* front legs (visible in idle/land) */}
    {(state === "idle" || state === "land") && (
      <>
        <path d="M18 42 Q10 46 8 50" stroke="#5a8a5a" strokeWidth="3" fill="none" strokeLinecap="round" />
        <path d="M46 42 Q54 46 56 50" stroke="#5a8a5a" strokeWidth="3" fill="none" strokeLinecap="round" />
      </>
    )}
    {/* legs tucked during jump */}
    {state === "jump" && (
      <>
        <path d="M18 44 Q14 38 12 34" stroke="#5a8a5a" strokeWidth="3" fill="none" strokeLinecap="round" />
        <path d="M46 44 Q50 38 52 34" stroke="#5a8a5a" strokeWidth="3" fill="none" strokeLinecap="round" />
        <path d="M20 50 Q12 56 10 60" stroke="#5a8a5a" strokeWidth="3" fill="none" strokeLinecap="round" />
        <path d="M44 50 Q52 56 54 60" stroke="#5a8a5a" strokeWidth="3" fill="none" strokeLinecap="round" />
      </>
    )}
    {/* fall state – legs splayed */}
    {state === "fall" && (
      <>
        <path d="M18 42 Q8 48 6 54" stroke="#5a8a5a" strokeWidth="3" fill="none" strokeLinecap="round" />
        <path d="M46 42 Q56 48 58 54" stroke="#5a8a5a" strokeWidth="3" fill="none" strokeLinecap="round" />
      </>
    )}
  </svg>
);

/** A single platform stone */
const Stone: React.FC<{ active: boolean; visited: boolean; isGoal: boolean; index: number }> = ({
  active,
  visited,
  isGoal,
  index,
}) => (
  <div
    className={[
      "frr-stone",
      active ? "frr-stone--active" : "",
      visited ? "frr-stone--visited" : "",
      isGoal ? "frr-stone--goal" : "",
    ]
      .filter(Boolean)
      .join(" ")}
    style={{ animationDelay: `${index * 0.07}s` }}
    aria-hidden="true"
  >
    {isGoal && (
      <span className="frr-stone-flag" aria-hidden="true">
        🏔
      </span>
    )}
    {visited && !isGoal && <span className="frr-stone-ripple" />}
  </div>
);

/** Sparkline / capital curve */
const CapitalCurve: React.FC<{ history: number[] }> = ({ history }) => {
  const W = 340;
  const H = 80;
  const PAD = 12;

  if (history.length < 1) return null;

  // Normalize to [0, MAX_SCORE] clamped
  const points = history.map((v, i) => {
    const x = PAD + ((W - PAD * 2) / Math.max(history.length - 1, 1)) * i;
    const norm = Math.min(Math.max(v, -MAX_SCORE), MAX_SCORE);
    const y = H - PAD - ((norm + MAX_SCORE) / (MAX_SCORE * 2)) * (H - PAD * 2);
    return [x, y] as [number, number];
  });

  const d =
    points.length === 1
      ? `M ${points[0][0]} ${points[0][1]}`
      : points.reduce((acc, [x, y], i) => {
          if (i === 0) return `M ${x} ${y}`;
          const [px, py] = points[i - 1];
          const cx1 = px + (x - px) / 3;
          const cx2 = x - (x - px) / 3;
          return `${acc} C ${cx1} ${py} ${cx2} ${y} ${x} ${y}`;
        }, "");

  // baseline at score=0
  const zeroY = H - PAD - (MAX_SCORE / (MAX_SCORE * 2)) * (H - PAD * 2);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="frr-curve"
      aria-label={`Capital curve: ${history.join(", ")}`}
      role="img"
    >
      {/* zero line */}
      <line x1={PAD} y1={zeroY} x2={W - PAD} y2={zeroY} stroke="var(--frr-mist)" strokeWidth="1" strokeDasharray="4 4" />
      {/* area fill */}
      <path
        d={`${d} L ${points[points.length - 1][0]} ${H} L ${points[0][0]} ${H} Z`}
        fill="var(--frr-green-pale)"
        opacity="0.35"
      />
      {/* line */}
      <path d={d} fill="none" stroke="var(--frr-green-mid)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      {/* dots */}
      {points.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i === points.length - 1 ? 4 : 2.5} fill="var(--frr-green-mid)" opacity={i === points.length - 1 ? 1 : 0.5} />
      ))}
    </svg>
  );
};

/** Risk indicator bar */
const RiskBar: React.FC<{ risk: number }> = ({ risk }) => {
  const segments = 5;
  const filled = Math.round(risk * segments);
  return (
    <span className="frr-risk-bar" aria-label={`Risk level ${filled} of ${segments}`}>
      {Array.from({ length: segments }, (_, i) => (
        <span key={i} className={`frr-risk-pip ${i < filled ? "frr-risk-pip--on" : ""}`} />
      ))}
    </span>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const FrogRiskRun: React.FC<FrogRiskRunProps> = ({
  round,
  score,
  history,
  complete,
  choices,
  totalRounds = DEFAULT_TOTAL_ROUNDS,
  onAnswer,
  onContinue,
}) => {
  const TOTAL_ROUNDS = totalRounds;
  // Derived state
  const prevHistory = useRef<number[]>([]);
  const [frogAnim, setFrogAnim] = useState<"idle" | "jump" | "fall" | "land">("idle");
  const [animating, setAnimating] = useState(false);
  const [frogPos, setFrogPos] = useState(0); // 0-6 logical position
  const [hoveredChoice, setHoveredChoice] = useState<string | null>(null);

  // Detect last event result
  useEffect(() => {
    if (history.length <= 1) {
      prevHistory.current = history;
      return;
    }

    const prev = prevHistory.current;
    if (prev.length === history.length) return; // no new event

    const lastPrev = prev[prev.length - 1] ?? 0;
    const lastNew = history[history.length - 1];
    const delta = lastNew - lastPrev;
    const success = delta >= 0;

    prevHistory.current = history;

    // animate frog
    setAnimating(true);
    setFrogAnim(success ? "jump" : "fall");

    const t1 = setTimeout(() => {
      setFrogPos((p) => {
        const newPos = Math.max(0, Math.min(PATH_POSITIONS - 1, p + (success ? 1 : -1)));
        return newPos;
      });
      setFrogAnim(success ? "land" : "idle");
    }, 600);

    const t2 = setTimeout(() => {
      setFrogAnim("idle");
      setAnimating(false);
    }, 1200);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [history]);

  // Summary stats
  const finalScore = history[history.length - 1] ?? 0;
  const gains = history.filter((v, i) => i > 0 && v > (history[i - 1] ?? 0)).length;
  const losses = (history.length - 1) - gains;

  return (
    <div className="frr-root" aria-label="Frog Risk Run minigame">
      {/* Header */}
      <div className="frr-header">
        <span className="frr-eyebrow">Route Risk</span>
        <h2 className="frr-title">Camino del sapo</h2>
        <div className="frr-rounds">
          {Array.from({ length: TOTAL_ROUNDS }, (_, i) => (
            <span
              key={i}
              className={`frr-round-pip ${i < round ? "frr-round-pip--done" : ""} ${i === round && !complete ? "frr-round-pip--active" : ""}`}
            />
          ))}
        </div>
      </div>

      {/* Scene */}
      <div className="frr-scene" aria-label="Frog on the path">
        {/* Background layers */}
        <div className="frr-bg-mountain" aria-hidden="true" />
        <div className="frr-bg-mist" aria-hidden="true" />
        <div className="frr-bg-water" aria-hidden="true" />

        {/* Path stones */}
        <div className="frr-path" role="presentation">
          {Array.from({ length: PATH_POSITIONS }, (_, i) => (
            <Stone
              key={i}
              index={i}
              active={frogPos === i}
              visited={i < frogPos}
              isGoal={i === PATH_POSITIONS - 1}
            />
          ))}
        </div>

        {/* Frog */}
        <div
          className="frr-frog-container"
          style={{ "--frr-frog-x": `${(frogPos / (PATH_POSITIONS - 1)) * 100}%` } as React.CSSProperties}
        >
          <FrogSVG state={frogAnim} />
        </div>

        {/* Score badge */}
        <div className="frr-score-badge" aria-live="polite" aria-atomic="true">
          <span className="frr-score-value">{score >= 0 ? `+${score}` : score}</span>
          <span className="frr-score-label">capital</span>
        </div>
      </div>

      {/* Capital curve */}
      {history.length > 0 && (
        <div className="frr-curve-wrap">
          <span className="frr-curve-label">Capital acumulado</span>
          <CapitalCurve history={[0, ...history]} />
        </div>
      )}

      {/* Choices or Summary */}
      {!complete ? (
        <div className="frr-choices" role="group" aria-label="Elige tu próximo movimiento">
          <p className="frr-turn-label">
            Turno {round + 1} de {TOTAL_ROUNDS} — ¿Cuánto te arriesgas?
          </p>
          <div className="frr-choice-grid">
            {choices.map((c) => (
              <button
                key={c.id}
                className={[
                  "frr-choice-btn",
                  `frr-choice-btn--${c.id}`,
                  hoveredChoice === c.id ? "frr-choice-btn--hovered" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => !animating && onAnswer(c.id)}
                disabled={animating}
                onMouseEnter={() => setHoveredChoice(c.id)}
                onMouseLeave={() => setHoveredChoice(null)}
                aria-label={`${c.label}: ${c.text}. Recompensa potencial: +${c.reward}. Riesgo: ${Math.round(c.risk * 100)}%`}
              >
                <span className="frr-choice-label">{c.label}</span>
                <span className="frr-choice-text">{c.text}</span>
                <div className="frr-choice-stats">
                  <span className="frr-choice-reward">+{c.reward}</span>
                  <RiskBar risk={c.risk} />
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="frr-summary" aria-label="Resultado final">
          <div className="frr-summary-inner">
            <h3 className="frr-summary-title">Recorrido completo</h3>
            <div className="frr-summary-stats">
              <div className="frr-stat">
                <span className="frr-stat-value">{finalScore >= 0 ? `+${finalScore}` : finalScore}</span>
                <span className="frr-stat-label">Capital final</span>
              </div>
              <div className="frr-stat">
                <span className="frr-stat-value frr-stat--green">{gains}</span>
                <span className="frr-stat-label">Avances</span>
              </div>
              <div className="frr-stat">
                <span className="frr-stat-value frr-stat--amber">{losses}</span>
                <span className="frr-stat-label">Retrocesos</span>
              </div>
            </div>
            <button className="frr-continue-btn" onClick={onContinue} aria-label="Continuar con la evaluación">
              Continuar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default FrogRiskRun;
