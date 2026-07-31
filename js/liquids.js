/** Shared liquid / juice system for livings and syringes. */

const { Composite } = Matter;

/** Living dies (unconscious) when juice falls below this % of capacity. */
export const JUICE_DEATH_THRESHOLD = 0.2; // 20%

/** Natural skin heal / clotting starts after juice stays at or above this fill. */
export const NATURAL_REGEN_MIN = 0.9;
/** Seconds of continuous high juice before regen begins. */
export const NATURAL_REGEN_SUSTAIN = 2;

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
  if (body.plugin) {
    body.plugin.extracting = false;
    body.plugin.extractRid = null;
  }
}

/** True if a syringe vessel is empty enough to start withdrawing juice. */
export function isSyringeEmpty(body) {
  const v = body?.plugin?.liquid;
  if (!v) return !!body?.plugin?.used;
  return v.amount <= 1 || v.type === "empty";
}

/**
 * While an empty syringe is stabbed into a living, suck juice into it.
 * Instant fill-to-capacity on pierce (see main collision); this tick only
 * keeps a pierced syringe topped up if still embedded and not full yet.
 */
export function tickSyringeExtraction(world, bodies, dt, particles) {
  const REACH = 42;

  for (const syringe of bodies) {
    const pl = syringe.plugin;
    if (!pl || pl.draw !== "syringe" || !pl.extracting) continue;

    ensureSyringeVessel(syringe);
    const dest = pl.liquid;
    if (!dest) {
      pl.extracting = false;
      continue;
    }

    // Already full — stop
    if (dest.amount >= dest.capacity - 0.05) {
      dest.amount = dest.capacity;
      dest.type = "juice";
      pl.extracting = false;
      pl.extractRid = null;
      pl.piercedLiving = null;
      syncSyringeFromVessel(syringe);
      continue;
    }

    // Don't overwrite an active serum fill
    if (dest.amount > 1 && dest.type !== "juice" && dest.type !== "empty") {
      pl.extracting = false;
      pl.extractRid = null;
      continue;
    }

    let best = null;
    let bestDist = REACH;
    for (const b of bodies) {
      if (!b.plugin?.fruit || b.plugin.state === "gone") continue;
      if (pl.extractRid && b.plugin.ragdollId !== pl.extractRid) continue;
      const d = Math.hypot(b.position.x - syringe.position.x, b.position.y - syringe.position.y);
      if (d < bestDist) {
        bestDist = d;
        best = b;
      }
    }

    if (!best) {
      pl.extracting = false;
      pl.extractRid = null;
      pl.piercedLiving = null;
      continue;
    }

    // Instant draw to full capacity
    const src = getOrCreateVessel(best) || best.plugin.liquid;
    if (!src || src.amount <= 0.05) {
      pl.extracting = false;
      continue;
    }

    const need = dest.capacity - dest.amount;
    const moved = transferLiquid(src, dest, need, particles, best.position, syringe.position, {
      force: true,
    });
    if (moved > 0) {
      dest.type = "juice";
      dest.color = src.color || dest.color;
      dest.amount = Math.min(dest.capacity, dest.amount);
      pl.extractRid = best.plugin.ragdollId;
      syncSyringeFromVessel(syringe);
      const parts = bodies.filter((p) => p.plugin?.ragdollId === best.plugin.ragdollId);
      applyJuiceConsciousness(parts);
      if (particles) {
        particles.burst(best.position.x, best.position.y, dest.color, 10, 4);
        particles.drip(best.position.x, best.position.y, dest.color, 4);
      }
    }

    pl.extracting = false;
    pl.extractRid = null;
    pl.piercedLiving = null;
  }
}

/** Tick wound bleed — sharp pierce drips juice over a short time. */
export function tickBleed(world, bodies, dt, particles) {
  const seen = new Set();
  for (const b of bodies) {
    const pl = b.plugin;
    if (!pl?.bleed || !pl.fruit) continue;
    const vessel = pl.liquid;
    if (!vessel) {
      pl.bleed = null;
      continue;
    }
    // One bleed drain per shared vessel per frame
    const key = pl.ragdollId || b.id;
    pl.bleed.t -= dt;
    if (pl.bleed.t <= 0) {
      pl.bleed = null;
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);

    const lost = loseJuice(vessel, pl.bleed.rate * dt, particles, b.position);
    if (lost > 0 && particles && Math.random() < 0.25) {
      particles.drip(b.position.x, b.position.y, vessel.color, 1);
    }
    const parts = bodies.filter((p) => p.plugin?.ragdollId === pl.ragdollId);
    applyJuiceConsciousness(parts);
  }
}

/**
 * Passive recovery:
 * - Natural: juice ≥90% sustained → slow skin heal + bleed clotting (1×–1.5×)
 * - passiveStrong syringe: permanent 8× heal + limb/bone regrow
 * - passiveWeak syringe: permanent 4× skin/clot (no limbs/bones)
 */
export function tickNaturalRegen(bodies, dt, particles = null) {
  const byRid = new Map();
  for (const b of bodies) {
    const pl = b.plugin;
    if (!pl?.fruit || pl.state === "gone") continue;
    const rid = pl.ragdollId || b.id;
    if (!byRid.has(rid)) byRid.set(rid, []);
    byRid.get(rid).push(b);
  }

  for (const parts of byRid.values()) {
    const vessel = parts.find((p) => p.plugin?.liquid)?.plugin?.liquid;
    const hasStrong = parts.some((p) => p.plugin?.effects?.passiveStrong);
    const hasWeak = parts.some((p) => p.plugin?.effects?.passiveWeak);

    let rateMul = 0;
    let healSkeleton = false;

    if (hasStrong) {
      rateMul = 8;
      healSkeleton = true;
    } else if (hasWeak) {
      rateMul = 4;
    } else if (vessel && vessel.type === "juice") {
      const fill = juiceFill(vessel);
      if (fill < NATURAL_REGEN_MIN) {
        vessel.highJuiceT = 0;
        continue;
      }
      vessel.highJuiceT = (vessel.highJuiceT || 0) + dt;
      if (vessel.highJuiceT < NATURAL_REGEN_SUSTAIN) continue;
      const band = Math.min(1, (fill - NATURAL_REGEN_MIN) / (1 - NATURAL_REGEN_MIN));
      rateMul = 1 + 0.5 * band;
    } else {
      continue;
    }

    if (rateMul <= 0) continue;

    // Base @1×: bruise ~28s to clear; flesh ~1.2%/s; clot tapers slowly
    const bruiseRate = 0.035 * rateMul;
    const hpRate = 0.012 * rateMul;

    for (const b of parts) {
      const pl = b.plugin;
      if (!pl || pl.state === "gone") continue;
      if (pl.state === "skeleton" && !healSkeleton) continue;

      pl.bruises = Math.max(0, (pl.bruises || 0) - bruiseRate * dt);

      if (pl.state === "skeleton" && healSkeleton) {
        // Repair bone pool, then rebuild flesh over time
        pl.hp = Math.min(pl.maxHp, pl.hp + pl.maxHp * hpRate * dt);
        if (pl.hp >= pl.maxHp * 0.55) pl.boneBroken = false;
        pl._fleshRegen = (pl._fleshRegen || 0) + hpRate * 0.55 * dt;
        if (pl._fleshRegen >= 1) {
          const fleshCap = pl.fleshMaxHp || fleshHpFallback(pl.part);
          pl.maxHp = fleshCap;
          pl.hp = fleshCap * 0.55;
          pl.state = "damaged";
          pl.fleshMaxHp = null;
          pl._fleshRegen = 0;
          pl.boneBroken = false;
          pl.jointSprain = false;
        }
      } else if ((pl.state === "alive" || pl.state === "damaged") && pl.hp < pl.maxHp) {
        pl.hp = Math.min(pl.maxHp, pl.hp + pl.maxHp * hpRate * dt);
      }

      if (
        pl.state === "damaged" &&
        pl.hp >= pl.maxHp * 0.92 &&
        (pl.bruises || 0) < 0.12
      ) {
        pl.state = "alive";
      }

      if (pl.bleed) {
        pl.bleed.rate = Math.max(0, pl.bleed.rate - 1.05 * rateMul * dt);
        pl.bleed.t -= 0.5 * rateMul * dt;
        if (pl.bleed.rate < 0.35 || pl.bleed.t <= 0) pl.bleed = null;
      }
    }

    if (particles && Math.random() < 0.035 * Math.min(rateMul, 4)) {
      const torso =
        parts.find((p) => p.plugin?.partSlot === "torso" || p.plugin?.part === "torso") ||
        parts[0];
      const col = hasStrong
        ? "#90e0c0"
        : hasWeak
          ? "#70d090"
          : vessel?.color || "#c8e878";
      if (torso) particles.drip(torso.position.x, torso.position.y, col, 1);
    }
  }
}

function fleshHpFallback(part) {
  if (part === "torso") return 100;
  if (part === "head") return 55;
  return 40;
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
  if (vessel.preserve) amount *= 0.08;
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

/** Parse #rgb / #rrggbb → [r,g,b]. */
export function parseHexColor(hex) {
  if (!hex || typeof hex !== "string") return [180, 200, 100];
  let h = hex.trim().replace("#", "");
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  if (h.length !== 6) return [180, 200, 100];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function toHexColor(r, g, b) {
  const c = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Weighted mix of two colors by liquid amounts. */
export function mixHexColors(colorA, amountA, colorB, amountB) {
  const a = Math.max(0, amountA);
  const b = Math.max(0, amountB);
  const t = a + b;
  if (t <= 0) return colorB || colorA || "#b8e86a";
  if (a <= 0) return colorB || colorA;
  if (b <= 0) return colorA || colorB;
  const [r1, g1, b1] = parseHexColor(colorA);
  const [r2, g2, b2] = parseHexColor(colorB);
  return toHexColor((r1 * a + r2 * b) / t, (g1 * a + g2 * b) / t, (b1 * a + b2 * b) / t);
}

/** Types that blend together instead of rejecting. */
export function canMixLiquidTypes(a, b) {
  if (!a || !b || a === "empty" || b === "empty") return true;
  if (a === b) return true;
  const juicey = (t) => t === "juice" || t === "juiceMix";
  if (juicey(a) && juicey(b)) return true;
  const melts = new Set(["boneMelt", "crystalMelt", "hybridMelt"]);
  if (melts.has(a) && melts.has(b)) return true;
  return false;
}

export function mergeLiquidType(a, b) {
  if (!a || a === "empty") return b;
  if (!b || b === "empty") return a;
  if (a === b) return a;
  if ((a === "juice" || a === "juiceMix") && (b === "juice" || b === "juiceMix")) return "juice";
  const melts = new Set(["boneMelt", "crystalMelt", "hybridMelt"]);
  if (melts.has(a) && melts.has(b)) {
    if (a === "hybridMelt" || b === "hybridMelt") return "hybridMelt";
    if (a !== b) return "hybridMelt";
  }
  return b || a;
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

  // Mixing: allow juice↔juice and melt↔melt with color blend
  if (type && vessel.type && type !== vessel.type && vessel.amount > 1) {
    if (!canMixLiquidTypes(vessel.type, type)) return 0;
    vessel.type = mergeLiquidType(vessel.type, type);
  } else if (type) {
    vessel.type = vessel.amount <= 0.01 ? type : mergeLiquidType(vessel.type, type);
  }

  const before = vessel.amount;
  const add = Math.min(space, amount);
  vessel.amount += add;
  if (color && add > 0) {
    vessel.color = mixHexColors(vessel.color || color, before, color, add);
  }
  // Optional 5th arg / opts: { fromShard: true } via color-null pattern — use mark below in callers
  if (vessel.amount < 0.5) vessel.fromShard = false;
  return add;
}

/** Mark vessel contents as coming from smelted juice shards. */
export function markFromShard(vessel, on = true) {
  if (!vessel) return;
  vessel.fromShard = !!on && vessel.amount > 0.5;
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
  const mixable = canMixLiquidTypes(dest.type, source.type);
  if (!force && !destEmpty && !sameType && !mixable) return 0;

  const add = Math.min(want, space);
  const destBefore = dest.amount;
  source.amount -= add;

  if (destEmpty) {
    dest.type = source.type;
    dest.color = source.color;
    dest.amount += add;
    dest.fromShard = !!source.fromShard;
  } else if (force && !mixable) {
    dest.type = source.type;
    dest.color = source.color;
    dest.amount += add;
    dest.fromShard = !!source.fromShard;
  } else {
    dest.type = mergeLiquidType(dest.type, source.type);
    dest.color = mixHexColors(dest.color || source.color, destBefore, source.color || dest.color, add);
    dest.amount += add;
    // Crystal/hybrid melt keeps shard provenance if either side was smelted
    if (source.fromShard) dest.fromShard = true;
  }

  if (source.amount < 0.5) {
    source.amount = 0;
    if (source.type === "crystalMelt" || source.type === "hybridMelt") source.fromShard = false;
  }
  if (dest.amount < 0.5) {
    dest.fromShard = false;
  }

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
