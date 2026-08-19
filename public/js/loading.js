const OBUNTO_LOADING = (() => {
  let el = null;
  let statusEl = null;
  let titleEl = null;
  let pctEl = null;
  let statusTimer = null;
  let pctTimer = null;
  let messages = [];
  let msgIndex = 0;

  function build() {
    if (el) return el;
    el = ce('div', 'loading-screen hidden');
    el.id = 'screen-loading';
    el.innerHTML =
      '<div class="loading-screen__grid"></div>' +
      '<div class="loading-screen__lines"></div>' +
      '<span class="loading-screen__corner loading-screen__corner--tl">00.SIG</span>' +
      '<span class="loading-screen__corner loading-screen__corner--tr">OB-7000</span>' +
      '<span class="loading-screen__corner loading-screen__corner--bl">CTRL</span>' +
      '<span class="loading-screen__corner loading-screen__corner--br" id="loading-pct">000%</span>' +
      '<div class="loading-screen__core">' +
      '<div class="loading-screen__ring">' +
      '<div class="loading-screen__ring-outer"></div>' +
      '<div class="loading-screen__ring-dash"></div>' +
      '<div class="loading-screen__ring-inner"></div>' +
      '<div class="loading-screen__ring-mark"><span>N</span><span>S</span><span>W</span><span>E</span></div>' +
      '<span class="loading-screen__glyph">OB</span>' +
      '</div>' +
      '<div class="loading-screen__title" id="loading-title">INICIALIZANDO</div>' +
      '<div class="loading-screen__status" id="loading-status">CONECTANDO</div>' +
      '<div class="loading-screen__bar"><div class="loading-screen__bar-fill"></div></div>' +
      '</div>';
    document.body.appendChild(el);
    statusEl = el.querySelector('#loading-status');
    titleEl = el.querySelector('#loading-title');
    pctEl = el.querySelector('#loading-pct');
    return el;
  }

  function cycleStatus() {
    if (!messages.length) return;
    statusEl.textContent = messages[msgIndex % messages.length];
    msgIndex += 1;
  }

  function show(title, msgs) {
    build();
    el.classList.remove('hidden', 'is-leaving');
    titleEl.textContent = title || 'INICIALIZANDO';
    messages = msgs && msgs.length ? msgs : ['SINCRONIZANDO'];
    msgIndex = 0;
    cycleStatus();
    clearInterval(statusTimer);
    statusTimer = setInterval(cycleStatus, 900);
    let pct = 0;
    pctEl.textContent = '000%';
    clearInterval(pctTimer);
    pctTimer = setInterval(() => {
      pct = Math.min(99, pct + Math.random() * 9);
      pctEl.textContent = String(Math.floor(pct)).padStart(3, '0') + '%';
    }, 220);
  }

  function hide() {
    if (!el) return;
    clearInterval(statusTimer);
    clearInterval(pctTimer);
    if (pctEl) pctEl.textContent = '100%';
    el.classList.add('is-leaving');
    setTimeout(() => {
      el.classList.add('hidden');
      el.classList.remove('is-leaving');
    }, 420);
  }

  return { show, hide };
})();
