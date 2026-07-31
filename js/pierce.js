/** Tip-first pierce checks for swords, spikes, syringes, etc. */

/**
 * World-space tip direction for a piercing body.
 * tipAxis: -1 = local -Y (sword tip), +1 = local +Y (syringe needle).
 */
export function tipDirection(body) {
  const axis = body.plugin?.tipAxis ?? -1;
  const a = body.angle + (axis > 0 ? Math.PI / 2 : -Math.PI / 2);
  return { x: Math.cos(a), y: Math.sin(a) };
}

/** Tip world position near the end of the blade/needle. */
export function tipWorldPoint(body) {
  const dir = tipDirection(body);
  const len = body.plugin?.tipLength ?? tipLengthGuess(body);
  return {
    x: body.position.x + dir.x * len,
    y: body.position.y + dir.y * len,
  };
}

function tipLengthGuess(body) {
  const bw = body.bounds.max.x - body.bounds.min.x;
  const bh = body.bounds.max.y - body.bounds.min.y;
  return Math.max(bw, bh) * 0.45;
}

/**
 * True when the tip is oriented into the target.
 * minSpeed ~0 allows light presses / resting stabs (needles & points).
 * @returns {{ pierced: boolean, approach: number, tipDot: number, tip: {x,y} }}
 */
export function checkPierce(weapon, target, { minSpeed = 0.08, minAim = 0.22 } = {}) {
  if (!weapon || !target) return { pierced: false, approach: 0, tipDot: 0, tip: null };

  const dir = tipDirection(weapon);
  const tip = tipWorldPoint(weapon);

  const dx = target.position.x - tip.x;
  const dy = target.position.y - tip.y;
  const dist = Math.hypot(dx, dy) || 1;
  const toTarget = { x: dx / dist, y: dy / dist };
  const tipDot = dir.x * toTarget.x + dir.y * toTarget.y;

  const rvx = (weapon.velocity?.x || 0) - (target.velocity?.x || 0);
  const rvy = (weapon.velocity?.y || 0) - (target.velocity?.y || 0);
  const approach = dir.x * rvx + dir.y * rvy;
  const relSpeed = Math.hypot(rvx, rvy);

  const tipNear =
    Math.hypot(tip.x - target.position.x, tip.y - target.position.y) <
    30 + Math.max(target.bounds.max.x - target.bounds.min.x, target.bounds.max.y - target.bounds.min.y) * 0.4;

  // Practically no force: tip aimed into flesh + contact is enough (tiny approach or any touch)
  const movingIn = approach >= minSpeed || (tipDot > 0.45 && relSpeed < 0.35);
  const pierced = tipNear && tipDot >= minAim && movingIn;
  return { pierced, approach, tipDot, tip };
}

export function isPiercingTool(body) {
  const pl = body?.plugin;
  if (!pl) return false;
  if (pl.pierce || pl.sharp) return true;
  if (pl.draw === "syringe") return true;
  return false;
}

/** Start a short juice bleed on a living part. */
export function startBleed(body, { duration = 2.2, rate = 3.5, amount = 0 } = {}) {
  if (!body?.plugin?.fruit) return;
  const pl = body.plugin;
  const existing = pl.bleed;
  if (existing) {
    existing.t = Math.max(existing.t, duration);
    existing.rate = Math.max(existing.rate, rate);
  } else {
    pl.bleed = { t: duration, rate };
  }
  // Immediate poke of juice if amount set
  return amount;
}
