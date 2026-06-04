// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.107.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const VALID_ROLES = new Set(['admin', 'recruiter', 'viewer']);

class AppError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

function normalizeEmail(value) {
  return String(value ?? '').trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function inviteRedirectTo() {
  const baseUrl = Deno.env.get('APP_PUBLIC_URL') ?? Deno.env.get('SITE_URL') ?? Deno.env.get('PUBLIC_SITE_URL');
  if (!baseUrl) {
    throw new AppError(500, 'APP_PUBLIC_URL or SITE_URL must be configured for invitation redirects.');
  }
  return `${baseUrl.replace(/\/$/, '')}/auth/set-password`;
}

async function findProfileByEmail(supabaseAdmin, email) {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, email, role, status')
    .ilike('email', email);

  if (error) throw new AppError(500, `Could not check existing profiles: ${error.message}`);
  if ((data ?? []).length > 1) {
    throw new AppError(409, 'More than one profile exists for this email.');
  }
  return data?.[0] ?? null;
}

async function findAuthUserByEmail(supabaseAdmin, email) {
  let page = 1;
  const perPage = 1000;

  while (page <= 20) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) throw new AppError(500, `Could not check existing auth users: ${error.message}`);

    const users = data?.users ?? [];
    const found = users.find((user) => user.email?.toLowerCase() === email);
    if (found) return found;
    if (users.length < perPage) return null;
    page += 1;
  }

  throw new AppError(500, 'Auth user lookup exceeded the supported page limit.');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) {
      throw new AppError(500, 'Supabase function environment is not configured.');
    }

    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) throw new AppError(401, 'Missing bearer token.');

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !authData?.user) {
      throw new AppError(401, authError?.message ?? 'Invalid bearer token.');
    }

    const body = await req.json().catch(() => ({}));
    const email = normalizeEmail(body.email);
    const role = body.role;
    const displayName = typeof body.name === 'string' ? body.name.trim().slice(0, 100) : null;
    const redirectTo = inviteRedirectTo();

    if (!isValidEmail(email)) throw new AppError(400, 'Enter a valid email address.');
    if (!VALID_ROLES.has(role)) throw new AppError(400, 'Select a valid company role.');

    const callerId = authData.user.id;
    const { data: callerProfile, error: callerProfileError } = await supabaseAdmin
      .from('profiles')
      .select('role, status')
      .eq('id', callerId)
      .maybeSingle();

    if (callerProfileError) {
      throw new AppError(500, `Could not load caller profile: ${callerProfileError.message}`);
    }
    if (callerProfile?.role !== 'company_user' || callerProfile?.status !== 'active') {
      throw new AppError(403, 'Only active company users can invite members.');
    }

    const { data: callerMember, error: callerMemberError } = await supabaseAdmin
      .from('company_members')
      .select('company_id, role')
      .eq('user_id', callerId)
      .maybeSingle();

    if (callerMemberError) {
      throw new AppError(500, `Could not load caller membership: ${callerMemberError.message}`);
    }
    if (!callerMember || callerMember.role !== 'admin') {
      throw new AppError(403, 'Only company admins can invite members.');
    }

    let targetProfile = await findProfileByEmail(supabaseAdmin, email);
    let targetUserId = targetProfile?.id ?? null;
    let invited = false;
    let recoverySent = false;

    if (targetProfile) {
      if (targetProfile.role !== 'company_user') {
        throw new AppError(400, 'This email belongs to a non-company account.');
      }
      if (targetProfile.status === 'blocked' || targetProfile.status === 'suspended') {
        throw new AppError(400, 'This account cannot be invited because it is not eligible for access.');
      }
    } else {
      const authUser = await findAuthUserByEmail(supabaseAdmin, email);

      if (authUser) {
        const metadataRole = authUser.user_metadata?.role;
        if (metadataRole && metadataRole !== 'company_user') {
          throw new AppError(400, 'This email belongs to a non-company account.');
        }
        targetUserId = authUser.id;
      } else {
        const { data: inviteData, error: inviteError } =
          await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
            data: { role: 'company_user' },
            redirectTo,
          });

        if (inviteError) throw new AppError(400, inviteError.message);
        targetUserId = inviteData?.user?.id ?? null;
        invited = true;
      }

      if (!targetUserId) throw new AppError(500, 'Invited user id could not be resolved.');

      const { error: profileUpsertError } = await supabaseAdmin
        .from('profiles')
        .upsert(
          { id: targetUserId, email, role: 'company_user', status: 'active' },
          { onConflict: 'id' },
        );

      if (profileUpsertError) {
        throw new AppError(500, `Could not prepare invited profile: ${profileUpsertError.message}`);
      }

      targetProfile = { id: targetUserId, email, role: 'company_user', status: 'active' };
    }

    const { data: existingMembership, error: membershipError } = await supabaseAdmin
      .from('company_members')
      .select('company_id')
      .eq('user_id', targetUserId)
      .maybeSingle();

    if (membershipError) {
      throw new AppError(500, `Could not check existing membership: ${membershipError.message}`);
    }
    if (existingMembership?.company_id === callerMember.company_id) {
      throw new AppError(409, 'This user is already a member of your company.');
    }
    if (existingMembership) {
      throw new AppError(409, 'This user already belongs to another company.');
    }

    if (!invited) {
      const { error: recoveryError } = await supabaseAdmin.auth.resetPasswordForEmail(email, {
        redirectTo,
      });
      if (recoveryError) {
        throw new AppError(400, `Could not send password setup email: ${recoveryError.message}`);
      }
      recoverySent = true;
    }

    const { error: profileUpdateError } = await supabaseAdmin
      .from('profiles')
      .update({ status: 'active' })
      .eq('id', targetUserId)
      .eq('role', 'company_user');

    if (profileUpdateError) {
      throw new AppError(500, `Could not activate invited profile: ${profileUpdateError.message}`);
    }

    const { data: member, error: insertError } = await supabaseAdmin
      .from('company_members')
      .insert({
        company_id: callerMember.company_id,
        user_id: targetUserId,
        role,
        ...(displayName ? { display_name: displayName } : {}),
      })
      .select('id, company_id, user_id, role, display_name, created_at')
      .single();

    if (insertError) throw new AppError(500, `Could not add company member: ${insertError.message}`);

    return json({ member, invited, recoverySent, redirectTo });
  } catch (error) {
    const status = error?.status ?? 500;
    return json({ error: error?.message ?? 'Could not invite company member.' }, status);
  }
});
