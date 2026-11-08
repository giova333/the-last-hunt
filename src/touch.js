// On-screen controls for phones / tablets.
//  Left half:  floating joystick (drop your thumb anywhere). Push to the rim to sprint.
//  Right half: drag to look around.
//  Buttons:    Attack · Heavy · Roll (big, under the right thumb), Heal · Lock · Use, Pause.
// Everything feeds the same Input object the keyboard/mouse uses, so gameplay code is shared.

// Primary pointer is a finger (phones/tablets). ?touch=1 / ?touch=0 forces it either way.
export const isTouchDevice = () => {
  const q = new URLSearchParams(location.search).get('touch');
  if (q !== null) return q === '1';
  return matchMedia('(pointer: coarse)').matches;
};

const BUTTONS = [
  { id: 'attack', label: 'Slash', code: 'Mouse0', cls: 'big' },
  { id: 'heavy', label: 'Heavy', code: 'Mouse2', cls: 'mid' },
  { id: 'roll', label: 'Roll', code: 'Space', cls: 'mid' },
  { id: 'heal', label: 'Vial', code: 'KeyR', cls: 'small' },
  { id: 'lock', label: 'Lock', code: 'KeyQ', cls: 'small' },
  { id: 'use', label: 'Use', code: 'KeyE', cls: 'small' },
];

export class TouchControls {
  constructor(input, { onPause } = {}) {
    this.input = input;
    const root = document.createElement('div');
    root.id = 'touch';
    root.className = 'hidden';
    root.innerHTML = `
      <div class="stick hidden"><div class="knob"></div></div>
      ${BUTTONS.map((b) => `<button class="tbtn ${b.cls}" data-code="${b.code}" id="t-${b.id}">${b.label}</button>`).join('')}
      <button class="tbtn pausebtn" id="t-pause" aria-label="Pause">❚❚</button>`;
    document.body.appendChild(root);
    this.root = root;
    this.stick = root.querySelector('.stick');
    this.knob = root.querySelector('.knob');
    this.R = 56;            // joystick radius (px)
    this.move = null;       // { id, x0, y0 }
    this.look = null;       // { id, x, y }

    // Buttons: press on touch-down (edge-triggered), release on up.
    for (const btn of root.querySelectorAll('.tbtn[data-code]')) {
      const code = btn.dataset.code;
      btn.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); input.keys.add(code); input.pressed.add(code); btn.classList.add('on'); try { btn.setPointerCapture(e.pointerId); } catch {} });
      const up = (e) => { e.stopPropagation(); input.keys.delete(code); btn.classList.remove('on'); };
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointercancel', up);
    }
    root.querySelector('#t-pause').addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); onPause?.(); });

    // Joystick (left half) and look (right half).
    root.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.tbtn')) return;
      e.preventDefault();
      if (e.clientX < innerWidth * 0.45 && !this.move) {
        this.move = { id: e.pointerId, x0: e.clientX, y0: e.clientY };
        this.stick.style.left = `${e.clientX}px`; this.stick.style.top = `${e.clientY}px`;
        this.stick.classList.remove('hidden');
        this.setKnob(0, 0);
      } else if (!this.look) {
        this.look = { id: e.pointerId, x: e.clientX, y: e.clientY };
      }
    });
    root.addEventListener('pointermove', (e) => {
      if (this.move && e.pointerId === this.move.id) {
        let dx = e.clientX - this.move.x0, dy = e.clientY - this.move.y0;
        const d = Math.hypot(dx, dy);
        if (d > this.R) { dx *= this.R / d; dy *= this.R / d; }
        this.setKnob(dx, dy);
        const k = Math.min(1, d / this.R);
        const dead = k < 0.15;
        input.axis.x = dead ? 0 : dx / this.R;
        input.axis.y = dead ? 0 : -dy / this.R;
        // Push to the rim to sprint.
        if (k > 0.92) input.keys.add('ShiftLeft'); else input.keys.delete('ShiftLeft');
        this.knob.classList.toggle('sprint', k > 0.92);
      } else if (this.look && e.pointerId === this.look.id) {
        input.mouseDX += (e.clientX - this.look.x) * 1.6;
        input.mouseDY += (e.clientY - this.look.y) * 1.3;
        this.look.x = e.clientX; this.look.y = e.clientY;
      }
    });
    const end = (e) => {
      if (this.move && e.pointerId === this.move.id) {
        this.move = null; input.axis.x = input.axis.y = 0; input.keys.delete('ShiftLeft');
        this.stick.classList.add('hidden'); this.knob.classList.remove('sprint');
      }
      if (this.look && e.pointerId === this.look.id) this.look = null;
    };
    root.addEventListener('pointerup', end);
    root.addEventListener('pointercancel', end);
    // No long-press menus / double-tap zoom.
    root.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  setKnob(dx, dy) { this.knob.style.transform = `translate(${dx}px, ${dy}px)`; }
  show(on) { this.root.classList.toggle('hidden', !on); if (!on) { this.move = this.look = null; this.input.axis.x = this.input.axis.y = 0; this.stick.classList.add('hidden'); } }
}
