# Bucle de mejora continua — Runbook del orquestador

Este documento es el **runbook autoritativo** que ejecuta la rutina diaria (9:00 a. m. America/Lima).
La sesión que corre esto es el **ORQUESTADOR**. Los subagentes especializados hacen el trabajo; el
orquestador los despacha, secuencia el bucle y abre el PR. (Un subagente no puede invocar a otros
subagentes: por eso orquesta la sesión principal, no el PM).

## Meta de cada corrida
Al terminar, el producto debe tener **UNA mejora notable y verificada** (typecheck + build + E2E en verde)
y estar **un paso más cerca del despliegue oficial**. Calidad sobre cantidad: una mejora bien hecha por día.

## Reglas duras
- **Nunca** trabajes sobre `main`. Crea una rama y abre un **PR** (no hagas merge).
- **Nunca** dejes el repo roto: si no logras dejar todo verde, revierte tu cambio y documenta por qué.
- **Evidencia antes que afirmaciones**: no digas "pasa" sin pegar el output que lo prueba.
- Si un subagente nombrado **no está disponible** en este entorno (p. ej. los `vercel:*`), haz tú ese
  análisis de forma resumida o sáltalo, y continúa el bucle. No te detengas por eso.
- Una sola mejora por corrida. No repitas mejoras ya hechas (revisa PRs/commits recientes y los docs de auditoría).

## Fase 0 — Preparación
1. En el repo ya clonado: `npm ci` (o `npm install` si falla) y `npx playwright install --with-deps chromium`.
2. Verifica la línea base en verde: `npm run typecheck`, `npm run build`, `npm run test:e2e`.
   Si la base ya está roja, tu mejora de hoy es **arreglar eso** (salta a Fase 3 con ese objetivo).
3. `git checkout -b mejora/AAAA-MM-DD` (usa la fecha de hoy).
4. Lee `docs/QA_AUDIT.md` y `docs/PSYCHOMETRIC_AUDIT.md` si existen: contexto de hallazgos previos.

## Fase 1 — Opiniones en paralelo (todos opinan a la vez)
Despacha **en paralelo** estos subagentes. **NO incluyas `reviewer` ni `sdet-qa-reviewer`** en esta fase.
A cada uno dale el mismo encargo:

> "Revisa el estado actual del proyecto desde tu especialidad. Da un diagnóstico breve y propón **UNA**
> mejora concreta, pequeña y accionable que nos acerque al despliegue oficial. Sé específico: nombra
> archivo/flujo, di qué cambiar y por qué importa ahora. Nada genérico."

Participantes (los que existan en el entorno):
- `ux-researcher`
- `ui-designer`
- `frontend-dev`
- `psychometrics-auditor`
- `vercel:performance-optimizer` *(si está disponible)*
- `vercel:deployment-expert` *(si está disponible)*
- `vercel:ai-architect` *(solo si hay trabajo de IA pertinente)*

Recoge todos sus reportes.

## Fase 2 — Decisión del PM
Despacha `senior-pm-strategist` pasándole **todas las opiniones de la Fase 1** + el estado de la línea base
(typecheck/build/E2E) como "Señales analizadas". Pídele que **priorice y elija UNA sola mejora** y produzca
su **ticket ejecutable** (en su formato habitual), indicando **qué agente(s) la implementan** y los
criterios de aceptación verificables. Esa es la decisión del día.

## Fase 3 — Ejecución de la mejora
Despacha al/los agente(s) que indicó el PM (típicamente `frontend-dev`, guiado por la spec de `ui-designer`
si el cambio es de UI) con el ticket del PM. Exige:
- Cambios pequeños y verificables; reutilizar componentes/tokens existentes; estados de carga/vacío/error.
- Tras editar: correr `npm run typecheck` y `npm run build` y dejarlos en verde antes de entregar.
- Si la mejora cambia comportamiento observable, **actualizar o agregar un test E2E** en `e2e/`.

## Fase 4 — Auditoría de calidad (`reviewer`)
Despacha `reviewer` (solo lectura) para auditar correctitud, calidad y accesibilidad del cambio.
Si encuentra problemas **bloqueantes**, vuelve a la Fase 3 con sus notas. Máximo **2 vueltas**; luego sigue.

## Fase 5 — QA automatizado con Playwright (`sdet-qa-reviewer`)
Despacha `sdet-qa-reviewer`. Su encargo: correr `npm run typecheck`, `npm run build` y `npm run test:e2e`,
capturar el resultado real, y por cada fallo emitir un **brief de arreglo** dirigido al agente responsable.
- Si hay fallos: despacha al agente indicado para arreglarlos y **re-corre** la suite.
- Repite hasta verde o **máximo 3 rondas**. Si tras 3 rondas algo sigue rojo, **detente** y documéntalo.
- Deja el reporte en `docs/QA_AUDIT.md`.

## Fase 6 — Cierre y PR
1. Confirma con evidencia que `typecheck`, `build` y `test:e2e` están **verdes**.
2. `git add -A && git commit` con un mensaje claro (qué mejoró y por qué).
3. `git push -u origin mejora/AAAA-MM-DD`.
4. Abre un PR. Preferido: `gh pr create --fill --base main`. Si `gh` no está disponible, deja la rama
   pusheada e imprime la URL de comparación (`https://github.com/<org>/<repo>/compare/main...mejora/AAAA-MM-DD`).
   El cuerpo del PR debe incluir: **la mejora**, **por qué importa**, **evidencia de QA** (output verde),
   y **qué falta para el despliegue oficial**.
5. Cierra con un resumen de una línea: qué mejoró hoy y el siguiente paso hacia producción.

## Roster de agentes (todos globales, vendorizados en `.claude/agents/`)
| Agente | Rol en el bucle |
|---|---|
| `ux-researcher`, `ui-designer`, `frontend-dev`, `psychometrics-auditor` | Opinan (Fase 1) e implementan (Fase 3) |
| `senior-pm-strategist` | Decide la mejora del día (Fase 2) |
| `reviewer` | Audita calidad (Fase 4) — solo lectura |
| `sdet-qa-reviewer` | Corre Playwright y delega arreglos (Fase 5) |
| `vercel:*` | Opcionales; solo si el entorno los tiene |
