const OBUNTO_SERVERS = (() => {
  const SERVERS = [
    {
      id: 'hq',
      tag: 'HQ',
      name: 'OBUNTO HQ',
      textChannels: [
        { id: 'geral', name: 'geral' },
        { id: 'projetos', name: 'projetos' },
        { id: 'off-topic', name: 'off-topic' }
      ],
      voiceChannels: [
        { id: 'sala-1', name: 'sala-1' },
        { id: 'sala-2', name: 'sala-2' }
      ]
    }
  ];

  let activeServerId = SERVERS[0].id;

  function getActiveServer() {
    return SERVERS.find(s => s.id === activeServerId) || SERVERS[0];
  }

  function renderServerRail() {
    const el = qs('#rail-servers');
    el.innerHTML = '';
    SERVERS.forEach(server => {
      const btn = ce('div', 'rail__server');
      btn.textContent = server.tag;
      btn.title = server.name;
      if (server.id === activeServerId) btn.classList.add('is-active');
      btn.addEventListener('click', () => {
        if (server.id === activeServerId) return;
        activeServerId = server.id;
        renderAll();
        const first = getActiveServer().textChannels[0];
        if (first) OBUNTO_CHAT.openChannel(first);
      });
      el.appendChild(btn);
    });
  }

  function renderChannelLists() {
    const server = getActiveServer();
    qs('#server-name').textContent = server.name;

    const textEl = qs('#text-channels');
    textEl.innerHTML = '';
    server.textChannels.forEach((ch, i) => {
      const item = ce('div', 'channel-item');
      item.dataset.index = String(i + 1).padStart(2, '0');
      item.textContent = '#' + ch.name;
      item.addEventListener('click', () => {
        qsa('#text-channels .channel-item').forEach(el => el.classList.remove('is-active'));
        item.classList.add('is-active');
        OBUNTO_CHAT.openChannel(ch);
      });
      textEl.appendChild(item);
    });

    const voiceEl = qs('#voice-channels');
    voiceEl.innerHTML = '';
    server.voiceChannels.forEach((ch, i) => {
      const item = ce('div', 'channel-item channel-item--voice');
      item.dataset.index = String(i + 1).padStart(2, '0');
      item.textContent = ')) ' + ch.name;
      item.addEventListener('click', () => {
        qsa('#voice-channels .channel-item').forEach(el => el.classList.remove('is-active'));
        item.classList.add('is-active');
        OBUNTO_VOICE.joinChannel(ch);
      });
      voiceEl.appendChild(item);
    });
  }

  function renderAll() {
    renderServerRail();
    renderChannelLists();
  }

  function init() {
    renderAll();
  }

  return { init, getActiveServer };
})();