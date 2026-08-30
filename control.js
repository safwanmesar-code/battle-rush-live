(function () {
  const statusEl = document.getElementById('status');
  const tokenBox = document.getElementById('tokenBox');
  const panel = document.getElementById('panel');
  const tokenInput = document.getElementById('tokenInput');
  const connectBtn = document.getElementById('connectBtn');
  const demoSwitch = document.getElementById('demoSwitch');

  let ws = null;
  let demoOn = false;

  // Remember token locally on this phone only (never sent anywhere but our own server).
  const saved = localStorage.getItem('brl_token');
  if (saved) tokenInput.value = saved;

  function setStatus(text, cls) {
    statusEl.textContent = text;
    statusEl.className = cls;
  }

  function connect() {
    const token = tokenInput.value.trim();
    if (!token) return;
    localStorage.setItem('brl_token', token);

    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(proto + '://' + location.host + '/ws?role=control&token=' + encodeURIComponent(token));

    setStatus('Connecting…', '');

    ws.onmessage = (msg) => {
      const data = JSON.parse(msg.data);
      if (data.type === 'AUTH_OK') {
        setStatus('🟢 Connected — Live control active', 'ok');
        tokenBox.style.display = 'none';
        panel.style.display = 'block';
      } else if (data.type === 'AUTH_FAILED') {
        setStatus('🔴 Wrong CONTROL_TOKEN', 'bad');
      }
    };
    ws.onclose = () => {
      setStatus('🔴 Disconnected — reconnecting…', 'bad');
      setTimeout(connect, 1500);
    };
    ws.onerror = () => {};
  }

  connectBtn.addEventListener('click', connect);

  function sendAction(action, payload) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'action', action, payload: payload || {} }));
    if (navigator.vibrate) navigator.vibrate(20);
  }

  document.querySelectorAll('[data-action]').forEach((btn) => {
    btn.addEventListener('click', () => sendAction(btn.getAttribute('data-action')));
  });

  demoSwitch.addEventListener('click', () => {
    demoOn = !demoOn;
    demoSwitch.classList.toggle('on', demoOn);
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'DEMO_MODE', enabled: demoOn }));
  });

  // Auto-connect if a token was already saved on this phone.
  if (saved) connect();
})();
