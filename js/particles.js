/** Juice splash, flame, spark & debris particles (no gore). */

const MAX_PARTICLES = 320;

export class ParticleSystem {
  constructor() {
    this.particles = [];
  }

  _room(n = 1) {
    const over = this.particles.length + n - MAX_PARTICLES;
    if (over > 0) this.particles.splice(0, over);
  }

  burst(x, y, color, count = 18, speed = 6) {
    count = Math.min(count, 24);
    this._room(count);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.35 + Math.random() * 0.9);
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 2,
        life: 0.45 + Math.random() * 0.4,
        maxLife: 0.9,
        size: 2 + Math.random() * 4,
        color,
        drip: Math.random() > 0.45,
        kind: "burst",
      });
    }
  }

  drip(x, y, color, count = 6) {
    count = Math.min(count, 8);
    this._room(count);
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: x + (Math.random() - 0.5) * 8,
        y: y + (Math.random() - 0.5) * 4,
        vx: (Math.random() - 0.5) * 1.5,
        vy: 1 + Math.random() * 3,
        life: 0.35 + Math.random() * 0.4,
        maxLife: 0.85,
        size: 1.5 + Math.random() * 2.5,
        color,
        drip: true,
        kind: "drip",
      });
    }
  }

  flame(x, y, count = 3) {
    count = Math.min(count, 4);
    this._room(count);
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: x + (Math.random() - 0.5) * 6,
        y: y + (Math.random() - 0.5) * 4,
        vx: (Math.random() - 0.5) * 1.2,
        vy: -2.5 - Math.random() * 3.5,
        life: 0.22 + Math.random() * 0.28,
        maxLife: 0.5,
        size: 3 + Math.random() * 4,
        color: Math.random() > 0.4 ? "#ff9040" : "#ffe060",
        drip: false,
        kind: "flame",
        gravity: -8,
      });
    }
  }

  spark(x, y, count = 6) {
    count = Math.min(count, 8);
    this._room(count);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 3 + Math.random() * 7;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 1,
        life: 0.12 + Math.random() * 0.2,
        maxLife: 0.3,
        size: 1 + Math.random() * 2,
        color: Math.random() > 0.5 ? "#dff6ff" : "#7ec8ff",
        drip: false,
        kind: "spark",
        gravity: 4,
      });
    }
  }

  bubble(x, y, count = 1) {
    this._room(count);
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: x + (Math.random() - 0.5) * 6,
        y,
        vx: (Math.random() - 0.5) * 0.6,
        vy: -1.2 - Math.random() * 1.5,
        life: 0.6 + Math.random() * 0.5,
        maxLife: 1,
        size: 2 + Math.random() * 3,
        color: "rgba(180,220,240,0.7)",
        drip: false,
        kind: "bubble",
        gravity: -6,
      });
    }
  }

  update(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      const g = p.gravity != null ? p.gravity : p.drip ? 18 : 12;
      p.vy += g * dt;
      p.vx *= p.kind === "spark" ? 0.92 : 0.98;
      p.x += p.vx;
      p.y += p.vy;
      p.life -= dt;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
  }

  draw(ctx) {
    // Cheap filled squares beat arc/ellipse per particle on the GPU
    for (const p of this.particles) {
      const a = Math.max(0, p.life / (p.maxLife || 1));
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      const s = p.size;
      if (p.kind === "flame") {
        ctx.fillRect(p.x - s * 0.35, p.y - s * 0.55, s * 0.7, s * 1.1);
      } else if (p.kind === "bubble") {
        ctx.globalAlpha = a * 0.55;
        ctx.strokeStyle = "rgba(200,230,245,0.7)";
        ctx.lineWidth = 1;
        ctx.strokeRect(p.x - s, p.y - s, s * 2, s * 2);
      } else if (p.drip) {
        ctx.fillRect(p.x - s * 0.35, p.y - s * 0.55, s * 0.7, s * 1.15);
      } else {
        ctx.fillRect(p.x - s * 0.5, p.y - s * 0.5, s, s);
      }
    }
    ctx.globalAlpha = 1;
  }
}
