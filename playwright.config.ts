import { defineConfig, devices } from "@playwright/test";

// Puerto dedicado y poco común para evitar colisiones con otros dev servers
// (Vite arranca en 5173+; usamos 5317 para no reusar el servidor de otro proyecto).
const PORT = 5317;
const BASE_URL = `http://127.0.0.1:${PORT}`;

// Suite E2E del bucle de mejora continua. Levanta el dev server de Vite
// automáticamente y corre los flujos críticos (candidato + admin) en modo demo
// local (localStorage, sin Supabase).
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["list"], ["html", { open: "never" }]],
  timeout: 30_000,
  expect: { timeout: 7_000 },
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: BASE_URL,
    // Nunca reusar un servidor externo: siempre arrancamos nuestra propia app.
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
