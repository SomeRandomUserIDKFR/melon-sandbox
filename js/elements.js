/** Fire, electricity, and water interactions. */

import { damagePart } from "./ragdoll.js";

const { Body, Composite } = Matter;

export function ignite(body, intensity = 1, duration = 6) {
  if (!body?.plugin) return;
  if (body.plugin.wet > 0.55) {
    body.plugin.wet = Math.max(0, body.plugin.wet - 0.3);
    return; // damp wood/flesh won't catch easily
  }
  if (!body.plugin.burn) {
    body.plugin.burn = { t: duration, intensity, spreadCd: 0 };
  } else {
    body.plugin.burn.t = Math.max(body.plugin.burn.t, duration);
    body.plugin.burn.intensity = Math.max(body.plugin.burn.intensity, intensity);
  }
}

export function extinguish(body, amount = 1) {
  if (!body?.plugin) return;
  if (body.plugin.burn) {
    body.plugin.burn.t -= amount * 2.5;
    body.plugin.burn.intensity *= 0.6;
    if (body.plugin.burn.t <= 0) body.plugin.burn = null;
  }
  body.plugin.wet = Math.min(1, (body.plugin.wet || 0) + amount * 0.35);
}

export function shock(body, strength = 1, duration = 1.2) {
  if (!body?.plugin) return;
  // Water amplifies shock
  const wetBoost = 1 + (body.plugin.wet || 0) * 1.8;
  const s = strength * wetBoost;
  if (!body.plugin.shock) {
    body.plugin.shock = { t: duration, strength: s };
  } else {
    body.plugin.shock.t = Math.max(body.plugin.shock.t, duration);
    body.plugin.shock.strength = Math.max(body.plugin.shock.strength, s);
  }
  body.plugin.conscious = false;
  body.plugin.forceUnconscious = true;
  // Jolt
  Body.setVelocity(body, {
    x: body.velocity.x + (Math.random() - 0.5) * 8 * s,
    y: body.velocity.y - 3 * s,
  });
  Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.6 * s);
}

export function isConductive(body) {
  if (!body?.plugin) return false;
  const d = body.plugin.draw;
  return (
    body.plugin.conductive ||
    d === "metal" ||
    d === "wire" ||
    d === "battery" ||
    d === "coil" ||
    d === "shockpad" ||
    d === "baton" ||
    d === "tank" ||
    d === "saw" ||
    d === "spike" ||
    d === "sword" ||
    d === "hammer"
  );
}

function bodyInZone(body, zone) {
  const b = body.bounds;
  const z = zone.bounds;
  return !(b.max.x < z.min.x || b.min.x > z.max.x || b.max.y < z.min.y || b.min.y > z.max.y);
}

/** Per-frame element simulation. */
export function tickElements(world, dt, particles, explodeFn = null) {
  const bodies = Composite.allBodies(world);
  const waterZones = bodies.filter((b) => b.plugin?.waterZone);
  const lavaZones = bodies.filter((b) => b.plugin?.lavaZone);

  for (const b of bodies) {
    const pl = b.plugin;
    if (!pl || b.isStatic && !pl.burn && !pl.waterZone && !pl.lavaZone) {
      // still process static burnables below if they have burn
    }
    if (!pl) continue;

    // --- Water immersion ---
    let inWater = false;
    let inLava = false;
    for (const z of waterZones) {
      if (z === b) continue;
      if (bodyInZone(b, z)) {
        inWater = true;
        break;
      }
    }
    for (const z of lavaZones) {
      if (z === b) continue;
      if (bodyInZone(b, z)) {
        inLava = true;
        break;
      }
    }

    if (inWater && !b.isStatic) {
      pl.wet = Math.min(1, (pl.wet || 0) + dt * 0.9);
      extinguish(b, dt * 2.2);
      Body.applyForce(b, b.position, {
        x: -b.velocity.x * 0.0008,
        y: -0.0065 * Math.max(0.3, (b.area || 400) / 800) - b.velocity.y * 0.0012,
      });
      if (Math.random() < 0.12) {
        particles.bubble?.(b.position.x + (Math.random() - 0.5) * 10, b.bounds.min.y + 4);
      }
      if (pl.fruit && pl.part === "head") {
        pl.drown = (pl.drown || 0) + dt;
        if (pl.drown > 2.2) {
          pl.conscious = false;
          pl.forceUnconscious = true;
          if (pl.liquid) pl.liquid.amount = Math.max(0, pl.liquid.amount - 8 * dt);
          if (Math.random() < 0.2) particles.bubble?.(b.position.x, b.position.y - 8);
        }
      }
    } else if (pl.wet) {
      pl.wet = Math.max(0, pl.wet - dt * 0.12);
      if (pl.fruit && pl.part === "head") pl.drown = Math.max(0, (pl.drown || 0) - dt * 0.5);
    }

    if (inLava && !b.isStatic) {
      ignite(b, 1.4, 8);
      if (pl.fruit) damagePart(b, 28 * dt, particles, b.position, { silent: true });
      if (Math.random() < 0.35) particles.flame?.(b.position.x, b.position.y, 3);
    }

    // --- Fire ---
    if (pl.burn) {
      pl.burn.t -= dt;
      pl.burn.spreadCd = (pl.burn.spreadCd || 0) - dt;
      const inten = pl.burn.intensity || 1;

      if (Math.random() < 0.55 + inten * 0.2) {
        particles.flame?.(
          b.position.x + (Math.random() - 0.5) * 12,
          b.position.y + (Math.random() - 0.5) * 10,
          2 + inten
        );
      }

      if (pl.fruit) {
        damagePart(b, 14 * inten * dt, particles, b.position, { silent: true });
        if (pl.liquid) pl.liquid.amount = Math.max(0, pl.liquid.amount - 6 * inten * dt);
      }

      // Flammable props heat up
      if (pl.flammable && !pl.fruit) {
        pl.heat = (pl.heat || 0) + dt * inten;
        if (pl.heat > 3 && pl.explosiveFuel && explodeFn) {
          const { x, y } = b.position;
          Composite.remove(world, b);
          explodeFn(x, y, 0.11);
          continue;
        }
      }

      // Spread to nearby
      if (pl.burn.spreadCd <= 0) {
        pl.burn.spreadCd = 0.35;
        for (const other of bodies) {
          if (other === b || other.isStatic) continue;
          if (!other.plugin) continue;
          const dist = Math.hypot(
            other.position.x - b.position.x,
            other.position.y - b.position.y
          );
          if (dist < 42 && Math.random() < 0.2 * inten) {
            if (other.plugin.flammable || other.plugin.fruit || other.plugin.burnable !== false) {
              ignite(other, inten * 0.85, 4 + Math.random() * 3);
            }
          }
        }
      }

      if (pl.burn.t <= 0) pl.burn = null;
    }

    // --- Shock ---
    if (pl.shock) {
      pl.shock.t -= dt;
      if (Math.random() < 0.4) {
        particles.spark?.(
          b.position.x + (Math.random() - 0.5) * 14,
          b.position.y + (Math.random() - 0.5) * 14
        );
      }
      if (pl.fruit) {
        damagePart(b, 10 * pl.shock.strength * dt, particles, b.position, { silent: true });
        Body.applyForce(b, b.position, {
          x: (Math.random() - 0.5) * 0.004 * pl.shock.strength,
          y: (Math.random() - 0.5) * 0.004 * pl.shock.strength,
        });
      }
      // Conduct along metal contact (cheap proximity)
      if (pl.shock.t > 0.05 && Math.random() < 0.15) {
        for (const other of bodies) {
          if (other === b || !other.plugin) continue;
          const dist = Math.hypot(
            other.position.x - b.position.x,
            other.position.y - b.position.y
          );
          if (dist < 36 && (isConductive(other) || other.plugin.fruit || other.plugin.wet > 0.4)) {
            shock(other, pl.shock.strength * 0.7, 0.6);
          }
        }
      }
      if (pl.shock.t <= 0) {
        pl.shock = null;
        // Don't clear forceUnconscious if acid still active
        if (!pl.effects?.acid) pl.forceUnconscious = false;
      }
    }

    // Dry off wet label slowly already handled
  }

  // Active emitters: flamethrower, coil, sprinkler (respect Activate)
  for (const b of bodies) {
    const pl = b.plugin;
    if (!pl || b.isStatic) continue;
    const powered = !pl.activatable || pl.active;
    if (!powered) continue;

    if (pl.flamethrower) {
      // Also handled in main tick; keep element path for consistency when active
      const a = b.angle - Math.PI / 2;
      const reach = 70;
      const fx = b.position.x + Math.cos(a) * 24;
      const fy = b.position.y + Math.sin(a) * 24;
      if (Math.random() < 0.7) particles.flame?.(fx + Math.cos(a) * Math.random() * 40, fy + Math.sin(a) * Math.random() * 40, 3);
      for (const other of bodies) {
        if (other === b || other.isStatic) continue;
        const dx = other.position.x - b.position.x;
        const dy = other.position.y - b.position.y;
        const dist = Math.hypot(dx, dy);
        if (dist > reach || dist < 8) continue;
        const ang = Math.atan2(dy, dx);
        let diff = ang - a;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        if (Math.abs(diff) < 0.55) ignite(other, 1.1, 5);
      }
    }

    if (pl.coil) {
      pl.coilTimer = (pl.coilTimer || 0) + dt;
      if (pl.coilTimer > 1.1) {
        pl.coilTimer = 0;
        particles.spark?.(b.position.x, b.position.y);
        for (const other of bodies) {
          if (other === b || other.isStatic) continue;
          const dist = Math.hypot(other.position.x - b.position.x, other.position.y - b.position.y);
          if (dist < 110) {
            shock(other, 1.2, 1.0);
            particles.spark?.(other.position.x, other.position.y);
          }
        }
      }
    }

    if (pl.sprinkler) {
      const a = b.angle - Math.PI / 2;
      if (Math.random() < 0.5) {
        particles.drip(
          b.position.x + Math.cos(a) * 18,
          b.position.y + Math.sin(a) * 18,
          "#7ec8e8",
          2
        );
      }
      for (const other of bodies) {
        if (other === b) continue;
        const dist = Math.hypot(other.position.x - b.position.x, other.position.y - b.position.y);
        if (dist < 90) extinguish(other, dt * 1.5);
      }
    }

    if (pl.battery && pl.powered !== false) {
      // Shock on contact handled in collisions; idle spark
      if (Math.random() < 0.05) particles.spark?.(b.position.x, b.position.y);
    }
  }
}

/** Collision hooks for elemental contact. */
export function onElementCollision(bodyA, bodyB, particles, speed) {
  const pair = [bodyA, bodyB];

  // Torch / firebarrel contact
  for (const src of pair) {
    const other = src === bodyA ? bodyB : bodyA;
    if (src.plugin?.alwaysHot || src.plugin?.burn) {
      if (speed > 1.5 || src.plugin.alwaysHot) ignite(other, 1, 5);
    }
    if (src.plugin?.battery || src.plugin?.shockOnHit || src.plugin?.draw === "baton") {
      if (speed > 2 || src.plugin.battery) {
        shock(other, src.plugin.battery ? 1.3 : 1, 1.1);
        particles.spark?.(other.position.x, other.position.y);
      }
    }
    if (src.plugin?.shockpad && other.plugin) {
      shock(other, 1.5, 1.4);
      particles.spark?.(other.position.x, other.position.y);
    }
  }

  // Water barrel smash → wet splash
  for (const src of pair) {
    const other = src === bodyA ? bodyB : bodyA;
    if (src.plugin?.waterBomb && speed > 6) {
      src.plugin.waterBomb = false;
      extinguish(other, 2);
      particles.burst(src.position.x, src.position.y, "#7ec8e8", 22, 6);
      return { remove: src };
    }
  }

  return null;
}
