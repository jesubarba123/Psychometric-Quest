import { test, expect } from "@playwright/test";
import { signUpCandidate, completeProfile } from "./helpers";

test.describe("Flujo de candidato", () => {
  test("signup por email llega a la pantalla de intro", async ({ page }) => {
    await signUpCandidate(page, "-intro");
    await expect(page.getByRole("button", { name: /Continuar a perfil y CV/ })).toBeVisible();
  });

  test("onboarding completo llega al menú de pruebas", async ({ page }) => {
    await signUpCandidate(page, "-full");
    await completeProfile(page);

    // Pantalla de match CV → continuar
    await expect(page.getByRole("button", { name: "Continuar con este CV" })).toBeVisible();
    await page.getByRole("button", { name: "Continuar con este CV" }).click();

    // Código de candidato (precargado con DEMO-2026)
    await expect(page.getByRole("heading", { name: /Desbloquea tu evaluación/ })).toBeVisible();
    await page.getByRole("button", { name: "Validar y continuar" }).click();

    // Consentimiento
    await expect(page.getByRole("button", { name: "Acepto y comenzar" })).toBeVisible();
    await page.getByRole("button", { name: "Acepto y comenzar" }).click();

    // Menú de pruebas
    await expect(page.getByRole("heading", { name: /Elige una prueba para comenzar/ })).toBeVisible();
  });
});
