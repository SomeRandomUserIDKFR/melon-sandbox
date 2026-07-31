/** Juice crystallizer + shard smelter (crystal melt for molds). */

import { createContainerVessel, addLiquid, markFromShard } from "./liquids.js";

const { Body, Bodies, Composite, Query } = Matter;

export const CRYSTAL_MELT_TYPE = "crystalMelt";
export const HYBRID_MELT_TYPE = "hybridMelt";
export const BONE_MELT_TYPE_ALIAS = "boneMelt"; // avoid circular import with boneMachines
export const SHARD_COST = 28; // juice → one shard
export const SHARD_MELT_YIELD = 26;

export function createJuiceShard(x, y, color = "#b8e86a") {
  const body = Bodies.rectangle(x, y, 12, 34, {
    friction: 0.25,
    restitution: 0.15,
    density: 0.004,
    chamfer: { radius: 1 },
    label: "prop-juiceShard",
    render: { visible: false },
  });
  body.plugin = {
    draw: "juiceShard",
    juiceShard: true,
    color,
    sharp: true,
    pierce: true,
    tipAxis: -1,
    tipLength: 16,
    damage: 17,
    bleed: 6,
  };
  return body;
}

export function createCrystallizer(x, y) {
  const body = Bodies.rectangle(x, y, 64, 50, {
    friction: 0.45,
    density: 0.011,
    chamfer: { radius: 4 },
    label: "mach-crystallizer",
    render: { visible: false },
  });
  body.plugin = {
    draw: "crystallizer",
    crystallizer: true,
    castCd: 0,
    liquid: createContainerVessel({
      amount: 0,
      capacity: 160,
      color: "#b8e86a",
      type: "empty",
    }),
  };
  return body;
}

/**
 * Active crystallizer turns tank juice into a sharp colored shard.
 * spawnShard(x, y, color) adds the body to the world.
 */
export function tickCrystallizer(machine, world, dt, particles, spawnShard) {
  if (!machine?.plugin?.crystallizer) return;
  machine.plugin.castCd = Math.max(0, (machine.plugin.castCd || 0) - dt);
  if (!machine.plugin.active || machine.plugin.castCd > 0) return;

  const v = machine.plugin.liquid;
  if (!v || (v.type !== "juice" && v.type !== "juiceMix") || v.amount < SHARD_COST) return;

  const color = v.color || "#b8e86a";
  v.amount -= SHARD_COST;
  if (v.amount < 0.5) {
    v.amount = 0;
    v.type = "empty";
  }

  const a = machine.angle - Math.PI / 2;
  const sx = machine.position.x + Math.cos(a) * 34;
  const sy = machine.position.y + Math.sin(a) * 34;
  const shard =
    typeof spawnShard === "function"
      ? spawnShard(sx, sy, color)
      : (() => {
          const s = createJuiceShard(sx, sy, color);
          Composite.add(world, s);
          return s;
        })();
  if (shard) {
    Body.setAngle(shard, machine.angle + (Math.random() - 0.5) * 0.4);
    Body.setVelocity(shard, { x: Math.cos(a) * 2.2, y: Math.sin(a) * 2.2 - 0.8 });
  }
  particles?.burst?.(sx, sy, color, 14, 4);
  machine.plugin.castCd = 1.1;
}

export function createShardSmelter(x, y) {
  const body = Bodies.rectangle(x, y, 66, 50, {
    friction: 0.45,
    density: 0.012,
    chamfer: { radius: 4 },
    label: "mach-shardSmelter",
    render: { visible: false },
  });
  body.plugin = {
    draw: "shardSmelter",
    shardSmelter: true,
    processT: 0,
    liquid: createContainerVessel({
      amount: 0,
      capacity: 200,
      color: "#b8e86a",
      type: "empty",
    }),
  };
  return body;
}

export function tickShardSmelter(smelter, world, dt, particles) {
  if (!smelter?.plugin?.shardSmelter || !smelter.plugin.active) {
    if (smelter?.plugin) smelter.plugin.processT = 0;
    return;
  }

  const bx = smelter.bounds;
  const zone = {
    min: { x: bx.min.x - 10, y: bx.min.y - 40 },
    max: { x: bx.max.x + 10, y: bx.min.y + 18 },
  };
  const shards = Query.region(Composite.allBodies(world), zone).filter((b) => b.plugin?.juiceShard);
  if (!shards.length) {
    smelter.plugin.processT = 0;
    return;
  }

  const mx = (zone.min.x + zone.max.x) / 2;
  const my = (zone.min.y + zone.max.y) / 2;
  for (const s of shards) {
    const dx = mx - s.position.x;
    const dy = my - s.position.y;
    Body.applyForce(s, s.position, { x: dx * 0.00004, y: dy * 0.00005 + 0.00015 });
  }

  smelter.plugin.processT = (smelter.plugin.processT || 0) + dt;
  if (smelter.plugin.processT < 0.45) return;
  smelter.plugin.processT = 0;

  const shard = shards[0];
  const color = shard.plugin.color || "#b8e86a";
  addLiquid(smelter.plugin.liquid, SHARD_MELT_YIELD, CRYSTAL_MELT_TYPE, color);
  markFromShard(smelter.plugin.liquid, true);
  particles?.burst?.(shard.position.x, shard.position.y, color, 12, 4);
  Composite.remove(world, shard);
}

/**
 * Mold feedstock rules:
 * - boneMelt: always OK (from bone melter)
 * - crystalMelt / hybridMelt: ONLY if melt was produced by smelting shards (fromShard)
 */
export function moldMeltReady(vessel, cost) {
  if (!vessel || vessel.amount < cost) return false;
  if (vessel.type === BONE_MELT_TYPE_ALIAS) return true;
  if (vessel.type === CRYSTAL_MELT_TYPE || vessel.type === HYBRID_MELT_TYPE) {
    return !!vessel.fromShard;
  }
  return false;
}

/**
 * Decide cast result from mold melt:
 * - boneMelt → bone weapon (ivory)
 * - crystalMelt → crystal-tinted bone-shaped weapon
 * - hybridMelt → bone weapon tinted with melt color
 */
export function moldCastStyle(vessel) {
  const color = vessel?.color || "#d8d0c0";
  if (vessel?.type === CRYSTAL_MELT_TYPE) {
    return { tint: color, crystal: true, hybrid: false };
  }
  if (vessel?.type === HYBRID_MELT_TYPE) {
    return { tint: color, crystal: false, hybrid: true };
  }
  return { tint: null, crystal: false, hybrid: false };
}
