const OBUNTO_PROFILE = (() => {
  let pendingAvatar = null;
  let removeRequested = false;

  function formatDate(ts) {
    if (!ts) return '—';
    const d = new Date(ts);
    return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
  }

  function initialsFor(profile) {
    const source = (profile && (profile.displayName || profile.username)) || '?';
    return source.slice(0, 2).toUpperCase();
  }

  function renderAvatarPreview(url, profile) {
    const el = qs('#profile-avatar-preview');
    if (url) {
      el.style.backgroundImage = 'url(' + url + ')';
      el.classList.add('has-image');
      el.textContent = '';
    } else {
      el.style.backgroundImage = '';
      el.classList.remove('has-image');
      el.textContent = initialsFor(profile);
    }
  }

  function clearError() {
    const el = qs('#profile-error');
    el.textContent = '';
    el.classList.add('hidden');
  }

  function showError(msg) {
    const el = qs('#profile-error');
    el.textContent = msg;
    el.classList.remove('hidden');
  }

  function updateBioCounter() {
    const len = qs('#input-bio').value.length;
    qs('#bio-counter').textContent = len + ' / 900';
  }

  function open() {
    const profile = OBUNTO_STORE.get();
    if (!profile) return;
    pendingAvatar = null;
    removeRequested = false;
    clearError();
    qs('#input-display-name').value = profile.displayName || '';
    qs('#input-bio').value = profile.bio || '';
    updateBioCounter();
    qs('#profile-username-tag').textContent = '#' + profile.username;
    qs('#profile-created-at').textContent = formatDate(profile.createdAt);
    renderAvatarPreview(profile.avatar || null, profile);
    qs('#modal-profile').classList.remove('hidden');
  }

  function close() {
    qs('#modal-profile').classList.add('hidden');
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function resizeImage(dataUrl, maxSize) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > maxSize) {
            height = Math.round(height * (maxSize / width));
            width = maxSize;
          }
        } else if (height > maxSize) {
          width = Math.round(width * (maxSize / height));
          height = maxSize;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = reject;
      img.src = dataUrl;
    });
  }

  async function onAvatarFileChange(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    clearError();
    try {
      const raw = await readFileAsDataUrl(file);
      const resized = await resizeImage(raw, 256);
      pendingAvatar = resized;
      removeRequested = false;
      renderAvatarPreview(resized, OBUNTO_STORE.get());
    } catch (err) {
      showError('Não foi possível carregar essa imagem.');
    }
    e.target.value = '';
  }

  function onRemoveAvatar() {
    pendingAvatar = null;
    removeRequested = true;
    renderAvatarPreview(null, OBUNTO_STORE.get());
  }

  async function save() {
    clearError();
    const btn = qs('#btn-save-profile');
    btn.dataset.busy = 'true';
    btn.disabled = true;
    try {
      const displayName = qs('#input-display-name').value.trim();
      const bio = qs('#input-bio').value;
      const token = OBUNTO_STORE.getToken();
      const res = await OBUNTO_AUTH.updateProfile(token, displayName, bio);
      let merged = Object.assign({}, OBUNTO_STORE.get(), res.user);

      if (pendingAvatar) {
        const avRes = await OBUNTO_AUTH.uploadAvatar(token, pendingAvatar);
        merged.avatar = avRes.avatar;
      } else if (removeRequested) {
        await OBUNTO_AUTH.removeAvatar(token);
        merged.avatar = null;
      }

      OBUNTO_STORE.save(merged);
      renderChrome(merged);
      close();
    } catch (err) {
      showError('Não foi possível salvar seu perfil. Tente novamente.');
    } finally {
      btn.dataset.busy = 'false';
      btn.disabled = false;
    }
  }

  function renderChrome(profile) {
    if (!profile) return;
    const nameEl = qs('#my-name');
    const tagEl = qs('#my-tag');
    const avatarEl = qs('#my-avatar');
    if (nameEl) nameEl.textContent = profile.displayName || profile.username;
    if (tagEl) tagEl.textContent = '#' + profile.username;
    if (avatarEl) {
      if (profile.avatar) {
        avatarEl.style.backgroundImage = 'url(' + profile.avatar + ')';
        avatarEl.classList.add('has-image');
        avatarEl.textContent = '';
      } else {
        avatarEl.style.backgroundImage = '';
        avatarEl.classList.remove('has-image');
        avatarEl.textContent = initialsFor(profile);
      }
    }
  }

  function init() {
    qs('#btn-open-profile').addEventListener('click', open);
    qs('#btn-close-profile').addEventListener('click', close);
    qs('#input-bio').addEventListener('input', updateBioCounter);
    qs('#btn-choose-avatar').addEventListener('click', () => qs('#input-avatar-file').click());
    qs('#profile-avatar-preview').addEventListener('click', () => qs('#input-avatar-file').click());
    qs('#input-avatar-file').addEventListener('change', onAvatarFileChange);
    qs('#btn-remove-avatar').addEventListener('click', onRemoveAvatar);
    qs('#btn-save-profile').addEventListener('click', save);
  }

  return { init, open, close, renderChrome };
})();