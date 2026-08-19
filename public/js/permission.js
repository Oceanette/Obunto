const OBUNTO_PERMISSION = (() => {
  const ICONS = {
    mic: '<svg viewBox="0 0 24 24"><path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Z"/><path d="M19 11a7 7 0 0 1-14 0"/><path d="M12 18v3"/></svg>',
    camera: '<svg viewBox="0 0 24 24"><rect x="3" y="6" width="14" height="12" rx="1"/><path d="M17 10l4-2v8l-4-2"/></svg>',
    screen: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="12" rx="1"/><path d="M8 20h8"/><path d="M12 16v4"/></svg>'
  };

  function build(opts) {
    const overlay = ce('div', 'permission-screen');
    const card = ce('div', 'permission-card');
    const rowsHtml = opts.rows
      .map(
        r =>
          '<div class="permission-card__row"><span class="permission-card__row-label">' +
          r[0] +
          '</span><span class="permission-card__row-value">' +
          r[1] +
          '</span></div>'
      )
      .join('');
    card.innerHTML =
      '<div class="permission-card__stripe"></div>' +
      '<div class="permission-card__head">' +
      '<div class="permission-card__icon">' +
      (ICONS[opts.icon] || ICONS.mic) +
      '</div>' +
      '<div class="permission-card__heading">' +
      '<span class="permission-card__eyebrow">SOLICITAÇÃO DE ACESSO</span>' +
      '<span class="permission-card__title">' +
      opts.title +
      '</span>' +
      '</div>' +
      '</div>' +
      '<div class="permission-card__body">' +
      '<p class="permission-card__desc">' +
      opts.description +
      '</p>' +
      '<div class="permission-card__rows">' +
      rowsHtml +
      '</div>' +
      '<div class="permission-card__actions">' +
      '<button type="button" class="permission-card__cancel" data-action="cancel">CANCELAR</button>' +
      '<button type="button" class="btn-primary" data-action="confirm"><span>' +
      opts.confirmLabel +
      '</span><span class="btn-primary__arrow">↗</span></button>' +
      '</div>' +
      '</div>' +
      '<div class="permission-card__footer"><span>OBUNTO ACCESS LAYER</span><span>U01</span></div>';
    overlay.appendChild(card);
    return overlay;
  }

  function request(opts) {
    return new Promise(resolve => {
      const overlay = build(opts);
      document.body.appendChild(overlay);
      function cleanup(result) {
        overlay.remove();
        resolve(result);
      }
      overlay.querySelector('[data-action="confirm"]').addEventListener('click', () => cleanup(true));
      overlay.querySelector('[data-action="cancel"]').addEventListener('click', () => cleanup(false));
    });
  }

  function mic() {
    return request({
      icon: 'mic',
      title: 'ACESSO AO MICROFONE',
      description:
        'O OBUNTO precisa capturar o áudio do seu microfone para transmitir sua voz na sala. O navegador vai pedir a permissão do sistema em seguida.',
      rows: [
        ['DISPOSITIVO', 'MICROFONE'],
        ['USO', 'TRANSMISSÃO DE VOZ'],
        ['CONEXÃO', 'PONTO A PONTO']
      ],
      confirmLabel: 'AUTORIZAR MICROFONE'
    });
  }

  function camera() {
    return request({
      icon: 'camera',
      title: 'ACESSO À CÂMERA',
      description:
        'O OBUNTO precisa acessar sua câmera para exibir seu vídeo na chamada. O navegador vai pedir a permissão do sistema em seguida.',
      rows: [
        ['DISPOSITIVO', 'CÂMERA'],
        ['USO', 'VÍDEO EM TEMPO REAL'],
        ['CONEXÃO', 'PONTO A PONTO']
      ],
      confirmLabel: 'AUTORIZAR CÂMERA'
    });
  }

  function screen() {
    return request({
      icon: 'screen',
      title: 'COMPARTILHAR TELA',
      description:
        'Escolha qual tela, janela ou aba deseja transmitir para a sala. O navegador vai abrir o seletor de compartilhamento em seguida.',
      rows: [
        ['ORIGEM', 'TELA / JANELA / ABA'],
        ['ÁUDIO', 'INCLUÍDO QUANDO SUPORTADO'],
        ['CONEXÃO', 'PONTO A PONTO']
      ],
      confirmLabel: 'ESCOLHER TELA'
    });
  }

  return { mic, camera, screen };
})();
