// Keyboard + mouse state with edge-triggered "pressed" queries.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.locked = false;

    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      if (['Space', 'Tab'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      const code = ['Mouse0', 'Mouse1', 'Mouse2'][e.button];
      this.keys.add(code);
      this.pressed.add(code);
    });
    addEventListener('mouseup', (e) => this.keys.delete(['Mouse0', 'Mouse1', 'Mouse2'][e.button]));
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) this.keys.clear();
    });
  }

  lock() { this.canvas.requestPointerLock?.(); }
  down(code) { return this.keys.has(code); }
  hit(...codes) { return codes.some((c) => this.pressed.has(c)); }

  // Call at end of frame.
  flush() {
    this.pressed.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
  }
}
