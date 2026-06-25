// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.107.0';

// ── CORS ──────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  'http://localhost:8081',
  'https://aviationjobtalent.vercel.app',
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

function deletedEmail(userId) {
  return `deleted_${userId}@deleted.invalid`;
}

async function deleteAccountTechnician(supabaseAdmin, userId) {
  // 1. Resolve technician_profiles row
  const { data: techProfile, error: techErr } = await supabaseAdmin
    .from('technician_profiles')
    .select('id, email')
    .eq('user_id', userId)
    .maybeSingle();
  if (techErr) throw new AppError(500, 'Could not retrieve technician profile.');

  if (techProfile) {
    const technicianId = techProfile.id;

    // 2. Delete documents from storage + clear DB records
    const { data: docs } = await supabaseAdmin
      .from('documents')
      .select('id, storage_path')
      .eq('technician_id', technicianId);

    if (docs && docs.length > 0) {
      const paths = docs.map((d) => d.storage_path).filter(Boolean);
      if (paths.length > 0) {
        await supabaseAdmin.storage.from('technician-documents').remove(paths);
      }
      await supabaseAdmin
        .from('documents')
        .delete()
        .eq('technician_id', technicianId);
    }

    // 3. Clear cover notes on applications
    await supabaseAdmin
      .from('offer_applications')
      .update({ cover_note: null })
      .eq('technician_id', technicianId);

    // 4. Anonymize chat messages sent by this user
    await supabaseAdmin
      .from('chat_messages')
      .update({ body: '[Message deleted]' })
      .eq('sender_user_id', userId);

    // 5. Anonymize technician_profiles PII
    await supabaseAdmin
      .from('technician_profiles')
      .update({
        first_name: '[Deleted]',
        last_name: '[User]',
        email: deletedEmail(userId),
        phone: null,
        social_links: null,
        birth_date: '1900-01-01',
      })
      .eq('id', technicianId);
  }

  // 6. Anonymize profiles row
  await supabaseAdmin
    .from('profiles')
    .update({ email: deletedEmail(userId), status: 'deleted' })
    .eq('id', userId);

  // 7. Delete auth user (irreversible)
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

  // 3. Remove from company_members (so the company data is untouched)
  if (member) {
    await supabaseAdmin
      .from('company_members')
      .delete()
      .eq('id', member.id);
  }

  // 4. Anonymize chat messages sent by this user
  await supabaseAdmin
    .from('chat_messages')
    .update({ body: '[Message deleted]' })
    .eq('sender_user_id', userId);

  // 5. Anonymize profiles row
  await supabaseAdmin
    .from('profiles')
    .update({ email: deletedEmail(userId), status: 'deleted' })
    .eq('id', userId);

  // 6. Delete auth user
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
