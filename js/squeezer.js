/** Squeezer — press skinned flesh into juice. */

import { PART_SIZE, stripToBone } from "./ragdoll.js";
import {
  createContainerVessel,
  addLiquid,
  loseJuice,
  juiceFill,
  DEFAULT_JUICE_CAPACITY,
  applyJuiceConsciousness,
} from "./liquids.js";

const { Body, Bodies, Composite, Query } = Matter;

/** Reference area of a complete living (for yield fractions). */
export function fullBodyArea(scale = 1) {
  let a = Math.PI * (PART_SIZE.headR * scale) ** 2;
  for (const key of ["torso", "upperArm", "lowerArm", "upperLeg", "lowerLeg", "foot"]) {
    const [w, h] = PART_SIZE[key];
    // arms/legs are pairs except torso
    const pairs = key === "torso" ? 1 : 2;
    a += w * h * scale * scale * pairs;
  }
  return a;
}

export function partSkinArea(body) {
  const pl = body?.plugin;
  if (!pl?.fruit) return 0;
  if (pl.state === "skeleton" || pl.state === "gone") return 0;
  // Only fleshed parts (alive / damaged) count as “skin”
  if (pl.state !== "alive" && pl.state !== "damaged") return 0;
  const s = pl.scale || pl.baseScale || 1;
  const part = pl.part || "torso";
  if (part === "head") return Math.PI * (PART_SIZE.headR * s) ** 2;
  const sz = PART_SIZE[part];
  if (!sz) return 20 * s * s;
  return sz[0] * sz[1] * s * s;
}

/**
 * Yield units (relative to 100 = one full juice bar):
 * empty full corpse → 50; juiced full corpse → 150.
 * yield = (skinArea / fullBody) * (0.5 + juiceFill) * 100
 */
export function computeSqueezeYield(parts) {
  const skinned = parts.filter((p) => partSkinArea(p) > 0);
  if (!skinned.length) return { yieldAmt: 0, skinned: [], areaFrac: 0, fill: 0 };

  let area = 0;
  for (const p of skinned) area += partSkinArea(p);
  const full = fullBodyArea(skinned[0].plugin?.scale || 1);
  const areaFrac = Math.min(1, area / full);

  const vessel = skinned.find((p) => p.plugin?.liquid)?.plugin?.liquid;
  const fill = vessel ? juiceFill(vessel) : 0;
  const yieldAmt = areaFrac * (0.5 + fill) * DEFAULT_JUICE_CAPACITY;

  return { yieldAmt, skinned, areaFrac, fill, vessel };
}

export function createSqueezer(x, y) {
  const body = Bodies.rectangle(x, y, 72, 56, {
    friction: 0.45,
    density: 0.012,
    chamfer: { radius: 4 },
    label: "mach-squeezer",
    render: { visible: false },
  });
  body.plugin = {
    draw: "squeezer",
    squeezer: true,
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

/**
 * While active, pull nearby flesh in and crush skinned parts into juice (leave bones).
 */
export function tickSqueezer(squeezer, world, dt, particles) {
  if (!squeezer?.plugin?.squeezer) return;
  if (!squeezer.plugin.active) {
    squeezer.plugin.processT = 0;
    return;
  }

  const bx = squeezer.bounds;
  // Intake: mouth at top of machine
  const zone = {
    min: { x: bx.min.x - 8, y: bx.min.y - 36 },
    max: { x: bx.max.x + 8, y: bx.min.y + 20 },
  };

  const hits = Query.region(Composite.allBodies(world), zone).filter(
    (b) => b.plugin?.fruit && b.plugin.state !== "gone"
  );
  if (!hits.length) {
    squeezer.plugin.processT = 0;
    return;
  }

  // Suck parts toward the mouth
  const mx = (zone.min.x + zone.max.x) / 2;
  const my = (zone.min.y + zone.max.y) / 2;
  for (const p of hits) {
    // Already bones — don't keep sucking forever
    if (p.plugin.state === "skeleton") continue;
    const dx = mx - p.position.x;
    const dy = my - p.position.y;
    Body.applyForce(p, p.position, { x: dx * 0.00004, y: dy * 0.00005 + 0.0002 });
  }

  squeezer.plugin.processT = (squeezer.plugin.processT || 0) + dt;
  if (squeezer.plugin.processT < 0.55) return;
  squeezer.plugin.processT = 0;

  // Crush whatever skinned flesh is in the zone (group by ragdoll)
  const byRid = new Map();
  for (const h of hits) {
    const rid = h.plugin.ragdollId;
    if (!byRid.has(rid)) byRid.set(rid, []);
    byRid.get(rid).push(h);
  }

  for (const [, cluster] of byRid) {
    let { yieldAmt, skinned, vessel } = computeSqueezeYield(cluster);
    if (!skinned.length) continue;

    // Shared juice vessel may live on torso outside the intake zone
    if (!vessel) {
      const rid = skinned[0].plugin.ragdollId;
      const any = Composite.allBodies(world).find(
        (b) => b.plugin?.ragdollId === rid && b.plugin?.liquid
      );
      vessel = any?.plugin?.liquid || null;
      if (vessel) {
        const fill = juiceFill(vessel);
        const full = fullBodyArea(skinned[0].plugin?.scale || 1);
        let area = 0;
        for (const p of skinned) area += partSkinArea(p);
        const areaFrac = Math.min(1, area / full);
        yieldAmt = areaFrac * (0.5 + fill) * DEFAULT_JUICE_CAPACITY;
      }
    }
    if (yieldAmt < 0.5) continue;

    const tank = squeezer.plugin.liquid;
    const color = vessel?.color || skinned[0].plugin.fruit?.juice || "#b8e86a";
    const fruitKey = skinned[0].plugin.fruitKey || "melon";
    addLiquid(tank, yieldAmt, "juice", color, { fruitKey });

    // Drain proportional juice from the living
    if (vessel) {
      const drain = vessel.amount * (yieldAmt / ((0.5 + juiceFill(vessel)) * DEFAULT_JUICE_CAPACITY + 0.01));
      loseJuice(vessel, Math.min(vessel.amount, Math.max(yieldAmt * 0.35, drain)), particles, skinned[0].position);
      const all = Composite.allBodies(world).filter((b) => b.plugin?.ragdollId === skinned[0].plugin.ragdollId);
      applyJuiceConsciousness(all);
    }

    for (const p of skinned) {
      particles?.burst?.(p.position.x, p.position.y, color, 10, 4);
      particles?.drip?.(p.position.x, p.position.y, color, 3);
      stripToBone(p, particles);
    }
  }
}
