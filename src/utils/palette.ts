// palette.ts — Fuente única de la paleta "aurora" para contextos JS/canvas/SVG.
// Refleja exactamente los tokens definidos en src/styles.css (:root). Mantener
// ambos en sincronía: estos valores existen porque canvas 2D y algunos atributos
// SVG no resuelven var(--token). Para DOM/CSS, preferir siempre var(--token).
export const AURORA = {
  signal: "#4ecdc4",    // var(--signal)     — teal, acción/positivo principal
  signalDim: "#2a7a75", // var(--signal-dim) — teal apagado / gradientes
  blue: "#6aa8ff",      // var(--blue)
  amber: "#e8a94a",     // var(--amber)      — estado intermedio / atención
  green: "#5cb88a",     // var(--green)      — estado bueno / éxito
  red: "#e05c5c",       // var(--red)        — estado de alerta / negativo
  muted: "#7a9898",     // var(--muted)      — texto/acento secundario
} as const;

// Tokens estructurales (superficies, texto, bordes). Reflejan 1:1 los de :root.
export const STRUCTURE = {
  paper: "#0e1318",    // var(--paper)     — fondo base
  surface: "#161d24",  // var(--surface)   — superficie de tarjetas/tooltips
  surface2: "#1e2830", // var(--surface-2) — superficie elevada
  line: "#2a3a48",     // var(--line)      — bordes/divisores
  ink: "#d8e8e4",      // var(--ink)       — texto principal
  muted: AURORA.muted, // var(--muted)     — texto secundario (reusa AURORA.muted)
  // mutedTick: variante apenas más clara de muted para etiquetas del radar.
  // No tiene token en :root; existe solo aquí para no aproximar el valor original.
  mutedTick: "#9db7b5",
} as const;

// Colores de los ejes del scatter 3D (X = Cognición · Y = Estrategia · Z = Riesgo).
// Coinciden con los hex usados en .scatter-detail de styles.css (no con los de los
// puntos de la leyenda, que son una variante ligeramente distinta). El motor canvas
// los consume directamente, por eso viven aquí como hex literales.
export const AXIS = {
  x: "#ff9a8d", // Cognición
  y: "#8ce8b8", // Estrategia
  z: "#9dbdff", // Riesgo calibrado
} as const;

// Semáforo estándar bueno → atención → alerta, reutilizable por los gráficos.
export const SEMANTIC = {
  good: AURORA.green,
  warn: AURORA.amber,
  bad: AURORA.red,
} as const;
