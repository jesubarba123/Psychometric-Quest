import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SupabaseRepo } from "./supabaseRepo";

// Mock a mano del cliente Supabase: solo implementamos la superficie que
// SupabaseRepo usa (auth.getUser, from(...).select(...).eq(...).maybeSingle(), rpc).
function makeClient(overrides: {
  user?: { id: string; email?: string } | null;
  profileRow?: { organization_id: string | null; role: "admin" | "candidate" } | null;
  rpcResult?: { data: unknown; error: { message: string } | null };
}): SupabaseClient {
  const user = overrides.user ?? null;
  const profileRow = overrides.profileRow ?? null;

  const maybeSingle = vi.fn().mockResolvedValue({ data: profileRow, error: null });
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });

  const rpc = vi.fn().mockResolvedValue(overrides.rpcResult ?? { data: null, error: null });

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
    },
    from,
    rpc,
  } as unknown as SupabaseClient;
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
