import { test, expect } from "@playwright/test";

test.describe("Smoke", () => {
  test("la pantalla de login carga con sus accesos", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Tu próximo rol/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Google" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Crear cuenta y continuar" })).toBeVisible();
  });

  test("modo demo local está activo (sin Supabase)", async ({ page }) => {
    await page.goto("/");
    // El acceso admin demo solo aparece cuando Supabase NO está configurado.
    await expect(page.getByRole("button", { name: "Entrar como admin" })).toBeVisible();
  });
});
