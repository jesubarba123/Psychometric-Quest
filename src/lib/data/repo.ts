import { LocalRepo } from "./localRepo";
import type { DataRepo } from "./types";

// Selector del backend de datos. En esta fase solo existe LocalRepo (modo demo).
// La Fase 3 añadirá SupabaseRepo y el branch `isSupabaseConfigured ? supabase : local`.
export const repo: DataRepo = new LocalRepo();
