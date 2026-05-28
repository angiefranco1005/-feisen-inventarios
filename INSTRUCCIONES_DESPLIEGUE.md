# Feisen Inventarios — Instrucciones de despliegue

## Requisitos previos
- Node.js 20 o superior (descargar en https://nodejs.org)
- Cuenta gratuita en Supabase (https://supabase.com)

---

## PASO 1 — Configurar Supabase

1. Ve a https://supabase.com y crea un proyecto nuevo.
   - Nombre: `feisen-inventarios`
   - Contraseña de base de datos: crea una segura y guárdala
   - Región: selecciona `South America (São Paulo)` para menor latencia

2. Una vez creado el proyecto, ve a **SQL Editor** y ejecuta el contenido del archivo `supabase/schema.sql` completo.

3. Ve a **Storage** > verifica que se creó el bucket `productos-fotos` (público).
   Si no existe, créalo manualmente:
   - Bucket name: `productos-fotos`
   - Public bucket: ✅ habilitado

4. Ve a **Project Settings** > **API** y copia:
   - `Project URL` (ejemplo: `https://abcxyz.supabase.co`)
   - `anon public key`

---

## PASO 2 — Configurar el proyecto

1. Duplica el archivo `.env.example` como `.env`:
   ```
   cp .env.example .env
   ```

2. Edita `.env` y pega tus valores de Supabase:
   ```
   VITE_SUPABASE_URL=https://TU_PROYECTO.supabase.co
   VITE_SUPABASE_ANON_KEY=TU_ANON_KEY
   ```

---

## PASO 3 — Crear el primer usuario ADMIN

En Supabase Dashboard > **Authentication** > **Users** > **Add user**:
- Email: `angie.franco@feisen.com` (o el que prefieras)
- Password: contraseña segura
- Auto-confirm: ✅

Luego en **SQL Editor** ejecuta (reemplaza el ID con el del usuario recién creado):
```sql
INSERT INTO public.profiles (id, nombre, rol)
VALUES ('UUID_DEL_USUARIO_AQUI', 'Angie Franco', 'ADMIN');
```
> El UUID del usuario lo encuentras en Authentication > Users.

---

## PASO 4 — Instalar dependencias y ejecutar

```bash
cd feisen-inventarios
npm install
npm run dev
```

Abre http://localhost:5173 en el navegador.

---

## PASO 5 — Despliegue en producción (Vercel — GRATIS)

1. Sube el proyecto a GitHub.
2. Ve a https://vercel.com, conecta tu repositorio.
3. En **Environment Variables** agrega:
   - `VITE_SUPABASE_URL` = tu URL de Supabase
   - `VITE_SUPABASE_ANON_KEY` = tu anon key
4. Despliega. Vercel genera una URL como `https://feisen-inventarios.vercel.app`.

---

## PASO 6 — Crear usuarios adicionales (desde la app)

1. Inicia sesión como ADMIN.
2. Ve a **Configuración** > **Usuarios del sistema**.
3. Crea los usuarios de Efraín, William, Julián y los operarios.

> Para que esto funcione, debes desplegar la Edge Function:
> ```bash
> npm install -g supabase
> supabase login
> supabase link --project-ref TU_PROJECT_REF
> supabase functions deploy crear-usuario
> ```
> El archivo de la función está en `supabase/edge-function-crear-usuario.js`.

---

## Instalación en Android (PWA)

1. Abre la URL de producción en Chrome para Android.
2. Aparecerá un banner "Agregar a pantalla de inicio" o busca en el menú ⋮ > "Instalar app".
3. La app funciona como una aplicación nativa, sin instalar nada de Play Store.

---

## Estructura de archivos

```
feisen-inventarios/
├── src/
│   ├── components/
│   │   ├── admin/        — Dashboard, Productos, Reportes, Config
│   │   ├── bodeguero/    — Dashboard del bodeguero
│   │   ├── jefe_area/    — Dashboard del jefe de área
│   │   ├── operario/     — Interfaz simplificada para operarios
│   │   ├── movimientos/  — Formulario de registro de movimientos
│   │   └── shared/       — Layout, Modal, Alerta, Spinner
│   ├── contexts/         — AuthContext (sesión y rol)
│   ├── lib/              — Cliente Supabase
│   └── utils/            — Formateadores COP, exportación Excel
├── supabase/
│   ├── schema.sql                    — Ejecutar en Supabase SQL Editor
│   └── edge-function-crear-usuario.js — Para crear usuarios desde la app
└── public/               — Íconos y manifest PWA
```

---

## Colores de marca

| Color | Hex |
|-------|-----|
| Rojo Feisen | `#B4271D` |
| Azul Feisen | `#064794` |
| Gris fondo | `#F4F5F7` |
