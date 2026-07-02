import { LocalRepo } from "./localRepo";
import { SupabaseRepo } from "./supabaseRepo";
import type { DataRepo } from "./types";
import { isSupabaseConfigured, supabase } from "../supabaseClient";

// Selector del backend de datos: Supabase si hay `.env` configurado (prod),
// LocalRepo (localStorage) si no (demo/E2E).
export const repo: DataRepo = isSupabaseConfigured && supabase ? new SupabaseRepo(supabase) : new LocalRepo();
