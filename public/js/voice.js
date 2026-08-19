const OBUNTO_VOICE = (() => {
  let localStream = null;
  let screenStream = null;
  let camStream = null;
  let currentChannel = null;
  let currentRoomId = null;
  let myProfile = null;
  let muted = false;
  let bound = false;
  let sharingScreen = false;
  let sharingCam = false;

  const peerProfiles = new Map();
  const localVolumes = new Map();
  const localMutes = new Map();

  function getLocalStream() {
    return localStream;
  }

  function currentOutputId() {
    return OBUNTO_STORE.getAudioPrefs().outputId || null;
  }

  function labelFor(userId) {
    if (myProfile && userId === myProfile.id) return myProfile.displayName || myProfile.username;
    const p = peerProfiles.get(userId);
    return p ? (p.displayName || p.username) : 'unidade-' + userId.slice(-4);
  }

  function colorFor(userId) {
    if (myProfile && userId === myProfile.id) return myProfile.color;
    const p = peerProfiles.get(userId);
    return p ? p.color : 'var(--ink-soft)';
  }

  function avatarFor(userId) {
    if (myProfile && userId === myProfile.id) return myProfile.avatar || null;
    const p = peerProfiles.get(userId);
    return p ? (p.avatar || null) : null;
  }

  function profileFor(userId) {
    if (myProfile && userId === myProfile.id) return myProfile;
    return peerProfiles.get(userId) || null;
  }

  function applyMiniAvatar(el, userId) {
    if (!el) return;
    const av = avatarFor(userId);
    if (av) {
      el.style.backgroundImage = 'url(' + av + ')';
      el.classList.add('has-image');
    } else {
      el.style.backgroundImage = '';
      el.classList.remove('has-image');
      el.style.background = colorFor(userId);
    }
  }

  function applyFallbackAvatar(el, userId) {
    if (!el) return;
    const av = avatarFor(userId);
    if (av) {
      el.style.backgroundImage = 'url(' + av + ')';
      el.style.background = '';
      el.textContent = '';
    } else {
      el.style.backgroundImage = '';
      el.style.background = colorFor(userId);
      el.textContent = labelFor(userId).slice(0, 2).toUpperCase();
    }
  }

  function hasLiveVideo(stream) {
    return !!(stream && stream.getVideoTracks().some(t => t.readyState === 'live'));
  }

  function applyLocalAudioState(userId, videoEl) {
    if (!videoEl) return;
    const vol = localVolumes.has(userId) ? localVolumes.get(userId) : 1;
    const isMuted = localMutes.get(userId) === true;
    videoEl.volume = vol;
    videoEl.muted = isMuted;
  }

  function openProfileFor(userId, anchorEl) {
    if (myProfile && userId === myProfile.id) {
      OBUNTO_PROFILE.open();
      return;
    }
    const profile = profileFor(userId);
    if (profile) OBUNTO_POPOVER.open(profile, anchorEl);
  }

  function renderTile(userId, stream, label, isLocal, kindTag) {
    let tile = qs('#tile-' + userId);
    if (!tile) {
      tile = ce('div', 'voice-tile');
      tile.id = 'tile-' + userId;

      const video = ce('video', 'voice-tile__video');
      video.autoplay = true;
      video.playsInline = true;
      if (isLocal) video.muted = true;

      const fallback = ce('div', 'voice-tile__fallback');
      const fallbackAvatar = ce('div', 'voice-tile__fallback-avatar');
      fallback.appendChild(fallbackAvatar);

      const nameTag = ce('div', 'voice-tile__name');
      const miniAvatar = ce('div', 'voice-tile__mini-avatar');
      const dot = ce('span', 'voice-tile__dot');
      const nameText = ce('span');
      nameTag.appendChild(miniAvatar);
      nameTag.appendChild(dot);
      nameTag.appendChild(nameText);

      const openProfileHandler = ev => {
        ev.stopPropagation();
        openProfileFor(userId, nameTag);
      };
      miniAvatar.style.cursor = 'pointer';
      miniAvatar.addEventListener('click', openProfileHandler);
      nameText.style.cursor = 'pointer';
      nameText.addEventListener('click', openProfileHandler);

      const tag = ce('div', 'voice-tile__tag');
      tag.textContent = isLocal ? 'LOCAL' : 'REMOTO';

      const corner = ce('div', 'voice-tile__corner');

      const controls = ce('div', 'voice-tile__controls');

      const expandBtn = ce('button', 'voice-tile__ctrl-btn');
      expandBtn.type = 'button';
      expandBtn.title = 'Expandir';
      expandBtn.textContent = '⤢';
      expandBtn.addEventListener('click', () => {
        const target = tile;
        if (document.fullscreenElement === target) {
          document.exitFullscreen().catch(() => {});
        } else if (target.requestFullscreen) {
          target.requestFullscreen().catch(() => {
            tile.classList.toggle('is-expanded');
          });
        } else {
          tile.classList.toggle('is-expanded');
        }
      });
      controls.appendChild(expandBtn);

      if (!isLocal) {
        const muteBtn = ce('button', 'voice-tile__ctrl-btn');
        muteBtn.type = 'button';
        muteBtn.title = 'Silenciar apenas para mim';
        muteBtn.textContent = '🔇';
        muteBtn.dataset.active = 'false';
        muteBtn.addEventListener('click', () => {
          const next = !(localMutes.get(userId) === true);
          localMutes.set(userId, next);
          muteBtn.dataset.active = String(next);
          applyLocalAudioState(userId, tile.querySelector('video'));
        });
        controls.appendChild(muteBtn);

        const volWrap = ce('div', 'voice-tile__volume');
        const volInput = ce('input', 'voice-tile__volume-input');
        volInput.type = 'range';
        volInput.min = '0';
        volInput.max = '100';
        volInput.value = String(Math.round((localVolumes.has(userId) ? localVolumes.get(userId) : 1) * 100));
        volInput.title = 'Volume apenas para mim';
        volInput.addEventListener('input', () => {
          const v = Number(volInput.value) / 100;
          localVolumes.set(userId, v);
          if (v > 0 && localMutes.get(userId)) {
            localMutes.set(userId, false);
            muteBtn.dataset.active = 'false';
          }
          applyLocalAudioState(userId, tile.querySelector('video'));
        });
        volWrap.appendChild(volInput);
        controls.appendChild(volWrap);
      }

      tile.appendChild(video);
      tile.appendChild(fallback);
      tile.appendChild(corner);
      tile.appendChild(nameTag);
      tile.appendChild(tag);
      tile.appendChild(controls);
      qs('#voice-tiles').appendChild(tile);
    }

    const videoEl = tile.querySelector('video');
    const nameEl = tile.querySelector('.voice-tile__name span:last-child');
    const miniAvatarEl = tile.querySelector('.voice-tile__mini-avatar');
    const tagEl = tile.querySelector('.voice-tile__tag');
    const fallbackAvatarEl = tile.querySelector('.voice-tile__fallback-avatar');
    nameEl.textContent = label;
    applyMiniAvatar(miniAvatarEl, userId);
    if (kindTag) tagEl.textContent = kindTag;

    const showVideo = hasLiveVideo(stream);
tile.classList.toggle('no-video', !showVideo);
videoEl.srcObject = stream;
if (!showVideo) {
  applyFallbackAvatar(fallbackAvatarEl, userId);
}

    if (isLocal) {
      videoEl.muted = true;
    } else {
      applyLocalAudioState(userId, videoEl);
      OBUNTO_AUDIO.applySinkId(videoEl, currentOutputId());
    }
  }

  function removeTile(userId) {
    const tile = qs('#tile-' + userId);
    if (tile) {
      const videoEl = tile.querySelector('video');
      if (videoEl) videoEl.srcObject = null;
      tile.remove();
    }
    localVolumes.delete(userId);
    localMutes.delete(userId);
    peerProfiles.delete(userId);
  }

  function applyOutputDevice(deviceId) {
    qsa('.voice-tile__video').forEach(video => {
      if (video.muted) return;
      OBUNTO_AUDIO.applySinkId(video, deviceId);
    });
  }

  async function applyInputDevice(deviceId) {
    if (!localStream) return;
    let newStream;
    try {
      newStream = await OBUNTO_AUDIO.getInputStream(deviceId);
    } catch (e) {
      return;
    }
    const oldTrack = localStream.getAudioTracks()[0];
    if (oldTrack) oldTrack.stop();
    localStream.removeTrack(oldTrack);
    const newTrack = newStream.getAudioTracks()[0];
    newTrack.enabled = !muted;
    localStream.addTrack(newTrack);
    OBUNTO_RTC.setLocalStream(localStream);
  }

  function registerProfile(userId, profile) {
    if (profile) peerProfiles.set(userId, profile);
  }

  function localLabel(suffix) {
    const base = myProfile.displayName || myProfile.username;
    return suffix ? base + ' (' + suffix + ')' : base;
  }

  function rejoinRoom() {
    if (!currentChannel || !currentRoomId) return;
    OBUNTO_RTC.closeAll();
    qsa('.voice-tile').forEach(t => {
      if (t.id !== 'tile-' + myProfile.id) t.remove();
    });
    OBUNTO_SIGNAL.join(currentRoomId, OBUNTO_STORE.getToken());
  }

  function bindSignalHandlers() {
    if (bound) return;
    bound = true;

    OBUNTO_SIGNAL.on('connected', () => {
      if (currentChannel) rejoinRoom();
    });

    OBUNTO_SIGNAL.on('joined', msg => {
      if (msg.roomId !== currentRoomId) return;
      msg.peers.forEach(p => {
        registerProfile(p.userId, p.profile);
        OBUNTO_RTC.createPeer(p.userId, true);
      });
    });

    OBUNTO_SIGNAL.on('peer-joined', msg => {
      if (msg.roomId !== currentRoomId) return;
      registerProfile(msg.userId, msg.profile);
    });

    OBUNTO_SIGNAL.on('signal', msg => {
      if (msg.roomId !== currentRoomId) return;
      OBUNTO_RTC.handleSignal(msg.from, msg.data);
    });

    OBUNTO_SIGNAL.on('peer-left', msg => {
      if (msg.roomId !== currentRoomId) return;
      OBUNTO_RTC.removePeer(msg.userId);
      removeTile(msg.userId);
    });

    OBUNTO_SIGNAL.on('profile-updated', msg => {
      if (msg.roomId !== currentRoomId) return;
      registerProfile(msg.userId, msg.profile);
      const tile = qs('#tile-' + msg.userId);
      if (!tile) return;
      const nameEl = tile.querySelector('.voice-tile__name span:last-child');
      const miniAvatarEl = tile.querySelector('.voice-tile__mini-avatar');
      const fallbackAvatarEl = tile.querySelector('.voice-tile__fallback-avatar');
      if (nameEl) nameEl.textContent = labelFor(msg.userId);
      applyMiniAvatar(miniAvatarEl, msg.userId);
      if (tile.classList.contains('no-video')) applyFallbackAvatar(fallbackAvatarEl, msg.userId);
    });

    OBUNTO_RTC.onTrack((userId, stream, kind) => {
      renderTile(userId, stream, labelFor(userId), false);
    });

    OBUNTO_RTC.onLeave(userId => removeTile(userId));
  }

  async function joinChannel(channel) {
    if (currentChannel) await leaveChannel();

    currentChannel = channel;
    currentRoomId = 'voice:' + channel.id;
    myProfile = OBUNTO_STORE.get();
    muted = false;

    const prefs = OBUNTO_STORE.getAudioPrefs();
    try {
      localStream = await OBUNTO_AUDIO.getInputStream(prefs.inputId);
    } catch (e) {
      localStream = new MediaStream();
    }

    qs('#view-chat').classList.add('hidden');
    qs('#view-voice').classList.remove('hidden');
    qs('#channel-title').textContent = ')))  ' + channel.name;
    qs('#voice-tiles').innerHTML = '';
    renderTile(myProfile.id, localStream, localLabel('você'), true, 'LOCAL');

    OBUNTO_RTC.setLocalStream(localStream);
    OBUNTO_RTC.setRoom(currentRoomId);
    bindSignalHandlers();

    try {
      await OBUNTO_SIGNAL.connect();
    } catch (e) {}
    OBUNTO_SIGNAL.join(currentRoomId, OBUNTO_STORE.getToken());
  }

  async function leaveChannel() {
    if (!currentChannel) return;

    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch (e) {}
    }
    qsa('.voice-tile.is-expanded').forEach(t => t.classList.remove('is-expanded'));

    OBUNTO_SIGNAL.leave(currentRoomId);
    OBUNTO_RTC.closeAll();

    if (localStream) localStream.getTracks().forEach(t => t.stop());
    if (screenStream) screenStream.getTracks().forEach(t => t.stop());
    if (camStream) camStream.getTracks().forEach(t => t.stop());

    localStream = null;
    screenStream = null;
    camStream = null;
    currentChannel = null;
    currentRoomId = null;
    muted = false;
    sharingScreen = false;
    sharingCam = false;
    peerProfiles.clear();
    localVolumes.clear();
    localMutes.clear();

    qs('#voice-tiles').innerHTML = '';
    qs('#view-voice').classList.add('hidden');
    qs('#view-chat').classList.remove('hidden');
    qs('#btn-mute').dataset.active = 'false';
    qs('#btn-video').dataset.active = 'false';
    qs('#btn-screen').dataset.active = 'false';

    if (typeof OBUNTO_SERVERS !== 'undefined') OBUNTO_SERVERS.deactivateVoiceChannels();
  }

  function toggleMute() {
    if (!localStream) return;
    muted = !muted;
    localStream.getAudioTracks().forEach(t => (t.enabled = !muted));
    qs('#btn-mute').dataset.active = String(muted);
  }

  async function toggleVideo() {
    const btn = qs('#btn-video');

    if (!sharingCam) {
      try {
        camStream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } });
      } catch (e) {
        return;
      }
      const track = camStream.getVideoTracks()[0];
      OBUNTO_RTC.addTrack(track, camStream);
      renderTile(myProfile.id, camStream, localLabel('câmera'), true, 'LOCAL');
      sharingCam = true;
      btn.dataset.active = 'true';
    } else {
      OBUNTO_RTC.removeTrackByKind('video');
      if (camStream) camStream.getTracks().forEach(t => t.stop());
      camStream = null;
      sharingCam = false;
      renderTile(myProfile.id, localStream, localLabel('você'), true, 'LOCAL');
      btn.dataset.active = 'false';
    }
  }

  async function toggleScreen() {
    const btn = qs('#btn-screen');

    if (!sharingScreen) {
      try {
        screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
        });
      } catch (e) {
        try {
          screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        } catch (e2) {
          return;
        }
      }
      const videoTrack = screenStream.getVideoTracks()[0];
      OBUNTO_RTC.addTrack(videoTrack, screenStream);
      const screenAudioTrack = screenStream.getAudioTracks()[0];
      if (screenAudioTrack) OBUNTO_RTC.addTrack(screenAudioTrack, screenStream);

      renderTile(myProfile.id, screenStream, localLabel('tela'), true, 'LOCAL');
      videoTrack.onended = () => toggleScreen();
      sharingScreen = true;
      btn.dataset.active = 'true';
    } else {
      OBUNTO_RTC.removeTrackByKind('video');
      if (screenStream) {
        screenStream.getAudioTracks().forEach(t => OBUNTO_RTC.removeSpecificTrack(t));
        screenStream.getTracks().forEach(t => t.stop());
      }
      screenStream = null;
      sharingScreen = false;
      renderTile(myProfile.id, localStream, localLabel('você'), true, 'LOCAL');
      btn.dataset.active = 'false';
    }
  }

  function init() {
    qs('#btn-mute').addEventListener('click', toggleMute);
    qs('#btn-video').addEventListener('click', toggleVideo);
    qs('#btn-screen').addEventListener('click', toggleScreen);
    qs('#btn-leave').addEventListener('click', leaveChannel);
    qs('#btn-settings-call').addEventListener('click', OBUNTO_MODAL.open);
  }

  return { init, joinChannel, leaveChannel, getLocalStream, applyInputDevice, applyOutputDevice };
})();