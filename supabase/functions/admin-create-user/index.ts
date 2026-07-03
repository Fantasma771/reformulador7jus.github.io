// Edge Function: admin-create-user
// Cria um novo usuário (Auth + profile) — só pode ser chamada por um admin autenticado.
// A SERVICE_ROLE_KEY nunca é exposta ao navegador: ela só existe aqui, no ambiente
// da função, injetada automaticamente pelo Supabase.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'method not allowed' }), { status: 405 });
    }

    const authHeader = req.headers.get('Authorization') || '';
    const jwt = authHeader.replace('Bearer ', '');
    if (!jwt) {
      return new Response(JSON.stringify({ error: 'não autenticado' }), { status: 401 });
    }

    // Cliente com o JWT de quem chamou, só para validar identidade/role
    const callerClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: `Bearer ${jwt}` } }
    });
    const { data: userData, error: userErr } = await callerClient.auth.getUser(jwt);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'sessão inválida' }), { status: 401 });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: profile } = await admin
      .from('profiles')
      .select('role')
      .eq('id', userData.user.id)
      .single();

    if (!profile || profile.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'apenas admin pode criar usuários' }), { status: 403 });
    }

    const body = await req.json();
    const username = String(body.username || '').trim();
    const password = String(body.password || '');
    const role = body.role === 'admin' ? 'admin' : 'user';

    if (!username || password.length < 6) {
      return new Response(
        JSON.stringify({ error: 'usuário inválido ou senha com menos de 6 caracteres' }),
        { status: 400 }
      );
    }

    const email = `${username}@equipefantasma.local`;
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { username, role }
    });

    if (createErr) {
      const msg = /already registered|already exists/i.test(createErr.message)
        ? 'usuário já existe'
        : createErr.message;
      return new Response(JSON.stringify({ error: msg }), { status: 400 });
    }

    return new Response(JSON.stringify({ ok: true, id: created.user?.id }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
