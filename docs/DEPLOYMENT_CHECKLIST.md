# Despliegue en un proyecto Supabase nuevo — pasos en orden

**Qué es esto**: todo lo que hace falta, además de las migraciones, para levantar
AviationJobTalent en un proyecto Supabase desde cero.

> ## ⚠ Alcance de lo verificado — léelo antes de fiarte de este documento
>
> El ensayo en limpio que originó este checklist **no llegó a ejecutarse**. Se creó
> el proyecto desechable pero no fue posible correr las migraciones contra él desde
> el entorno de trabajo:
>
> - El canal MCP (`apply_migration`) exige que el SQL pase por el contexto del
>   modelo, y las migraciones suman **548 KB** (`020_easa_full_catalog.sql` sola,
>   168 KB).
> - El `SUPABASE_ACCESS_TOKEN` del entorno pertenece a **otro proyecto**
>   (`tienda-buey-dev`): `403` contra cualquier endpoint de RotoraxisMatch.
> - No hay `psql` ni cliente `pg` instalados.
>
> Por tanto, **cada línea de abajo está marcada con su origen**:
> **[VERIFICADO]** = comprobado contra `rotoaxismatch-dev` en vivo ·
> **[DEDUCIDO]** = leído del código o de las migraciones, no ejecutado en limpio.
>
> Lo que sigue sin saberse, y sólo lo dirá una ejecución real desde cero: si las
> migraciones aplican **en orden y sin estado previo**. En `rotoaxismatch-dev` se
> aplicaron incrementalmente a lo largo de meses, que no es lo mismo.

---

## 0. Antes de empezar

- [ ] Proyecto Supabase creado, región elegida, contraseña de BD guardada.
- [ ] Supabase CLI instalado y `supabase link --project-ref <ref>`.
      **[DEDUCIDO]** No hay CLI en el entorno de desarrollo actual; es la vía
      recomendada para el paso 1 precisamente porque evita el problema de tamaño.

## 1. Migraciones

- [ ] `supabase db push` (o aplicar `supabase/migrations/*.sql` en orden numérico).

> ### Colisión de versión `014` — RESUELTA 2026-07-31 [VERIFICADO en ejecución real]
>
> Había **dos migraciones con el número 014**, y no era un riesgo teórico:
> `supabase db push` **fallaba** al llegar a la segunda, porque
> `supabase_migrations.schema_migrations.version` es clave primaria y ambas
> producían la versión `014`. Un despliegue limpio desde los ficheros era
> imposible.
>
> Renombradas a `0140_dedup_technician_profiles.sql` y
> `0141_remove_member_deletes_user.sql`.
>
> **Por qué se renombraron LAS DOS y no sólo una** — el orden lo decide el
> **nombre de fichero completo**, en bytes:
> `fs.ReadDir` de Go *"returns a list of directory entries sorted by filename"*,
> y el parser de la CLI es `^([0-9]+)_(.*)\.sql$` (extrae la versión, no ordena).
> Con `0141_remove` junto a `014_dedup`, el `_` (0x5F) pierde contra el `1`
> (0x31): **`0141_remove` ordenaría ANTES que `014_dedup`**, invirtiendo las dos
> en silencio. Compartir longitud de prefijo (`0140`/`0141`) es lo que mantiene
> el orden correcto, y ambas siguen cayendo entre `013` y `015`.
>
> Orden verificado contra el aplicado en dev: `dedup` (20260608094644) antes que
> `remove_member` (20260624114937). Renombrar en local **no afecta a dev**, que
> registra por versión de timestamp, no por nombre de fichero.

- Total: **42 ficheros** (001–041, ya sin colisiones). **[VERIFICADO]**
- Barrido posterior: **cero** colisiones de versión y **cero** nombres que no
  parseen como `^[0-9]+_.*\.sql$`. **[VERIFICADO]**
- `020_easa_full_catalog.sql` es regenerable con `npm run generate:easa-catalog`
  a partir de `scripts/data/easa_type_ratings_EDD2019-024R.json`. **[DEDUCIDO]**

## 2. Storage

- [ ] Bucket **`technician-documents`**, **privado** (`public = false`).
      **[VERIFICADO]** — es el único bucket del proyecto.
- [ ] Las políticas RLS del bucket las crean las migraciones `006` y `038`; el
      **bucket en sí no lo crea ninguna migración** — hay que crearlo a mano antes
      de que nadie suba un documento. **[DEDUCIDO]**

> **Dos huecos de configuración anotados, no corregidos** **[VERIFICADO]**:
> `file_size_limit` es `null` y `allowed_mime_types` es `null`. El bucket acepta
> ficheros de cualquier tamaño y de cualquier tipo. Para producción conviene
> acotar ambos.

## 3. Edge Functions

Desplegar las dos de `supabase/functions/`: **[VERIFICADO]** que son las dos que
existen y con qué configuración corren hoy.

| Función | `verify_jwt` | Notas |
|---|---|---|
| `delete-account` | **true** | Correcto: exige sesión. |
| `invite-company-member` | **false** | ⚠ Endpoint **público**. Comprobar que valida la autorización internamente antes de exponerlo. |

- [ ] Secretos de las funciones **[VERIFICADO por grep]**:
  - `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` — las usan **ambas**.
  - `APP_PUBLIC_URL` (con fallback a `SITE_URL` / `PUBLIC_SITE_URL`) — sólo
    `invite-company-member`.
- [ ] **Allow-list de CORS**, embebida en el código de las dos funciones
      **[VERIFICADO]** — un dominio nuevo hay que añadirlo **al código y
      redesplegar**, no basta con configurarlo en el panel:
      `http://localhost:8081` · `https://aviationjobtalent.vercel.app` ·
      `https://avj-dev.vercel.app` · `https://app.aviationjobtalent.com`

## 4. Configuración de Auth

- [ ] **Site URL** y **Redirect URLs** deben incluir `<APP_URL>/auth/set-password`
      — es el `redirectTo` del reseteo de contraseña
      (`app/auth/forgot-password.tsx:40`). **[VERIFICADO por grep]**
- [ ] Proveedor **email/password** habilitado. **[DEDUCIDO]** — es el único que usa
      el código; no hay OAuth en ninguna pantalla.
- [ ] Decidir si **email confirmation** está activo. **[DEDUCIDO]** — el alta de
      técnico usada en la auditoría completó el registro y entró directa a
      `/auth/pending-verification` sin paso de confirmación, así que en
      `rotoaxismatch-dev` está desactivado. Para producción es una decisión, no un
      detalle.
- [ ] Plantillas de correo: revisar la de recuperación de contraseña. **[DEDUCIDO]**

## 5. Variables de entorno de la app

Cliente (`.env`, prefijo `EXPO_PUBLIC_`) **[VERIFICADO contra `.env.example`]**:

- [ ] `EXPO_PUBLIC_SUPABASE_URL`
- [ ] `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- [ ] `EXPO_PUBLIC_APP_URL` — **cambiar a la URL desplegada**; por defecto cae a
      `http://localhost:8081` (`src/lib/appUrl.ts:5`), y de ahí sale el enlace de
      reseteo de contraseña que reciben los usuarios.

Sólo local/servidor, **nunca en el cliente**:

- [ ] `SUPABASE_SERVICE_ROLE_KEY` — sólo para scripts ejecutados a mano.

## 6. Bootstrap del primer admin

**[VERIFICADO]** No hay ninguna vía en la app para crear un admin: `handle_new_user`
asigna `technician` por defecto y `signup_company`/`signup_technician` son los
únicos caminos de alta. El primer admin se crea a mano.

- [ ] Seguir `docs/V2_S1_ADMIN_BOOTSTRAP_SQL.sql`: crear el usuario en
      Authentication → Users, copiar su UUID, sustituirlo en el script y ejecutarlo.

> **Ojo al orden con la 039** **[DEDUCIDO]**: `handle_new_user` crea la fila de
> `profiles` con `status` = DEFAULT = `pending_verification`. El script de bootstrap
> debe dejar al admin en `active`, o `is_active_user()` devolverá `false` y el panel
> quedará vacío sin ningún error visible.

## 7. Verificación posterior

- [ ] `npm run ts` → 0 errores
- [ ] `npm run test:matching` → 125/125
- [ ] `npm run validate:aircraft-ratings` → PASS (606 filas)
- [ ] `npm run validate:state-machine` → PASS (contrasta TS contra la BD en vivo)
- [ ] `npm run validate:auth-hooks` → PASS (los dos triggers de `auth.users`)

Los dos últimos **consultan la base de datos real**, así que sirven de prueba de
humo del despliegue, no sólo del código.

- [ ] Alta de un técnico de punta a punta → debe caer en `/auth/pending-verification`.
- [ ] Verificarlo desde el panel de admin → debe pasar a `active` y aparecer en la
      búsqueda de empresa.
- [ ] Alta de una empresa → debe entrar directa a `/company`.

## 8. Orden resumido

```
1. Crear proyecto            5. Configurar Auth (redirect URLs)
2. Migraciones (db push)     6. Variables de entorno de la app
3. Crear bucket privado      7. Bootstrap del admin
4. Desplegar edge functions  8. Verificación (§7)
   + sus secretos
```

El bucket (3) va antes que las funciones (4) porque `delete-account` borra objetos
de él. El bootstrap (7) va al final porque necesita Auth ya configurado.
