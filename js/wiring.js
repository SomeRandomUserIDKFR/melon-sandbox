/** Signal wiring: sensors, buttons, activation graph. */

import { isActivatable, isActive, setActive } from "./activation.js";

/**
 * Propagate activation along signal wires each tick.
 * When source is active, dest gets activated; when source off, dest turns off
 * only if it was last driven by signal (plugin.signalDriven).
 */
export function tickSignalWires(wires, dt) {
  for (const w of wires) {
    const src = w.bodyA;
    const dst = w.bodyB;
    if (!src?.plugin || !dst?.plugin) continue;
    const on = isActive(src) || !!src.plugin.sensorTripped || !!src.plugin.buttonPressed;
    if (on) {
      if (isActivatable(dst) || dst.plugin.activatable) {
        setActive(dst, true);
        dst.plugin.signalDriven = true;
      }
    } else if (dst.plugin.signalDriven) {
      setActive(dst, false);
      dst.plugin.signalDriven = false;
    }
  }
}

/** Motion / proximity sensors pulse when something is nearby. */
export function tickSensors(bodies, dt, particles = null) {
  for (const b of bodies) {
    const pl = b.plugin;
    if (!pl) continue;

    if (pl.draw === "sensor") {
      pl.sensorTripped = false;
      const range = pl.sensorRange || 90;
      for (const other of bodies) {
        if (other === b || other.isStatic) continue;
        if (other.plugin?.waterZone || other.plugin?.lavaZone || other.plugin?.acidZone) continue;
        const d = Math.hypot(other.position.x - b.position.x, other.position.y - b.position.y);
        if (d < range) {
          pl.sensorTripped = true;
          if (!pl.active) setActive(b, true);
          break;
        }
      }
      if (!pl.sensorTripped && pl.signalOnly) {
        setActive(b, false);
      }
      if (pl.sensorTripped && particles && Math.random() < 0.15) {
        particles.burst?.(b.position.x, b.position.y - 10, "#9dff90", 2, 1);
      }
    }

    if (pl.draw === "button") {
      // Decay press; collisions set buttonPressed
      if (pl.buttonPressed) {
        pl.buttonTimer = (pl.buttonTimer || 0) - dt;
        if (pl.buttonTimer <= 0) {
          pl.buttonPressed = false;
          if (pl.signalOnly) setActive(b, false);
        }
      }
    }

    if (pl.draw === "toggle") {
      // sticky activatable — no auto behavior
    }
  }
}

export function pressButton(body) {
  if (!body?.plugin || body.plugin.draw !== "button") return false;
  body.plugin.buttonPressed = true;
  body.plugin.buttonTimer = 0.35;
  setActive(body, true);
  return true;
}

export function onWiringCollision(bodyA, bodyB) {
  for (const [btn, other] of [
    [bodyA, bodyB],
    [bodyB, bodyA],
  ]) {
    if (btn.plugin?.draw === "button" && !other.isStatic) {
      pressButton(btn);
    }
  }
}
