import { describe, it, expect, beforeEach } from "vitest";
import { LocalRepo } from "./localRepo";

const repo = new LocalRepo();

beforeEach(() => {
  localStorage.clear();
});

describe("LocalRepo", () => {
  it("loadDatabase devuelve el seed cuando el storage está vacío", async () => {
    const db = await repo.loadDatabase();
    expect(db.positions).toHaveLength(2);
    expect(db.candidates.some((c) => c.invitationCode === "DEMO-2026")).toBe(true);
  });

  it("upsertCandidate agrega un candidato nuevo y actualiza uno existente", async () => {
    const created = await repo.createCandidate({
      name: "Nuevo Candidato",
      email: "nuevo@example.com",
      roleTarget: "QA",
    });
    let db = await repo.loadDatabase();
    expect(db.candidates.some((c) => c.id === created.id)).toBe(true);

    await repo.upsertCandidate({ ...created, name: "Nombre Cambiado" });
    db = await repo.loadDatabase();
    expect(db.candidates.find((c) => c.id === created.id)?.name).toBe("Nombre Cambiado");
  });

  it("findCandidateByCode encuentra por código sin distinguir mayúsculas", async () => {
    const found = await repo.findCandidateByCode("demo-2026");
    expect(found?.invitationCode).toBe("DEMO-2026");
  });

  it("attachCandidateInvitation fusiona la cuenta en la invitación y marca verificación", async () => {
    const account = await repo.createCandidateAccount({
      name: "Persona Real",
      email: "real@example.com",
      provider: "email",
    });
    const merged = await repo.attachCandidateInvitation(account, "DEMO-2026");
    expect(merged).not.toBeNull();
    expect(merged?.name).toBe("Persona Real");
    expect(merged?.invitationCode).toBe("DEMO-2026");
    expect(merged?.invitationVerifiedAt).toBeTruthy();
  });

  it("exportJson no incluye passwordDigest", async () => {
    await repo.createCandidateAccount({
      name: "Con Password",
      email: "pw@example.com",
      passwordDigest: "secreto-hash",
      provider: "email",
    });
    const json = await repo.exportJson();
    expect(json).not.toContain("secreto-hash");
    expect(json).not.toContain("passwordDigest");
  });

  it("exportCsv devuelve una cabecera y una fila por candidato", async () => {
    const csv = await repo.exportCsv();
    const lines = csv.split("\n");
    const db = await repo.loadDatabase();
    expect(lines[0]).toContain("name,email");
    expect(lines).toHaveLength(db.candidates.length + 1);
  });
});
