# Psychometric Quest Platform

MVP de plataforma de evaluación para talento:

- Login candidato con Google, Outlook/Microsoft, LinkedIn, GitHub o email + contraseña.
- Flujo por capas: sesión, perfil + CV, código de candidato, consentimiento, juegos y encuesta.
- Captura de nombre, correo, teléfono y currículum.
- Login de administrador.
- Juegos conductuales 2D.
- Encuesta de arquetipos Jung con 12 perfiles.
- Reporte descargable para candidato.
- Dashboard admin con visualizaciones y export CSV/JSON.
- Esquema Supabase en `supabase/schema.sql`.
- Fondo 2D animado con avance simbólico hacia una meta.

## Ejecutar local

```bash
npm install
npm run dev
```

Credenciales demo:

- Admin: `admin@signal.run`
- Candidato demo: inicia sesión con un botón social o crea usuario, adjunta un CV y luego usa el código `DEMO-2026`.
- Botones sociales: en modo local simulan el proveedor y crean un candidato.

El MVP usa `localStorage` para que se pueda probar sin credenciales de Supabase. La estructura de datos y RLS están documentadas en `supabase/schema.sql` para conectar la base real.

## Datos recomendados

Para el MVP no se contabiliza cada visita como dato principal. Se guarda un registro único por candidato, `last_seen_at`, `login_count`, hitos del flujo, descargas de reporte, respuestas, resultados y eventos de juego. Si más adelante se necesita analítica granular de navegación, conviene separarla en una capa de producto/analytics, no mezclarla con la base psicométrica.

## Supabase Auth

Configura proveedores en Supabase Auth:

- Google: provider `google`.
- GitHub: provider `github`.
- LinkedIn: provider `linkedin_oidc`.
- Outlook/Microsoft: provider `azure`.

Los CVs deben subirse al bucket privado `candidate-cvs`; la tabla `candidates` guarda nombre, tipo, tamaño y URL/ruta del archivo.
