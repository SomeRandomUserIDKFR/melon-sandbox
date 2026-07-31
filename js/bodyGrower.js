/** Body Grower — dual tanks form a new living from the head outward (one at a time). */

import {
  regrowMissingPart,
  reconnectJoints,
  setRegrowHeld,
  restoreSkin,
  poseStandingCluster,
  ALL_PART_SLOTS,
  BODY_GROW_ORDER,
  wakeLiving,
  setMetalFrame,
  createSeedHead,
  PART_SIZE,
  FRUITS,
} from "./ragdoll.js";
import {
  createContainerVessel,
  addLiquid,
  syncLivingLiquid,
  applyJuiceConsciousness,
} from "./liquids.js";
import { fruitFromJuiceVessel } from "./skinRestorer.js";
import {
  BONE_MELT_COLOR,
  BONE_MELT_TYPE,
  METAL_BONE_MELT_COLOR,
  METAL_BONE_MELT_TYPE,
  LIQUID_METAL_COLOR,
  LIQUID_METAL_TYPE,
  isMetalMeltType,
  isBoneMeltType,
} from "./boneMachines.js";
import { ensureNetId } from "./multiplayer.js";

const { Body, Bodies, Composite } = Matter;

function vesselIsBoneMelt(v) {
  return !!v && v.amount >= 0.5 && isBoneMeltType(v.type);
}

function vesselIsMetalMelt(v) {
  return !!v && v.amount >= 0.5 && isMetalMeltType(v.type);
}

function meltForgeColor(v) {
  if (!v) return BONE_MELT_COLOR;
  if (v.type === LIQUID_METAL_TYPE || v.type === "liquidMetal") return v.color || LIQUID_METAL_COLOR;
  if (isMetalMeltType(v.type)) return v.color || METAL_BONE_MELT_COLOR;
  return v.color || BONE_MELT_COLOR;
}

function spendVessel(vessel, amount) {
  if (!vessel || amount <= 0) return 0;
  const take = Math.min(vessel.amount, amount);
  vessel.amount -= take;
  if (vessel.amount < 0.5) {
    vessel.amount = 0;
    vessel.type = "empty";
    vessel.fromShard = false;
    vessel.fruitMix = null;
  }
  return take;
}

function boneCostForSlot(slot) {
  if (slot === "torso") return 22;
  if (slot === "head") return 16;
  if (slot === "lf" || slot === "rf") return 8;
  return 12;
}

function juiceCostForSlot(slot) {
  return boneCostForSlot(slot) * 0.85;
}

function partsOf(world, rid) {
  return Composite.allBodies(world).filter(
    (b) => b.plugin?.ragdollId === rid && b.plugin.state !== "gone"
  );
}

function missingSlots(parts) {
  const present = new Set(
    parts.filter((p) => p.plugin?.state !== "gone").map((p) => p.plugin.partSlot)
  );
  return BODY_GROW_ORDER.filter((s) => ALL_PART_SLOTS.includes(s) && !present.has(s));
}

function isFullyFormed(parts) {
  if (!parts.length) return false;
  if (parts.some((p) => p.plugin?.growing)) return false;
  const present = new Set(parts.map((p) => p.plugin.partSlot));
  return ALL_PART_SLOTS.every((s) => present.has(s));
}

function stampMachinePose(cluster, machine) {
  const poseX = machine.position.x;
  const bedY = machine.bounds.min.y;
  for (const p of cluster) {
    if (!p.plugin) continue;
    p.plugin.regrowPoseX = poseX;
    p.plugin.regrowGroundY = bedY;
  }
}

function beginMachineRegrow(cluster, machine) {
  const fx = { t: 14, pulseCd: 0 };
  stampMachinePose(cluster, machine);
  for (const p of cluster) {
    if (!p.plugin.effects) p.plugin.effects = {};
    p.plugin.effects.machineRegrow = fx;
  }
  return fx;
}

function syncMachineRegrow(cluster, fx) {
  for (const p of cluster) {
    if (!p.plugin.effects) p.plugin.effects = {};
    p.plugin.effects.machineRegrow = fx;
  }
}

function finishMachineRegrow(world, rid, particles) {
  const live = partsOf(world, rid);
  if (!live.length) return;

  for (const p of live) {
    if (p.plugin?.growing) {
      p.plugin.growing.t = p.plugin.growing.duration;
    }
  }

  const torso = live.find((p) => p.plugin?.partSlot === "torso");
  const floorY = torso?.plugin?.regrowGroundY ?? null;
  if (torso) poseStandingCluster(live, torso, floorY);

  setRegrowHeld(live, false);
  reconnectJoints(world, live, 200);

  for (const c of Composite.allConstraints(world)) {
    if (c.plugin?.isFruitJoint && c.plugin.ragdollId === rid) {
      c.stiffness = Math.min(c.stiffness || 0.9, 0.4);
      c.damping = Math.max(c.damping || 0.12, 0.32);
      c.length = 0;
    }
  }

  for (const p of live) {
    Body.setVelocity(p, { x: 0, y: 0 });
    Body.setAngularVelocity(p, 0);
    Body.set(p, { frictionAir: 0.06, restitution: 0.02 });
    if (!p.plugin) continue;
    if (p.plugin.effects) p.plugin.effects.machineRegrow = null;
    p.plugin.regrowPoseX = null;
    p.plugin.regrowGroundY = null;
    p.plugin.regrowSettle = 0.7;
    p.plugin.forgeSkeleton = false;
  }
  wakeLiving(live);
  if (particles && torso) {
    particles.burst(torso.position.x, torso.position.y, BONE_MELT_COLOR, 12, 4);
    particles.burst(torso.position.x, torso.position.y, "#70d0ff", 8, 3);
  }
}

function applyFleshFromJuice(body, juiceTank, cluster, particles) {
  const profile = fruitFromJuiceVessel(juiceTank);
  if (!profile) return false;
  const cost = juiceCostForSlot(body.plugin.partSlot || body.plugin.part);
  if (juiceTank.amount < cost * 0.9) return false;
  const mixSnap = juiceTank.fruitMix ? { ...juiceTank.fruitMix } : null;
  if (spendVessel(juiceTank, cost) < cost * 0.85) return false;

  body.plugin.fruit = profile.fruit;
  body.plugin.fruitKey = profile.key;
  body.plugin.forgeSkeleton = false;
  restoreSkin([body], { clearBruises: true, full: false });
  body.plugin.hp = Math.max(body.plugin.hp, body.plugin.maxHp * 0.55);
  if (!body.plugin.growing) {
    body.plugin.state = "damaged";
  }
  body.plugin.conscious = true;
  body.plugin.boneBroken = false;
  body.plugin.jointSprain = false;

  syncLivingLiquid(cluster, profile.fruit);
  const vessel = body.plugin.liquid || cluster.find((p) => p.plugin?.liquid)?.plugin?.liquid;
  if (vessel) {
    addLiquid(vessel, cost * 0.45, "juice", profile.fruit.juice, {
      fruitKey: profile.key !== "mix" ? profile.key : null,
      fruitMix: mixSnap,
    });
    vessel.surviveUntilBelow = null;
  }
  applyJuiceConsciousness(cluster);
  particles?.burst?.(body.position.x, body.position.y, profile.fruit.juice, 10, 3);
  particles?.burst?.(body.position.x, body.position.y, profile.fruit.skin, 6, 2);
  return true;
}

function resolveSeedFruit(juiceTank, juiceReady, forgeMetal) {
  if (juiceReady) {
    const profile = fruitFromJuiceVessel(juiceTank);
    if (profile) {
      const key =
        profile.key && profile.key !== "mix" && FRUITS[profile.key] ? profile.key : "melon";
      return { key, fruit: profile.fruit, profile };
    }
  }
  if (forgeMetal) return { key: "robot", fruit: FRUITS.robot, profile: null };
  return { key: "melon", fruit: FRUITS.melon, profile: null };
}

export function createBodyGrower(x, y) {
  const body = Bodies.rectangle(x, y, 86, 54, {
    friction: 0.45,
    density: 0.012,
    chamfer: { radius: 4 },
    label: "mach-bodyGrower",
    render: { visible: false },
  });
  const juice = createContainerVessel({
    amount: 0,
    capacity: 160,
    color: "#b8e86a",
    type: "empty",
  });
  const bone = createContainerVessel({
    amount: 0,
    capacity: 160,
    color: BONE_MELT_COLOR,
    type: "empty",
  });
  body.plugin = {
    draw: "bodyGrower",
    bodyGrower: true,
    processT: 0,
    growingRid: null,
    cooldown: 0,
    liquid: juice,
    liquidJuice: juice,
    liquidBone: bone,
  };
  return body;
}

/**
 * Forms one living at a time from the head outward on the machine bed.
 * Bone melt forges structure; juice coats flesh. Only one growingRid at once.
 */
export function tickBodyGrower(machine, world, dt, particles) {
  if (!machine?.plugin?.bodyGrower) return;
  if (!machine.plugin.active) {
    machine.plugin.processT = 0;
    return;
  }

  const juiceTank = machine.plugin.liquidJuice || machine.plugin.liquid;
  const boneTank = machine.plugin.liquidBone;
  const hasBone = vesselIsBoneMelt(boneTank);
  const meltTypes = new Set([
    BONE_MELT_TYPE,
    METAL_BONE_MELT_TYPE,
    LIQUID_METAL_TYPE,
    "hybridMelt",
    "crystalMelt",
    "boneMelt",
    "metalBoneMelt",
    "liquidMetal",
  ]);
  const juiceReady =
    juiceTank && juiceTank.amount >= 4 && !meltTypes.has(juiceTank.type);

  machine.plugin.cooldown = Math.max(0, (machine.plugin.cooldown || 0) - dt);

  let rid = machine.plugin.growingRid;
  let cluster = rid ? partsOf(world, rid) : [];

  // Drop stale claim if the body vanished
  if (rid && !cluster.length) {
    machine.plugin.growingRid = null;
    rid = null;
  }

  // Continue / finish the one body in progress
  if (rid && cluster.length) {
    let fx = cluster.find((p) => p.plugin?.effects?.machineRegrow)?.plugin?.effects?.machineRegrow;
    if (!fx) fx = beginMachineRegrow(cluster, machine);
    else {
      stampMachinePose(cluster, machine);
      syncMachineRegrow(cluster, fx);
    }

    if (isFullyFormed(cluster)) {
      fx.finishIn = (fx.finishIn ?? 0.55) - dt;
      syncMachineRegrow(cluster, fx);
      stampMachinePose(cluster, machine);
      if (fx.finishIn <= 0) {
        finishMachineRegrow(world, rid, particles);
        machine.plugin.growingRid = null;
        machine.plugin.cooldown = 1.2;
      }
      return;
    }

    const growing = cluster.some((p) => p.plugin?.growing);
    const missing = missingSlots(cluster);

    if (!growing && juiceReady) {
      const bonePart = cluster.find((p) => p.plugin.state === "skeleton" && !p.plugin.growing);
      if (bonePart) {
        machine.plugin.processT = (machine.plugin.processT || 0) + dt;
        if (machine.plugin.processT >= 0.45) {
          machine.plugin.processT = 0;
          applyFleshFromJuice(bonePart, juiceTank, cluster, particles);
        }
      } else {
        machine.plugin.processT = 0;
      }
    }

    if (!missing.length || !hasBone || growing) return;

    fx.pulseCd = (fx.pulseCd || 0) - dt;
    syncMachineRegrow(cluster, fx);
    if (fx.pulseCd > 0) return;

    const slot = missing[0];
    const cost = boneCostForSlot(slot);
    if (boneTank.amount < cost * 0.95) return;
    const forgeMetal = vesselIsMetalMelt(boneTank) || boneTank.type === "hybridMelt";
    const meltColor = meltForgeColor(boneTank);
    if (spendVessel(boneTank, cost) < cost * 0.85) return;

    cluster = partsOf(world, rid);
    stampMachinePose(cluster, machine);
    const grown = regrowMissingPart(world, cluster, slot);
    if (!grown) return;
    ensureNetId(grown);
    if (forgeMetal) setMetalFrame(grown.plugin, true);
    if (grown.plugin.growing) grown.plugin.growing.duration = 1.05;

    cluster = partsOf(world, rid);
    const canCoat = juiceReady && juiceTank.amount >= juiceCostForSlot(slot) * 0.9;
    if (canCoat) {
      applyFleshFromJuice(grown, juiceTank, cluster, particles);
    } else {
      grown.plugin.forgeSkeleton = true;
      grown.plugin.state = "skeleton";
      particles?.burst?.(
        grown.position.x,
        grown.position.y,
        forgeMetal ? "#9ab0c0" : "#c8c2b4",
        6,
        2
      );
    }

    particles?.burst?.(grown.position.x, grown.position.y, meltColor, 10, 3);
    particles?.drip?.(grown.position.x, grown.position.y, "#a8f0ff", 3);
    fx.pulseCd = 0.4;
    fx.t = Math.max(fx.t, 6);
    syncMachineRegrow(cluster, fx);
    return;
  }

  // Idle — start a new head if materials + cooldown allow (only one at a time)
  if (!hasBone) {
    machine.plugin.processT = 0;
    return;
  }
  if ((machine.plugin.cooldown || 0) > 0) return;

  const headCost = boneCostForSlot("head");
  if (boneTank.amount < headCost * 0.95) return;

  machine.plugin.processT = (machine.plugin.processT || 0) + dt;
  if (machine.plugin.processT < 0.55) return;
  machine.plugin.processT = 0;

  const forgeMetal = vesselIsMetalMelt(boneTank) || boneTank.type === "hybridMelt";
  const meltColor = meltForgeColor(boneTank);
  if (spendVessel(boneTank, headCost) < headCost * 0.85) return;

  const seedFruit = resolveSeedFruit(juiceTank, juiceReady, forgeMetal);
  const bedY = machine.bounds.min.y;
  const hx = machine.position.x;
  const hy = bedY - PART_SIZE.headR * 0.85;

  const head = createSeedHead(world, hx, hy, seedFruit.key, 1, seedFruit.fruit);
  ensureNetId(head);
  if (forgeMetal) setMetalFrame(head.plugin, true);

  machine.plugin.growingRid = head.plugin.ragdollId;
  const cluster0 = [head];
  const fx = beginMachineRegrow(cluster0, machine);

  const canCoat = juiceReady && juiceTank.amount >= juiceCostForSlot("head") * 0.9;
  if (canCoat) {
    applyFleshFromJuice(head, juiceTank, cluster0, particles);
  } else {
    head.plugin.forgeSkeleton = true;
    head.plugin.state = "skeleton";
    particles?.burst?.(hx, hy, forgeMetal ? "#9ab0c0" : "#c8c2b4", 6, 2);
  }

  particles?.burst?.(hx, hy, meltColor, 12, 4);
  particles?.drip?.(hx, hy, "#a8f0ff", 4);
  fx.pulseCd = 0.45;
  syncMachineRegrow(cluster0, fx);
}
