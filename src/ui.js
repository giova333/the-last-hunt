import * as THREE from 'three';

const $ = (s) => document.querySelector(s);

export class UI {
  constructor() {
    this.hud = $('#hud');
    this.hp = $('.bar.hp .fill');
    this.rally = $('.bar.hp .rally');
    this.hpBar = $('.bar.hp');
    this.st = $('.bar.st .fill');
    this.stBar = $('.bar.st');
    this.vials = $('#vial-count');
    this.vialIcon = $('#vials .vial-icon');
    this.echoes = $('#echo-count');
    this.prompt = $('#prompt');
    this.area = $('#area-title');
    this.boss = $('#boss');
    this.bossFill = $('.boss-hp .fill');
    this.bossTrail = $('.boss-hp .trail');
    this.note = $('#note');
    this.lock = $('#lock');
    this.vig = $('#vignette');
    this.poison = $('#poison');
    this.banner = $('#banner');
    this.v = new THREE.Vector3();
    this.bars = $('#enemy-bars');
    this.bossDmg = $('#boss .dmg');
  }

  // Floating health bars over regular enemies, with a running damage counter (Souls-style).
  enemyBars(enemies, camera, player) {
    const now = performance.now();
    for (const e of enemies) {
      if (!e.ui) {
        const el = document.createElement('div');
        el.className = 'ebar';
        el.innerHTML = '<span class="dmg"></span><div class="bar"><div class="trail"></div><div class="fill"></div></div>';
        this.bars.appendChild(el);
        e.ui = { el, fill: el.querySelector('.fill'), trail: el.querySelector('.trail'), dmg: el.querySelector('.dmg'), lastHp: e.hp, sum: 0, t: 0 };
      }
      const u = e.ui;
      this.trackDamage(u, e.hp, now);
      const near = Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z) < 22;
      const show = !e.dead && e.root.visible && near && (e.aggro || e.hp < e.maxHp || player.lock === e);
      this.v.copy(e.pos).setY(e.pos.y + 2.5).project(camera);
      const onScreen = this.v.z < 1 && Math.abs(this.v.x) < 1.1 && Math.abs(this.v.y) < 1.1;
      u.el.style.display = show && onScreen ? 'block' : 'none';
      if (!show || !onScreen) continue;
      u.el.style.left = `${(this.v.x * 0.5 + 0.5) * innerWidth}px`;
      u.el.style.top = `${(-this.v.y * 0.5 + 0.5) * innerHeight}px`;
      const k = Math.max(0, e.hp / e.maxHp);
      u.fill.style.transform = `scaleX(${k})`;
      u.trail.style.transform = `scaleX(${k})`;
    }
  }

  // Sum the hits of a combo into one number; it fades 1.6 s after the last hit.
  trackDamage(u, hp, now) {
    if (hp > u.lastHp) u.sum = 0;                       // healed / reset
    else if (hp < u.lastHp) { if (now - u.t > 1600) u.sum = 0; u.sum += u.lastHp - Math.max(0, hp); u.t = now; }
    u.lastHp = hp;
    const on = u.sum > 0 && now - u.t < 1600;
    u.dmg.textContent = on ? Math.round(u.sum) : '';
    u.dmg.classList.toggle('on', on);
  }

  update(p, boss, camera) {
    const w = (n) => n * 3.2; // px per hp
    this.hpBar.style.width = `${w(p.maxHp)}px`;
    this.hp.style.transform = `scaleX(${Math.max(0, p.hp / p.maxHp)})`;
    this.rally.style.transform = `scaleX(${Math.min(1, (p.hp + p.rally) / p.maxHp)})`;
    this.st.style.transform = `scaleX(${Math.max(0, p.stamina / p.maxStamina)})`;
    this.vials.textContent = p.vials;
    this.vialIcon.classList.toggle('empty', p.vials === 0);
    this.echoes.textContent = p.echoes;
    this.poison.classList.toggle('on', p.poison > 0);
    if (boss) {
      const k = Math.max(0, boss.hp / boss.maxHp);
      this.bossFill.style.transform = `scaleX(${k})`;
      this.bossTrail.style.transform = `scaleX(${k})`;
      this.bossUi ??= { dmg: this.bossDmg, lastHp: boss.hp, sum: 0, t: 0 };
      this.trackDamage(this.bossUi, boss.hp, performance.now());
    }
    if (p.lock && !p.lock.dead) {
      this.v.copy(p.lock.pos).setY(p.lock.pos.y + (p.lock.radius > 1 ? 3.3 : 1.3)).project(camera);
      this.lock.style.display = 'block';
      this.lock.style.left = `${(this.v.x * 0.5 + 0.5) * innerWidth}px`;
      this.lock.style.top = `${(-this.v.y * 0.5 + 0.5) * innerHeight}px`;
    } else this.lock.style.display = 'none';
  }

  setPrompt(text) {
    if (text && document.body.classList.contains('touch')) text = text.replace('<b>E</b>', '<b>Use</b>');
    if (text) this.prompt.innerHTML = text;
    this.prompt.classList.toggle('on', !!text);
  }

  showArea(name) {
    this.area.textContent = name;
    this.area.classList.add('on');
    clearTimeout(this.areaT);
    this.areaT = setTimeout(() => this.area.classList.remove('on'), 3200);
  }

  hint(text, ms = 5000) {
    const h = (this.hintEl ??= document.querySelector('#hint'));
    h.innerHTML = text; h.classList.add('on');
    clearTimeout(this.hintT); this.hintT = setTimeout(() => h.classList.remove('on'), ms);
  }

  showResults(rows, onAgain) {
    const r = document.querySelector('#results');
    r.querySelector('dl').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
    r.querySelector('.again').onclick = onAgain;
    r.classList.remove('hidden');
  }

  showBoss(on) { this.boss.classList.toggle('hidden', !on); }

  showNote(html) {
    this.note.querySelector('.note-body').innerHTML = html;
    this.note.classList.remove('hidden');
  }
  hideNote() { this.note.classList.add('hidden'); }

  // Lantern rest menu. rows: [{ key, label, desc, cost, can }]; buttons buy on tap/click.
  showLantern({ echoes, cost, rows }, onBuy, bought = null) {
    const m = (this.lanternMenu ??= document.querySelector('#lantern-menu'));
    m.querySelector('.echoes').textContent = echoes;
    m.querySelector('.cost').textContent = cost;
    m.querySelector('.rows').innerHTML = rows.map((r, i) =>
      `<button class="row${r.key === bought ? ' bought' : ''}" data-key="${r.key}"${r.can ? '' : ' disabled'}><b>${i + 1}</b><span>${r.label}</span><small>${r.desc}</small></button>`).join('');
    m.querySelectorAll('.row').forEach((el) => { el.onclick = () => onBuy(el.dataset.key); });
    m.querySelector('.leave').onclick = () => this.hideLantern();   // the touch-only way out (desktop uses E)
    m.classList.remove('hidden');
  }
  hideLantern() { this.lanternMenu?.classList.add('hidden'); }
  get lanternOpen() { return !!this.lanternMenu && !this.lanternMenu.classList.contains('hidden'); }
  get noteOpen() { return !this.note.classList.contains('hidden'); }

  flashHurt() {
    this.vig.classList.add('hurt');
    clearTimeout(this.vigT);
    this.vigT = setTimeout(() => this.vig.classList.remove('hurt'), 250);
  }

  showBanner(title, sub, win = false, ms = 3500) {
    this.banner.querySelector('h2').textContent = title;
    this.banner.querySelector('p').textContent = sub || '';
    this.banner.classList.toggle('win', win);
    this.banner.classList.remove('hidden');
    clearTimeout(this.bannerT);
    if (ms) this.bannerT = setTimeout(() => this.banner.classList.add('hidden'), ms);
  }
}
