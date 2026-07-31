/** Fruit ragdolls — Melon Sandbox standing pose, juice damage, skeletons (no gore). */

import { initLivingLiquid, loseJuice, applyJuiceConsciousness, syncLivingLiquid, JUICE_DEATH_THRESHOLD } from "./liquids.js";


const { Bodies, Body, Composite, Constraint } = Matter;

export const FRUITS = {
  melon: {
    label: "Melon",
    skin: "#6fbf4a",
    stripe: "#3d8a2e",
    juice: "#b8e86a",
    juiceDark: "#7cb82e",
    seed: "#2a4018",
  },
  pumpkin: {
    label: "Pumpkin",
    skin: "#e8923a",
    stripe: "#c46e18",
    juice: "#ffc078",
    juiceDark: "#e07a20",
    seed: "#4a3010",
  },
  apple: {
    label: "Apple",
    skin: "#e05a4a",
    stripe: "#b83a2e",
    juice: "#ff9a7a",
    juiceDark: "#d44830",
    seed: "#3a2010",
  },
  lemon: {
    label: "Lemon",
    skin: "#f0d050",
    stripe: "#d4b020",
    juice: "#fff0a0",
    juiceDark: "#e8c830",
    seed: "#5a4810",
  },
};

/** Local draw sizes (width, height) — head uses radius via headR. */
export const PART_SIZE = {
  headR: 18,
  torso: [20, 28],
  upperArm: [8, 16],
  lowerArm: [7, 15],
  upperLeg: [10, 18],
  lowerLeg: [9, 16],
  foot: [14, 6],
};

const PART_HP = {
  head: 45,
  torso: 70,
  upperArm: 28,
  lowerArm: 22,
  upperLeg: 35,
  lowerLeg: 28,
  foot: 20,
};

function partOpts(fruit, part, extras = {}) {
  return {
    friction: extras.friction ?? 0.45,
    frictionAir: extras.frictionAir ?? 0.04,
    restitution: 0.05,
    density: extras.density || 0.0022,
    collisionFilter: { group: extras.group || 0 },
    label: `fruit-${part}`,
    render: { visible: false },
    plugin: {
      fruit,
      part,
      partSlot: extras.partSlot || part,
      side: extras.side || null,
      hp: PART_HP[part] ?? 30,
      maxHp: PART_HP[part] ?? 30,
      state: "alive", // alive | damaged | skeleton | gone
      juiceCooldown: 0,
      isLiving: true,
      bruises: 0,
      boneBroken: false,
      jointSprain: false,
      detached: false,
      conscious: true,
      lostJoints: [],
    },
  };
}

/** Pin joint at local offsets (Melon-style limb hinges). */
function pin(a, b, ax, ay, bx, by, stiffness = 0.9, damping = 0.12) {
  const c = Constraint.create({
    bodyA: a,
    bodyB: b,
    pointA: { x: ax, y: ay },
    pointB: { x: bx, y: by },
    stiffness,
    damping,
    length: 0,
    render: { visible: false },
  });
  c.plugin = {
    isFruitJoint: true,
    ragdollId: a.plugin.ragdollId,
    slotA: a.plugin.partSlot,
    slotB: b.plugin.partSlot,
    ax,
    ay,
    bx,
    by,
    stiffness,
    damping,
  };
  return c;
}

/**
 * Create a standing Melon Sandbox–style living.
 * `x,y` = ground contact under the feet (where they stand).
 */
export function createFruitRagdoll(world, x, y, fruitKey = "melon", scale = 1) {
  const fruit = FRUITS[fruitKey] || FRUITS.melon;
  const s = scale;
  const group = Body.nextGroup(true);

  const headR = PART_SIZE.headR * s;
  const [tw, th] = PART_SIZE.torso.map((v) => v * s);
  const [uaw, uah] = PART_SIZE.upperArm.map((v) => v * s);
  const [law, lah] = PART_SIZE.lowerArm.map((v) => v * s);
  const [ulw, ulh] = PART_SIZE.upperLeg.map((v) => v * s);
  const [llw, llh] = PART_SIZE.lowerLeg.map((v) => v * s);
  const [fw, fh] = PART_SIZE.foot.map((v) => v * s);

  // Total height from feet bottom → head top (standing)
  const stanceGap = 2 * s;
  const hipY = y - fh - llh - ulh / 2;
  const torsoCY = hipY - ulh / 2 - stanceGap - th / 2;
  const headCY = torsoCY - th / 2 - headR * 0.55;
  const shoulderY = torsoCY - th * 0.28;
  const armX = tw / 2 + uaw * 0.55;
  const legX = 7 * s;

  const head = Bodies.circle(
    x,
    headCY,
    headR,
    partOpts(fruit, "head", { group, density: 0.0016, frictionAir: 0.05, partSlot: "head" })
  );

  const torso = Bodies.rectangle(x, torsoCY, tw, th, {
    ...partOpts(fruit, "torso", { group, density: 0.0032, frictionAir: 0.05, partSlot: "torso" }),
    chamfer: { radius: 5 * s },
  });

  // Arms hang straight down at sides (classic Melon spawn pose)
  const lua = Bodies.rectangle(x - armX, shoulderY + uah / 2, uaw, uah, {
    ...partOpts(fruit, "upperArm", { group, density: 0.0015, partSlot: "lua", side: "L" }),
    chamfer: { radius: 3 * s },
  });
  const lla = Bodies.rectangle(x - armX, shoulderY + uah + lah / 2, law, lah, {
    ...partOpts(fruit, "lowerArm", { group, density: 0.0014, partSlot: "lla", side: "L" }),
    chamfer: { radius: 3 * s },
  });
  const rua = Bodies.rectangle(x + armX, shoulderY + uah / 2, uaw, uah, {
    ...partOpts(fruit, "upperArm", { group, density: 0.0015, partSlot: "rua", side: "R" }),
    chamfer: { radius: 3 * s },
  });
  const rla = Bodies.rectangle(x + armX, shoulderY + uah + lah / 2, law, lah, {
    ...partOpts(fruit, "lowerArm", { group, density: 0.0014, partSlot: "rla", side: "R" }),
    chamfer: { radius: 3 * s },
  });

  // Legs straight under hips
  const lul = Bodies.rectangle(x - legX, hipY, ulw, ulh, {
    ...partOpts(fruit, "upperLeg", { group, density: 0.0028, partSlot: "lul", side: "L" }),
    chamfer: { radius: 3 * s },
  });
  const lll = Bodies.rectangle(x - legX, hipY + ulh / 2 + llh / 2, llw, llh, {
    ...partOpts(fruit, "lowerLeg", { group, density: 0.0026, partSlot: "lll", side: "L" }),
    chamfer: { radius: 3 * s },
  });
  const rul = Bodies.rectangle(x + legX, hipY, ulw, ulh, {
    ...partOpts(fruit, "upperLeg", { group, density: 0.0028, partSlot: "rul", side: "R" }),
    chamfer: { radius: 3 * s },
  });
  const rll = Bodies.rectangle(x + legX, hipY + ulh / 2 + llh / 2, llw, llh, {
    ...partOpts(fruit, "lowerLeg", { group, density: 0.0026, partSlot: "rll", side: "R" }),
    chamfer: { radius: 3 * s },
  });

  // Feet for grip / Melon Sandbox silhouette
  const lf = Bodies.rectangle(x - legX + 2 * s, y - fh / 2, fw, fh, {
    ...partOpts(fruit, "foot", {
      group,
      density: 0.004,
      friction: 1.4,
      frictionAir: 0.02,
      partSlot: "lf",
      side: "L",
    }),
    chamfer: { radius: 2 * s },
  });
  const rf = Bodies.rectangle(x + legX + 2 * s, y - fh / 2, fw, fh, {
    ...partOpts(fruit, "foot", {
      group,
      density: 0.004,
      friction: 1.4,
      frictionAir: 0.02,
      partSlot: "rf",
      side: "R",
    }),
    chamfer: { radius: 2 * s },
  });

  const parts = [head, torso, lua, lla, rua, rla, lul, lll, rul, rll, lf, rf];
  const rid = `${fruitKey}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const fruitKeyStored = fruitKey;
  for (const p of parts) {
    p.plugin.ragdollId = rid;
    p.plugin.scale = s;
    p.plugin.fruitKey = fruitKeyStored;
    p.plugin.collisionGroup = group;
  }

  // Hinges at Melon Sandbox attachment points
  const constraints = [
    pin(head, torso, 0, headR * 0.85, 0, -th / 2, 0.95, 0.18),
    pin(torso, lua, -tw / 2, -th * 0.28, 0, -uah / 2, 0.88, 0.14),
    pin(torso, rua, tw / 2, -th * 0.28, 0, -uah / 2, 0.88, 0.14),
    pin(lua, lla, 0, uah / 2, 0, -lah / 2, 0.85, 0.12),
    pin(rua, rla, 0, uah / 2, 0, -lah / 2, 0.85, 0.12),
    pin(torso, lul, -legX * 0.35, th / 2, 0, -ulh / 2, 0.95, 0.2),
    pin(torso, rul, legX * 0.35, th / 2, 0, -ulh / 2, 0.95, 0.2),
    pin(lul, lll, 0, ulh / 2, 0, -llh / 2, 0.92, 0.18),
    pin(rul, rll, 0, ulh / 2, 0, -llh / 2, 0.92, 0.18),
    pin(lll, lf, 0, llh / 2, -2 * s, -fh / 2, 0.9, 0.15),
    pin(rll, rf, 0, llh / 2, -2 * s, -fh / 2, 0.9, 0.15),
  ];

  // Blueprint for heal/regrow reconnect + missing limb rebuild
  const blueprint = constraints.map((c) => ({ ...c.plugin }));
  for (const p of parts) {
    p.plugin.blueprint = blueprint;
  }

  // Zero velocities so they spawn planted
  for (const p of parts) {
    Body.setVelocity(p, { x: 0, y: 0 });
    Body.setAngularVelocity(p, 0);
  }

  Composite.add(world, [...parts, ...constraints]);

  initLivingLiquid(parts, fruit);

  return {
    parts,
    constraints,
    fruitKey,
    fruit,
    id: rid,
    torso,
    head,
    legs: [lul, lll, rul, rll, lf, rf],
  };
}

export function damagePart(body, amount, particles, at = null, opts = {}) {
  const pl = body.plugin;
  if (!pl || !pl.fruit || pl.state === "gone") return null;

  const silent = !!opts.silent;
  pl.hp -= amount;
  const cx = at?.x ?? body.position.x;
  const cy = at?.y ?? body.position.y;
  const juice = pl.fruit.juice;
  const juiceDark = pl.fruit.juiceDark;

  // Bruises accumulate from hits
  pl.bruises = Math.min(1, (pl.bruises || 0) + amount / (pl.maxHp * 1.8));

  // Spill juice on damage (KO applied in tickLiquids / applyJuiceConsciousness)
  if (pl.liquid) {
    loseJuice(pl.liquid, amount * 0.45, particles, { x: cx, y: cy });
  }

  if (pl.hp > pl.maxHp * 0.45 && pl.state === "alive") {
    if (!silent && pl.juiceCooldown <= 0) {
      particles.drip(cx, cy, juice, 4);
      pl.juiceCooldown = 0.12;
    }
    // Light sprain chance on hard hits while still "alive"
    if (amount > 18 && pl.part !== "torso" && pl.part !== "head") {
      pl.jointSprain = true;
    }
    return "drip";
  }

  if (pl.hp > 0 && pl.state !== "skeleton") {
    const wasAlive = pl.state === "alive";
    pl.state = "damaged";
    pl.jointSprain = true;
    if (!silent && wasAlive) {
      particles.burst(cx, cy, juice, 10, 4);
      particles.drip(cx, cy, juiceDark, 5);
    }
    return "damaged";
  }

  if (pl.hp <= 0 && pl.state !== "skeleton" && pl.state !== "gone") {
    pl.state = "skeleton";
    pl.hp = 0;
    pl.boneBroken = true;
    pl.conscious = false;
    particles.burst(cx, cy, juice, 28, 8);
    particles.burst(cx, cy, juiceDark, 12, 5);
    Body.set(body, { density: body.density * 0.55 });
    return "burst";
  }

  if (pl.state === "skeleton" && amount > 25) {
    pl.state = "gone";
    pl.conscious = false;
    particles.burst(cx, cy, "#c8c2b4", 8, 4);
    return "shatter";
  }

  return null;
}

/** Tear a limb free — marks dislocation and orphans the stump onto its own living id. */
export function detachLimb(world, body) {
  const pl = body.plugin;
  if (!pl?.ragdollId || pl.part === "torso") return false;
  const cons = Composite.allConstraints(world).filter(
    (c) => (c.bodyA === body || c.bodyB === body) && c.plugin?.isFruitJoint
  );
  if (!cons.length) return false;

  if (!pl.lostJoints) pl.lostJoints = [];
  for (const c of cons) {
    const other = c.bodyA === body ? c.bodyB : c.bodyA;
    if (other?.plugin) {
      other.plugin.jointSprain = true;
      if (!other.plugin.lostJoints) other.plugin.lostJoints = [];
      other.plugin.lostJoints.push({
        slotA: c.plugin.slotA,
        slotB: c.plugin.slotB,
        ax: c.plugin.ax,
        ay: c.plugin.ay,
        bx: c.plugin.bx,
        by: c.plugin.by,
        stiffness: c.plugin.stiffness,
        damping: c.plugin.damping,
      });
    }
    pl.lostJoints.push({
      slotA: c.plugin.slotA,
      slotB: c.plugin.slotB,
      ax: c.plugin.ax,
      ay: c.plugin.ay,
      bx: c.plugin.bx,
      by: c.plugin.by,
      stiffness: c.plugin.stiffness,
      damping: c.plugin.damping,
    });
  }

  Composite.remove(world, cons);
  pl.detached = true;
  pl.jointSprain = false;
  pl.conscious = false;

  // Orphan this stump (+ still-attached child segments) onto a new living id
  // so syringes / effects on the original body never hit it again.
  orphanSeveredCluster(world, body);
  return true;
}

/**
 * Assign a severed cluster its own ragdollId and strip body-wide effect links.
 * Safe to call repeatedly.
 */
export function orphanSeveredCluster(world, seedBody) {
  const cluster = getConnectedCluster(world, seedBody);
  if (!isSeveredCluster(cluster)) return null;
  // Already a lone fragment with unique id and no torso — still ensure effects don't sync
  const forked = forkLivingFromLimb(world, seedBody);
  if (!forked) return null;
  for (const b of forked.cluster) {
    // Keep local damage state, but drop effects that belonged to the old body
    if (b.plugin.effects) {
      // Limb keeps nothing inherited — fresh fragment
      b.plugin.effects = {};
    }
    b.plugin.detached = true;
  }
  return forked;
}

function findSlot(parts, slot) {
  return parts.find((p) => p.plugin?.partSlot === slot && p.plugin.state !== "gone");
}

function jointAlreadyExists(world, slotA, slotB, rid) {
  return Composite.allConstraints(world).some(
    (c) =>
      c.plugin?.isFruitJoint &&
      c.plugin.ragdollId === rid &&
      ((c.plugin.slotA === slotA && c.plugin.slotB === slotB) ||
        (c.plugin.slotA === slotB && c.plugin.slotB === slotA))
  );
}

/** Reconnect dislocated joints when parts are close enough. */
export function reconnectJoints(world, parts, maxDist = 90) {
  const rid = parts[0]?.plugin?.ragdollId;
  if (!rid) return 0;
  let fixed = 0;

  const recipes = [];
  for (const p of parts) {
    if (p.plugin?.lostJoints?.length) recipes.push(...p.plugin.lostJoints);
    if (p.plugin?.blueprint) {
      for (const bp of p.plugin.blueprint) {
        recipes.push(bp);
      }
    }
  }

  // Dedupe recipes by slot pair
  const seen = new Set();
  for (const r of recipes) {
    if (!r?.slotA || !r?.slotB) continue;
    const key = [r.slotA, r.slotB].sort().join(":");
    if (seen.has(key)) continue;
    seen.add(key);
    if (jointAlreadyExists(world, r.slotA, r.slotB, rid)) continue;

    const a = findSlot(parts, r.slotA);
    const b = findSlot(parts, r.slotB);
    if (!a || !b) continue;
    // Never weld across different livings / severed fragments
    if (a.plugin.ragdollId !== rid || b.plugin.ragdollId !== rid) continue;
    if (a.plugin.ragdollId !== b.plugin.ragdollId) continue;

    const dist = Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y);
    if (dist > maxDist) continue;

    const c = Constraint.create({
      bodyA: a,
      bodyB: b,
      pointA: { x: r.ax, y: r.ay },
      pointB: { x: r.bx, y: r.by },
      stiffness: r.stiffness ?? 0.9,
      damping: r.damping ?? 0.12,
      length: 0,
      render: { visible: false },
    });
    c.plugin = {
      isFruitJoint: true,
      ragdollId: rid,
      slotA: r.slotA,
      slotB: r.slotB,
      ax: r.ax,
      ay: r.ay,
      bx: r.bx,
      by: r.by,
      stiffness: r.stiffness,
      damping: r.damping,
    };
    Composite.add(world, c);
    a.plugin.detached = false;
    b.plugin.detached = false;
    a.plugin.jointSprain = false;
    b.plugin.jointSprain = false;
    fixed++;
  }

  for (const p of parts) {
    if (p.plugin) p.plugin.lostJoints = [];
  }
  return fixed;
}

/** Heal broken bones that are still present (not shattered/gone). */
export function healBones(parts) {
  let n = 0;
  for (const p of parts) {
    const pl = p.plugin;
    if (!pl || pl.state === "gone") continue;
    if (pl.boneBroken || pl.state === "skeleton") {
      pl.boneBroken = false;
      n++;
    }
    pl.jointSprain = false;
  }
  return n;
}

/** Wake / revive — works even on intact skeletons. Does not restore juice. */
export function wakeLiving(parts) {
  for (const p of parts) {
    const pl = p.plugin;
    if (!pl || pl.state === "gone") continue;
    pl.conscious = true;
    pl.forceUnconscious = false;
    if (pl.state === "skeleton") {
      pl.hp = Math.max(pl.hp, pl.maxHp * 0.15);
    } else if (pl.hp < pl.maxHp * 0.35) {
      pl.hp = pl.maxHp * 0.45;
    }
  }
}

/** Restore flesh on parts that still have a body (not gone). */
export function restoreSkin(parts, { clearBruises = true, full = false } = {}) {
  for (const p of parts) {
    const pl = p.plugin;
    if (!pl || pl.state === "gone") continue;
    pl.acidDecay = 0;
    if (clearBruises) pl.bruises = 0;
    pl.boneBroken = false;
    pl.jointSprain = false;
    if (pl.state === "skeleton" || pl.state === "damaged") {
      pl.state = full ? "alive" : "damaged";
      pl.hp = full ? pl.maxHp : Math.max(pl.hp, pl.maxHp * 0.7);
    } else if (full) {
      pl.hp = pl.maxHp;
      pl.state = "alive";
    }
    pl.conscious = true;
  }
}

/** BFS cluster of fruit parts linked by joints. */
export function getConnectedCluster(world, seed) {
  if (!seed?.plugin?.ragdollId) return [];
  const rid = seed.plugin.ragdollId;
  const bodies = Composite.allBodies(world).filter((b) => b.plugin?.ragdollId === rid);
  const cons = Composite.allConstraints(world).filter(
    (c) => c.plugin?.isFruitJoint && c.plugin.ragdollId === rid
  );
  const adj = new Map();
  for (const b of bodies) adj.set(b, []);
  for (const c of cons) {
    if (!adj.has(c.bodyA) || !adj.has(c.bodyB)) continue;
    adj.get(c.bodyA).push(c.bodyB);
    adj.get(c.bodyB).push(c.bodyA);
  }
  const out = [];
  const seen = new Set();
  const stack = [seed];
  while (stack.length) {
    const b = stack.pop();
    if (seen.has(b)) continue;
    seen.add(b);
    out.push(b);
    for (const n of adj.get(b) || []) stack.push(n);
  }
  return out;
}

export const ALL_PART_SLOTS = ["head", "torso", "lua", "lla", "rua", "rla", "lul", "lll", "rul", "rll", "lf", "rf"];

/** True if this cluster is a severed piece (no torso, or marked detached stump). */
export function isSeveredCluster(cluster) {
  if (!cluster.length) return false;
  const hasTorso = cluster.some((b) => b.plugin?.partSlot === "torso" && b.plugin.state !== "gone");
  if (!hasTorso) return true;
  // Detached limb still tagged, even if somehow with other bits
  if (cluster.every((b) => b.plugin?.detached) && cluster.length < ALL_PART_SLOTS.length) return true;
  return false;
}

/**
 * Split a severed limb cluster off the original living:
 * new ragdollId, no joints back to the old body, ready to grow a new living.
 */
export function forkLivingFromLimb(world, seedBody) {
  const cluster = getConnectedCluster(world, seedBody);
  if (!cluster.length || !isSeveredCluster(cluster)) return null;

  const oldRid = seedBody.plugin.ragdollId;
  const newRid = `fork-${seedBody.plugin.fruitKey || "melon"}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const newGroup = Body.nextGroup(true);
  const blueprint = seedBody.plugin.blueprint || [];

  // Cut any leftover constraints to bodies outside this cluster
  const clusterSet = new Set(cluster);
  const cross = Composite.allConstraints(world).filter((c) => {
    if (!c.bodyA || !c.bodyB) return false;
    const aIn = clusterSet.has(c.bodyA);
    const bIn = clusterSet.has(c.bodyB);
    return (aIn && !bIn) || (!aIn && bIn);
  });
  if (cross.length) Composite.remove(world, cross);

  // Original living: drop lost-joint recipes pointing at forked slots
  const forkedSlots = new Set(cluster.map((b) => b.plugin.partSlot));
  for (const b of Composite.allBodies(world)) {
    if (b.plugin?.ragdollId !== oldRid || !b.plugin.lostJoints) continue;
    b.plugin.lostJoints = b.plugin.lostJoints.filter(
      (j) => !forkedSlots.has(j.slotA) && !forkedSlots.has(j.slotB)
    );
  }

  for (const b of cluster) {
    const pl = b.plugin;
    pl.ragdollId = newRid;
    pl.collisionGroup = newGroup;
    b.collisionFilter = { ...b.collisionFilter, group: newGroup };
    pl.blueprint = blueprint.length ? blueprint : pl.blueprint;
    pl.lostJoints = [];
    pl.detached = false;
    pl.conscious = true;
    pl.forkedFrom = oldRid;
    pl.seedLimb = true;
    if (!pl.effects) pl.effects = {};
    pl.effects.acid = null;
    pl.effects.heal = null;
    pl.effects.regen = null;
    pl.effects.regrow = null;
  }

  // New living gets its own juice vessel (keep leftover juice in the stump)
  const oldLiquid = seedBody.plugin.liquid;
  const stumpJuice = oldLiquid ? Math.min(oldLiquid.amount, 25) : 20;
  if (oldLiquid) oldLiquid.amount = Math.max(0, oldLiquid.amount - stumpJuice);
  const newVessel = initLivingLiquid(cluster, seedBody.plugin.fruit);
  newVessel.amount = stumpJuice;
  applyJuiceConsciousness(cluster);

  // Update joint plugins on remaining internal constraints to new rid
  for (const c of Composite.allConstraints(world)) {
    if (!c.plugin?.isFruitJoint) continue;
    if (clusterSet.has(c.bodyA) && clusterSet.has(c.bodyB)) {
      c.plugin.ragdollId = newRid;
    }
  }

  return { cluster, newRid, oldRid, seed: seedBody };
}

/** Recreate a missing limb/torso near an anchor for regrow (works without existing torso). */
export function regrowMissingPart(world, parts, slot) {
  const sample = parts.find((p) => p.plugin?.ragdollId && p.plugin.state !== "gone");
  if (!sample) return null;
  const pl0 = sample.plugin;
  const rid = pl0.ragdollId;
  const s = pl0.scale || 1;
  const fruit = pl0.fruit;
  const fruitKey = pl0.fruitKey || "melon";
  const group = pl0.collisionGroup || Body.nextGroup(true);

  if (parts.some((p) => p.plugin?.partSlot === slot && p.plugin.state !== "gone")) return null;

  const torso = parts.find((p) => p.plugin?.partSlot === "torso" && p.plugin.state !== "gone");
  const anchor = torso || sample;
  const ax = anchor.position.x;
  const ay = anchor.position.y;

  const sizes = {
    head: () =>
      Bodies.circle(ax, ay - 40 * s, PART_SIZE.headR * s, partOpts(fruit, "head", { group, partSlot: "head", density: 0.0016 })),
    torso: () =>
      Bodies.rectangle(ax, ay + (torso ? 0 : 10) * s, PART_SIZE.torso[0] * s, PART_SIZE.torso[1] * s, {
        ...partOpts(fruit, "torso", { group, partSlot: "torso", density: 0.0032 }),
        chamfer: { radius: 5 * s },
      }),
    lua: () =>
      Bodies.rectangle(ax - 20 * s, ay, PART_SIZE.upperArm[0] * s, PART_SIZE.upperArm[1] * s, {
        ...partOpts(fruit, "upperArm", { group, partSlot: "lua", side: "L" }),
        chamfer: { radius: 3 * s },
      }),
    lla: () =>
      Bodies.rectangle(ax - 22 * s, ay + 16 * s, PART_SIZE.lowerArm[0] * s, PART_SIZE.lowerArm[1] * s, {
        ...partOpts(fruit, "lowerArm", { group, partSlot: "lla", side: "L" }),
        chamfer: { radius: 3 * s },
      }),
    rua: () =>
      Bodies.rectangle(ax + 20 * s, ay, PART_SIZE.upperArm[0] * s, PART_SIZE.upperArm[1] * s, {
        ...partOpts(fruit, "upperArm", { group, partSlot: "rua", side: "R" }),
        chamfer: { radius: 3 * s },
      }),
    rla: () =>
      Bodies.rectangle(ax + 22 * s, ay + 16 * s, PART_SIZE.lowerArm[0] * s, PART_SIZE.lowerArm[1] * s, {
        ...partOpts(fruit, "lowerArm", { group, partSlot: "rla", side: "R" }),
        chamfer: { radius: 3 * s },
      }),
    lul: () =>
      Bodies.rectangle(ax - 8 * s, ay + 28 * s, PART_SIZE.upperLeg[0] * s, PART_SIZE.upperLeg[1] * s, {
        ...partOpts(fruit, "upperLeg", { group, partSlot: "lul", side: "L" }),
        chamfer: { radius: 3 * s },
      }),
    lll: () =>
      Bodies.rectangle(ax - 8 * s, ay + 46 * s, PART_SIZE.lowerLeg[0] * s, PART_SIZE.lowerLeg[1] * s, {
        ...partOpts(fruit, "lowerLeg", { group, partSlot: "lll", side: "L" }),
        chamfer: { radius: 3 * s },
      }),
    rul: () =>
      Bodies.rectangle(ax + 8 * s, ay + 28 * s, PART_SIZE.upperLeg[0] * s, PART_SIZE.upperLeg[1] * s, {
        ...partOpts(fruit, "upperLeg", { group, partSlot: "rul", side: "R" }),
        chamfer: { radius: 3 * s },
      }),
    rll: () =>
      Bodies.rectangle(ax + 8 * s, ay + 46 * s, PART_SIZE.lowerLeg[0] * s, PART_SIZE.lowerLeg[1] * s, {
        ...partOpts(fruit, "lowerLeg", { group, partSlot: "rll", side: "R" }),
        chamfer: { radius: 3 * s },
      }),
    lf: () =>
      Bodies.rectangle(ax - 6 * s, ay + 58 * s, PART_SIZE.foot[0] * s, PART_SIZE.foot[1] * s, {
        ...partOpts(fruit, "foot", { group, partSlot: "lf", side: "L", friction: 1.4 }),
        chamfer: { radius: 2 * s },
      }),
    rf: () =>
      Bodies.rectangle(ax + 6 * s, ay + 58 * s, PART_SIZE.foot[0] * s, PART_SIZE.foot[1] * s, {
        ...partOpts(fruit, "foot", { group, partSlot: "rf", side: "R", friction: 1.4 }),
        chamfer: { radius: 2 * s },
      }),
  };

  const make = sizes[slot];
  if (!make) return null;
  const body = make();
  body.plugin.ragdollId = rid;
  body.plugin.scale = s;
  body.plugin.fruitKey = fruitKey;
  body.plugin.collisionGroup = group;
  body.collisionFilter = { ...body.collisionFilter, group };
  body.plugin.blueprint = pl0.blueprint || [];
  body.plugin.state = "damaged";
  body.plugin.hp = body.plugin.maxHp * 0.45;
  body.plugin.conscious = true;
  body.plugin.bruises = 0;
  body.plugin.detached = false;
  // Share the living's juice vessel
  const vessel = parts.find((p) => p.plugin?.liquid)?.plugin.liquid;
  if (vessel) body.plugin.liquid = vessel;
  Composite.add(world, body);
  return body;
}

/** Preferred growth order when building a body from a stump. */
export const REGROW_ORDER = [
  "torso",
  "head",
  "lua",
  "rua",
  "lla",
  "rla",
  "lul",
  "rul",
  "lll",
  "rll",
  "lf",
  "rf",
];

/** Keep alive livings upright like Melon Sandbox muscle/balance. */
export function applyStandingMuscle(bodies) {
  const byId = new Map();
  for (const b of bodies) {
    const rid = b.plugin?.ragdollId;
    if (!rid || !b.plugin?.isLiving) continue;
    if (!byId.has(rid)) byId.set(rid, []);
    byId.get(rid).push(b);
  }

  for (const parts of byId.values()) {
    const torso = parts.find((p) => p.plugin.part === "torso");
    if (!torso) continue;
    if (torso.plugin.state === "gone") continue;
    if (torso.plugin.effects?.frozen || torso.plugin.frozen) continue;
    if (torso.plugin.shock) continue;
    if (torso.plugin.burn && torso.plugin.burn.intensity > 1.1) continue;
    // Juice-unconscious livings don't stand
    if (!torso.plugin.conscious) continue;

    const acidWeak = torso.plugin.acidDecay || 0;
    const ratio = torso.plugin.hp / torso.plugin.maxHp;
    const standing =
      torso.plugin.state === "alive" ||
      torso.plugin.state === "skeleton" ||
      (torso.plugin.state === "damaged" && ratio > 0.15);
    if (!standing) continue;

    const strength =
      (torso.plugin.state === "alive" ? 1 : torso.plugin.state === "skeleton" ? 0.7 : 0.55) *
      (1 - acidWeak * 0.85);
    if (strength < 0.08) continue;

    for (const p of parts) {
      if (p.plugin.state === "gone" || p.plugin.detached) continue;
      if (p.plugin.state === "skeleton" && !p.plugin.conscious) continue;
      const part = p.plugin.part;
      let k = 0;
      if (part === "torso") k = 0.085;
      else if (part === "head") k = 0.05;
      else if (part === "upperLeg" || part === "lowerLeg") k = 0.07;
      else if (part === "foot") k = 0.06;
      else if (part === "upperArm" || part === "lowerArm") k = 0.02;
      if (!k) continue;
      if (p.plugin.jointSprain) k *= 0.35;

      const damp = 0.028;
      p.torque += (-p.angle * k - p.angularVelocity * damp) * strength;

      if (Math.abs(p.angle) < 0.35 && (part === "torso" || part === "upperLeg" || part === "lowerLeg" || part === "foot")) {
        Body.setAngle(p, p.angle * (1 - 0.08 * strength));
        Body.setAngularVelocity(p, p.angularVelocity * 0.85);
      }
    }
  }
}

function drawBone(ctx, body, kind) {
  const { x, y } = body.position;
  const a = body.angle;
  const s = body.plugin?.scale || 1;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  ctx.strokeStyle = "#e8e0d0";
  ctx.fillStyle = "#d4ccc0";
  ctx.lineWidth = 2.2;
  ctx.lineCap = "round";

  if (kind === "head") {
    ctx.beginPath();
    ctx.arc(0, 0, 10 * s, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = body.plugin?.conscious ? "#3a2018" : "#2a2a28";
    ctx.beginPath();
    ctx.arc(-4 * s, -1 * s, 2 * s, 0, Math.PI * 2);
    ctx.arc(4 * s, -1 * s, 2 * s, 0, Math.PI * 2);
    ctx.fill();
    if (body.plugin?.conscious) {
      ctx.fillStyle = "#e06080";
      ctx.beginPath();
      ctx.arc(-4 * s, -1 * s, 0.7 * s, 0, Math.PI * 2);
      ctx.arc(4 * s, -1 * s, 0.7 * s, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (kind === "torso") {
    ctx.beginPath();
    ctx.moveTo(-6 * s, -12 * s);
    ctx.lineTo(6 * s, -12 * s);
    ctx.lineTo(5 * s, 12 * s);
    ctx.lineTo(-5 * s, 12 * s);
    ctx.closePath();
    ctx.stroke();
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(-5 * s, i * 6 * s);
      ctx.lineTo(5 * s, i * 6 * s);
      ctx.stroke();
    }
  } else if (kind === "foot") {
    ctx.beginPath();
    ctx.moveTo(-6 * s, 0);
    ctx.lineTo(6 * s, 0);
    ctx.stroke();
  } else {
    const h = kind.includes("Arm") ? 14 * s : 16 * s;
    ctx.beginPath();
    ctx.moveTo(0, -h / 2);
    ctx.lineTo(0, h / 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, -h / 2, 2.5 * s, 0, Math.PI * 2);
    ctx.arc(0, h / 2, 2.5 * s, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawFlesh(ctx, body, fruit, damaged) {
  const { x, y } = body.position;
  const a = body.angle;
  const part = body.plugin.part;
  const s = body.plugin.scale || 1;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);

  const skinBase = damaged ? fruit.juiceDark : fruit.skin;
  const acid = body.plugin.acidDecay || 0;
  // Acid melts skin toward sickly yellow-green, then bone
  const skin =
    acid > 0
      ? lerpColor(skinBase, acid > 0.65 ? "#c8c2b0" : "#a8c040", Math.min(1, acid * 1.2))
      : skinBase;
  const stripe = acid > 0.4 ? "#6a7020" : fruit.stripe;

  if (part === "head") {
    const r = PART_SIZE.headR * s;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = skin;
    ctx.fill();
    // Melon Sandbox vertical stripes
    ctx.strokeStyle = stripe;
    ctx.lineWidth = 2.8 * s;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.ellipse(i * 5.5 * s, 0, 2.4 * s, r * 0.92, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Classic blank Melon face (no smile — testing-lab look)
    ctx.fillStyle = "#1a1a18";
    ctx.beginPath();
    ctx.arc(-5 * s, -1.5 * s, 2.2 * s, 0, Math.PI * 2);
    ctx.arc(5 * s, -1.5 * s, 2.2 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(-3.5 * s, 5 * s, 7 * s, 1.6 * s);
    const bruises = body.plugin.bruises || 0;
  if (damaged || acid > 0.2 || bruises > 0.15) {
      ctx.fillStyle = acid > 0.2 ? "#c8e060" : fruit.juiceDark;
      ctx.globalAlpha = 0.25 + acid * 0.4 + bruises * 0.35;
      ctx.beginPath();
      ctx.arc(-6 * s, 7 * s, 5 * s, 0, Math.PI * 2);
      ctx.arc(7 * s, -5 * s, 3.5 * s, 0, Math.PI * 2);
      if (acid > 0.45 || bruises > 0.4) ctx.arc(0, 2 * s, 6 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  } else {
    const sizes = {
      torso: PART_SIZE.torso,
      upperArm: PART_SIZE.upperArm,
      lowerArm: PART_SIZE.lowerArm,
      upperLeg: PART_SIZE.upperLeg,
      lowerLeg: PART_SIZE.lowerLeg,
      foot: PART_SIZE.foot,
    };
    const [bw0, bh0] = sizes[part] || [12, 16];
    const bw = bw0 * s;
    const bh = bh0 * s;
    const rr = Math.min(bw, bh) * 0.3;
    roundRect(ctx, -bw / 2, -bh / 2, bw, bh, rr);
    ctx.fillStyle = skin;
    ctx.fill();

    // Interior juice fill (empty = “nothing” above the liquid line)
    const vessel = body.plugin.liquid;
    if (vessel && part === "torso") {
      const fill = Math.max(0, Math.min(1, vessel.amount / vessel.capacity));
      ctx.save();
      ctx.beginPath();
      roundRect(ctx, -bw / 2, -bh / 2, bw, bh, rr);
      ctx.clip();
      // empty cavity
      ctx.fillStyle = "rgba(20,22,24,0.35)";
      ctx.fillRect(-bw / 2, -bh / 2, bw, bh * (1 - fill));
      // juice body
      ctx.fillStyle = vessel.color || fruit.juice;
      ctx.globalAlpha = 0.55;
      ctx.fillRect(-bw / 2, -bh / 2 + bh * (1 - fill), bw, bh * fill);
      ctx.globalAlpha = 1;
      // meniscus
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-bw / 2, -bh / 2 + bh * (1 - fill));
      ctx.lineTo(bw / 2, -bh / 2 + bh * (1 - fill));
      ctx.stroke();
      ctx.restore();
    }

    ctx.strokeStyle = stripe;
    ctx.lineWidth = 1.8 * s;
    if (part !== "foot") {
      ctx.beginPath();
      ctx.moveTo(-bw * 0.22, -bh * 0.35);
      ctx.lineTo(-bw * 0.22, bh * 0.35);
      ctx.moveTo(bw * 0.18, -bh * 0.3);
      ctx.lineTo(bw * 0.18, bh * 0.3);
      ctx.stroke();
    }
    const bruises = body.plugin.bruises || 0;
    if (damaged || acid > 0.2 || bruises > 0.15) {
      ctx.fillStyle = acid > 0.2 ? "#c8e060" : fruit.juiceDark;
      ctx.globalAlpha = 0.25 + acid * 0.4 + bruises * 0.35;
      ctx.beginPath();
      ctx.arc(-bw * 0.15, bh * 0.1, Math.min(bw, bh) * 0.28, 0, Math.PI * 2);
      if (acid > 0.5 || bruises > 0.45) {
        ctx.arc(bw * 0.2, -bh * 0.15, Math.min(bw, bh) * 0.2, 0, Math.PI * 2);
      }
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
  ctx.restore();
}

function lerpColor(a, b, t) {
  const pa = hexToRgb(a);
  const pb = hexToRgb(b);
  if (!pa || !pb) return a;
  const r = Math.round(pa.r + (pb.r - pa.r) * t);
  const g = Math.round(pa.g + (pb.g - pa.g) * t);
  const bl = Math.round(pa.b + (pb.b - pa.b) * t);
  return `rgb(${r},${g},${bl})`;
}

function hexToRgb(hex) {
  if (!hex || hex[0] !== "#" || (hex.length !== 7 && hex.length !== 4)) return null;
  let h = hex.slice(1);
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function drawFruitBody(ctx, body) {
  const pl = body.plugin;
  if (!pl?.fruit || pl.state === "gone") return;

  if (pl.state === "skeleton") {
    drawBone(ctx, body, pl.part);
    return;
  }

  drawFlesh(ctx, body, pl.fruit, pl.state === "damaged" || (pl.bruises || 0) > 0.35);

  // Fire / shock overlays
  if (pl.burn || pl.shock || (pl.wet || 0) > 0.4) {
    const { x, y } = body.position;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(body.angle);
    if (pl.burn) {
      ctx.fillStyle = "rgba(255,100,30,0.4)";
      ctx.beginPath();
      ctx.arc(0, -6, 12 * (pl.scale || 1), 0, Math.PI * 2);
      ctx.fill();
    }
    if (pl.shock) {
      ctx.strokeStyle = "rgba(140,210,255,0.9)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-8, -10);
      ctx.lineTo(0, 2);
      ctx.lineTo(-6, 2);
      ctx.lineTo(8, 12);
      ctx.stroke();
    }
    if ((pl.wet || 0) > 0.4) {
      ctx.fillStyle = "rgba(80,160,210,0.28)";
      ctx.fillRect(-10, -10, 20, 20);
    }
    ctx.restore();
  }

  // Juice fill meter on torso
  if (pl.part === "torso" && pl.liquid) {
    const v = pl.liquid;
    const fill = Math.max(0, Math.min(1, v.amount / v.capacity));
    const { x, y } = body.position;
    const s = pl.scale || 1;
    const bw = 16 * s;
    const bh = 4 * s;
    ctx.save();
    ctx.translate(x, y - 22 * s);
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(-bw / 2, 0, bw, bh);
    ctx.fillStyle = v.color || "#b8e86a";
    ctx.fillRect(-bw / 2, 0, bw * fill, bh);
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 1;
    ctx.strokeRect(-bw / 2, 0, bw, bh);
    // empty / dead mark
    const thr = JUICE_DEATH_THRESHOLD;
    ctx.strokeStyle = "rgba(220,80,60,0.8)";
    ctx.beginPath();
    ctx.moveTo(-bw / 2 + bw * thr, -1);
    ctx.lineTo(-bw / 2 + bw * thr, bh + 1);
    ctx.stroke();
    if (!pl.conscious) {
      ctx.fillStyle = "rgba(180,40,40,0.85)";
      ctx.font = `${9 * s}px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText("KO", 0, -3);
    } else {
      ctx.fillStyle = "rgba(230,230,230,0.75)";
      ctx.font = `${8 * s}px sans-serif`;
      ctx.textAlign = "center";
      const pct = Math.round(fill * 100);
      ctx.fillText(`${pct}% / ${100 - pct}%`, 0, -3);
    }
    ctx.restore();
  }
}

export function tickFruitPlugins(bodies, dt) {
  for (const b of bodies) {
    if (b.plugin?.juiceCooldown > 0) b.plugin.juiceCooldown -= dt;
  }
}
