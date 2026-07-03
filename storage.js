// ============================================================================
// Equipe Fantasma — camada de dados usando Supabase (banco real, compartilhado)
// Substitui a versão antiga baseada em localStorage. Mantém a mesma interface
// global `EF` usada pelo restante do site (login.html, admin.html, app.html,
// tracker.js) para não precisar reescrever essas telas.
// ============================================================================
(function (global) {
  const EMAIL_SUFFIX = '@equipefantasma.local';
  const ONLINE_WINDOW_MS = 5 * 60 * 1000; // 5 min

  const sb = global.supabase.createClient(global.EF_SUPABASE_URL, global.EF_SUPABASE_ANON_KEY);

  function usernameToEmail(username) {
    return `${String(username || '').trim().toLowerCase()}${EMAIL_SUFFIX}`;
  }

  function emailToUsername(email) {
    return String(email || '').replace(EMAIL_SUFFIX, '');
  }

  async function ensureSeed() {
    // Não é mais necessário: o admin padrão é criado uma vez no painel do
    // Supabase (Authentication > Users) e promovido a admin via SQL.
    return null;
  }

  async function getCurrentProfile() {
    const { data: userRes } = await sb.auth.getUser();
    const user = userRes && userRes.user;
    if (!user) return null;
    const { data: profile } = await sb.from('profiles').select('*').eq('id', user.id).single();
    return profile ? { id: user.id, username: profile.username, role: profile.role } : null;
  }

  // Sessão local só serve de cache para telas síncronas (tracker.js chama
  // getSession() de forma síncrona). Guardamos o último perfil carregado.
  let cachedSession = null;

  function getSession() {
    return cachedSession;
  }

  async function refreshSession() {
    const profile = await getCurrentProfile();
    cachedSession = profile
      ? { userId: profile.id, username: profile.username, role: profile.role }
      : null;
    return cachedSession;
  }

  async function login(username, password) {
    const email = usernameToEmail(username);
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    const ok = !error && !!data.session;

    // Registra tentativa de login (sucesso ou falha)
    try {
      await sb.from('logins').insert({
        user_id: ok ? data.user.id : null,
        username,
        success: ok,
        user_agent: navigator.userAgent
      });
    } catch (e) {
      /* se falhar (ex: RLS bloqueando login anônimo), ignora — não trava o fluxo */
    }

    if (!ok) {
      return { ok: false, error: 'usuário ou senha inválidos' };
    }

    const session = await refreshSession();
    if (session) await touchOnline();
    return { ok: true, username: session.username, role: session.role };
  }

  async function logout() {
    try {
      const { data: userRes } = await sb.auth.getUser();
      const user = userRes && userRes.user;
      if (user) {
        await sb.from('sessions_online').delete().eq('user_id', user.id);
      }
    } catch (e) {
      /* ignora */
    }
    await sb.auth.signOut();
    cachedSession = null;
  }

  async function touchOnline() {
    const { data: userRes } = await sb.auth.getUser();
    const user = userRes && userRes.user;
    if (!user) return;
    const username = cachedSession ? cachedSession.username : emailToUsername(user.email);
    await sb.from('sessions_online').upsert({
      user_id: user.id,
      username,
      last_seen: new Date().toISOString()
    });
  }

  async function heartbeat() {
    const session = await refreshSession();
    if (!session) return;
    await touchOnline();
  }

  async function trackActivity(action, detail) {
    const session = await refreshSession();
    if (!session) return;
    await sb.from('activities').insert({
      user_id: session.userId,
      username: session.username,
      action,
      detail: detail || {}
    });
    await touchOnline();
  }

  async function stats() {
    const threshold = new Date(Date.now() - ONLINE_WINDOW_MS).toISOString();
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [{ count: totalUsers }, { count: onlineNow }, { count: loginsToday }, { count: activitiesToday }] =
      await Promise.all([
        sb.from('profiles').select('*', { count: 'exact', head: true }),
        sb.from('sessions_online').select('*', { count: 'exact', head: true }).gte('last_seen', threshold),
        sb
          .from('logins')
          .select('*', { count: 'exact', head: true })
          .eq('success', true)
          .gte('created_at', startOfDay.toISOString()),
        sb.from('activities').select('*', { count: 'exact', head: true }).gte('created_at', startOfDay.toISOString())
      ]);

    return {
      totalUsers: totalUsers || 0,
      onlineNow: onlineNow || 0,
      loginsToday: loginsToday || 0,
      activitiesToday: activitiesToday || 0
    };
  }

  async function onlineUsers() {
    const threshold = new Date(Date.now() - ONLINE_WINDOW_MS).toISOString();
    const { data } = await sb
      .from('sessions_online')
      .select('username,last_seen')
      .gte('last_seen', threshold)
      .order('last_seen', { ascending: false });
    return data || [];
  }

  async function loginHistory(limit) {
    const { data } = await sb
      .from('logins')
      .select('*')
      .order('id', { ascending: false })
      .limit(limit || 100);
    return data || [];
  }

  async function activityHistory(limit) {
    const { data } = await sb
      .from('activities')
      .select('*')
      .order('id', { ascending: false })
      .limit(limit || 200);
    return (data || []).map((a) => ({ ...a, detail: JSON.stringify(a.detail || {}) }));
  }

  async function listUsers() {
    const { data } = await sb.from('profiles').select('id,username,role,created_at').order('created_at');
    return data || [];
  }

  async function callFunction(name, payload) {
    const { data: sessionData } = await sb.auth.getSession();
    const token = sessionData && sessionData.session ? sessionData.session.access_token : null;
    if (!token) return { ok: false, error: 'não autenticado' };

    const res = await fetch(`${global.EF_SUPABASE_URL}/functions/v1/${name}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        apikey: global.EF_SUPABASE_ANON_KEY
      },
      body: JSON.stringify(payload)
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: json.error || 'erro na chamada' };
    return { ok: true, ...json };
  }

  async function addUser(username, password, role) {
    return callFunction('admin-create-user', { username, password, role });
  }

  async function removeUser(id) {
    return callFunction('admin-delete-user', { id });
  }

  global.EF = {
    ensureSeed,
    getSession,
    refreshSession,
    login,
    logout,
    heartbeat,
    trackActivity,
    stats,
    onlineUsers,
    loginHistory,
    activityHistory,
    listUsers,
    addUser,
    removeUser
  };
})(window);
