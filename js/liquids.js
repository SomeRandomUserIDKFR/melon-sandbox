/** Shared liquid / juice system for livings and syringes. */

const { Composite } = Matter;

/** Living dies (unconscious) when juice falls below this % of capacity. */
export const JUICE_DEATH_THRESHOLD = 0.2; // 20%

export const DEFAULT_JUICE_CAPACITY = 100;

/**
 * Create a liquid vessel object.
 * @param {{ type: string, amount: number, capacity: number, color: string }} opts
 */
export function createVessel({ type = "juice", amount = 100, capacity = 100, color = "#b8e86a" } = {}) {
  return {
    type,
    amount: Math.max(0, Math.min(capacity, amount)),
    capacity,
    color,
    /** After Heal: stay conscious until juice drops below this watermark. */
    surviveUntilBelow: null,
  };
}

export function juiceFill(vessel) {
  if (!vessel || !vessel.capacity) return 0;
  return vessel.amount / vessel.capacity;
}

export function juicePercent(vessel) {
  return Math.round(juiceFill(vessel) * 100);
}

/** Shared vessel for every part in a living cluster. */
export function initLivingLiquid(parts, fruit) {
  const amount = 78 + Math.random() * 18; // ~78–96 juice
  const vessel = createVessel({
    type: "juice",
    amount,
    capacity: DEFAULT_JUICE_CAPACITY,
    color: fruit?.juice || "#b8e86a",
  });
  for (const p of parts) {
    if (p.plugin) p.plugin.liquid = vessel;
  }
  return vessel;
}

/** Ensure a cluster shares one vessel (after fork / regrow). */
export function syncLivingLiquid(parts, fruit) {
  let vessel = parts.find((p) => p.plugin?.liquid)?.plugin.liquid;
  if (!vessel) {
    vessel = initLivingLiquid(parts, fruit || parts[0]?.plugin?.fruit);
  } else {
    for (const p of parts) {
      if (p.plugin) p.plugin.liquid = vessel;
    }
  }
  return vessel;
}

export function getVessel(body) {
  return body?.plugin?.liquid || null;
}

/** Ensure a syringe has a liquid vessel (serum when full, empty when used / drained). */
export function ensureSyringeVessel(body) {
  if (!body?.plugin) return null;
  if (body.plugin.syringe == null && body.plugin.draw !== "syringe") return null;
  if (body.plugin.liquid) return body.plugin.liquid;

  const used = !!body.plugin.used;
  const vessel = createVessel({
    type: used ? "empty" : body.plugin.syringe || "serum",
    amount: used ? 0 : 40,
    capacity: 40,
    color: used ? "#c8c8c8" : body.plugin.fluid || body.plugin.color || "#a0d0ff",
  });
  body.plugin.liquid = vessel;
  return vessel;
}

/** Empty syringe contents after injection (becomes a refillable vessel). */
export function drainSyringeVessel(body) {
  const v = ensureSyringeVessel(body);
  if (!v) return;
  v.amount = 0;
  v.type = "empty";
  v.color = "#c8c8c8";
}

/** True if body can be a pipe endpoint (living, syringe, or liquid container). */
export function isLiquidTarget(body) {
  if (!body?.plugin) return false;
  if (body.plugin.liquid) return true;
  if (body.plugin.syringe != null || body.plugin.draw === "syringe") {
    ensureSyringeVessel(body);
    return true;
  }
  return false;
}

/** Get vessel for any liquid target, creating syringe vessels on demand. */
export function getOrCreateVessel(body) {
  if (!body?.plugin) return null;
  if (body.plugin.liquid) return body.plugin.liquid;
  return ensureSyringeVessel(body);
}

/**
 * Lose juice from a living vessel (damage / bleed).
 * Returns amount actually lost.
 */
export function loseJuice(vessel, amount, particles, at = null) {
  if (!vessel || amount <= 0) return 0;
  const before = vessel.amount;
  vessel.amount = Math.max(0, vessel.amount - amount);
  const lost = before - vessel.amount;
  if (lost > 0.05 && particles && at) {
    const n = Math.min(14, 2 + Math.floor(lost / 3));
    particles.burst(at.x, at.y, vessel.color, n, 3 + lost * 0.15);
    particles.drip(at.x, at.y, vessel.color, Math.min(8, n));
  }
  return lost;
}

/** Add liquid into a vessel (same type preferred; juice can dilute/replace empty). */
export function addLiquid(vessel, amount, type = null, color = null) {
  if (!vessel || amount <= 0) return 0;
  const space = vessel.capacity - vessel.amount;
  if (space <= 0) return 0;

  // Empty vessel takes whatever type
  if (vessel.amount <= 0.01 && type) {
    vessel.type = type;
    if (color) vessel.color = color;
  }

  // Mixing different types: only allow if dest nearly empty
  if (type && vessel.type && type !== vessel.type && vessel.amount > 1) {
    return 0;
  }
  if (type) vessel.type = type;
  if (color && vessel.amount < 1) vessel.color = color;

  const add = Math.min(space, amount);
  vessel.amount += add;
  return add;
}

/**
 * Transfer liquid from source vessel → dest vessel.
 * Pipes use force=true so juice ↔ syringe serums can move freely
 * (dest type/color become the flowing liquid).
 * Returns amount moved.
 */
export function transferLiquid(
  source,
  dest,
  amount,
  particles = null,
  fromPos = null,
  toPos = null,
  { force = false } = {}
) {
  if (!source || !dest || amount <= 0) return 0;
  if (source === dest) return 0;
  const available = source.amount;
  if (available <= 0) return 0;

  const want = Math.min(amount, available);
  const space = dest.capacity - dest.amount;
  if (space <= 0) return 0;

  const destEmpty = dest.amount <= 0.01 || dest.type === "empty";
  const sameType = dest.type === source.type;
  if (!force && !destEmpty && !sameType) return 0;

  const add = Math.min(want, space);
  source.amount -= add;

  if (destEmpty || force) {
    dest.type = source.type;
    dest.color = source.color;
  }
  dest.amount += add;

  if (add > 0 && particles) {
    if (fromPos) particles.drip(fromPos.x, fromPos.y, source.color || dest.color, 2);
    if (toPos) particles.drip(toPos.x, toPos.y, dest.color || source.color, 2);
  }
  // Filling past a Heal watermark clears the “survive until drop” rule
  if (add > 0 && dest.surviveUntilBelow != null && dest.amount > dest.surviveUntilBelow + 0.5) {
    dest.surviveUntilBelow = null;
  }
  return add;
}

/**
 * Tick liquid transfer pipes.
 * Each pipe: { bodyA, bodyB, rate } — flow A → B.
 */
export function tickPipes(pipes, world, dt, particles) {
  const bodies = Composite.allBodies(world);
  const bodySet = new Set(bodies);
  for (let i = pipes.length - 1; i >= 0; i--) {
    const pipe = pipes[i];
    const a = pipe.bodyA;
    const b = pipe.bodyB;
    if (!a || !b || !bodySet.has(a) || !bodySet.has(b)) {
      if (pipe.constraint) Composite.remove(world, pipe.constraint);
      pipes.splice(i, 1);
      continue;
    }
    const src = getOrCreateVessel(a);
    const dst = getOrCreateVessel(b);
    if (!src || !dst) continue;

    const rate = pipe.rate ?? 18;
    const moved = transferLiquid(src, dst, rate * dt, particles, a.position, b.position, {
      force: true,
    });
    if (moved > 0) {
      syncSyringeFromVessel(a);
      syncSyringeFromVessel(b);
      if (a.plugin?.ragdollId) {
        const parts = bodies.filter((p) => p.plugin?.ragdollId === a.plugin.ragdollId);
        applyJuiceConsciousness(parts);
      }
      if (b.plugin?.ragdollId) {
        const parts = bodies.filter((p) => p.plugin?.ragdollId === b.plugin.ragdollId);
        applyJuiceConsciousness(parts);
      }
    }
  }
}

/** Keep syringe used/fluid/effect id in sync with its vessel. */
export function syncSyringeFromVessel(body) {
  if (!body?.plugin || body.plugin.draw !== "syringe") return;
  const v = body.plugin.liquid;
  if (!v) return;
  body.plugin.fluid = v.amount > 0.5 ? v.color : "#c8c8c8";
  body.plugin.used = v.amount <= 0.5;
  // If vessel holds a known syringe serum, restore that identity; juice = inert fill
  if (v.amount > 0.5 && v.type && v.type !== "empty" && v.type !== "juice") {
    body.plugin.syringe = v.type;
  }
}

/**
 * Apply consciousness from juice level.
 * Heal sets surviveUntilBelow so they stay up until juice drops again.
 */
export function applyJuiceConsciousness(parts) {
  if (!parts?.length) return;
  const vessel = parts[0]?.plugin?.liquid;
  if (!vessel) return;

  // Acid / forced KO / active shock must not be overwritten by juice fill
  if (parts.some((p) => p.plugin?.effects?.acid || p.plugin?.forceUnconscious || p.plugin?.shock)) {
    for (const p of parts) {
      if (!p.plugin || p.plugin.state === "gone") continue;
      p.plugin.conscious = false;
    }
    return;
  }

  const fill = juiceFill(vessel);
  const floor = vessel.surviveUntilBelow;

  let conscious;
  if (floor != null) {
    // Revived by Heal: stay up until juice falls below the watermark
    conscious = vessel.amount + 0.05 >= floor;
    if (!conscious) vessel.surviveUntilBelow = null;
  } else {
    conscious = fill >= JUICE_DEATH_THRESHOLD;
  }

  for (const p of parts) {
    if (!p.plugin || p.plugin.state === "gone") continue;
    p.plugin.conscious = conscious;
  }
}

/** Heal revive: wake without restoring juice; survive until juice drops. */
export function healReviveLiquid(parts) {
  const vessel = parts[0]?.plugin?.liquid;
  if (!vessel) {
    for (const p of parts) {
      if (p.plugin) p.plugin.conscious = true;
    }
    return;
  }
  vessel.surviveUntilBelow = vessel.amount;
  for (const p of parts) {
    if (!p.plugin || p.plugin.state === "gone") continue;
    p.plugin.forceUnconscious = false;
    p.plugin.conscious = true;
  }
}

/** Regen / Regrow: restore juice toward full. */
export function restoreJuice(parts, fraction = 0.35) {
  const vessel = syncLivingLiquid(parts, parts[0]?.plugin?.fruit);
  const add = vessel.capacity * fraction;
  addLiquid(vessel, add, "juice", parts[0]?.plugin?.fruit?.juice || vessel.color);
  vessel.surviveUntilBelow = null;
  applyJuiceConsciousness(parts);
  return vessel;
}

/** Create a standalone liquid container (barrel / tank). */
export function createContainerVessel({ amount = 80, capacity = 120, color = "#b8e86a", type = "juice" } = {}) {
  return createVessel({ type, amount, capacity, color });
}

/** Tick all living liquids in the world. */
export function tickLiquids(world, dt, particles) {
  const seen = new Set();
  for (const b of Composite.allBodies(world)) {
    const v = b.plugin?.liquid;
    if (!v || !b.plugin?.ragdollId || !b.plugin?.isLiving) continue;
    if (seen.has(v)) continue;
    seen.add(v);

    const rid = b.plugin.ragdollId;
    const parts = Composite.allBodies(world).filter((p) => p.plugin?.ragdollId === rid);
    // Tiny passive drip when heavily damaged / skeleton
    const torso = parts.find((p) => p.plugin?.part === "torso") || b;
    if (torso.plugin?.state === "skeleton" && v.amount > 0) {
      loseJuice(v, 1.2 * dt, particles, torso.position);
    } else if (torso.plugin?.state === "damaged" && v.amount > 0) {
      loseJuice(v, 0.35 * dt, particles, torso.position);
    }

    applyJuiceConsciousness(parts);
  }
}
