/** Fruit ragdolls — Melon Sandbox standing pose, juice damage, skeletons (no gore). */

import { initLivingLiquid, loseJuice, applyJuiceConsciousness, syncLivingLiquid, JUICE_DEATH_THRESHOLD } from "./liquids.js";
import { drawSprite } from "./sprites.js";

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
  corn: {
    label: "Corn",
    skin: "#f0d060",
    stripe: "#d4a820",
    juice: "#fff0a8",
    juiceDark: "#e0b830",
    seed: "#8a6020",
  },
  cactus: {
    label: "Cactus",
    skin: "#4a9a58",
    stripe: "#2e7040",
    juice: "#90e0a0",
    juiceDark: "#3a8048",
    seed: "#1a4020",
  },
  tomato: {
    label: "Tomato",
    skin: "#d43828",
    stripe: "#a02818",
    juice: "#ff6a50",
    juiceDark: "#c02818",
    seed: "#4a1810",
  },
  robot: {
    label: "Robot",
    skin: "#8a9098",
    stripe: "#5a6068",
    juice: "#60c8e0",
    juiceDark: "#3080a0",
    seed: "#2a3040",
    metal: true,
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
  head: 58,
  torso: 90,
  upperArm: 36,
  lowerArm: 30,
  upperLeg: 44,
  lowerLeg: 36,
  foot: 26,
};

/** Skeleton durability — bones are tougher than flesh (shatter only after this pool is gone). */
const BONE_HP = {
  head: 150,
  torso: 240,
  upperArm: 95,
  lowerArm: 80,
  upperLeg: 120,
  lowerLeg: 95,
  foot: 70,
};

function fleshMaxHp(part) {
  return PART_HP[part] ?? 30;
}

export function boneMaxHp(part) {
  return BONE_HP[part] ?? Math.round(fleshMaxHp(part) * 2.5);
}

/** Put a fleshed part into skeleton state with full bone HP. */
export function stripToBone(body, particles) {
  const pl = body?.plugin;
  if (!pl?.fruit || pl.state === "skeleton" || pl.state === "gone") return false;
  pl.fleshMaxHp = pl.fleshMaxHp || pl.maxHp || fleshMaxHp(pl.part);
  pl.state = "skeleton";
  pl.maxHp = boneMaxHp(pl.part);
  pl.hp = pl.maxHp;
  pl.boneBroken = true;
  pl.conscious = false;
  Body.set(body, { density: Math.max(0.0004, body.density * 0.55) });
  particles?.burst?.(body.position.x, body.position.y, "#c8c2b4", 6, 3);
  return true;
}

function partOpts(fruit, part, extras = {}) {
  return {
    friction: extras.friction ?? 0.45,
    frictionAir: extras.frictionAir ?? 0.01,
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
      ai: { mode: "idle", dir: 1, timer: 0, phase: 0, punchCd: 0 },
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
    partOpts(fruit, "head", { group, density: 0.0016, frictionAir: 0.01, partSlot: "head" })
  );

  const torso = Bodies.rectangle(x, torsoCY, tw, th, {
    ...partOpts(fruit, "torso", { group, density: 0.0032, frictionAir: 0.01, partSlot: "torso" }),
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
  const wasSkeleton = pl.state === "skeleton";
  pl.hp -= amount;
  const cx = at?.x ?? body.position.x;
  const cy = at?.y ?? body.position.y;
  const juice = pl.fruit.juice;
  const juiceDark = pl.fruit.juiceDark;

  // Bruises accumulate from hits
  pl.bruises = Math.min(1, (pl.bruises || 0) + amount / (pl.maxHp * 1.8));

  // Spill juice on damage (KO applied in tickLiquids / applyJuiceConsciousness)
  if (pl.liquid && !wasSkeleton) {
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
    // Flesh gone — bones take over with their own (higher) HP pool.
    // Overflow damage from this hit chips the bone instead of shattering instantly.
    const overflow = Math.max(0, -pl.hp);
    pl.state = "skeleton";
    pl.fleshMaxHp = pl.fleshMaxHp || pl.maxHp || fleshMaxHp(pl.part);
    const mul = pl.boneHpMul != null ? pl.boneHpMul : 1;
    pl.maxHp = boneMaxHp(pl.part) * mul;
    pl.hp = Math.max(0, pl.maxHp - overflow);
    pl.boneBroken = true;
    pl.conscious = false;
    particles.burst(cx, cy, juice, 28, 8);
    particles.burst(cx, cy, juiceDark, 12, 5);
    Body.set(body, { density: body.density * 0.55 });
    if (pl.hp <= 0) {
      pl.state = "gone";
      particles.burst(cx, cy, "#c8c2b4", 8, 4);
      return "shatter";
    }
    return "burst";
  }

  // Skeleton: break only after bone HP is depleted
  if (pl.state === "skeleton" && pl.hp <= 0) {
    pl.state = "gone";
    pl.conscious = false;
    particles.burst(cx, cy, "#c8c2b4", 8, 4);
    return "shatter";
  }

  return wasSkeleton ? "drip" : null;
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
    // Don't pin budding limbs with a second joint — grow tether already holds them
    if (a.plugin.growing || b.plugin.growing) continue;

    const wa = localToWorld(a, r.ax, r.ay);
    const wb = localToWorld(b, r.bx, r.by);
    const gap = Math.hypot(wa.x - wb.x, wa.y - wb.y);
    if (gap > maxDist) continue;

    // Soft reconnect when anchors aren't seated — length-0 across gaps explodes
    const seated = gap <= 24;
    const baseStiff = r.stiffness ?? 0.9;
    const stiff = seated
      ? Math.min(baseStiff, 0.78)
      : Math.min(0.28, baseStiff * (16 / Math.max(gap, 16)));
    const damp = seated
      ? Math.max(r.damping ?? 0.12, 0.14)
      : Math.max(r.damping ?? 0.12, 0.28);
    const length = seated ? 0 : Math.min(gap * 0.4, 42);

    const c = Constraint.create({
      bodyA: a,
      bodyB: b,
      pointA: { x: r.ax, y: r.ay },
      pointB: { x: r.bx, y: r.by },
      stiffness: stiff,
      damping: damp,
      length,
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
    // Restore flesh HP scale if this part had been skeletonized
    if (pl.fleshMaxHp) {
      pl.maxHp = pl.fleshMaxHp;
      pl.fleshMaxHp = null;
    } else if (pl.state === "skeleton") {
      pl.maxHp = fleshMaxHp(pl.part);
    }
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
  const parent = findRegrowParent(parts, slot) || torso || sample;
  const attach = attachmentToward(parent, slot, s);
  const childLocal = childAttachLocal(parts, parent, slot, s);
  const ax = attach.x;
  const ay = attach.y;

  const sizes = {
    head: () =>
      Bodies.circle(ax, ay, PART_SIZE.headR * s, partOpts(fruit, "head", { group, partSlot: "head", density: 0.0016 })),
    torso: () =>
      Bodies.rectangle(ax, ay, PART_SIZE.torso[0] * s, PART_SIZE.torso[1] * s, {
        ...partOpts(fruit, "torso", { group, partSlot: "torso", density: 0.0032 }),
        chamfer: { radius: 5 * s },
      }),
    lua: () =>
      Bodies.rectangle(ax, ay, PART_SIZE.upperArm[0] * s, PART_SIZE.upperArm[1] * s, {
        ...partOpts(fruit, "upperArm", { group, partSlot: "lua", side: "L" }),
        chamfer: { radius: 3 * s },
      }),
    lla: () =>
      Bodies.rectangle(ax, ay, PART_SIZE.lowerArm[0] * s, PART_SIZE.lowerArm[1] * s, {
        ...partOpts(fruit, "lowerArm", { group, partSlot: "lla", side: "L" }),
        chamfer: { radius: 3 * s },
      }),
    rua: () =>
      Bodies.rectangle(ax, ay, PART_SIZE.upperArm[0] * s, PART_SIZE.upperArm[1] * s, {
        ...partOpts(fruit, "upperArm", { group, partSlot: "rua", side: "R" }),
        chamfer: { radius: 3 * s },
      }),
    rla: () =>
      Bodies.rectangle(ax, ay, PART_SIZE.lowerArm[0] * s, PART_SIZE.lowerArm[1] * s, {
        ...partOpts(fruit, "lowerArm", { group, partSlot: "rla", side: "R" }),
        chamfer: { radius: 3 * s },
      }),
    lul: () =>
      Bodies.rectangle(ax, ay, PART_SIZE.upperLeg[0] * s, PART_SIZE.upperLeg[1] * s, {
        ...partOpts(fruit, "upperLeg", { group, partSlot: "lul", side: "L" }),
        chamfer: { radius: 3 * s },
      }),
    lll: () =>
      Bodies.rectangle(ax, ay, PART_SIZE.lowerLeg[0] * s, PART_SIZE.lowerLeg[1] * s, {
        ...partOpts(fruit, "lowerLeg", { group, partSlot: "lll", side: "L" }),
        chamfer: { radius: 3 * s },
      }),
    rul: () =>
      Bodies.rectangle(ax, ay, PART_SIZE.upperLeg[0] * s, PART_SIZE.upperLeg[1] * s, {
        ...partOpts(fruit, "upperLeg", { group, partSlot: "rul", side: "R" }),
        chamfer: { radius: 3 * s },
      }),
    rll: () =>
      Bodies.rectangle(ax, ay, PART_SIZE.lowerLeg[0] * s, PART_SIZE.lowerLeg[1] * s, {
        ...partOpts(fruit, "lowerLeg", { group, partSlot: "rll", side: "R" }),
        chamfer: { radius: 3 * s },
      }),
    lf: () =>
      Bodies.rectangle(ax, ay, PART_SIZE.foot[0] * s, PART_SIZE.foot[1] * s, {
        ...partOpts(fruit, "foot", { group, partSlot: "lf", side: "L", friction: 1.4 }),
        chamfer: { radius: 2 * s },
      }),
    rf: () =>
      Bodies.rectangle(ax, ay, PART_SIZE.foot[0] * s, PART_SIZE.foot[1] * s, {
        ...partOpts(fruit, "foot", { group, partSlot: "rf", side: "R", friction: 1.4 }),
        chamfer: { radius: 2 * s },
      }),
  };

  const make = sizes[slot];
  if (!make) return null;
  const body = make();
  body.plugin.ragdollId = rid;
  body.plugin.baseScale = s;
  body.plugin.scale = s;
  body.plugin.fruitKey = fruitKey;
  body.plugin.collisionGroup = group;
  body.collisionFilter = { ...body.collisionFilter, group };
  body.plugin.blueprint = pl0.blueprint || [];
  body.plugin.state = "damaged";
  body.plugin.hp = body.plugin.maxHp * 0.25;
  body.plugin.conscious = true;
  body.plugin.bruises = 0.2;
  body.plugin.detached = false;
  body.plugin.isLiving = true;
  const vessel = parts.find((p) => p.plugin?.liquid)?.plugin.liquid;
  if (vessel) body.plugin.liquid = vessel;

  // Pose at the correct joint offset. During growth we kinematically hold the
  // part on the parent (no live constraint) so the body can't fold into a pile
  // or explode. A real joint is added only when the bud finishes.
  // Torso always grows world-upright so a severed stump rebuilds a real body.
  if (slot === "torso") {
    Body.setAngle(body, 0);
    // Put torso near the stump, upright; snap stump onto the torso socket
    Body.setPosition(body, { x: parent.position.x, y: parent.position.y });
    const torsoLocal = childLocal; // socket on torso that meets the stump
    const stumpLocal = { x: attach.localX || 0, y: attach.localY || 0 };
    // World point: keep stump where it is; move torso so its socket hits stump socket
    const stumpWorld = localToWorld(parent, stumpLocal.x, stumpLocal.y);
    placeLocalOnWorld(body, torsoLocal, stumpWorld.x, stumpWorld.y);
    // Record inverted grow parenting: we still hold CHILD (torso) to PARENT (stump)
    // each frame using these locals — but force torso angle 0 while growing.
    body.plugin.growForceUpright = true;
  } else {
    Body.setAngle(body, preferredRegrowAngle(parent, slot));
    placeLocalOnWorld(body, childLocal, ax, ay);
    body.plugin.growForceUpright = false;
  }
  Body.set(body, { frictionAir: 0.2 });
  Body.setVelocity(body, { x: 0, y: 0 });
  Body.setAngularVelocity(body, 0);
  // Hold static during regrow — runner otherwise collapses overlapping parts
  body.plugin.regrowHeld = true;
  Body.setStatic(body, true);

  const startMul = 0.2;
  body.plugin.growMul = startMul;
  body.plugin.physicsMul = 1;
  body.plugin.growAbout = { x: childLocal.x, y: childLocal.y };
  body.plugin.growAboutFull = { x: childLocal.x, y: childLocal.y };
  body.plugin.growParentId = parent.id;
  body.plugin.growChildLocal = { x: childLocal.x, y: childLocal.y };
  body.plugin.growParentLocal = { x: attach.localX || 0, y: attach.localY || 0 };
  body.plugin.growing = {
    t: 0,
    duration: 1.4 + Math.random() * 0.3,
    from: startMul,
    to: 1,
    parentId: parent.id,
    slot,
  };

  Composite.add(world, body);
  return body;
}

/** Resting angle so new limbs hang / stand in a Melon-like pose off the parent. */
function preferredRegrowAngle(parent, slot) {
  const base = parent.angle || 0;
  const rel = {
    head: 0,
    torso: 0,
    lua: 0.04,
    rua: -0.04,
    lla: 0.06,
    rla: -0.06,
    lul: 0.03,
    rul: -0.03,
    lll: 0.02,
    rll: -0.02,
    lf: 0,
    rf: 0,
  };
  return base + (rel[slot] || 0);
}

function findRegrowParent(parts, slot) {
  const sample = parts[0];
  const blueprint = sample?.plugin?.blueprint || [];
  for (const bp of blueprint) {
    if (bp.slotA === slot) {
      const p = parts.find((b) => b.plugin?.partSlot === bp.slotB && b.plugin.state !== "gone");
      if (p) return p;
    }
    if (bp.slotB === slot) {
      const p = parts.find((b) => b.plugin?.partSlot === bp.slotA && b.plugin.state !== "gone");
      if (p) return p;
    }
  }
  const map = {
    head: "torso",
    lua: "torso",
    rua: "torso",
    lul: "torso",
    rul: "torso",
    lla: "lua",
    rla: "rua",
    lll: "lul",
    rll: "rul",
    lf: "lll",
    rf: "rll",
    torso: null,
  };
  const parentSlot = map[slot];
  if (!parentSlot) return null;
  return parts.find((b) => b.plugin?.partSlot === parentSlot && b.plugin.state !== "gone") || null;
}

/** Local joint point on the NEW part (proximal end that stays planted on the stump). */
function childAttachLocal(parts, parent, childSlot, s) {
  const blueprint = parent?.plugin?.blueprint || parts[0]?.plugin?.blueprint || [];
  for (const bp of blueprint) {
    if (bp.slotA === parent.plugin.partSlot && bp.slotB === childSlot) {
      return { x: bp.bx, y: bp.by };
    }
    if (bp.slotB === parent.plugin.partSlot && bp.slotA === childSlot) {
      return { x: bp.ax, y: bp.ay };
    }
  }
  // Proximal end fallbacks (same as createFruitRagdoll pin offsets)
  const [, th] = PART_SIZE.torso.map((v) => v * s);
  const [, uah] = PART_SIZE.upperArm.map((v) => v * s);
  const [, lah] = PART_SIZE.lowerArm.map((v) => v * s);
  const [, ulh] = PART_SIZE.upperLeg.map((v) => v * s);
  const [, llh] = PART_SIZE.lowerLeg.map((v) => v * s);
  const [, fh] = PART_SIZE.foot.map((v) => v * s);
  const headR = PART_SIZE.headR * s;
  const map = {
    head: { x: 0, y: headR * 0.85 },
    torso: { x: 0, y: -th / 2 },
    lua: { x: 0, y: -uah / 2 },
    rua: { x: 0, y: -uah / 2 },
    lla: { x: 0, y: -lah / 2 },
    rla: { x: 0, y: -lah / 2 },
    lul: { x: 0, y: -ulh / 2 },
    rul: { x: 0, y: -ulh / 2 },
    lll: { x: 0, y: -llh / 2 },
    rll: { x: 0, y: -llh / 2 },
    lf: { x: -2 * s, y: -fh / 2 },
    rf: { x: -2 * s, y: -fh / 2 },
  };
  return map[childSlot] || { x: 0, y: 0 };
}

/** World + local offset on parent where a new limb should sprout. */
function attachmentToward(parent, childSlot, s) {
  const blueprint = parent.plugin?.blueprint || [];
  for (const bp of blueprint) {
    let localX = 0;
    let localY = 0;
    let use = false;
    if (bp.slotA === parent.plugin.partSlot && bp.slotB === childSlot) {
      localX = bp.ax;
      localY = bp.ay;
      use = true;
    } else if (bp.slotB === parent.plugin.partSlot && bp.slotA === childSlot) {
      localX = bp.bx;
      localY = bp.by;
      use = true;
    }
    if (use) {
      const cos = Math.cos(parent.angle);
      const sin = Math.sin(parent.angle);
      return {
        x: parent.position.x + localX * cos - localY * sin,
        y: parent.position.y + localX * sin + localY * cos,
        localX,
        localY,
      };
    }
  }
  const nudge = {
    head: [0, -22],
    lua: [-16, -4],
    rua: [16, -4],
    lla: [-4, 14],
    rla: [4, 14],
    lul: [-8, 16],
    rul: [8, 16],
    lll: [0, 16],
    rll: [0, 16],
    lf: [0, 10],
    rf: [0, 10],
    torso: [0, 12],
  };
  const [nx, ny] = (nudge[childSlot] || [0, 12]).map((v) => v * s);
  const cos = Math.cos(parent.angle);
  const sin = Math.sin(parent.angle);
  return {
    x: parent.position.x + nx * cos - ny * sin,
    y: parent.position.y + nx * sin + ny * cos,
    localX: nx,
    localY: ny,
  };
}

function localToWorld(body, lx, ly) {
  const c = Math.cos(body.angle);
  const s = Math.sin(body.angle);
  return {
    x: body.position.x + lx * c - ly * s,
    y: body.position.y + lx * s + ly * c,
  };
}

/** Scale constraint local anchors when a body is Body.scale'd (Matter won't). */
export function scaleBodyJointAnchors(world, body, sx, sy) {
  if (!body || !world) return;
  for (const c of Composite.allConstraints(world)) {
    if (c.bodyA === body && c.pointA) {
      c.pointA.x *= sx;
      c.pointA.y *= sy;
      if (c.plugin?.isFruitJoint && c.bodyA === body) {
        if (c.plugin.ax != null) c.plugin.ax *= sx;
        if (c.plugin.ay != null) c.plugin.ay *= sy;
      }
    }
    if (c.bodyB === body && c.pointB) {
      c.pointB.x *= sx;
      c.pointB.y *= sy;
      if (c.plugin?.isFruitJoint && c.bodyB === body) {
        if (c.plugin.bx != null) c.plugin.bx *= sx;
        if (c.plugin.by != null) c.plugin.by *= sy;
      }
    }
  }
  const pl = body.plugin;
  if (!pl) return;
  if (pl.blueprint) {
    for (const bp of pl.blueprint) {
      if (bp.slotA === pl.partSlot) {
        if (bp.ax != null) bp.ax *= sx;
        if (bp.ay != null) bp.ay *= sy;
      }
      if (bp.slotB === pl.partSlot) {
        if (bp.bx != null) bp.bx *= sx;
        if (bp.by != null) bp.by *= sy;
      }
    }
  }
  if (pl.lostJoints) {
    for (const bp of pl.lostJoints) {
      if (bp.slotA === pl.partSlot) {
        if (bp.ax != null) bp.ax *= sx;
        if (bp.ay != null) bp.ay *= sy;
      }
      if (bp.slotB === pl.partSlot) {
        if (bp.bx != null) bp.bx *= sx;
        if (bp.by != null) bp.by *= sy;
      }
    }
  }
}

function worldToLocal(body, wx, wy) {
  const dx = wx - body.position.x;
  const dy = wy - body.position.y;
  const c = Math.cos(body.angle);
  const s = Math.sin(body.angle);
  return { x: dx * c + dy * s, y: -dx * s + dy * c };
}

/** Move body so a local point lands on a world point. */
function placeLocalOnWorld(body, local, wx, wy) {
  const cur = localToWorld(body, local.x, local.y);
  Body.setPosition(body, {
    x: body.position.x + (wx - cur.x),
    y: body.position.y + (wy - cur.y),
  });
}

/**
 * Scale a body about a local joint point so it elongates from the stump outward.
 * Mutates `localAbout` to the post-scale local coords of that same world pivot.
 */
export function scaleBodyOutward(world, body, factor, localAbout) {
  if (!body || Math.abs(factor - 1) < 1e-6) return localAbout;
  const pivot = localToWorld(body, localAbout.x, localAbout.y);
  Body.scale(body, factor, factor, pivot);
  const next = worldToLocal(body, pivot.x, pivot.y);
  localAbout.x = next.x;
  localAbout.y = next.y;

  if (body.plugin?.growTether?.bodyB === body) {
    body.plugin.growTether.pointB.x = localAbout.x;
    body.plugin.growTether.pointB.y = localAbout.y;
  }
  return localAbout;
}

/** @deprecated use scaleBodyOutward — kept for any callers */
export function scaleBodyWithJoints(world, body, factor) {
  const about = body.plugin?.growAbout || { x: 0, y: 0 };
  scaleBodyOutward(world, body, factor, about);
}

function easeOutCubic(t) {
  const u = 1 - t;
  return 1 - u * u * u;
}

/**
 * Pin regenerating parts as static so the Matter runner can't collapse them
 * into a pile between game ticks (same-ragdoll parts don't collide).
 */
export function setRegrowHeld(parts, held) {
  for (const p of parts) {
    if (!p.plugin || p.plugin.state === "gone") continue;
    if (p.plugin.frozen) continue;
    if (held) {
      if (!p.plugin.regrowHeld) {
        p.plugin.regrowHeld = true;
        Body.setStatic(p, true);
      }
      Body.setVelocity(p, { x: 0, y: 0 });
      Body.setAngularVelocity(p, 0);
    } else if (p.plugin.regrowHeld) {
      p.plugin.regrowHeld = false;
      Body.setStatic(p, false);
      Body.setVelocity(p, { x: 0, y: 0 });
      Body.setAngularVelocity(p, 0);
    }
  }
}

/**
 * Tick gradual limb growth.
 * After a torso exists, the whole living is held static in a standing Melon
 * pose each frame (no live joints). Buds only animate growMul visually.
 * Real joints are welded when regrow ends.
 */
export function tickGrowingParts(world, bodies, dt, particles, groundY = null) {
  const byRid = new Map();
  for (const b of bodies) {
    const rid = b.plugin?.ragdollId;
    if (!rid || !b.plugin?.fruit || b.plugin.state === "gone") continue;
    if (!byRid.has(rid)) byRid.set(rid, []);
    byRid.get(rid).push(b);
  }

  for (const [rid, parts] of byRid) {
    const regenerating =
      parts.some((p) => p.plugin?.growing) || parts.some((p) => p.plugin?.effects?.regrow);
    if (!regenerating) continue;

    // Drop live fruit joints while posing — they fight kinematic seating and explode
    const liveJoints = Composite.allConstraints(world).filter(
      (c) => c.plugin?.isFruitJoint && c.plugin.ragdollId === rid
    );
    if (liveJoints.length) Composite.remove(world, liveJoints);

    setRegrowHeld(parts, true);

    const torso = parts.find((p) => p.plugin.partSlot === "torso");
    if (torso) {
      poseStandingCluster(parts, torso, groundY);
    } else {
      // Stump only — keep it calm until torso buds
      for (const p of parts) {
        Body.setAngle(p, 0);
        Body.setVelocity(p, { x: 0, y: 0 });
        Body.setAngularVelocity(p, 0);
      }
    }

    for (const b of parts) {
      const pl = b.plugin;
      if (!pl?.growing) continue;
      const g = pl.growing;
      g.t += dt;
      const progress = Math.min(1, g.t / g.duration);
      const eased = easeOutCubic(progress);
      pl.growMul = g.from + (g.to - g.from) * eased;
      pl.scale = pl.baseScale || 1;
      pl.hp = pl.maxHp * (0.25 + 0.75 * eased);
      pl.bruises = Math.max(0, 0.28 * (1 - eased));
      if (eased > 0.4) pl.state = "alive";

      if (particles && Math.random() < 0.05) {
        particles.drip(b.position.x, b.position.y, "#70d0ff", 1);
      }

      if (progress >= 1) {
        finishLimbGrowth(world, b, particles);
      }
    }
  }
}

/**
 * Place existing parts into a standing Melon layout around the torso.
 * When `groundY` is given, feet sit on the floor (same math as spawn) so
 * static regrow posing cannot sink legs into the ground.
 */
export function poseStandingCluster(parts, torso, groundY = null) {
  const s = torso.plugin.scale || torso.plugin.baseScale || 1;
  const tx = torso.position.x;
  const [tw, th] = PART_SIZE.torso.map((v) => v * s);
  const [, ulh] = PART_SIZE.upperLeg.map((v) => v * s);
  const [, llh] = PART_SIZE.lowerLeg.map((v) => v * s);
  const [, fh] = PART_SIZE.foot.map((v) => v * s);
  const stanceGap = 2 * s;

  let ty;
  let hipY;
  if (groundY != null && isFinite(groundY)) {
    // Feet bottoms on floor — mirror createFruitRagdoll(x, groundY)
    hipY = groundY - fh - llh - ulh / 2;
    ty = hipY - ulh / 2 - stanceGap - th / 2;
  } else {
    ty = Math.min(Math.max(torso.position.y, 180), 1500);
    hipY = ty + th / 2 + stanceGap + ulh / 2;
  }

  Body.setPosition(torso, { x: tx, y: ty });
  Body.setAngle(torso, 0);
  Body.setVelocity(torso, { x: 0, y: 0 });
  Body.setAngularVelocity(torso, 0);

  const headR = PART_SIZE.headR * s;
  const [uaw, uah] = PART_SIZE.upperArm.map((v) => v * s);
  const [, lah] = PART_SIZE.lowerArm.map((v) => v * s);
  const armX = tw / 2 + uaw * 0.55;
  const legX = 7 * s;
  const shoulderY = ty - th * 0.28;
  const footY = hipY + ulh / 2 + llh + fh / 2;

  const layout = {
    head: { x: tx, y: ty - th / 2 - headR * 0.55, a: 0 },
    torso: { x: tx, y: ty, a: 0 },
    lua: { x: tx - armX, y: shoulderY + uah / 2, a: 0 },
    lla: { x: tx - armX, y: shoulderY + uah + lah / 2, a: 0 },
    rua: { x: tx + armX, y: shoulderY + uah / 2, a: 0 },
    rla: { x: tx + armX, y: shoulderY + uah + lah / 2, a: 0 },
    lul: { x: tx - legX, y: hipY, a: 0 },
    lll: { x: tx - legX, y: hipY + ulh / 2 + llh / 2, a: 0 },
    rul: { x: tx + legX, y: hipY, a: 0 },
    rll: { x: tx + legX, y: hipY + ulh / 2 + llh / 2, a: 0 },
    lf: { x: tx - legX + 2 * s, y: footY, a: 0 },
    rf: { x: tx + legX + 2 * s, y: footY, a: 0 },
  };

  for (const p of parts) {
    const slot = p.plugin.partSlot;
    const pose = layout[slot];
    if (!pose) continue;
    Body.setPosition(p, { x: pose.x, y: pose.y });
    Body.setAngle(p, pose.a);
    Body.setVelocity(p, { x: 0, y: 0 });
    Body.setAngularVelocity(p, 0);
  }
}

function finishLimbGrowth(world, body, particles) {
  const pl = body.plugin;
  if (!pl?.growing) return;

  pl.growMul = 1;
  pl.physicsMul = 1;
  pl.scale = pl.baseScale || 1;
  pl.hp = pl.maxHp;
  pl.bruises = 0;
  pl.state = "alive";
  pl.boneBroken = false;
  pl.jointSprain = false;
  pl.growing = null;
  pl.growAbout = null;
  pl.growAboutFull = null;
  pl.growParentId = null;
  pl.growChildLocal = null;
  pl.growParentLocal = null;
  pl.growTether = null;
  pl.growForceUpright = false;
  Body.set(body, { frictionAir: 0.01 });
  Body.setVelocity(body, { x: 0, y: 0 });
  Body.setAngularVelocity(body, 0);

  // Joints stay off until the whole regrow effect ends (posed kinematically until then)
  if (particles) {
    particles.burst(body.position.x, body.position.y, "#70d0ff", 6, 2);
    particles.burst(body.position.x, body.position.y, pl.fruit?.juice || "#b8e86a", 5, 2);
  }
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
    // Don't fight regrow / budding limbs — muscle torque causes wild spins
    if (parts.some((p) => p.plugin?.growing || p.plugin?.effects?.regrow)) continue;

    // KO / unconscious → limp ragdoll (dead weight)
    if (!torso.plugin.conscious) {
      for (const p of parts) {
        if (p.plugin.state === "gone") continue;
        Body.set(p, { frictionAir: Math.max(p.frictionAir || 0.01, 0.018) });
        p.torque += -p.angularVelocity * 0.012;
      }
      continue;
    }

    const acidWeak = torso.plugin.acidDecay || 0;
    const ratio = torso.plugin.hp / torso.plugin.maxHp;
    const bruise = torso.plugin.bruises || 0;
    const standing =
      torso.plugin.state === "alive" ||
      torso.plugin.state === "skeleton" ||
      (torso.plugin.state === "damaged" && ratio > 0.12);
    if (!standing) continue;

    // Healthy flesh stands firmer; damaged / bruised wobbles
    const healthMul =
      torso.plugin.state === "alive"
        ? 1.15 - bruise * 0.35
        : torso.plugin.state === "skeleton"
          ? 0.65
          : 0.45 + ratio * 0.25;
    const strength = healthMul * (1 - acidWeak * 0.85);
    if (strength < 0.08) continue;

    for (const p of parts) {
      if (p.plugin.state === "gone" || p.plugin.detached) continue;
      if (p.plugin.growing) continue;
      if (p.plugin.state === "skeleton" && !p.plugin.conscious) continue;
      // Don't fight helium/float air drag while buoyant
      const floating = !!p.plugin.effects?.float;
      if (!floating && (p.frictionAir || 0) > 0.02) Body.set(p, { frictionAir: 0.01 });
      const part = p.plugin.part;
      let k = 0;
      if (part === "torso") k = 0.11;
      else if (part === "head") k = 0.065;
      else if (part === "upperLeg" || part === "lowerLeg") k = 0.09;
      else if (part === "foot") k = 0.08;
      else if (part === "upperArm" || part === "lowerArm") k = 0.025;
      if (!k) continue;
      if (floating) k *= 0.15;
      if (p.plugin.jointSprain) k *= 0.3;
      if (p.plugin.state === "damaged") k *= 0.7;

      const damp = 0.035;
      p.torque += (-p.angle * k - p.angularVelocity * damp) * strength;

      if (
        !floating &&
        Math.abs(p.angle) < 0.4 &&
        (part === "torso" || part === "upperLeg" || part === "lowerLeg" || part === "foot")
      ) {
        Body.setAngle(p, p.angle * (1 - 0.1 * strength));
        Body.setAngularVelocity(p, p.angularVelocity * 0.82);
      }
    }
  }
}

/** Instantly KO a living (context menu Kill). */
export function killLiving(world, body, particles = null) {
  if (!body?.plugin?.ragdollId) return;
  const rid = body.plugin.ragdollId;
  const parts = Composite.allBodies(world).filter((b) => b.plugin?.ragdollId === rid);
  for (const p of parts) {
    if (!p.plugin) continue;
    p.plugin.conscious = false;
    p.plugin.forceUnconscious = true;
    p.plugin.ai = { mode: "idle", dir: 1, timer: 0, phase: 0, punchCd: 0 };
    if (p.plugin.liquid) {
      p.plugin.liquid.amount = Math.min(p.plugin.liquid.amount, p.plugin.liquid.capacity * 0.08);
      p.plugin.liquid.surviveUntilBelow = null;
    }
    if (p.plugin.state === "alive") {
      p.plugin.state = "damaged";
      p.plugin.bruises = Math.max(p.plugin.bruises || 0, 0.55);
    }
  }
  const torso = parts.find((p) => p.plugin.part === "torso") || body;
  if (particles) {
    particles.burst(torso.position.x, torso.position.y, torso.plugin.fruit?.juice || "#b8e86a", 16, 5);
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

  // Budding: flesh elongates from the joint on an already-posed full body
  if (body.plugin.growing && body.plugin.growAboutFull) {
    const full = body.plugin.baseScale || 1;
    const visualMul = body.plugin.growMul || 1;
    const about = body.plugin.growAboutFull;
    ctx.translate(about.x, about.y);
    ctx.scale(visualMul, visualMul);
    ctx.translate(-about.x, -about.y);
    drawFleshGeometry(ctx, body, fruit, damaged, full);
    ctx.restore();
    return;
  }

  drawFleshGeometry(ctx, body, fruit, damaged, s);
  ctx.restore();
}

function drawFleshGeometry(ctx, body, fruit, damaged, s) {
  const part = body.plugin.part;

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
    // Pixel melon head when healthy; fall back to smooth for other fruits / melt
    const usePixel =
      body.plugin.fruitKey === "melon" && acid < 0.25 && !damaged && (body.plugin.bruises || 0) < 0.35;
    if (usePixel) {
      drawSprite(ctx, "melonHead", 3 * s);
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fillStyle = skin;
      ctx.fill();
      ctx.strokeStyle = "rgba(20,20,18,0.75)";
      ctx.lineWidth = 1.5 * s;
      ctx.stroke();
      ctx.strokeStyle = stripe;
      ctx.lineWidth = 2.8 * s;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.ellipse(i * 5.5 * s, 0, 2.4 * s, r * 0.92, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = body.plugin.conscious === false ? "#3a2020" : "#1a1a18";
      ctx.beginPath();
      ctx.arc(-5 * s, -1.5 * s, 2.2 * s, 0, Math.PI * 2);
      ctx.arc(5 * s, -1.5 * s, 2.2 * s, 0, Math.PI * 2);
      ctx.fill();
      if (body.plugin.conscious === false) {
        // X eyes when KO
        ctx.strokeStyle = "#1a1a18";
        ctx.lineWidth = 1.6 * s;
        for (const ex of [-5, 5]) {
          ctx.beginPath();
          ctx.moveTo(ex * s - 2.2 * s, -1.5 * s - 2.2 * s);
          ctx.lineTo(ex * s + 2.2 * s, -1.5 * s + 2.2 * s);
          ctx.moveTo(ex * s + 2.2 * s, -1.5 * s - 2.2 * s);
          ctx.lineTo(ex * s - 2.2 * s, -1.5 * s + 2.2 * s);
          ctx.stroke();
        }
      } else {
        ctx.fillRect(-3.5 * s, 5 * s, 7 * s, 1.6 * s);
      }
    }
    const bruises = body.plugin.bruises || 0;
    if (damaged || acid > 0.2 || bruises > 0.15) {
      ctx.fillStyle = acid > 0.2 ? "#c8e060" : fruit.juiceDark;
      ctx.globalAlpha = 0.28 + acid * 0.4 + bruises * 0.4;
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
    // Melon-style dark outline
    ctx.strokeStyle = "rgba(18,18,16,0.8)";
    ctx.lineWidth = 1.4 * s;
    roundRect(ctx, -bw / 2, -bh / 2, bw, bh, rr);
    ctx.stroke();

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

function drawClothing(ctx, body) {
  const pl = body.plugin;
  const { x, y } = body.position;
  const s = pl.scale || 1;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(body.angle);

  if (pl.part === "head") {
    if (pl.hat) {
      ctx.fillStyle = pl.hatColor || "#c05040";
      ctx.beginPath();
      ctx.ellipse(0, -14 * s, 16 * s, 6 * s, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(-10 * s, -22 * s, 20 * s, 10 * s);
    }
    if (pl.helmet) {
      ctx.fillStyle = pl.helmetColor || "#6a7080";
      ctx.beginPath();
      ctx.arc(0, -4 * s, 18 * s, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = "#3a3e44";
      ctx.fillRect(-16 * s, -4 * s, 32 * s, 4 * s);
    }
  }
  if (pl.part === "torso" && pl.vest) {
    const [tw, th] = PART_SIZE.torso;
    ctx.fillStyle = pl.vestColor || "#3a5a80";
    ctx.globalAlpha = 0.85;
    ctx.fillRect((-tw / 2) * s - 2, (-th / 2) * s, tw * s + 4, th * s);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "#2a3a50";
    ctx.strokeRect((-tw / 2) * s - 2, (-th / 2) * s, tw * s + 4, th * s);
  }
  if (pl.part === "torso" && pl.cloak) {
    ctx.fillStyle = pl.cloakColor || "#5a2060";
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.moveTo(-14 * s, -8 * s);
    ctx.lineTo(14 * s, -8 * s);
    ctx.lineTo(18 * s, 28 * s);
    ctx.lineTo(-18 * s, 28 * s);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

/** Copy clothing flags from torso onto head/torso for drawing. */
export function syncClothing(parts) {
  const torso = parts.find((p) => p.plugin?.part === "torso");
  const head = parts.find((p) => p.plugin?.part === "head");
  if (!torso) return;
  const gear = {
    hat: torso.plugin.hat,
    hatColor: torso.plugin.hatColor,
    helmet: torso.plugin.helmet,
    helmetColor: torso.plugin.helmetColor,
    vest: torso.plugin.vest,
    vestColor: torso.plugin.vestColor,
    cloak: torso.plugin.cloak,
    cloakColor: torso.plugin.cloakColor,
  };
  if (head) Object.assign(head.plugin, gear);
  Object.assign(torso.plugin, gear);
}

export function equipClothing(parts, clothingId, color) {
  const torso = parts.find((p) => p.plugin?.part === "torso");
  if (!torso) return false;
  if (clothingId === "hat") {
    torso.plugin.hat = true;
    torso.plugin.hatColor = color || "#c05040";
  } else if (clothingId === "helmet") {
    torso.plugin.helmet = true;
    torso.plugin.helmetColor = color || "#6a7080";
  } else if (clothingId === "vest") {
    torso.plugin.vest = true;
    torso.plugin.vestColor = color || "#3a5a80";
  } else if (clothingId === "cloak") {
    torso.plugin.cloak = true;
    torso.plugin.cloakColor = color || "#5a2060";
  } else return false;
  syncClothing(parts);
  return true;
}

export function clearClothing(parts) {
  for (const p of parts) {
    if (!p.plugin) continue;
    p.plugin.hat = false;
    p.plugin.helmet = false;
    p.plugin.vest = false;
    p.plugin.cloak = false;
  }
}

export function drawFruitBody(ctx, body) {
  const pl = body.plugin;
  if (!pl?.fruit || pl.state === "gone") return;

  if (pl.invisible != null) {
    ctx.save();
    ctx.globalAlpha = Math.max(0.05, Math.min(1, pl.invisible));
  }

  if (pl.state === "skeleton") {
    drawBone(ctx, body, pl.part);
    if (pl.invisible != null) ctx.restore();
    return;
  }

  const growing = !!pl.growing;
  if (growing) {
    ctx.save();
    ctx.globalAlpha = 0.55 + (pl.growMul || 0.2) * 0.45;
  }

  drawFlesh(ctx, body, pl.fruit, pl.state === "damaged" || (pl.bruises || 0) > 0.35 || growing);

  // Equipped clothing overlays
  if (!growing && pl.state !== "skeleton") {
    drawClothing(ctx, body);
  }

  if (growing) {
    // Cyan “sprouting” aura around the budding limb
    const { x, y } = body.position;
    const mul = pl.growMul || 0.2;
    ctx.restore();
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(body.angle);
    ctx.strokeStyle = `rgba(112,208,255,${0.35 + mul * 0.45})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 10 * (pl.baseScale || 1) * (0.4 + mul), 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = `rgba(168,240,255,${0.12 + (1 - mul) * 0.2})`;
    ctx.beginPath();
    ctx.arc(0, 0, 6 * (pl.baseScale || 1) * mul, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

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

  if (pl.invisible != null) ctx.restore();
}

export function tickFruitPlugins(bodies, dt) {
  for (const b of bodies) {
    if (b.plugin?.juiceCooldown > 0) b.plugin.juiceCooldown -= dt;
  }
}
