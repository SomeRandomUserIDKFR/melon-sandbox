/** Graft Vat — pipe in juice, paint flesh back onto skeleton parts. */

import { restoreSkin, FRUITS } from "./ragdoll.js";
import {
  createContainerVessel,
  addLiquid,
  loseJuice,
  applyJuiceConsciousness,
  syncLivingLiquid,
  parseHexColor,
  mixHexColors,
} from "./liquids.js";

const { Body, Bodies, Composite, Query } = Matter;

/** Juice cost to re-skin one skeleton part (tank units). */
function graftCost(body) {
  const part = body?.plugin?.part || "torso";
  if (part === "torso") return 22;
  if (part === "head") return 16;
  if (part === "foot") return 8;
  return 12;
}

/** Juice returned into the living’s vessel when a part is grafted. */
function graftJuiceGift(body) {
  return graftCost(body) * 0.55;
}

function colorDist(a, b) {
  const [r1, g1, b1] = parseHexColor(a);
  const [r2, g2, b2] = parseHexColor(b);
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2);
}

/** Closest catalog fruit by juice color. */
function nearestFruitKey(juiceColor) {
  let best = null;
  let bestD = Infinity;
  for (const [k, f] of Object.entries(FRUITS)) {
    const d = colorDist(juiceColor, f.juice);
    if (d < bestD) {
      bestD = d;
      best = k;
    }
  }
  return { key: best, dist: bestD };
}

function blendFruitAppearances(weights) {
  const entries = Object.entries(weights).filter(([k, v]) => v > 0.01 && FRUITS[k]);
  if (!entries.length) return null;
  if (entries.length === 1) {
    const k = entries[0][0];
    return { key: k, fruit: { ...FRUITS[k] } };
  }

  let amt = entries[0][1];
  let skin = FRUITS[entries[0][0]].skin;
  let stripe = FRUITS[entries[0][0]].stripe;
  let juice = FRUITS[entries[0][0]].juice;
  let juiceDark = FRUITS[entries[0][0]].juiceDark;
  let seed = FRUITS[entries[0][0]].seed;

  for (let i = 1; i < entries.length; i++) {
    const f = FRUITS[entries[i][0]];
    const a = entries[i][1];
    skin = mixHexColors(skin, amt, f.skin, a);
    stripe = mixHexColors(stripe, amt, f.stripe, a);
    juice = mixHexColors(juice, amt, f.juice, a);
    juiceDark = mixHexColors(juiceDark, amt, f.juiceDark, a);
    seed = mixHexColors(seed, amt, f.seed, a);
    amt += a;
  }

  const labels = entries
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([k]) => FRUITS[k].label);
  return {
    key: "mix",
    fruit: {
      label: labels.join("/"),
      skin,
      stripe,
      juice,
      juiceDark,
      seed,
    },
  };
}

/**
 * Flesh appearance from vat juice:
 * - known fruitMix weights → blend those skins
 * - else nearest fruit by juice color
 * - else synthesize palette from the juice hex
 */
export function fruitFromJuiceVessel(tank) {
  if (!tank || tank.amount < 0.05) return null;

  if (tank.fruitMix) {
    const cleaned = {};
    for (const [k, v] of Object.entries(tank.fruitMix)) {
      if (v > 0.05 && FRUITS[k]) cleaned[k] = v;
    }
    const blended = blendFruitAppearances(cleaned);
    if (blended) return blended;
  }

  const col = tank.color || "#b8e86a";
  const { key, dist } = nearestFruitKey(col);
  // Tight match → pure species flesh (pumpkin juice → pumpkin skin)
  if (key && dist < 95) return { key, fruit: { ...FRUITS[key] } };

  // Unknown / heavily mixed color → custom grafted flesh
  return {
    key: "mix",
    fruit: {
      label: "Graft",
      skin: mixHexColors(col, 2, "#505050", 0.35),
      stripe: mixHexColors(col, 1, "#202020", 0.7),
      juice: col,
      juiceDark: mixHexColors(col, 1, "#181818", 0.55),
      seed: "#2a2018",
    },
  };
}

export function createGraftVat(x, y) {
  const body = Bodies.rectangle(x, y, 70, 54, {
    friction: 0.45,
    density: 0.011,
    chamfer: { radius: 4 },
    label: "mach-graftVat",
    render: { visible: false },
  });
  body.plugin = {
    draw: "graftVat",
    graftVat: true,
    processT: 0,
    liquid: createContainerVessel({
      amount: 0,
      capacity: 180,
      color: "#b8e86a",
      type: "empty",
    }),
  };
  return body;
}

/**
 * While active: pull skeleton parts into the mouth and spend tank juice to
 * restore skin (tinted by that juice) + top up the living’s juice vessel.
 */
export function tickGraftVat(machine, world, dt, particles) {
  if (!machine?.plugin?.graftVat) return;
  if (!machine.plugin.active) {
    machine.plugin.processT = 0;
    return;
  }

  const tank = machine.plugin.liquid;
  if (!tank || tank.amount < 4) {
    machine.plugin.processT = 0;
    return;
  }

  const bx = machine.bounds;
  const zone = {
    min: { x: bx.min.x - 10, y: bx.min.y - 40 },
    max: { x: bx.max.x + 10, y: bx.min.y + 22 },
  };

  const bones = Query.region(Composite.allBodies(world), zone).filter(
    (b) => b.plugin?.fruit && b.plugin.state === "skeleton"
  );
  if (!bones.length) {
    machine.plugin.processT = 0;
    return;
  }

  // Gentle suck toward the vat mouth
  const mx = (zone.min.x + zone.max.x) / 2;
  const my = (zone.min.y + zone.max.y) / 2;
  for (const p of bones) {
    const dx = mx - p.position.x;
    const dy = my - p.position.y;
    Body.applyForce(p, p.position, { x: dx * 0.000035, y: dy * 0.00004 + 0.00012 });
  }

  machine.plugin.processT = (machine.plugin.processT || 0) + dt;
  if (machine.plugin.processT < 0.45) return;
  machine.plugin.processT = 0;

  // Snapshot mix before spend so flesh matches what was used
  const graftProfile = fruitFromJuiceVessel(tank);
  if (!graftProfile) return;

  bones.sort((a, b) => graftCost(a) - graftCost(b));

  for (const bone of bones) {
    const cost = graftCost(bone);
    if (tank.amount < cost) continue;

    const mixSnapshot = tank.fruitMix ? { ...tank.fruitMix } : null;
    const spent = loseJuice(tank, cost, particles, machine.position);
    if (spent < cost * 0.85) continue;

    if (tank.amount <= 0.05) {
      tank.type = "empty";
      tank.color = "#c8c8c8";
      tank.fruitMix = null;
    }

    const rid = bone.plugin.ragdollId;
    const livingParts = Composite.allBodies(world).filter(
      (b) => b.plugin?.ragdollId === rid && b.plugin.state !== "gone"
    );
    syncLivingLiquid(livingParts, bone.plugin.fruit);
    const vessel = bone.plugin.liquid || livingParts.find((p) => p.plugin?.liquid)?.plugin?.liquid;
    const gift = graftJuiceGift(bone);
    const juiceColor = graftProfile.fruit.juice || tank.color || "#b8e86a";
    if (vessel) {
      addLiquid(vessel, gift, "juice", juiceColor, {
        fruitKey: graftProfile.key !== "mix" ? graftProfile.key : null,
        fruitMix: mixSnapshot,
      });
      vessel.surviveUntilBelow = null;
    }

    // Flesh comes from the juice — pumpkin juice → pumpkin skin, mixes blend
    bone.plugin.fruit = graftProfile.fruit;
    bone.plugin.fruitKey = graftProfile.key;
    bone.plugin.grafted = true;

    restoreSkin([bone], { clearBruises: true, full: false });
    bone.plugin.hp = Math.max(bone.plugin.hp, bone.plugin.maxHp * 0.75);
    bone.plugin.state = "damaged";
    bone.plugin.conscious = true;
    bone.plugin.forceUnconscious = false;

    applyJuiceConsciousness(livingParts);

    particles?.burst?.(bone.position.x, bone.position.y, juiceColor, 14, 4);
    particles?.burst?.(bone.position.x, bone.position.y, graftProfile.fruit.skin, 10, 3);
    particles?.drip?.(machine.position.x, machine.position.y - 16, juiceColor, 4);

    break;
  }
}
