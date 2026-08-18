const OBUNTO_PROFILE = (() => {
  let pendingAvatar = null;
  let removeRequested = false;

  let cropImg = null;
  let cropNaturalW = 0;
  let cropNaturalH = 0;
  let cropBaseScale = 1;
  let cropZoom = 1;
  let cropOffsetX = 0;
  let cropOffsetY = 0;
  let cropDragging = false;
  let cropStartX = 0;
  let cropStartY = 0;
  let cropStartOffsetX = 0;
  let cropStartOffsetY = 0;
  const CROP_SIZE = 280;
  const CROP_OUTPUT = 480;

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

  function clampCropOffsets() {
    const dispW = cropNaturalW * cropBaseScale * cropZoom;
    const dispH = cropNaturalH * cropBaseScale * cropZoom;
    const minX = Math.min(0, CROP_SIZE - dispW);
    const minY = Math.min(0, CROP_SIZE - dispH);
    cropOffsetX = Math.max(minX, Math.min(0, cropOffsetX));
    cropOffsetY = Math.max(minY, Math.min(0, cropOffsetY));
  }

  function applyCropTransform() {
    const dispW = cropNaturalW * cropBaseScale * cropZoom;
    const dispH = cropNaturalH * cropBaseScale * cropZoom;
    cropImg.style.width = dispW + 'px';
    cropImg.style.height = dispH + 'px';
    cropImg.style.left = cropOffsetX + 'px';
    cropImg.style.top = cropOffsetY + 'px';
  }

  function openCropModal(dataUrl) {
    cropImg = qs('#crop-image');
    const img = new Image();
    img.onload = () => {
      cropNaturalW = img.width;
      cropNaturalH = img.height;
      cropBaseScale = Math.max(CROP_SIZE / cropNaturalW, CROP_SIZE / cropNaturalH);
      cropZoom = 1;
      qs('#crop-zoom-range').value = 100;
      const dispW = cropNaturalW * cropBaseScale;
      const dispH = cropNaturalH * cropBaseScale;
      cropOffsetX = (CROP_SIZE - dispW) / 2;
      cropOffsetY = (CROP_SIZE - dispH) / 2;
      cropImg.src = dataUrl;
      applyCropTransform();
      qs('#modal-avatar-crop').classList.remove('hidden');
    };
    img.src = dataUrl;
  }

  function closeCropModal() {
    qs('#modal-avatar-crop').classList.add('hidden');
  }

  function onCropZoomChange() {
    cropZoom = Number(qs('#crop-zoom-range').value) / 100;
    clampCropOffsets();
    applyCropTransform();
  }

  function cropPointerDown(e) {
    cropDragging = true;
    const point = e.touches ? e.touches[0] : e;
    cropStartX = point.clientX;
    cropStartY = point.clientY;
    cropStartOffsetX = cropOffsetX;
    cropStartOffsetY = cropOffsetY;
  }

  function cropPointerMove(e) {
    if (!cropDragging) return;
    const point = e.touches ? e.touches[0] : e;
    cropOffsetX = cropStartOffsetX + (point.clientX - cropStartX);
    cropOffsetY = cropStartOffsetY + (point.clientY - cropStartY);
    clampCropOffsets();
    applyCropTransform();
  }

  function cropPointerUp() {
    cropDragging = false;
  }

  function confirmCrop() {
    const effectiveScale = cropBaseScale * cropZoom;
    const sx = -cropOffsetX / effectiveScale;
    const sy = -cropOffsetY / effectiveScale;
    const sSize = CROP_SIZE / effectiveScale;
    const canvas = document.createElement('canvas');
    canvas.width = CROP_OUTPUT;
    canvas.height = CROP_OUTPUT;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(cropImg, sx, sy, sSize, sSize, 0, 0, CROP_OUTPUT, CROP_OUTPUT);
    pendingAvatar = canvas.toDataURL('image/jpeg', 0.88);
    removeRequested = false;
    renderAvatarPreview(pendingAvatar, OBUNTO_STORE.get());
    closeCropModal();
  }

  async function onAvatarFileChange(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    clearError();
    try {
      const raw = await readFileAsDataUrl(file);
      openCropModal(raw);
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

    qs('#btn-close-crop').addEventListener('click', closeCropModal);
    qs('#btn-confirm-crop').addEventListener('click', confirmCrop);
    qs('#crop-zoom-range').addEventListener('input', onCropZoomChange);

    const stage = qs('#crop-stage');
    stage.addEventListener('mousedown', cropPointerDown);
    window.addEventListener('mousemove', cropPointerMove);
    window.addEventListener('mouseup', cropPointerUp);
    stage.addEventListener('touchstart', cropPointerDown, { passive: true });
    window.addEventListener('touchmove', cropPointerMove, { passive: true });
    window.addEventListener('touchend', cropPointerUp);
  }

  return { init, open, close, renderChrome };
})();