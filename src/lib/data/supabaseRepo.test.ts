import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SupabaseRepo } from "./supabaseRepo";

type InsertResult = { data: unknown; error: { code?: string; message: string } | null };

// Mock a mano del cliente Supabase: solo implementamos la superficie que
// SupabaseRepo usa (auth.getUser, from(...).select(...).eq(...).maybeSingle(), rpc,
// y from(tabla).insert(row).select().single() para las escrituras de E3).
function makeClient(overrides: {
  user?: { id: string; email?: string } | null;
  profileRow?: { organization_id: string | null; role: "admin" | "candidate" } | null;
  rpcResult?: { data: unknown; error: { message: string } | null };
  // Resultados del insert().select().single() por tabla. Si se da un array, se
  // consume una entrada por cada llamada sucesiva (para probar reintentos).
  insertResults?: Record<string, InsertResult | InsertResult[]>;
}): SupabaseClient & { insertCallsByTable: Record<string, unknown[]> } {
  const user = overrides.user ?? null;
  const profileRow = overrides.profileRow ?? null;

  const maybeSingle = vi.fn().mockResolvedValue({ data: profileRow, error: null });
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });

  const rpc = vi.fn().mockResolvedValue(overrides.rpcResult ?? { data: null, error: null });

  const insertCallsByTable: Record<string, unknown[]> = {};
  const insertResults = overrides.insertResults ?? {};

  const from = vi.fn().mockImplementation((table: string) => {
    if (table in insertResults) {
      return {
        select,
        insert: vi.fn().mockImplementation((row: unknown) => {
          insertCallsByTable[table] = insertCallsByTable[table] ?? [];
          insertCallsByTable[table].push(row);
          const configured = insertResults[table];
          const results = Array.isArray(configured) ? configured : [configured];
          const callIndex = insertCallsByTable[table].length - 1;
          const result = results[Math.min(callIndex, results.length - 1)];
          return {
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue(result),
            }),
          };
        }),
      };
    }
    return { select };
  });

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
    },
    from,
    rpc,
    insertCallsByTable,
  } as unknown as SupabaseClient & { insertCallsByTable: Record<string, unknown[]> };
}

describe("SupabaseRepo.getSessionContext", () => {
  it("devuelve null si auth.getUser() no tiene user", async () => {
    const client = makeClient({ user: null });
    const repo = new SupabaseRepo(client);
    expect(await repo.getSessionContext()).toBeNull();
  });

  it("devuelve el contexto admin cuando hay user y fila en profiles", async () => {
    const client = makeClient({
      user: { id: "user-1", email: "admin@empresa.com" },
      profileRow: { organization_id: "org-1", role: "admin" },
    });
    const repo = new SupabaseRepo(client);
    const ctx = await repo.getSessionContext();
    expect(ctx).toEqual({
      userId: "user-1",
      email: "admin@empresa.com",
      role: "admin",
      organizationId: "org-1",
    });
  });

  it("devuelve role candidate y organizationId null cuando no hay fila de profile", async () => {
    const client = makeClient({
      user: { id: "user-2", email: "candidato@empresa.com" },
      profileRow: null,
    });
    const repo = new SupabaseRepo(client);
    const ctx = await repo.getSessionContext();
    expect(ctx).toEqual({
      userId: "user-2",
      email: "candidato@empresa.com",
      role: "candidate",
      organizationId: null,
    });
  });
});

describe("SupabaseRepo.ensureAdminOrg", () => {
  it("llama al rpc ensure_admin_org con p_org_name y devuelve organizationId", async () => {
    const client = makeClient({ rpcResult: { data: "org-uuid-123", error: null } });
    const repo = new SupabaseRepo(client);
    const result = await repo.ensureAdminOrg("Mi Org");
    expect(client.rpc).toHaveBeenCalledWith("ensure_admin_org", { p_org_name: "Mi Org" });
    expect(result).toEqual({ organizationId: "org-uuid-123" });
  });

  it("lanza Error con el mensaje del rpc si este devuelve error", async () => {
    const client = makeClient({ rpcResult: { data: null, error: { message: "Not authorized" } } });
    const repo = new SupabaseRepo(client);
    await expect(repo.ensureAdminOrg("Mi Org")).rejects.toThrow("Not authorized");
  });
});

describe("SupabaseRepo — métodos aún no implementados", () => {
  it("loadDatabase lanza un error que referencia la etapa E5 del plan", async () => {
    const client = makeClient({});
    const repo = new SupabaseRepo(client);
    await expect(repo.loadDatabase()).rejects.toThrow(/E5/);
  });
});

describe("SupabaseRepo.createPosition", () => {
  const adminUser = { id: "user-1", email: "admin@empresa.com" };
  const adminProfile = { organization_id: "org-1", role: "admin" as const };

  it("con sesión admin inserta en 'positions' y devuelve un JobPosition mapeado", async () => {
    const insertedRow = {
      id: "pos-1",
      title: "Product Ops Analyst",
      department: "Producto",
      location: "Remoto",
      jd: "Descripción del puesto",
      status: "open",
      enabled_assessments: ["bigfive", "behavioral"],
      created_at: "2026-07-01T00:00:00.000Z",
    };
    const client = makeClient({
      user: adminUser,
      profileRow: adminProfile,
      insertResults: { positions: { data: insertedRow, error: null } },
    });
    const repo = new SupabaseRepo(client);

    const result = await repo.createPosition({
      title: "Product Ops Analyst",
      department: "Producto",
      location: "Remoto",
      jd: "Descripción del puesto",
      enabledAssessments: ["bigfive", "behavioral"],
    });

    const calls = (client as unknown as { insertCallsByTable: Record<string, unknown[]> }).insertCallsByTable;
    expect(calls.positions).toHaveLength(1);
    expect(calls.positions[0]).toMatchObject({
      organization_id: "org-1",
      title: "Product Ops Analyst",
      jd: "Descripción del puesto",
      status: "open",
      enabled_assessments: ["bigfive", "behavioral"],
    });

    expect(result).toEqual({
      id: "pos-1",
      title: "Product Ops Analyst",
      department: "Producto",
      location: "Remoto",
      jd: "Descripción del puesto",
      status: "open",
      createdAt: "2026-07-01T00:00:00.000Z",
      enabledAssessments: ["bigfive", "behavioral"],
    });
  });

  it("usa enabled_assessments: [] cuando input.enabledAssessments es undefined", async () => {
    const insertedRow = {
      id: "pos-2",
      title: "CS Lead",
      department: null,
      location: null,
      jd: "JD",
      status: "open",
      enabled_assessments: [],
      created_at: "2026-07-01T00:00:00.000Z",
    };
    const client = makeClient({
      user: adminUser,
      profileRow: adminProfile,
      insertResults: { positions: { data: insertedRow, error: null } },
    });
    const repo = new SupabaseRepo(client);

    const result = await repo.createPosition({ title: "CS Lead", jd: "JD" });

    const calls = (client as unknown as { insertCallsByTable: Record<string, unknown[]> }).insertCallsByTable;
    expect(calls.positions[0]).toMatchObject({ enabled_assessments: [] });
    expect(result.enabledAssessments).toBeUndefined();
  });

  it("sin sesión (user null) lanza Error que menciona 'admin'", async () => {
    const client = makeClient({ user: null });
    const repo = new SupabaseRepo(client);
    await expect(repo.createPosition({ title: "X", jd: "Y" })).rejects.toThrow(/admin/i);
  });

  it("con sesión de candidato lanza Error que menciona 'admin'", async () => {
    const client = makeClient({
      user: { id: "user-2", email: "candidato@empresa.com" },
      profileRow: { organization_id: "org-1", role: "candidate" },
    });
    const repo = new SupabaseRepo(client);
    await expect(repo.createPosition({ title: "X", jd: "Y" })).rejects.toThrow(/admin/i);
  });

  it("con sesión sin profile (rol candidate por defecto) lanza Error que menciona 'admin'", async () => {
    const client = makeClient({
      user: { id: "user-3", email: "sinprofile@empresa.com" },
      profileRow: null,
    });
    const repo = new SupabaseRepo(client);
    await expect(repo.createPosition({ title: "X", jd: "Y" })).rejects.toThrow(/admin/i);
  });
});

describe("SupabaseRepo.createCandidate", () => {
  const adminUser = { id: "user-1", email: "admin@empresa.com" };
  const adminProfile = { organization_id: "org-1", role: "admin" as const };

  it("con sesión admin inserta en 'candidates' y devuelve un Candidate mapeado", async () => {
    const insertedRow = {
      id: "cand-1",
      position_id: "pos-1",
      full_name: "Ana Torres",
      email: "ana@example.com",
      phone: "555-1234",
      role_target: "Product Ops Analyst",
      invitation_code: "ANA-1234",
      auth_provider: "invitation",
      status: "invited",
      created_at: "2026-07-01T00:00:00.000Z",
    };
    const client = makeClient({
      user: adminUser,
      profileRow: adminProfile,
      insertResults: { candidates: { data: insertedRow, error: null } },
    });
    const repo = new SupabaseRepo(client);

    const result = await repo.createCandidate({
      name: "Ana Torres",
      email: "ana@example.com",
      phone: "555-1234",
      roleTarget: "Product Ops Analyst",
      positionId: "pos-1",
    });

    const calls = (client as unknown as { insertCallsByTable: Record<string, unknown[]> }).insertCallsByTable;
    expect(calls.candidates).toHaveLength(1);
    const insertedInput = calls.candidates[0] as Record<string, unknown>;
    expect(insertedInput).toMatchObject({
      organization_id: "org-1",
      position_id: "pos-1",
      full_name: "Ana Torres",
      email: "ana@example.com",
      phone: "555-1234",
      role_target: "Product Ops Analyst",
      auth_provider: "invitation",
      status: "invited",
    });
    expect(insertedInput.invitation_code).toMatch(/^[A-Z]{3}-\d{4}$/);

    expect(result).toEqual({
      id: "cand-1",
      name: "Ana Torres",
      email: "ana@example.com",
      phone: "555-1234",
      roleTarget: "Product Ops Analyst",
      positionId: "pos-1",
      invitationCode: "ANA-1234",
      authProvider: "invitation",
      status: "invited",
      createdAt: "2026-07-01T00:00:00.000Z",
      events: [],
    });
  });

  it("sin sesión (user null) lanza Error que menciona 'admin'", async () => {
    const client = makeClient({ user: null });
    const repo = new SupabaseRepo(client);
    await expect(
      repo.createCandidate({ name: "Ana", email: "ana@example.com", roleTarget: "X" })
    ).rejects.toThrow(/admin/i);
  });

  it("con sesión de candidato lanza Error que menciona 'admin'", async () => {
    const client = makeClient({
      user: { id: "user-2", email: "candidato@empresa.com" },
      profileRow: { organization_id: "org-1", role: "candidate" },
    });
    const repo = new SupabaseRepo(client);
    await expect(
      repo.createCandidate({ name: "Ana", email: "ana@example.com", roleTarget: "X" })
    ).rejects.toThrow(/admin/i);
  });

  it("reintenta cuando el insert falla por colisión de invitation_code (23505) y en el segundo intento tiene éxito", async () => {
    const insertedRow = {
      id: "cand-2",
      position_id: null,
      full_name: "Diego Salas",
      email: "diego@example.com",
      phone: null,
      role_target: "Product Designer",
      invitation_code: "DIE-5678",
      auth_provider: "invitation",
      status: "invited",
      created_at: "2026-07-01T00:00:00.000Z",
    };
    const client = makeClient({
      user: adminUser,
      profileRow: adminProfile,
      insertResults: {
        candidates: [
          { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } },
          { data: insertedRow, error: null },
        ],
      },
    });
    const repo = new SupabaseRepo(client);

    const result = await repo.createCandidate({
      name: "Diego Salas",
      email: "diego@example.com",
      roleTarget: "Product Designer",
    });

    const calls = (client as unknown as { insertCallsByTable: Record<string, unknown[]> }).insertCallsByTable;
    expect(calls.candidates).toHaveLength(2);
    expect(result.id).toBe("cand-2");
    expect(result.invitationCode).toBe("DIE-5678");
  });

  it("lanza tras 3 fallos 23505 consecutivos", async () => {
    const duplicateError = { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } };
    const client = makeClient({
      user: adminUser,
      profileRow: adminProfile,
      insertResults: {
        candidates: [duplicateError, duplicateError, duplicateError],
      },
    });
    const repo = new SupabaseRepo(client);

    await expect(
      repo.createCandidate({ name: "Diego Salas", email: "diego@example.com", roleTarget: "Product Designer" })
    ).rejects.toThrow();

    const calls = (client as unknown as { insertCallsByTable: Record<string, unknown[]> }).insertCallsByTable;
    expect(calls.candidates).toHaveLength(3);
  });
});
