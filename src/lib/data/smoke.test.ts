import { describe, it, expect } from "vitest";

describe("vitest harness", () => {
  it("localStorage está disponible (jsdom)", () => {
    localStorage.setItem("k", "v");
    expect(localStorage.getItem("k")).toBe("v");
    localStorage.clear();
  });
});
