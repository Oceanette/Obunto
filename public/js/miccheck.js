const OBUNTO_MICCHECK = (() => {
  let audioCtx = null;
  let sourceNode = null;
  let gainNode = null;
  let analyser = null;
  let rafId = null;
  let active = false;

  function attach(stream, meterEl) {
    detach();
    audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 });
    sourceNode = audioCtx.createMediaStreamSource(stream);
    gainNode = audioCtx.createGain();
    gainNode.gain.value = 0;
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    sourceNode.connect(analyser);
    sourceNode.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    const data = new Uint8Array(analyser.frequencyBinCount);
    function loop() {
      analyser.getByteFrequencyData(data);
      const avg = data.reduce((a, b) => a + b, 0) / data.length;
      if (meterEl) meterEl.style.width = Math.min(100, (avg / 128) * 100) + '%';
      rafId = requestAnimationFrame(loop);
    }
    loop();
  }

  function toggleSelfListen(on) {
    active = on;
    if (gainNode) gainNode.gain.value = on ? 1 : 0;
  }

  function isActive() {
    return active;
  }

  function detach() {
    if (rafId) cancelAnimationFrame(rafId);
    if (audioCtx) audioCtx.close();
    audioCtx = null;
    sourceNode = null;
    gainNode = null;
    analyser = null;
    active = false;
    rafId = null;
  }

  return { attach, toggleSelfListen, isActive, detach };
})();
