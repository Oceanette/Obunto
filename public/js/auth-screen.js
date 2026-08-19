const OBUNTO_AUTH_SCREEN = (() => {
  const ERROR_MESSAGES = {
    nome_em_uso: 'Este nome já está em uso. Escolha outro.',
    nome_invalido: 'Use de 3 a 20 caracteres: letras, números, _ ou -.',
    senha_invalida: 'A senha precisa ter ao menos 6 caracteres.',
    credenciais_invalidas: 'Nome ou senha incorretos.',
    requisicao_invalida: 'Não foi possível processar a requisição.',
    erro_interno: 'Falha interna no servidor. Tente novamente.'
  };

  let usernameCheckTimer = null;
  let selectedColor = null;
  let colorPalette = [];

  function setMode(mode) {
    qs('#auth-card').dataset.mode = mode;
    qsa('.auth-tab').forEach(tab => {
      tab.classList.toggle('is-active', tab.dataset.mode === mode);
    });
    qs('#form-login').classList.toggle('hidden', mode !== 'login');
    qs('#form-register').classList.toggle('hidden', mode !== 'register');
    clearError();
  }

  function showError(code) {
    const el = qs('#auth-error');
    el.textContent = ERROR_MESSAGES[code] || 'Algo deu errado. Tente novamente.';
    el.classList.remove('hidden');
  }

  function clearError() {
    const el = qs('#auth-error');
    el.textContent = '';
    el.classList.add('hidden');
  }

  function setAvailability(state, message) {
    const el = qs('#username-availability');
    el.dataset.state = state;
    el.textContent = message;
  }

  function scheduleUsernameCheck(value) {
    clearTimeout(usernameCheckTimer);
    const name = value.trim();
    if (!name) {
      setAvailability('idle', '');
      return;
    }
    if (!/^[a-zA-Z0-9_\-]{3,20}$/.test(name)) {
      setAvailability('invalid', 'FORMATO INVÁLIDO');
      return;
    }
    setAvailability('checking', 'VERIFICANDO...');
    usernameCheckTimer = setTimeout(async () => {
      try {
        const res = await OBUNTO_AUTH.checkUsername(name);
        if (qs('#input-register-username').value.trim() !== name) return;
        setAvailability(res.available ? 'available' : 'taken', res.available ? 'DISPONÍVEL' : 'INDISPONÍVEL');
      } catch (e) {
        setAvailability('idle', '');
      }
    }, 400);
  }

  function renderColorPicker() {
    const el = qs('#color-picker');
    el.innerHTML = '';
    colorPalette.forEach((c, i) => {
      const sw = ce('div', 'color-swatch');
      sw.style.background = c;
      sw.dataset.color = c;
      if (i === 0) {
        sw.classList.add('is-selected');
        selectedColor = c;
      }
      sw.addEventListener('click', () => {
        qsa('.color-swatch').forEach(s => s.classList.remove('is-selected'));
        sw.classList.add('is-selected');
        selectedColor = c;
      });
      el.appendChild(sw);
    });
  }

  async function loadColorPalette() {
    try {
      const res = await OBUNTO_AUTH.colors();
      colorPalette = res.colors;
    } catch (e) {
      colorPalette = ['#FF3B1F', '#111111', '#5B5B5B', '#1F6F5C', '#2E4C8C', '#8B4FA0'];
    }
    renderColorPicker();
  }

  function enterApp(profile) {
    OBUNTO_LOADING.show('ACESSANDO SISTEMA', [
      'AUTENTICANDO UNIDADE',
      'SINCRONIZANDO PERFIL',
      'CARREGANDO CANAIS',
      'ESTABELECENDO SINAL'
    ]);
    OBUNTO_STORE.save({
      id: profile.id,
      username: profile.username,
      color: profile.color,
      displayName: profile.displayName || null,
      bio: profile.bio || '',
      avatar: profile.avatar || null,
      createdAt: profile.createdAt || null
    });
    qs('#screen-auth').classList.add('hidden');
    qs('#screen-app').classList.remove('hidden');
    OBUNTO_PROFILE.renderChrome(OBUNTO_STORE.get());
    if (typeof OBUNTO_MAIN_READY === 'function') OBUNTO_MAIN_READY();
    setTimeout(() => OBUNTO_LOADING.hide(), 1300);
  }

  function setBusy(form, busy) {
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = busy;
    btn.dataset.busy = String(busy);
  }

  async function handleLogin(e) {
    e.preventDefault();
    clearError();
    const form = e.target;
    const username = qs('#input-login-username').value.trim();
    const password = qs('#input-login-password').value;
    if (!username || !password) return;
    setBusy(form, true);
    try {
      const res = await OBUNTO_AUTH.login(username, password);
      OBUNTO_STORE.saveToken(res.token);
      enterApp(res.user);
    } catch (err) {
      showError(err.code);
    } finally {
      setBusy(form, false);
    }
  }

  async function handleRegister(e) {
    e.preventDefault();
    clearError();
    const form = e.target;
    const username = qs('#input-register-username').value.trim();
    const password = qs('#input-register-password').value;
    const confirm = qs('#input-register-confirm').value;
    if (!username || !password) return;
    if (password !== confirm) {
      showError('senha_confere');
      qs('#auth-error').textContent = 'As senhas não conferem.';
      qs('#auth-error').classList.remove('hidden');
      return;
    }
    setBusy(form, true);
    try {
      const res = await OBUNTO_AUTH.register(username, password, selectedColor);
      OBUNTO_STORE.saveToken(res.token);
      enterApp(res.user);
    } catch (err) {
      showError(err.code);
    } finally {
      setBusy(form, false);
    }
  }

  function logout() {
    OBUNTO_LOADING.show('ENCERRANDO SESSÃO', ['FECHANDO CANAIS', 'LIMPANDO CONEXÕES', 'REVOGANDO TOKEN']);
    const token = OBUNTO_STORE.getToken();
    if (token) OBUNTO_AUTH.logout(token).catch(() => {});
    OBUNTO_STORE.clearToken();
    OBUNTO_STORE.clear();
    if (typeof OBUNTO_SIGNAL !== 'undefined') OBUNTO_SIGNAL.disconnect();
    setTimeout(() => {
      qs('#screen-app').classList.add('hidden');
      qs('#screen-auth').classList.remove('hidden');
      qs('#input-login-password').value = '';
      setMode('login');
      OBUNTO_LOADING.hide();
    }, 1100);
  }

  async function trySessionRestore() {
    const token = OBUNTO_STORE.loadToken();
    if (!token) return false;
    try {
      const res = await OBUNTO_AUTH.me(token);
      enterApp(res.user);
      return true;
    } catch (e) {
      OBUNTO_STORE.clearToken();
      return false;
    }
  }

  function init() {
    loadColorPalette();
    setMode('login');

    qsa('.auth-tab').forEach(tab => {
      tab.addEventListener('click', () => setMode(tab.dataset.mode));
    });

    qs('#form-login').addEventListener('submit', handleLogin);
    qs('#form-register').addEventListener('submit', handleRegister);
    qs('#input-register-username').addEventListener('input', e => scheduleUsernameCheck(e.target.value));
    qs('#btn-logout').addEventListener('click', logout);

    return trySessionRestore();
  }

  return { init, logout };
})();
