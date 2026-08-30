// -----------------------------------------------------------------
// BATTLE RUSH LIVE - Game Engine (vanilla JS + Canvas, phone-first)
// -----------------------------------------------------------------
(function () {
  const CFG = window.GAME_CONFIG;
  const canvas = document.getElementById('arena');
  const ctx = canvas.getContext('2d');

  // Logical resolution (portrait, TikTok-friendly), scaled to fit screen.
  const W = 1080, H = 1920;
  canvas.width = W; canvas.height = H;

  function fitCanvas() {
    const scale = Math.min(window.innerWidth / W, window.innerHeight / H);
    canvas.style.width = (W * scale) + 'px';
    canvas.style.height = (H * scale) + 'px';
  }
  window.addEventListener('resize', fitCanvas);
  fitCanvas();

  // ---------------- State ----------------
  const state = {
    round: 1,
    running: false,
    countdown: 0,
    roundEndsAt: 0,
    energy: 0,
    combo: 0,
    lastKillAt: 0,
    shake: 0,
    flash: 0,
    boss: null,
    winner: null,
    teams: {
      red: { name: 'RED TEAM', color: CFG.COLORS.red, score: 0, kills: 0, health: CFG.TEAM_START_HEALTH, maxHealth: CFG.TEAM_START_HEALTH, units: [] },
      blue: { name: 'BLUE TEAM', color: CFG.COLORS.blue, score: 0, kills: 0, health: CFG.TEAM_START_HEALTH, maxHealth: CFG.TEAM_START_HEALTH, units: [] },
    },
    particles: [],
    floaters: [],
    toasts: [],
  };

  function spawnUnit(team) {
    const t = state.teams[team];
    const x = team === 'red' ? rand(80, W * 0.42) : rand(W * 0.58, W - 80);
    const y = rand(H * 0.35, H * 0.85);
    t.units.push({ x, y, vx: 0, vy: 0, r: 22, hp: 40, atkTimer: rand(0, 60) });
  }

  function initTeams() {
    state.teams.red.units = [];
    state.teams.blue.units = [];
    for (let i = 0; i < CFG.SOLDIERS_PER_TEAM_START; i++) { spawnUnit('red'); spawnUnit('blue'); }
  }

  function rand(a, b) { return a + Math.random() * (b - a); }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

  // ---------------- Effects ----------------
  function addFloater(text, x, y, color) {
    state.floaters.push({ text, x, y, life: 60, color });
  }
  function addParticles(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      state.particles.push({
        x, y, vx: rand(-6, 6), vy: rand(-8, -1), life: 40 + rand(0, 20), color,
      });
    }
  }
  function addToast(text) {
    state.toasts.unshift({ text, life: 180 });
    state.toasts = state.toasts.slice(0, 5);
  }
  function screenShake(amount) { state.shake = Math.max(state.shake, amount); }
  function flashScreen(amount) { state.flash = Math.max(state.flash, amount); }

  // ---------------- Combat simulation ----------------
  function damageTeam(team, amount, killer) {
    const t = state.teams[team];
    t.health = Math.max(0, t.health - amount);
    if (t.units.length) {
      const u = t.units[Math.floor(Math.random() * t.units.length)];
      u.hp -= amount * 0.5;
      addParticles(u.x, u.y, t.color, 8);
      addFloater('-' + Math.round(amount), u.x, u.y - 20, '#fff');
      if (u.hp <= 0) {
        t.units.splice(t.units.indexOf(u), 1);
        const other = team === 'red' ? 'blue' : 'red';
        state.teams[other].kills++;
        state.combo++;
        state.lastKillAt = performance.now();
        addToast((killer || 'A soldier') + ' eliminated a ' + team.toUpperCase() + ' unit! Combo x' + state.combo);
        spawnUnit(team); // keep the battle going forever
      }
    }
  }

  function stepUnits(dt) {
    for (const teamKey of ['red', 'blue']) {
      const mine = state.teams[teamKey];
      const enemyKey = teamKey === 'red' ? 'blue' : 'red';
      const enemy = state.teams[enemyKey];
      for (const u of mine.units) {
        // wander + drift toward center line
        const targetX = teamKey === 'red' ? W * 0.48 : W * 0.52;
        u.vx += ((targetX - u.x) * 0.0006) + rand(-0.3, 0.3);
        u.vy += rand(-0.3, 0.3);
        u.vx *= 0.92; u.vy *= 0.92;
        u.x += u.vx; u.y += u.vy;
        u.x = Math.max(40, Math.min(W - 40, u.x));
        u.y = Math.max(H * 0.28, Math.min(H - 60, u.y));

        u.atkTimer -= dt;
        if (u.atkTimer <= 0 && enemy.units.length) {
          u.atkTimer = rand(45, 90);
          damageTeam(enemyKey, rand(4, 10));
        }
      }
    }
    if (state.boss) {
      state.boss.hp -= 0; // boss only loses hp from control actions/gifts
      state.boss.t += dt;
      state.boss.y = H * 0.22 + Math.sin(state.boss.t / 20) * 20;
      if (state.boss.hp <= 0) {
        addToast('👹 BOSS DEFEATED!');
        flashScreen(1);
        state.boss = null;
      }
    }
  }

  // ---------------- Actions (from CONTROL panel or TikTok events) --------
  const Actions = {
    RED_ATTACK: () => { damageTeam('blue', rand(20, 40)); screenShake(6); },
    BLUE_ATTACK: () => { damageTeam('red', rand(20, 40)); screenShake(6); },
    MEGA_ATTACK: (p) => {
      const loser = Math.random() < 0.5 ? 'red' : 'blue';
      damageTeam(loser, rand(60, 100));
      screenShake(14); flashScreen(0.5);
      addToast('⚔️ MEGA ATTACK' + (p && p.from ? ' by ' + p.from : ''));
    },
    HEAL: () => {
      for (const k of ['red', 'blue']) {
        const t = state.teams[k];
        t.health = Math.min(t.maxHealth, t.health + 80);
      }
      addToast('❤️ HEAL wave!');
    },
    FIRE_STORM: () => {
      for (const k of ['red', 'blue']) damageTeam(k, rand(15, 25));
      screenShake(10);
      addToast('🔥 FIRE STORM!');
    },
    METEOR: () => {
      const loser = Math.random() < 0.5 ? 'red' : 'blue';
      damageTeam(loser, rand(80, 120));
      addParticles(W / 2, H * 0.4, CFG.COLORS.gold, 40);
      screenShake(20); flashScreen(0.8);
      addToast('☄️ METEOR STRIKE!');
    },
    SPAWN_BOSS: () => {
      state.boss = { x: W / 2, y: H * 0.22, hp: 500, maxHp: 500, t: 0 };
      addToast('⚠️ BOSS INCOMING');
      screenShake(10);
    },
    LIGHTNING: () => {
      const loser = Math.random() < 0.5 ? 'red' : 'blue';
      damageTeam(loser, rand(30, 50));
      screenShake(8); flashScreen(0.4);
      addToast('⚡ LIGHTNING!');
    },
    BONUS: () => {
      for (const k of ['red', 'blue']) state.teams[k].score += 10;
      addToast('💰 BONUS SCORE!');
    },
    SUPPORT_RED: () => { state.teams.red.score += 1; addFloater('+1 RED', rand(200, 400), H * 0.9, CFG.COLORS.red); },
    SUPPORT_BLUE: () => { state.teams.blue.score += 1; addFloater('+1 BLUE', rand(W - 400, W - 200), H * 0.9, CFG.COLORS.blue); },
    SHIELD: () => { addToast('🛡️ SHIELD activated'); },
    ADD_ENERGY: (p) => { state.energy = Math.min(100, state.energy + (p.amount || 1)); },
    SPAWN_SOLDIER: (p) => {
      const team = Math.random() < 0.5 ? 'red' : 'blue';
      spawnUnit(team);
      addToast('➕ ' + (p.from || 'A viewer') + ' followed! New soldier joined ' + team.toUpperCase());
    },
    VIEWER_JOINED: (p) => addToast('👋 ' + (p.from || 'Someone') + ' joined the LIVE'),
    COMMENT: (p) => addToast('💬 ' + (p.from || '') + ': ' + (p.text || '')),
    GIFT: (p) => {
      const tier = p.tier || 'SMALL';
      const dmgMap = { SMALL: 10, MEDIUM: 30, LARGE: 80, MEGA: 250 };
      const amount = dmgMap[tier] || 10;
      if (state.boss) {
        state.boss.hp -= amount;
        addFloater('-' + amount, state.boss.x, state.boss.y, CFG.COLORS.gold);
      } else {
        const loser = Math.random() < 0.5 ? 'red' : 'blue';
        damageTeam(loser, amount * 0.4);
      }
      if (tier === 'MEGA') { screenShake(24); flashScreen(1); }
      addToast('🎁 ' + (p.from || 'Someone') + ' sent ' + (p.giftName || 'a gift') + '!');
    },
    DEMO_MODE_ON: () => addToast('🎬 DEMO MODE ON'),
    DEMO_MODE_OFF: () => addToast('DEMO MODE OFF'),
    START_ROUND: () => startRound(),
    STOP_ROUND: () => { state.running = false; addToast('⏹ Round stopped'); },
    RESET: () => resetGame(),
  };

  function applyEvent(evt) {
    const fn = Actions[evt.action];
    if (fn) fn(evt.payload || {});
  }

  // ---------------- Round flow ----------------
  function resetGame() {
    state.round = 1;
    state.winner = null;
    state.teams.red.score = 0; state.teams.blue.score = 0;
    state.teams.red.kills = 0; state.teams.blue.kills = 0;
    state.teams.red.health = state.teams.red.maxHealth;
    state.teams.blue.health = state.teams.blue.maxHealth;
    state.boss = null; state.combo = 0; state.energy = 0;
    initTeams();
    addToast('🔄 Game reset');
  }

  function startRound() {
    state.running = false;
    state.countdown = 3;
    const countdownTick = () => {
      if (state.countdown <= 0) {
        state.running = true;
        state.roundEndsAt = performance.now() + CFG.ROUND_SECONDS * 1000;
        addToast('FIGHT! Round ' + state.round);
        return;
      }
      addToast(state.countdown === 3 ? '3' : state.countdown);
      state.countdown--;
      setTimeout(countdownTick, 900);
    };
    countdownTick();
  }

  function endRound() {
    state.running = false;
    const winner = state.teams.red.health >= state.teams.blue.health ? 'RED' : 'BLUE';
    state.winner = winner;
    addToast('🏆 WINNER: ' + winner + ' TEAM');
    setTimeout(() => {
      state.winner = null;
      if (state.round < CFG.ROUND_COUNT) {
        state.round++;
        state.teams.red.health = state.teams.red.maxHealth;
        state.teams.blue.health = state.teams.blue.maxHealth;
        startRound();
      } else {
        addToast('🎉 MATCH OVER — starting a new match');
        resetGame();
        startRound();
      }
    }, 3000);
  }

  // ---------------- Render ----------------
  function drawBar(x, y, w, h, pct, color, bg) {
    ctx.fillStyle = bg || 'rgba(255,255,255,0.15)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w * Math.max(0, Math.min(1, pct)), h);
  }

  function render() {
    ctx.save();
    if (state.shake > 0.2) {
      ctx.translate(rand(-state.shake, state.shake), rand(-state.shake, state.shake));
      state.shake *= 0.9;
    } else state.shake = 0;

    ctx.fillStyle = CFG.COLORS.bg;
    ctx.fillRect(-40, -40, W + 80, H + 80);

    // center divider
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(W / 2, H * 0.28); ctx.lineTo(W / 2, H - 60); ctx.stroke();

    // units
    for (const key of ['red', 'blue']) {
      const t = state.teams[key];
      for (const u of t.units) {
        ctx.beginPath();
        ctx.fillStyle = t.color;
        ctx.arc(u.x, u.y, u.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // boss
    if (state.boss) {
      const b = state.boss;
      ctx.fillStyle = '#8b2fd6';
      ctx.beginPath(); ctx.arc(b.x, b.y, 70, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 40px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('👹', b.x, b.y + 14);
      drawBar(W / 2 - 200, b.y - 110, 400, 18, b.hp / b.maxHp, '#e83bff');
    }

    // particles
    state.particles = state.particles.filter(p => p.life > 0);
    for (const p of state.particles) {
      ctx.globalAlpha = Math.max(0, p.life / 60);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, 6, 6);
      p.x += p.vx; p.y += p.vy; p.vy += 0.3; p.life--;
    }
    ctx.globalAlpha = 1;

    // floaters
    state.floaters = state.floaters.filter(f => f.life > 0);
    ctx.textAlign = 'center'; ctx.font = 'bold 28px sans-serif';
    for (const f of state.floaters) {
      ctx.globalAlpha = Math.max(0, f.life / 60);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
      f.y -= 1.2; f.life--;
    }
    ctx.globalAlpha = 1;

    // --- HUD ---
    ctx.textAlign = 'left';
    // Team panels
    ctx.font = 'bold 34px sans-serif';
    ctx.fillStyle = CFG.COLORS.red;
    ctx.fillText('🔴 RED  ' + state.teams.red.score, 30, 70);
    drawBar(30, 85, 420, 22, state.teams.red.health / state.teams.red.maxHealth, CFG.COLORS.red);
    ctx.font = '24px sans-serif'; ctx.fillStyle = '#fff';
    ctx.fillText('Kills: ' + state.teams.red.kills, 30, 135);

    ctx.textAlign = 'right';
    ctx.font = 'bold 34px sans-serif';
    ctx.fillStyle = CFG.COLORS.blue;
    ctx.fillText('BLUE 🔵  ' + state.teams.blue.score, W - 30, 70);
    drawBar(W - 450, 85, 420, 22, state.teams.blue.health / state.teams.blue.maxHealth, CFG.COLORS.blue);
    ctx.fillStyle = '#fff'; ctx.font = '24px sans-serif';
    ctx.fillText('Kills: ' + state.teams.blue.kills, W - 30, 135);

    // Energy + combo + round
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff'; ctx.font = 'bold 26px sans-serif';
    ctx.fillText('ROUND ' + state.round + ' / ' + CFG.ROUND_COUNT, W / 2, 60);
    drawBar(W / 2 - 150, 175, 300, 16, state.energy / 100, CFG.COLORS.gold);
    ctx.font = '20px sans-serif';
    ctx.fillText('ENERGY', W / 2, 210);

    if (performance.now() - state.lastKillAt < 2500 && state.combo > 1) {
      ctx.font = 'bold 44px sans-serif';
      ctx.fillStyle = CFG.COLORS.gold;
      ctx.fillText('COMBO x' + state.combo, W / 2, 260);
    } else if (performance.now() - state.lastKillAt > 4000) {
      state.combo = 0;
    }

    // toasts
    ctx.textAlign = 'left'; ctx.font = '24px sans-serif';
    let ty = H - 260;
    for (const toast of state.toasts) {
      ctx.globalAlpha = Math.max(0, toast.life / 180);
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(20, ty - 30, W - 40, 40);
      ctx.fillStyle = '#fff';
      ctx.fillText(String(toast.text), 34, ty - 3);
      ty += 46;
      toast.life--;
    }
    state.toasts = state.toasts.filter(t => t.life > 0);
    ctx.globalAlpha = 1;

    // countdown overlay
    if (state.countdown > 0) {
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 220px sans-serif';
      ctx.fillText(String(state.countdown), W / 2, H / 2);
    }

    // winner overlay
    if (state.winner) {
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = CFG.COLORS.gold; ctx.font = 'bold 90px sans-serif';
      ctx.fillText('🏆 WINNER', W / 2, H / 2 - 60);
      ctx.fillStyle = state.winner === 'RED' ? CFG.COLORS.red : CFG.COLORS.blue;
      ctx.font = 'bold 110px sans-serif';
      ctx.fillText(state.winner, W / 2, H / 2 + 60);
    }

    // flash
    if (state.flash > 0.01) {
      ctx.fillStyle = 'rgba(255,255,255,' + state.flash + ')';
      ctx.fillRect(0, 0, W, H);
      state.flash *= 0.85;
    }

    ctx.restore();
  }

  // ---------------- Main loop ----------------
  let last = performance.now();
  function loop(now) {
    const dt = (now - last) / 16.67; last = now;
    if (state.running) {
      stepUnits(dt);
      if (now > state.roundEndsAt || state.teams.red.health <= 0 || state.teams.blue.health <= 0) endRound();
    }
    render();
    requestAnimationFrame(loop);
  }

  // ---------------- WebSocket (receives events) ----------------
  function connectWS() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(proto + '://' + location.host + '/ws?role=game');
    ws.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data);
        if (data.type === 'EVENT') applyEvent(data);
      } catch (e) { /* ignore */ }
    };
    ws.onclose = () => setTimeout(connectWS, 1500); // auto-reconnect
  }

  // ---------------- Boot ----------------
  initTeams();
  addToast('BATTLE RUSH LIVE — waiting for START ROUND');
  connectWS();
  requestAnimationFrame(loop);

  // Expose for the demo-mode toast button on the game screen itself (optional)
  window.__BRL_startRound = startRound;
})();
