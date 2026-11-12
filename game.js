(() => {
'use strict';

// ---------- Constantes ----------
const MW = 48, MH = 36;          // taille de la carte en tuiles
const DAY = 80, NIGHT = 70;      // durées en secondes
const WIN_NIGHT = 10;
const R = 0.3;                   // rayon de collision (tuiles)
const REACH = 4.5;               // portée de construction
const SAVE_KEY = 'tapi-save-v1', BEST_KEY = 'tapi-best';

const BUILD = {
  wall:  { n: 'Mur bois',   ic: '🪵', c: { wood: 2 }, hp: 60 },
  stone: { n: 'Mur pierre', ic: '🧱', c: { stone: 3 }, hp: 160 },
  door:  { n: 'Porte',      ic: '🚪', c: { wood: 4 }, hp: 70 },
  trap:  { n: 'Piège',      ic: '⚠️', c: { wood: 3, stone: 1 }, hp: 3 },
  hide:  { n: 'Cachette',   ic: '🌿', c: { wood: 6 }, hp: 1 },
  fire:  { n: 'Leurre',     ic: '🔥', c: { wood: 4, stone: 2 }, hp: 50 },
};
const RES_ICON = { wood: '🪵', stone: '🪨' };
const ZTYPES = {
  normal: { hp: 40,  ws: 1.4, cs: 2.5, dmg: 10, sd: 8,  size: 0.34, col: '#6f8f6a' },
  fast:   { hp: 25,  ws: 2.0, cs: 3.3, dmg: 8,  sd: 5,  size: 0.28, col: '#9a9a6a' },
  brute:  { hp: 120, ws: 1.0, cs: 1.9, dmg: 18, sd: 20, size: 0.44, col: '#5a6a7a' },
};

const solidP = t => t === 'tree' || t === 'rock' || t === 'wall' || t === 'stone' || t === 'fire';
const solidZ = t => solidP(t) || t === 'door';
const isStruct = t => t === 'wall' || t === 'stone' || t === 'door' || t === 'fire';

// ---------- DOM ----------
const $ = id => document.getElementById(id);
const cv = $('game'), ctx = cv.getContext('2d');
const dark = document.createElement('canvas'), dctx = dark.getContext('2d');
let VW = 0, VH = 0, TS = 40, DPR = 1;

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  VW = window.innerWidth; VH = window.innerHeight;
  cv.width = dark.width = Math.round(VW * DPR);
  cv.height = dark.height = Math.round(VH * DPR);
  TS = Math.max(30, Math.min(56, Math.min(VW, VH) / 10));
}
window.addEventListener('resize', resize);
resize();

// ---------- État ----------
let S = null;          // état de la partie
let running = false;
const input = { jx: 0, jy: 0, keys: {}, act: false, sneakHold: false, mouse: null };
let sel = null;        // objet de construction sélectionné

const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const tileAt = (x, y) => (x < 0 || y < 0 || x >= MW || y >= MH) ? undefined : S.tiles[y * MW + x];
const setTile = (x, y, v) => { S.tiles[y * MW + x] = v; };

function newGame() {
  S = {
    tiles: new Array(MW * MH).fill(null),
    p: { x: MW / 2 + 0.5, y: MH / 2 + 0.5, hp: 100, food: 100, hidden: false, face: 1 },
    inv: { wood: 6, stone: 0, berries: 2 },
    day: 1, phase: 'day', t: 0, won: false, kills: 0,
    zombies: [], floats: [], noise: 0, pulse: 0, pulseT: 0,
    toSpawn: 0, spawnT: 0, spawnEvery: 1, actCd: 0, flash: 0, sneak: false, warned: false,
  };
  const cx = MW / 2, cy = MH / 2;
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    if (Math.hypot(x - cx, y - cy) < 4) continue;
    const r = Math.random();
    if (r < 0.13) setTile(x, y, { t: 'tree', hp: 5 });
    else if (r < 0.17) setTile(x, y, { t: 'rock', hp: 6 });
    else if (r < 0.188) setTile(x, y, { t: 'bush', b: 2 });
  }
  save();
}

function save() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      tiles: S.tiles, p: S.p, inv: S.inv, day: S.day, won: S.won, kills: S.kills,
    }));
  } catch (e) { /* stockage indisponible */ }
}
function load() {
  try {
    const d = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (!d || !d.tiles || d.tiles.length !== MW * MH) return false;
    newGameShell();
    Object.assign(S, { tiles: d.tiles, inv: d.inv, day: d.day, won: d.won, kills: d.kills || 0 });
    Object.assign(S.p, d.p, { hidden: false });
    return true;
  } catch (e) { return false; }
}
function newGameShell() { newGame(); }
const hasSave = () => { try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; } };
const getBest = () => { try { return +localStorage.getItem(BEST_KEY) || 0; } catch (e) { return 0; } };

// ---------- Messages ----------
let toastTimer = 0;
function toast(msg, ms = 2600) {
  const el = $('toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}
function floatText(x, y, txt, col = '#fff') { S.floats.push({ x, y, txt, col, t: 0 }); }

// ---------- Collisions ----------
function blocked(x, y, fn) {
  for (let i = 0; i < 4; i++) {
    const cx = Math.floor(x + (i & 1 ? R : -R)), cy = Math.floor(y + (i & 2 ? R : -R));
    const t = tileAt(cx, cy);
    if (t === undefined || (t && fn(t.t))) return true;
  }
  return false;
}
function move(e, dx, dy, fn) {
  if (!blocked(e.x + dx, e.y, fn)) e.x += dx;
  if (!blocked(e.x, e.y + dy, fn)) e.y += dy;
}
function lineClear(x0, y0, x1, y1) {
  const d = Math.hypot(x1 - x0, y1 - y0), n = Math.ceil(d * 4);
  for (let i = 1; i < n; i++) {
    const t = tileAt(Math.floor(x0 + (x1 - x0) * i / n), Math.floor(y0 + (y1 - y0) * i / n));
    if (t && solidZ(t.t)) return false;
  }
  return true;
}

// ---------- Cycle jour / nuit ----------
function startNight() {
  S.phase = 'night'; S.t = 0;
  S.toSpawn = Math.min(45, 3 + S.day * 2);
  S.spawnEvery = NIGHT * 0.6 / S.toSpawn; S.spawnT = 1.5;
  toast(`🌙 Nuit ${S.day} — ${S.toSpawn} Rôdeurs approchent. Pas un bruit…`, 4000);
}
function startDay() {
  const survived = S.day;
  S.zombies.length = 0;
  S.phase = 'day'; S.t = 0; S.day++; S.warned = false;
  for (const t of S.tiles) if (t && t.t === 'bush') t.b = 2;
  growNew('tree', 4, { t: 'tree', hp: 5 });
  growNew('rock', 2, { t: 'rock', hp: 6 });
  try { if (survived > getBest()) localStorage.setItem(BEST_KEY, survived); } catch (e) { /* ignore */ }
  save();
  if (survived === WIN_NIGHT && !S.won) {
    S.won = true; save();
    showOver('🚁 Sauvé !',
      `Le bruit des pales couvre enfin le silence. Tu as tenu ${WIN_NIGHT} nuits.<br><br>` +
      `Mais l'hélicoptère est plein… « On revient. Tenez encore. »`, 'Continuer en mode sans fin', false);
  } else {
    toast(`☀️ Jour ${S.day} — les Rôdeurs tombent en cendres. Reconstruis !`, 3500);
  }
}
function growNew(type, n, proto) {
  for (let i = 0, tries = 0; i < n && tries < 200; tries++) {
    const x = Math.floor(rnd(0, MW)), y = Math.floor(rnd(0, MH));
    if (tileAt(x, y) || Math.hypot(x + 0.5 - S.p.x, y + 0.5 - S.p.y) < 5) continue;
    setTile(x, y, Object.assign({}, proto)); i++;
  }
}

function spawnZombie() {
  for (let tries = 0; tries < 30; tries++) {
    const side = Math.floor(rnd(0, 4));
    const x = side === 0 ? 0.5 : side === 1 ? MW - 0.5 : rnd(0.5, MW - 0.5);
    const y = side === 2 ? 0.5 : side === 3 ? MH - 0.5 : rnd(0.5, MH - 0.5);
    if (blocked(x, y, solidZ)) continue;
    let type = 'normal';
    const r = Math.random();
    if (S.day >= 5 && r < 0.12) type = 'brute';
    else if (S.day >= 3 && r < 0.34) type = 'fast';
    const z = { x, y, type, hp: ZTYPES[type].hp, st: 'wander', tx: x, ty: y, wt: 0, mem: 0, cd: 0, det: 0, ddx: 0, ddy: 0, rage: 0, trapCd: 0, stuck: 0, ph: rnd(0, 6) };
    wander(z);
    S.zombies.push(z);
    return;
  }
}
function wander(z) {
  z.st = 'wander'; z.wt = rnd(4, 8); z.fire = null;
  z.tx = clamp(S.p.x + rnd(-9, 9), 1, MW - 1);
  z.ty = clamp(S.p.y + rnd(-9, 9), 1, MH - 1);
}

// ---------- Rôdeurs ----------
function updateZombie(z, dt) {
  const p = S.p, T = ZTYPES[z.type];
  const d = Math.hypot(p.x - z.x, p.y - z.y);
  const detect = !p.hidden && (d < S.noise || (d < 2.2 && lineClear(z.x, z.y, p.x, p.y)));
  z.cd -= dt; z.rage -= dt; z.trapCd -= dt;

  if (detect) { z.st = 'chase'; z.tx = p.x; z.ty = p.y; z.mem = 4; }
  else if (z.st === 'chase') {
    z.mem -= dt;
    if ((z.mem <= 0 && Math.hypot(z.tx - z.x, z.ty - z.y) < 0.6) || z.mem < -6) wander(z);
  }
  if (z.st === 'wander') {
    z.wt -= dt;
    // attirés par la lumière d'un leurre
    let best = 7, f = null;
    for (const fr of S.fires) {
      const fd = Math.hypot(fr.x + 0.5 - z.x, fr.y + 0.5 - z.y);
      if (fd < best) { best = fd; f = fr; }
    }
    if (f) { z.st = 'lure'; z.fire = f; z.tx = f.x + 0.5; z.ty = f.y + 0.5; }
    else if (z.wt <= 0 || Math.hypot(z.tx - z.x, z.ty - z.y) < 0.5) wander(z);
  } else if (z.st === 'lure') {
    const t = tileAt(z.fire.x, z.fire.y);
    if (!t || t.t !== 'fire') wander(z);
  }

  // attaque du joueur
  if (d < 0.78 && (!p.hidden || z.st === 'chase')) {
    if (z.cd <= 0) {
      z.cd = 0.9; p.hp -= T.dmg; S.flash = 0.5;
      floatText(p.x, p.y - 0.5, '-' + T.dmg, '#ff6b6b');
      if (navigator.vibrate) navigator.vibrate(60);
    }
    return;
  }

  // déplacement
  let dx = z.tx - z.x, dy = z.ty - z.y;
  const L = Math.hypot(dx, dy);
  if (L < 0.15) return;
  dx /= L; dy /= L;
  let mx = dx, my = dy;
  if (z.det > 0) { z.det -= dt; mx = z.ddx; my = z.ddy; }
  const sp = (z.st === 'wander' ? T.ws : T.cs) * dt;
  const ox = z.x, oy = z.y;
  move(z, mx * sp, my * sp, solidZ);
  z.ph += dt * 8;

  if (Math.hypot(z.x - ox, z.y - oy) < sp * 0.35) {
    // bloqué : chercher ce qui barre la route
    const cands = Math.abs(dx) > Math.abs(dy)
      ? [[Math.sign(dx), 0], [0, Math.sign(dy)]] : [[0, Math.sign(dy)], [Math.sign(dx), 0]];
    let hit = null, hx = 0, hy = 0;
    for (const [sx, sy] of cands) {
      if (!sx && !sy) continue;
      const bx = Math.floor(z.x + sx * 0.7), by = Math.floor(z.y + sy * 0.7);
      const t = tileAt(bx, by);
      if (t && isStruct(t.t)) { hit = t; hx = bx; hy = by; break; }
    }
    if (hit) {
      if (z.st === 'wander' && z.type !== 'brute' && z.rage <= 0) {
        if (z.stuck <= 0) {
          z.stuck = 1;
          if (Math.random() < 0.3) z.rage = 4; else wander(z);
        }
      } else if (z.cd <= 0) {
        z.cd = 0.8; hit.hp -= T.sd; hit.shake = 0.2;
        if (hit.hp <= 0) { setTile(hx, hy, null); floatText(hx + 0.5, hy + 0.3, '💥'); }
      }
    } else if (z.det <= 0) {
      const s = Math.random() < 0.5 ? 1 : -1;
      z.ddx = -dy * s; z.ddy = dx * s; z.det = rnd(0.4, 0.9);
    }
  }
  z.stuck -= dt;

  // pièges
  const tx = Math.floor(z.x), ty = Math.floor(z.y), t = tileAt(tx, ty);
  if (t && t.t === 'trap' && z.trapCd <= 0) {
    z.trapCd = 1; z.hp -= 40; t.hp--;
    floatText(z.x, z.y - 0.4, '-40', '#ffd35a');
    if (t.hp <= 0) setTile(tx, ty, null);
  }
}

// ---------- Joueur ----------
function updatePlayer(dt) {
  const p = S.p, k = input.keys;
  let ix = input.jx, iy = input.jy;
  let kx = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
  let ky = (k.KeyS || k.ArrowDown ? 1 : 0) - (k.KeyW || k.ArrowUp ? 1 : 0);
  if (kx || ky) { const l = Math.hypot(kx, ky); ix = kx / l; iy = ky / l; }
  const mag = Math.min(1, Math.hypot(ix, iy));
  const moving = mag > 0.12;
  const sneaking = S.sneak || input.sneakHold || (moving && mag < 0.55);
  if (moving) {
    const sp = (sneaking ? 1.6 : 3.6) * dt;
    move(p, ix / mag * sp, iy / mag * sp, solidP);
    if (Math.abs(ix) > 0.1) p.face = Math.sign(ix);
  }
  p.moving = moving; p.sneaking = sneaking;
  const here = tileAt(Math.floor(p.x), Math.floor(p.y));
  p.hidden = !!(here && here.t === 'hide');

  // récolte
  S.actCd -= dt;
  if (input.act && S.actCd <= 0) harvest();

  // bruit
  S.pulseT -= dt;
  if (S.pulseT <= 0) S.pulse = 0;
  const base = p.hidden ? 0 : moving ? (sneaking ? 1.6 : 5) : 0;
  S.noise = Math.max(base, S.pulse);

  // faim et santé
  p.food = Math.max(0, p.food - dt * 100 / 170);
  if (p.food <= 0) p.hp -= dt * 2;
  else if (S.phase === 'day' && p.food > 30) p.hp = Math.min(100, p.hp + dt * 1.5);
  S.flash = Math.max(0, S.flash - dt);
}

function makeNoise(r, t = 0.6) { if (r >= S.pulse) { S.pulse = r; S.pulseT = t; } }

function harvest() {
  const p = S.p;
  let best = 1.5, bx = -1, by = -1;
  const px = Math.floor(p.x), py = Math.floor(p.y);
  for (let y = py - 2; y <= py + 2; y++) for (let x = px - 2; x <= px + 2; x++) {
    const t = tileAt(x, y);
    if (!t || !(t.t === 'tree' || t.t === 'rock' || (t.t === 'bush' && t.b > 0))) continue;
    const d = Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y);
    if (d < best) { best = d; bx = x; by = y; }
  }
  if (bx < 0) return;
  const t = tileAt(bx, by);
  S.actCd = 0.38; t.shake = 0.15;
  if (t.t === 'bush') {
    S.inv.berries += t.b; floatText(bx + 0.5, by, '+' + t.b + ' 🍒'); t.b = 0; makeNoise(3);
  } else {
    const res = t.t === 'tree' ? 'wood' : 'stone';
    S.inv[res]++; t.hp--;
    floatText(bx + 0.5, by, '+1 ' + RES_ICON[res]);
    makeNoise(7);
    if (t.hp <= 0) setTile(bx, by, null);
  }
}

function eat() {
  if (!running) return;
  if (S.inv.berries <= 0) return toast('Plus de baies… cueille les buissons rouges.');
  if (S.p.food > 95) return toast("Tu n'as pas faim.");
  S.inv.berries--; S.p.food = Math.min(100, S.p.food + 22); S.p.hp = Math.min(100, S.p.hp + 3);
  floatText(S.p.x, S.p.y - 0.6, '🍒 miam');
}

// ---------- Construction ----------
function canAfford(c) { return Object.keys(c).every(k => S.inv[k] >= c[k]); }

function tryBuild(tx, ty) {
  if (!sel || !running) return;
  const p = S.p, t = tileAt(tx, ty);
  if (t === undefined) return;
  if (Math.hypot(tx + 0.5 - p.x, ty + 0.5 - p.y) > REACH) return toast('Trop loin — approche-toi.');
  if (sel === 'demolish') {
    if (!t || !BUILD[t.t]) return toast('Rien à démolir ici.');
    const c = BUILD[t.t].c;
    for (const k in c) S.inv[k] += Math.floor(c[k] / 2);
    setTile(tx, ty, null); makeNoise(5);
    return;
  }
  const def = BUILD[sel];
  if (t) return toast('Emplacement occupé.');
  if (!canAfford(def.c)) return toast('Pas assez de ressources.');
  if (solidP(sel) && Math.abs(tx + 0.5 - p.x) < 0.5 + R && Math.abs(ty + 0.5 - p.y) < 0.5 + R)
    return toast('Tu es dessus !');
  for (const k in def.c) S.inv[k] -= def.c[k];
  setTile(tx, ty, { t: sel, hp: def.hp, max: def.hp });
  makeNoise(6);
  if (S.phase === 'night') floatText(tx + 0.5, ty, '🔊', '#7fd1ff');
}

function screenToTile(sx, sy) {
  const cam = camera();
  return [Math.floor((sx - VW / 2) / TS + cam.x), Math.floor((sy - VH / 2) / TS + cam.y)];
}

// ---------- Boucle ----------
function update(dt) {
  S.t += dt;
  S.fires = [];
  if (S.phase === 'night') {
    const p = S.p, x0 = Math.floor(p.x) - 22, y0 = Math.floor(p.y) - 22;
    for (let y = Math.max(0, y0); y < Math.min(MH, y0 + 44); y++)
      for (let x = Math.max(0, x0); x < Math.min(MW, x0 + 44); x++) {
        const t = S.tiles[y * MW + x];
        if (t && t.t === 'fire') S.fires.push({ x, y });
      }
  }
  updatePlayer(dt);

  if (S.phase === 'day') {
    if (!S.warned && S.t > DAY - 15) { S.warned = true; toast('🌇 Le soleil décline… rentre à l\'abri.', 3500); }
    if (S.t >= DAY) startNight();
  } else {
    if (S.toSpawn > 0) {
      S.spawnT -= dt;
      if (S.spawnT <= 0) { S.spawnT = S.spawnEvery; S.toSpawn--; spawnZombie(); }
    }
    for (const z of S.zombies) updateZombie(z, dt);
    // séparation simple entre Rôdeurs
    for (let i = 0; i < S.zombies.length; i++) for (let j = i + 1; j < S.zombies.length; j++) {
      const a = S.zombies[i], b = S.zombies[j];
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
      if (d > 0.01 && d < 0.55) {
        const push = (0.55 - d) * 0.5;
        move(a, -dx / d * push, -dy / d * push, solidZ);
        move(b, dx / d * push, dy / d * push, solidZ);
      }
    }
    for (let i = S.zombies.length - 1; i >= 0; i--) if (S.zombies[i].hp <= 0) {
      floatText(S.zombies[i].x, S.zombies[i].y, '☠️'); S.zombies.splice(i, 1); S.kills++;
    }
    if (S.t >= NIGHT) startDay();
  }

  for (let i = S.floats.length - 1; i >= 0; i--) {
    const f = S.floats[i]; f.t += dt; f.y -= dt * 0.8;
    if (f.t > 1) S.floats.splice(i, 1);
  }
  if (S.p.hp <= 0) gameOver();
}

function gameOver() {
  running = false;
  const nights = S.day - 1;
  try {
    localStorage.removeItem(SAVE_KEY);
    if (nights > getBest()) localStorage.setItem(BEST_KEY, nights);
  } catch (e) { /* ignore */ }
  showOver('Ils t\'ont entendu…',
    `Tu as survécu <b>${nights}</b> nuit${nights > 1 ? 's' : ''} et piégé <b>${S.kills}</b> Rôdeur${S.kills > 1 ? 's' : ''}.<br>Record : ${Math.max(nights, getBest())} nuit(s).`,
    'Recommencer', true);
}

let overRestart = false;
function showOver(title, html, btn, restart) {
  running = false; overRestart = restart;
  $('overTitle').textContent = title; $('overText').innerHTML = html; $('overBtn').textContent = btn;
  $('over').classList.remove('hidden');
}

// ---------- Rendu ----------
function camera() {
  const hw = VW / 2 / TS, hh = VH / 2 / TS;
  return {
    x: MW > hw * 2 ? clamp(S.p.x, hw, MW - hw) : MW / 2,
    y: MH > hh * 2 ? clamp(S.p.y, hh, MH - hh) : MH / 2,
  };
}
function darkness() {
  const t = S.t;
  if (S.phase === 'day') return Math.max(clamp((t - (DAY - 10)) / 10, 0, 1) * 0.6, 0.35 * (1 - t / 4));
  let a = 0.6 + Math.min(t / 5, 1) * 0.3;
  if (t > NIGHT - 5) a -= (t - (NIGHT - 5)) / 5 * 0.55;
  return a;
}

function drawTile(t, x, y, now) {
  const s = TS, sh = t.shake > 0 ? Math.sin(now * 60) * 2 : 0;
  const px = x + sh, py = y;
  switch (t.t) {
    case 'tree':
      ctx.fillStyle = '#5b3d22'; ctx.fillRect(px + s * 0.42, py + s * 0.5, s * 0.16, s * 0.45);
      ctx.fillStyle = '#1f5a32'; circle(px + s * 0.5, py + s * 0.42, s * 0.42);
      ctx.fillStyle = '#2c7a44'; circle(px + s * 0.42, py + s * 0.34, s * 0.26);
      break;
    case 'rock':
      ctx.fillStyle = '#7c8490';
      ctx.beginPath(); ctx.moveTo(px + s * 0.12, py + s * 0.85); ctx.lineTo(px + s * 0.22, py + s * 0.35);
      ctx.lineTo(px + s * 0.55, py + s * 0.15); ctx.lineTo(px + s * 0.88, py + s * 0.5); ctx.lineTo(px + s * 0.85, py + s * 0.85);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#a3abb6';
      ctx.beginPath(); ctx.moveTo(px + s * 0.25, py + s * 0.4); ctx.lineTo(px + s * 0.55, py + s * 0.18); ctx.lineTo(px + s * 0.6, py + s * 0.5); ctx.closePath(); ctx.fill();
      break;
    case 'bush':
      ctx.fillStyle = '#2f6b3a'; circle(px + s * 0.35, py + s * 0.6, s * 0.28); circle(px + s * 0.65, py + s * 0.6, s * 0.28); circle(px + s * 0.5, py + s * 0.42, s * 0.28);
      if (t.b > 0) { ctx.fillStyle = '#e0364f'; circle(px + s * 0.35, py + s * 0.55, s * 0.07); circle(px + s * 0.6, py + s * 0.42, s * 0.07); circle(px + s * 0.68, py + s * 0.68, s * 0.07); }
      break;
    case 'wall':
      ctx.fillStyle = '#8a5a2e'; ctx.fillRect(px + 1, py + 1, s - 2, s - 2);
      ctx.fillStyle = '#6e4521';
      for (let i = 1; i < 4; i++) ctx.fillRect(px + s * i / 4 - 1, py + 1, 2, s - 2);
      break;
    case 'stone':
      ctx.fillStyle = '#868d98'; ctx.fillRect(px + 1, py + 1, s - 2, s - 2);
      ctx.fillStyle = '#5f6670';
      ctx.fillRect(px + 1, py + s * 0.33, s - 2, 2); ctx.fillRect(px + 1, py + s * 0.66, s - 2, 2);
      ctx.fillRect(px + s * 0.5, py + 1, 2, s * 0.33); ctx.fillRect(px + s * 0.25, py + s * 0.33, 2, s * 0.33); ctx.fillRect(px + s * 0.75, py + s * 0.33, 2, s * 0.33); ctx.fillRect(px + s * 0.5, py + s * 0.66, 2, s * 0.33);
      break;
    case 'door':
      ctx.fillStyle = '#6e4521'; ctx.fillRect(px + 1, py + 1, s - 2, s - 2);
      ctx.fillStyle = '#b07a3c'; ctx.fillRect(px + s * 0.15, py + s * 0.12, s * 0.7, s * 0.76);
      ctx.fillStyle = '#ffd35a'; circle(px + s * 0.72, py + s * 0.5, s * 0.06);
      break;
    case 'trap':
      ctx.fillStyle = '#4a3a22'; ctx.fillRect(px + s * 0.1, py + s * 0.1, s * 0.8, s * 0.8);
      ctx.fillStyle = '#d8d8d8';
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
        if (i * 3 + j >= t.hp * 3) continue;
        const cx = px + s * (0.27 + j * 0.23), cy = py + s * (0.27 + i * 0.23);
        ctx.beginPath(); ctx.moveTo(cx, cy - s * 0.09); ctx.lineTo(cx + s * 0.06, cy + s * 0.06); ctx.lineTo(cx - s * 0.06, cy + s * 0.06); ctx.fill();
      }
      break;
    case 'hide':
      ctx.fillStyle = '#3b2a18'; ctx.fillRect(px + s * 0.08, py + s * 0.08, s * 0.84, s * 0.84);
      ctx.fillStyle = '#2a5d34'; circle(px + s * 0.3, py + s * 0.35, s * 0.24); circle(px + s * 0.68, py + s * 0.32, s * 0.24);
      ctx.fillStyle = '#35733f'; circle(px + s * 0.5, py + s * 0.62, s * 0.3);
      break;
    case 'fire': {
      ctx.fillStyle = '#6b6b6b'; circle(px + s * 0.5, py + s * 0.62, s * 0.36);
      ctx.fillStyle = '#3a2a1a'; circle(px + s * 0.5, py + s * 0.62, s * 0.26);
      if (S.phase === 'night') {
        const fl = Math.sin(now * 12 + x) * s * 0.04;
        ctx.fillStyle = '#ff8a1e'; flame(px + s * 0.5, py + s * 0.68, s * 0.24, s * 0.55 + fl);
        ctx.fillStyle = '#ffe07a'; flame(px + s * 0.5, py + s * 0.68, s * 0.12, s * 0.3 + fl);
      }
      break;
    }
  }
  if (t.max > 3 && t.hp < t.max) {
    ctx.fillStyle = '#000a'; ctx.fillRect(x + 3, y + 2, s - 6, 4);
    ctx.fillStyle = '#ffb347'; ctx.fillRect(x + 3, y + 2, (s - 6) * Math.max(0, t.hp / t.max), 4);
  }
}
function circle(x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill(); }
function flame(x, y, w, h) {
  ctx.beginPath(); ctx.moveTo(x - w, y); ctx.quadraticCurveTo(x - w, y - h * 0.5, x, y - h);
  ctx.quadraticCurveTo(x + w, y - h * 0.5, x + w, y); ctx.closePath(); ctx.fill();
}

function render(now, dt) {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const cam = camera(), p = S.p;
  const ox = VW / 2 - cam.x * TS, oy = VH / 2 - cam.y * TS;
  const x0 = Math.max(0, Math.floor(cam.x - VW / 2 / TS)), x1 = Math.min(MW - 1, Math.floor(cam.x + VW / 2 / TS));
  const y0 = Math.max(0, Math.floor(cam.y - VH / 2 / TS)), y1 = Math.min(MH - 1, Math.floor(cam.y + VH / 2 / TS));

  ctx.fillStyle = '#16301c'; ctx.fillRect(0, 0, VW, VH);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const h = ((x * 73856093) ^ (y * 19349663)) >>> 0;
    ctx.fillStyle = ['#3f7a45', '#437f49', '#3b7541', '#417c47'][h % 4];
    ctx.fillRect(Math.floor(ox + x * TS), Math.floor(oy + y * TS), Math.ceil(TS), Math.ceil(TS));
  }

  // aperçu de construction
  if (sel && input.mouse) {
    const [tx, ty] = screenToTile(input.mouse.x, input.mouse.y);
    const ok = Math.hypot(tx + 0.5 - p.x, ty + 0.5 - p.y) <= REACH;
    ctx.fillStyle = ok ? '#ffffff44' : '#ff000044';
    ctx.fillRect(ox + tx * TS, oy + ty * TS, TS, TS);
  }
  if (sel) {
    ctx.strokeStyle = '#ffffff30'; ctx.lineWidth = 1; ctx.setLineDash([6, 6]);
    ctx.beginPath(); ctx.arc(ox + p.x * TS, oy + p.y * TS, REACH * TS, 0, 6.2832); ctx.stroke(); ctx.setLineDash([]);
  }

  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const t = S.tiles[y * MW + x];
    if (!t) continue;
    if (t.shake > 0) t.shake -= dt;
    drawTile(t, ox + x * TS, oy + y * TS, now);
  }

  // anneau de bruit
  if (S.noise > 0.1) {
    ctx.strokeStyle = S.phase === 'night' ? '#7fd1ff66' : '#7fd1ff2a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(ox + p.x * TS, oy + p.y * TS, S.noise * TS, 0, 6.2832); ctx.stroke();
  }

  // Rôdeurs
  for (const z of S.zombies) {
    const T = ZTYPES[z.type], zx = ox + z.x * TS, zy = oy + z.y * TS, r = T.size * TS;
    const bob = Math.sin(z.ph) * r * 0.08;
    ctx.fillStyle = '#0004'; ctx.beginPath(); ctx.ellipse(zx, zy + r * 0.8, r * 0.8, r * 0.3, 0, 0, 6.2832); ctx.fill();
    ctx.fillStyle = T.col; circle(zx, zy + bob, r);
    ctx.fillStyle = '#0003'; circle(zx, zy + bob + r * 0.35, r * 0.55);
    if (z.hp < T.hp) {
      ctx.fillStyle = '#000a'; ctx.fillRect(zx - r, zy - r - 7, r * 2, 3);
      ctx.fillStyle = '#e5484d'; ctx.fillRect(zx - r, zy - r - 7, r * 2 * z.hp / T.hp, 3);
    }
  }

  // joueur
  const px = ox + p.x * TS, py = oy + p.y * TS, pr = TS * 0.3;
  if (p.hidden) {
    ctx.fillStyle = '#fff'; circle(px - pr * 0.4, py, pr * 0.16); circle(px + pr * 0.4, py, pr * 0.16);
  } else {
    const squat = p.sneaking && p.moving ? 0.85 : 1;
    ctx.fillStyle = '#0004'; ctx.beginPath(); ctx.ellipse(px, py + pr * 0.85, pr * 0.8, pr * 0.3, 0, 0, 6.2832); ctx.fill();
    ctx.fillStyle = '#2f5fb3'; circle(px, py + pr * 0.15, pr * squat);
    ctx.fillStyle = '#f0c8a0'; circle(px, py - pr * 0.45 * squat, pr * 0.62);
    ctx.fillStyle = '#222'; circle(px + p.face * pr * 0.25, py - pr * 0.5 * squat, pr * 0.1);
    ctx.fillStyle = '#7a3b1e'; ctx.beginPath(); ctx.arc(px, py - pr * 0.6 * squat, pr * 0.62, Math.PI, 0); ctx.fill();
  }

  // obscurité
  const a = darkness();
  if (a > 0.01) {
    dctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    dctx.globalCompositeOperation = 'source-over';
    dctx.clearRect(0, 0, VW, VH);
    dctx.fillStyle = `rgba(4,7,22,${a})`; dctx.fillRect(0, 0, VW, VH);
    dctx.globalCompositeOperation = 'destination-out';
    const hole = (x, y, r, k) => {
      const g = dctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(0,0,0,${k})`); g.addColorStop(1, 'rgba(0,0,0,0)');
      dctx.fillStyle = g; dctx.beginPath(); dctx.arc(x, y, r, 0, 6.2832); dctx.fill();
    };
    hole(px, py, (p.hidden ? 1.8 : 3.6) * TS, 0.9);
    if (S.phase === 'night') for (const f of S.fires)
      hole(ox + (f.x + 0.5) * TS, oy + (f.y + 0.5) * TS, (3.6 + Math.sin(now * 9 + f.x) * 0.15) * TS, 0.95);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(dark, 0, 0);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }

  // yeux dans le noir
  for (const z of S.zombies) {
    const r = ZTYPES[z.type].size * TS, zx = ox + z.x * TS, zy = oy + z.y * TS;
    ctx.fillStyle = z.st === 'chase' ? '#ff2a2a' : z.st === 'lure' ? '#ffb02a' : '#d8e36a';
    circle(zx - r * 0.35, zy - r * 0.2, r * 0.14); circle(zx + r * 0.35, zy - r * 0.2, r * 0.14);
    if (z.st === 'chase') { ctx.font = `bold ${TS * 0.4}px system-ui`; ctx.textAlign = 'center'; ctx.fillText('!', zx, zy - r - 4); }
  }

  // textes flottants
  ctx.textAlign = 'center'; ctx.font = `bold ${Math.round(TS * 0.36)}px system-ui`;
  for (const f of S.floats) {
    ctx.globalAlpha = 1 - f.t; ctx.fillStyle = f.col;
    ctx.fillText(f.txt, ox + f.x * TS, oy + f.y * TS);
  }
  ctx.globalAlpha = 1;

  if (p.hidden) {
    ctx.fillStyle = '#b8f5c0'; ctx.font = `bold 14px system-ui`;
    ctx.fillText('caché', px, py - TS * 0.7);
  }
  if (S.flash > 0) { ctx.fillStyle = `rgba(200,0,0,${S.flash * 0.6})`; ctx.fillRect(0, 0, VW, VH); }
}

// ---------- HUD ----------
const buildBtns = {};
function initBuildBar() {
  const bar = $('build');
  const add = (id, ic, name, cost) => {
    const b = document.createElement('button');
    b.innerHTML = `${ic}<b>${name}</b><small>${cost}</small>`;
    b.addEventListener('click', () => select(sel === id ? null : id));
    bar.appendChild(b); buildBtns[id] = b;
  };
  for (const id in BUILD) {
    const d = BUILD[id];
    add(id, d.ic, d.n, Object.keys(d.c).map(k => d.c[k] + RES_ICON[k]).join(' '));
  }
  add('demolish', '🔨', 'Démolir', '½ rendu');
}
function select(id) {
  sel = id;
  for (const k in buildBtns) buildBtns[k].classList.toggle('sel', k === sel);
  if (id) toast(id === 'demolish' ? 'Touche une construction pour la démolir.' : `Touche une case proche pour poser : ${BUILD[id].n}.`, 1800);
}
let hudT = 0;
function updateHud(dt) {
  hudT -= dt; if (hudT > 0) return; hudT = 0.12;
  const night = S.phase === 'night';
  $('phase').textContent = (night ? '🌙 Nuit ' : '☀️ Jour ') + S.day + (night ? ` · ${S.zombies.length + S.toSpawn} 👁` : '');
  $('clockbar').style.width = (100 * S.t / (night ? NIGHT : DAY)) + '%';
  $('clockbar').style.background = night ? '#8aa0ff' : '#ffd35a';
  $('hpbar').style.width = clamp(S.p.hp, 0, 100) + '%';
  $('foodbar').style.width = S.p.food + '%';
  $('noisebar').style.width = clamp(S.noise / 7 * 100, 0, 100) + '%';
  $('wood').textContent = S.inv.wood; $('stone').textContent = S.inv.stone; $('berries').textContent = S.inv.berries;
  for (const id in BUILD) buildBtns[id].classList.toggle('poor', !canAfford(BUILD[id].c));
  $('sneak').classList.toggle('on', S.sneak);
}

// ---------- Entrées ----------
function initInput() {
  const joy = $('joy'), knob = $('knob');
  let jid = null;
  const jmove = e => {
    const r = joy.getBoundingClientRect(), max = r.width / 2;
    let dx = e.clientX - (r.left + max), dy = e.clientY - (r.top + max);
    const l = Math.hypot(dx, dy);
    if (l > max) { dx *= max / l; dy *= max / l; }
    input.jx = dx / max; input.jy = dy / max;
    knob.style.transform = `translate(${dx}px,${dy}px)`;
  };
  const jend = e => {
    if (e.pointerId !== jid) return;
    jid = null; input.jx = input.jy = 0; knob.style.transform = '';
  };
  joy.addEventListener('pointerdown', e => { jid = e.pointerId; joy.setPointerCapture(jid); jmove(e); e.preventDefault(); });
  joy.addEventListener('pointermove', e => { if (e.pointerId === jid) jmove(e); });
  joy.addEventListener('pointerup', jend); joy.addEventListener('pointercancel', jend);

  const act = $('act');
  act.addEventListener('pointerdown', e => { input.act = true; act.setPointerCapture(e.pointerId); e.preventDefault(); });
  const actEnd = () => { input.act = false; };
  act.addEventListener('pointerup', actEnd); act.addEventListener('pointercancel', actEnd);
  $('sneak').addEventListener('click', () => { if (S) S.sneak = !S.sneak; });
  $('eat').addEventListener('click', eat);

  cv.addEventListener('pointerdown', e => {
    if (!running || !sel) return;
    const [tx, ty] = screenToTile(e.clientX, e.clientY);
    tryBuild(tx, ty);
  });
  cv.addEventListener('pointermove', e => { input.mouse = e.pointerType === 'mouse' ? { x: e.clientX, y: e.clientY } : null; });
  cv.addEventListener('contextmenu', e => e.preventDefault());

  const ids = Object.keys(BUILD).concat('demolish');
  window.addEventListener('keydown', e => {
    input.keys[e.code] = true;
    if (!running) return;
    if (e.code === 'Space' || e.code === 'KeyE') { input.act = true; e.preventDefault(); }
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') input.sneakHold = true;
    if (e.code === 'KeyF') eat();
    if (e.code === 'Escape') select(null);
    const m = /^Digit([1-7])$/.exec(e.code);
    if (m) { const id = ids[m[1] - 1]; select(sel === id ? null : id); }
    if (e.code.startsWith('Arrow')) e.preventDefault();
  });
  window.addEventListener('keyup', e => {
    input.keys[e.code] = false;
    if (e.code === 'Space' || e.code === 'KeyE') input.act = false;
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') input.sneakHold = false;
  });
  window.addEventListener('blur', () => { input.keys = {}; input.act = false; input.sneakHold = false; });
}

// ---------- Démarrage ----------
function start(fresh) {
  if (fresh || !load()) newGame();
  S.fires = [];
  select(null);
  $('menu').classList.add('hidden'); $('over').classList.add('hidden'); $('hud').classList.remove('hidden');
  running = true;
  toast(S.day === 1 ? '☀️ Jour 1 — récolte du bois (⛏️) et bâtis un abri avant la nuit.' : `☀️ Jour ${S.day}`, 4000);
}

let last = 0;
function frame(ts) {
  const now = ts / 1000, dt = Math.min(0.05, now - last || 0);
  last = now;
  if (S) {
    if (running && !document.hidden) { update(dt); if (S) updateHud(dt); }
    render(now, dt);
  }
  requestAnimationFrame(frame);
}

initBuildBar();
initInput();
$('new').addEventListener('click', () => start(true));
$('continue').addEventListener('click', () => start(false));
$('continue').classList.toggle('hidden', !hasSave());
$('overBtn').addEventListener('click', () => {
  $('over').classList.add('hidden');
  if (overRestart) start(true); else running = true;
});
requestAnimationFrame(frame);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

// accès pour les tests
window.__tapi = { get S() { return S; }, startNight: () => startNight(), startDay: () => startDay() };
})();
