import { describe, it, expect, beforeEach, vi } from "vitest";
import { hydrate, snapshot, createPosition } from "./store";

beforeEach(() => {
  localStorage.clear();
});

describe("store — hydrate() ante fallo del repo", () => {
  it("propaga el error de repo.loadDatabase() pero snapshot() sigue devolviendo el último estado válido sin lanzar", async () => {
    vi.resetModules();
    vi.doMock("./repo", () => ({
      repo: {
        loadDatabase: vi.fn().mockRejectedValue(new Error("SupabaseRepo.loadDatabase: no implementado aún (llega en E5 del plan)")),
      },
    }));

    const storeWithFailingRepo = await import("./store");

    // snapshot() antes de hydrate() no lanza y devuelve el estado inicial vacío.
    expect(storeWithFailingRepo.snapshot()).toEqual({ candidates: [], positions: [] });

    // hydrate() propaga el rechazo del repo.
    await expect(storeWithFailingRepo.hydrate()).rejects.toThrow("no implementado");

    // snapshot() sigue devolviendo el último estado válido (el inicial) sin lanzar.
    expect(storeWithFailingRepo.snapshot()).toEqual({ candidates: [], positions: [] });

    vi.doUnmock("./repo");
    vi.resetModules();
  });
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
