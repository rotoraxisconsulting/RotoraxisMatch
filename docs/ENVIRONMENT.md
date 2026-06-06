# RotoraxisMatch — Environment Variables

## Client-side variables (`.env`)

These go in the `.env` file at the project root. Expo exposes them to the app via `process.env.EXPO_PUBLIC_*`.

| Variable | Required | Description |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | ✅ | Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | ✅ | Supabase anon/publishable key |

**Where to find them:** Supabase Dashboard → Project Settings → API → Project URL & Project API keys.

**Local example:**
```
EXPO_PUBLIC_SUPABASE_URL=https://rwauwuremzkizeoginza.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

---

## Edge Function variables (Supabase Secrets)

These are **not** in `.env`. They must be configured in:
> Supabase Dashboard → Project Settings → Edge Functions → Secrets

They are available to all deployed Edge Functions via `Deno.env.get('...')`.

---

### `APP_PUBLIC_URL` ← **the one that matters**

| | |
|---|---|
| **Variable name** | `APP_PUBLIC_URL` |
| **Required by** | `supabase/functions/invite-company-member/index.ts` |
| **Used for** | Building the `redirectTo` URL in invitation and password-reset emails → `${APP_PUBLIC_URL}/auth/set-password` |
| **Fallbacks** | `SITE_URL`, then `PUBLIC_SITE_URL` (Edge Function tries all three in order) |

**Local development:**
```
APP_PUBLIC_URL=http://localhost:8081
```

**Production:**
```
APP_PUBLIC_URL=https://tu-dominio.com
```
*(Replace with your actual deployed URL — Vercel, Expo hosting, or custom domain.)*

**How to set it:**
1. Go to [Supabase Dashboard](https://supabase.com/dashboard) → your project
2. Navigate to **Project Settings → Edge Functions**
3. Under **Secrets**, add:
   - Name: `APP_PUBLIC_URL`
   - Value: your public URL (no trailing slash)
4. Click **Save**
5. Redeploy Edge Functions: `supabase functions deploy invite-company-member`

**What happens if it's missing:**
The Edge Function will return HTTP 500 with the message:
> `APP_PUBLIC_URL or SITE_URL must be configured for invitation redirects.`
This blocks company member invitation emails from being sent.

---

## Summary: what to configure before launch

| Where | Variable | Value |
|---|---|---|
| `.env` (local) | `EXPO_PUBLIC_SUPABASE_URL` | From Supabase Dashboard |
| `.env` (local) | `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | From Supabase Dashboard |
| Supabase Secrets | `APP_PUBLIC_URL` | `http://localhost:8081` (dev) or your production URL |

---

## How to verify `APP_PUBLIC_URL` is working

1. In the app, go to `/company/team` as an admin
2. Click **Invite** and enter a valid email + role
3. Click **Send invite**
4. If the invite is sent successfully → `APP_PUBLIC_URL` is configured correctly
5. If you get a 500 error → check Supabase Secrets and redeploy the Edge Function
