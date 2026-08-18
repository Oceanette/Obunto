const OBUNTO_STORE = (() => {
  const PROFILE_KEY = 'obunto_profile';
  const TOKEN_KEY = 'obunto_token';
  const AUDIO_KEY = 'obunto_audio_prefs';
  let profile = null;
  let token = null;

  function loadProfile() {
    const raw = localStorage.getItem(PROFILE_KEY);
    profile = raw ? JSON.parse(raw) : null;
    return profile;
  }

  function saveProfile(p) {
    profile = p;
    localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
  }

  function clearProfile() {
    profile = null;
    localStorage.removeItem(PROFILE_KEY);
  }

  function get() {
    return profile;
  }

  function loadToken() {
    token = localStorage.getItem(TOKEN_KEY);
    return token;
  }

  function saveToken(t) {
    token = t;
    localStorage.setItem(TOKEN_KEY, t);
  }

  function clearToken() {
    token = null;
    localStorage.removeItem(TOKEN_KEY);
  }

  function getToken() {
    return token;
  }

  function getAudioPrefs() {
    try {
      return JSON.parse(localStorage.getItem(AUDIO_KEY)) || {};
    } catch (e) {
      return {};
    }
  }

  function saveAudioPrefs(prefs) {
    const merged = Object.assign(getAudioPrefs(), prefs);
    localStorage.setItem(AUDIO_KEY, JSON.stringify(merged));
    return merged;
  }

  return {
    load: loadProfile,
    save: saveProfile,
    clear: clearProfile,
    get,
    loadToken,
    saveToken,
    clearToken,
    getToken,
    getAudioPrefs,
    saveAudioPrefs
  };
})();
