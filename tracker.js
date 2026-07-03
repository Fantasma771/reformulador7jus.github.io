// Tracker de sessão/atividade para o painel admin (versão Supabase)
(function () {
  async function init() {
    if (typeof EF === 'undefined') return;
    const session = await EF.refreshSession();
    if (!session) {
      window.location.href = 'login.html';
      return;
    }
    const nameEl = document.getElementById('ef-username');
    const adminLink = document.getElementById('ef-admin-link');
    const logoutLink = document.getElementById('ef-logout-link');
    if (nameEl) nameEl.textContent = 'Logado como: ' + session.username;
    if (adminLink && session.role === 'admin') adminLink.style.display = 'inline';
    if (logoutLink) {
      logoutLink.addEventListener('click', async function (e) {
        e.preventDefault();
        await EF.logout();
        window.location.href = 'login.html';
      });
    }

    // heartbeat para contar "usuários online agora"
    EF.heartbeat();
    setInterval(function () {
      EF.heartbeat();
    }, 60 * 1000);
  }

  window.EF_track = function (action, detail) {
    if (typeof EF === 'undefined') return;
    EF.trackActivity(action, detail);
  };

  document.addEventListener('DOMContentLoaded', init);
})();
