const OBUNTO_AUDIO = (() => {
  function inputConstraints(deviceId) {
    const base = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 1,
      sampleRate: 48000,
      sampleSize: 16
    };
    if (deviceId) base.deviceId = { exact: deviceId };
    return { audio: base };
  }

  async function getInputStream(deviceId) {
    try {
      return await navigator.mediaDevices.getUserMedia(inputConstraints(deviceId));
    } catch (e) {
      if (deviceId) return navigator.mediaDevices.getUserMedia(inputConstraints(null));
      throw e;
    }
  }

  async function applySinkId(el, deviceId) {
    if (!el || !deviceId) return;
    if (typeof el.setSinkId !== 'function') return;
    try {
      await el.setSinkId(deviceId);
    } catch (e) {}
  }

  return { inputConstraints, getInputStream, applySinkId };
})();
