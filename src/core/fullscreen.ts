// Auto-fullscreen for touch devices. Browsers only enter fullscreen from a user
// gesture, so we fire the request on the first tap while the device is held in
// landscape — to the player it feels automatic without an extra prompt. It
// no-ops where the Fullscreen API is missing (notably iPhone Safari, which has
// none; "Add to Home Screen" gives a standalone fullscreen there instead).

import { isTouch } from './touch.ts';

type FsElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};
type FsDocument = Document & {
  webkitFullscreenElement?: Element | null;
};

function isLandscape(): boolean {
  return window.innerWidth >= window.innerHeight;
}

function isFullscreen(): boolean {
  const d = document as FsDocument;
  return !!(document.fullscreenElement || d.webkitFullscreenElement);
}

function requestFullscreen(): void {
  const el = document.documentElement as FsElement;
  const fn = el.requestFullscreen ?? el.webkitRequestFullscreen;
  if (!fn) return;
  try {
    const r = fn.call(el);
    if (r && typeof (r as Promise<void>).catch === 'function') {
      (r as Promise<void>).catch(() => {
        /* user denied — stay windowed */
      });
    }
  } catch {
    /* unsupported — stay windowed */
  }
}

/**
 * On touch devices, enter fullscreen on the first tap that lands while in
 * landscape. Re-arms automatically: if the player leaves fullscreen and taps
 * again in landscape, it re-enters.
 */
export function setupAutoFullscreen(): void {
  if (!isTouch()) return;
  const el = document.documentElement as FsElement;
  if (!(el.requestFullscreen || el.webkitRequestFullscreen)) return;
  window.addEventListener('pointerdown', () => {
    if (isLandscape() && !isFullscreen()) requestFullscreen();
  });
}
