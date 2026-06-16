// CandidateScatter3D.tsx
// Gráfico de dispersión 3D para Psychometric Quest.
// Motor 3D propio sobre <canvas> (proyección + painter's algorithm), sin three.js.
//
// Capas de profundidad y vida:
//   · Auto-rotación idle (pausa al interactuar, reanuda tras inactividad; respeta reduced-motion)
//   · Atenuación + escala por profundidad (los puntos al fondo se ven más lejos)
//   · Sombras suaves proyectadas al piso
//   · Brillo especular en cada esfera
//   · Entrada animada: los puntos se elevan desde el suelo, escalonados
//   · Zona ideal con pulso sutil
//   · Modo personal: líneas guía a los 3 planos con sus valores
//
// Ejes:  X = Adaptabilidad · Y = Priorización · Z = Riesgo calculado  (escala 0-100)
//
// API estable:  <CandidateScatter3D candidates={completed} />
//               <CandidateScatter3D candidates={[candidate]} mode="personal" />
// Reutiliza clases existentes de styles.css (scatter-card, scatter-toolbar, etc.).

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import type { Candidate } from "../../types";
import { computeComposite, isCompositeIdeal, COMPOSITE_IDEAL_MIN, type CompositeProfile } from "../../utils/compositeAxes";

// El espacio del gráfico es la reducción a 3 índices compuestos (ver compositeAxes.ts):
//   X = Cognición · Y = Estrategia · Z = Riesgo calibrado  (cada uno 0-100)
// Área ideal = los 3 índices ≥ COMPOSITE_IDEAL_MIN.

// ─── Tokens del dashboard (coinciden con :root en styles.css) ────────────────

const T = {
  paper:     "#0e1318",
  surface:   "#161d24",
  surface2:  "#1e2830",
  line:      "#2a3a48",
  ink:       "#d8e8e4",
  muted:     "#7a9898",
  signal:    "#4ecdc4",
  signalDim: "#2a7a75",
  axisX:     "#ff9a8d",
  axisY:     "#8ce8b8",
  axisZ:     "#9dbdff",
} as const;

// ─── Tipos internos ───────────────────────────────────────────────────────────

type Vec3 = [number, number, number];
type Projected = [number, number, number]; // [screenX, screenY, depth]

interface PlottedPoint {
  id: string;
  screenX: number;
  screenY: number;
  hitRadius: number;
}

interface PointAnim { r: number; }

interface SceneState {
  rotX: number;
  rotY: number;
  zoom: number;
  time: number;
  entrance: number;
  selectedId: string | null;
  hoveredId: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function project(pos: Vec3, rotX: number, rotY: number, scale: number, cx: number, cy: number): Projected {
  const [x, y, z] = [pos[0] - 0.5, pos[1] - 0.5, pos[2] - 0.5];
  const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
  const rx1 =  x * cosY + y * sinY;
  const ry1 = -x * sinY + y * cosY;
  const rz1 =  z;
  const cosX = Math.cos(rotX), sinX = Math.sin(rotX);
  const rx2 = rx1;
  const ry2 = ry1 * cosX - rz1 * sinX;
  const rz2 = ry1 * sinX + rz1 * cosX;
  return [cx + rx2 * scale, cy - rz2 * scale, ry2];
}

function faceDepth(pts: Vec3[], rotX: number, rotY: number, scale: number, cx: number, cy: number): number {
  return pts.reduce((sum, p) => sum + project(p, rotX, rotY, scale, cx, cy)[2], 0) / pts.length;
}

function lighten(hex: string, amount: number): string {
  const r = Math.min(255, parseInt(hex.slice(1, 3), 16) + Math.round(255 * amount));
  const g = Math.min(255, parseInt(hex.slice(3, 5), 16) + Math.round(255 * amount));
  const b = Math.min(255, parseInt(hex.slice(5, 7), 16) + Math.round(255 * amount));
  return `rgb(${r},${g},${b})`;
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

// ─── Renderer ───────────────────────────────────────────────────────────────

function renderScene(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  candidates: Candidate[],
  composites: Map<string, CompositeProfile>,
  scene: SceneState,
  pointAnim: Map<string, PointAnim>,
  isPersonal: boolean,
): { plotted: PlottedPoint[]; settling: boolean } {
  const { rotX, rotY, zoom, time, entrance, selectedId, hoveredId } = scene;
  ctx.clearRect(0, 0, W, H);

  const CX = W / 2;
  const CY = H * 0.50;
  const scale = Math.min(W, H) * 0.34 * zoom;
  const proj = (v: Vec3): Projected => project(v, rotX, rotY, scale, CX, CY);

  // ── Fondo con viñeta ───────────────────────────────────────────────────────
  const bg = ctx.createRadialGradient(CX, CY * 0.70, 0, CX, CY, Math.max(W, H) * 0.82);
  bg.addColorStop(0, "#121d25");
  bg.addColorStop(0.6, "#0f1820");
  bg.addColorStop(1, T.paper);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  function seg(a: Vec3, b: Vec3, color: string, lw = 0.5, dash: number[] = []) {
    const pa = proj(a), pb = proj(b);
    ctx.beginPath();
    ctx.setLineDash(dash);
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.moveTo(pa[0], pa[1]);
    ctx.lineTo(pb[0], pb[1]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function poly(pts: Vec3[], fill: string | null, stroke: string | null, lw = 0.5, dash: number[] = []) {
    const pp = pts.map(proj);
    ctx.beginPath();
    ctx.moveTo(pp[0][0], pp[0][1]);
    for (let i = 1; i < pp.length; i++) ctx.lineTo(pp[i][0], pp[i][1]);
    ctx.closePath();
    if (fill)   { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.setLineDash(dash); ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); ctx.setLineDash([]); }
  }

  function label(pos: Vec3, text: string, color: string, size = 10, align: CanvasTextAlign = "center") {
    const p = proj(pos);
    ctx.save();
    ctx.fillStyle = color;
    ctx.font = `500 ${size}px "Space Grotesk","Inter",system-ui,sans-serif`;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.fillText(text, p[0], p[1]);
    ctx.restore();
  }

  // ── Caras del cubo (depth-sorted) ──────────────────────────────────────────
  // Paredes de vidrio teal translúcido + aristas claras para que la forma de cubo
  // se lea bien sin tapar los puntos. El suelo lleva una base algo más sólida.
  const edgeStrong = "rgba(150,180,200,.5)";
  const edgeSoft = "rgba(150,180,200,.32)";
  const cubeFaces: { pts: Vec3[]; fill: string; stroke: string }[] = [
    { pts: [[0,0,0],[1,0,0],[1,1,0],[0,1,0]], fill: "rgba(22,32,40,.55)", stroke: edgeStrong },  // suelo    z=0
    { pts: [[0,0,1],[1,0,1],[1,1,1],[0,1,1]], fill: "rgba(78,205,196,.045)", stroke: edgeSoft },  // techo    z=1
    { pts: [[0,0,0],[0,1,0],[0,1,1],[0,0,1]], fill: "rgba(78,205,196,.08)", stroke: edgeStrong },  // izquierda x=0
    { pts: [[1,0,0],[1,1,0],[1,1,1],[1,0,1]], fill: "rgba(78,205,196,.05)", stroke: edgeSoft },    // derecha   x=1
    { pts: [[0,0,0],[1,0,0],[1,0,1],[0,0,1]], fill: "rgba(78,205,196,.08)", stroke: edgeStrong },  // fondo     y=0
    { pts: [[0,1,0],[1,1,0],[1,1,1],[0,1,1]], fill: "rgba(78,205,196,.045)", stroke: edgeSoft },   // frente    y=1
  ];
  cubeFaces.sort((a, b) => faceDepth(a.pts, rotX, rotY, scale, CX, CY) - faceDepth(b.pts, rotX, rotY, scale, CX, CY));
  cubeFaces.forEach(f => poly(f.pts, f.fill, f.stroke, 1));

  // ── Grilla ──────────────────────────────────────────────────────────────────
  const gc = hexToRgba(T.line, 0.32);
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    seg([t,0,0], [t,1,0], gc, 0.35);  seg([0,t,0], [1,t,0], gc, 0.35);
    seg([t,0,0], [t,0,1], gc, 0.28);  seg([0,0,t], [1,0,t], gc, 0.28);
    seg([0,t,0], [0,t,1], gc, 0.25);  seg([0,0,t], [0,1,t], gc, 0.25);
  }

  // ── Ejes (sobre las aristas del cubo, naciendo en el origen 0,0,0) ─────────
  const origin: Vec3 = [0, 0, 0];
  const axisAlpha = "cc";
  const axisExt = 1.14; // los ejes sobresalen un poco más allá del cubo (>100)
  seg(origin, [axisExt, 0, 0], T.axisX + axisAlpha, 2.2);  // X = Cognición
  seg(origin, [0, axisExt, 0], T.axisY + axisAlpha, 2.2);  // Y = Estrategia
  seg(origin, [0, 0, axisExt], T.axisZ + axisAlpha, 2.2);  // Z = Riesgo calibrado

  [[0,"0"],[0.5,"50"],[1,"100"]].forEach(([t, lab]) => {
    const tv = t as number;
    label([tv, -0.08, -0.02], lab as string, T.axisX + "bb", 9, "center");
    label([-0.08, tv, -0.02], lab as string, T.axisY + "bb", 9, "center");
    label([-0.07, -0.07, tv], lab as string, T.axisZ + "bb", 9, "center");
  });

  function axisLabel(pos: Vec3, text: string, color: string) {
    const p = proj(pos);
    const pad = 6, h = 18;
    ctx.font = `700 10px "Space Grotesk","Inter",system-ui,sans-serif`;
    const tw = ctx.measureText(text).width;
    ctx.fillStyle = hexToRgba(T.surface, 0.82);
    ctx.beginPath();
    ctx.roundRect(p[0] - tw / 2 - pad, p[1] - h / 2, tw + pad * 2, h, 999);
    ctx.fill();
    ctx.strokeStyle = hexToRgba(T.line, 0.7);
    ctx.lineWidth = 0.5;
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, p[0], p[1]);
  }

  const [axisCx, axisCy] = proj(origin);
  const ag = ctx.createRadialGradient(axisCx, axisCy, 0, axisCx, axisCy, 16);
  ag.addColorStop(0, hexToRgba(T.signal, 0.32));
  ag.addColorStop(1, "transparent");
  ctx.fillStyle = ag;
  ctx.beginPath();
  ctx.arc(axisCx, axisCy, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(axisCx, axisCy, 3.4, 0, Math.PI * 2);
  ctx.fillStyle = hexToRgba(T.ink, 0.9);
  ctx.fill();

  axisLabel([0.5, -0.22, -0.02], "Cognición", T.axisX);
  axisLabel([-0.22, 0.5, -0.02], "Estrategia", T.axisY);
  axisLabel([-0.16, -0.16, 0.55], "Riesgo calib.", T.axisZ);

  // ── Zona ideal: cubo de esquina alta (los 3 índices ≥ umbral) ──────────────
  const thr = COMPOSITE_IDEAL_MIN / 100;
  const ia0 = thr, ia1 = 1;
  const ip0 = thr, ip1 = 1;
  const ir0 = thr, ir1 = 1;
  const pulse = 0.5 + 0.5 * Math.sin(time / 620);
  const idealStroke = hexToRgba(T.signal, 0.32 + pulse * 0.20);
  const idealFill   = hexToRgba(T.signal, 0.05 + pulse * 0.05);

  const idealFaces: Vec3[][] = [
    [[ia0,ip0,ir0],[ia1,ip0,ir0],[ia1,ip1,ir0],[ia0,ip1,ir0]],
    [[ia0,ip0,ir1],[ia1,ip0,ir1],[ia1,ip1,ir1],[ia0,ip1,ir1]],
    [[ia0,ip0,ir0],[ia1,ip0,ir0],[ia1,ip0,ir1],[ia0,ip0,ir1]],
    [[ia0,ip1,ir0],[ia1,ip1,ir0],[ia1,ip1,ir1],[ia0,ip1,ir1]],
    [[ia0,ip0,ir0],[ia0,ip1,ir0],[ia0,ip1,ir1],[ia0,ip0,ir1]],
    [[ia1,ip0,ir0],[ia1,ip1,ir0],[ia1,ip1,ir1],[ia1,ip0,ir1]],
  ];
  idealFaces
    .sort((a, b) => faceDepth(a, rotX, rotY, scale, CX, CY) - faceDepth(b, rotX, rotY, scale, CX, CY))
    .forEach(f => poly(f, idealFill, idealStroke, 0.8, [4, 3]));
  label([(ia0+ia1)/2, (ip0+ip1)/2, ir1 + 0.06], "zona ideal", hexToRgba(T.signal, 0.75 + pulse * 0.2), 10);

  // ── Puntos ─────────────────────────────────────────────────────────────────
  const pts3d = candidates.flatMap(c => {
    const cp = composites.get(c.id);
    if (!cp) return [];
    const pos: Vec3 = [cp.cognition/100, cp.strategy/100, cp.riskCalibrated/100];
    return [{ c, cp, pos, depth: proj(pos)[2] }];
  });
  pts3d.sort((a, b) => a.depth - b.depth);

  const depths = pts3d.map(p => p.depth);
  const dMin = depths.length ? Math.min(...depths) : 0;
  const dMax = depths.length ? Math.max(...depths) : 1;
  const depthNorm = (d: number) => (dMax > dMin ? (d - dMin) / (dMax - dMin) : 0.5); // 0 fondo · 1 frente

  const total = pts3d.length;
  let settling = false;

  // Pre-pass: sombras suaves en el piso (detrás de los puntos)
  pts3d.forEach(({ c, pos, depth }, idx) => {
    const stagger = total > 1 ? (idx / total) * 0.4 : 0;
    const pe = easeOutCubic(clamp01((entrance - stagger) / 0.6));
    if (pe <= 0.02) return;
    const dn = depthNorm(depth);
    const baseR = (c.id === selectedId ? 15 : c.id === hoveredId ? 13 : 10) * (0.82 + dn * 0.36);
    const [fx, fy] = proj([pos[0], pos[1], 0]);
    ctx.save();
    ctx.globalAlpha = pe * (0.22 + dn * 0.32);
    const shR = baseR * 1.5;
    ctx.translate(fx, fy);
    ctx.scale(1, 0.42);
    const sg = ctx.createRadialGradient(0, 0, 0, 0, 0, shR);
    sg.addColorStop(0, "rgba(0,0,0,.5)");
    sg.addColorStop(1, "transparent");
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.arc(0, 0, shR, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });

  const plotted: PlottedPoint[] = [];

  pts3d.forEach(({ c, cp, pos, depth }, idx) => {
    const arc   = { color: T.signal }; // color neutral (la posición 3D y la inicial codifican el dato)
    const isSel = c.id === selectedId;
    const isHov = c.id === hoveredId;
    const dn    = depthNorm(depth);

    const stagger = total > 1 ? (idx / total) * 0.4 : 0;
    const pe = easeOutCubic(clamp01((entrance - stagger) / 0.6));
    if (pe <= 0.02) { plotted.push({ id: c.id, screenX: -999, screenY: -999, hitRadius: 0 }); return; }
    const drawPos: Vec3 = [pos[0], pos[1], pos[2] * pe];
    const [sx, sy] = proj(drawPos);

    const targetR = (isSel ? 15 : isHov ? 13 : 10) * (0.82 + dn * 0.36);
    const st = pointAnim.get(c.id) ?? { r: targetR };
    st.r += (targetR - st.r) * 0.28;
    if (Math.abs(targetR - st.r) > 0.25) settling = true;
    pointAnim.set(c.id, st);
    const r = st.r;

    const ideal = isCompositeIdeal(cp);
    const depthAlpha = 0.6 + dn * 0.4;

    ctx.save();
    ctx.globalAlpha = pe * depthAlpha;

    // Línea de caída al piso
    const [fx, fy] = proj([pos[0], pos[1], 0]);
    ctx.beginPath();
    ctx.setLineDash([2, 3]);
    ctx.strokeStyle = hexToRgba(arc.color, 0.30);
    ctx.lineWidth = 0.8;
    ctx.moveTo(sx, sy);
    ctx.lineTo(fx, fy);
    ctx.stroke();
    ctx.setLineDash([]);

    // Halo
    if (ideal || isSel || isHov) {
      const glowR = r * (isSel ? 3.4 : 2.8);
      const gg = ctx.createRadialGradient(sx, sy, 0, sx, sy, glowR);
      gg.addColorStop(0, hexToRgba(arc.color, isSel ? 0.40 : 0.24));
      gg.addColorStop(1, "transparent");
      ctx.fillStyle = gg;
      ctx.beginPath();
      ctx.arc(sx, sy, glowR, 0, Math.PI * 2);
      ctx.fill();
    }

    // Ring
    ctx.beginPath();
    ctx.arc(sx, sy, r + 2.5, 0, Math.PI * 2);
    ctx.strokeStyle = hexToRgba(arc.color, isSel ? 0.9 : ideal ? 0.55 : 0.30);
    ctx.lineWidth   = isSel ? 1.8 : ideal ? 1.2 : 0.7;
    ctx.stroke();

    // Cuerpo (gradiente radial)
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    const gr = ctx.createRadialGradient(sx - r * 0.35, sy - r * 0.35, 0, sx, sy, r);
    gr.addColorStop(0, lighten(arc.color, 0.34));
    gr.addColorStop(1, arc.color);
    ctx.fillStyle = gr;
    ctx.fill();

    // Brillo especular (look glossy)
    const sgl = ctx.createRadialGradient(sx - r * 0.34, sy - r * 0.42, 0, sx - r * 0.34, sy - r * 0.42, r * 0.95);
    sgl.addColorStop(0, "rgba(255,255,255,.55)");
    sgl.addColorStop(0.45, "rgba(255,255,255,.08)");
    sgl.addColorStop(1, "transparent");
    ctx.fillStyle = sgl;
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fill();

    // Badge de zona ideal
    if (ideal) {
      ctx.beginPath();
      ctx.arc(sx + r * 0.72, sy - r * 0.72, 4, 0, Math.PI * 2);
      ctx.fillStyle = T.signal;
      ctx.fill();
      ctx.fillStyle = "rgba(0,0,0,.75)";
      ctx.font = "bold 5.5px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("✓", sx + r * 0.72, sy - r * 0.72 + 0.4);
    }

    // Inicial
    ctx.fillStyle    = "rgba(255,255,255,.96)";
    ctx.font         = `600 ${Math.round(r * 0.84)}px "Space Grotesk","Inter",system-ui,sans-serif`;
    ctx.textAlign    = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(c.name[0].toUpperCase(), sx, sy + 0.5);

    ctx.restore();

    // Modo personal: guías de proyección a los 3 planos con valores
    if (isPersonal && pe > 0.6) {
      ctx.save();
      ctx.globalAlpha = pe;
      const guide = (to: Vec3, color: string) => {
        const a = proj(drawPos), b = proj(to);
        ctx.beginPath();
        ctx.setLineDash([3, 4]);
        ctx.strokeStyle = hexToRgba(color, 0.5);
        ctx.lineWidth = 1;
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(b[0], b[1], 2.4, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      };
      guide([pos[0], 1, pos[2] * pe], T.axisX);
      guide([1, pos[1], pos[2] * pe], T.axisY);
      guide([pos[0], pos[1], 0], T.axisZ);
      label([pos[0], 1.07, pos[2] * pe], `${Math.round(cp.cognition)}`, T.axisX, 10);
      label([1.07, pos[1], pos[2] * pe], `${Math.round(cp.strategy)}`, T.axisY, 10);
      label([pos[0], pos[1], -0.06], `${Math.round(cp.riskCalibrated)}`, T.axisZ, 10);
      ctx.restore();
    }

    plotted.push({ id: c.id, screenX: sx, screenY: sy, hitRadius: r + 5 });
  });

  return { plotted, settling };
}

// ─── Componente ───────────────────────────────────────────────────────────────

interface Props {
  candidates: Candidate[];
  mode?: "admin" | "personal";
  onOpenCandidate?: (id: string) => void;
}

export function CandidateScatter3D({ candidates, mode = "admin", onOpenCandidate }: Props) {
  const canvasRef      = useRef<HTMLCanvasElement>(null);
  const rafRef         = useRef<number>(0);
  const runningRef     = useRef(false);
  const plotRef        = useRef<PlottedPoint[]>([]);
  const pointAnimRef   = useRef<Map<string, PointAnim>>(new Map());
  const rotationRef    = useRef({ rotX: 0.52, rotY: 0.72 });
  const zoomRef        = useRef(1);
  const visibleRef     = useRef<Candidate[]>([]);
  const selectedIdRef  = useRef<string | null>(null);
  const hoveredIdRef   = useRef<string | null>(null);
  const dragRef        = useRef<{ x: number; y: number; rotX: number; rotY: number } | null>(null);
  const lastInteractRef = useRef(0);
  const entranceStartRef = useRef(0);
  const loopRef        = useRef<(t: number) => void>(() => {});

  const reduceMotion = useMemo(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );

  const [zoom,       setZoom]       = useState(1);
  const [idealOnly,  setIdealOnly]  = useState(false);
  const [autoRotate, setAutoRotate] = useState(!reduceMotion);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId,  setHoveredId]  = useState<string | null>(null);
  const [tooltip,    setTooltip]    = useState<{ x: number; y: number; candidateId: string } | null>(null);
  const autoRotateRef = useRef(!reduceMotion);

  const isPersonal = mode === "personal";
  const composites = useMemo(() => {
    const m = new Map<string, CompositeProfile>();
    for (const c of candidates) {
      const cp = computeComposite(c);
      if (cp) m.set(c.id, cp);
    }
    return m;
  }, [candidates]);
  const compositesRef = useRef(composites);
  compositesRef.current = composites;

  const plotted    = useMemo(() => candidates.filter(c => composites.has(c.id)), [candidates, composites]);
  const visible    = useMemo(
    () => (isPersonal || !idealOnly ? plotted : plotted.filter(c => isCompositeIdeal(composites.get(c.id)))),
    [idealOnly, isPersonal, plotted, composites],
  );
  const idealCount = plotted.filter(c => isCompositeIdeal(composites.get(c.id))).length;
  const selected   = visible.find(c => c.id === selectedId) ?? visible[0] ?? null;

  const renderOnce = useCallback((time: number, entrance: number): boolean => {
    const canvas = canvasRef.current;
    if (!canvas) return false;
    const ctx = canvas.getContext("2d");
    if (!ctx) return false;
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.width / dpr;
    const H = canvas.height / dpr;
    ctx.save();
    ctx.scale(dpr, dpr);
    const { plotted: pts, settling } = renderScene(
      ctx, W, H, visibleRef.current, compositesRef.current,
      {
        rotX: rotationRef.current.rotX,
        rotY: rotationRef.current.rotY,
        zoom: zoomRef.current,
        time,
        entrance,
        selectedId: selectedIdRef.current,
        hoveredId: hoveredIdRef.current,
      },
      pointAnimRef.current,
      isPersonal,
    );
    ctx.restore();
    plotRef.current = pts;
    return settling;
  }, [isPersonal]);

  const kick = useCallback(() => {
    if (runningRef.current) return;
    runningRef.current = true;
    rafRef.current = requestAnimationFrame((t) => loopRef.current(t));
  }, []);

  loopRef.current = (now: number) => {
    const entranceDur = reduceMotion ? 1 : 1100;
    const entrance = entranceStartRef.current
      ? clamp01((now - entranceStartRef.current) / entranceDur)
      : 1;

    const idleFor = now - lastInteractRef.current;
    const spinning = autoRotateRef.current && !reduceMotion && !dragRef.current && idleFor > 1600;
    if (spinning) rotationRef.current.rotY += 0.0024;

    const settling = renderOnce(now, entrance);

    const keepGoing = spinning || settling || entrance < 1 || !!dragRef.current;
    if (keepGoing) {
      rafRef.current = requestAnimationFrame((t) => loopRef.current(t));
    } else {
      runningRef.current = false;
    }
  };

  // Arranque + entrada animada al montar y cuando cambia el set de candidatos
  useEffect(() => {
    visibleRef.current = visible;
    entranceStartRef.current = reduceMotion ? 0 : performance.now();
    pointAnimRef.current.clear();
    lastInteractRef.current = performance.now();
    kick();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible.length, reduceMotion]);

  useEffect(() => { visibleRef.current = visible; kick(); }, [visible, kick]);
  useEffect(() => { selectedIdRef.current = selectedId; kick(); }, [selectedId, kick]);
  useEffect(() => { hoveredIdRef.current = hoveredId; kick(); }, [hoveredId, kick]);
  useEffect(() => { zoomRef.current = zoom; kick(); }, [zoom, kick]);
  useEffect(() => { autoRotateRef.current = autoRotate; if (autoRotate) lastInteractRef.current = 0; kick(); }, [autoRotate, kick]);

  useEffect(() => {
    const onVis = () => { if (!document.hidden) kick(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [kick]);

  useEffect(() => () => { cancelAnimationFrame(rafRef.current); runningRef.current = false; }, []);

  // Resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const obs = new ResizeObserver(entries => {
      const entry = entries[0];
      if (!entry) return;
      const dpr = window.devicePixelRatio || 1;
      const W = entry.contentRect.width;
      const H = Math.round(W * (isPersonal ? 0.52 : 0.58));
      canvas.width  = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      canvas.style.height = `${H}px`;
      kick();
    });
    obs.observe(canvas.parentElement!);
    return () => obs.disconnect();
  }, [isPersonal, kick]);

  // ── Interacción ────────────────────────────────────────────────────────────
  function hitTest(clientX: number, clientY: number): string | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const dpr  = window.devicePixelRatio || 1;
    const mx   = (clientX - rect.left) * (canvas.width  / dpr / rect.width);
    const my   = (clientY - rect.top)  * (canvas.height / dpr / rect.height);
    let best: string | null = null, bestR = Infinity;
    for (let i = plotRef.current.length - 1; i >= 0; i--) {
      const p = plotRef.current[i];
      const d = Math.hypot(mx - p.screenX, my - p.screenY);
      if (d < p.hitRadius && d < bestR) { bestR = d; best = p.id; }
    }
    return best;
  }

  function onPointerDown(e: ReactPointerEvent<HTMLCanvasElement>) {
    (e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, ...rotationRef.current };
    lastInteractRef.current = performance.now();
    e.currentTarget.style.cursor = "grabbing";
    kick();
  }

  function onPointerMove(e: ReactPointerEvent<HTMLCanvasElement>) {
    lastInteractRef.current = performance.now();
    if (dragRef.current) {
      const dx = e.clientX - dragRef.current.x;
      const dy = e.clientY - dragRef.current.y;
      rotationRef.current = {
        rotX: Math.max(0.05, Math.min(1.55, dragRef.current.rotX + dy * 0.007)),
        rotY: dragRef.current.rotY + dx * 0.007,
      };
      kick();
    } else {
      const hit = hitTest(e.clientX, e.clientY);
      if (hit !== hoveredIdRef.current) {
        hoveredIdRef.current = hit;
        setHoveredId(hit);
      }
      e.currentTarget.style.cursor = hit ? "pointer" : "grab";
      setTooltip(hit ? { x: e.clientX, y: e.clientY, candidateId: hit } : null);
    }
  }

  function onPointerUp(e: ReactPointerEvent<HTMLCanvasElement>) {
    const wasDragging = dragRef.current
      ? Math.hypot(e.clientX - dragRef.current.x, e.clientY - dragRef.current.y) > 4
      : false;
    dragRef.current = null;
    lastInteractRef.current = performance.now();
    e.currentTarget.style.cursor = "grab";
    if (!wasDragging) {
      const hit = hitTest(e.clientX, e.clientY);
      if (hit && !isPersonal) {
        if (onOpenCandidate) {
          onOpenCandidate(hit);
        } else {
          const next = selectedIdRef.current === hit ? null : hit;
          selectedIdRef.current = next;
          setSelectedId(next);
        }
      }
    }
    kick();
  }

  function onWheel(e: ReactWheelEvent<HTMLCanvasElement>) {
    e.preventDefault();
    const next = Math.max(0.5, Math.min(2.2, zoomRef.current - e.deltaY * 0.0012));
    zoomRef.current = next;
    lastInteractRef.current = performance.now();
    setZoom(next);
  }

  function reset() {
    rotationRef.current = { rotX: 0.52, rotY: 0.72 };
    zoomRef.current = 1;
    selectedIdRef.current = null;
    hoveredIdRef.current = null;
    setZoom(1);
    setSelectedId(null);
    setHoveredId(null);
    entranceStartRef.current = reduceMotion ? 0 : performance.now();
    pointAnimRef.current.clear();
    kick();
  }

  const tooltipCandidate = tooltip ? visible.find(c => c.id === tooltip.candidateId) : null;
  const tooltipComposite = tooltipCandidate ? composites.get(tooltipCandidate.id) ?? null : null;

  return (
    <div className="scatter-card">
      <div className="scatter-toolbar">
        <div className="scatter-legend">
          <span><i className="axis-dot axis-x" /> Cognición</span>
          <span><i className="axis-dot axis-y" /> Estrategia</span>
          <span><i className="axis-dot axis-z" /> Riesgo calibrado</span>
          <span><i className="axis-dot ideal-dot" /> Zona ideal (≥{COMPOSITE_IDEAL_MIN})</span>
        </div>
        <div className="scatter-controls">
          {!isPersonal && (
            <label className="toggle-control">
              <input
                type="checkbox"
                checked={idealOnly}
                onChange={e => { setIdealOnly(e.target.checked); setSelectedId(null); }}
              />
              Solo zona ideal
            </label>
          )}
          {!reduceMotion && (
            <button
              className="mini-button"
              onClick={() => setAutoRotate(v => !v)}
              aria-pressed={autoRotate}
              title={autoRotate ? "Pausar rotación" : "Rotar automáticamente"}
            >
              {autoRotate ? "❚❚ Rotando" : "▶ Rotar"}
            </button>
          )}
          <label className="zoom-control">
            Zoom
            <input
              type="range" min="0.5" max="2.2" step="0.01" value={zoom}
              onChange={e => setZoom(Number(e.target.value))}
            />
          </label>
          <button className="mini-button" onClick={reset}>Recentrar</button>
        </div>
      </div>

      <div
        style={{
          position: "relative",
          borderRadius: 14,
          overflow: "hidden",
          border: `1px solid ${T.line}`,
          background: T.paper,
          minHeight: isPersonal ? 300 : 460,
        }}
      >
        <canvas
          ref={canvasRef}
          style={{
            display: "block",
            width: "100%",
            borderRadius: 14,
            cursor: "grab",
            touchAction: "none",
            userSelect: "none",
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => { dragRef.current = null; setTooltip(null); }}
          onWheel={onWheel}
        />

        {!plotted.length && (
          <p className="scatter-empty">Completa evaluaciones para poblar el espacio 3D.</p>
        )}
        {plotted.length > 0 && !visible.length && (
          <p className="scatter-empty">No hay candidatos dentro de la zona ideal con este filtro.</p>
        )}

        {tooltipCandidate && tooltipComposite && (
          <div
            style={{
              position: "fixed",
              left: tooltip!.x + 16,
              top:  tooltip!.y - 8,
              background: "rgba(14,19,24,.96)",
              border: `1px solid ${T.line}`,
              borderRadius: 8,
              padding: "8px 12px",
              fontSize: 12,
              color: T.ink,
              pointerEvents: "none",
              zIndex: 9999,
              maxWidth: 220,
              lineHeight: 1.6,
              boxShadow: "0 12px 30px rgba(0,0,0,.5)",
            }}
          >
            <strong style={{ color: T.signal }}>{tooltipCandidate.name}</strong><br />
            <span style={{ color: T.muted, fontSize: 11 }}>
              C {Math.round(tooltipComposite!.cognition)} · E {Math.round(tooltipComposite!.strategy)} · R {Math.round(tooltipComposite!.riskCalibrated)}
            </span><br />
            <span style={{ color: isCompositeIdeal(tooltipComposite) ? T.signal : "#c07070", fontSize: 11 }}>
              {isCompositeIdeal(tooltipComposite) ? "✓ En zona ideal" : "Fuera de zona ideal"}
            </span>
          </div>
        )}
      </div>

      <div className={`scatter-detail${isPersonal ? " personal-detail" : ""}`}>
        <div>
          <strong>
            {isPersonal ? "Resultado individual" : `${visible.length}/${plotted.length} visibles`}
          </strong>
          <span>
            {isPersonal
              ? (isCompositeIdeal(plotted[0] ? composites.get(plotted[0].id) : null) ? "Dentro de la zona ideal" : "Fuera de la zona ideal")
              : `${idealCount} candidato${idealCount !== 1 ? "s" : ""} dentro de la zona ideal`}
          </span>
        </div>
        {selected?.behavioral && composites.get(selected.id) && (
          <div className="candidate-detail-card">
            <i style={{ background: T.signal }} />
            <div>
              <strong>{selected.name}</strong>
              <span>{selected.behavioral.profile}</span>
            </div>
            <code>C {Math.round(composites.get(selected.id)!.cognition)}</code>
            <code>E {Math.round(composites.get(selected.id)!.strategy)}</code>
            <code>R {Math.round(composites.get(selected.id)!.riskCalibrated)}</code>
          </div>
        )}
      </div>
    </div>
  );
}

export { computeComposite, isCompositeIdeal, COMPOSITE_IDEAL_MIN };
