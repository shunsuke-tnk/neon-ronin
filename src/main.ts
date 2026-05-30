// Entry point: build the renderer, input, audio and game, then run the fixed
// timestep loop. Audio context is created on the first user gesture.

import { Renderer } from './render/renderer.ts';
import { Input } from './core/input.ts';
import { GameAudio } from './core/audio.ts';
import { Game } from './game/game.ts';
import { startLoop } from './core/loop.ts';
import { preloadAll } from './render/assets.ts';
import { PAL } from './content/design.ts';

function boot(): void {
  const canvas = document.getElementById('game') as HTMLCanvasElement | null;
  if (!canvas) throw new Error('#game canvas not found');

  preloadAll();
  const renderer = new Renderer(canvas);
  const input = new Input();
  input.attach(window);
  const audio = new GameAudio();
  const game = new Game(input, audio);
  // dev-only debug handle (stripped from production builds)
  if (import.meta.env.DEV) {
    (window as unknown as { __game: Game }).__game = game;
  }

  // Create / resume the audio context on the first gesture.
  const wake = (): void => audio.ensure();
  window.addEventListener('keydown', wake, { once: true });
  window.addEventListener('pointerdown', wake, { once: true });

  // Mute toggle (M) — handled here so it works in every state.
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyM') audio.toggleMute();
  });

  const boot = document.getElementById('boot');
  let hidden = false;

  startLoop(
    (dt) => game.update(dt),
    () => {
      renderer.begin();
      renderer.clear(PAL.void);
      game.render(renderer.ctx);
      if (!hidden && boot) {
        hidden = true;
        boot.style.opacity = '0';
        setTimeout(() => boot.remove(), 700);
      }
    },
  );
}

boot();
