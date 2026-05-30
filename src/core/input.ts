// Keyboard input with per-frame edge detection (justPressed / justReleased).
// Raw key codes are mapped to semantic actions via ACTION_KEYS so the rest of
// the game never references physical keys directly.

export type Action =
  | 'left'
  | 'right'
  | 'up'
  | 'down'
  | 'jump'
  | 'attack'
  | 'special'
  | 'dash'
  | 'switch'
  | 'pause'
  | 'confirm';

// Bindings match the on-screen control prompts exactly:
//   移動 ←→/AD   ジャンプ Z(Space)   ダッシュ Shift   斬る X/J   武器 C(Q)   残刃 B(L)
const ACTION_KEYS: Record<Action, string[]> = {
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  jump: ['KeyZ', 'Space'],
  attack: ['KeyX', 'KeyJ'],
  special: ['KeyB', 'KeyL'],
  dash: ['ShiftLeft', 'ShiftRight'],
  switch: ['KeyC', 'KeyQ'],
  pause: ['Escape', 'KeyP'],
  confirm: ['Enter', 'KeyZ'],
};

export class Input {
  private down = new Set<string>();
  private pressed = new Set<string>();
  private released = new Set<string>();
  /** Set true on any key during this frame — handy for "press any key" prompts. */
  anyPressed = false;

  attach(target: Window = window): void {
    target.addEventListener('keydown', this.onKeyDown);
    target.addEventListener('keyup', this.onKeyUp);
    // Releasing focus should not leave keys stuck "down".
    target.addEventListener('blur', this.clearAll);
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    // Stop the page from scrolling on arrows / space.
    if (
      e.code === 'Space' ||
      e.code === 'Tab' ||
      e.code.startsWith('Arrow')
    ) {
      e.preventDefault();
    }
    if (e.repeat) return;
    if (!this.down.has(e.code)) {
      this.down.add(e.code);
      this.pressed.add(e.code);
      this.anyPressed = true;
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.down.delete(e.code);
    this.released.add(e.code);
  };

  private clearAll = (): void => {
    this.down.clear();
    this.pressed.clear();
    this.released.clear();
  };

  private anyOf(keys: string[], set: Set<string>): boolean {
    for (const k of keys) if (set.has(k)) return true;
    return false;
  }

  isDown(action: Action): boolean {
    return this.anyOf(ACTION_KEYS[action], this.down);
  }

  justPressed(action: Action): boolean {
    return this.anyOf(ACTION_KEYS[action], this.pressed);
  }

  justReleased(action: Action): boolean {
    return this.anyOf(ACTION_KEYS[action], this.released);
  }

  /** Horizontal axis in [-1, 1]. */
  get moveX(): number {
    return (this.isDown('right') ? 1 : 0) - (this.isDown('left') ? 1 : 0);
  }

  /** Vertical axis in [-1, 1] (down is positive, matching screen space). */
  get moveY(): number {
    return (this.isDown('down') ? 1 : 0) - (this.isDown('up') ? 1 : 0);
  }

  // Call at the very end of each fixed update to consume edge events.
  postUpdate(): void {
    this.pressed.clear();
    this.released.clear();
    this.anyPressed = false;
  }
}
