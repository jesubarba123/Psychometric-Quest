// scoreBand.test.ts — TDD C4: helper puro de banda de incertidumbre
//
// UMBRALES DE CATEGORÍA (según spec score-uncertainty.md §5, Estado 1):
//   value >= 60  → "Alto"   (modificador: "high")
//   value <= 40  → "Bajo"   (modificador: "low")
//   41–59        → "Medio"  (modificador: "mid")
//
// CÁLCULO DE BANDA:
//   sem_proxy = 10 (puntos) mientras C5 no entregue SEM real por constructo
//   low  = Math.max(0,   Math.round(value - sem))
//   high = Math.min(100, Math.round(value + sem))
//
// ZONAS DEL TRACK (para la zona de incertidumbre visual):
//   uncertaintyLeft  = `${Math.max(0, value - sem)}%`
//   uncertaintyWidth = `${Math.min(100, value + sem) - Math.max(0, value - sem)}%`
//
// Nota: los cortes son provisionales (C5 / psicometrista los puede afinar).
// Documentados también en docs/SCORING.md (pendiente C5).

import { describe, it, expect } from "vitest";
import { scoreBand } from "./scoreBand";

describe("scoreBand", () => {
  // ── Caso base del spec ────────────────────────────────────────────────────────

  it("scoreBand(64) → { low:54, high:74, category:'Alto' }", () => {
    // value=64, sem_proxy=10 → low=54, high=74
    // category: value=64 >= 60 → "Alto" (spec §5 Estado 1: category = value>=60 ? "Alto" : value<=40 ? "Bajo" : "Medio")
    // Nota: el spec nombra el test como "Medio" en la tarea pero los cortes definidos
    // en §5 son: >=60=Alto, <=40=Bajo, resto=Medio. Con value=64 el resultado correcto es "Alto".
    const result = scoreBand(64);
    expect(result.low).toBe(54);
    expect(result.high).toBe(74);
    expect(result.category).toBe("Alto");
  });

  // ── Clamps de rango ───────────────────────────────────────────────────────────

  it("scoreBand(95) → high=100 (clamp superior)", () => {
    const result = scoreBand(95);
    expect(result.high).toBe(100);
    expect(result.low).toBe(85);
    expect(result.category).toBe("Alto");
  });

  it("scoreBand(5) → low=0 (clamp inferior)", () => {
    const result = scoreBand(5);
    expect(result.low).toBe(0);
    expect(result.high).toBe(15);
    expect(result.category).toBe("Bajo");
  });

  // ── Cortes de categoría ───────────────────────────────────────────────────────

  it("category='Alto' cuando value >= 60", () => {
    expect(scoreBand(60).category).toBe("Alto");
    expect(scoreBand(75).category).toBe("Alto");
    expect(scoreBand(100).category).toBe("Alto");
  });

  it("category='Bajo' cuando value <= 40", () => {
    expect(scoreBand(40).category).toBe("Bajo");
    expect(scoreBand(20).category).toBe("Bajo");
    expect(scoreBand(0).category).toBe("Bajo");
  });

  it("category='Medio' cuando 41 <= value <= 59", () => {
    expect(scoreBand(41).category).toBe("Medio");
    expect(scoreBand(50).category).toBe("Medio");
    expect(scoreBand(59).category).toBe("Medio");
  });

  // ── SEM personalizado (preparado para C5) ────────────────────────────────────

  it("acepta sem personalizado: scoreBand(50, 5) → low=45, high=55", () => {
    const result = scoreBand(50, 5);
    expect(result.low).toBe(45);
    expect(result.high).toBe(55);
    expect(result.category).toBe("Medio");
  });

  // ── categoryModifier para CSS ─────────────────────────────────────────────────

  it("categoryModifier='high' cuando value >= 60", () => {
    expect(scoreBand(60).categoryModifier).toBe("high");
  });

  it("categoryModifier='low' cuando value <= 40", () => {
    expect(scoreBand(30).categoryModifier).toBe("low");
  });

  it("categoryModifier='mid' cuando 41 <= value <= 59", () => {
    expect(scoreBand(50).categoryModifier).toBe("mid");
  });

  // ── Zonas visuales del track ──────────────────────────────────────────────────

  it("uncertaintyLeft y uncertaintyWidth correctos para value=64, sem=10", () => {
    const result = scoreBand(64);
    // left  = max(0, 64-10) = 54 → "54%"
    // right = min(100, 64+10) = 74 → width = 74-54 = 20 → "20%"
    expect(result.uncertaintyLeft).toBe("54%");
    expect(result.uncertaintyWidth).toBe("20%");
  });

  it("uncertaintyLeft clampea a 0% cuando value-sem < 0", () => {
    const result = scoreBand(5);
    // left  = max(0, 5-10) = 0 → "0%"
    // right = min(100, 5+10) = 15 → width = 15-0 = 15 → "15%"
    expect(result.uncertaintyLeft).toBe("0%");
    expect(result.uncertaintyWidth).toBe("15%");
  });

  it("uncertaintyWidth clampea cuando value+sem > 100", () => {
    const result = scoreBand(95);
    // left  = max(0, 95-10) = 85 → "85%"
    // right = min(100, 95+10) = 100 → width = 100-85 = 15 → "15%"
    expect(result.uncertaintyLeft).toBe("85%");
    expect(result.uncertaintyWidth).toBe("15%");
  });
});
