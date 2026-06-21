// ravenBank.ts — Banco fijo de ítems Raven (C1 psychometrics)
//
// Fuente única de verdad para los ítems de la prueba real.
// TODOS los ítems son literales estáticos: NO hay Math.random en este módulo.
// Esto garantiza que cada candidato recibe los mismos ítems en el mismo orden,
// condición indispensable para comparabilidad entre candidatos y calibración TRI.
//
// Patrón de la cuadrícula 3×3:
//   grid[0..7] = 8 celdas visibles (filas 0-2, columnas 0-2, celda (2,2) omitida)
//   options[answer] = celda correcta que completa el patrón
//
// Regla de progresión: "+1 cíclico por columna" para `count` (1→2→3→1…)
// con offset por ítem para variar la cantidad correcta.
// Forma varía por fila, color varía por columna (en ítems de dificultad media/alta),
// rotación varía por fila (en ítems de dificultad alta).
//
// Dificultad: ítems 1-4 fáciles, 5-8 medios, 9-12 difíciles.

import { AURORA } from "../utils/palette";

// ─── Tipos (espejo de los definidos en RavenMatrices.tsx) ────────────────────
// Redefinimos localmente para que este módulo no dependa del componente React.

export type ShapeId = "circle" | "square" | "triangle" | "diamond";

export interface Cell {
  shape: ShapeId;
  count: number;   // 1 | 2 | 3
  color: string;   // hex token de AURORA
  rotation: number; // 0 | 45 | 90
}

export interface RavenItem {
  /** 8 celdas visibles (posición 8 = celda (2,2) está vacía/faltante) */
  grid: Cell[];
  /** 6 opciones de respuesta (1 correcta + 5 distractores) */
  options: Cell[];
  /** Índice de la opción correcta en el array options */
  answer: number;
}

// ─── Aliases de tokens para legibilidad ─────────────────────────────────────

const T = AURORA.signal; // teal
const A = AURORA.amber;  // amber
const B = AURORA.blue;   // blue

// ─── Helpers para construir celdas ──────────────────────────────────────────

function c(shape: ShapeId, count: number, color: string, rotation: number = 0): Cell {
  return { shape, count, color, rotation };
}

// Construye un RavenItem dado la cuadrícula 3×3 completa (9 celdas)
// La celda (2,2) — índice 8 — es la correcta; se extrae y coloca en options[answer].
// Las 5 celdas distractor se reciben en orden; la función inserta la correcta en
// la posición indicada por `answerPos` (0-based dentro del array de 6 opciones).
function item(
  grid9: [Cell, Cell, Cell, Cell, Cell, Cell, Cell, Cell, Cell],
  distractors: [Cell, Cell, Cell, Cell, Cell],
  answerPos: number,
): RavenItem {
  const correct = grid9[8];
  const opts: Cell[] = [...distractors];
  opts.splice(answerPos, 0, correct);
  return {
    grid: grid9.slice(0, 8) as Cell[],
    options: opts,
    answer: answerPos,
  };
}

// ─── Banco fijo de 12 ítems ──────────────────────────────────────────────────
//
// Nomenclatura de dificultad:
//   Easy   (1-4): solo forma+count varían; color y rotación fijos
//   Medium (5-8): forma+count+color varían; rotación fija
//   Hard  (9-12): forma+count+color+rotación varían

export const RAVEN_BANK: readonly RavenItem[] = Object.freeze([

  // ── Ítem 1 (Easy) ──────────────────────────────────────────────────────────
  // Fila 0: circle; fila 1: square; fila 2: triangle
  // count offset=0 → cols 0,1,2 tienen count 1,2,3
  // Color fijo: T; rotación: 0
  item(
    [
      c("circle",   1, T), c("circle",   2, T), c("circle",   3, T),
      c("square",   1, T), c("square",   2, T), c("square",   3, T),
      c("triangle", 1, T), c("triangle", 2, T), c("triangle", 3, T),
    ],
    [
      c("triangle", 1, T), // count erróneo
      c("triangle", 2, T), // count erróneo
      c("circle",   3, T), // forma errónea
      c("square",   3, T), // forma errónea
      c("diamond",  3, T), // forma errónea
    ],
    2, // answer en posición 2
  ),

  // ── Ítem 2 (Easy) ──────────────────────────────────────────────────────────
  // count offset=1 → cols 0,1,2 tienen count 2,3,1
  // Color fijo: A; rotación: 0
  item(
    [
      c("square",   2, A), c("square",   3, A), c("square",   1, A),
      c("diamond",  2, A), c("diamond",  3, A), c("diamond",  1, A),
      c("circle",   2, A), c("circle",   3, A), c("circle",   1, A),
    ],
    [
      c("circle",   2, A),
      c("circle",   3, A),
      c("square",   1, A),
      c("triangle", 1, A),
      c("diamond",  1, A),
    ],
    0, // answer en posición 0
  ),

  // ── Ítem 3 (Easy) ──────────────────────────────────────────────────────────
  // count offset=2 → cols 0,1,2 tienen count 3,1,2
  // Color fijo: B; rotación: 0
  item(
    [
      c("triangle", 3, B), c("triangle", 1, B), c("triangle", 2, B),
      c("circle",   3, B), c("circle",   1, B), c("circle",   2, B),
      c("diamond",  3, B), c("diamond",  1, B), c("diamond",  2, B),
    ],
    [
      c("diamond",  3, B),
      c("diamond",  1, B),
      c("circle",   2, B),
      c("square",   2, B),
      c("triangle", 2, B),
    ],
    3, // answer en posición 3
  ),

  // ── Ítem 4 (Easy) ──────────────────────────────────────────────────────────
  // count offset=0; formas: diamond, triangle, square; color fijo: T; rot: 0
  item(
    [
      c("diamond",  1, T), c("diamond",  2, T), c("diamond",  3, T),
      c("triangle", 1, T), c("triangle", 2, T), c("triangle", 3, T),
      c("square",   1, T), c("square",   2, T), c("square",   3, T),
    ],
    [
      c("square",   1, T),
      c("square",   2, T),
      c("diamond",  3, T),
      c("triangle", 3, T),
      c("circle",   3, T),
    ],
    5, // answer en posición 5
  ),

  // ── Ítem 5 (Medium) ────────────────────────────────────────────────────────
  // color varía por columna: col0=T, col1=A, col2=B
  // count offset=0; formas: circle, square, triangle; rot fija: 0
  item(
    [
      c("circle",   1, T), c("circle",   2, A), c("circle",   3, B),
      c("square",   1, T), c("square",   2, A), c("square",   3, B),
      c("triangle", 1, T), c("triangle", 2, A), c("triangle", 3, B),
    ],
    [
      c("triangle", 1, T),
      c("triangle", 2, A),
      c("triangle", 2, B),
      c("circle",   3, B),
      c("square",   3, B),
    ],
    1, // answer en posición 1
  ),

  // ── Ítem 6 (Medium) ────────────────────────────────────────────────────────
  // color varía por columna: col0=A, col1=B, col2=T
  // count offset=1 → cols tienen count 2,3,1; formas: diamond, circle, square; rot: 0
  item(
    [
      c("diamond", 2, A), c("diamond", 3, B), c("diamond", 1, T),
      c("circle",  2, A), c("circle",  3, B), c("circle",  1, T),
      c("square",  2, A), c("square",  3, B), c("square",  1, T),
    ],
    [
      c("square",   2, A),
      c("square",   3, B),
      c("square",   1, A),
      c("diamond",  1, T),
      c("triangle", 1, T),
    ],
    4, // answer en posición 4
  ),

  // ── Ítem 7 (Medium) ────────────────────────────────────────────────────────
  // color varía por columna: col0=B, col1=T, col2=A
  // count offset=2 → cols tienen count 3,1,2; formas: triangle, diamond, circle; rot: 0
  item(
    [
      c("triangle", 3, B), c("triangle", 1, T), c("triangle", 2, A),
      c("diamond",  3, B), c("diamond",  1, T), c("diamond",  2, A),
      c("circle",   3, B), c("circle",   1, T), c("circle",   2, A),
    ],
    [
      c("circle",   2, B),
      c("circle",   1, T),
      c("circle",   2, T),
      c("diamond",  2, A),
      c("triangle", 2, A),
    ],
    0, // answer en posición 0 (correct: circle, 2, A)  → recheck below
    // correct = grid9[8] = c("circle", 2, A)
    // options after splice(0,0,correct): [correct, B, T, T, A, A]
    //   pos0 = circle,2,A ← correct ✓
  ),

  // ── Ítem 8 (Medium) ────────────────────────────────────────────────────────
  // color varía por columna: col0=T, col1=B, col2=A
  // count offset=0; formas: square, triangle, diamond; rot: 0
  item(
    [
      c("square",   1, T), c("square",   2, B), c("square",   3, A),
      c("triangle", 1, T), c("triangle", 2, B), c("triangle", 3, A),
      c("diamond",  1, T), c("diamond",  2, B), c("diamond",  3, A),
    ],
    [
      c("diamond",  1, T),
      c("diamond",  2, B),
      c("diamond",  3, T),
      c("square",   3, A),
      c("circle",   3, A),
    ],
    3, // answer en posición 3 (correct: diamond, 3, A)
  ),

  // ── Ítem 9 (Hard) ──────────────────────────────────────────────────────────
  // rotación varía por fila: fila0=0, fila1=45, fila2=90
  // color varía por columna: T, A, B
  // count offset=0; formas: circle, square, triangle
  item(
    [
      c("circle",   1, T,  0), c("circle",   2, A,  0), c("circle",   3, B,  0),
      c("square",   1, T, 45), c("square",   2, A, 45), c("square",   3, B, 45),
      c("triangle", 1, T, 90), c("triangle", 2, A, 90), c("triangle", 3, B, 90),
    ],
    [
      c("triangle", 1, T, 90),
      c("triangle", 2, A, 90),
      c("triangle", 3, T, 90),
      c("triangle", 3, B,  0),
      c("circle",   3, B, 90),
    ],
    2, // answer: triangle, 3, B, 90 → pos 2 after splice(2,0,correct)
    // distractors before splice: [t1T90, t2A90, t3T90, t3B0, c3B90]
    // after splice(2,0,correct=t3B90): [t1T90, t2A90, t3B90, t3T90, t3B0, c3B90]
    //   pos2 = triangle,3,B,90 ← correct ✓
  ),

  // ── Ítem 10 (Hard) ─────────────────────────────────────────────────────────
  // rotación varía por fila: 0, 45, 90
  // color varía por columna: A, T, B
  // count offset=1 → cols: 2,3,1; formas: diamond, circle, square
  item(
    [
      c("diamond", 2, A,  0), c("diamond", 3, T,  0), c("diamond", 1, B,  0),
      c("circle",  2, A, 45), c("circle",  3, T, 45), c("circle",  1, B, 45),
      c("square",  2, A, 90), c("square",  3, T, 90), c("square",  1, B, 90),
    ],
    [
      c("square",  2, A, 90),
      c("square",  3, T, 90),
      c("square",  1, A, 90),
      c("square",  1, B,  0),
      c("circle",  1, B, 90),
    ],
    4, // answer: square, 1, B, 90 → pos 4
    // distractors: [s2A90, s3T90, s1A90, s1B0, c1B90]
    // splice(4,0,correct=s1B90): [s2A90, s3T90, s1A90, s1B0, s1B90, c1B90]
    //   pos4 = square,1,B,90 ← correct ✓
  ),

  // ── Ítem 11 (Hard) ─────────────────────────────────────────────────────────
  // rotación varía por fila: 0, 90, 45
  // color varía por columna: B, T, A
  // count offset=2 → cols: 3,1,2; formas: triangle, diamond, circle
  item(
    [
      c("triangle", 3, B,  0), c("triangle", 1, T,  0), c("triangle", 2, A,  0),
      c("diamond",  3, B, 90), c("diamond",  1, T, 90), c("diamond",  2, A, 90),
      c("circle",   3, B, 45), c("circle",   1, T, 45), c("circle",   2, A, 45),
    ],
    [
      c("circle",   3, B, 45),
      c("circle",   1, T, 45),
      c("circle",   2, B, 45),
      c("circle",   2, A,  0),
      c("diamond",  2, A, 45),
    ],
    5, // answer: circle, 2, A, 45 → pos 5
    // distractors: [c3B45, c1T45, c2B45, c2A0, d2A45]
    // splice(5,0,correct=c2A45): [c3B45, c1T45, c2B45, c2A0, d2A45, c2A45]
    //   pos5 = circle,2,A,45 ← correct ✓
  ),

  // ── Ítem 12 (Hard) ─────────────────────────────────────────────────────────
  // rotación varía por fila: 45, 0, 90
  // color varía por columna: T, B, A
  // count offset=0; formas: square, triangle, diamond
  item(
    [
      c("square",   1, T, 45), c("square",   2, B, 45), c("square",   3, A, 45),
      c("triangle", 1, T,  0), c("triangle", 2, B,  0), c("triangle", 3, A,  0),
      c("diamond",  1, T, 90), c("diamond",  2, B, 90), c("diamond",  3, A, 90),
    ],
    [
      c("diamond",  1, T, 90),
      c("diamond",  2, B, 90),
      c("diamond",  3, T, 90),
      c("diamond",  3, A,  0),
      c("triangle", 3, A, 90),
    ],
    1, // answer: diamond, 3, A, 90 → pos 1
    // distractors: [d1T90, d2B90, d3T90, d3A0, t3A90]
    // splice(1,0,correct=d3A90): [d1T90, d3A90, d2B90, d3T90, d3A0, t3A90]
    //   pos1 = diamond,3,A,90 ← correct ✓
  ),

]) as readonly RavenItem[];
