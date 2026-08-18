let OBUNTO_MAIN_READY;
let OBUNTO_MAIN_STARTED = false;

document.addEventListener('DOMContentLoaded', () => {
  OBUNTO_MAIN_READY = function () {
    if (OBUNTO_MAIN_STARTED) return;
    OBUNTO_MAIN_STARTED = true;
    OBUNTO_SERVERS.init();
    OBUNTO_CHAT.init();
    OBUNTO_VOICE.init();
    const activeServer = OBUNTO_SERVERS.getActiveServer();
    OBUNTO_CHAT.openChannel(activeServer.textChannels[0]);
    const firstItem = qs('#text-channels .channel-item');
    if (firstItem) firstItem.classList.add('is-active');
  };

  OBUNTO_MODAL.init();
  OBUNTO_PROFILE.init();
  OBUNTO_AUTH_SCREEN.init();
});