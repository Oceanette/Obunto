const OBUNTO_AUTH = (() => {
  async function request(path, options) {
    const res = await fetch(OBUNTO_CONFIG.apiUrl + path, options);
    let data = {};
    try {
      data = await res.json();
    } catch (e) {}
    if (!res.ok) {
      const err = new Error(data.error || 'erro');
      err.status = res.status;
      err.code = data.error;
      throw err;
    }
    return data;
  }

  function colors() {
    return request('/colors', { method: 'GET' });
  }

  function checkUsername(username) {
    return request('/check-username?u=' + encodeURIComponent(username), { method: 'GET' });
  }

  function register(username, password, color) {
    return request('/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, color })
    });
  }

  function login(username, password) {
    return request('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
  }

  function logout(token) {
    return request('/logout', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token }
    });
  }

  function me(token) {
    return request('/me', {
      method: 'GET',
      headers: { Authorization: 'Bearer ' + token }
    });
  }

  return { colors, checkUsername, register, login, logout, me };
})();
