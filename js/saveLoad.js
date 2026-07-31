/** Save / load scene JSON (contraption-style). */

import { MAPS } from "./maps.js";
import { createFruitRagdoll } from "./ragdoll.js";
import { markActivatable } from "./activation.js";
import { createLink, createWallPin } from "./connections.js";
import { setLivingAI } from "./livingAI.js";

const { Composite, Body, Bodies } = Matter;

/**
 * @param {object} game Game instance
 */
export function serializeScene(game) {
  const bodies = Composite.allBodies(game.world);
  const fruitsDone = new Set();
  const items = [];

  for (const b of bodies) {
    if (b.isStatic && (b.label === "ground" || b.label === "platform")) continue;
    if (b.plugin?.waterZone || b.plugin?.lavaZone) {
      items.push({
        kind: "element",
        id: b.plugin.waterZone ? "water" : "lava",
        x: b.position.x,
        y: b.position.y,
      });
      continue;
    }
    if (b.plugin?.fruit) {
      const rid = b.plugin.ragdollId;
      if (fruitsDone.has(rid)) continue;
      fruitsDone.add(rid);
      const parts = bodies.filter((p) => p.plugin?.ragdollId === rid);
      const torso = parts.find((p) => p.plugin.part === "torso") || parts[0];
      const vessel = torso.plugin.liquid;
      items.push({
        kind: "fruit",
        id: torso.plugin.fruitKey || "melon",
        x: torso.position.x,
        y: game.groundY, // recreate standing; offsets applied via torso
        torsoX: torso.position.x,
        torsoY: torso.position.y,
        juice: vessel?.amount ?? 80,
        conscious: !!torso.plugin.conscious,
        ai: torso.plugin.ai?.mode || "idle",
        parts: parts.map((p) => ({
          slot: p.plugin.partSlot,
          hp: p.plugin.hp,
          state: p.plugin.state,
          bruises: p.plugin.bruises || 0,
          angle: p.angle,
          x: p.position.x,
          y: p.position.y,
        })),
      });
      continue;
    }
    if (b.plugin?.vehiclePart === "wheel") continue; // saved with car
    if (b.plugin?.draw === "car" || b.plugin?.draw === "bike" || b.plugin?.draw === "bus") {
      items.push({
        kind: "vehicle",
        id: b.plugin.draw,
        x: b.position.x,
        y: b.position.y,
        angle: b.angle,
        active: !!b.plugin.active,
        frozen: !!b.plugin.frozen,
      });
      continue;
    }
    if (b.plugin?.clothing) {
      items.push({
        kind: "cloth",
        id: b.plugin.clothing,
        x: b.position.x,
        y: b.position.y,
        angle: b.angle,
        frozen: !!b.plugin.frozen,
      });
      continue;
    }
    if (b.plugin?.syringe) {
      items.push({
        kind: "syringe",
        id: b.plugin.syringe,
        x: b.position.x,
        y: b.position.y,
        angle: b.angle,
        used: !!b.plugin.used,
        liquid: b.plugin.liquid
          ? { amount: b.plugin.liquid.amount, type: b.plugin.liquid.type, color: b.plugin.liquid.color }
          : null,
        frozen: !!b.plugin.frozen,
      });
      continue;
    }
    if (b.plugin?.draw) {
      const spawnId = spawnIdFromDraw(b);
      if (!spawnId) continue;
      items.push({
        kind: kindFromBody(b),
        id: spawnId,
        x: b.position.x,
        y: b.position.y,
        angle: b.angle,
        active: !!b.plugin.active,
        frozen: !!b.plugin.frozen,
        liquid: b.plugin.liquid
          ? {
              amount: b.plugin.liquid.amount,
              capacity: b.plugin.liquid.capacity,
              type: b.plugin.liquid.type,
              color: b.plugin.liquid.color,
              fromShard: !!b.plugin.liquid.fromShard,
            }
          : null,
        color: b.plugin.color || null,
        tint: b.plugin.tint || null,
        crystalWeapon: !!b.plugin.crystalWeapon,
        hybridWeapon: !!b.plugin.hybridWeapon,
      });
    }
  }

  const ropes = [];
  for (const r of game.ropes || []) {
    if (r.plugin?.weldPair) continue; // saved with primary weld
    if (r.plugin?.wallPin && r.bodyA) {
      ropes.push({
        type: "pin",
        ax: r.bodyA.position.x,
        ay: r.bodyA.position.y,
        bx: r.pointB?.x ?? r.bodyA.position.x,
        by: r.pointB?.y ?? r.bodyA.position.y,
      });
      continue;
    }
    if (!r.bodyA || !r.bodyB) continue;
    ropes.push({
      type: r.plugin?.linkType || r.plugin?.draw || "rope",
      ax: r.bodyA.position.x,
      ay: r.bodyA.position.y,
      bx: r.bodyB.position.x,
      by: r.bodyB.position.y,
      signal: !!r.plugin?.signal,
    });
  }

  const platforms = (game.userPlatforms || []).map((p) => ({
    x: p.position.x,
    y: p.position.y,
    w: p.plugin?.platW || p.bounds.max.x - p.bounds.min.x,
    h: p.plugin?.platH || p.bounds.max.y - p.bounds.min.y,
  }));

  return {
    version: 1,
    mapId: game.mapId || "lab",
    camera: { ...game.camera },
    items,
    ropes,
    platforms,
  };
}

function kindFromBody(b) {
  const d = b.plugin?.draw;
  if (b.plugin?.syringe) return "syringe";
  if (
    [
      "thruster",
      "spinner",
      "piston",
      "mine",
      "coil",
      "sprinkler",
      "fan",
      "heater",
      "conveyor",
      "sensor",
      "button",
      "toggle",
      "squeezer",
      "boneMelter",
      "boneMoldSword",
      "boneMoldSpike",
      "boneMoldAxe",
      "boneMoldClub",
      "boneReconnector",
      "crystallizer",
      "shardSmelter",
    ].includes(d)
  )
    return "machine";
  if (
    [
      "sword",
      "hammer",
      "bomb",
      "rocket",
      "spike",
      "saw",
      "axe",
      "baton",
      "flamethrower",
      "firebomb",
      "shotgun",
      "pistol",
      "rifle",
      "minigun",
      "crossbow",
      "grenade",
      "boneSword",
      "boneSpike",
      "boneAxe",
      "boneClub",
    ].includes(d)
  )
    return "weapon";
  if (d === "cloth") return "cloth";
  if (d === "juiceShard") return "prop";
  if (
    ["water", "lava", "torch", "firebarrel", "watercan", "battery", "wire", "shockpad"].includes(d) ||
    b.plugin?.waterZone ||
    b.plugin?.lavaZone
  )
    return "element";
  return "prop";
}

function spawnIdFromDraw(b) {
  const d = b.plugin?.draw;
  if (!d) return null;
  const map = {
    box: "box",
    crate: "crate",
    plank: "plank",
    metal: "metal",
    weight: "weight",
    barrel: "barrel",
    tank: "tank",
    ball: "ball",
    rock: "boulder",
    wall: "wall",
    brick: "brick",
    tire: "tire",
    glass: "glass",
    anvil: "anvil",
    cage: "cage",
    balloon: "balloon",
    thruster: "thruster",
    spinner: "spinner",
    piston: "piston",
    mine: "mine",
    coil: "coil",
    sprinkler: "sprinkler",
    fan: "fan",
    heater: "heater",
    conveyor: "conveyor",
    sensor: "sensor",
    button: "button",
    toggle: "toggle",
    squeezer: "squeezer",
    boneMelter: "boneMelter",
    boneMoldSword: "boneMoldSword",
    boneMoldSpike: "boneMoldSpike",
    boneMoldAxe: "boneMoldAxe",
    boneMoldClub: "boneMoldClub",
    boneReconnector: "boneReconnector",
    crystallizer: "crystallizer",
    shardSmelter: "shardSmelter",
    juiceShard: "juiceShard",
    boneSword: "boneSword",
    boneSpike: "boneSpike",
    boneAxe: "boneAxe",
    boneClub: "boneClub",
    sword: "sword",
    hammer: "hammer",
    bomb: "bomb",
    rocket: "rocket",
    spike: "spike",
    saw: "saw",
    axe: "axe",
    baton: "baton",
    flamethrower: "flamethrower",
    firebomb: "firebomb",
    shotgun: "shotgun",
    pistol: "pistol",
    rifle: "rifle",
    minigun: "minigun",
    crossbow: "crossbow",
    grenade: "grenade",
    torch: "torch",
    firebarrel: "firebarrel",
    watercan: "watercan",
    battery: "battery",
    wire: "wire",
    shockpad: "shockpad",
  };
  return map[d] || null;
}

/**
 * Clear and restore from JSON. Uses game spawn helpers.
 */
export function deserializeScene(game, data) {
  if (!data || data.version !== 1) throw new Error("Unsupported save version");
  const mapId = data.mapId && MAPS[data.mapId] ? data.mapId : game.mapId || "lab";
  game.loadMap(mapId, { skipDefaultSpawn: true });

  const spawned = [];

  for (const item of data.items || []) {
    let body = null;
    if (item.kind === "fruit") {
      const y = item.torsoY != null ? item.torsoY + 50 : game.groundY;
      const rag = createFruitRagdoll(game.world, item.torsoX ?? item.x, y, item.id);
      if (rag?.parts) {
        const vessel = rag.torso?.plugin?.liquid;
        if (vessel && item.juice != null) vessel.amount = item.juice;
        if (item.parts) {
          for (const ps of item.parts) {
            const p = rag.parts.find((x) => x.plugin.partSlot === ps.slot);
            if (!p) continue;
            Body.setPosition(p, { x: ps.x, y: ps.y });
            Body.setAngle(p, ps.angle || 0);
            Body.setVelocity(p, { x: 0, y: 0 });
            p.plugin.hp = ps.hp;
            p.plugin.state = ps.state;
            p.plugin.bruises = ps.bruises || 0;
            if (item.conscious === false) {
              p.plugin.conscious = false;
              p.plugin.forceUnconscious = true;
            }
          }
        }
        spawned.push(rag.torso);
        if (item.ai && item.ai !== "idle") {
          // deferred — set after spawn
          rag.torso.plugin._pendingAI = item.ai;
        }
      }
      continue;
    }
    if (item.kind === "vehicle") {
      body = game._spawnVehicle(item.id, item.x, item.y);
    } else if (item.kind === "syringe") {
      body = game._spawnSyringe(item.id, item.x, item.y);
      if (body && item.used) {
        body.plugin.used = true;
        if (body.plugin.liquid) {
          body.plugin.liquid.amount = 0;
          body.plugin.liquid.type = "empty";
        }
      }
    } else if (item.kind === "cloth") {
      body = game._spawnCloth(item.id, item.x, item.y);
    } else if (item.kind === "prop") {
      body = game._spawnProp(item.id, item.x, item.y);
    } else if (item.kind === "machine") {
      body = game._spawnMachine(item.id, item.x, item.y);
    } else if (item.kind === "weapon") {
      body = game._spawnWeapon(item.id, item.x, item.y);
    } else if (item.kind === "element") {
      body = game._spawnElement(item.id, item.x, item.y);
    }
    if (body) {
      Body.setAngle(body, item.angle || 0);
      if (item.liquid && body.plugin?.liquid) {
        Object.assign(body.plugin.liquid, item.liquid);
      }
      if (item.color && body.plugin) body.plugin.color = item.color;
      if (item.tint && body.plugin) {
        body.plugin.tint = item.tint;
        body.plugin.color = item.tint;
      }
      if (item.crystalWeapon && body.plugin) body.plugin.crystalWeapon = true;
      if (item.hybridWeapon && body.plugin) body.plugin.hybridWeapon = true;
      if (item.active && body.plugin) {
        markActivatable(body, { startActive: true });
        body.plugin.active = true;
      }
      if (item.frozen) {
        Body.setStatic(body, true);
        body.plugin.frozen = true;
      }
      spawned.push(body);
    }
  }

  // User platforms from map editor
  for (const p of data.platforms || []) {
    const body = Bodies.rectangle(p.x, p.y, p.w || 100, p.h || 16, {
      isStatic: true,
      friction: 0.95,
      label: "platform",
      render: { visible: false },
      plugin: { userPlatform: true, platW: p.w, platH: p.h },
    });
    Composite.add(game.world, body);
    game.platforms.push(body);
    game.userPlatforms.push(body);
  }

  // Re-link ropes by nearest bodies
  for (const r of data.ropes || []) {
    const type = r.type || "rope";
    if (type === "pin") {
      const a = nearestDynamic(game, r.ax, r.ay);
      if (!a) continue;
      const pin = createWallPin(a, r.bx, r.by);
      Composite.add(game.world, pin);
      game.ropes.push(pin);
      continue;
    }
    const a = nearestDynamic(game, r.ax, r.ay);
    const b = nearestDynamic(game, r.bx, r.by);
    if (!a || !b || a === b) continue;
    const linkType = ["rope", "soft", "weld", "wire", "signal", "grip"].includes(type)
      ? type === "signal"
        ? "wire"
        : type
      : "rope";
    if (linkType === "grip") {
      // skip grips on load — fragile without hand slot data
      continue;
    }
    const { primary, extras } = createLink(a, b, linkType, { x: r.ax, y: r.ay }, { x: r.bx, y: r.by });
    Composite.add(game.world, [primary, ...extras]);
    game.ropes.push(primary, ...extras);
    if (primary.plugin?.signal || r.signal) {
      game.wires.push({ bodyA: a, bodyB: b, constraint: primary });
    }
  }

  // Restore living AI orders
  for (const b of Composite.allBodies(game.world)) {
    if (b.plugin?._pendingAI) {
      setLivingAI(game.world, b, b.plugin._pendingAI);
      delete b.plugin._pendingAI;
    }
  }

  if (data.camera) {
    game.camera.x = data.camera.x;
    game.camera.y = data.camera.y;
    game.camera.zoom = data.camera.zoom || 1;
  }
}

function nearestDynamic(game, x, y) {
  const bodies = Composite.allBodies(game.world).filter(
    (b) => !b.isStatic || b.plugin?.frozen
  );
  let best = null;
  let bestD = 80;
  for (const b of bodies) {
    if (b.label === "ground" || b.label === "platform") continue;
    const d = Math.hypot(b.position.x - x, b.position.y - y);
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  return best;
}

export function downloadSave(data, filename = "melon-sandbox-save.json") {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function saveToLocal(data, key = "melon-sandbox-autosave") {
  localStorage.setItem(key, JSON.stringify(data));
}

export function loadFromLocal(key = "melon-sandbox-autosave") {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  return JSON.parse(raw);
}
