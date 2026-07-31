/** Rope / weld / pin / signal-wire / grip connection helpers (Melon-style). */

const { Constraint, Composite, Body } = Matter;

export const LINK_TYPES = {
  rope: {
    id: "rope",
    label: "Rope",
    color: "#c4a574",
    stiffness: 0.4,
    damping: 0.05,
    minLen: 40,
    draw: "rope",
  },
  soft: {
    id: "soft",
    label: "Soft",
    color: "#d4b894",
    stiffness: 0.08,
    damping: 0.02,
    minLen: 50,
    draw: "soft",
  },
  weld: {
    id: "weld",
    label: "Weld",
    color: "#8a9098",
    stiffness: 0.98,
    damping: 0.2,
    minLen: 0,
    lengthMode: "zero",
    draw: "weld",
    dual: true,
  },
  wire: {
    id: "wire",
    label: "Signal",
    color: "#60c070",
    stiffness: 0.05,
    damping: 0.05,
    minLen: 30,
    draw: "signal",
    signal: true,
  },
};

/** Local offset of a world point on a body. */
export function worldToLocal(body, wx, wy) {
  const dx = wx - body.position.x;
  const dy = wy - body.position.y;
  const c = Math.cos(-body.angle);
  const s = Math.sin(-body.angle);
  return { x: dx * c - dy * s, y: dx * s + dy * c };
}

export function localToWorld(body, lx, ly) {
  const c = Math.cos(body.angle);
  const s = Math.sin(body.angle);
  return {
    x: body.position.x + lx * c - ly * s,
    y: body.position.y + lx * s + ly * c,
  };
}

export function createLink(bodyA, bodyB, typeId, worldPointA = null, worldPointB = null) {
  const def = LINK_TYPES[typeId] || LINK_TYPES.rope;
  const pa = worldPointA
    ? worldToLocal(bodyA, worldPointA.x, worldPointA.y)
    : { x: 0, y: 0 };
  const pb = worldPointB
    ? worldToLocal(bodyB, worldPointB.x, worldPointB.y)
    : { x: 0, y: 0 };

  const ax = worldPointA?.x ?? bodyA.position.x;
  const ay = worldPointA?.y ?? bodyA.position.y;
  const bx = worldPointB?.x ?? bodyB.position.x;
  const by = worldPointB?.y ?? bodyB.position.y;
  const dist = Math.hypot(bx - ax, by - ay);

  // Welds keep current separation (no length-0 slam across gaps)
  const length =
    def.lengthMode === "zero"
      ? dist
      : Math.max(def.minLen ?? 0, dist);

  const stiff =
    def.lengthMode === "zero" && dist > 28
      ? Math.min(def.stiffness, 0.45)
      : def.stiffness;

  const c = Constraint.create({
    bodyA,
    bodyB,
    pointA: pa,
    pointB: pb,
    stiffness: stiff,
    damping: def.damping,
    length,
    render: { visible: false },
  });
  c.plugin = {
    draw: def.draw,
    linkType: def.id,
    signal: !!def.signal,
    color: def.color,
  };

  const extras = [];
  if (def.dual) {
    // Second pin slightly offset for torsional rigidity — length matches world gap
    const pa2 = { x: pa.x + 8, y: pa.y };
    const pb2 = { x: pb.x + 8, y: pb.y };
    const wa2 = localToWorld(bodyA, pa2.x, pa2.y);
    const wb2 = localToWorld(bodyB, pb2.x, pb2.y);
    const dist2 = Math.hypot(wb2.x - wa2.x, wb2.y - wa2.y);
    const c2 = Constraint.create({
      bodyA,
      bodyB,
      pointA: pa2,
      pointB: pb2,
      stiffness: stiff,
      damping: def.damping,
      length: dist2,
      render: { visible: false },
    });
    c2.plugin = { draw: def.draw, linkType: def.id, weldPair: true, color: def.color };
    extras.push(c2);
  }

  return { primary: c, extras };
}

/** Pin a body to a fixed world point (Melon wall rope). */
export function createWallPin(body, wx, wy) {
  const pa = worldToLocal(body, wx, wy);
  const c = Constraint.create({
    bodyA: body,
    pointA: pa,
    pointB: { x: wx, y: wy },
    stiffness: 0.95,
    damping: 0.15,
    length: 0,
    render: { visible: false },
  });
  c.plugin = {
    draw: "pin",
    linkType: "pin",
    color: "#5a9fd4",
    wallPin: true,
  };
  return c;
}

/** Distal palm tip in the hand's local space (arms spawn pointing +Y). */
export function handTipLocal(hand) {
  const slot = hand.plugin?.partSlot || "";
  const s = hand.plugin?.scale || hand.plugin?.baseScale || 1;
  // lowerArm PART_SIZE height 15 → tip near distal end
  if (slot === "lla" || slot === "rla") return { x: 0, y: 7 * s };
  if (slot === "lua" || slot === "rua") return { x: 0, y: 9 * s };
  return { x: 0, y: 8 * s };
}

export function isHandPart(body) {
  const slot = body?.plugin?.partSlot;
  return slot === "lla" || slot === "rla" || slot === "lua" || slot === "rua";
}

/** Prefer lower arms (true hands) over upper arms. */
export function isPreferredHand(body) {
  const slot = body?.plugin?.partSlot;
  return slot === "lla" || slot === "rla";
}

export function isGrabbable(body) {
  if (!body || body.isStatic) return false;
  if (body.plugin?.fruit) return false;
  if (body.label === "ground" || body.label === "platform") return false;
  if (body.plugin?.waterZone || body.plugin?.lavaZone) return false;
  if (body.plugin?.vehiclePart === "wheel") return false;
  return true;
}

/**
 * Snap item into the palm and pin with a stiff zero-length grip.
 * Joins the living's collision group so the item doesn't fight the arms.
 */
export function createGrip(hand, item, worldPoint = null) {
  if (!hand || !item) return null;

  // Drop prior holds on this hand / this item
  // (caller usually does this; safe no-op if already free)

  const tip = handTipLocal(hand);
  const tipW = localToWorld(hand, tip.x, tip.y);
  const itemLocal = worldPoint
    ? worldToLocal(item, worldPoint.x, worldPoint.y)
    : { x: 0, y: 0 };

  // Snap grab point onto the palm tip
  const cur = localToWorld(item, itemLocal.x, itemLocal.y);
  Body.set(item, { isSleeping: false });
  Body.set(hand, { isSleeping: false });
  Body.setPosition(item, {
    x: item.position.x + (tipW.x - cur.x),
    y: item.position.y + (tipW.y - cur.y),
  });
  Body.setVelocity(item, {
    x: hand.velocity.x,
    y: hand.velocity.y,
  });
  Body.setAngularVelocity(item, hand.angularVelocity * 0.4);

  if (!item.plugin) item.plugin = {};
  // Match living collision group so held props don't explode out of the hand
  if (item.plugin._gripPrevGroup == null) {
    item.plugin._gripPrevGroup = item.collisionFilter?.group ?? 0;
  }
  const group = hand.collisionFilter?.group ?? hand.plugin?.collisionGroup ?? 0;
  item.collisionFilter = {
    ...item.collisionFilter,
    group,
  };

  const c = Constraint.create({
    bodyA: hand,
    bodyB: item,
    pointA: tip,
    pointB: itemLocal,
    stiffness: 0.95,
    damping: 0.2,
    length: 0,
    render: { visible: false },
  });
  c.plugin = {
    draw: "grip",
    linkType: "grip",
    color: "#e0a060",
    isGrip: true,
  };

  item.plugin.heldBy = hand.plugin?.ragdollId || null;
  item.plugin.heldHand = hand;
  if (!hand.plugin) hand.plugin = {};
  hand.plugin.holding = item;
  return c;
}

/**
 * Release grip(s) for a hand, held item, or (if a non-hand living part) all hands on that living.
 */
export function releaseGrip(world, target) {
  if (!world || !target) return 0;
  const cons = Composite.allConstraints(world).filter((c) => c.plugin?.isGrip);
  const toRemove = [];

  const targetIsHand = isHandPart(target);
  const targetIsHeldItem = !!(target.plugin?.heldHand || target.plugin?.heldBy);
  const targetLivingId =
    target.plugin?.fruit && !targetIsHand ? target.plugin.ragdollId : null;

  for (const c of cons) {
    let match = false;
    if (c.bodyA === target || c.bodyB === target) match = true;
    else if (targetIsHand && c.bodyA === target) match = true;
    else if (targetIsHeldItem && c.bodyB === target) match = true;
    else if (
      targetLivingId &&
      c.bodyA?.plugin?.ragdollId === targetLivingId
    ) {
      match = true;
    }

    if (!match) continue;
    toRemove.push(c);
    restoreGripCollision(c.bodyB);
    if (c.bodyA?.plugin) c.bodyA.plugin.holding = null;
    if (c.bodyB?.plugin) {
      c.bodyB.plugin.heldBy = null;
      c.bodyB.plugin.heldHand = null;
    }
  }

  if (toRemove.length) Composite.remove(world, toRemove);
  return toRemove.length;
}

function restoreGripCollision(item) {
  if (!item?.plugin || item.plugin._gripPrevGroup == null) return;
  item.collisionFilter = {
    ...item.collisionFilter,
    group: item.plugin._gripPrevGroup,
  };
  delete item.plugin._gripPrevGroup;
}

/** Find nearest free hand (prefers lower arms) within maxDist of a world point. */
export function findNearestHand(bodies, x, y, maxDist = 70, { freeOnly = true } = {}) {
  let best = null;
  let bestScore = Infinity;
  for (const b of bodies) {
    if (!isHandPart(b)) continue;
    if (b.plugin?.state === "gone") continue;
    if (freeOnly && b.plugin?.holding) continue;
    const tip = handTipLocal(b);
    const tw = localToWorld(b, tip.x, tip.y);
    const d = Math.hypot(tw.x - x, tw.y - y);
    if (d > maxDist) continue;
    // Prefer lower arms, then closer
    const score = d + (isPreferredHand(b) ? 0 : 18);
    if (score < bestScore) {
      bestScore = score;
      best = b;
    }
  }
  return best;
}

/** Find nearest grabbable body within maxDist of a world point. */
export function findNearestGrabbable(bodies, x, y, maxDist = 80, exclude = null) {
  let best = null;
  let bestD = maxDist;
  for (const b of bodies) {
    if (b === exclude) continue;
    if (!isGrabbable(b)) continue;
    const d = Math.hypot(b.position.x - x, b.position.y - y);
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  return best;
}

export function drawLinkStyle(ctx, type, ax, ay, bx, by, activeSignal = false) {
  if (type === "weld") {
    ctx.strokeStyle = "#7a8088";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.fillStyle = "#9aa0a8";
    ctx.beginPath();
    ctx.arc(ax, ay, 3, 0, Math.PI * 2);
    ctx.arc(bx, by, 3, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  if (type === "pin") {
    ctx.strokeStyle = "#5a9fd4";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.fillStyle = "#5a9fd4";
    ctx.beginPath();
    ctx.arc(bx, by, 4, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  if (type === "signal") {
    ctx.strokeStyle = activeSignal ? "#90ff90" : "#60c070";
    ctx.lineWidth = activeSignal ? 3 : 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.setLineDash([]);
    return;
  }
  if (type === "grip") {
    ctx.strokeStyle = "#e0a060";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.fillStyle = "#e0a060";
    ctx.beginPath();
    ctx.arc(ax, ay, 3.5, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  if (type === "pipe") {
    ctx.strokeStyle = "#4a9aaa";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
    return;
  }
  // rope / soft
  ctx.strokeStyle = type === "soft" ? "#d4b894" : "#c4a574";
  ctx.lineWidth = type === "soft" ? 2 : 2.5;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.stroke();
}
