// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.107.0';

// ── CORS ──────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  'http://localhost:8081',
  'https://aviationjobtalent.vercel.app',
  'https://avj-dev.vercel.app',
  'https://app.aviationjobtalent.com',
];

function buildCorsHeaders(origin) {
  if (!origin || ALLOWED_ORIGINS.includes(origin)) {
    return {
      'Access-Control-Allow-Origin': origin ?? ALLOWED_ORIGINS[0],
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Vary': 'Origin',
    };
  }
  return { 'Vary': 'Origin' };
}

class AppError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function makeJson(corsHeaders) {
  return (body, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
}

// ── Helpers ───────────────────────────────────────────────

// El formato del email anonimizado (`deleted_<uuid>@deleted.invalid`) vive
// ahora en handle_deleted_user() (migración 039), que es el único dueño de la
// anonimización en base de datos. Se elimina de aquí para que no queden dos
// definiciones que puedan divergir.

async function deleteAccountTechnician(supabaseAdmin, userId) {
  // 1. Resolve technician_profiles row — sólo para localizar los ficheros.
  const { data: techProfile, error: techErr } = await supabaseAdmin
    .from('technician_profiles')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();
  if (techErr) throw new AppError(500, 'Could not retrieve technician profile.');

  if (techProfile) {
    // 2. Borrar los FICHEROS del bucket. Es lo único de este bloque que la base
    //    de datos no puede hacer por sí sola, y por eso sigue aquí. Las FILAS de
    //    `documents` las borra el trigger, junto con el resto de la lápida.
    const { data: docs } = await supabaseAdmin
      .from('documents')
      .select('storage_path')
      .eq('technician_id', techProfile.id);

    const paths = (docs ?? []).map((d) => d.storage_path).filter(Boolean);
    if (paths.length > 0) {
      await supabaseAdmin.storage.from('technician-documents').remove(paths);
    }
  }

  // 3. Borrar el usuario de auth. El trigger AFTER DELETE `on_auth_user_deleted`
  //    construye la lápida entera (anonimizar PII, limpiar cover notes y mensajes,
  //    borrar filas de documents, profiles.status='deleted') dentro de esta misma
  //    transacción: si algo falla, no se borra nada y no queda fantasma.
  const { error: deleteErr } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (deleteErr) throw new AppError(500, 'Could not remove authentication credentials.');
}

async function deleteAccountCompanyUser(supabaseAdmin, userId) {
  // 1. Resolve company membership
  const { data: member, error: memberErr } = await supabaseAdmin
    .from('company_members')
    .select('id, company_id, role')
    .eq('user_id', userId)
    .maybeSingle();
  if (memberErr) throw new AppError(500, 'Could not retrieve company membership.');

  if (member && member.role === 'admin') {
    // 2. Count admins in this company — block if last admin
    const { count, error: countErr } = await supabaseAdmin
      .from('company_members')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', member.company_id)
      .eq('role', 'admin');
    if (countErr) throw new AppError(500, 'Could not verify company admin count.');
    if ((count ?? 0) <= 1) {
      throw new AppError(
        409,
        'You are the only administrator of your company. Assign another administrator before deleting your account.',
      );
    }
  }

  // 3. Borrar el usuario de auth. El trigger `on_auth_user_deleted` quita la
  //    membresía de company_members, anonimiza los mensajes de chat y marca
  //    profiles.status='deleted', todo en esta misma transacción.
  //
  //    El guard de último admin de arriba se queda AQUÍ a propósito: es una
  //    regla de producto ("no dejes a tu empresa sin administrador"), no un
  //    invariante de integridad, así que no se replica en el trigger. Un
  //    borrado que no pase por esta función se la salta — pero sigue sin poder
  //    dejar un fantasma, que es lo que el trigger sí garantiza.
  const { error: deleteErr } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (deleteErr) throw new AppError(500, 'Could not remove authentication credentials.');
}

// ── Main handler ──────────────────────────────────────────
Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = buildCorsHeaders(origin);
  const json = makeJson(corsHeaders);

  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    return new Response('Forbidden', { status: 403, headers: { 'Vary': 'Origin' } });
  }

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  try {
    const supabaseUrl    = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) {
      throw new AppError(500, 'Function environment is not configured.');
    }

    // ── 1. Authenticate caller ────────────────────────────
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) throw new AppError(401, 'Missing bearer token.');

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !authData?.user) {
      throw new AppError(401, 'Invalid or expired session.');
    }

    const userId = authData.user.id;

    // ── 2. Get profile role ───────────────────────────────
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from('profiles')
      .select('role, status')
      .eq('id', userId)
      .maybeSingle();
    if (profileErr) throw new AppError(500, 'Could not retrieve user profile.');
    if (!profile) throw new AppError(404, 'User profile not found.');
    if (profile.role === 'admin') {
      throw new AppError(403, 'Admin accounts cannot be self-deleted. Contact a super-admin.');
    }

    // ── 3. Delete by role ─────────────────────────────────
    if (profile.role === 'technician') {
      await deleteAccountTechnician(supabaseAdmin, userId);
    } else {
      await deleteAccountCompanyUser(supabaseAdmin, userId);
    }

    return json({ success: true });

  } catch (error) {
    const status  = error?.status ?? 500;
    const message = error?.message ?? 'Could not delete account.';
    return json({ error: message }, status);
  }
});
