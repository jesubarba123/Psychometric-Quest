import React, { useMemo, useRef, useState } from "react";
import { AURORA } from "../utils/palette";
import "./RavenMatrices.css";

// ─── Tipos ──────────────────────────────────────────────────────────────────

export type RavenResult = {
  correct: number;
  total: number;
  fluidReasoning: number; // 0-100
};

export type RavenMatricesProps = {
  practice?: boolean;
  onComplete: (result: RavenResult, raw: Array<{ item: number; ok: boolean; rt: number }>) => void;
  onContinue: () => void;
};

type ShapeId = "circle" | "square" | "triangle" | "diamond";
interface Cell { shape: ShapeId; count: number; color: string; rotation: number }
interface Item { grid: Cell[]; options: Cell[]; answer: number; }

const SHAPES: ShapeId[] = ["circle", "square", "triangle", "diamond"];
const COLORS = [AURORA.signal, AURORA.amber, AURORA.blue];
const ROTATIONS = [0, 45, 90];

const REAL_ITEMS = 6;
const PRACTICE_ITEMS = 2;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function sample<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function cellEq(a: Cell, b: Cell) { return a.shape === b.shape && a.count === b.count && a.color === b.color && a.rotation === b.rotation; }

// Genera una matriz 3x3 válida con dificultad creciente.
function genItem(difficulty: number): Item {
  const shapesByRow = shuffle(SHAPES).slice(0, 3);          // forma varía por fila
  const colorVariesByCol = difficulty >= 1;
  const rotVariesByRow = difficulty >= 2;
  const baseColor = sample(COLORS);
  const colsColors = colorVariesByCol ? shuffle(COLORS) : [baseColor, baseColor, baseColor];
  const baseRot = sample(ROTATIONS);
  const rowRot = rotVariesByRow ? shuffle(ROTATIONS) : [baseRot, baseRot, baseRot];

  const cell = (r: number, c: number): Cell => ({
    shape: shapesByRow[r],
    count: c + 1,                      // 1,2,3 por columna
    color: colsColors[c],
    rotation: rowRot[r],
  });

  const grid: Cell[] = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) grid.push(cell(r, c));
  const correct = grid[8]; // la celda faltante es (2,2)

  // Distractores: perturbar un atributo a la vez
  const distractors: Cell[] = [];
  const tries = [
    { ...correct, count: ((correct.count) % 3) + 1 },
    { ...correct, shape: sample(SHAPES.filter((s) => s !== correct.shape)) },
    { ...correct, color: sample(COLORS.filter((c) => c !== correct.color)) },
    { ...correct, rotation: sample(ROTATIONS.filter((r) => r !== correct.rotation)) },
    { ...correct, count: ((correct.count + 1) % 3) + 1, shape: sample(SHAPES.filter((s) => s !== correct.shape)) },
  ];
  for (const t of tries) {
    if (!cellEq(t, correct) && !distractors.some((d) => cellEq(d, t))) distractors.push(t);
    if (distractors.length >= 5) break;
  }
  // M2 — add an iteration cap; if the random search hasn't found 5 unique
  //      distractors within MAX_ATTEMPTS, fall through with however many we have
  //      (the tries[] block above guarantees at least 3–4 in practice).
  const MAX_ATTEMPTS = 120;
  let attempts = 0;
  while (distractors.length < 5 && attempts < MAX_ATTEMPTS) {
    attempts++;
    const t: Cell = { shape: sample(SHAPES), count: 1 + Math.floor(Math.random() * 3), color: sample(COLORS), rotation: sample(ROTATIONS) };
    if (!cellEq(t, correct) && !distractors.some((d) => cellEq(d, t))) distractors.push(t);
  }

  const options = shuffle([correct, ...distractors]);
  return { grid: grid.slice(0, 8), options, answer: options.findIndex((o) => cellEq(o, correct)) };
}

// ─── Render de figuras (SVG) ───────────────────────────────────────────────────

const Shape: React.FC<{ cell: Cell; s: number }> = ({ cell, s }) => {
  const { shape, color, rotation } = cell;
  const cx = s / 2, cy = s / 2, r = s * 0.36;
  const common = { fill: "none", stroke: color, strokeWidth: 2.2, transform: `rotate(${rotation} ${cx} ${cy})` };
  if (shape === "circle") return <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={2.2} />;
  if (shape === "square") return <rect x={cx - r} y={cy - r} width={r * 2} height={r * 2} rx={2} {...common} />;
  if (shape === "diamond") return <rect x={cx - r * 0.8} y={cy - r * 0.8} width={r * 1.6} height={r * 1.6} transform={`rotate(45 ${cx} ${cy})`} fill="none" stroke={color} strokeWidth={2.2} />;
  // triangle
  const p = `${cx},${cy - r} ${cx - r},${cy + r * 0.8} ${cx + r},${cy + r * 0.8}`;
  return <polygon points={p} {...common} />;
};

const Figure: React.FC<{ cell?: Cell; size?: number; missing?: boolean }> = ({ cell, size = 64, missing }) => {
  if (missing) return <div className="rv-cell rv-cell--missing"><span>?</span></div>;
  if (!cell) return <div className="rv-cell" />;
  const cellSize = 26;
  const positions = cell.count === 1 ? [0] : cell.count === 2 ? [-1, 1] : [-1, 0, 1];
  return (
    <div className="rv-cell">
      <svg viewBox={`0 0 ${size} ${cellSize}`} width="100%" height={cellSize} aria-hidden="true">
        {positions.map((pos, i) => (
          <g key={i} transform={`translate(${size / 2 + pos * 22 - cellSize / 2}, 0)`}>
            <Shape cell={cell} s={cellSize} />
          </g>
        ))}
      </svg>
    </div>
  );
};

// ─── Pantallas ──────────────────────────────────────────────────────────────

const Intro: React.FC<{ practice?: boolean; onStart: () => void }> = ({ practice, onStart }) => (
  <div className="rv-intro">
    <span className="rv-eyebrow">{practice ? "Práctica · matrices" : "Raven · razonamiento"}</span>
    <h2 className="rv-intro-title">Encuentra la pieza que completa el patrón</h2>
    <p className="rv-intro-desc">
      Cada matriz de 3×3 sigue una lógica por filas y columnas. La última casilla está vacía:
      elige entre las opciones la figura que <strong>continúa el patrón</strong>.
    </p>
    <button className="rv-start-btn" onClick={onStart} autoFocus>{practice ? "Practicar" : "Comenzar"}</button>
  </div>
);

const Results: React.FC<{ result: RavenResult; onContinue: () => void }> = ({ result, onContinue }) => {
  const band = result.fluidReasoning >= 70 ? { t: "Razonamiento alto", c: "rv-good" } :
    result.fluidReasoning >= 45 ? { t: "Razonamiento medio", c: "rv-mid" } : { t: "Razonamiento a desarrollar", c: "rv-warn" };
  return (
    <div className="rv-results">
      <span className="rv-eyebrow">Raven</span>
      <h2 className="rv-results-title">Matrices completas</h2>
      <div className="rv-score-ring-wrap">
        <svg viewBox="0 0 120 120" className="rv-ring-svg">
          <circle cx="60" cy="60" r="50" fill="none" stroke="var(--rv-surface)" strokeWidth="8" />
          <circle cx="60" cy="60" r="50" fill="none" stroke="var(--rv-signal)" strokeWidth="8"
            strokeDasharray={`${(result.fluidReasoning / 100) * 314} 314`} strokeLinecap="round" transform="rotate(-90 60 60)" className="rv-ring-arc" />
        </svg>
        <div className="rv-ring-inner"><span className="rv-ring-value">{result.fluidReasoning}</span><span className="rv-ring-label">razonamiento</span></div>
      </div>
      <div className={`rv-band ${band.c}`}>{band.t}</div>
      <p className="rv-results-note">{result.correct} de {result.total} matrices resueltas correctamente.</p>
      <button className="rv-continue-btn" onClick={onContinue}>Continuar</button>
    </div>
  );
};

// ─── Componente principal ──────────────────────────────────────────────────────

const RavenMatrices: React.FC<RavenMatricesProps> = ({ practice = false, onComplete, onContinue }) => {
  type Screen = "intro" | "playing" | "results";
  const total = practice ? PRACTICE_ITEMS : REAL_ITEMS;
  const items = useMemo(() => Array.from({ length: total }, (_, i) => genItem(practice ? 0 : Math.min(2, Math.floor(i / 2)))), [total, practice]);

  const [screen, setScreen] = useState<Screen>("intro");
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [result, setResult] = useState<RavenResult | null>(null);
  const rawRef = useRef<Array<{ item: number; ok: boolean; rt: number }>>([]);
  const startRef = useRef(0);
  const timers = useRef<number[]>([]);
  const later = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms));

  const item = items[index];

  function start() {
    rawRef.current = [];
    setIndex(0); setPicked(null);
    setScreen("playing");
    startRef.current = performance.now();
  }

  function choose(option: number) {
    if (picked !== null) return;
    const ok = option === item.answer;
    setPicked(option);
    rawRef.current = [...rawRef.current, { item: index, ok, rt: Math.round(performance.now() - startRef.current) }];
    later(() => {
      const next = index + 1;
      if (next >= total) {
        const correct = rawRef.current.filter((r) => r.ok).length;
        const fluidReasoning = Math.round((correct / total) * 100);
        const res: RavenResult = { correct, total, fluidReasoning };
        setResult(res);
        setScreen("results");
        if (!practice) onComplete(res, rawRef.current);
      } else {
        setIndex(next); setPicked(null); startRef.current = performance.now();
      }
    }, 850);
  }

  React.useEffect(() => () => { timers.current.forEach((t) => window.clearTimeout(t)); }, []);

  return (
    <div className="rv-root">
      <div className="rv-header">
        <span className="rv-eyebrow">{practice ? "Práctica · Raven" : "Raven · Matrices"}</span>
        {screen === "playing" && (
          <div className="rv-pips" aria-label={`Ítem ${index + 1} de ${total}`}>
            {items.map((_, i) => <span key={i} className={`rv-pip ${i < index ? "rv-pip--done" : ""} ${i === index ? "rv-pip--active" : ""}`} />)}
          </div>
        )}
      </div>

      {screen === "intro" && <Intro practice={practice} onStart={start} />}

      {screen === "playing" && item && (
        <div className="rv-arena">
          {practice && <div className="rv-practice-badge">Práctica — no cuenta</div>}
          <div className="rv-matrix">
            {item.grid.map((cell, i) => <Figure key={i} cell={cell} />)}
            <Figure missing />
          </div>
          <p className="rv-prompt">¿Qué figura completa el patrón?</p>
          <div className="rv-options">
            {item.options.map((opt, i) => {
              const state = picked === null ? "" : i === item.answer ? "rv-opt--correct" : i === picked ? "rv-opt--wrong" : "rv-opt--dim";
              return (
                <button key={i} className={`rv-option ${state}`} disabled={picked !== null} onClick={() => choose(i)} aria-label={`Opción ${i + 1}`}>
                  <Figure cell={opt} />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {screen === "results" && result && <Results result={result} onContinue={onContinue} />}
    </div>
  );
};

export default RavenMatrices;
