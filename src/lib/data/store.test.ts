import { describe, it, expect, beforeEach } from "vitest";
import { hydrate, snapshot, createPosition } from "./store";

beforeEach(() => {
  localStorage.clear();
});

describe("store", () => {
  it("snapshot() antes de hydrate() devuelve vacío sin lanzar", () => {
    expect(snapshot()).toEqual({ candidates: [], positions: [] });
  });

  it("tras hydrate(), snapshot() devuelve el seed", async () => {
    await hydrate();
    const db = snapshot();
    expect(db.positions.length).toBeGreaterThanOrEqual(2);
    expect(db.candidates.some((c) => c.id === "cand-demo")).toBe(true);
  });

  it("createPosition actualiza snapshot() sin llamar hydrate() de nuevo", async () => {
    await hydrate();
    await createPosition({ title: "QA Lead", jd: "Responsable de calidad y automatización." });
    const db = snapshot();
    expect(db.positions.some((p) => p.title === "QA Lead")).toBe(true);
  });
});
