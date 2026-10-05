/** Keyboard + mouse + twin virtual joysticks. */
export interface Stick { x: number; y: number; active: boolean }

export class Input {
  private keys = new Set<string>();
  private pressed = new Set<string>();
  joy: Stick = { x: 0, y: 0, active: false };   // left: move
  aim: Stick = { x: 0, y: 0, active: false };   // right: aim + fire
  mouse = { x: 0, y: 0, down: false, moved: false };
  isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  enabled = true;

  constructor(canvas: HTMLCanvasElement) {
    addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      const k = e.key.toLowerCase();
      if (!this.keys.has(k)) this.pressed.add(k);
      this.keys.add(k);
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'tab'].includes(k)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    addEventListener('blur', () => { this.keys.clear(); this.mouse.down = false; });
    canvas.addEventListener('mousemove', (e) => { this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.mouse.moved = true; });
    canvas.addEventListener('mousedown', (e) => { if (e.button === 0) this.mouse.down = true; this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.mouse.moved = true; });
    addEventListener('mouseup', (e) => { if (e.button === 0) this.mouse.down = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  down(...k: string[]) { return k.some((x) => this.keys.has(x)); }
  hit(...k: string[]) {
    let r = false;
    for (const x of k) if (this.pressed.has(x)) { this.pressed.delete(x); r = true; }
    return r;
  }
  press(k: string) { this.pressed.add(k); }
  hold(k: string, on: boolean) { if (on) this.keys.add(k); else this.keys.delete(k); }
  endFrame() { this.pressed.clear(); }

  move(): { x: number; y: number; run: boolean } {
    if (!this.enabled) return { x: 0, y: 0, run: false };
    let x = 0, y = 0;
    if (this.down('w', 'arrowup')) y += 1;
    if (this.down('s', 'arrowdown')) y -= 1;
    if (this.down('a', 'arrowleft')) x -= 1;
    if (this.down('d', 'arrowright')) x += 1;
    let run = this.down('shift');
    if (this.joy.active) { x = this.joy.x; y = this.joy.y; run = Math.hypot(x, y) > 0.9; }
    const m = Math.hypot(x, y);
    if (m > 1) { x /= m; y /= m; }
    return { x, y, run };
  }

  /** Virtual joystick bound to a DOM zone, writing into `stick` */
  bindStick(zone: HTMLElement, base: HTMLElement, knob: HTMLElement, stick: Stick) {
    let id: number | null = null, cx = 0, cy = 0;
    const R = 52;
    const set = (px: number, py: number) => {
      let dx = px - cx, dy = py - cy;
      const d = Math.hypot(dx, dy);
      if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      stick.x = dx / R; stick.y = -dy / R;
    };
    zone.addEventListener('pointerdown', (e) => {
      if (id !== null) return;
      id = e.pointerId; zone.setPointerCapture(id);
      const r = zone.getBoundingClientRect();
      cx = e.clientX; cy = e.clientY;
      const h = base.offsetWidth / 2;
      base.style.right = 'auto'; base.style.margin = `${-h}px 0 0 ${-h}px`;
      base.style.left = `${cx - r.left}px`; base.style.top = `${cy - r.top}px`;
      base.classList.add('on');
      stick.active = true; set(e.clientX, e.clientY);
    });
    zone.addEventListener('pointermove', (e) => { if (e.pointerId === id) set(e.clientX, e.clientY); });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      id = null; stick.x = 0; stick.y = 0; stick.active = false;
      knob.style.transform = ''; base.classList.remove('on');
      base.style.left = base.style.top = base.style.right = base.style.margin = ''; // back to the CSS home spot
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
  }
}
