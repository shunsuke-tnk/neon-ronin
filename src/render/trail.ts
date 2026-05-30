// Additive ribbon trail. Records recent points and draws a tapering, glowing
// streak — used for the blade arc and dash afterglow. Two strokes (thick neon
// outer + thin bright core) give the "lit blade" look the design calls for.

interface TPoint {
  x: number;
  y: number;
  age: number;
}

export class Ribbon {
  pts: TPoint[] = [];
  private life: number;
  private max: number;

  constructor(life = 0.18, max = 26) {
    this.life = life;
    this.max = max;
  }

  push(x: number, y: number): void {
    this.pts.push({ x, y, age: 0 });
    if (this.pts.length > this.max) this.pts.shift();
  }

  update(dt: number): void {
    const pts = this.pts;
    for (let i = 0; i < pts.length; i++) pts[i].age += dt;
    while (pts.length && pts[0].age > this.life) pts.shift();
  }

  clear(): void {
    this.pts.length = 0;
  }

  get active(): boolean {
    return this.pts.length > 1;
  }

  render(ctx: CanvasRenderingContext2D, outer: string, core: string, width: number): void {
    const pts = this.pts;
    if (pts.length < 2) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const n = pts.length;

    // outer neon
    ctx.strokeStyle = outer;
    for (let i = 1; i < n; i++) {
      const a = pts[i];
      const b = pts[i - 1];
      const t = i / n;
      const fade = 1 - a.age / this.life;
      ctx.globalAlpha = 0.42 * fade;
      ctx.lineWidth = width * t * fade;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(a.x, a.y);
      ctx.stroke();
    }
    // bright core
    ctx.strokeStyle = core;
    for (let i = 1; i < n; i++) {
      const a = pts[i];
      const b = pts[i - 1];
      const t = i / n;
      const fade = 1 - a.age / this.life;
      ctx.globalAlpha = 0.95 * fade;
      ctx.lineWidth = Math.max(1, width * 0.22 * t * fade);
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(a.x, a.y);
      ctx.stroke();
    }
    ctx.restore();
  }
}
