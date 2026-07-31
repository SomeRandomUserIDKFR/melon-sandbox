/** Syringe effects for livings (Melon Sandbox style). */

import {
  damagePart,
  reconnectJoints,
  healBones,
  wakeLiving,
  restoreSkin,
  regrowMissingPart,
  ALL_PART_SLOTS,
  REGROW_ORDER,
  getConnectedCluster,
  isSeveredCluster,
  forkLivingFromLimb,
} from "./ragdoll.js";
import { healReviveLiquid, restoreJuice, syncLivingLiquid } from "./liquids.js";

const { Body, Composite } = Matter;

export const SYRINGES = {
  acid: {
    id: "acid",
    label: "Acid",
    color: "#b8e050",
    fluid: "#9ccc30",
    icon: "A",
    desc: "Decays flesh into skeleton",
  },
  heal: {
    id: "heal",
    label: "Heal",
    color: "#e06080",
    fluid: "#ff6a90",
    icon: "H",
    desc: "Revive / fix joints — does not restore juice",
  },
  regen: {
    id: "regen",
    label: "Regen",
    color: "#50c878",
    fluid: "#7dffb0",
    icon: "G",
    desc: "Restore juice + skin; severed limbs become new livings",
  },
  regrow: {
    id: "regrow",
    label: "Regrow",
    color: "#40a0e0",
    fluid: "#70d0ff",
    icon: "W",
    desc: "Rebuild body + restore juice; stump grows a new living",
  },
  frozen: {
    id: "frozen",
    label: "Ice",
    color: "#70c8f0",
    fluid: "#a8e4ff",
    icon: "I",
    desc: "Locks the living solid",
  },
  rage: {
    id: "rage",
    label: "Rage",
    color: "#d04030",
    fluid: "#ff5040",
    icon: "R",
    desc: "Violent thrashing",
  },
  heavy: {
    id: "heavy",
    label: "Heavy",
    color: "#6a6a70",
    fluid: "#909098",
    icon: "M",
    desc: "Massively increases weight",
  },
};

function partsOf(world, ragdollId) {
  return Composite.allBodies(world).filter((b) => b.plugin?.ragdollId === ragdollId);
}

function clearAcid(parts) {
  for (const p of parts) {
    if (!p.plugin) continue;
    if (p.plugin.effects) p.plugin.effects.acid = null;
    p.plugin.acidDecay = 0;
    p.plugin.forceUnconscious = false;
  }
}

function startBodyGrowth(parts, { duration = 14, fromLimb = false } = {}) {
  for (const p of parts) {
    if (!p.plugin) continue;
    if (!p.plugin.effects) p.plugin.effects = {};
    p.plugin.effects.regrow = { t: duration, timer: 0, fromLimb };
    p.plugin.effects.acid = null;
    p.plugin.conscious = true;
    p.plugin.forceUnconscious = false;
  }
}

/** Heal: joints, bones, revive. Does NOT restore juice — survive until juice drops again. */
function applyHeal(world, parts, particles) {
  clearAcid(parts);
  const fixedJoints = reconnectJoints(world, parts, 100);
  healBones(parts);
  wakeLiving(parts);
  healReviveLiquid(parts);

  for (const p of parts) {
    if (!p.plugin || p.plugin.state === "gone") continue;
    if (!p.plugin.effects) p.plugin.effects = {};
    p.plugin.effects.heal = { t: 1.2 };
    p.plugin.effects.rage = null;
    if (p.plugin.state === "skeleton") {
      p.plugin.hp = Math.max(p.plugin.hp, p.plugin.maxHp * 0.15);
    } else {
      p.plugin.hp = Math.min(p.plugin.maxHp, p.plugin.hp + p.plugin.maxHp * 0.2);
    }
  }

  const torso = parts.find((p) => p.plugin?.part === "torso");
  if (torso && fixedJoints > 0) {
    particles.burst(torso.position.x, torso.position.y, "#ff8aa8", 12, 4);
  }
}

/** Intact-body regen: heal + skin + restore juice. */
function applyRegenIntact(world, parts, particles) {
  applyHeal(world, parts, particles);
  restoreSkin(parts, { clearBruises: true, full: true });
  restoreJuice(parts, 0.45);
  for (const p of parts) {
    if (!p.plugin || p.plugin.state === "gone") continue;
    if (!p.plugin.effects) p.plugin.effects = {};
    p.plugin.effects.regen = { t: 2.5 };
    p.plugin.effects.heal = { t: 1.5 };
  }
}

/**
 * Severed limb regen/regrow:
 * fork off original living → new id → grow a whole new body from the stump.
 */
function applyGrowthFromSeveredLimb(world, seedBody, particles, { duration = 16 } = {}) {
  const cluster = getConnectedCluster(world, seedBody);
  if (!isSeveredCluster(cluster)) return false;

  const forked = forkLivingFromLimb(world, seedBody);
  if (!forked) return false;

  const parts = forked.cluster;
  // Stabilize the stump itself
  for (const p of parts) {
    p.plugin.bruises = 0;
    p.plugin.acidDecay = 0;
    p.plugin.boneBroken = false;
    p.plugin.jointSprain = false;
    p.plugin.conscious = true;
    if (p.plugin.state === "skeleton" || p.plugin.state === "damaged") {
      p.plugin.state = "damaged";
      p.plugin.hp = Math.max(p.plugin.hp, p.plugin.maxHp * 0.55);
    }
  }

  startBodyGrowth(parts, { duration, fromLimb: true });
  syncLivingLiquid(parts, seedBody.plugin.fruit);
  restoreJuice(parts, 0.5);
  particles.burst(seedBody.position.x, seedBody.position.y, "#70d0ff", 22, 6);
  particles.burst(seedBody.position.x, seedBody.position.y, "#7dffb0", 14, 4);
  return true;
}

function applyRegrowIntact(world, parts, particles) {
  applyRegenIntact(world, parts, particles);
  restoreJuice(parts, 0.55);
  startBodyGrowth(parts, { duration: 14, fromLimb: false });
  const torso = parts.find((p) => p.plugin?.part === "torso");
  if (torso) particles.burst(torso.position.x, torso.position.y, "#70d0ff", 20, 5);
}

/** Inject a syringe effect only into the connected cluster of the hit part. */
export function injectSyringe(world, hitBody, syringeId, particles) {
  const def = SYRINGES[syringeId];
  if (!def || !hitBody?.plugin?.ragdollId) return false;

  // Effects never jump to severed / disconnected pieces
  const parts = getConnectedCluster(world, hitBody);
  if (!parts.length) return false;
  const severed = isSeveredCluster(parts);

  // Regen / Regrow on a severed limb → new living grown from that limb
  if ((syringeId === "regen" || syringeId === "regrow") && severed) {
    const dur = syringeId === "regen" ? 12 : 18;
    return applyGrowthFromSeveredLimb(world, hitBody, particles, { duration: dur });
  }

  const cx = hitBody.position.x;
  const cy = hitBody.position.y;
  particles.burst(cx, cy, def.fluid, 16, 5);
  particles.drip(cx, cy, def.color, 10);

  if (syringeId === "acid") {
    for (const p of parts) {
      if (!p.plugin) continue;
      if (!p.plugin.effects) p.plugin.effects = {};
      p.plugin.effects.acid = { t: 0, rate: 22 };
      p.plugin.effects.heal = null;
      p.plugin.effects.regen = null;
      p.plugin.effects.regrow = null;
      p.plugin.effects.frozen = null;
      p.plugin.conscious = false;
      p.plugin.forceUnconscious = true;
    }
  } else if (syringeId === "heal") {
    if (severed) {
      clearAcid(parts);
      healBones(parts);
      wakeLiving(parts);
      healReviveLiquid(parts);
      reconnectJoints(world, parts, 80);
      for (const p of parts) {
        if (!p.plugin.effects) p.plugin.effects = {};
        p.plugin.effects.heal = { t: 1.2 };
      }
    } else {
      applyHeal(world, parts, particles);
    }
  } else if (syringeId === "regen") {
    applyRegenIntact(world, parts, particles);
  } else if (syringeId === "regrow") {
    applyRegrowIntact(world, parts, particles);
  } else if (syringeId === "frozen") {
    for (const p of parts) {
      if (!p.plugin) continue;
      if (!p.plugin.effects) p.plugin.effects = {};
      p.plugin.effects.frozen = { t: 6 };
      p.plugin.effects.rage = null;
      Body.setStatic(p, true);
      p.plugin.frozen = true;
    }
  } else if (syringeId === "rage") {
    for (const p of parts) {
      if (!p.plugin) continue;
      if (!p.plugin.effects) p.plugin.effects = {};
      p.plugin.effects.rage = { t: 8 };
      p.plugin.effects.frozen = null;
      p.plugin.conscious = true;
      if (p.isStatic && p.plugin.frozen) {
        Body.setStatic(p, false);
        p.plugin.frozen = false;
      }
    }
  } else if (syringeId === "heavy") {
    for (const p of parts) {
      if (!p.plugin) continue;
      if (!p.plugin.effects) p.plugin.effects = {};
      p.plugin.effects.heavy = { t: 12, applied: false };
      if (!p.plugin._baseDensity) p.plugin._baseDensity = p.density;
      Body.set(p, { density: p.plugin._baseDensity * 4.5 });
      p.plugin.effects.heavy.applied = true;
    }
  }

  return true;
}

function pulseRegrow(world, rid, particles, fromLimb) {
  let live = partsOf(world, rid);
  reconnectJoints(world, live, fromLimb ? 150 : 120);
  restoreSkin(live, { clearBruises: true, full: false });
  live = partsOf(world, rid);

  const present = new Set(
    live.filter((p) => p.plugin.state !== "gone").map((p) => p.plugin.partSlot)
  );

  const order = fromLimb ? REGROW_ORDER : ALL_PART_SLOTS.filter((s) => s !== "torso");
  for (const slot of order) {
    if (present.has(slot)) continue;
    const grown = regrowMissingPart(world, live, slot);
    if (grown) {
      particles.burst(grown.position.x, grown.position.y, "#70d0ff", 10, 4);
      reconnectJoints(world, partsOf(world, rid), 160);
      break; // one part per pulse
    }
  }

  for (const p of partsOf(world, rid)) {
    if (!p.plugin || p.plugin.state === "gone") continue;
    p.plugin.hp = Math.min(p.plugin.maxHp, p.plugin.hp + p.plugin.maxHp * 0.12);
    p.plugin.bruises = Math.max(0, (p.plugin.bruises || 0) - 0.2);
    p.plugin.acidDecay = Math.max(0, (p.plugin.acidDecay || 0) - 0.25);
    if (p.plugin.state === "skeleton" || p.plugin.state === "damaged") {
      p.plugin.state = p.plugin.hp >= p.plugin.maxHp * 0.85 ? "alive" : "damaged";
    }
    p.plugin.boneBroken = false;
    p.plugin.jointSprain = false;
    p.plugin.seedLimb = false;
    if (Math.random() < 0.35) {
      particles.drip(p.position.x, p.position.y, "#70d0ff", 1);
    }
  }
  const liveParts = partsOf(world, rid);
  syncLivingLiquid(liveParts, liveParts[0]?.plugin?.fruit);
  restoreJuice(liveParts, 0.08);
}

/** Per-frame syringe effect processing. */
export function tickSyringeEffects(world, bodies, dt, particles) {
  const byId = new Map();
  for (const b of bodies) {
    if (!b.plugin?.fruit) continue;
    const rid = b.plugin.ragdollId;
    if (!rid) continue;
    if (!byId.has(rid)) byId.set(rid, []);
    byId.get(rid).push(b);
  }

  for (const [rid, parts] of byId.entries()) {
    const driver =
      parts.find((p) => p.plugin?.effects?.regrow) ||
      parts.find((p) => p.plugin?.partSlot === "torso") ||
      parts[0];
    const regrowFx = driver?.plugin?.effects?.regrow;
    if (!regrowFx) continue;

    regrowFx.t -= dt;
    regrowFx.timer = (regrowFx.timer || 0) + dt;

    if (regrowFx.timer > 0.4) {
      regrowFx.timer = 0;
      pulseRegrow(world, rid, particles, !!regrowFx.fromLimb);
      // Keep effect object synced onto all current parts
      for (const p of partsOf(world, rid)) {
        if (!p.plugin.effects) p.plugin.effects = {};
        p.plugin.effects.regrow = regrowFx;
      }
    }

    if (regrowFx.t <= 0) {
      for (const p of partsOf(world, rid)) {
        if (p.plugin?.effects) p.plugin.effects.regrow = null;
      }
      restoreSkin(partsOf(world, rid), { clearBruises: true, full: true });
      reconnectJoints(world, partsOf(world, rid), 180);
      wakeLiving(partsOf(world, rid));
    }
  }

  for (const b of bodies) {
    const pl = b.plugin;
    if (!pl?.fruit || !pl.effects) continue;
    const fx = pl.effects;

    if (fx.acid) {
      fx.acid.t += dt;
      const dmg = fx.acid.rate * dt;
      if (pl.state !== "skeleton" && pl.state !== "gone") {
        pl.acidDecay = Math.min(1, (pl.acidDecay || 0) + dt * 0.28);
        const result = damagePart(b, dmg, particles, b.position, { silent: true });
        if (pl.juiceCooldown <= 0) {
          particles.drip(b.position.x, b.position.y, "#c8e060", 3);
          particles.drip(b.position.x, b.position.y, "#6a9020", 2);
          pl.juiceCooldown = 0.08;
        }
        if (result === "burst" || pl.state === "skeleton") {
          pl.acidDecay = 1;
          if (fx.acid.t > 5) {
            fx.acid = null;
            pl.forceUnconscious = false;
          }
        }
      } else {
        fx.acid = null;
        pl.forceUnconscious = false;
      }
    }

    if (fx.heal) {
      fx.heal.t -= dt;
      if (fx.heal.t <= 0) fx.heal = null;
      else if (Math.random() < 0.25) {
        particles.drip(b.position.x, b.position.y, "#ff8aa8", 1);
      }
    }

    if (fx.regen) {
      fx.regen.t -= dt;
      pl.bruises = Math.max(0, (pl.bruises || 0) - dt * 0.5);
      pl.acidDecay = Math.max(0, (pl.acidDecay || 0) - dt * 0.4);
      // Only the torso (or first part) tops up the shared vessel
      if (pl.liquid && (pl.part === "torso" || pl.partSlot === "torso")) {
        pl.liquid.amount = Math.min(
          pl.liquid.capacity,
          pl.liquid.amount + pl.liquid.capacity * 0.12 * dt
        );
        pl.liquid.surviveUntilBelow = null;
      }
      if (pl.state === "damaged" && pl.hp < pl.maxHp) {
        pl.hp = Math.min(pl.maxHp, pl.hp + pl.maxHp * 0.15 * dt);
        if (pl.hp >= pl.maxHp * 0.95) pl.state = "alive";
      }
      if (fx.regen.t <= 0) fx.regen = null;
      else if (Math.random() < 0.3) {
        particles.drip(b.position.x, b.position.y, "#7dffb0", 1);
      }
    }

    if (fx.frozen) {
      fx.frozen.t -= dt;
      if (fx.frozen.t <= 0) {
        fx.frozen = null;
        Body.setStatic(b, false);
        pl.frozen = false;
        particles.burst(b.position.x, b.position.y, "#a8e4ff", 8, 3);
      } else if (Math.random() < 0.15) {
        particles.drip(b.position.x, b.position.y, "#c8f0ff", 1);
      }
    }

    if (fx.rage) {
      fx.rage.t -= dt;
      if (fx.rage.t <= 0) {
        fx.rage = null;
      } else {
        b.torque += (Math.random() - 0.5) * 0.08;
        Body.applyForce(b, b.position, {
          x: (Math.random() - 0.5) * 0.004,
          y: (Math.random() - 0.5) * 0.003,
        });
        if (Math.random() < 0.2) {
          particles.drip(b.position.x, b.position.y, "#ff5040", 1);
        }
      }
    }

    if (fx.heavy) {
      fx.heavy.t -= dt;
      if (fx.heavy.t <= 0) {
        if (pl._baseDensity) Body.set(b, { density: pl._baseDensity });
        fx.heavy = null;
      }
    }
  }
}
