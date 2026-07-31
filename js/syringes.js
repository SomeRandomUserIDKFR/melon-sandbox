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
  tickGrowingParts,
  poseStandingCluster,
  setRegrowHeld,
  nudgeClusterAwayFromRid,
  createFruitRagdoll,
  boneMaxHp,
  detachLimb,
  scaleBodyJointAnchors,
} from "./ragdoll.js";
import { healReviveLiquid, restoreJuice, syncLivingLiquid, loseJuice, addLiquid, ensureSyringeVessel, syncSyringeFromVessel } from "./liquids.js";
import { setLivingAI, clearLivingAI } from "./livingAI.js";
import { shock, ignite, extinguish } from "./elements.js";
import { BONE_MELT_COLOR, BONE_MELT_TYPE } from "./boneMachines.js";
import { markActivatable, setActive, isActivatable } from "./activation.js";

const { Body, Composite, Constraint, Query } = Matter;

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
  boneSoft: {
    id: "boneSoft",
    label: "Bone Soft",
    color: "#c4a878",
    fluid: "#e8d0a0",
    icon: "S",
    desc: "Weakens bones — skeletons shatter easier",
  },
  calcium: {
    id: "calcium",
    label: "Calcium",
    color: "#f0f0e8",
    fluid: "#fffff0",
    icon: "C",
    desc: "Hardens / repairs bones without restoring flesh",
  },
  juiceDrain: {
    id: "juiceDrain",
    label: "Drain",
    color: "#8a4060",
    fluid: "#c05070",
    icon: "D",
    desc: "Sucks juice out into the syringe",
  },
  float: {
    id: "float",
    label: "Helium",
    color: "#a0d8ff",
    fluid: "#c8ecff",
    icon: "↑",
    desc: "Makes the living floaty and light",
  },
  sleep: {
    id: "sleep",
    label: "Sleep",
    color: "#6a5a90",
    fluid: "#9a80c8",
    icon: "Z",
    desc: "Force KO without killing",
  },
  glue: {
    id: "glue",
    label: "Glue",
    color: "#c8a040",
    fluid: "#e0b850",
    icon: "U",
    desc: "Sticky — high friction and welds to nearby objects",
  },
  shock: {
    id: "shock",
    label: "Shock",
    color: "#50a0e0",
    fluid: "#80d0ff",
    icon: "⚡",
    desc: "Wets and electrocutes the living",
  },
  grow: {
    id: "grow",
    label: "Grow",
    color: "#60c060",
    fluid: "#90e080",
    icon: "+",
    desc: "Temporary giant size",
  },
  shrink: {
    id: "shrink",
    label: "Shrink",
    color: "#80a060",
    fluid: "#b0d080",
    icon: "−",
    desc: "Temporary tiny size",
  },
  boneMelt: {
    id: "boneMelt",
    label: "Bone Melt",
    color: "#d0c8b8",
    fluid: "#e8e0d0",
    icon: "♨",
    desc: "Melts nearby bones into bone melt for molds/tanks",
  },
  fear: {
    id: "fear",
    label: "Fear",
    color: "#c0a020",
    fluid: "#e0c040",
    icon: "F",
    desc: "Forces Flee AI for a while",
  },
  zombie: {
    id: "zombie",
    label: "Zombie",
    color: "#5a7050",
    fluid: "#8aaa70",
    icon: "☠",
    desc: "Wakes skeleton into Fight mode (no flesh)",
  },
  fire: {
    id: "fire",
    label: "Fire",
    color: "#e06020",
    fluid: "#ff8040",
    icon: "▲",
    desc: "Ignites the living",
  },
  extinguish: {
    id: "extinguish",
    label: "Douse",
    color: "#4080c0",
    fluid: "#70b0e0",
    icon: "~",
    desc: "Puts out fire and soaks them",
  },
  invisible: {
    id: "invisible",
    label: "Invisible",
    color: "#c8c8d0",
    fluid: "#e8e8f0",
    icon: "◌",
    desc: "Nearly invisible for a while",
  },
  magnet: {
    id: "magnet",
    label: "Magnet",
    color: "#5060a0",
    fluid: "#7090d0",
    icon: "N",
    desc: "Pulls metal and props toward the body",
  },
  repel: {
    id: "repel",
    label: "Repel",
    color: "#a05080",
    fluid: "#d070a0",
    icon: "◎",
    desc: "Pushes nearby objects away",
  },
  bouncy: {
    id: "bouncy",
    label: "Bouncy",
    color: "#e080c0",
    fluid: "#ffb0e0",
    icon: "○",
    desc: "Super restitution — living becomes a trampoline",
  },
  concrete: {
    id: "concrete",
    label: "Concrete",
    color: "#8a8a88",
    fluid: "#b0b0a8",
    icon: "▣",
    desc: "Statue lock, then hardened bones",
  },
  split: {
    id: "split",
    label: "Split",
    color: "#a04040",
    fluid: "#d06060",
    icon: "✂",
    desc: "Detaches all limbs at once",
  },
  mute: {
    id: "mute",
    label: "Mute",
    color: "#606070",
    fluid: "#9090a0",
    icon: "✕",
    desc: "Locks AI to Idle — blocks orders",
  },
  berserk: {
    id: "berserk",
    label: "Berserk",
    color: "#b02020",
    fluid: "#ff3030",
    icon: "※",
    desc: "Rage + Fight + softened bones",
  },
  preservative: {
    id: "preservative",
    label: "Preserve",
    color: "#80a0c0",
    fluid: "#b0d0e8",
    icon: "P",
    desc: "Stops juice loss / bleeding for a while",
  },
  poison: {
    id: "poison",
    label: "Poison",
    color: "#608020",
    fluid: "#90c040",
    icon: "!",
    desc: "Slow juice drain and damage over time",
  },
  oil: {
    id: "oil",
    label: "Oil",
    color: "#605028",
    fluid: "#a08840",
    icon: "≋",
    desc: "Near-zero friction — slides forever",
  },
  candy: {
    id: "candy",
    label: "Candy",
    color: "#e060a0",
    fluid: "#ff90c8",
    icon: "♥",
    desc: "Rainbow juice tint + light heal",
  },
  slimeSplit: {
    id: "slimeSplit",
    label: "Slime Split",
    color: "#70c050",
    fluid: "#a0e070",
    icon: "◇",
    desc: "Clone self and shrink to 75% (max 3 splits)",
  },
  cloneBud: {
    id: "cloneBud",
    label: "Clone",
    color: "#50b090",
    fluid: "#80e0c0",
    icon: "⧉",
    desc: "Spawn a tiny growing copy nearby",
  },
  swap: {
    id: "swap",
    label: "Swap",
    color: "#9060c0",
    fluid: "#c090ff",
    icon: "⇄",
    desc: "Scramble limb positions",
  },
  teleport: {
    id: "teleport",
    label: "Teleport",
    color: "#4060e0",
    fluid: "#80a0ff",
    icon: "✦",
    desc: "Blink the living a short distance",
  },
  antenna: {
    id: "antenna",
    label: "Antenna",
    color: "#c0a040",
    fluid: "#e0c060",
    icon: "Y",
    desc: "Signal relay — auto-activates nearby machines",
  },
  passiveStrong: {
    id: "passiveStrong",
    label: "Strong Passive Regen",
    color: "#2a8878",
    fluid: "#90e0c0",
    icon: "P+",
    desc: "Permanent 8× heal — regrows limbs & bones",
  },
  passiveWeak: {
    id: "passiveWeak",
    label: "Weak Passive Regen",
    color: "#3a9a5a",
    fluid: "#70d090",
    icon: "P",
    desc: "Permanent 4× skin heal & clotting",
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
  setRegrowHeld(parts, true);
}

/** Heal: joints, bones, revive. Does NOT restore juice — survive until juice drops again. */
function applyHeal(world, parts, particles) {
  clearAcid(parts);
  const fixedJoints = reconnectJoints(world, parts, 100);
  // Soften fresh joints so heal doesn't detonate piles
  const rid = parts[0]?.plugin?.ragdollId;
  if (rid && fixedJoints > 0) {
    for (const c of Composite.allConstraints(world)) {
      if (c.plugin?.isFruitJoint && c.plugin.ragdollId === rid) {
        c.stiffness = Math.min(c.stiffness || 0.9, 0.55);
        c.damping = Math.max(c.damping || 0.12, 0.22);
      }
    }
  }
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
  const oldRid = forked.oldRid;

  // Push stump clear of the still-regrowing host so both don't share a footprint
  nudgeClusterAwayFromRid(world, parts, oldRid, 120);

  // Calm the stump so regrow doesn't inherit a spinning launch
  for (const p of parts) {
    p.plugin.bruises = 0;
    p.plugin.acidDecay = 0;
    p.plugin.boneBroken = false;
    p.plugin.jointSprain = false;
    p.plugin.conscious = true;
    p.plugin.forkedFrom = oldRid;
    if (p.plugin.state === "skeleton" || p.plugin.state === "damaged") {
      p.plugin.state = "damaged";
      p.plugin.hp = Math.max(p.plugin.hp, p.plugin.maxHp * 0.55);
    }
    if (!isFinite(p.angle) || Math.abs(p.angle) > Math.PI * 2) {
      Body.setAngle(p, 0);
    } else {
      let a = p.angle;
      while (a > Math.PI) a -= Math.PI * 2;
      while (a < -Math.PI) a += Math.PI * 2;
      Body.setAngle(p, a * 0.25);
    }
    Body.setVelocity(p, { x: 0, y: 0 });
    Body.setAngularVelocity(p, 0);
    Body.set(p, { frictionAir: 0.15, restitution: 0.02 });
  }

  // Lock standing pose X so later torso buds don't snap back into the host
  const cx = parts.reduce((s, p) => s + p.position.x, 0) / parts.length;
  for (const p of parts) p.plugin.regrowPoseX = cx;

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
  startBodyGrowth(parts, { duration: 22, fromLimb: false });
  const torso = parts.find((p) => p.plugin?.part === "torso");
  if (torso) particles.burst(torso.position.x, torso.position.y, "#70d0ff", 20, 5);
}

/** Inject a syringe effect only into the connected cluster of the hit part. */
export function injectSyringe(world, hitBody, syringeId, particles, syringeBody = null) {
  const def = SYRINGES[syringeId];
  if (!def || !hitBody?.plugin?.ragdollId) return false;

  // Effects never jump to severed / disconnected pieces
  const parts = getConnectedCluster(world, hitBody);
  if (!parts.length) return false;
  const severed = isSeveredCluster(parts);

  // Regen / Regrow on a severed limb → new living grown from that limb
  if ((syringeId === "regen" || syringeId === "regrow") && severed) {
    const dur = syringeId === "regen" ? 18 : 26;
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
      p.plugin.effects.passiveStrong = null;
      p.plugin.effects.passiveWeak = null;
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
      p.plugin.effects.sleep = null;
      p.plugin.conscious = true;
      p.plugin.forceUnconscious = false;
      if (p.isStatic && p.plugin.frozen) {
        Body.setStatic(p, false);
        p.plugin.frozen = false;
      }
    }
  } else if (syringeId === "heavy") {
    for (const p of parts) {
      if (!p.plugin) continue;
      if (!p.plugin.effects) p.plugin.effects = {};
      // Cancel float if present
      clearDensityEffect(p, "float");
      p.plugin.effects.heavy = { t: 12, applied: true };
      p.plugin.effects.float = null;
      if (!p.plugin._baseDensity) p.plugin._baseDensity = p.density;
      Body.set(p, { density: p.plugin._baseDensity * 4.5 });
    }
  } else if (syringeId === "boneSoft") {
    for (const p of parts) {
      if (!p.plugin || p.plugin.state === "gone") continue;
      if (!p.plugin.effects) p.plugin.effects = {};
      p.plugin.effects.boneSoft = { t: 14 };
      p.plugin.effects.calcium = null;
      if (p.plugin.state === "skeleton") {
        const softMax = boneMaxHp(p.plugin.part) * 0.32;
        p.plugin.maxHp = softMax;
        p.plugin.hp = Math.min(p.plugin.hp, softMax * 0.55);
      } else {
        // Next skeletonization will use a weaker bone pool
        p.plugin.boneHpMul = 0.35;
      }
      particles.drip(p.position.x, p.position.y, "#e8d0a0", 2);
    }
  } else if (syringeId === "calcium") {
    healBones(parts);
    for (const p of parts) {
      if (!p.plugin || p.plugin.state === "gone") continue;
      if (!p.plugin.effects) p.plugin.effects = {};
      p.plugin.effects.calcium = { t: 10 };
      p.plugin.effects.boneSoft = null;
      p.plugin.boneHpMul = 1.45;
      p.plugin.boneBroken = false;
      p.plugin.jointSprain = false;
      if (p.plugin.state === "skeleton") {
        const hard = boneMaxHp(p.plugin.part) * 1.45;
        p.plugin.maxHp = hard;
        p.plugin.hp = hard;
      } else {
        p.plugin.hp = Math.min(p.plugin.maxHp, p.plugin.hp + p.plugin.maxHp * 0.15);
      }
      particles.drip(p.position.x, p.position.y, "#fffff0", 2);
    }
  } else if (syringeId === "juiceDrain") {
    const vessel = parts.find((p) => p.plugin?.liquid)?.plugin?.liquid;
    if (vessel && vessel.amount > 0) {
      const take = Math.min(vessel.amount, vessel.capacity);
      const mixSnap = vessel.fruitMix ? { ...vessel.fruitMix } : null;
      const fruitKey = parts.find((p) => p.plugin?.fruitKey)?.plugin?.fruitKey;
      const lost = loseJuice(vessel, take, particles, { x: cx, y: cy });
      if (syringeBody?.plugin) {
        ensureSyringeVessel(syringeBody);
        addLiquid(syringeBody.plugin.liquid, lost, "juice", vessel.color, {
          fruitKey: fruitKey && fruitKey !== "mix" ? fruitKey : null,
          fruitMix: mixSnap,
        });
        syringeBody.plugin.used = false;
        syncSyringeFromVessel(syringeBody);
      }
      for (const p of parts) {
        if (!p.plugin.effects) p.plugin.effects = {};
        p.plugin.effects.juiceDrain = { t: 0.8 };
      }
    }
  } else if (syringeId === "float") {
    for (const p of parts) {
      if (!p.plugin) continue;
      if (!p.plugin.effects) p.plugin.effects = {};
      clearDensityEffect(p, "heavy");
      p.plugin.effects.heavy = null;
      p.plugin.effects.float = { t: 14 };
      if (!p.plugin._baseDensity) p.plugin._baseDensity = p.density;
      if (!p.plugin._baseAir) p.plugin._baseAir = p.frictionAir;
      Body.set(p, { density: p.plugin._baseDensity * 0.18, frictionAir: 0.04 });
    }
  } else if (syringeId === "sleep") {
    clearLivingAI(parts);
    for (const p of parts) {
      if (!p.plugin) continue;
      if (!p.plugin.effects) p.plugin.effects = {};
      p.plugin.effects.sleep = { t: 16 };
      p.plugin.effects.rage = null;
      p.plugin.effects.fear = null;
      p.plugin.effects.zombie = null;
      p.plugin.conscious = false;
      p.plugin.forceUnconscious = true;
    }
  } else if (syringeId === "glue") {
    for (const p of parts) {
      if (!p.plugin) continue;
      if (!p.plugin.effects) p.plugin.effects = {};
      p.plugin.effects.glue = { t: 12 };
      if (p.plugin._baseFriction == null) p.plugin._baseFriction = p.friction;
      if (p.plugin._baseFrictionStatic == null) p.plugin._baseFrictionStatic = p.frictionStatic;
      if (p.plugin._baseRest == null) p.plugin._baseRest = p.restitution;
      Body.set(p, { friction: 1.4, frictionStatic: 1.2, restitution: 0.02 });
    }
    stickToNearby(world, parts, particles);
  } else if (syringeId === "shock") {
    for (const p of parts) {
      if (!p.plugin) continue;
      if (!p.plugin.effects) p.plugin.effects = {};
      p.plugin.effects.shockSyringe = { t: 3.5 };
      p.plugin.wet = Math.min(1, (p.plugin.wet || 0) + 0.85);
      shock(p, 1.6, 2.2);
    }
  } else if (syringeId === "grow") {
    applySizeEffect(world, parts, 1.55, 14, "grow");
  } else if (syringeId === "shrink") {
    applySizeEffect(world, parts, 0.55, 14, "shrink");
  } else if (syringeId === "boneMelt") {
    meltNearbyBones(world, hitBody, particles);
  } else if (syringeId === "fear") {
    for (const p of parts) {
      if (!p.plugin) continue;
      if (!p.plugin.effects) p.plugin.effects = {};
      p.plugin.effects.fear = { t: 12 };
      p.plugin.effects.sleep = null;
      p.plugin.effects.zombie = null;
      p.plugin.conscious = true;
      p.plugin.forceUnconscious = false;
    }
    setLivingAI(world, hitBody, "flee");
  } else if (syringeId === "zombie") {
    clearAcid(parts);
    healBones(parts);
    for (const p of parts) {
      if (!p.plugin || p.plugin.state === "gone") continue;
      if (!p.plugin.effects) p.plugin.effects = {};
      // Stay skeleton — no flesh restore
      if (p.plugin.state !== "skeleton") {
        // Force to bone if still fleshed
        p.plugin.fleshMaxHp = p.plugin.fleshMaxHp || p.plugin.maxHp;
        p.plugin.state = "skeleton";
        p.plugin.maxHp = boneMaxHp(p.plugin.part);
        p.plugin.hp = p.plugin.maxHp * 0.85;
      } else {
        p.plugin.hp = Math.max(p.plugin.hp, p.plugin.maxHp * 0.7);
      }
      p.plugin.effects.zombie = { t: 22 };
      p.plugin.effects.sleep = null;
      p.plugin.effects.fear = null;
      p.plugin.conscious = true;
      p.plugin.forceUnconscious = false;
      p.plugin.boneBroken = false;
    }
    wakeLiving(parts);
    setLivingAI(world, hitBody, "fight");
  } else if (syringeId === "fire") {
    for (const p of parts) {
      if (!p.plugin || p.plugin.state === "gone") continue;
      if (!p.plugin.effects) p.plugin.effects = {};
      p.plugin.effects.fireSyringe = { t: 2 };
      ignite(p, 1.5, 9);
      particles.flame?.(p.position.x, p.position.y, 3);
    }
  } else if (syringeId === "extinguish") {
    for (const p of parts) {
      if (!p.plugin) continue;
      if (!p.plugin.effects) p.plugin.effects = {};
      p.plugin.effects.extinguish = { t: 1.5 };
      extinguish(p, 3.5);
      p.plugin.wet = Math.min(1, (p.plugin.wet || 0) + 0.9);
      particles.drip(p.position.x, p.position.y, "#70b0e0", 4);
    }
  } else if (syringeId === "invisible") {
    for (const p of parts) {
      if (!p.plugin) continue;
      if (!p.plugin.effects) p.plugin.effects = {};
      p.plugin.effects.invisible = { t: 12 };
      p.plugin.invisible = 0.12;
    }
  } else if (syringeId === "magnet") {
    for (const p of parts) {
      if (!p.plugin) continue;
      if (!p.plugin.effects) p.plugin.effects = {};
      p.plugin.effects.magnet = { t: 10 };
      p.plugin.effects.repel = null;
    }
  } else if (syringeId === "repel") {
    for (const p of parts) {
      if (!p.plugin) continue;
      if (!p.plugin.effects) p.plugin.effects = {};
      p.plugin.effects.repel = { t: 10 };
      p.plugin.effects.magnet = null;
    }
  } else if (syringeId === "bouncy") {
    for (const p of parts) {
      if (!p.plugin) continue;
      if (!p.plugin.effects) p.plugin.effects = {};
      p.plugin.effects.bouncy = { t: 14 };
      if (p.plugin._baseRest == null) p.plugin._baseRest = p.restitution;
      Body.set(p, { restitution: 0.95 });
    }
  } else if (syringeId === "concrete") {
    healBones(parts);
    for (const p of parts) {
      if (!p.plugin) continue;
      if (!p.plugin.effects) p.plugin.effects = {};
      p.plugin.effects.concrete = { t: 5, phase: "statue" };
      p.plugin.effects.frozen = null;
      Body.setStatic(p, true);
      p.plugin.frozen = true;
      p.plugin.boneHpMul = 1.5;
    }
  } else if (syringeId === "split") {
    const limbs = parts.filter(
      (p) =>
        p.plugin &&
        p.plugin.state !== "gone" &&
        p.plugin.part !== "torso" &&
        p.plugin.part !== "head"
    );
    for (const limb of limbs) {
      if (detachLimb(world, limb)) {
        particles.burst(limb.position.x, limb.position.y, limb.plugin.fruit?.juice || "#aaa", 10, 4);
      }
    }
  } else if (syringeId === "mute") {
    clearLivingAI(parts);
    for (const p of parts) {
      if (!p.plugin) continue;
      if (!p.plugin.effects) p.plugin.effects = {};
      p.plugin.effects.mute = { t: 18 };
      p.plugin.effects.fear = null;
      p.plugin.effects.zombie = null;
      p.plugin.effects.berserk = null;
      p.plugin.aiLocked = true;
    }
  } else if (syringeId === "berserk") {
    for (const p of parts) {
      if (!p.plugin || p.plugin.state === "gone") continue;
      if (!p.plugin.effects) p.plugin.effects = {};
      p.plugin.effects.berserk = { t: 12 };
      p.plugin.effects.rage = { t: 12 };
      p.plugin.effects.boneSoft = { t: 12 };
      p.plugin.effects.sleep = null;
      p.plugin.effects.mute = null;
      p.plugin.effects.fear = null;
      p.plugin.aiLocked = false;
      p.plugin.boneHpMul = 0.4;
      p.plugin.conscious = true;
      p.plugin.forceUnconscious = false;
      if (p.plugin.state === "skeleton") {
        const softMax = boneMaxHp(p.plugin.part) * 0.4;
        p.plugin.maxHp = softMax;
        p.plugin.hp = Math.min(p.plugin.hp, softMax);
      }
      if (p.isStatic && p.plugin.frozen) {
        Body.setStatic(p, false);
        p.plugin.frozen = false;
      }
    }
    setLivingAI(world, hitBody, "fight");
  } else if (syringeId === "preservative") {
    for (const p of parts) {
      if (!p.plugin) continue;
      if (!p.plugin.effects) p.plugin.effects = {};
      p.plugin.effects.preservative = { t: 20 };
      p.plugin.effects.poison = null;
      p.plugin.bleed = null;
      if (p.plugin.liquid) p.plugin.liquid.preserve = true;
    }
  } else if (syringeId === "poison") {
    for (const p of parts) {
      if (!p.plugin) continue;
      if (!p.plugin.effects) p.plugin.effects = {};
      p.plugin.effects.poison = { t: 14, rate: 6 };
      p.plugin.effects.preservative = null;
      if (p.plugin.liquid) p.plugin.liquid.preserve = false;
    }
  } else if (syringeId === "oil") {
    for (const p of parts) {
      if (!p.plugin) continue;
      if (!p.plugin.effects) p.plugin.effects = {};
      p.plugin.effects.oil = { t: 16 };
      p.plugin.effects.glue = null;
      if (p.plugin._baseFriction == null) p.plugin._baseFriction = p.friction;
      if (p.plugin._baseFrictionStatic == null) p.plugin._baseFrictionStatic = p.frictionStatic;
      if (p.plugin._baseAir == null) p.plugin._baseAir = p.frictionAir;
      Body.set(p, { friction: 0.01, frictionStatic: 0.01, frictionAir: 0.002 });
      // Drop glue bonds when oiled
      const bonds = Composite.allConstraints(world).filter(
        (c) => c.plugin?.glueBond && (c.bodyA === p || c.bodyB === p)
      );
      if (bonds.length) Composite.remove(world, bonds);
    }
  } else if (syringeId === "candy") {
    const palette = ["#ff6aa8", "#ffb040", "#70e070", "#60c8ff", "#c080ff", "#ffe060"];
    const col = palette[Math.floor(Math.random() * palette.length)];
    for (const p of parts) {
      if (!p.plugin || p.plugin.state === "gone") continue;
      if (!p.plugin.effects) p.plugin.effects = {};
      p.plugin.effects.candy = { t: 10, colors: palette, i: 0 };
      if (p.plugin.liquid) {
        p.plugin.liquid.color = col;
      }
      if (p.plugin.state !== "skeleton") {
        p.plugin.hp = Math.min(p.plugin.maxHp, p.plugin.hp + p.plugin.maxHp * 0.12);
        p.plugin.bruises = Math.max(0, (p.plugin.bruises || 0) - 0.2);
      }
      particles.drip(p.position.x, p.position.y, col, 3);
    }
  } else if (syringeId === "slimeSplit") {
    if (!applySlimeSplit(world, parts, particles)) return false;
  } else if (syringeId === "cloneBud") {
    if (!applyCloneBud(world, parts, particles)) return false;
  } else if (syringeId === "swap") {
    applySwapParts(world, parts, particles);
  } else if (syringeId === "teleport") {
    applyTeleport(parts, particles);
  } else if (syringeId === "antenna") {
    for (const p of parts) {
      if (!p.plugin) continue;
      if (!p.plugin.effects) p.plugin.effects = {};
      p.plugin.effects.antenna = { t: 22 };
      p.plugin.conductive = true;
    }
    const torso = parts.find((p) => p.plugin?.partSlot === "torso") || parts[0];
    if (torso) {
      markActivatable(torso, { startActive: true });
      torso.plugin.signalRelay = true;
    }
  } else if (syringeId === "passiveStrong") {
    for (const p of parts) {
      if (!p.plugin || p.plugin.state === "gone") continue;
      if (!p.plugin.effects) p.plugin.effects = {};
      // Permanent 8× heal + limb/bone regrow
      p.plugin.effects.passiveStrong = { permanent: true, timer: 0 };
      p.plugin.effects.acid = null;
      p.plugin.conscious = true;
      p.plugin.forceUnconscious = false;
    }
    healBones(parts);
  } else if (syringeId === "passiveWeak") {
    for (const p of parts) {
      if (!p.plugin || p.plugin.state === "gone") continue;
      if (!p.plugin.effects) p.plugin.effects = {};
      // Permanent 4× skin heal & clotting only
      p.plugin.effects.passiveWeak = { permanent: true };
      p.plugin.effects.acid = null;
    }
  }

  return true;
}

/** Permanent size change (slime splits). */
function shrinkLivingPermanent(world, parts, factor) {
  for (const p of parts) {
    if (!p.plugin || p.plugin.state === "gone") continue;
    Body.scale(p, factor, factor);
    scaleBodyJointAnchors(world, p, factor, factor);
    p.plugin.baseScale = (p.plugin.baseScale || p.plugin.scale || 1) * factor;
    p.plugin.scale = (p.plugin.scale || 1) * factor;
    if (p.plugin._syringeScale) p.plugin._syringeScale *= factor;
  }
}

/**
 * Soften joints, kill velocity, and briefly ignore other livings so a fresh
 * clone / slime twin doesn't collide-launch into the void.
 */
function calmSpawnedLiving(world, parts, settle = 1.0) {
  if (!parts?.length) return;
  const rid = parts[0]?.plugin?.ragdollId;
  for (const p of parts) {
    if (!p.plugin || p.plugin.state === "gone") continue;
    Body.setVelocity(p, { x: 0, y: 0 });
    Body.setAngularVelocity(p, 0);
    Body.set(p, { restitution: 0.02, frictionAir: 0.14 });
    if (!p.plugin._spawnCol) {
      p.plugin._spawnCol = {
        category: p.collisionFilter?.category ?? 0x0001,
        mask: p.collisionFilter?.mask ?? 0xffffffff,
        group: p.collisionFilter?.group ?? 0,
      };
    }
    p.collisionFilter = {
      ...p.collisionFilter,
      category: 0x0004,
      mask: 0x0001,
      group: p.plugin.collisionGroup || p.collisionFilter?.group || 0,
    };
    p.plugin.spawnProtect = Math.max(p.plugin.spawnProtect || 0, settle);
  }
  if (!rid) return;
  for (const c of Composite.allConstraints(world)) {
    if (c.plugin?.isFruitJoint && c.plugin.ragdollId === rid) {
      c.stiffness = Math.min(c.stiffness || 0.9, 0.3);
      c.damping = Math.max(c.damping || 0.12, 0.35);
      c.length = 0;
    }
  }
}

function footContactY(parts, fallbackY) {
  let y = fallbackY;
  for (const p of parts) {
    if (p.plugin?.state === "gone") continue;
    if (p.bounds?.max?.y > y) y = p.bounds.max.y;
  }
  return y;
}

function applySlimeSplit(world, parts, particles) {
  const torso = parts.find((p) => p.plugin?.partSlot === "torso") || parts[0];
  if (!torso?.plugin) return false;
  const splits = torso.plugin.slimeSplits || 0;
  if (splits >= 3) {
    particles?.burst?.(torso.position.x, torso.position.y, "#a0e070", 8, 3);
    return false;
  }
  const fruitKey = torso.plugin.fruitKey || "melon";
  const curScale = torso.plugin.scale || torso.plugin.baseScale || 1;
  const nextScale = curScale * 0.75;
  const vessel = parts.find((p) => p.plugin?.liquid)?.plugin?.liquid;
  const juiceAmt = vessel?.amount ?? 50;
  const juiceColor = vessel?.color;
  const hostRid = torso.plugin.ragdollId;

  const footY = footContactY(parts, torso.position.y);

  // Shrink original, then re-pose + calm so scaled joints don't detonate
  shrinkLivingPermanent(world, parts, 0.75);
  const nextSplits = splits + 1;
  for (const p of parts) {
    if (p.plugin) p.plugin.slimeSplits = nextSplits;
  }
  if (torso) poseStandingCluster(parts, torso, footY);
  calmSpawnedLiving(world, parts, 0.75);

  // Spawn twin well clear of the (now smaller) host
  const gap = 90 + 55 * nextScale;
  const side = Math.random() < 0.5 ? -1 : 1;
  const spawnX = torso.position.x + side * gap;
  const rag = createFruitRagdoll(world, spawnX, footY, fruitKey, nextScale);
  if (rag?.parts) {
    for (const p of rag.parts) {
      p.plugin.slimeSplits = nextSplits;
      p.plugin.baseScale = nextScale;
      p.plugin.forkedFrom = hostRid;
    }
    nudgeClusterAwayFromRid(world, rag.parts, hostRid, gap);
    if (rag.torso) poseStandingCluster(rag.parts, rag.torso, footY);
    calmSpawnedLiving(world, rag.parts, 1.1);

    const cloneVessel = rag.parts.find((p) => p.plugin?.liquid)?.plugin?.liquid;
    if (cloneVessel) {
      cloneVessel.amount = Math.min(cloneVessel.capacity, juiceAmt * 0.55);
      if (juiceColor) cloneVessel.color = juiceColor;
    }
    if (vessel) vessel.amount = Math.min(vessel.capacity, juiceAmt * 0.55);
    particles?.burst?.(rag.torso.position.x, rag.torso.position.y, "#a0e070", 18, 5);
    particles?.burst?.(torso.position.x, torso.position.y, "#70c050", 14, 4);
  }
  return true;
}

function applyCloneBud(world, parts, particles) {
  const torso = parts.find((p) => p.plugin?.partSlot === "torso") || parts[0];
  if (!torso?.plugin) return false;
  const fruitKey = torso.plugin.fruitKey || "melon";
  const parentScale = torso.plugin.scale || torso.plugin.baseScale || 1;
  const budScale = Math.max(0.28, parentScale * 0.4);
  const hostRid = torso.plugin.ragdollId;
  const footY = footContactY(parts, torso.position.y);
  const gap = 85 + 40 * parentScale;
  const side = Math.random() < 0.5 ? -1 : 1;

  const rag = createFruitRagdoll(
    world,
    torso.position.x + side * gap,
    footY,
    fruitKey,
    budScale
  );
  if (!rag?.parts) return false;

  for (const p of rag.parts) {
    p.plugin.forkedFrom = hostRid;
    p.plugin.baseScale = budScale;
  }
  nudgeClusterAwayFromRid(world, rag.parts, hostRid, gap);
  if (rag.torso) poseStandingCluster(rag.parts, rag.torso, footY);
  // Do NOT startBodyGrowth on a full spawn — that strips joints and relaunches.
  // Soft settle is enough for a tiny bud twin.
  calmSpawnedLiving(world, rag.parts, 1.2);
  restoreJuice(rag.parts, 0.35);
  particles?.burst?.(rag.torso.position.x, rag.torso.position.y, "#80e0c0", 16, 5);
  return true;
}

function applySwapParts(world, parts, particles) {
  const alive = parts.filter((p) => p.plugin && p.plugin.state !== "gone");
  if (alive.length < 2) return false;
  // Drop joints first so they don't fight the scramble
  const rid = alive[0].plugin.ragdollId;
  const joints = Composite.allConstraints(world).filter(
    (c) => c.plugin?.isFruitJoint && c.plugin.ragdollId === rid
  );
  if (joints.length) Composite.remove(world, joints);

  const poses = alive.map((p) => ({
    x: p.position.x,
    y: p.position.y,
    a: p.angle,
  }));
  for (let i = poses.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [poses[i], poses[j]] = [poses[j], poses[i]];
  }
  alive.forEach((p, i) => {
    Body.setPosition(p, { x: poses[i].x, y: poses[i].y });
    Body.setAngle(p, poses[i].a);
    Body.setVelocity(p, { x: 0, y: 0 });
    Body.setAngularVelocity(p, 0);
    particles?.drip?.(p.position.x, p.position.y, "#c090ff", 2);
  });
  reconnectJoints(world, alive, 120);
  const rid2 = alive[0]?.plugin?.ragdollId;
  if (rid2) {
    for (const c of Composite.allConstraints(world)) {
      if (c.plugin?.isFruitJoint && c.plugin.ragdollId === rid2) {
        c.stiffness = Math.min(c.stiffness || 0.9, 0.4);
        c.damping = Math.max(c.damping || 0.12, 0.25);
      }
    }
  }
  return true;
}

function applyTeleport(parts, particles) {
  const dx = (Math.random() - 0.5) * 260;
  const dy = (Math.random() - 0.5) * 140 - 30;
  for (const p of parts) {
    if (!p.plugin || p.plugin.state === "gone") continue;
    particles?.burst?.(p.position.x, p.position.y, "#80a0ff", 4, 2);
    Body.setPosition(p, { x: p.position.x + dx, y: p.position.y + dy });
    Body.setVelocity(p, { x: 0, y: 0 });
    Body.setAngularVelocity(p, 0);
    particles?.burst?.(p.position.x, p.position.y, "#4060e0", 4, 2);
  }
  return true;
}

function clearDensityEffect(p, kind) {
  if (!p.plugin) return;
  if (kind === "heavy" && p.plugin.effects?.heavy && p.plugin._baseDensity) {
    Body.set(p, { density: p.plugin._baseDensity });
  }
  if (kind === "float" && p.plugin.effects?.float) {
    if (p.plugin._baseDensity) Body.set(p, { density: p.plugin._baseDensity });
    if (p.plugin._baseAir != null) Body.set(p, { frictionAir: p.plugin._baseAir });
  }
}

function applySizeEffect(world, parts, targetMul, duration, key) {
  for (const p of parts) {
    if (!p.plugin || p.plugin.state === "gone") continue;
    if (!p.plugin.effects) p.plugin.effects = {};
    // Clear opposite size effect
    const other = key === "grow" ? "shrink" : "grow";
    if (p.plugin.effects[other]) {
      restoreSize(world, p);
      p.plugin.effects[other] = null;
    }
    const cur = p.plugin._syringeScale || 1;
    const factor = targetMul / cur;
    Body.scale(p, factor, factor);
    scaleBodyJointAnchors(world, p, factor, factor);
    p.plugin._syringeScale = targetMul;
    p.plugin.scale = (p.plugin.baseScale || 1) * targetMul;
    p.plugin.effects[key] = { t: duration, mul: targetMul };
  }
}

function restoreSize(world, p) {
  const cur = p.plugin?._syringeScale || 1;
  if (Math.abs(cur - 1) < 0.02) {
    if (p.plugin) p.plugin._syringeScale = 1;
    return;
  }
  Body.scale(p, 1 / cur, 1 / cur);
  scaleBodyJointAnchors(world, p, 1 / cur, 1 / cur);
  p.plugin._syringeScale = 1;
  p.plugin.scale = p.plugin.baseScale || 1;
}

function stickToNearby(world, parts, particles) {
  const all = Composite.allBodies(world);
  const made = [];
  for (const p of parts) {
    if (p.plugin?.state === "gone") continue;
    let stuck = 0;
    for (const other of all) {
      if (stuck >= 2) break;
      if (other === p || other.isStatic) continue;
      if (other.label === "ground" || other.label === "platform") continue;
      if (other.plugin?.waterZone || other.plugin?.lavaZone || other.plugin?.acidZone) continue;
      if (parts.includes(other)) continue;
      const dist = Math.hypot(other.position.x - p.position.x, other.position.y - p.position.y);
      if (dist > 42) continue;
      const c = Constraint.create({
        bodyA: p,
        bodyB: other,
        stiffness: 0.35,
        damping: 0.15,
        length: Math.max(8, dist * 0.6),
        render: { visible: false },
      });
      c.plugin = { glueBond: true, draw: "weld", color: "#c8a040" };
      made.push(c);
      stuck++;
      particles?.drip?.(p.position.x, p.position.y, "#e0b850", 2);
    }
  }
  if (made.length) Composite.add(world, made);
}

function meltNearbyBones(world, center, particles) {
  const zone = {
    min: { x: center.position.x - 90, y: center.position.y - 90 },
    max: { x: center.position.x + 90, y: center.position.y + 90 },
  };
  const bones = Query.region(Composite.allBodies(world), zone).filter(
    (b) => b.plugin?.fruit && b.plugin.state === "skeleton"
  );
  let yieldAmt = 0;
  for (const b of bones) {
    yieldAmt += 12 + (b.plugin.part === "torso" ? 18 : b.plugin.part === "head" ? 10 : 6);
    particles?.burst?.(b.position.x, b.position.y, BONE_MELT_COLOR, 8, 3);
    b.plugin.state = "gone";
  }
  if (yieldAmt < 1) {
    particles?.burst?.(center.position.x, center.position.y, BONE_MELT_COLOR, 6, 2);
    return;
  }
  // Dump into nearest vessel that can hold bone melt
  let best = null;
  let bestD = 220;
  for (const b of Composite.allBodies(world)) {
    const v = b.plugin?.liquid;
    if (!v) continue;
    if (v.type && v.type !== "empty" && v.type !== BONE_MELT_TYPE && v.amount > 1) continue;
    const d = Math.hypot(b.position.x - center.position.x, b.position.y - center.position.y);
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  if (best?.plugin?.liquid) {
    addLiquid(best.plugin.liquid, yieldAmt, BONE_MELT_TYPE, BONE_MELT_COLOR);
    particles?.burst?.(best.position.x, best.position.y, BONE_MELT_COLOR, 12, 4);
  }
}

function pulseRegrow(world, rid, particles, fromLimb) {
  let live = partsOf(world, rid);
  // Joints stay off for the whole regrow window — reconnect only when it ends
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
      particles.burst(grown.position.x, grown.position.y, "#70d0ff", 6, 2);
      particles.drip(grown.position.x, grown.position.y, "#a8f0ff", 4);
      live = partsOf(world, rid);
      present.add(slot);
      break;
    }
  }

  for (const p of partsOf(world, rid)) {
    if (!p.plugin || p.plugin.state === "gone") continue;
    if (p.plugin.growing) continue;
    p.plugin.hp = Math.min(p.plugin.maxHp, p.plugin.hp + p.plugin.maxHp * 0.08);
    p.plugin.bruises = Math.max(0, (p.plugin.bruises || 0) - 0.15);
    p.plugin.acidDecay = Math.max(0, (p.plugin.acidDecay || 0) - 0.2);
    if (p.plugin.state === "skeleton" || p.plugin.state === "damaged") {
      p.plugin.state = p.plugin.hp >= p.plugin.maxHp * 0.85 ? "alive" : "damaged";
    }
    p.plugin.boneBroken = false;
    p.plugin.jointSprain = false;
    p.plugin.seedLimb = false;
    if (Math.random() < 0.25) {
      particles.drip(p.position.x, p.position.y, "#70d0ff", 1);
    }
  }
  const liveParts = partsOf(world, rid);
  syncLivingLiquid(liveParts, liveParts[0]?.plugin?.fruit);
  restoreJuice(liveParts, 0.06);
}

/** True when every limb slot exists and no buds are still animating. */
function isBodyFullyRegrown(world, rid) {
  const live = partsOf(world, rid).filter((p) => p.plugin?.state !== "gone");
  if (!live.length) return false;
  if (live.some((p) => p.plugin?.growing)) return false;

  const present = new Set(live.map((p) => p.plugin.partSlot));
  for (const slot of ALL_PART_SLOTS) {
    if (!present.has(slot)) return false;
  }
  return true;
}

function finishRegrowEffect(world, rid, particles, groundY) {
  for (const p of partsOf(world, rid)) {
    if (p.plugin?.growing) p.plugin.growing.t = p.plugin.growing.duration;
  }
  tickGrowingParts(world, partsOf(world, rid), 0.05, particles, groundY);

  const live = partsOf(world, rid);
  const torso = live.find((p) => p.plugin?.partSlot === "torso");

  // Keep clear of the original host one last time before joints/physics return
  const oldRid = live.find((p) => p.plugin?.forkedFrom)?.plugin?.forkedFrom;
  if (oldRid) nudgeClusterAwayFromRid(world, live, oldRid, 110);

  for (const p of live) {
    if (p.plugin?.effects) p.plugin.effects.regrow = null;
    Body.set(p, { frictionAir: 0.08, restitution: 0.02 });
  }
  if (torso) {
    if (torso.plugin.regrowPoseX == null && live[0]?.plugin?.regrowPoseX != null) {
      torso.plugin.regrowPoseX = live[0].plugin.regrowPoseX;
    }
    poseStandingCluster(live, torso, groundY);
  }
  setRegrowHeld(live, false);
  restoreSkin(live, { clearBruises: true, full: true });
  reconnectJoints(world, live, 200);
  for (const c of Composite.allConstraints(world)) {
    if (c.plugin?.isFruitJoint && c.plugin.ragdollId === rid) {
      // Soft weld — hard snaps were launching twin regrows into the void
      c.stiffness = Math.min(c.stiffness || 0.9, 0.35);
      c.damping = Math.max(c.damping || 0.12, 0.35);
      c.length = 0;
    }
  }
  for (const p of live) {
    Body.setVelocity(p, { x: 0, y: 0 });
    Body.setAngularVelocity(p, 0);
    if (p.plugin) {
      p.plugin.regrowPoseX = null;
      p.plugin.regrowSettle = 0.85; // brief soft air-friction window
    }
  }
  wakeLiving(live);
  if (particles && torso) {
    particles.burst(torso.position.x, torso.position.y, "#70d0ff", 14, 4);
  }
}

function pulsePassiveStrong(world, rid, particles) {
  let live = partsOf(world, rid);
  healBones(live);

  const present = new Set(
    live.filter((p) => p.plugin?.state !== "gone").map((p) => p.plugin.partSlot)
  );
  for (const slot of ALL_PART_SLOTS) {
    if (slot === "torso") continue;
    if (present.has(slot)) continue;
    const grown = regrowMissingPart(world, live, slot);
    if (grown) {
      particles?.burst?.(grown.position.x, grown.position.y, "#90e0c0", 5, 2);
      particles?.drip?.(grown.position.x, grown.position.y, "#b8f0d8", 3);
      break;
    }
  }

  live = partsOf(world, rid);
  for (const p of live) {
    if (!p.plugin || p.plugin.state === "gone") continue;
    p.plugin.boneBroken = false;
    p.plugin.jointSprain = false;
    if (p.plugin.state === "skeleton") {
      p.plugin._fleshRegen = (p.plugin._fleshRegen || 0) + 0.28;
    } else if (p.plugin.state === "damaged") {
      p.plugin.hp = Math.min(p.plugin.maxHp, p.plugin.hp + p.plugin.maxHp * 0.06);
      p.plugin.bruises = Math.max(0, (p.plugin.bruises || 0) - 0.08);
    }
    if (Math.random() < 0.2) {
      particles?.drip?.(p.position.x, p.position.y, "#90e0c0", 1);
    }
  }
  reconnectJoints(world, live, 90);
}

/** Per-frame syringe effect processing. */
export function tickSyringeEffects(world, bodies, dt, particles, groundY = null) {
  // Gradual bud → limb growth
  tickGrowingParts(world, bodies, dt, particles, groundY);

  // Soft landing after regrow release (high air friction briefly)
  for (const b of bodies) {
    if (b.plugin?.regrowSettle > 0) {
      b.plugin.regrowSettle -= dt;
      Body.set(b, { frictionAir: 0.1 });
      if (b.plugin.regrowSettle <= 0) {
        b.plugin.regrowSettle = 0;
        Body.set(b, { frictionAir: 0.01 });
      }
    }
    // Clone / slime spawn protection — restore living collisions after settle
    if (b.plugin?.spawnProtect > 0) {
      b.plugin.spawnProtect -= dt;
      Body.set(b, { frictionAir: 0.12 });
      if (b.plugin.spawnProtect <= 0) {
        b.plugin.spawnProtect = 0;
        const prev = b.plugin._spawnCol;
        if (prev) {
          b.collisionFilter = {
            ...b.collisionFilter,
            category: prev.category,
            mask: prev.mask,
            group: prev.group,
          };
          b.plugin._spawnCol = null;
        }
        Body.set(b, { frictionAir: 0.01 });
      }
    }
  }

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

    // Once fully grown, settle for 1s then end (don't keep pulsing forever)
    const complete = isBodyFullyRegrown(world, rid);
    if (complete) {
      if (regrowFx.finishIn == null) {
        regrowFx.finishIn = 1;
        for (const p of partsOf(world, rid)) {
          if (!p.plugin.effects) p.plugin.effects = {};
          p.plugin.effects.regrow = regrowFx;
        }
      } else {
        regrowFx.finishIn -= dt;
      }

      if (regrowFx.finishIn <= 0 || regrowFx.t <= 0) {
        finishRegrowEffect(world, rid, particles, groundY);
        continue;
      }
      // Soft glow while settling — no new limbs
      continue;
    }

    // Still missing parts — keep growing
    if (regrowFx.timer > 0.35) {
      regrowFx.timer = 0;
      pulseRegrow(world, rid, particles, !!regrowFx.fromLimb);
      for (const p of partsOf(world, rid)) {
        if (!p.plugin.effects) p.plugin.effects = {};
        p.plugin.effects.regrow = regrowFx;
      }
    }

    // Safety: duration expired before full body — finish anyway
    if (regrowFx.t <= 0) {
      finishRegrowEffect(world, rid, particles, groundY);
    }
  }

  // Strong Passive Regen: permanent slow limb buds + bone mend
  for (const [rid, parts] of byId.entries()) {
    const driver =
      parts.find((p) => p.plugin?.effects?.passiveStrong) ||
      parts.find((p) => p.plugin?.partSlot === "torso") ||
      parts[0];
    const strongFx = driver?.plugin?.effects?.passiveStrong;
    if (!strongFx) continue;

    strongFx.permanent = true;
    strongFx.timer = (strongFx.timer || 0) + dt;

    if (strongFx.timer > 1.35) {
      strongFx.timer = 0;
      pulsePassiveStrong(world, rid, particles);
    }

    for (const p of partsOf(world, rid)) {
      if (!p.plugin) continue;
      if (!p.plugin.effects) p.plugin.effects = {};
      p.plugin.effects.passiveStrong = strongFx;
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
      } else if (pl.partSlot === "torso" || pl.part === "torso") {
        Body.set(b, { isSleeping: false });
        b.torque += (Math.random() - 0.5) * 0.05;
        Body.applyForce(b, b.position, {
          x: (Math.random() - 0.5) * 0.0025,
          y: (Math.random() - 0.5) * 0.002,
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

    if (fx.float) {
      fx.float.t -= dt;
      Body.set(b, { isSleeping: false });
      Body.applyForce(b, b.position, { x: 0, y: -0.0022 });
      if (fx.float.t <= 0) {
        if (pl._baseDensity) Body.set(b, { density: pl._baseDensity });
        if (pl._baseAir != null) Body.set(b, { frictionAir: pl._baseAir });
        fx.float = null;
      } else if (Math.random() < 0.12) {
        particles.drip(b.position.x, b.position.y, "#c8ecff", 1);
      }
    }

    if (fx.sleep) {
      fx.sleep.t -= dt;
      pl.conscious = false;
      pl.forceUnconscious = true;
      if (fx.sleep.t <= 0) {
        fx.sleep = null;
        pl.forceUnconscious = false;
      } else if (Math.random() < 0.08) {
        particles.drip(b.position.x, b.position.y, "#9a80c8", 1);
      }
    }

    if (fx.glue) {
      fx.glue.t -= dt;
      if (fx.glue.t <= 0) {
        const restore = {};
        if (pl._baseFriction != null) restore.friction = pl._baseFriction;
        if (pl._baseFrictionStatic != null) restore.frictionStatic = pl._baseFrictionStatic;
        if (pl._baseRest != null) restore.restitution = pl._baseRest;
        if (Object.keys(restore).length) Body.set(b, restore);
        fx.glue = null;
        const bonds = Composite.allConstraints(world).filter(
          (c) => c.plugin?.glueBond && (c.bodyA === b || c.bodyB === b)
        );
        if (bonds.length) Composite.remove(world, bonds);
      } else if (Math.random() < 0.05) {
        particles.drip(b.position.x, b.position.y, "#e0b850", 1);
      }
    }

    if (fx.shockSyringe) {
      fx.shockSyringe.t -= dt;
      if (fx.shockSyringe.t <= 0) fx.shockSyringe = null;
    }

    if (fx.grow) {
      fx.grow.t -= dt;
      if (fx.grow.t <= 0) {
        restoreSize(world, b);
        fx.grow = null;
      } else if (Math.random() < 0.1) {
        particles.drip(b.position.x, b.position.y, "#90e080", 1);
      }
    }

    if (fx.shrink) {
      fx.shrink.t -= dt;
      if (fx.shrink.t <= 0) {
        restoreSize(world, b);
        fx.shrink = null;
      } else if (Math.random() < 0.1) {
        particles.drip(b.position.x, b.position.y, "#b0d080", 1);
      }
    }

    if (fx.boneSoft) {
      fx.boneSoft.t -= dt;
      if (fx.boneSoft.t <= 0) {
        fx.boneSoft = null;
        if (pl.boneHpMul != null && pl.boneHpMul < 1) pl.boneHpMul = null;
      }
    }

    if (fx.calcium) {
      fx.calcium.t -= dt;
      if (fx.calcium.t <= 0) {
        fx.calcium = null;
      } else if (pl.state === "skeleton" && pl.hp < pl.maxHp) {
        pl.hp = Math.min(pl.maxHp, pl.hp + pl.maxHp * 0.04 * dt);
      }
    }

    if (fx.juiceDrain) {
      fx.juiceDrain.t -= dt;
      if (fx.juiceDrain.t <= 0) fx.juiceDrain = null;
    }

    if (fx.fear) {
      fx.fear.t -= dt;
      pl.conscious = true;
      pl.forceUnconscious = false;
      if (pl.ai?.mode !== "flee" && pl.partSlot === "torso") {
        setLivingAI(world, b, "flee");
      }
      if (fx.fear.t <= 0) {
        fx.fear = null;
        if (pl.partSlot === "torso") clearLivingAI(partsOf(world, pl.ragdollId));
      } else if (Math.random() < 0.1) {
        particles.drip(b.position.x, b.position.y, "#e0c040", 1);
      }
    }

    if (fx.zombie) {
      fx.zombie.t -= dt;
      pl.conscious = true;
      pl.forceUnconscious = false;
      if (pl.ai?.mode !== "fight" && pl.partSlot === "torso") {
        setLivingAI(world, b, "fight");
      }
      if (fx.zombie.t <= 0) {
        fx.zombie = null;
        if (pl.partSlot === "torso") clearLivingAI(partsOf(world, pl.ragdollId));
        if (pl.state === "skeleton") {
          pl.conscious = false;
        }
      } else if (Math.random() < 0.12) {
        particles.drip(b.position.x, b.position.y, "#8aaa70", 1);
      }
    }

    if (fx.fireSyringe) {
      fx.fireSyringe.t -= dt;
      if (fx.fireSyringe.t <= 0) fx.fireSyringe = null;
    }

    if (fx.extinguish) {
      fx.extinguish.t -= dt;
      if (fx.extinguish.t <= 0) fx.extinguish = null;
    }

    if (fx.invisible) {
      fx.invisible.t -= dt;
      pl.invisible = 0.1 + 0.06 * Math.sin(performance.now() / 200);
      if (fx.invisible.t <= 0) {
        fx.invisible = null;
        pl.invisible = null;
      }
    }

    if (fx.magnet || fx.repel) {
      const pull = !!fx.magnet;
      const fxObj = fx.magnet || fx.repel;
      fxObj.t -= dt;
      if (pl.partSlot === "torso" || pl.part === "torso") {
        const others = Composite.allBodies(world);
        for (const other of others) {
          if (other === b || other.isStatic) continue;
          if (other.plugin?.ragdollId === pl.ragdollId) continue;
          if (other.label === "ground" || other.label === "platform") continue;
          if (other.plugin?.waterZone || other.plugin?.lavaZone || other.plugin?.acidZone) continue;
          const metal =
            other.plugin?.conductive ||
            other.plugin?.draw === "metal" ||
            other.plugin?.draw === "wire" ||
            other.plugin?.firearm ||
            other.plugin?.sharp ||
            other.plugin?.boneWeapon;
          if (pull && other.plugin?.fruit && !metal) continue;
          const dx = other.position.x - b.position.x;
          const dy = other.position.y - b.position.y;
          const dist = Math.hypot(dx, dy) || 1;
          if (dist > 160 || dist < 8) continue;
          const boost = metal ? 1.6 : 1;
          const f = (pull ? -1 : 1) * 0.0035 * boost * (1 - dist / 160);
          Body.set(other, { isSleeping: false });
          Body.applyForce(other, other.position, { x: (dx / dist) * f, y: (dy / dist) * f });
        }
      }
      if (fxObj.t <= 0) {
        if (fx.magnet) fx.magnet = null;
        if (fx.repel) fx.repel = null;
      }
    }

    if (fx.bouncy) {
      fx.bouncy.t -= dt;
      if (fx.bouncy.t <= 0) {
        if (pl._baseRest != null) Body.set(b, { restitution: pl._baseRest });
        fx.bouncy = null;
      }
    }

    if (fx.concrete) {
      fx.concrete.t -= dt;
      if (fx.concrete.phase === "statue" && fx.concrete.t <= 0) {
        Body.setStatic(b, false);
        pl.frozen = false;
        fx.concrete.phase = "hard";
        fx.concrete.t = 8;
        if (pl.state === "skeleton") {
          const hard = boneMaxHp(pl.part) * 1.5;
          pl.maxHp = hard;
          pl.hp = hard;
        }
        particles.burst(b.position.x, b.position.y, "#b0b0a8", 6, 2);
      } else if (fx.concrete.phase === "hard" && fx.concrete.t <= 0) {
        fx.concrete = null;
      }
    }

    if (fx.mute) {
      fx.mute.t -= dt;
      pl.aiLocked = true;
      if (pl.ai && pl.ai.mode !== "idle") {
        pl.ai.mode = "idle";
      }
      if (fx.mute.t <= 0) {
        fx.mute = null;
        pl.aiLocked = false;
      }
    }

    if (fx.berserk) {
      fx.berserk.t -= dt;
      pl.conscious = true;
      pl.forceUnconscious = false;
      if (pl.ai?.mode !== "fight" && pl.partSlot === "torso") {
        setLivingAI(world, b, "fight");
      }
      if (fx.berserk.t <= 0) {
        fx.berserk = null;
        if (pl.partSlot === "torso") clearLivingAI(partsOf(world, pl.ragdollId));
      }
    }

    if (fx.preservative) {
      fx.preservative.t -= dt;
      pl.bleed = null;
      if (pl.liquid) pl.liquid.preserve = true;
      if (fx.preservative.t <= 0) {
        fx.preservative = null;
        if (pl.liquid) pl.liquid.preserve = false;
      } else if (Math.random() < 0.08) {
        particles.drip(b.position.x, b.position.y, "#b0d0e8", 1);
      }
    }

    if (fx.poison) {
      fx.poison.t -= dt;
      if (pl.state !== "gone") {
        damagePart(b, (fx.poison.rate || 6) * dt * 0.35, particles, b.position, { silent: true });
        if (pl.liquid && (pl.part === "torso" || pl.partSlot === "torso")) {
          loseJuice(pl.liquid, 4.5 * dt, particles, b.position);
        }
        if (Math.random() < 0.2) {
          particles.drip(b.position.x, b.position.y, "#90c040", 2);
        }
      }
      if (fx.poison.t <= 0) fx.poison = null;
    }

    if (fx.oil) {
      fx.oil.t -= dt;
      if (fx.oil.t <= 0) {
        const restore = {};
        if (pl._baseFriction != null) restore.friction = pl._baseFriction;
        if (pl._baseFrictionStatic != null) restore.frictionStatic = pl._baseFrictionStatic;
        if (pl._baseAir != null) restore.frictionAir = pl._baseAir;
        if (Object.keys(restore).length) Body.set(b, restore);
        fx.oil = null;
      } else if (Math.random() < 0.06) {
        particles.drip(b.position.x, b.position.y, "#a08840", 1);
      }
    }

    if (fx.candy) {
      fx.candy.t -= dt;
      fx.candy.i = (fx.candy.i || 0) + dt * 3;
      if (pl.liquid && fx.candy.colors) {
        const idx = Math.floor(fx.candy.i) % fx.candy.colors.length;
        pl.liquid.color = fx.candy.colors[idx];
      }
      if (fx.candy.t <= 0) fx.candy = null;
      else if (Math.random() < 0.15) {
        const c = fx.candy.colors?.[Math.floor(Math.random() * fx.candy.colors.length)] || "#ff90c8";
        particles.drip(b.position.x, b.position.y, c, 1);
      }
    }

    if (fx.antenna) {
      fx.antenna.t -= dt;
      pl.conductive = true;
      if ((pl.partSlot === "torso" || pl.part === "torso") && Math.random() < 0.35) {
        for (const other of Composite.allBodies(world)) {
          if (other === b || !other.plugin) continue;
          if (!isActivatable(other) && !other.plugin.activatable) continue;
          const dist = Math.hypot(other.position.x - b.position.x, other.position.y - b.position.y);
          if (dist > 110) continue;
          setActive(other, true);
          other.plugin.signalDriven = true;
        }
        if (Math.random() < 0.3) {
          particles.drip(b.position.x, b.position.y - 10, "#e0c060", 1);
        }
      }
      if (fx.antenna.t <= 0) {
        fx.antenna = null;
        pl.signalRelay = false;
      }
    }

    // Both passives are permanent — only cleared by acid
    if (fx.passiveStrong) {
      fx.passiveStrong.permanent = true;
      if (Math.random() < 0.05) {
        particles.drip(b.position.x, b.position.y, "#90e0c0", 1);
      }
    }
    if (fx.passiveWeak) {
      fx.passiveWeak.permanent = true;
      if (Math.random() < 0.04) {
        particles.drip(b.position.x, b.position.y, "#70d090", 1);
      }
    }
  }
}
