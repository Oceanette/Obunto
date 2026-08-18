const OBUNTO_MODAL = (() => {
  let previewStream = null;

  function populateDevices() {
    return navigator.mediaDevices.enumerateDevices().then(devices => {
      const micSelect = qs('#select-mic');
      const spkSelect = qs('#select-speaker');
      const prefs = OBUNTO_STORE.getAudioPrefs();
      micSelect.innerHTML = '';
      spkSelect.innerHTML = '';
      let hasSpeakerOptions = false;
      devices.forEach(d => {
        const opt = ce('option');
        opt.value = d.deviceId;
        opt.textContent = d.label || (d.kind + ' ' + d.deviceId.slice(0, 6));
        if (d.kind === 'audioinput') {
          if (prefs.inputId === d.deviceId) opt.selected = true;
          micSelect.appendChild(opt);
        }
        if (d.kind === 'audiooutput') {
          hasSpeakerOptions = true;
          const spkOpt = opt.cloneNode(true);
          if (prefs.outputId === d.deviceId) spkOpt.selected = true;
          spkSelect.appendChild(spkOpt);
        }
      });
      spkSelect.disabled = !hasSpeakerOptions;
    });
  }

  async function openPreviewStream() {
    const prefs = OBUNTO_STORE.getAudioPrefs();
    try {
      previewStream = await OBUNTO_AUDIO.getInputStream(prefs.inputId);
    } catch (e) {
      previewStream = null;
    }
    return previewStream;
  }

  async function open() {
    qs('#modal-settings').classList.remove('hidden');
    await populateDevices();
    let stream = OBUNTO_VOICE.getLocalStream();
    if (!stream) {
      stream = await openPreviewStream();
    }
    if (stream) OBUNTO_MICCHECK.attach(stream, qs('#mic-meter-fill'));
  }

  function close() {
    qs('#modal-settings').classList.add('hidden');
    OBUNTO_MICCHECK.detach();
    if (previewStream) {
      previewStream.getTracks().forEach(t => t.stop());
      previewStream = null;
    }
    const btn = qs('#btn-hear-self');
    btn.dataset.active = 'false';
    btn.textContent = 'OUVIR MINHA VOZ';
  }

  async function onMicChange() {
    const deviceId = qs('#select-mic').value;
    OBUNTO_STORE.saveAudioPrefs({ inputId: deviceId });
    const wasHearing = OBUNTO_MICCHECK.isActive();
    if (previewStream) {
      previewStream.getTracks().forEach(t => t.stop());
      previewStream = await openPreviewStream();
      if (previewStream) {
        OBUNTO_MICCHECK.attach(previewStream, qs('#mic-meter-fill'));
        OBUNTO_MICCHECK.toggleSelfListen(wasHearing);
      }
    }
    if (typeof OBUNTO_VOICE.applyInputDevice === 'function') {
      OBUNTO_VOICE.applyInputDevice(deviceId);
    }
  }

  function onSpeakerChange() {
    const deviceId = qs('#select-speaker').value;
    OBUNTO_STORE.saveAudioPrefs({ outputId: deviceId });
    if (typeof OBUNTO_VOICE.applyOutputDevice === 'function') {
      OBUNTO_VOICE.applyOutputDevice(deviceId);
    }
  }

  function init() {
    qs('#btn-open-settings').addEventListener('click', open);
    qs('#btn-close-settings').addEventListener('click', close);
    qs('#select-mic').addEventListener('change', onMicChange);
    qs('#select-speaker').addEventListener('change', onSpeakerChange);
    qs('#btn-hear-self').addEventListener('click', () => {
      const btn = qs('#btn-hear-self');
      const next = btn.dataset.active !== 'true';
      btn.dataset.active = String(next);
      OBUNTO_MICCHECK.toggleSelfListen(next);
      btn.textContent = next ? 'PARAR DE OUVIR' : 'OUVIR MINHA VOZ';
    });
  }

  return { open, close, init };
})();
