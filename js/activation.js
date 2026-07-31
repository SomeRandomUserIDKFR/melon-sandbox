/** Which objects can Activate, and toggle helpers (Melon Sandbox style). */

export function isActivatable(body) {
  const pl = body?.plugin;
  if (!pl) return false;
  if (pl.activatable) return true;
  const d = pl.draw;
  return (
    d === "thruster" ||
    d === "spinner" ||
    d === "piston" ||
    d === "coil" ||
    d === "sprinkler" ||
    d === "fan" ||
    d === "heater" ||
    d === "conveyor" ||
    d === "saw" ||
    d === "flamethrower" ||
    d === "bomb" ||
    d === "firebomb" ||
    d === "rocket" ||
    d === "pistol" ||
    d === "rifle" ||
    d === "shotgun" ||
    d === "car" ||
    d === "wheel" ||
    d === "bike" ||
    d === "bus" ||
    d === "sensor" ||
    d === "button" ||
    d === "toggle" ||
    d === "minigun" ||
    d === "grenade" ||
    d === "crossbow" ||
    d === "squeezer" ||
    d === "boneMelter" ||
    d === "boneMoldSword" ||
    d === "boneMoldSpike" ||
    d === "boneMoldAxe" ||
    d === "boneMoldClub" ||
    d === "boneReconnector" ||
    d === "crystallizer" ||
    d === "shardSmelter"
  );
}

export function isActive(body) {
  return !!body?.plugin?.active;
}

export function setActive(body, on) {
  if (!body?.plugin) return;
  body.plugin.active = !!on;
  // Bombs: arm fuse when activated
  if ((body.plugin.draw === "bomb" || body.plugin.draw === "firebomb" || body.plugin.draw === "grenade") && on) {
    if (body.plugin.fuse == null) body.plugin.fuse = body.plugin.fuseMax ?? 2.2;
    body.plugin.armed = true;
  }
  // Vehicle: activate linked wheels too
  if (body.plugin.vehicleId && body.plugin.draw === "car") {
    // wheels share vehicleId; main tick drives them when chassis active
  }
}

export function toggleActive(body) {
  if (!isActivatable(body)) return false;
  setActive(body, !isActive(body));
  return true;
}

/** Mark a freshly spawned machine/weapon as inactive until Activate. */
export function markActivatable(body, { startActive = false } = {}) {
  if (!body?.plugin) return body;
  body.plugin.activatable = true;
  body.plugin.active = !!startActive;
  return body;
}
