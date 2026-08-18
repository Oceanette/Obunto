const OBUNTO_SERVERS = (() => {
  const data = [
    {
      id: 'srv-obunto',
      name: 'OBUNTO HQ',
      textChannels: [
        { id: 'geral', name: 'geral' },
        { id: 'projetos', name: 'projetos' }
      ],
      voiceChannels: [
        { id: 'voz-1', name: 'sala-01' },
        { id: 'voz-2', name: 'sala-02' }
      ]
    }
  ];

  let activeServer = data[0];

  function renderRail() {
    const el = qs('#rail-servers');
    el.innerHTML = '';
    data.forEach(srv => {
      const icon = ce('div', 'rail__server');
      icon.textContent = srv.name.slice(0, 2).toUpperCase();
      if (srv === activeServer) icon.classList.add('is-active');
      icon.addEventListener('click', () => selectServer(srv));
      el.appendChild(icon);
    });
  }

  function selectServer(srv) {
    activeServer = srv;
    qs('#server-name').textContent = srv.name;
    renderRail();
    renderChannels();
  }

  function renderChannels() {
    const textEl = qs('#text-channels');
    const voiceEl = qs('#voice-channels');
    textEl.innerHTML = '';
    voiceEl.innerHTML = '';

    activeServer.textChannels.forEach((ch, i) => {
      const item = ce('div', 'channel-item');
      item.dataset.index = String(i + 1).padStart(2, '0');
      const label = ce('span');
      label.textContent = '# ' + ch.name;
      item.appendChild(label);
      item.addEventListener('click', () => {
        qsa('#text-channels .channel-item').forEach(el => el.classList.remove('is-active'));
        item.classList.add('is-active');
        OBUNTO_CHAT.openChannel(ch);
      });
      textEl.appendChild(item);
    });

    activeServer.voiceChannels.forEach((ch, i) => {
      const item = ce('div', 'channel-item channel-item--voice');
      item.dataset.index = String(i + 1).padStart(2, '0');
      const label = ce('span');
      label.textContent = ')))  ' + ch.name;
      item.appendChild(label);
      item.addEventListener('click', () => {
        qsa('#voice-channels .channel-item').forEach(el => el.classList.remove('is-active'));
        item.classList.add('is-active');
        OBUNTO_VOICE.joinChannel(ch);
      });
      voiceEl.appendChild(item);
    });
  }

  function init() {
    renderRail();
    renderChannels();
  }

  return { init, getActiveServer: () => activeServer };
})();