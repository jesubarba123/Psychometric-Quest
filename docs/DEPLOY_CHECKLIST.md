# Checklist de despliegue — Psychometric Quest (Vía A: Supabase + Vercel)

App: SPA React 19 + Vite. Hoy corre en **modo demo (localStorage)** porque no hay `.env` con credenciales
(`src/lib/supabaseClient.ts` activa Supabase solo si existen `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`).
Este checklist la conecta a Supabase real y la despliega en Vercel.

> Marca cada paso. Los que requieren **decisión/cuenta tuya** van con 👤. Los que necesitan **cambio de código** van con 🛠️.

---

## 0. Antes de empezar (decisiones del dueño) 👤
- [ ] **Política de uso:** confirmar que es *apoyo a entrevista / cribado asistido*, NO filtro automático (ya hay disclaimer en el dashboard). No comunicar "predice desempeño" hasta validar.
- [ ] **Almacenamiento del CV:** Supabase Storage (recomendado prod) vs. `dataUrl` en localStorage (actual). Si eliges Storage, es un cambio de código (ver paso 3). 🛠️
- [ ] **Auth de admin:** decidir cómo entra el admin en producción (ver ⚠️ en el paso 4 — hoy falta).

## 1. Proyecto Supabase
- [ ] Crear proyecto en https://supabase.com (o usar uno existente).
- [ ] Copiar de **Settings → API**: `Project URL` y la `anon`/`publishable key`.
  - ⚠️ Usa SOLO la anon key en el cliente (viaja al navegador por diseño). **Nunca** pongas la `service_role` en variables `VITE_*`.

## 2. Aplicar el esquema
- [ ] Abrir **SQL Editor** en Supabase y ejecutar el contenido de `supabase/schema.sql` (tablas + RLS).
  - Alternativa CLI: `supabase db push` o `psql "<connection string>" -f supabase/schema.sql`.
- [ ] Verificar en **Table Editor** que se crearon las tablas y que **RLS está habilitado** en cada una.
- [ ] 👤 Revisar las **políticas RLS**: un candidato solo debe ver/escribir lo suyo; el admin ve agregado. (QA audit, ítem dueño #3.)

## 3. Storage para CVs
- [ ] Crear un **bucket privado** llamado `candidate-cvs` (Storage → New bucket → uncheck "Public").
- [ ] Definir políticas del bucket (solo el dueño sube/lee su archivo; admin lee).
- [ ] 🛠️ **Wiring de subida:** hoy el CV se guarda como `dataUrl` en localStorage (`CandidateProfile.loadCv` en `src/App.tsx`). Para producción, subir el archivo a `candidate-cvs` y guardar la ruta/URL en la tabla `candidates`. (Cambio de código — buen candidato para el bucle o un PR dedicado.)

## 4. Auth providers (Supabase Auth)
El código mapea: Google→`google`, Outlook→`azure`, LinkedIn→`linkedin_oidc`, GitHub→`github`, y email/contraseña.
- [ ] En **Authentication → Providers**, habilitar: Email, Google, GitHub, LinkedIn (OIDC), Azure.
- [ ] Para cada OAuth: crear la app en el proveedor (client id/secret) y poner el **redirect** a
      `https://<tu-proyecto>.supabase.co/auth/v1/callback`.
- [ ] En **Authentication → URL Configuration**: setear **Site URL** y **Redirect URLs** con tu dominio de Vercel
      y `http://127.0.0.1:5173` para dev (el código usa `redirectTo: window.location.origin`).
- [ ] ⚠️ 🛠️ **GAP de admin:** hoy el único acceso admin es el botón demo "Entrar como admin", que **se oculta cuando Supabase está configurado** (`App.tsx`: `{!isSupabaseConfigured && ...}`). Es decir, **en producción no hay forma de entrar como admin**. Hay que implementar auth real de admin (p. ej. usuario Supabase con `role=admin` en metadata y gatear la pantalla `admin` por ese rol). **Bloqueante para usar el dashboard en prod.**

## 5. Variables de entorno en Vercel
- [ ] Agregar (Production + Preview + Development):
  - `VITE_SUPABASE_URL` = Project URL
  - `VITE_SUPABASE_ANON_KEY` = anon key
- [ ] CLI: `vercel env add VITE_SUPABASE_URL` y `vercel env add VITE_SUPABASE_ANON_KEY` (o por el dashboard).
- [ ] Local: crear `.env` (está en `.gitignore`) con esas dos vars para probar el modo Supabase en dev.

## 6. Deploy en Vercel
- El proyecto ya está linkeado (`.vercel/project.json` → `psychometric-quest`).
- [ ] Build: `npm run build` · Output: `dist` · Framework: Vite (autodetectado).
- [ ] Desplegar: `vercel --prod` (o push a `main` si tienes Git integration — ⚠️ eso dispara deploy de producción automáticamente).
- [ ] (Opcional) `vercel.json`/`vercel.ts` para rewrites SPA si hiciera falta; esta app es de una sola página por estado, normalmente no requiere fallback de rutas.

## 7. Verificación post-deploy
- [ ] Smoke manual en la URL viva: flujo candidato (login social/email → perfil + CV → código → consentimiento → pruebas → reporte) y admin.
- [ ] 👤 Probar RLS: un candidato NO puede leer datos de otro; el bucket `candidate-cvs` no es accesible públicamente.
- [ ] (Opcional) Apuntar la suite Playwright a la URL desplegada con un `baseURL` por env var, como smoke de producción.

---

## Resumen de bloqueantes reales para un piloto con datos
1. 🛠️ **Auth de admin en prod** (paso 4) — sin esto no hay dashboard utilizable.
2. 🛠️ **Subida de CV a Storage** (paso 3) si no quieres depender de localStorage.
3. 👤 **Revisar RLS/PII** (pasos 2 y 7).
4. 👤 Credenciales + providers OAuth (pasos 1, 4, 5).

> Validez psicométrica (outcomes reales, N≥30, normas, equidad) es un track aparte y más largo — ver `docs/PSYCHOMETRIC_AUDIT.md`. El bucle diario lo va atacando por la prioridad "Fase 0".
