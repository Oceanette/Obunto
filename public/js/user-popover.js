const OBUNTO_POPOVER = (() => {
  function initialsFor(profile) {
    const source = (profile && (profile.displayName || profile.username)) || '?';
    return source.slice(0, 2).toUpperCase();
  }

  function formatDate(ts) {
    if (!ts) return '—';
    const d = new Date(ts);
    return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
  }

  function onOutsideClick(e) {
    const pop = qs('#user-popover');
    if (!pop.contains(e.target)) close();
  }

  function close() {
    qs('#user-popover').classList.add('hidden');
    document.removeEventListener('mousedown', onOutsideClick, true);
  }

  function position(anchorRect) {
    const pop = qs('#user-popover');
    const margin = 10;
    let left = anchorRect.left;
    let top = anchorRect.bottom + margin;
    const popW = pop.offsetWidth || 280;
    const popH = pop.offsetHeight || 220;
    if (left + popW > window.innerWidth - margin) left = window.innerWidth - popW - margin;
    if (left < margin) left = margin;
    if (top + popH > window.innerHeight - margin) top = anchorRect.top - popH - margin;
    if (top < margin) top = margin;
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
  }

  function open(profile, anchorEl) {
    if (!profile || !anchorEl) return;
    const avatarEl = qs('#popover-avatar');
    if (profile.avatar) {
      avatarEl.style.backgroundImage = 'url(' + profile.avatar + ')';
      avatarEl.classList.add('has-image');
      avatarEl.style.background = '';
      avatarEl.textContent = '';
    } else {
      avatarEl.style.backgroundImage = '';
      avatarEl.classList.remove('has-image');
      avatarEl.style.background = profile.color || 'var(--ink-soft)';
      avatarEl.textContent = initialsFor(profile);
    }
    qs('#popover-name').textContent = profile.displayName || profile.username;
    qs('#popover-name').style.color = profile.color || 'var(--ink)';
    qs('#popover-tag').textContent = '#' + profile.username;
    qs('#popover-bio').textContent = profile.bio && profile.bio.length ? profile.bio : 'Nenhuma biografia definida.';
    qs('#popover-created').textContent = formatDate(profile.createdAt);

    const pop = qs('#user-popover');
    pop.classList.remove('hidden');
    position(anchorEl.getBoundingClientRect());

    document.removeEventListener('mousedown', onOutsideClick, true);
    setTimeout(() => document.addEventListener('mousedown', onOutsideClick, true), 0);
  }

  function init() {
    qs('#user-popover').addEventListener('mousedown', e => e.stopPropagation());
  }

  return { init, open, close };
})();