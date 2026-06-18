import { test, expect } from "@playwright/test";

test.describe("Admin", () => {
  test("el admin demo entra al dashboard con exportaciones", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Entrar como admin" }).click();

    await expect(page.getByRole("heading", { name: /Resultados y base de candidatos/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Exportar CSV" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Exportar JSON" })).toBeVisible();
  });

  test("el dashboard muestra el disclaimer de gobernanza", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Entrar como admin" }).click();
    await expect(page.getByText(/Herramienta de apoyo, no de decisión/)).toBeVisible();
    await expect(page.getByText(/no tiene validez de criterio demostrada/)).toBeVisible();
  });
});
