import { type Page, expect } from "@playwright/test";

// Crea una cuenta de candidato por email (flujo determinista, sin OAuth real).
// Deja al usuario en la pantalla de intro ("Toma el control…").
export async function signUpCandidate(page: Page, suffix = "") {
  await page.goto("/");
  await page.getByLabel("Nombre completo").fill(`Test Candidate${suffix}`);
  await page.getByLabel("Correo", { exact: true }).fill(`test.candidate${suffix}@example.com`);
  await page.getByLabel("Teléfono").fill("5551234567");
  await page.getByLabel("Contraseña", { exact: true }).fill("Password123");
  await page.getByLabel("Repite tu contraseña").fill("Password123");
  await page.getByRole("button", { name: "Crear cuenta y continuar" }).click();
  await expect(page.getByRole("heading", { name: /Toma el control/ })).toBeVisible();
}

// Completa el perfil + CV y avanza hasta la pantalla de match de CV.
export async function completeProfile(page: Page) {
  await page.getByRole("button", { name: /Continuar a perfil y CV/ }).click();
  await expect(page.getByRole("heading", { name: /Completa tu candidatura/ })).toBeVisible();

  await page.getByLabel("Carrera que estudiaste").fill("Ingeniería Industrial");
  await page.getByLabel("Años de experiencia en puestos similares").fill("3");
  await page.getByLabel("Nivel de inglés").selectOption("Intermedio");
  await page
    .getByLabel("Resumen ejecutivo de tu experiencia profesional")
    .fill("Analista con experiencia en operaciones, datos y mejora de procesos.");

  await page.locator('input[type="file"][accept*="pdf"]').setInputFiles({
    name: "cv.docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: Buffer.from("Experiencia en operaciones, análisis de datos y mejora de procesos."),
  });

  await page.getByRole("button", { name: "Guardar perfil y continuar" }).click();
}
