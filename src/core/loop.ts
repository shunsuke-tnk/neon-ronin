// Fixed-timestep game loop with a render interpolation factor.
// Decoupling simulation from rendering keeps physics deterministic regardless
// of display refresh rate (60Hz, 120Hz, ...).

export type UpdateFn = (dt: number) => void;
export type RenderFn = (alpha: number) => void;

export interface LoopHandle {
  stop(): void;
}

export function startLoop(
  update: UpdateFn,
  render: RenderFn,
  fixedDt = 1 / 60,
): LoopHandle {
  let last = performance.now();
  let accumulator = 0;
  let running = true;
  // Hard cap on catch-up steps to avoid a "spiral of death" after a stall
  // (e.g. the tab was backgrounded).
  const MAX_STEPS = 5;

  function frame(now: number): void {
    if (!running) return;
    let delta = (now - last) / 1000;
    last = now;
    if (delta > 0.25) delta = 0.25;
    accumulator += delta;

    let steps = 0;
    while (accumulator >= fixedDt && steps < MAX_STEPS) {
      update(fixedDt);
      accumulator -= fixedDt;
      steps++;
    }
    // Drop leftover backlog if we hit the cap.
    if (steps >= MAX_STEPS) accumulator = 0;

    render(accumulator / fixedDt);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
  return {
    stop() {
      running = false;
    },
  };
}
