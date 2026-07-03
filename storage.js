// ============================================================================.
// ============================================================================
(function (global) {
  const KEY = 'ef_store_v1';
  const SESSION_KEY = 'ef_session_v1';
  const SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000; // 12h
  const ONLINE_WINDOW_MS = 5 * 60 * 1000; // 5 min

  const DEFAULT_ADMIN = { username: 'ADMtz', password: '303030' };

  function nowIso() {
    return new Date().toISOString();
  }

  // Hash simples (SHA-256) só para não guardar senha em texto puro no
  // localStorage. Isso NÃO é proteção de verdade num site estático público
  // (o código-fonte é visível), é só ofuscação básica.
  async function sha256(text) {
    const enc = new TextEncoder().encode(text);
    const buf = await crypto.subtle.digest('SHA-256', enc);
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  function load() {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      try {
        return JSON.parse(raw);
      } catch (e) {
        /* corrompido, recria abaixo */
      }
    }
    return {
      users: [],
      logins: [],
      activities: [],
      sessions_online: [],
      seq: { users: 0, logins: 0, activities: 0 }
    };
  }

  function save(store) {
    localStorage.setItem(KEY, JSON.stringify(store));
  }

  async function ensureSeed() {
    const store = load();
    if (store.users.length === 0) {
      const hash = await sha256(DEFAULT_ADMIN.password);
      store.seq.users += 1;
      store.users.push({
        id: store.seq.users,
        username: DEFAULT_ADMIN.username,
        password_hash: hash,
        role: 'admin',
        created_at: nowIso()
      });
      save(store);
    }
    return store;
  }

  function getSession() {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    try {
      const s = JSON.parse(raw);
      if (!s.expires || Date.now() > s.expires) {
        localStorage.removeItem(SESSION_KEY);
        return null;
      }
      return s;
    } catch (e) {
      return null;
    }
  }

  function setSession(user) {
    localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        userId: user.id,
        username: user.username,
        role: user.role,
        expires: Date.now() + SESSION_MAX_AGE_MS
      })
    );
  }

  function clearSession() {
    localStorage.removeItem(SESSION_KEY);
  }

  async function login(username, password) {
    const store = await ensureSeed();
    const user = store.users.find((u) => u.username === username);
    const hash = await sha256(password || '');
    const ok = !!user && user.password_hash === hash;

    store.seq.logins += 1;
    store.logins.push({
      id: store.seq.logins,
      user_id: user ? user.id : 0,
      username,
      ip: '(navegador local)',
      user_agent: navigator.userAgent,
      success: ok ? 1 : 0,
      created_at: nowIso()
    });
    save(store);

    if (!ok) return { ok: false, error: 'usuário ou senha inválidos' };

    setSession(user);
    touchOnline(user.id, user.username);
    return { ok: true, username: user.username, role: user.role };
  }

  function logout() {
    const session = getSession();
    if (session) {
      const store = load();
      store.sessions_online = store.sessions_online.filter((s) => s.user_id !== session.userId);
      save(store);
    }
    clearSession();
  }

  function touchOnline(userId, username) {
    const store = load();
    const existing = store.sessions_online.find((s) => s.user_id === userId);
    if (existing) {
      existing.last_seen = nowIso();
      existing.username = username;
    } else {
      store.sessions_online.push({ user_id: userId, username, last_seen: nowIso() });
    }
    save(store);
  }

  function heartbeat() {
    const session = getSession();
    if (!session) return;
    touchOnline(session.userId, session.username);
  }

  function trackActivity(action, detail) {
    const session = getSession();
    if (!session) return;
    const store = load();
    store.seq.activities += 1;
    store.activities.push({
      id: store.seq.activities,
      user_id: session.userId,
      username: session.username,
      action,
      detail: JSON.stringify(detail || {}),
      ip: '(navegador local)',
      created_at: nowIso()
    });
    touchOnline(session.userId, session.username);
    save(store);
  }

  function stats() {
    const store = load();
    const threshold = Date.now() - ONLINE_WINDOW_MS;
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const onlineNow = store.sessions_online.filter((s) => new Date(s.last_seen).getTime() >= threshold).length;
    const loginsToday = store.logins.filter(
      (l) => new Date(l.created_at).getTime() >= startOfDay.getTime() && l.success === 1
    ).length;
    const activitiesToday = store.activities.filter(
      (a) => new Date(a.created_at).getTime() >= startOfDay.getTime()
    ).length;

    return { totalUsers: store.users.length, onlineNow, loginsToday, activitiesToday };
  }

  function onlineUsers() {
    const store = load();
    const threshold = Date.now() - ONLINE_WINDOW_MS;
    return store.sessions_online
      .filter((s) => new Date(s.last_seen).getTime() >= threshold)
      .sort((a, b) => new Date(b.last_seen) - new Date(a.last_seen))
      .map((s) => ({ username: s.username, last_seen: s.last_seen }));
  }

  function loginHistory(limit) {
    const store = load();
    return [...store.logins].sort((a, b) => b.id - a.id).slice(0, limit || 100);
  }

  function activityHistory(limit) {
    const store = load();
    return [...store.activities].sort((a, b) => b.id - a.id).slice(0, limit || 200);
  }

  function listUsers() {
    const store = load();
    return [...store.users]
      .sort((a, b) => a.id - b.id)
      .map((u) => ({ id: u.id, username: u.username, role: u.role, created_at: u.created_at }));
  }

  async function addUser(username, password, role) {
    const store = load();
    if (store.users.some((u) => u.username === username)) {
      return { ok: false, error: 'usuário já existe' };
    }
    const hash = await sha256(password);
    store.seq.users += 1;
    store.users.push({
      id: store.seq.users,
      username,
      password_hash: hash,
      role: role === 'admin' ? 'admin' : 'user',
      created_at: nowIso()
    });
    save(store);
    return { ok: true };
  }

  function removeUser(id) {
    const store = load();
    store.users = store.users.filter((u) => String(u.id) !== String(id));
    save(store);
    return { ok: true };
  }

  global.EF = {
    ensureSeed,
    getSession,
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
