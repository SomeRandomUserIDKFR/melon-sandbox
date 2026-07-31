/** Living AI orders — walk, fight, flee, follow (Melon-style). */

import { damagePart } from "./ragdoll.js";

const { Body, Composite } = Matter;

export const AI_MODES = {
  idle: { id: "idle", label: "Stop / Idle" },
  walk: { id: "walk", label: "Walk" },
  fight: { id: "fight", label: "Fight" },
  flee: { id: "flee", label: "Flee" },
  follow: { id: "follow", label: "Follow" },
};

export function getLivingParts(world, bodyOrRid) {
  const rid =
    typeof bodyOrRid === "string" ? bodyOrRid : bodyOrRid?.plugin?.ragdollId;
  if (!rid) return [];
  return Composite.allBodies(world).filter((b) => b.plugin?.ragdollId === rid);
}

export function getTorso(parts) {
  return parts.find((p) => p.plugin?.part === "torso") || parts[0] || null;
}

export function getLivingAI(body) {
  const torso = body?.plugin?.part === "torso" ? body : null;
  // Prefer torso storage; callers usually pass any part
  return body?.plugin?.ai || null;
}

export function setLivingAI(world, body, mode) {
  const parts = getLivingParts(world, body);
  const torso = getTorso(parts);
  if (!torso?.plugin || !torso.plugin.conscious) return false;
  if (torso.plugin.aiLocked && mode !== "idle") return false;

  const def = AI_MODES[mode] || AI_MODES.idle;
  const ai = {
    mode: def.id,
    dir: Math.random() < 0.5 ? -1 : 1,
    timer: 1.5 + Math.random() * 2,
    phase: Math.random() * Math.PI * 2,
    punchCd: 0,
    targetRid: null,
    homeX: torso.position.x,
  };

  for (const p of parts) {
    if (p.plugin) p.plugin.ai = ai;
  }
  return true;
}

export function clearLivingAI(parts) {
  for (const p of parts) {
    if (p.plugin) p.plugin.ai = { mode: "idle", dir: 1, timer: 0, phase: 0, punchCd: 0 };
  }
}

function groupLivings(bodies) {
  const map = new Map();
  for (const b of bodies) {
    if (!b.plugin?.isLiving || !b.plugin?.ragdollId) continue;
    if (!map.has(b.plugin.ragdollId)) map.set(b.plugin.ragdollId, []);
    map.get(b.plugin.ragdollId).push(b);
  }
  return map;
}

function nearestOtherLiving(torso, byId) {
  let best = null;
  let bestD = Infinity;
  for (const [rid, parts] of byId) {
    if (rid === torso.plugin.ragdollId) continue;
    const other = parts.find((p) => p.plugin.part === "torso") || parts[0];
    if (!other?.plugin?.conscious) continue;
    if (other.plugin.state === "gone") continue;
    const d = Math.hypot(other.position.x - torso.position.x, other.position.y - torso.position.y);
    if (d < bestD) {
      bestD = d;
      best = other;
    }
  }
  return best ? { torso: best, dist: bestD } : null;
}

function applyWalkForce(torso, parts, dir, speed, dt) {
  const ai = torso.plugin.ai;
  ai.phase = (ai.phase || 0) + dt * 10 * Math.abs(speed);

  // Horizontal locomotion
  const force = 0.00055 * speed * dir;
  Body.applyForce(torso, torso.position, { x: force, y: -0.00008 });

  // Cap run speed
  const maxVx = 3.2 * Math.abs(speed);
  if (Math.abs(torso.velocity.x) > maxVx) {
    Body.setVelocity(torso, {
      x: Math.sign(torso.velocity.x) * maxVx,
      y: torso.velocity.y,
    });
  }

  // Leg swing for walk cycle
  const swing = Math.sin(ai.phase) * 0.35 * dir;
  for (const p of parts) {
    if (p.plugin.state === "gone" || p.plugin.detached) continue;
    const slot = p.plugin.partSlot;
    if (slot === "lul" || slot === "lll") {
      p.torque += (-(p.angle - swing) * 0.04 - p.angularVelocity * 0.02);
    } else if (slot === "rul" || slot === "rll") {
      p.torque += (-(p.angle + swing) * 0.04 - p.angularVelocity * 0.02);
    } else if (slot === "lf" || slot === "rf") {
      p.torque += (-p.angle * 0.05 - p.angularVelocity * 0.02);
    }
  }
}

function punch(world, parts, target, particles) {
  const hands = parts.filter(
    (p) =>
      (p.plugin.partSlot === "lla" || p.plugin.partSlot === "rla") &&
      p.plugin.state !== "gone" &&
      !p.plugin.detached
  );
  const fist = hands[Math.floor(Math.random() * hands.length)] || parts.find((p) => p.plugin.part === "torso");
  if (!fist) return;

  const dx = target.position.x - fist.position.x;
  const dy = target.position.y - fist.position.y;
  const dist = Math.max(8, Math.hypot(dx, dy));
  Body.applyForce(fist, fist.position, {
    x: (dx / dist) * 0.012,
    y: (dy / dist) * 0.008 - 0.002,
  });

  // Hit if close enough
  if (dist < 55) {
    damagePart(target, 12 + Math.random() * 10, particles, target.position);
    Body.applyForce(target, target.position, {
      x: (dx / dist) * 0.02,
      y: -0.01,
    });
    if (particles) {
      particles.burst(target.position.x, target.position.y, target.plugin?.fruit?.juice || "#ccc", 6, 3);
    }
  }

  // Arm wind-up torque
  for (const h of hands) {
    h.torque += (Math.random() - 0.5) * 0.08;
  }
}

/**
 * @param {object} world Matter world
 * @param {object[]} bodies all bodies
 * @param {number} dt
 * @param {object} [particles]
 * @param {{ w: number }} [worldSize]
 */
export function tickLivingAI(world, bodies, dt, particles = null, worldSize = null) {
  const byId = groupLivings(bodies);
  const maxX = worldSize?.w || 2400;

  for (const [, parts] of byId) {
    const torso = getTorso(parts);
    if (!torso?.plugin?.ai) continue;
    if (!torso.plugin.conscious) continue;
    if (torso.plugin.frozen || torso.isStatic) continue;
    if (torso.plugin.effects?.frozen) continue;
    if (parts.some((p) => p.plugin?.growing)) continue;

    const ai = torso.plugin.ai;
    if (!ai || ai.mode === "idle") continue;

    ai.punchCd = Math.max(0, (ai.punchCd || 0) - dt);
    ai.timer = (ai.timer || 0) - dt;

    // Keep AI ref shared on all parts
    for (const p of parts) {
      if (p.plugin) p.plugin.ai = ai;
    }

    if (ai.mode === "walk") {
      if (ai.timer <= 0) {
        ai.dir *= -1;
        ai.timer = 2 + Math.random() * 3;
      }
      // Turn around near world edges
      if (torso.position.x < 80) ai.dir = 1;
      if (torso.position.x > maxX - 80) ai.dir = -1;
      applyWalkForce(torso, parts, ai.dir, 1, dt);
      continue;
    }

    if (ai.mode === "flee") {
      const near = nearestOtherLiving(torso, byId);
      if (near && near.dist < 420) {
        ai.dir = near.torso.position.x < torso.position.x ? 1 : -1;
        applyWalkForce(torso, parts, ai.dir, 1.35, dt);
      } else if (ai.timer <= 0) {
        ai.dir = Math.random() < 0.5 ? -1 : 1;
        ai.timer = 1.2;
        applyWalkForce(torso, parts, ai.dir, 0.6, dt);
      } else {
        applyWalkForce(torso, parts, ai.dir || 1, 0.7, dt);
      }
      continue;
    }

    if (ai.mode === "follow") {
      const near = nearestOtherLiving(torso, byId);
      if (!near) {
        applyWalkForce(torso, parts, ai.dir || 1, 0.35, dt);
        continue;
      }
      if (near.dist < 70) {
        // linger — light idle sway
        Body.applyForce(torso, torso.position, { x: -torso.velocity.x * 0.0004, y: 0 });
        continue;
      }
      ai.dir = near.torso.position.x > torso.position.x ? 1 : -1;
      const spd = near.dist > 200 ? 1.15 : 0.85;
      applyWalkForce(torso, parts, ai.dir, spd, dt);
      continue;
    }

    if (ai.mode === "fight") {
      const near = nearestOtherLiving(torso, byId);
      if (!near) {
        // Patrol looking for trouble
        if (ai.timer <= 0) {
          ai.dir *= -1;
          ai.timer = 1.5 + Math.random() * 2;
        }
        applyWalkForce(torso, parts, ai.dir, 0.75, dt);
        continue;
      }

      ai.targetRid = near.torso.plugin.ragdollId;
      const dx = near.torso.position.x - torso.position.x;
      ai.dir = dx >= 0 ? 1 : -1;

      if (near.dist > 48) {
        applyWalkForce(torso, parts, ai.dir, 1.2, dt);
      } else {
        // Close — stop and punch
        Body.applyForce(torso, torso.position, { x: -torso.velocity.x * 0.0005, y: 0 });
        if (ai.punchCd <= 0) {
          punch(world, parts, near.torso, particles);
          // Also try hitting a random limb
          const targetParts = byId.get(near.torso.plugin.ragdollId) || [];
          const limb = targetParts.find(
            (p) => p.plugin.part !== "torso" && p.plugin.state !== "gone" && Math.random() < 0.5
          );
          if (limb && Math.hypot(limb.position.x - torso.position.x, limb.position.y - torso.position.y) < 60) {
            damagePart(limb, 8, particles, limb.position);
          }
          ai.punchCd = 0.45 + Math.random() * 0.25;
        }
      }
    }
  }
}

/** Tiny status chip above the head while AI is active. */
export function drawLivingAIBadge(ctx, body) {
  if (body.plugin?.part !== "head") return;
  const ai = body.plugin?.ai;
  if (!ai || ai.mode === "idle" || !body.plugin?.conscious) return;

  const labels = { walk: "WALK", fight: "FIGHT", flee: "FLEE", follow: "FOLLOW" };
  const colors = { walk: "#6ab0e0", fight: "#e06050", flee: "#e0c050", follow: "#70d090" };
  const text = labels[ai.mode];
  if (!text) return;

  const { x, y } = body.position;
  ctx.save();
  ctx.font = "bold 9px sans-serif";
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  const tw = ctx.measureText(text).width + 8;
  ctx.fillRect(x - tw / 2, y - 34, tw, 12);
  ctx.fillStyle = colors[ai.mode] || "#fff";
  ctx.fillText(text, x, y - 25);
  ctx.restore();
}
