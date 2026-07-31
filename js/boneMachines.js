/** Bone melter, weapon molds, and skeleton reconnector. */

import { PART_SIZE, poseStandingCluster, reconnectJoints, setRegrowHeld, healBones, wakeLiving } from "./ragdoll.js";
import {
  createContainerVessel,
  addLiquid,
  DEFAULT_JUICE_CAPACITY,
  syncLivingLiquid,
} from "./liquids.js";
import { moldMeltReady, moldCastStyle } from "./juiceCrystal.js";

const { Body, Bodies, Composite, Query } = Matter;

export const BONE_MELT_COLOR = "#d8d0c0";
export const BONE_MELT_TYPE = "boneMelt";

/** Mold recipes: weapon id → melt cost. */
export const BONE_MOLDS = {
  boneMoldSword: { weapon: "boneSword", cost: 35, label: "Sword Mold" },
  boneMoldSpike: { weapon: "boneSpike", cost: 20, label: "Spike Mold" },
  boneMoldAxe: { weapon: "boneAxe", cost: 30, label: "Axe Mold" },
  boneMoldClub: { weapon: "boneClub", cost: 40, label: "Club Mold" },
};

function partBoneArea(body) {
  const pl = body?.plugin;
  if (!pl?.fruit || pl.state !== "skeleton") return 0;
  const s = pl.scale || pl.baseScale || 1;
  const part = pl.part || "torso";
  if (part === "head") return Math.PI * (PART_SIZE.headR * s) ** 2;
  const sz = PART_SIZE[part];
  if (!sz) return 20 * s * s;
  return sz[0] * sz[1] * s * s;
}

function fullBodyArea(scale = 1) {
  let a = Math.PI * (PART_SIZE.headR * scale) ** 2;
  for (const key of ["torso", "upperArm", "lowerArm", "upperLeg", "lowerLeg", "foot"]) {
    const [w, h] = PART_SIZE[key];
    const pairs = key === "torso" ? 1 : 2;
    a += w * h * scale * scale * pairs;
  }
  return a;
}

function intakeZone(machine, padX = 10, above = 40, into = 18) {
  const bx = machine.bounds;
  return {
    min: { x: bx.min.x - padX, y: bx.min.y - above },
    max: { x: bx.max.x + padX, y: bx.min.y + into },
  };
}

function suckToward(parts, zone, force = 0.00004) {
  const mx = (zone.min.x + zone.max.x) / 2;
  const my = (zone.min.y + zone.max.y) / 2;
  for (const p of parts) {
    const dx = mx - p.position.x;
    const dy = my - p.position.y;
    Body.applyForce(p, p.position, { x: dx * force, y: dy * force + 0.00015 });
  }
}

// ——— Melter ———

export function createBoneMelter(x, y) {
  const body = Bodies.rectangle(x, y, 68, 52, {
    friction: 0.45,
    density: 0.012,
    chamfer: { radius: 4 },
    label: "mach-boneMelter",
    render: { visible: false },
  });
  body.plugin = {
    draw: "boneMelter",
    boneMelter: true,
    processT: 0,
    liquid: createContainerVessel({
      amount: 0,
      capacity: 200,
      color: BONE_MELT_COLOR,
      type: "empty",
    }),
  };
  return body;
}

export function tickBoneMelter(melter, world, dt, particles) {
  if (!melter?.plugin?.boneMelter || !melter.plugin.active) {
    if (melter?.plugin) melter.plugin.processT = 0;
    return;
  }

  const zone = intakeZone(melter);
  const bones = Query.region(Composite.allBodies(world), zone).filter(
    (b) => b.plugin?.fruit && b.plugin.state === "skeleton"
  );
  if (!bones.length) {
    melter.plugin.processT = 0;
    return;
  }

  suckToward(bones, zone);
  melter.plugin.processT = (melter.plugin.processT || 0) + dt;
  if (melter.plugin.processT < 0.5) return;
  melter.plugin.processT = 0;

  const scale = bones[0].plugin?.scale || 1;
  const full = fullBodyArea(scale);
  let area = 0;
  for (const b of bones) area += partBoneArea(b);
  const yieldAmt = Math.min(1, area / full) * DEFAULT_JUICE_CAPACITY;
  if (yieldAmt < 0.5) return;

  addLiquid(melter.plugin.liquid, yieldAmt, BONE_MELT_TYPE, BONE_MELT_COLOR);

  for (const b of bones) {
    particles?.burst?.(b.position.x, b.position.y, BONE_MELT_COLOR, 8, 3);
    particles?.burst?.(b.position.x, b.position.y, "#8a8070", 4, 2);
    b.plugin.state = "gone";
  }
}

// ——— Molds ———

export function createBoneMold(x, y, moldId) {
  const def = BONE_MOLDS[moldId];
  if (!def) return null;
  const body = Bodies.rectangle(x, y, 48, 40, {
    friction: 0.4,
    density: 0.01,
    chamfer: { radius: 3 },
    label: `mach-${moldId}`,
    render: { visible: false },
  });
  body.plugin = {
    draw: moldId,
    boneMold: true,
    moldId,
    moldWeapon: def.weapon,
    moldCost: def.cost,
    castCd: 0,
    liquid: createContainerVessel({
      amount: 0,
      capacity: 80,
      color: BONE_MELT_COLOR,
      type: "empty",
    }),
  };
  return body;
}

/**
 * Cast a bone / crystal / hybrid weapon when active and tank has enough melt.
 * spawnWeapon(weaponId, x, y) should return the spawned body.
 */
export function tickBoneMold(mold, world, dt, particles, spawnWeapon) {
  if (!mold?.plugin?.boneMold) return;
  mold.plugin.castCd = Math.max(0, (mold.plugin.castCd || 0) - dt);
  if (!mold.plugin.active || mold.plugin.castCd > 0) return;

  const v = mold.plugin.liquid;
  const cost = mold.plugin.moldCost || 30;
  if (!moldMeltReady(v, cost)) return;
  if (typeof spawnWeapon !== "function") return;

  const style = moldCastStyle(v);
  v.amount -= cost;
  if (v.amount < 0.5) {
    v.amount = 0;
    v.type = "empty";
    v.fromShard = false;
  }

  const a = mold.angle - Math.PI / 2;
  const sx = mold.position.x + Math.cos(a) * 36;
  const sy = mold.position.y + Math.sin(a) * 36;
  const weapon = spawnWeapon(mold.plugin.moldWeapon, sx, sy);
  if (weapon?.plugin) {
    if (style.tint) {
      weapon.plugin.tint = style.tint;
      weapon.plugin.color = style.tint;
    }
    if (style.crystal) {
      weapon.plugin.crystalWeapon = true;
      weapon.plugin.bleed = (weapon.plugin.bleed || 5) + 2;
      weapon.plugin.damage = (weapon.plugin.damage || 18) + 2;
    }
    if (style.hybrid) {
      weapon.plugin.hybridWeapon = true;
    }
    Body.setAngle(weapon, mold.angle);
    Body.setVelocity(weapon, { x: Math.cos(a) * 2.5, y: Math.sin(a) * 2.5 - 1 });
  }
  particles?.burst?.(sx, sy, style.tint || BONE_MELT_COLOR, 12, 4);
  mold.plugin.castCd = 1.35;
}

// ——— Reconnector ———

export function createBoneReconnector(x, y) {
  const body = Bodies.rectangle(x, y, 80, 36, {
    friction: 0.5,
    density: 0.014,
    chamfer: { radius: 4 },
    label: "mach-boneReconnector",
    render: { visible: false },
  });
  body.plugin = {
    draw: "boneReconnector",
    boneReconnector: true,
    processT: 0,
    coolDown: 0,
  };
  return body;
}

/**
 * Pull skeleton parts in, merge ragdoll IDs, pose standing, reconnect joints.
 */
export function tickBoneReconnector(machine, world, dt, particles, groundY) {
  if (!machine?.plugin?.boneReconnector) return;
  machine.plugin.coolDown = Math.max(0, (machine.plugin.coolDown || 0) - dt);
  if (!machine.plugin.active) {
    machine.plugin.processT = 0;
    return;
  }
  if (machine.plugin.coolDown > 0) return;

  const bx = machine.bounds;
  const zone = {
    min: { x: bx.min.x - 50, y: bx.min.y - 70 },
    max: { x: bx.max.x + 50, y: bx.max.y + 40 },
  };

  const hits = Query.region(Composite.allBodies(world), zone).filter(
    (b) => b.plugin?.fruit && b.plugin.state !== "gone"
  );
  // Prefer skeletons; allow mixed piles that include bones
  const bones = hits.filter((b) => b.plugin.state === "skeleton");
  const pool = bones.length ? bones : hits;
  if (pool.length < 2) {
    machine.plugin.processT = 0;
    return;
  }

  suckToward(
    pool.filter((p) => p.plugin.state === "skeleton" || p.plugin.detached),
    zone,
    0.00003
  );

  machine.plugin.processT = (machine.plugin.processT || 0) + dt;
  if (machine.plugin.processT < 0.85) return;
  machine.plugin.processT = 0;

  const torso =
    pool.find((p) => p.plugin.partSlot === "torso" && p.plugin.state === "skeleton") ||
    pool.find((p) => p.plugin.partSlot === "torso") ||
    null;
  if (!torso) {
    particles?.burst?.(machine.position.x, machine.position.y, "#a09080", 6, 2);
    return;
  }

  // Gather every part of every rid touching the pile (full skeleton fragments)
  const ridSet = new Set(pool.map((p) => p.plugin.ragdollId));
  const all = Composite.allBodies(world).filter(
    (b) => b.plugin?.fruit && b.plugin.state !== "gone" && ridSet.has(b.plugin.ragdollId)
  );

  // One part per slot — keep closest to torso if duplicates
  const bySlot = new Map();
  for (const p of all) {
    const slot = p.plugin.partSlot;
    if (!slot) continue;
    const prev = bySlot.get(slot);
    if (!prev) {
      bySlot.set(slot, p);
      continue;
    }
    const dNew = Math.hypot(p.position.x - torso.position.x, p.position.y - torso.position.y);
    const dOld = Math.hypot(prev.position.x - torso.position.x, prev.position.y - torso.position.y);
    if (dNew < dOld) bySlot.set(slot, p);
  }
  const parts = [...bySlot.values()];
  if (parts.length < 2) return;

  const masterRid = torso.plugin.ragdollId;
  const group = torso.plugin.collisionGroup ?? torso.collisionFilter?.group;
  const blueprint =
    torso.plugin.blueprint || parts.find((p) => p.plugin.blueprint)?.plugin.blueprint || null;

  // Merge fragments onto torso living
  for (const p of parts) {
    p.plugin.ragdollId = masterRid;
    p.plugin.detached = false;
    if (blueprint) p.plugin.blueprint = blueprint;
    if (group != null) {
      p.plugin.collisionGroup = group;
      p.collisionFilter = { ...p.collisionFilter, group };
    }
    // Copy fruit identity
    if (!p.plugin.fruitKey) p.plugin.fruitKey = torso.plugin.fruitKey;
    if (!p.plugin.fruit) p.plugin.fruit = torso.plugin.fruit;
  }

  // Drop old joints for any former rid in the pile
  const oldJoints = Composite.allConstraints(world).filter(
    (c) => c.plugin?.isFruitJoint && ridSet.has(c.plugin.ragdollId)
  );
  if (oldJoints.length) Composite.remove(world, oldJoints);

  // Also clear joints wrongly tagged with master but wrong bodies
  const stray = Composite.allConstraints(world).filter(
    (c) =>
      c.plugin?.isFruitJoint &&
      (parts.includes(c.bodyA) || parts.includes(c.bodyB))
  );
  if (stray.length) Composite.remove(world, stray);

  syncLivingLiquid(parts, torso.plugin.fruit);

  setRegrowHeld(parts, true);
  // Stand on the machine bed (top surface)
  Body.setPosition(torso, { x: machine.position.x, y: machine.position.y - 60 });
  poseStandingCluster(parts, torso, machine.bounds.min.y);
  setRegrowHeld(parts, false);

  const fixed = reconnectJoints(world, parts, 220);
  // Soften freshly welded joints so they don't explode
  for (const c of Composite.allConstraints(world)) {
    if (c.plugin?.isFruitJoint && c.plugin.ragdollId === masterRid) {
      c.stiffness = Math.min(c.stiffness || 0.9, 0.55);
      c.damping = Math.max(c.damping || 0.12, 0.22);
      c.plugin.ragdollId = masterRid;
    }
  }

  healBones(parts);
  wakeLiving(parts);

  for (const p of parts) {
    particles?.burst?.(p.position.x, p.position.y, "#c8c2b4", 4, 2);
  }
  particles?.burst?.(torso.position.x, torso.position.y, "#e8e0d0", 16, 5);
  machine.plugin.coolDown = 2.2;
  machine.plugin._lastFixed = fixed;
}
