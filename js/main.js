import { ParticleSystem } from "./particles.js";
import {
  FRUITS,
  createFruitRagdoll,
  damagePart,
  drawFruitBody,
  tickFruitPlugins,
  applyStandingMuscle,
  detachLimb,
  killLiving,
  equipClothing,
  clearClothing,
  syncClothing,
} from "./ragdoll.js";
import { SYRINGES, injectSyringe, tickSyringeEffects } from "./syringes.js";
import {
  tickLiquids,
  tickPipes,
  isLiquidTarget,
  ensureSyringeVessel,
  drainSyringeVessel,
  juicePercent,
  createContainerVessel,
  transferLiquid,
  syncSyringeFromVessel,
  getOrCreateVessel,
  tickSyringeExtraction,
  isSyringeEmpty,
  loseJuice,
  tickBleed,
  applyJuiceConsciousness,
  tickNaturalRegen,
} from "./liquids.js";
import { tickElements, onElementCollision, ignite } from "./elements.js";
import { ContextMenu, buildMenuItems } from "./contextMenu.js";
import { isActivatable, isActive, toggleActive, markActivatable } from "./activation.js";
import { MAPS, listMaps } from "./maps.js";
import { serializeScene, deserializeScene, downloadSave, saveToLocal, loadFromLocal } from "./saveLoad.js";
import { drawSprite } from "./sprites.js";
import {
  LINK_TYPES,
  createLink,
  createWallPin,
  createGrip,
  isHandPart,
  isPreferredHand,
  isGrabbable,
  releaseGrip,
  findNearestHand,
  findNearestGrabbable,
  drawLinkStyle,
} from "./connections.js";
import { tickSignalWires, tickSensors, onWiringCollision } from "./wiring.js";
import { setLivingAI, tickLivingAI, drawLivingAIBadge, AI_MODES } from "./livingAI.js";
import { checkPierce, startBleed } from "./pierce.js";
import {
  MultiplayerClient,
  ensureNetId,
  stampNetIds,
  drawMultiplayerGlows,
  getNetSeq,
  setNetSeq,
} from "./multiplayer.js";
import { createSqueezer, tickSqueezer } from "./squeezer.js";
import {
  createBoneMelter,
  tickBoneMelter,
  createBoneMold,
  tickBoneMold,
  createBoneReconnector,
  tickBoneReconnector,
  BONE_MOLDS,
} from "./boneMachines.js";
import {
  createCrystallizer,
  tickCrystallizer,
  createShardSmelter,
  tickShardSmelter,
  createJuiceShard,
} from "./juiceCrystal.js";

const {
  Engine,
  Runner,
  Bodies,
  Body,
  Composite,
  Constraint,
  Events,
  Query,
  Vector,
} = Matter;

const TOOLS = [
  { id: "drag", label: "Drag", icon: "D", color: "#6a7180" },
  { id: "freeze", label: "Freeze", icon: "F", color: "#5a9fd4" },
  { id: "rope", label: "Rope", icon: "R", color: "#c4a574" },
  { id: "soft", label: "Soft", icon: "~", color: "#d4b894" },
  { id: "weld", label: "Weld", icon: "W", color: "#8a9098" },
  { id: "pin", label: "Pin", icon: "+", color: "#5a9fd4" },
  { id: "wire", label: "Signal", icon: "⚡", color: "#60c070" },
  { id: "grip", label: "Grip", icon: "H", color: "#e0a060" },
  { id: "slice", label: "Slice", icon: "/", color: "#c07070" },
  { id: "pliers", label: "Pliers", icon: "✂", color: "#708090" },
  { id: "pipe", label: "Pipe", icon: "L", color: "#4a9aaa" },
  { id: "plat", label: "Platform", icon: "▭", color: "#6a6e74" },
  { id: "poke", label: "Poke", icon: "P", color: "#8a9098" },
  { id: "shoot", label: "Gun", icon: "G", color: "#5a6068" },
  { id: "explode", label: "Boom", icon: "B", color: "#b54a3a" },
  { id: "delete", label: "Delete", icon: "X", color: "#7a4040" },
];

const CHARACTERS = Object.keys(FRUITS).map((k) => ({
  id: k,
  label: FRUITS[k].label,
  kind: "fruit",
  color: FRUITS[k].skin,
  icon: "●",
}));

const WEAPONS = [
  { id: "pistol", label: "Pistol", kind: "weapon", color: "#5a6068", icon: "-" },
  { id: "rifle", label: "Rifle", kind: "weapon", color: "#4a5048", icon: "=" },
  { id: "sword", label: "Sword", kind: "weapon", color: "#9aa0a8", icon: "/" },
  { id: "hammer", label: "Hammer", kind: "weapon", color: "#6a7078", icon: "T" },
  { id: "bomb", label: "Bomb", kind: "weapon", color: "#2a2a2a", icon: "●" },
  { id: "rocket", label: "Rocket", kind: "weapon", color: "#a04030", icon: "▲" },
  { id: "spike", label: "Spike", kind: "weapon", color: "#8a9098", icon: "▲" },
  { id: "saw", label: "Saw", kind: "weapon", color: "#b0b4b8", icon: "⊛" },
  { id: "axe", label: "Axe", kind: "weapon", color: "#8a6060", icon: "ᚠ" },
  { id: "baton", label: "Baton", kind: "weapon", color: "#50a0d0", icon: "|" },
  { id: "flamethrower", label: "Flamer", kind: "weapon", color: "#d06020", icon: "≫" },
  { id: "firebomb", label: "Firebomb", kind: "weapon", color: "#b04020", icon: "●" },
  { id: "shotgun", label: "Shotgun", kind: "weapon", color: "#5a5040", icon: "=" },
  { id: "minigun", label: "Minigun", kind: "weapon", color: "#4a5058", icon: "≡" },
  { id: "crossbow", label: "Crossbow", kind: "weapon", color: "#6a5840", icon: "⋊" },
  { id: "grenade", label: "Grenade", kind: "weapon", color: "#3a5a38", icon: "●" },
  { id: "boneSword", label: "Bone Sword", kind: "weapon", color: "#e8e0d0", icon: "/" },
  { id: "boneSpike", label: "Bone Spike", kind: "weapon", color: "#d8d0c0", icon: "▲" },
  { id: "boneAxe", label: "Bone Axe", kind: "weapon", color: "#c8c0b0", icon: "ᚠ" },
  { id: "boneClub", label: "Bone Club", kind: "weapon", color: "#b8b0a0", icon: "T" },
];

const VEHICLES = [
  { id: "car", label: "Car", kind: "vehicle", color: "#c05040", icon: "▣" },
  { id: "bike", label: "Bike", kind: "vehicle", color: "#4a6a88", icon: "⌀" },
  { id: "bus", label: "Bus", kind: "vehicle", color: "#d0a020", icon: "▬" },
];

const CLOTHES = [
  { id: "hat", label: "Hat", kind: "cloth", color: "#c05040", icon: "⌒" },
  { id: "helmet", label: "Helmet", kind: "cloth", color: "#6a7080", icon: "∩" },
  { id: "vest", label: "Vest", kind: "cloth", color: "#3a5a80", icon: "▣" },
  { id: "cloak", label: "Cloak", kind: "cloth", color: "#5a2060", icon: "∇" },
];

const PROPS = [
  { id: "box", label: "Crate", kind: "prop", color: "#8a7355", icon: "■" },
  { id: "crate", label: "Pixelcrate", kind: "prop", color: "#a07848", icon: "▤" },
  { id: "plank", label: "Plank", kind: "prop", color: "#6e5840", icon: "—" },
  { id: "metal", label: "Beam", kind: "prop", color: "#7a8088", icon: "=" },
  { id: "weight", label: "Weight", kind: "prop", color: "#4a4e54", icon: "●" },
  { id: "barrel", label: "Barrel", kind: "prop", color: "#6a5a28", icon: "▥" },
  { id: "tank", label: "Tank", kind: "prop", color: "#4a7a88", icon: "▣" },
  { id: "ball", label: "Ball", kind: "prop", color: "#4a6a88", icon: "○" },
  { id: "boulder", label: "Boulder", kind: "prop", color: "#5a5a54", icon: "◉" },
  { id: "wall", label: "Wall", kind: "prop", color: "#6a6e74", icon: "▮" },
  { id: "brick", label: "Brick", kind: "prop", color: "#8a5040", icon: "▤" },
  { id: "tire", label: "Tire", kind: "prop", color: "#2a2a2a", icon: "◎" },
  { id: "glass", label: "Glass", kind: "prop", color: "#a8d0e0", icon: "◇" },
  { id: "anvil", label: "Anvil", kind: "prop", color: "#3a3e44", icon: "▃" },
  { id: "cage", label: "Cage", kind: "prop", color: "#6a7078", icon: "▦" },
  { id: "balloon", label: "Balloon", kind: "prop", color: "#d06070", icon: "○" },
];

const ELEMENTS = [
  { id: "water", label: "Water", kind: "element", color: "#3a8ab0", icon: "~" },
  { id: "lava", label: "Lava", kind: "element", color: "#d05020", icon: "~" },
  { id: "torch", label: "Torch", kind: "element", color: "#c06020", icon: "!" },
  { id: "firebarrel", label: "Firecan", kind: "element", color: "#a04018", icon: "▥" },
  { id: "watercan", label: "Watercan", kind: "element", color: "#4a90b0", icon: "▥" },
  { id: "battery", label: "Battery", kind: "element", color: "#3a8a50", icon: "+" },
  { id: "wire", label: "Wire", kind: "element", color: "#c4a040", icon: "~" },
  { id: "shockpad", label: "Shockpad", kind: "element", color: "#d0c040", icon: "▬" },
];

const MACHINES = [
  { id: "thruster", label: "Thruster", kind: "machine", color: "#b54a3a", icon: "▲" },
  { id: "spinner", label: "Spinner", kind: "machine", color: "#8a9098", icon: "↻" },
  { id: "piston", label: "Piston", kind: "machine", color: "#6a7180", icon: "↕" },
  { id: "mine", label: "Mine", kind: "machine", color: "#3a3a3a", icon: "✦" },
  { id: "coil", label: "Tesla", kind: "machine", color: "#60a0d0", icon: "⚡" },
  { id: "sprinkler", label: "Sprinkler", kind: "machine", color: "#50a0c0", icon: "※" },
  { id: "fan", label: "Fan", kind: "machine", color: "#7a8088", icon: "✸" },
  { id: "heater", label: "Heater", kind: "machine", color: "#c05030", icon: "▣" },
  { id: "conveyor", label: "Conveyor", kind: "machine", color: "#5a6068", icon: "═" },
  { id: "sensor", label: "Sensor", kind: "machine", color: "#60c070", icon: "◎" },
  { id: "button", label: "Button", kind: "machine", color: "#d05050", icon: "●" },
  { id: "toggle", label: "Toggle", kind: "machine", color: "#c0a040", icon: "⏻" },
  { id: "squeezer", label: "Squeezer", kind: "machine", color: "#6a5a40", icon: "▣" },
  { id: "boneMelter", label: "Bone Melter", kind: "machine", color: "#c8c0b0", icon: "♨" },
  { id: "boneMoldSword", label: "Sword Mold", kind: "machine", color: "#d0c8b8", icon: "/" },
  { id: "boneMoldSpike", label: "Spike Mold", kind: "machine", color: "#c8c0b0", icon: "▲" },
  { id: "boneMoldAxe", label: "Axe Mold", kind: "machine", color: "#b8b0a0", icon: "ᚠ" },
  { id: "boneMoldClub", label: "Club Mold", kind: "machine", color: "#a8a090", icon: "T" },
  { id: "boneReconnector", label: "Bone Join", kind: "machine", color: "#e0d8c8", icon: "⛓" },
  { id: "crystallizer", label: "Crystallizer", kind: "machine", color: "#90d070", icon: "◆" },
  { id: "shardSmelter", label: "Shard Smelter", kind: "machine", color: "#70a0c0", icon: "♨" },
];

const SYRINGE_ITEMS = Object.values(SYRINGES).map((s) => ({
  id: s.id,
  label: s.label,
  kind: "syringe",
  color: s.color,
  icon: s.icon,
}));

export class Game {
  constructor() {
    this.canvas = document.getElementById("world");
    this.wrap = document.getElementById("stage-wrap");
    this.hudTool = document.getElementById("hud-tool");
    this.paused = false;
    this.tool = "drag";
    this.spawnItem = null;
    this.particles = new ParticleSystem();
    this.ragdolls = [];
    this.bombs = [];
    this.projectiles = [];
    this.machines = [];
    this.vehicles = [];
    this.ropes = [];
    this.ropeAnchor = null;
    this.ropePoint = null;
    this.linkTool = "rope";
    this.wires = [];
    this.grips = [];
    this.gripHand = null;
    this.pipes = [];
    this.pipeAnchor = null;
    this.userPlatforms = [];
    this.platDrag = null;
    this.drag = { body: null, constraint: null, pointerId: null };
    this.pointerWorld = { x: 0, y: 0 };
    this.camera = { x: 0, y: 0, zoom: 1 };
    this.worldSize = { w: 2400, h: 1200 };
    this.mapId = "lab";
    this.mapTheme = "lab";
    this._last = performance.now();
    this._shake = 0;
    this._longPress = null;
    this._bgCache = null;
    this._bgCacheKey = "";
    this.mp = new MultiplayerClient(this);
    this._remoteDragConstraints = new Map(); // peerId -> constraint
    this._selectedNetId = null;

    this.engine = Engine.create({
      gravity: { x: 0, y: 1.1 },
      enableSleeping: true,
      positionIterations: 8,
      velocityIterations: 6,
      constraintIterations: 4,
    });
    this.world = this.engine.world;

    this.contextMenu = new ContextMenu({
      onAction: (id, body) => this._onContextAction(id, body),
    });

    this.loadMap("lab");
    this._bindUI();
    this._bindInput();
    this._resize();
    window.addEventListener("resize", () => this._resize());

    Events.on(this.engine, "collisionStart", (e) => this._onCollisions(e));
    Events.on(this.engine, "beforeUpdate", () => {
      // Regrow parts are static while held — no need to re-pose every physics step
      applyStandingMuscle(Composite.allBodies(this.world));
      this._updateDragConstraint();
    });

    this.runner = Runner.create();
    Runner.run(this.runner, this.engine);

    window.game = this;
    requestAnimationFrame((t) => this._frame(t));
  }

  loadMap(mapId, { skipDefaultSpawn = false } = {}) {
    const def = MAPS[mapId] || MAPS.lab;
    this.mapId = def.id;
    this.mapTheme = def.theme;
    this.worldSize = { ...def.size };
    this.groundY = def.groundY;
    this._bgCache = null;
    this._bgCacheKey = "";

    // Wipe world contents
    Composite.clear(this.world, false);
    this.bombs = [];
    this.projectiles = [];
    this.machines = [];
    this.vehicles = [];
    this.ropes = [];
    this.ropeAnchor = null;
    this.ropePoint = null;
    this.wires = [];
    this.grips = [];
    this.gripHand = null;
    this.pipes = [];
    this.pipeAnchor = null;
    this.userPlatforms = [];
    this.platDrag = null;
    this.particles.particles = [];
    this._endDrag();

    const { w, h } = this.worldSize;
    const thick = 80;
    const groundY = this.groundY;
    const opts = {
      isStatic: true,
      friction: 0.95,
      render: { visible: false },
      label: "ground",
    };

    this.ground = Bodies.rectangle(w / 2, groundY + thick / 2, w + 400, thick, opts);
    const left = Bodies.rectangle(-thick / 2, h / 2, thick, h * 2, opts);
    const right = Bodies.rectangle(w + thick / 2, h / 2, thick, h * 2, opts);
    const ceiling = Bodies.rectangle(w / 2, -thick / 2, w + 400, thick, opts);

    const platOpts = { ...opts, label: "platform" };
    const platforms = (def.platforms || []).map((p) =>
      Bodies.rectangle(p.x, p.y, p.w, p.h, platOpts)
    );

    Composite.add(this.world, [this.ground, left, right, ceiling, ...platforms]);
    this.platforms = platforms;
    this.userPlatforms = [];

    // Reset camera to map
    this.camera.x = 0;
    this.camera.y = 0;
    this._resize();

    if (!skipDefaultSpawn) {
      for (const s of def.spawn || []) {
        const y = groundY + (s.yOff || 0);
        if (s.kind === "fruit") createFruitRagdoll(this.world, s.x, groundY, s.id);
        else if (s.kind === "prop") this._spawnProp(s.id, s.x, y);
        else if (s.kind === "vehicle") this._spawnVehicle(s.id, s.x, y);
        else if (s.kind === "machine") this._spawnMachine(s.id, s.x, y);
        else if (s.kind === "weapon") this._spawnWeapon(s.id, s.x, y);
      }
    }
    this._mpStampWorld();

    const sel = document.getElementById("map-select");
    if (sel) sel.value = this.mapId;
  }

  _buildArena() {
    this.loadMap(this.mapId || "lab");
  }

  _clientToWorld(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left) / this.camera.zoom + this.camera.x,
      y: (clientY - rect.top) / this.camera.zoom + this.camera.y,
    };
  }

  _eventToWorld(e) {
    return this._clientToWorld(e.clientX, e.clientY);
  }

  _bodiesAt(x, y, { includeFrozen = false, radius = 14 } = {}) {
    const all = Composite.allBodies(this.world);
    let hits = Query.point(all, { x, y });
    if (!hits.length && radius > 0) {
      hits = Query.region(all, {
        min: { x: x - radius, y: y - radius },
        max: { x: x + radius, y: y + radius },
      });
    }
    // Fallback: nearest AABB distance (thin limbs / edge clicks)
    if (!hits.length && radius > 0) {
      hits = all.filter((b) => distToBodyBounds(b, x, y) <= radius);
    }
    // Prefer closest surface, then smaller bodies (easier limb picks)
    hits = hits.slice().sort((a, b) => {
      const da = distToBodyBounds(a, x, y);
      const db = distToBodyBounds(b, x, y);
      if (Math.abs(da - db) > 2) return da - db;
      const aa = (a.bounds.max.x - a.bounds.min.x) * (a.bounds.max.y - a.bounds.min.y);
      const bb = (b.bounds.max.x - b.bounds.min.x) * (b.bounds.max.y - b.bounds.min.y);
      return aa - bb;
    });
    return hits.filter((b) => {
      if (b.label === "ground" || b.label === "platform") return false;
      if (b.plugin?.waterZone || b.plugin?.lavaZone) return false;
      if (!b.isStatic) return true;
      return includeFrozen && !!b.plugin?.frozen;
    });
  }

  _openContextAt(clientX, clientY, world) {
    // Generous pick radius — right-click was too easy to miss thin limbs
    const hits = this._bodiesAt(world.x, world.y, { includeFrozen: true, radius: 36 });
    if (!hits.length) {
      this.contextMenu.hide();
      return;
    }
    const body = hits[0];
    const rid = body.plugin?.ragdollId;
    const livingHolds = !!(
      rid &&
      Composite.allBodies(this.world).some(
        (b) => b.plugin?.ragdollId === rid && b.plugin?.holding
      )
    );
    const items = buildMenuItems(body, { isActivatable, isActive, livingHolds });
    // Defer show so the opening pointerdown doesn't dismiss the menu
    requestAnimationFrame(() => {
      this.contextMenu.show(clientX, clientY, body, items);
    });
  }

  _startDrag(body, world, pointerId) {
    this._endDrag();
    if (!body || body.isStatic) return;
    const netId = ensureNetId(body);
    this._selectedNetId = netId;
    if (this.mp?.enabled) this.mp.setLocalSelection(netId);

    // Guests: host owns the drag constraint
    if (this.mp?.enabled && !this.mp.isHost) {
      this.drag = { body, constraint: null, pointerId, remote: true, netId };
      this.mp.sendDrag("start", { netId, x: world.x, y: world.y });
      return;
    }

    Body.set(body, { isSleeping: false });
    const dx = world.x - body.position.x;
    const dy = world.y - body.position.y;
    const cos = Math.cos(-body.angle);
    const sin = Math.sin(-body.angle);
    const constraint = Constraint.create({
      pointA: { x: world.x, y: world.y },
      bodyB: body,
      pointB: {
        x: dx * cos - dy * sin,
        y: dx * sin + dy * cos,
      },
      stiffness: 0.45,
      damping: 0.08,
      length: 0,
      render: { visible: false },
    });
    Composite.add(this.world, constraint);
    this.drag = { body, constraint, pointerId };
  }

  _updateDragConstraint() {
    if (this.drag?.remote && this.mp?.enabled) {
      this.mp.sendDrag("move", {
        netId: this.drag.netId,
        x: this.pointerWorld.x,
        y: this.pointerWorld.y,
      });
      return;
    }
    if (!this.drag.constraint) return;
    this.drag.constraint.pointA.x = this.pointerWorld.x;
    this.drag.constraint.pointA.y = this.pointerWorld.y;
  }

  _endDrag() {
    if (this.drag?.remote && this.mp?.enabled) {
      this.mp.sendDrag("end", { netId: this.drag.netId, x: this.pointerWorld.x, y: this.pointerWorld.y });
    }
    if (this.drag.constraint) {
      Composite.remove(this.world, this.drag.constraint);
    }
    this.drag = { body: null, constraint: null, pointerId: null };
  }

  _bindUI() {
    this._fillGrid("tool-grid", TOOLS, (item) => {
      this.setTool(item.id);
      this.spawnItem = null;
      this._refreshActive();
    });
    this._fillGrid("char-grid", CHARACTERS, (item) => {
      this.spawnItem = item;
      this.setTool("spawn");
      this._refreshActive();
    });
    this._fillGrid("prop-grid", PROPS, (item) => {
      this.spawnItem = item;
      this.setTool("spawn");
      this._refreshActive();
    });
    this._fillGrid("weapon-grid", WEAPONS, (item) => {
      this.spawnItem = item;
      this.setTool("spawn");
      this._refreshActive();
    });
    this._fillGrid("machine-grid", MACHINES, (item) => {
      this.spawnItem = item;
      this.setTool("spawn");
      this._refreshActive();
    });
    this._fillGrid("vehicle-grid", VEHICLES, (item) => {
      this.spawnItem = item;
      this.setTool("spawn");
      this._refreshActive();
    });
    this._fillGrid("element-grid", ELEMENTS, (item) => {
      this.spawnItem = item;
      this.setTool("spawn");
      this._refreshActive();
    });
    this._fillGrid("syringe-grid", SYRINGE_ITEMS, (item) => {
      this.spawnItem = item;
      this.setTool("spawn");
      this._refreshActive();
    });
    this._fillGrid("cloth-grid", CLOTHES, (item) => {
      this.spawnItem = item;
      this.setTool("spawn");
      this._refreshActive();
    });

    const mapSel = document.getElementById("map-select");
    if (mapSel) {
      mapSel.innerHTML = "";
      for (const m of listMaps()) {
        const opt = document.createElement("option");
        opt.value = m.id;
        opt.textContent = m.label;
        mapSel.appendChild(opt);
      }
      mapSel.value = this.mapId;
      mapSel.onchange = () => {
        if (this.mp?.enabled && !this.mp.isHost) {
          this.mp.sendAction({ act: "map", mapId: mapSel.value });
          mapSel.value = this.mapId;
          return;
        }
        this.loadMap(mapSel.value);
        if (this.mp?.enabled && this.mp.isHost) {
          this._mpStampWorld();
          this.mp.send({ type: "full", data: this._mpSerialize() });
        }
      };
    }

    document.getElementById("btn-pause").onclick = () => this.togglePause();
    document.getElementById("btn-clear").onclick = () => this.clearAll();
    document.getElementById("btn-help").onclick = () => this._showHelp(true);
    document.getElementById("help-close").onclick = () => this._showHelp(false);
    document.getElementById("btn-save").onclick = () => this._saveScene();
    const btnMp = document.getElementById("btn-mp");
    if (btnMp) {
      btnMp.onclick = () => this.mp.toggle();
      btnMp.textContent = "MP Join";
    }
    this.mp.onStatus = (t) => {
      const el = document.getElementById("mp-status");
      if (el) el.textContent = t;
    };
    // Auto-join when opened with ?mp=1 or #mp
    if (/\bmp=1\b/.test(location.search) || location.hash === "#mp") {
      setTimeout(() => this.mp.connect(), 300);
    }
    document.getElementById("btn-load").onclick = () => {
      document.getElementById("load-file").click();
    };
    document.getElementById("load-file").onchange = (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          deserializeScene(this, JSON.parse(reader.result));
        } catch (err) {
          console.error(err);
          alert("Could not load save file.");
        }
      };
      reader.readAsText(file);
      e.target.value = "";
    };
    this._refreshActive();
  }

  _saveScene() {
    const data = serializeScene(this);
    saveToLocal(data);
    downloadSave(data);
    this.hudTool.textContent = "Saved scene (download + browser)";
    setTimeout(() => this.setTool(this.tool), 1200);
  }

  _onContextAction(action, body) {
    if (!body) return;
    // Guests forward most living/object actions to host (except selection already local)
    if (
      this.mp?.enabled &&
      !this.mp.isHost &&
      ["activate", "freeze", "kill", "detach", "drop", "equip", "delete"].includes(action)
    ) {
      this.mp.sendAction({ act: "context", action, netId: ensureNetId(body) });
      return;
    }
    if (action === "activate") {
      toggleActive(body);
      if (body.plugin?.draw === "car") {
        // keep vehicle list in sync — wheels follow chassis active in tick
      }
      this.particles.burst(
        body.position.x,
        body.position.y,
        isActive(body) ? "#9ad06a" : "#888",
        8,
        3
      );
      if (this.mp?.enabled && this.mp.isHost) this._mpQueueFullSync();
      return;
    }
    if (action === "freeze") {
      this._freezeAt(body.position.x, body.position.y);
      if (this.mp?.enabled && this.mp.isHost) this._mpQueueFullSync();
      return;
    }
    if (action === "kill") {
      killLiving(this.world, body, this.particles);
      if (this.mp?.enabled && this.mp.isHost) this._mpQueueFullSync();
      return;
    }
    if (action === "detach") {
      detachLimb(this.world, body);
      this.particles.burst(body.position.x, body.position.y, body.plugin?.fruit?.juice || "#aaa", 12, 5);
      if (this.mp?.enabled && this.mp.isHost) this._mpQueueFullSync();
      return;
    }
    if (action === "drop") {
      if (body.plugin?.fruit) {
        const rid = body.plugin.ragdollId;
        const parts = Composite.allBodies(this.world).filter((p) => p.plugin?.ragdollId === rid);
        releaseGrip(this.world, body);
        clearClothing(parts);
        this.grips = this.grips.filter((g) => Composite.allConstraints(this.world).includes(g));
      } else {
        releaseGrip(this.world, body);
        this.grips = this.grips.filter((g) => Composite.allConstraints(this.world).includes(g));
      }
      this.particles.burst(body.position.x, body.position.y, "#e0a060", 6, 2);
      if (this.mp?.enabled && this.mp.isHost) this._mpQueueFullSync();
      return;
    }
    if (action === "equip") {
      this._equipClothingNear(body);
      if (this.mp?.enabled && this.mp.isHost) this._mpQueueFullSync();
      return;
    }
    if (action?.startsWith("ai-")) {
      const mode = action.slice(3);
      if (!AI_MODES[mode]) return;
      if (this.mp?.enabled && !this.mp.isHost) {
        const netId = ensureNetId(body);
        this.mp.sendAction({ act: "ai", netId, mode });
        return;
      }
      if (!body.plugin?.conscious && mode !== "idle") {
        this.hudTool.textContent = "Living is KO — can't take orders";
        setTimeout(() => this.setTool(this.tool), 1200);
        return;
      }
      if (setLivingAI(this.world, body, mode)) {
        const col = { walk: "#6ab0e0", fight: "#e06050", flee: "#e0c050", follow: "#70d090", idle: "#aaa" }[
          mode
        ];
        this.particles.burst(body.position.x, body.position.y, col || "#aaa", 10, 3);
        this.hudTool.textContent =
          mode === "idle" ? "Order: Stop" : `Order: ${AI_MODES[mode].label}`;
        setTimeout(() => this.setTool(this.tool), 1000);
        if (this.mp?.enabled && this.mp.isHost) this._mpQueueFullSync();
      }
      return;
    }
    if (action === "delete") {
      this._deleteAt(body.position.x, body.position.y);
    }
    if (this.mp?.enabled && this.mp.isHost) this._mpQueueFullSync();
  }

  _fillGrid(id, items, onClick) {
    const el = document.getElementById(id);
    el.innerHTML = "";
    for (const item of items) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "spawn-btn";
      btn.dataset.id = item.id;
      btn.innerHTML = `<span class="icon" style="background:${item.color || "#355840"}">${item.icon || "●"}</span>${item.label}`;
      btn.onclick = () => onClick(item);
      el.appendChild(btn);
    }
  }

  _refreshActive() {
    document.querySelectorAll(".spawn-btn").forEach((btn) => {
      const id = btn.dataset.id;
      const active =
        (this.tool === id && TOOLS.some((t) => t.id === id)) ||
        (this.spawnItem && this.spawnItem.id === id);
      btn.classList.toggle("active", !!active);
    });
  }

  setTool(id) {
    this.tool = id;
    const linkTools = ["rope", "soft", "weld", "wire", "pin"];
    if (!linkTools.includes(id)) {
      this.ropeAnchor = null;
      this.ropePoint = null;
    } else {
      this.linkTool = id;
    }
    if (id !== "grip") this.gripHand = null;
    if (id !== "pipe") this.pipeAnchor = null;
    if (id !== "plat") this.platDrag = null;
    const labels = {
      drag: "Drag",
      freeze: "Freeze",
      rope: "Rope",
      soft: "Soft rope",
      weld: "Weld",
      pin: "Wall pin",
      wire: "Signal wire",
      grip: "Grip (hand ↔ item — click near either)",
      slice: "Slice",
      pliers: "Pliers (cut wires)",
      pipe: "Pipe",
      plat: "Platform (drag)",
      poke: "Poke",
      shoot: "Gun",
      explode: "Boom",
      delete: "Delete",
      spawn: this.spawnItem ? `Spawn ${this.spawnItem.label}` : "Spawn",
    };
    this.hudTool.textContent = `Tool: ${labels[id] || id}`;
    if (id !== "drag") this._endDrag();
  }

  _bindInput() {
    // Right-click: use contextmenu (more reliable than button===2 on pointerdown)
    this.canvas.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const world = this._eventToWorld(e);
      this.pointerWorld = world;
      this._ctxMenuAt = performance.now();
      this._openContextAt(e.clientX, e.clientY, world);
    });

    // Fallback when contextmenu is suppressed (some browsers / overlays)
    this.canvas.addEventListener("pointerup", (e) => {
      if (e.button !== 2) return;
      if (performance.now() - (this._ctxMenuAt || 0) < 450) return;
      if (!this.contextMenu.el.classList.contains("hidden")) return;
      const world = this._eventToWorld(e);
      this.pointerWorld = world;
      this._openContextAt(e.clientX, e.clientY, world);
    });

    // Double-click → same as right-click menu
    this.canvas.addEventListener("dblclick", (e) => {
      e.preventDefault();
      const world = this._eventToWorld(e);
      this.pointerWorld = world;
      this._ctxMenuAt = performance.now();
      this._endDrag();
      if (this._longPress) {
        clearTimeout(this._longPress.timer);
        this._longPress = null;
      }
      this._openContextAt(e.clientX, e.clientY, world);
    });

    this.canvas.addEventListener("pointerdown", (e) => {
      this.canvas.setPointerCapture?.(e.pointerId);
      const world = this._eventToWorld(e);
      this.pointerWorld = world;
      if (e.button !== 2) this.contextMenu.hide();

      if (e.button === 1 || (e.button === 0 && e.altKey)) {
        this._panning = true;
        this._panLast = { x: e.clientX, y: e.clientY };
        return;
      }
      if (e.button === 2) {
        // Handled by contextmenu event
        return;
      }
      if (e.button !== 0) return;

      // Background drag → pan (empty space, unless spawning / placing platform)
      const bgHits = this._bodiesAt(world.x, world.y, { radius: 14 });
      const placing =
        (this.tool === "spawn" && this.spawnItem) || this.tool === "plat";
      if (!bgHits.length && !placing) {
        this._panning = true;
        this._panLast = { x: e.clientX, y: e.clientY };
        this._panFromBg = true;
        return;
      }

      // Long-press → context menu (touch / Melon mobile feel)
      this._longPress = {
        pointerId: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        world,
        timer: setTimeout(() => {
          if (!this._longPress || this._longPress.pointerId !== e.pointerId) return;
          this._openContextAt(e.clientX, e.clientY, world);
          this._longPress = null;
          this._endDrag();
        }, 480),
      };

      if (this.tool === "drag") {
        if (bgHits[0]) this._startDrag(bgHits[0], world, e.pointerId);
        return;
      }
      if (this.tool === "spawn" && this.spawnItem) {
        this._spawnAt(this.spawnItem, world.x, world.y);
        return;
      }
      if (this.tool === "freeze") {
        if (this.mp?.enabled && !this.mp.isHost) this.mp.sendAction({ act: "freeze", x: world.x, y: world.y });
        else {
          this._freezeAt(world.x, world.y);
          this._mpQueueFullSync();
        }
        return;
      }
      if (["rope", "soft", "weld", "wire"].includes(this.tool)) {
        if (this.mp?.enabled && !this.mp.isHost) return; // host-only build tools for now
        this._linkAt(this.tool, world.x, world.y);
        this._mpQueueFullSync();
        return;
      }
      if (this.tool === "pin") {
        if (this.mp?.enabled && !this.mp.isHost) return;
        this._pinAt(world.x, world.y);
        this._mpQueueFullSync();
        return;
      }
      if (this.tool === "grip") {
        if (this.mp?.enabled && !this.mp.isHost) return;
        this._gripAt(world.x, world.y);
        this._mpQueueFullSync();
        return;
      }
      if (this.tool === "slice") {
        if (this.mp?.enabled && !this.mp.isHost) this.mp.sendAction({ act: "slice", x: world.x, y: world.y });
        else {
          this._sliceAt(world.x, world.y);
          this._mpQueueFullSync();
        }
        return;
      }
      if (this.tool === "pliers") {
        if (this.mp?.enabled && !this.mp.isHost) this.mp.sendAction({ act: "pliers", x: world.x, y: world.y });
        else {
          this._pliersAt(world.x, world.y);
          this._mpQueueFullSync();
        }
        return;
      }
      if (this.tool === "plat") {
        if (this.mp?.enabled && !this.mp.isHost) return;
        this.platDrag = { x: world.x, y: world.y };
        return;
      }
      if (this.tool === "pipe") {
        if (this.mp?.enabled && !this.mp.isHost) return;
        this._pipeAt(world.x, world.y);
        this._mpQueueFullSync();
        return;
      }
      if (this.tool === "poke") {
        if (this.mp?.enabled && !this.mp.isHost) this.mp.sendAction({ act: "poke", x: world.x, y: world.y });
        else {
          this._poke(world.x, world.y);
          this._mpQueueFullSync();
        }
        return;
      }
      if (this.tool === "shoot") {
        if (this.mp?.enabled && !this.mp.isHost) this.mp.sendAction({ act: "shoot", x: world.x, y: world.y });
        else this._shoot(world.x, world.y);
        return;
      }
      if (this.tool === "explode") {
        if (this.mp?.enabled && !this.mp.isHost) this.mp.sendAction({ act: "explode", x: world.x, y: world.y });
        else {
          this._explode(world.x, world.y, 0.12);
          this._mpQueueFullSync();
        }
        return;
      }
      if (this.tool === "delete") {
        if (this.mp?.enabled && !this.mp.isHost) this.mp.sendAction({ act: "delete", x: world.x, y: world.y });
        else {
          this._deleteAt(world.x, world.y);
          this._mpQueueFullSync();
        }
      }
    });

    this.canvas.addEventListener("pointermove", (e) => {
      const world = this._eventToWorld(e);
      this.pointerWorld = world;

      if (this._longPress && this._longPress.pointerId === e.pointerId) {
        const dx = e.clientX - this._longPress.x;
        const dy = e.clientY - this._longPress.y;
        if (dx * dx + dy * dy > 100) {
          clearTimeout(this._longPress.timer);
          this._longPress = null;
        }
      }

      if (this._panning && this._panLast) {
        const dx = e.clientX - this._panLast.x;
        const dy = e.clientY - this._panLast.y;
        this._panLast = { x: e.clientX, y: e.clientY };
        this.camera.x -= dx / this.camera.zoom;
        this.camera.y -= dy / this.camera.zoom;
        return;
      }

      if (this.drag.constraint) {
        this._updateDragConstraint();
      }
    });

    const endPointer = (e) => {
      if (this._longPress && this._longPress.pointerId === e.pointerId) {
        clearTimeout(this._longPress.timer);
        this._longPress = null;
      }
      if (this.platDrag && this.tool === "plat") {
        const world = this._eventToWorld(e);
        this._finishPlatform(this.platDrag.x, this.platDrag.y, world.x, world.y);
        this.platDrag = null;
      }
      if (this.drag.pointerId == null || e.pointerId === this.drag.pointerId) {
        this._endDrag();
      }
      this._panning = false;
      this._panLast = null;
    };
    this.canvas.addEventListener("pointerup", endPointer);
    this.canvas.addEventListener("pointercancel", endPointer);

    this.canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const before = this._eventToWorld(e);
        const factor = e.deltaY > 0 ? 0.92 : 1.08;
        this.camera.zoom = Math.min(2.2, Math.max(0.45, this.camera.zoom * factor));
        const after = this._eventToWorld(e);
        this.camera.x += before.x - after.x;
        this.camera.y += before.y - after.y;
      },
      { passive: false }
    );

    window.addEventListener("keydown", (e) => {
      if (e.code === "Space") {
        e.preventDefault();
        this.togglePause();
      }
      if (e.key === "r" || e.key === "R") this.clearAll();
      if (e.key === "1") this.setTool("drag");
      if (e.key === "2") this.setTool("freeze");
      if (e.key === "3") this.setTool("rope");
      if (e.key === "4") this.setTool("weld");
      if (e.key === "5") this.setTool("slice");
      if (e.key === "6") this.setTool("grip");
      if (e.key === "7") this.setTool("poke");
      if (e.key === "8") this.setTool("shoot");
      if (e.key === "9") this.setTool("explode");
      if (e.key === "0") this.setTool("delete");
      if (e.key === "?" || e.key === "h") this._showHelp(true);
      this._refreshActive();
    });
  }

  _showHelp(show) {
    document.getElementById("help-modal").classList.toggle("hidden", !show);
  }

  togglePause() {
    this.paused = !this.paused;
    const guest = this.mp?.enabled && !this.mp.isHost;
    if (this.paused || guest) Runner.stop(this.runner);
    else Runner.run(this.runner, this.engine);
    document.getElementById("btn-pause").textContent = this.paused ? "Resume" : "Pause";
  }

  clearAll() {
    if (this.mp?.enabled && !this.mp.isHost) {
      this.mp.sendAction({ act: "clear" });
      return;
    }
    this._endDrag();
    const all = Composite.allBodies(this.world);
    const toRemove = all.filter(
      (b) => !(b.isStatic && (b.label === "ground" || b.label === "platform"))
    );
    const constraints = Composite.allConstraints(this.world);
    Composite.remove(this.world, [...toRemove, ...constraints]);
    this.bombs = [];
    this.projectiles = [];
    this.machines = [];
    this.vehicles = [];
    this.ropes = [];
    this.ropeAnchor = null;
    this.ropePoint = null;
    this.wires = [];
    this.grips = [];
    this.gripHand = null;
    this.pipes = [];
    this.pipeAnchor = null;
    this.particles.particles = [];
    this._mpQueueFullSync();
  }

  _resize() {
    // Cap DPR — 2x on a large canvas is a big GPU tax for a 2D sandbox
    const dpr = Math.min(window.devicePixelRatio || 1, 1.25);
    const rect = this.wrap.getBoundingClientRect();
    this.canvas.width = Math.floor(rect.width * dpr);
    this.canvas.height = Math.floor(rect.height * dpr);
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height}px`;
    this.viewW = rect.width;
    this.viewH = rect.height;
    this.dpr = dpr;
    this._ctx = this.canvas.getContext("2d", { alpha: false });
    // Center camera on arena floor mid
    if (this.camera.x === 0 && this.camera.y === 0) {
      this.camera.x = this.worldSize.w / 2 - rect.width / 2;
      this.camera.y = this.groundY - rect.height * 0.65;
    }
  }

  _spawnAt(item, x, y) {
    if (this.mp?.enabled && !this.mp.isHost) {
      this.mp.sendAction({ act: "spawn", item, x, y });
      return null;
    }
    let body = null;
    if (item.kind === "fruit") {
      const rag = createFruitRagdoll(this.world, x, y, item.id);
      if (rag?.parts) stampNetIds(rag.parts);
      body = rag?.torso || null;
    } else if (item.kind === "prop") {
      body = this._spawnProp(item.id, x, y);
    } else if (item.kind === "machine") {
      body = this._spawnMachine(item.id, x, y);
    } else if (item.kind === "weapon") {
      body = this._spawnWeapon(item.id, x, y);
    } else if (item.kind === "syringe") {
      body = this._spawnSyringe(item.id, x, y);
    } else if (item.kind === "element") {
      body = this._spawnElement(item.id, x, y);
    } else if (item.kind === "vehicle") {
      body = this._spawnVehicle(item.id, x, y);
    } else if (item.kind === "cloth") {
      body = this._spawnCloth(item.id, x, y);
    }
    if (body) ensureNetId(body);
    if (body?.plugin?.vehicleId) {
      stampNetIds(Composite.allBodies(this.world).filter((b) => b.plugin?.vehicleId === body.plugin.vehicleId));
    }
    this._mpQueueFullSync();
    return body;
  }

  _spawnCloth(id, x, y) {
    const colors = { hat: "#c05040", helmet: "#6a7080", vest: "#3a5a80", cloak: "#5a2060" };
    const sizes = {
      hat: [28, 14],
      helmet: [30, 20],
      vest: [32, 36],
      cloak: [36, 44],
    };
    const [bw, bh] = sizes[id] || [28, 20];
    const body = Bodies.rectangle(x, y, bw, bh, {
      friction: 0.35,
      restitution: 0.1,
      density: 0.002,
      label: `cloth-${id}`,
      render: { visible: false },
    });
    body.plugin = {
      draw: "cloth",
      clothing: id,
      color: colors[id] || "#888",
      flammable: id === "cloak" || id === "hat",
    };
    Composite.add(this.world, body);
    return body;
  }

  _spawnSyringe(id, x, y) {
    const def = SYRINGES[id];
    if (!def) return null;
    const body = Bodies.rectangle(x, y, 10, 36, {
      friction: 0.2,
      restitution: 0.05,
      density: 0.003,
      chamfer: { radius: 2 },
      label: `syringe-${id}`,
      render: { visible: false },
    });
    body.plugin = {
      draw: "syringe",
      syringe: id,
      color: def.color,
      fluid: def.fluid,
      used: false,
      pierce: true,
      tipAxis: 1, // needle toward local +Y
      tipLength: 20,
    };
    ensureSyringeVessel(body);
    Composite.add(this.world, body);
    return body;
  }

  _freezeAt(x, y) {
    const hits = this._bodiesAt(x, y, { includeFrozen: true, radius: 18 });
    for (const b of hits) {
      const next = !b.isStatic;
      Body.setStatic(b, next);
      if (!b.plugin) b.plugin = {};
      b.plugin.frozen = next;
      this.particles.burst(b.position.x, b.position.y, next ? "#8ec8ff" : "#ccc", 8, 3);
      break; // one body per click
    }
  }

  _ropeAt(x, y) {
    this._linkAt("rope", x, y);
  }

  _linkAt(typeId, x, y) {
    const hits = this._bodiesAt(x, y, { includeFrozen: true, radius: 18 });
    if (!hits.length) {
      this.ropeAnchor = null;
      this.ropePoint = null;
      return;
    }
    const body = hits[0];
    const point = { x, y };
    if (!this.ropeAnchor) {
      this.ropeAnchor = body;
      this.ropePoint = point;
      const col = LINK_TYPES[typeId]?.color || "#c4a574";
      this.particles.burst(body.position.x, body.position.y, col, 6, 2);
      this.hudTool.textContent = `Tool: ${LINK_TYPES[typeId]?.label || typeId} (pick 2nd)`;
      return;
    }
    if (this.ropeAnchor === body) {
      this.ropeAnchor = null;
      this.ropePoint = null;
      return;
    }
    const { primary, extras } = createLink(
      this.ropeAnchor,
      body,
      typeId,
      this.ropePoint,
      point
    );
    Composite.add(this.world, [primary, ...extras]);
    this.ropes.push(primary, ...extras);
    if (primary.plugin?.signal) {
      this.wires.push({ bodyA: this.ropeAnchor, bodyB: body, constraint: primary });
    }
    this.ropeAnchor = null;
    this.ropePoint = null;
    this.hudTool.textContent = `Tool: ${LINK_TYPES[typeId]?.label || typeId}`;
  }

  _pinAt(x, y) {
    const hits = this._bodiesAt(x, y, { includeFrozen: true, radius: 18 });
    if (!hits.length) return;
    const body = hits[0];
    if (body.label === "ground" || body.label === "platform") return;
    const pin = createWallPin(body, x, y);
    Composite.add(this.world, pin);
    this.ropes.push(pin);
    this.particles.burst(x, y, "#5a9fd4", 8, 2);
  }

  _gripAt(x, y) {
    const bodies = Composite.allBodies(this.world);
    const hits = this._bodiesAt(x, y, { includeFrozen: true, radius: 28 });

    // Click held item or occupied hand → drop that grip
    for (const h of hits) {
      if (h.plugin?.heldHand || (isGrabbable(h) && h.plugin?.heldBy)) {
        releaseGrip(this.world, h);
        this.grips = this.grips.filter((g) => Composite.allConstraints(this.world).includes(g));
        this.ropes = this.ropes.filter((r) => Composite.allConstraints(this.world).includes(r));
        this.gripHand = null;
        this.particles.burst(h.position.x, h.position.y, "#e0a060", 8, 2);
        this.hudTool.textContent = "Tool: Grip";
        return;
      }
      if (isHandPart(h) && h.plugin?.holding) {
        releaseGrip(this.world, h);
        this.grips = this.grips.filter((g) => Composite.allConstraints(this.world).includes(g));
        this.ropes = this.ropes.filter((r) => Composite.allConstraints(this.world).includes(r));
        this.gripHand = null;
        this.particles.burst(h.position.x, h.position.y, "#e0a060", 8, 2);
        this.hudTool.textContent = "Tool: Grip";
        return;
      }
    }

    // Resolve hand: selected, hit, or nearest free hand
    let hand = this.gripHand;
    if (hand && !Composite.allBodies(this.world).includes(hand)) {
      hand = null;
      this.gripHand = null;
    }
    if (!hand) {
      const hitHand =
        hits.find((b) => isPreferredHand(b)) || hits.find((b) => isHandPart(b));
      hand = hitHand || findNearestHand(bodies, x, y, 72, { freeOnly: true });
    }

    // Resolve item: hit or nearest grabbable
    let item =
      hits.find((b) => isGrabbable(b) && b !== hand) ||
      findNearestGrabbable(bodies, x, y, 70, hand);

    // One-shot: both nearby → grab immediately
    if (hand && item) {
      this._attachGrip(hand, item, x, y);
      return;
    }

    // Only hand → arm for second click (empty click while armed cancels)
    if (hand && !item) {
      if (this.gripHand && !hits.length) {
        this.gripHand = null;
        this.hudTool.textContent = "Tool: Grip";
        return;
      }
      this.gripHand = hand;
      this.particles.burst(hand.position.x, hand.position.y, "#e0a060", 6, 2);
      this.hudTool.textContent = "Tool: Grip (click item or near item)";
      return;
    }

    // Item but no hand — try auto-find a free hand near the item
    if (item && !hand) {
      hand = findNearestHand(bodies, item.position.x, item.position.y, 90, {
        freeOnly: true,
      });
      if (hand) {
        this._attachGrip(hand, item, x, y);
        return;
      }
      this.hudTool.textContent = "Tool: Grip (no free hand nearby)";
      this.gripHand = null;
      return;
    }

    // Empty click cancels selection
    this.gripHand = null;
    this.hudTool.textContent = "Tool: Grip";
  }

  _attachGrip(hand, item, x, y) {
    if (!hand || !item) return;
    // Free this hand / item if already linked
    if (hand.plugin?.holding) releaseGrip(this.world, hand);
    if (item.plugin?.heldHand) releaseGrip(this.world, item);

    const g = createGrip(hand, item, { x, y });
    if (!g) return;
    Composite.add(this.world, g);
    this.grips.push(g);
    this.ropes.push(g);
    this.particles.burst(item.position.x, item.position.y, "#e0a060", 10, 3);
    this.particles.burst(hand.position.x, hand.position.y, "#c08040", 5, 2);
    this.gripHand = null;
    this.hudTool.textContent = "Tool: Grip";
  }

  _sliceAt(x, y) {
    const hits = this._bodiesAt(x, y, { radius: 22 });
    for (const b of hits) {
      if (!b.plugin?.fruit) continue;
      if (b.plugin.part === "torso" || b.plugin.part === "head") {
        damagePart(b, 40, this.particles, { x, y });
        this.particles.burst(x, y, b.plugin.fruit.juice, 16, 6);
        continue;
      }
      if (detachLimb(this.world, b)) {
        this.particles.burst(b.position.x, b.position.y, b.plugin.fruit.juice, 18, 7);
        this._shake = Math.min(8, this._shake + 3);
      } else {
        damagePart(b, 50, this.particles, { x, y });
      }
    }
    // Slice visual
    this.particles.burst(x, y, "#e8e8e8", 8, 5);
  }

  /** Cut ropes, soft/weld/pin/signal/grip/pipe links, and conductive wire props. */
  _pliersAt(x, y) {
    const cutR = 22;
    const cons = Composite.allConstraints(this.world);
    const cuttable = new Set(["rope", "soft", "weld", "pin", "signal", "grip", "pipe"]);
    const toRemove = [];

    for (const c of cons) {
      const type = c.plugin?.draw || c.plugin?.linkType;
      if (!type || !cuttable.has(type)) continue;
      const { ax, ay, bx, by } = this._constraintEnds(c);
      if (ax == null) continue;
      if (distPointToSegment(x, y, ax, ay, bx, by) <= cutR) toRemove.push(c);
    }

    if (toRemove.length) {
      for (const c of toRemove) {
        if (c.plugin?.isGrip) releaseGrip(this.world, c.bodyA || c.bodyB);
      }
      Composite.remove(this.world, toRemove);
      this.ropes = this.ropes.filter((r) => !toRemove.includes(r));
      this.grips = this.grips.filter((g) => !toRemove.includes(g));
      this.wires = this.wires.filter((w) => !toRemove.includes(w.constraint));
      this.pipes = this.pipes.filter((p) => !toRemove.includes(p.constraint));
      this.particles.burst(x, y, "#90a0b0", 12, 4);
      this.hudTool.textContent = `Tool: Pliers (cut ${toRemove.length})`;
      return;
    }

    // Snap conductive wire props / coil stubs
    const hits = this._bodiesAt(x, y, { includeFrozen: true, radius: cutR });
    const wireBody = hits.find(
      (b) => b.plugin?.draw === "wire" || (b.plugin?.conductive && b.plugin?.draw === "coil" && b.label?.includes("wire"))
    );
    if (wireBody?.plugin?.draw === "wire") {
      Composite.remove(this.world, wireBody);
      this.particles.burst(x, y, "#c4a040", 10, 3);
      this.hudTool.textContent = "Tool: Pliers (cut wire)";
      return;
    }

    this.particles.burst(x, y, "#708090", 5, 2);
  }

  _constraintEnds(c) {
    if (!c?.bodyA) return { ax: null, ay: null, bx: null, by: null };
    const pa = c.pointA || { x: 0, y: 0 };
    const cos = Math.cos(c.bodyA.angle);
    const sin = Math.sin(c.bodyA.angle);
    const ax = c.bodyA.position.x + pa.x * cos - pa.y * sin;
    const ay = c.bodyA.position.y + pa.x * sin + pa.y * cos;
    if (c.plugin?.wallPin || !c.bodyB) {
      return { ax, ay, bx: c.pointB?.x ?? ax, by: c.pointB?.y ?? ay };
    }
    const pb = c.pointB || { x: 0, y: 0 };
    const cosB = Math.cos(c.bodyB.angle);
    const sinB = Math.sin(c.bodyB.angle);
    const bx = c.bodyB.position.x + pb.x * cosB - pb.y * sinB;
    const by = c.bodyB.position.y + pb.x * sinB + pb.y * cosB;
    return { ax, ay, bx, by };
  }

  _removeFruitParts(parts) {
    if (!parts?.length) return;
    const set = new Set(parts);
    const cons = Composite.allConstraints(this.world).filter(
      (c) => set.has(c.bodyA) || set.has(c.bodyB)
    );
    for (const c of cons) {
      if (c.plugin?.isGrip) releaseGrip(this.world, c.bodyA || c.bodyB);
    }
    Composite.remove(this.world, [...parts, ...cons]);
    this.ropes = this.ropes.filter((r) => !cons.includes(r));
    this.grips = this.grips.filter((g) => !cons.includes(g));
    this.wires = this.wires.filter((w) => !cons.includes(w.constraint));
    this.pipes = this.pipes.filter((p) => !cons.includes(p.constraint));
  }

  _finishPlatform(x0, y0, x1, y1) {
    const w = Math.abs(x1 - x0);
    const h = Math.max(12, Math.abs(y1 - y0));
    if (w < 24) return;
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const body = Bodies.rectangle(cx, cy, w, Math.min(h, 28), {
      isStatic: true,
      friction: 0.95,
      label: "platform",
      render: { visible: false },
      plugin: { userPlatform: true, platW: w, platH: Math.min(h, 28) },
    });
    Composite.add(this.world, body);
    this.platforms.push(body);
    this.userPlatforms.push(body);
    this.particles.burst(cx, cy, "#6a6e74", 6, 2);
    this._mpQueueFullSync();
  }

  _equipClothingNear(clothBody) {
    if (!clothBody?.plugin?.clothing) return;
    const bodies = Composite.allBodies(this.world);
    let best = null;
    let bestD = 80;
    for (const b of bodies) {
      if (!b.plugin?.fruit || b.plugin.part !== "torso") continue;
      const d = Math.hypot(b.position.x - clothBody.position.x, b.position.y - clothBody.position.y);
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    if (!best) return;
    const rid = best.plugin.ragdollId;
    const parts = bodies.filter((p) => p.plugin?.ragdollId === rid);
    if (equipClothing(parts, clothBody.plugin.clothing, clothBody.plugin.color)) {
      Composite.remove(this.world, clothBody);
      this.particles.burst(best.position.x, best.position.y, clothBody.plugin.color, 10, 3);
    }
  }

  /** Liquid transfer pipe: click source, then dest (livings + syringes). Flow is A → B. */
  _pipeAt(x, y) {
    const hits = this._bodiesAt(x, y, { includeFrozen: true, radius: 20 });
    const body = hits.find((b) => isLiquidTarget(b));
    if (!body) {
      this.pipeAnchor = null;
      this.hudTool.textContent = "Tool: Pipe (need living or syringe)";
      return;
    }
    ensureSyringeVessel(body);
    if (!this.pipeAnchor) {
      this.pipeAnchor = body;
      this.particles.burst(body.position.x, body.position.y, "#4a9aaa", 8, 2);
      this.hudTool.textContent = "Tool: Pipe (pick dest →)";
      return;
    }
    if (this.pipeAnchor === body) {
      this.pipeAnchor = null;
      this.hudTool.textContent = "Tool: Pipe";
      return;
    }
    const constraint = Constraint.create({
      bodyA: this.pipeAnchor,
      bodyB: body,
      stiffness: 0.08,
      damping: 0.08,
      length: Math.max(
        36,
        Vector.magnitude(Vector.sub(this.pipeAnchor.position, body.position))
      ),
      render: { visible: false },
    });
    constraint.plugin = { draw: "pipe" };
    Composite.add(this.world, constraint);
    this.pipes.push({
      bodyA: this.pipeAnchor,
      bodyB: body,
      constraint,
      rate: 22,
    });
    this.particles.burst(body.position.x, body.position.y, "#6ac8d0", 10, 3);
    this.pipeAnchor = null;
    this.hudTool.textContent = "Tool: Pipe";
  }

  _spawnProp(id, x, y) {
    let body;
    const base = { friction: 0.45, restitution: 0.12, render: { visible: false } };
    if (id === "box") {
      body = Bodies.rectangle(x, y, 48, 48, { ...base, label: "prop-box", density: 0.004 });
      body.plugin = { draw: "box", color: "#8a7355" };
    } else if (id === "crate") {
      body = Bodies.rectangle(x, y, 44, 44, { ...base, label: "prop-crate", density: 0.004 });
      body.plugin = { draw: "crate", color: "#a07848", flammable: true, sprite: "crate" };
    } else if (id === "plank") {
      body = Bodies.rectangle(x, y, 140, 14, { ...base, label: "prop-plank", density: 0.003 });
      body.plugin = { draw: "plank", color: "#6e5840" };
    } else if (id === "metal") {
      body = Bodies.rectangle(x, y, 160, 12, { ...base, label: "prop-metal", density: 0.012, friction: 0.3 });
      body.plugin = { draw: "metal", color: "#7a8088" };
    } else if (id === "weight") {
      body = Bodies.circle(x, y, 28, { ...base, label: "prop-weight", density: 0.04, friction: 0.8 });
      body.plugin = { draw: "weight", color: "#3a3e44" };
    } else if (id === "barrel") {
      body = Bodies.rectangle(x, y, 40, 52, {
        ...base,
        label: "prop-barrel",
        density: 0.005,
        chamfer: { radius: 4 },
      });
      body.plugin = {
        draw: "barrel",
        color: "#6a5a28",
        liquid: createContainerVessel({
          amount: 90,
          capacity: 120,
          color: "#b8e86a",
          type: "juice",
        }),
      };
    } else if (id === "tank") {
      body = Bodies.rectangle(x, y, 48, 64, {
        ...base,
        label: "prop-tank",
        density: 0.006,
        chamfer: { radius: 3 },
      });
      body.plugin = {
        draw: "tank",
        color: "#4a7a88",
        liquid: createContainerVessel({
          amount: 0,
          capacity: 160,
          color: "#c8c8c8",
          type: "empty",
        }),
      };
    } else if (id === "ball") {
      body = Bodies.circle(x, y, 22, { ...base, label: "prop-ball", density: 0.003, restitution: 0.55 });
      body.plugin = { draw: "ball", color: "#4a6a88" };
    } else if (id === "boulder") {
      body = Bodies.circle(x, y, 36, { ...base, label: "prop-rock", density: 0.014, friction: 0.75 });
      body.plugin = { draw: "rock", color: "#5a5a54" };
    } else if (id === "wall") {
      body = Bodies.rectangle(x, y, 22, 120, { ...base, label: "prop-wall", density: 0.01 });
      body.plugin = { draw: "wall", color: "#6a6e74" };
    } else if (id === "brick") {
      body = Bodies.rectangle(x, y, 36, 20, { ...base, label: "prop-brick", density: 0.008 });
      body.plugin = { draw: "brick", color: "#8a5040", flammable: false };
    } else if (id === "tire") {
      body = Bodies.circle(x, y, 26, { ...base, label: "prop-tire", density: 0.003, friction: 1.2, restitution: 0.4 });
      body.plugin = { draw: "tire", color: "#2a2a2a", flammable: true };
    } else if (id === "glass") {
      body = Bodies.rectangle(x, y, 70, 10, { ...base, label: "prop-glass", density: 0.002, restitution: 0.05 });
      body.plugin = { draw: "glass", color: "#a8d0e0", fragile: true };
    } else if (id === "anvil") {
      body = Bodies.rectangle(x, y, 50, 28, { ...base, label: "prop-anvil", density: 0.05, friction: 0.9 });
      body.plugin = { draw: "anvil", color: "#3a3e44", conductive: true };
    } else if (id === "cage") {
      body = Bodies.rectangle(x, y, 70, 70, { ...base, label: "prop-cage", density: 0.004 });
      body.plugin = { draw: "cage", color: "#6a7078", conductive: true };
    } else if (id === "balloon") {
      body = Bodies.circle(x, y, 18, { ...base, label: "prop-balloon", density: 0.00015, frictionAir: 0.02, restitution: 0.6 });
      body.plugin = { draw: "balloon", color: "#d06070", flammable: true, lift: 0.00035 };
      this.machines.push(body);
    } else if (id === "juiceShard") {
      body = createJuiceShard(x, y, "#b8e86a");
    }
    // Mark wood props flammable
    if (body && (id === "box" || id === "plank" || id === "barrel")) {
      body.plugin.flammable = true;
    }
    if (body && id === "metal") body.plugin.conductive = true;
    if (body) Composite.add(this.world, body);
    return body;
  }

  _spawnElement(id, x, y) {
    let body;
    const base = { friction: 0.4, restitution: 0.05, render: { visible: false } };
    if (id === "water") {
      body = Bodies.rectangle(x, y, 220, 90, {
        isStatic: true,
        isSensor: true,
        label: "zone-water",
        render: { visible: false },
      });
      body.plugin = { draw: "water", waterZone: true };
    } else if (id === "lava") {
      body = Bodies.rectangle(x, y, 180, 70, {
        isStatic: true,
        isSensor: true,
        label: "zone-lava",
        render: { visible: false },
      });
      body.plugin = { draw: "lava", lavaZone: true, alwaysHot: true };
    } else if (id === "torch") {
      body = Bodies.rectangle(x, y, 10, 36, { ...base, label: "el-torch", density: 0.003 });
      body.plugin = { draw: "torch", alwaysHot: true, flammable: true, burn: { t: 999, intensity: 1.1, spreadCd: 0 } };
      this.machines.push(body);
    } else if (id === "firebarrel") {
      body = Bodies.rectangle(x, y, 36, 44, { ...base, label: "el-firecan", density: 0.005 });
      body.plugin = {
        draw: "firebarrel",
        color: "#a04018",
        alwaysHot: true,
        flammable: true,
        explosiveFuel: true,
        burn: { t: 999, intensity: 1.2, spreadCd: 0 },
      };
      this.machines.push(body);
    } else if (id === "watercan") {
      body = Bodies.rectangle(x, y, 36, 44, { ...base, label: "el-watercan", density: 0.005 });
      body.plugin = {
        draw: "watercan",
        color: "#4a90b0",
        waterBomb: true,
        liquid: createContainerVessel({ amount: 100, capacity: 100, color: "#5ab0d0", type: "water" }),
      };
    } else if (id === "battery") {
      body = Bodies.rectangle(x, y, 22, 34, { ...base, label: "el-battery", density: 0.006 });
      body.plugin = { draw: "battery", battery: true, conductive: true, powered: true };
    } else if (id === "wire") {
      body = Bodies.rectangle(x, y, 80, 6, { ...base, label: "el-wire", density: 0.002 });
      body.plugin = { draw: "wire", conductive: true, color: "#c4a040" };
    } else if (id === "shockpad") {
      body = Bodies.rectangle(x, y, 70, 12, { ...base, label: "el-shockpad", density: 0.008 });
      body.plugin = { draw: "shockpad", shockpad: true, conductive: true };
      this.machines.push(body);
    }
    if (body) Composite.add(this.world, body);
    return body;
  }

  _spawnMachine(id, x, y) {
    let body;
    const base = { friction: 0.4, restitution: 0.1, render: { visible: false } };
    if (id === "thruster") {
      body = Bodies.rectangle(x, y, 28, 36, { ...base, label: "mach-thruster", density: 0.006 });
      body.plugin = { draw: "thruster", thrust: 0.018 };
      markActivatable(body);
      this.machines.push(body);
    } else if (id === "spinner") {
      body = Bodies.rectangle(x, y, 70, 12, { ...base, label: "mach-spinner", density: 0.008 });
      body.plugin = { draw: "spinner", spin: 0.22 };
      markActivatable(body);
      this.machines.push(body);
    } else if (id === "piston") {
      body = Bodies.rectangle(x, y, 24, 50, { ...base, label: "mach-piston", density: 0.01 });
      body.plugin = { draw: "piston", pistonT: 0, pistonForce: 0.04 };
      markActivatable(body);
      this.machines.push(body);
    } else if (id === "mine") {
      body = Bodies.circle(x, y, 14, { ...base, label: "mach-mine", density: 0.005 });
      body.plugin = { draw: "mine", armed: true, triggerSpeed: 4 };
      this.machines.push(body);
    } else if (id === "coil") {
      body = Bodies.rectangle(x, y, 28, 48, { ...base, label: "mach-coil", density: 0.007 });
      body.plugin = { draw: "coil", coil: true, conductive: true };
      markActivatable(body);
      this.machines.push(body);
    } else if (id === "sprinkler") {
      body = Bodies.rectangle(x, y, 28, 24, { ...base, label: "mach-sprinkler", density: 0.004 });
      body.plugin = { draw: "sprinkler", sprinkler: true };
      markActivatable(body);
      this.machines.push(body);
    } else if (id === "fan") {
      body = Bodies.rectangle(x, y, 50, 18, { ...base, label: "mach-fan", density: 0.005 });
      body.plugin = { draw: "fan", fan: 0.012 };
      markActivatable(body);
      this.machines.push(body);
    } else if (id === "heater") {
      body = Bodies.rectangle(x, y, 40, 28, { ...base, label: "mach-heater", density: 0.008 });
      body.plugin = { draw: "heater", heater: true };
      markActivatable(body);
      this.machines.push(body);
    } else if (id === "conveyor") {
      body = Bodies.rectangle(x, y, 140, 14, { ...base, label: "mach-conveyor", density: 0.01 });
      body.plugin = { draw: "conveyor", conveyor: 2.8 };
      markActivatable(body);
      this.machines.push(body);
    } else if (id === "sensor") {
      body = Bodies.circle(x, y, 16, { ...base, label: "mach-sensor", density: 0.004 });
      body.plugin = { draw: "sensor", sensorRange: 90, signalOnly: true, conductive: true };
      markActivatable(body);
      this.machines.push(body);
    } else if (id === "button") {
      body = Bodies.circle(x, y, 14, { ...base, label: "mach-button", density: 0.005 });
      body.plugin = { draw: "button", signalOnly: true };
      markActivatable(body);
      this.machines.push(body);
    } else if (id === "toggle") {
      body = Bodies.rectangle(x, y, 28, 20, { ...base, label: "mach-toggle", density: 0.005 });
      body.plugin = { draw: "toggle" };
      markActivatable(body);
      this.machines.push(body);
    } else if (id === "squeezer") {
      body = createSqueezer(x, y);
      markActivatable(body);
      this.machines.push(body);
    } else if (id === "boneMelter") {
      body = createBoneMelter(x, y);
      markActivatable(body);
      this.machines.push(body);
    } else if (BONE_MOLDS[id]) {
      body = createBoneMold(x, y, id);
      if (body) {
        markActivatable(body);
        this.machines.push(body);
      }
    } else if (id === "boneReconnector") {
      body = createBoneReconnector(x, y);
      markActivatable(body);
      this.machines.push(body);
    } else if (id === "crystallizer") {
      body = createCrystallizer(x, y);
      markActivatable(body);
      this.machines.push(body);
    } else if (id === "shardSmelter") {
      body = createShardSmelter(x, y);
      markActivatable(body);
      this.machines.push(body);
    }
    if (body) Composite.add(this.world, body);
    return body;
  }

  _spawnVehicle(id, x, y) {
    if (id === "bike") return this._spawnBike(x, y);
    if (id === "bus") return this._spawnBus(x, y);
    if (id !== "car") return null;
    const vid = `car-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const chassis = Bodies.rectangle(x, y, 90, 28, {
      friction: 0.4,
      density: 0.008,
      chamfer: { radius: 4 },
      label: "vehicle-car",
      render: { visible: false },
    });
    chassis.plugin = {
      draw: "car",
      vehicleId: vid,
      vehiclePart: "chassis",
      drive: 0.014,
    };
    markActivatable(chassis);

    const wheelOpts = {
      friction: 1.2,
      density: 0.004,
      restitution: 0.2,
      label: "vehicle-wheel",
      render: { visible: false },
    };
    const w1 = Bodies.circle(x - 28, y + 22, 14, wheelOpts);
    const w2 = Bodies.circle(x + 28, y + 22, 14, { ...wheelOpts });
    w1.plugin = { draw: "wheel", vehicleId: vid, vehiclePart: "wheel" };
    w2.plugin = { draw: "wheel", vehicleId: vid, vehiclePart: "wheel" };

    const ax1 = Constraint.create({
      bodyA: chassis,
      bodyB: w1,
      pointA: { x: -28, y: 22 },
      length: 0,
      stiffness: 0.9,
      damping: 0.1,
      render: { visible: false },
    });
    const ax2 = Constraint.create({
      bodyA: chassis,
      bodyB: w2,
      pointA: { x: 28, y: 22 },
      length: 0,
      stiffness: 0.9,
      damping: 0.1,
      render: { visible: false },
    });
    ax1.plugin = { vehicleId: vid };
    ax2.plugin = { vehicleId: vid };

    Composite.add(this.world, [chassis, w1, w2, ax1, ax2]);
    this.vehicles.push({ chassis, wheels: [w1, w2], id: vid });
    this.machines.push(chassis);
    return chassis;
  }

  _spawnBike(x, y) {
    const vid = `bike-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const chassis = Bodies.rectangle(x, y, 50, 12, {
      friction: 0.4,
      density: 0.004,
      label: "vehicle-bike",
      render: { visible: false },
    });
    chassis.plugin = { draw: "bike", vehicleId: vid, vehiclePart: "chassis", drive: 0.01 };
    markActivatable(chassis);
    const wheelOpts = {
      friction: 1.3,
      density: 0.003,
      restitution: 0.25,
      label: "vehicle-wheel",
      render: { visible: false },
    };
    const w1 = Bodies.circle(x - 18, y + 16, 12, wheelOpts);
    const w2 = Bodies.circle(x + 18, y + 16, 12, { ...wheelOpts });
    w1.plugin = { draw: "wheel", vehicleId: vid, vehiclePart: "wheel" };
    w2.plugin = { draw: "wheel", vehicleId: vid, vehiclePart: "wheel" };
    const ax1 = Constraint.create({
      bodyA: chassis,
      bodyB: w1,
      pointA: { x: -18, y: 16 },
      length: 0,
      stiffness: 0.9,
      damping: 0.1,
      render: { visible: false },
    });
    const ax2 = Constraint.create({
      bodyA: chassis,
      bodyB: w2,
      pointA: { x: 18, y: 16 },
      length: 0,
      stiffness: 0.9,
      damping: 0.1,
      render: { visible: false },
    });
    ax1.plugin = { vehicleId: vid };
    ax2.plugin = { vehicleId: vid };
    Composite.add(this.world, [chassis, w1, w2, ax1, ax2]);
    this.vehicles.push({ chassis, wheels: [w1, w2], id: vid });
    this.machines.push(chassis);
    return chassis;
  }

  _spawnBus(x, y) {
    const vid = `bus-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const chassis = Bodies.rectangle(x, y, 160, 40, {
      friction: 0.5,
      density: 0.012,
      chamfer: { radius: 4 },
      label: "vehicle-bus",
      render: { visible: false },
    });
    chassis.plugin = { draw: "bus", vehicleId: vid, vehiclePart: "chassis", drive: 0.02 };
    markActivatable(chassis);
    const wheelOpts = {
      friction: 1.2,
      density: 0.005,
      restitution: 0.15,
      label: "vehicle-wheel",
      render: { visible: false },
    };
    const w1 = Bodies.circle(x - 50, y + 28, 16, wheelOpts);
    const w2 = Bodies.circle(x + 50, y + 28, 16, { ...wheelOpts });
    w1.plugin = { draw: "wheel", vehicleId: vid, vehiclePart: "wheel" };
    w2.plugin = { draw: "wheel", vehicleId: vid, vehiclePart: "wheel" };
    const ax1 = Constraint.create({
      bodyA: chassis,
      bodyB: w1,
      pointA: { x: -50, y: 28 },
      length: 0,
      stiffness: 0.9,
      damping: 0.12,
      render: { visible: false },
    });
    const ax2 = Constraint.create({
      bodyA: chassis,
      bodyB: w2,
      pointA: { x: 50, y: 28 },
      length: 0,
      stiffness: 0.9,
      damping: 0.12,
      render: { visible: false },
    });
    ax1.plugin = { vehicleId: vid };
    ax2.plugin = { vehicleId: vid };
    Composite.add(this.world, [chassis, w1, w2, ax1, ax2]);
    this.vehicles.push({ chassis, wheels: [w1, w2], id: vid });
    this.machines.push(chassis);
    return chassis;
  }

  _spawnWeapon(id, x, y) {
    let body;
    const base = { friction: 0.3, restitution: 0.1, render: { visible: false } };
    if (id === "pistol") {
      body = Bodies.rectangle(x, y, 12, 28, { ...base, label: "weapon-pistol", density: 0.004 });
      body.plugin = {
        draw: "pistol",
        firearm: true,
        damage: 22,
        fireRate: 0.28,
        fireCd: 0,
        muzzle: 18,
        bulletSpeed: 26,
      };
      markActivatable(body);
      this.machines.push(body);
    } else if (id === "rifle") {
      body = Bodies.rectangle(x, y, 14, 52, { ...base, label: "weapon-rifle", density: 0.005 });
      body.plugin = {
        draw: "rifle",
        firearm: true,
        damage: 30,
        fireRate: 0.14,
        fireCd: 0,
        muzzle: 28,
        bulletSpeed: 32,
      };
      markActivatable(body);
      this.machines.push(body);
    } else if (id === "sword") {
      body = Bodies.rectangle(x, y, 12, 70, { ...base, label: "weapon-sword", density: 0.006 });
      body.plugin = { draw: "sword", sharp: true, pierce: true, tipAxis: -1, tipLength: 34, damage: 18, bleed: 5 };
    } else if (id === "hammer") {
      const handle = Bodies.rectangle(x, y + 20, 10, 50, { ...base, density: 0.004 });
      const head = Bodies.rectangle(x, y - 10, 36, 18, { ...base, density: 0.01 });
      body = Body.create({
        parts: [handle, head],
        render: { visible: false },
      });
      body.label = "weapon-hammer";
      body.plugin = { draw: "hammer", damage: 28, blunt: true };
    } else if (id === "bomb") {
      body = Bodies.circle(x, y, 16, { ...base, label: "weapon-bomb", density: 0.004 });
      body.plugin = { draw: "bomb", fuse: null, fuseMax: 2.2, armed: false };
      markActivatable(body);
      this.bombs.push(body);
    } else if (id === "rocket") {
      body = Bodies.rectangle(x, y, 18, 40, { ...base, label: "weapon-rocket", density: 0.003 });
      body.plugin = { draw: "rocket", thrust: true, life: 8 };
      markActivatable(body);
      this.projectiles.push(body);
    } else if (id === "spike") {
      body = Bodies.rectangle(x, y, 20, 40, { ...base, label: "weapon-spike", density: 0.008, isStatic: false });
      body.plugin = { draw: "spike", sharp: true, pierce: true, tipAxis: -1, tipLength: 20, damage: 22, bleed: 6 };
    } else if (id === "saw") {
      body = Bodies.circle(x, y, 26, { ...base, label: "weapon-saw", density: 0.01, friction: 0.05 });
      body.plugin = { draw: "saw", sharp: true, damage: 30, spin: 0.35, bleed: 4 };
      markActivatable(body);
      this.machines.push(body);
    } else if (id === "axe") {
      body = Bodies.rectangle(x, y, 16, 56, { ...base, label: "weapon-axe", density: 0.007 });
      body.plugin = { draw: "axe", sharp: true, pierce: true, tipAxis: -1, tipLength: 26, damage: 24, bleed: 5 };
    } else if (id === "baton") {
      body = Bodies.rectangle(x, y, 10, 56, { ...base, label: "weapon-baton", density: 0.004 });
      body.plugin = { draw: "baton", shockOnHit: true, damage: 8, conductive: true };
    } else if (id === "flamethrower") {
      body = Bodies.rectangle(x, y, 18, 50, { ...base, label: "weapon-flamer", density: 0.005 });
      body.plugin = { draw: "flamethrower", flamethrower: true };
      markActivatable(body);
      this.machines.push(body);
    } else if (id === "firebomb") {
      body = Bodies.circle(x, y, 14, { ...base, label: "weapon-firebomb", density: 0.0035 });
      body.plugin = { draw: "firebomb", fuse: null, fuseMax: 1.8, armed: false, fireBurst: true };
      markActivatable(body);
      this.bombs.push(body);
    } else if (id === "shotgun") {
      body = Bodies.rectangle(x, y, 14, 48, { ...base, label: "weapon-shotgun", density: 0.005 });
      body.plugin = {
        draw: "shotgun",
        shotgun: true,
        firearm: true,
        damage: 14,
        fireRate: 0.7,
        fireCd: 0,
        muzzle: 24,
        bulletSpeed: 22,
        pellets: 5,
      };
      markActivatable(body);
      this.machines.push(body);
    } else if (id === "minigun") {
      body = Bodies.rectangle(x, y, 16, 56, { ...base, label: "weapon-minigun", density: 0.008 });
      body.plugin = {
        draw: "minigun",
        firearm: true,
        damage: 12,
        fireRate: 0.06,
        fireCd: 0,
        muzzle: 30,
        bulletSpeed: 30,
      };
      markActivatable(body);
      this.machines.push(body);
    } else if (id === "crossbow") {
      body = Bodies.rectangle(x, y, 14, 48, { ...base, label: "weapon-crossbow", density: 0.005 });
      body.plugin = {
        draw: "crossbow",
        firearm: true,
        damage: 40,
        fireRate: 1.1,
        fireCd: 0,
        muzzle: 26,
        bulletSpeed: 34,
      };
      markActivatable(body);
      this.machines.push(body);
    } else if (id === "grenade") {
      body = Bodies.circle(x, y, 12, { ...base, label: "weapon-grenade", density: 0.0035 });
      body.plugin = { draw: "grenade", fuse: null, fuseMax: 2.5, armed: false };
      markActivatable(body);
      this.bombs.push(body);
    } else if (id === "boneSword") {
      body = Bodies.rectangle(x, y, 11, 68, { ...base, label: "weapon-boneSword", density: 0.005 });
      body.plugin = {
        draw: "boneSword",
        sharp: true,
        pierce: true,
        tipAxis: -1,
        tipLength: 32,
        damage: 20,
        bleed: 6,
        boneWeapon: true,
      };
    } else if (id === "boneSpike") {
      body = Bodies.rectangle(x, y, 14, 44, { ...base, label: "weapon-boneSpike", density: 0.007 });
      body.plugin = {
        draw: "boneSpike",
        sharp: true,
        pierce: true,
        tipAxis: -1,
        tipLength: 22,
        damage: 24,
        bleed: 7,
        boneWeapon: true,
      };
    } else if (id === "boneAxe") {
      body = Bodies.rectangle(x, y, 16, 52, { ...base, label: "weapon-boneAxe", density: 0.0065 });
      body.plugin = {
        draw: "boneAxe",
        sharp: true,
        pierce: true,
        tipAxis: -1,
        tipLength: 24,
        damage: 26,
        bleed: 6,
        boneWeapon: true,
      };
    } else if (id === "boneClub") {
      body = Bodies.rectangle(x, y, 14, 54, { ...base, label: "weapon-boneClub", density: 0.008 });
      body.plugin = { draw: "boneClub", blunt: true, damage: 32, boneWeapon: true };
    }
    if (body) Composite.add(this.world, body);
    return body;
  }

  _poke(x, y) {
    const hits = this._bodiesAt(x, y, { radius: 20 });
    for (const b of hits) {
      if (b.plugin?.fruit) {
        const result = damagePart(b, 28, this.particles, { x, y });
        if (result === "damaged" || result === "burst") {
          detachLimb(this.world, b);
        }
        Body.applyForce(b, b.position, { x: (Math.random() - 0.5) * 0.08, y: -0.06 });
      } else {
        Body.applyForce(b, b.position, { x: (Math.random() - 0.5) * 0.12, y: -0.08 });
      }
    }
    this.particles.burst(x, y, "#9aa0a8", 6, 3);
  }

  _shoot(x, y) {
    // Fire from camera left toward aim point
    const origin = {
      x: this.camera.x + 50,
      y: this.camera.y + this.viewH * 0.4,
    };
    const dir = Vector.normalise(Vector.sub({ x, y }, origin));
    const bullet = Bodies.circle(origin.x, origin.y, 4, {
      frictionAir: 0.001,
      density: 0.05,
      restitution: 0.1,
      label: "bullet",
      render: { visible: false },
    });
    bullet.plugin = { draw: "bullet", damage: 35, life: 2.5, _prevPos: { x: origin.x, y: origin.y } };
    Body.setVelocity(bullet, { x: dir.x * 24, y: dir.y * 24 });
    Composite.add(this.world, bullet);
    this.projectiles.push(bullet);
    this.particles.burst(origin.x, origin.y, "#f0e080", 5, 4);
  }

  _explode(x, y, power = 0.1) {
    this._shake = Math.min(12, this._shake + 8);
    this.particles.burst(x, y, "#ffd080", 30, 10);
    this.particles.burst(x, y, "#ff8040", 20, 7);
    const bodies = Composite.allBodies(this.world);
    for (const b of bodies) {
      if (b.isStatic) continue;
      const dx = b.position.x - x;
      const dy = b.position.y - y;
      const dist = Math.max(20, Math.hypot(dx, dy));
      if (dist > 280) continue;
      const force = (power * 180) / dist;
      Body.applyForce(b, b.position, {
        x: (dx / dist) * force,
        y: (dy / dist) * force - 0.02,
      });
      if (b.plugin?.fruit) {
        const dmg = 40 * (1 - dist / 280);
        damagePart(b, dmg, this.particles, b.position);
      }
    }
  }

  _deleteAt(x, y) {
    const hits = this._bodiesAt(x, y, { includeFrozen: true, radius: 18 });
    for (const b of hits) {
      if (b.plugin?.fruit) {
        // Remove whole ragdoll by shared id
        const rid = b.plugin.ragdollId;
        const all = Composite.allBodies(this.world).filter((p) => p.plugin?.ragdollId === rid);
        const cons = Composite.allConstraints(this.world).filter(
          (c) => all.includes(c.bodyA) || all.includes(c.bodyB)
        );
        Composite.remove(this.world, [...all, ...cons]);
        this.particles.burst(x, y, b.plugin.fruit.juice, 12, 5);
      } else if (b.plugin?.vehicleId) {
        const vid = b.plugin.vehicleId;
        const all = Composite.allBodies(this.world).filter((p) => p.plugin?.vehicleId === vid);
        const cons = Composite.allConstraints(this.world).filter(
          (c) => all.includes(c.bodyA) || all.includes(c.bodyB) || c.plugin?.vehicleId === vid
        );
        Composite.remove(this.world, [...all, ...cons]);
        this.vehicles = this.vehicles.filter((v) => v.id !== vid);
        this.machines = this.machines.filter((m) => m.plugin?.vehicleId !== vid);
        this.particles.burst(x, y, "#c05040", 10, 4);
      } else {
        Composite.remove(this.world, b);
        this.particles.burst(x, y, "#aaa", 8, 4);
      }
    }
  }

  _onCollisions(event) {
    for (const pair of event.pairs) {
      const { bodyA, bodyB } = pair;
      const speed = Math.hypot(
        bodyA.velocity.x - bodyB.velocity.x,
        bodyA.velocity.y - bodyB.velocity.y
      );

      const fruitA = bodyA.plugin?.fruit ? bodyA : null;
      const fruitB = bodyB.plugin?.fruit ? bodyB : null;
      // Impact damage — both fruits in a living–living hit; moderate falls barely hurt
      if (fruitA && speed > 9.5) {
        const dmg = Math.min(42, (speed - 9) * 2.4);
        const result = damagePart(fruitA, dmg, this.particles, pair.collision.supports[0]);
        if (result === "burst") this._shake = Math.min(10, this._shake + 4);
        if (speed > 16 && fruitA.plugin.part !== "torso" && fruitA.plugin.part !== "head") {
          if (detachLimb(this.world, fruitA)) {
            this.particles.burst(fruitA.position.x, fruitA.position.y, fruitA.plugin.fruit.juice, 14, 6);
          }
        }
      }
      if (fruitB && speed > 9.5) {
        const dmg = Math.min(42, (speed - 9) * 2.4);
        const result = damagePart(fruitB, dmg, this.particles, pair.collision.supports[0]);
        if (result === "burst") this._shake = Math.min(10, this._shake + 4);
        if (speed > 16 && fruitB.plugin.part !== "torso" && fruitB.plugin.part !== "head") {
          if (detachLimb(this.world, fruitB)) {
            this.particles.burst(fruitB.position.x, fruitB.position.y, fruitB.plugin.fruit.juice, 14, 6);
          }
        }
      }

      const fruit = fruitA || fruitB;

      // Sharp / pierce weapons — tip-first stab bleeds juice (barely any force needed)
      const weapon = [bodyA, bodyB].find(
        (b) => b.plugin && (b.plugin.sharp || b.plugin.pierce) && b.plugin.draw !== "syringe"
      );
      const target = weapon === bodyA ? bodyB : bodyA;
      if (weapon && target.plugin?.fruit && speed > 0.15) {
        const now = performance.now();
        const cdOk = !weapon.plugin.hitCd || now > weapon.plugin.hitCd;
        const needsPierce = !!weapon.plugin.pierce;
        const pierce = needsPierce
          ? checkPierce(weapon, target, { minSpeed: 0.05, minAim: 0.2 })
          : { pierced: speed > 1.2, tip: pair.collision.supports[0] };

        if (cdOk && (!needsPierce || pierce.pierced)) {
          weapon.plugin.hitCd = now + 180;
          const at = pierce.tip || pair.collision.supports[0] || target.position;
          const dmg = (weapon.plugin.damage || 15) * (pierce.pierced ? 1 : 0.55);
          damagePart(target, dmg, this.particles, at);
          // Juice bleed poke + short wound drip
          const vessel = target.plugin.liquid;
          const bleedAmt = weapon.plugin.bleed || (weapon.plugin.sharp ? 4 : 2);
          if (vessel) {
            loseJuice(vessel, bleedAmt * (pierce.pierced ? 1 : 0.4), this.particles, at);
            applyJuiceConsciousness(
              Composite.allBodies(this.world).filter((p) => p.plugin?.ragdollId === target.plugin.ragdollId)
            );
          }
          startBleed(target, { duration: pierce.pierced ? 2.8 : 1.2, rate: pierce.pierced ? 4.5 : 2 });
          if (pierce.pierced && (weapon.plugin.sharp || speed > 10) && target.plugin.part !== "torso") {
            if (speed > 8) detachLimb(this.world, target);
          }
        }
      }

      // Blunt weapons (hammer, baton, etc.) — impact damage, light bruise juice
      const blunt = [bodyA, bodyB].find(
        (b) =>
          b.plugin?.damage &&
          !b.plugin.sharp &&
          !b.plugin.pierce &&
          !b.plugin.firearm &&
          b.plugin.draw !== "syringe" &&
          b.label !== "bullet"
      );
      const bluntTarget = blunt === bodyA ? bodyB : bodyA;
      if (blunt && bluntTarget.plugin?.fruit && speed > 4) {
        const now = performance.now();
        if (!blunt.plugin.hitCd || now > blunt.plugin.hitCd) {
          blunt.plugin.hitCd = now + 200;
          damagePart(bluntTarget, blunt.plugin.damage || 12, this.particles, pair.collision.supports[0]);
          if (bluntTarget.plugin.liquid && speed > 7) {
            loseJuice(bluntTarget.plugin.liquid, 2, this.particles, bluntTarget.position);
          }
        }
      }

      if ((bodyA.label === "bullet" || bodyB.label === "bullet") && fruit) {
        const bullet = bodyA.label === "bullet" ? bodyA : bodyB;
        damagePart(fruit, bullet.plugin?.damage || 30, this.particles, fruit.position);
        if (fruit.plugin.liquid) {
          loseJuice(fruit.plugin.liquid, 8, this.particles, fruit.position);
        }
        startBleed(fruit, { duration: 1.6, rate: 3 });
        if (fruit.plugin.part !== "torso") detachLimb(this.world, fruit);
        Composite.remove(this.world, bullet);
        this.projectiles = this.projectiles.filter((p) => p !== bullet);
      }

      // Syringe: needle-first pierce with almost no force; bleed is a tiny poke
      const syringe = [bodyA, bodyB].find((b) => b.plugin?.draw === "syringe");
      const patient = syringe === bodyA ? bodyB : bodyA;
      if (syringe && patient.plugin?.fruit) {
        const pierce = checkPierce(syringe, patient, { minSpeed: 0.02, minAim: 0.18 });
        // Cooldown so one stab doesn't multi-fire
        const now = performance.now();
        const cdOk = !syringe.plugin.pierceCd || now > syringe.plugin.pierceCd;
        if (pierce.pierced && cdOk) {
          syringe.plugin.pierceCd = now + 350;
          ensureSyringeVessel(syringe);
          const v = syringe.plugin.liquid;
          const at = pierce.tip || patient.position;

          // Tiny juice poke — bleed stops almost immediately
          if (patient.plugin.liquid) {
            loseJuice(patient.plugin.liquid, 0.8, this.particles, at);
            applyJuiceConsciousness(
              Composite.allBodies(this.world).filter((p) => p.plugin?.ragdollId === patient.plugin.ragdollId)
            );
          }
          startBleed(patient, { duration: 0.28, rate: 1.6 });

          const hasFluid = v && v.amount > 1;
          if (hasFluid && v.type === "juice") {
            // Inject all juice into living
            const dest = getOrCreateVessel(patient) || patient.plugin.liquid;
            if (dest) {
              const moved = transferLiquid(v, dest, v.amount, this.particles, syringe.position, patient.position, {
                force: true,
              });
              if (moved > 0) {
                syncSyringeFromVessel(syringe);
                this.particles.burst(patient.position.x, patient.position.y, dest.color, 12, 4);
              }
            }
          } else if (hasFluid && !syringe.plugin.used && v.type === syringe.plugin.syringe) {
            // Inject entire serum dose
            if (injectSyringe(this.world, patient, syringe.plugin.syringe, this.particles, syringe)) {
              if (syringe.plugin.syringe === "juiceDrain") {
                // Dose converts to stolen juice still in the syringe
                syringe.plugin.used = false;
                syncSyringeFromVessel(syringe);
              } else {
                syringe.plugin.used = true;
                drainSyringeVessel(syringe);
                syncSyringeFromVessel(syringe);
              }
              this.particles.burst(patient.position.x, patient.position.y, syringe.plugin.fluid || "#fff", 10, 3);
              Body.setVelocity(syringe, {
                x: (syringe.position.x - patient.position.x) * 0.12,
                y: -1.5,
              });
            }
          } else if (isSyringeEmpty(syringe)) {
            // Draw juice to full capacity instantly
            syringe.plugin.extracting = true;
            syringe.plugin.extractRid = patient.plugin.ragdollId;
            syringe.plugin.piercedLiving = patient.plugin.ragdollId;
            this.particles.drip(patient.position.x, patient.position.y, patient.plugin.fruit?.juice || "#b8e86a", 3);
          }
        }
      }

      // Pressure mines
      for (const m of [bodyA, bodyB]) {
        if (m.plugin?.draw === "mine" && m.plugin.armed) {
          const other = m === bodyA ? bodyB : bodyA;
          if (other.isStatic) continue;
          const spd = Math.hypot(other.velocity.x, other.velocity.y);
          if (spd > (m.plugin.triggerSpeed || 3) || other.plugin?.fruit) {
            m.plugin.armed = false;
            const { x, y } = m.position;
            Composite.remove(this.world, m);
            this.machines = this.machines.filter((x) => x !== m);
            this._explode(x, y, 0.13);
          }
        }
      }

      // Fire / electricity / water contact
      const el = onElementCollision(bodyA, bodyB, this.particles, speed);
      if (el?.remove) {
        Composite.remove(this.world, el.remove);
      }

      onWiringCollision(bodyA, bodyB);

      // Auto-equip clothing on contact with living torso/head
      for (const [cloth, living] of [
        [bodyA, bodyB],
        [bodyB, bodyA],
      ]) {
        if (!cloth.plugin?.clothing || !living.plugin?.fruit) continue;
        if (living.plugin.part !== "torso" && living.plugin.part !== "head") continue;
        const rid = living.plugin.ragdollId;
        const parts = Composite.allBodies(this.world).filter((p) => p.plugin?.ragdollId === rid);
        if (equipClothing(parts, cloth.plugin.clothing, cloth.plugin.color)) {
          Composite.remove(this.world, cloth);
          this.particles.burst(living.position.x, living.position.y, cloth.plugin.color, 8, 3);
        }
      }

      // Shotgun: blast pellets on hard hit (one-shot prop)
      for (const g of [bodyA, bodyB]) {
        if (g.plugin?.shotgun && !g.plugin.shotFired && speed > 8) {
          g.plugin.shotFired = true;
          const a = g.angle - Math.PI / 2;
          for (let i = 0; i < 5; i++) {
            const spread = (i - 2) * 0.12;
            const bullet = Bodies.circle(g.position.x, g.position.y, 3, {
              frictionAir: 0.01,
              density: 0.03,
              label: "bullet",
              render: { visible: false },
            });
            bullet.plugin = {
              draw: "bullet",
              damage: 18,
              life: 0.8,
              _prevPos: { x: g.position.x, y: g.position.y },
            };
            Body.setVelocity(bullet, {
              x: Math.cos(a + spread) * 22,
              y: Math.sin(a + spread) * 22,
            });
            Composite.add(this.world, bullet);
            this.projectiles.push(bullet);
          }
          this.particles.burst(g.position.x, g.position.y, "#f0e080", 8, 5);
        }
      }
    }
  }

  _fireFromGun(gun) {
    const pl = gun.plugin;
    const a = gun.angle - Math.PI / 2;
    const muzzle = pl.muzzle || 20;
    const ox = gun.position.x + Math.cos(a) * muzzle;
    const oy = gun.position.y + Math.sin(a) * muzzle;
    const speed = pl.bulletSpeed || 26;
    const pellets = pl.pellets || 1;
    for (let i = 0; i < pellets; i++) {
      const spread = pellets > 1 ? (i - (pellets - 1) / 2) * 0.1 : 0;
      const bullet = Bodies.circle(ox, oy, pellets > 1 ? 3 : 4, {
        frictionAir: 0.002,
        density: 0.04,
        restitution: 0.05,
        label: "bullet",
        render: { visible: false },
      });
      bullet.plugin = {
        draw: "bullet",
        damage: pl.damage || 20,
        life: 1.8,
        _prevPos: { x: ox, y: oy },
      };
      Body.setVelocity(bullet, {
        x: Math.cos(a + spread) * Math.min(speed, 26),
        y: Math.sin(a + spread) * Math.min(speed, 26),
      });
      Composite.add(this.world, bullet);
      this.projectiles.push(bullet);
    }
    this.particles.burst(ox, oy, "#f0e080", 5, 4);
    Body.applyForce(gun, gun.position, {
      x: -Math.cos(a) * 0.015,
      y: -Math.sin(a) * 0.015,
    });
  }

  _tickGameplay(dt) {
    const bodies = Composite.allBodies(this.world);
    tickFruitPlugins(bodies, dt);
    tickLivingAI(this.world, bodies, dt, this.particles, this.worldSize);
    tickSyringeEffects(this.world, bodies, dt, this.particles, this.groundY);
    tickLiquids(this.world, dt, this.particles);
    tickNaturalRegen(bodies, dt, this.particles);
    tickBleed(this.world, bodies, dt, this.particles);
    tickSyringeExtraction(this.world, bodies, dt, this.particles);
    tickPipes(this.pipes, this.world, dt, this.particles);
    tickElements(this.world, dt, this.particles, (x, y, p) => this._explode(x, y, p));
    tickSensors(bodies, dt, this.particles);
    tickSignalWires(this.wires, dt);

    // Sync clothing draw flags on livings
    const ragIds = new Set();
    for (const b of bodies) {
      if (b.plugin?.ragdollId && b.plugin.part === "torso") ragIds.add(b.plugin.ragdollId);
    }
    for (const rid of ragIds) {
      const parts = bodies.filter((p) => p.plugin?.ragdollId === rid);
      syncClothing(parts);
    }

    // Bombs — fuse only after Activate
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const b = this.bombs[i];
      if (!b.plugin) {
        this.bombs.splice(i, 1);
        continue;
      }
      if (!Composite.allBodies(this.world).includes(b)) {
        this.bombs.splice(i, 1);
        continue;
      }
      if (b.plugin.fuse == null || !b.plugin.armed) continue;
      b.plugin.fuse -= dt;
      if (b.plugin.fuse <= 0) {
        const { x, y } = b.position;
        const fireBurst = !!b.plugin.fireBurst;
        Composite.remove(this.world, b);
        this.bombs.splice(i, 1);
        this._explode(x, y, fireBurst ? 0.1 : 0.14);
        if (fireBurst) {
          for (const other of Composite.allBodies(this.world)) {
            if (other.isStatic) continue;
            const dist = Math.hypot(other.position.x - x, other.position.y - y);
            if (dist < 160) ignite(other, 1.3, 7);
          }
        }
      }
    }

    // Rockets & bullets lifetime (+ soft CCD ray for fast bullets)
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      if (!Composite.allBodies(this.world).includes(p)) {
        this.projectiles.splice(i, 1);
        continue;
      }
      if (p.label === "bullet" && p.plugin) {
        const prev = p.plugin._prevPos || { x: p.position.x, y: p.position.y };
        const moved = Math.hypot(p.position.x - prev.x, p.position.y - prev.y);
        if (moved > 6) {
          const hits = Query.ray(Composite.allBodies(this.world), prev, p.position, 4).filter(
            (h) => h.body !== p && h.body?.plugin?.fruit && h.body.plugin.state !== "gone"
          );
          if (hits.length) {
            hits.sort(
              (a, b) =>
                Math.hypot(a.body.position.x - prev.x, a.body.position.y - prev.y) -
                Math.hypot(b.body.position.x - prev.x, b.body.position.y - prev.y)
            );
            const fruit = hits[0].body;
            damagePart(fruit, p.plugin.damage || 30, this.particles, fruit.position);
            if (fruit.plugin.liquid) {
              loseJuice(fruit.plugin.liquid, 8, this.particles, fruit.position);
            }
            startBleed(fruit, { duration: 1.6, rate: 3 });
            if (fruit.plugin.part !== "torso") detachLimb(this.world, fruit);
            Composite.remove(this.world, p);
            this.projectiles.splice(i, 1);
            continue;
          }
        }
        p.plugin._prevPos = { x: p.position.x, y: p.position.y };
      }
      if (p.plugin?.thrust && (p.plugin.active || !p.plugin.activatable)) {
        const a = p.angle - Math.PI / 2;
        Body.applyForce(p, p.position, { x: Math.cos(a) * 0.012, y: Math.sin(a) * 0.012 });
        this.particles.drip(p.position.x, p.position.y, "#ffaa60", 2);
        if (p.plugin.life != null) p.plugin.life -= dt;
      } else if (p.plugin?.life != null && !p.plugin.thrust) {
        p.plugin.life -= dt;
      }
      if (p.plugin?.life != null && p.plugin.life <= 0) {
        if (p.plugin.thrust && p.plugin.active) this._explode(p.position.x, p.position.y, 0.1);
        else if (!p.plugin.thrust) {
          Composite.remove(this.world, p);
          this.projectiles.splice(i, 1);
        } else if (p.plugin.thrust && p.plugin.active) {
          Composite.remove(this.world, p);
          this.projectiles.splice(i, 1);
        }
      }
    }

    // Machines / firearms / vehicles — only when Active
    for (let i = this.machines.length - 1; i >= 0; i--) {
      const m = this.machines[i];
      if (!Composite.allBodies(this.world).includes(m) || !m.plugin) {
        this.machines.splice(i, 1);
        continue;
      }
      // Frozen (static) machines still process fans/conveyors/squeezers — only skip self-motion
      const pinned = !!m.isStatic;
      const on = !m.plugin.activatable || m.plugin.active;

      if (m.plugin.firearm && on) {
        m.plugin.fireCd = (m.plugin.fireCd || 0) - dt;
        if (m.plugin.fireCd <= 0) {
          this._fireFromGun(m);
          m.plugin.fireCd = m.plugin.fireRate || 0.25;
        }
      }

      if (!pinned && (m.plugin.draw === "car" || m.plugin.draw === "bike" || m.plugin.draw === "bus") && on) {
        const a = m.angle;
        Body.applyForce(m, m.position, {
          x: Math.cos(a) * (m.plugin.drive || 0.014),
          y: Math.sin(a) * (m.plugin.drive || 0.014),
        });
      }

      if (!pinned && m.plugin.thrust && on && m.plugin.draw === "thruster") {
        const a = m.angle - Math.PI / 2;
        Body.applyForce(m, m.position, {
          x: Math.cos(a) * m.plugin.thrust,
          y: Math.sin(a) * m.plugin.thrust,
        });
        this.particles.drip(
          m.position.x - Math.cos(a) * 16,
          m.position.y - Math.sin(a) * 16,
          "#ff8040",
          2
        );
      }
      if (!pinned && m.plugin.spin && on) {
        Body.setAngularVelocity(m, m.plugin.spin);
      }
      if (!pinned && m.plugin.pistonForce != null && on) {
        m.plugin.pistonT = (m.plugin.pistonT || 0) + dt;
        const pulse = Math.sin(m.plugin.pistonT * 6);
        Body.applyForce(m, m.position, { x: 0, y: pulse * m.plugin.pistonForce });
      }
      if (!pinned && m.plugin.lift) {
        Body.applyForce(m, m.position, { x: 0, y: -m.plugin.lift });
      }
      if (m.plugin.fan && on) {
        const a = m.angle - Math.PI / 2;
        for (const other of Composite.allBodies(this.world)) {
          if (other === m || other.isStatic) continue;
          const dx = other.position.x - m.position.x;
          const dy = other.position.y - m.position.y;
          const dist = Math.hypot(dx, dy);
          if (dist > 120 || dist < 5) continue;
          const ang = Math.atan2(dy, dx);
          let diff = ang - a;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          if (Math.abs(diff) < 0.7) {
            const massScale = Math.max(0.35, Math.min(2.5, other.mass / 0.025));
            const f = m.plugin.fan * (1 - dist / 120) * massScale;
            Body.set(other, { isSleeping: false });
            Body.applyForce(other, other.position, { x: Math.cos(a) * f, y: Math.sin(a) * f });
          }
        }
      }
      if (m.plugin.conveyor && on) {
        const beltTop = m.bounds.min.y;
        const beltLeft = m.bounds.min.x;
        const beltRight = m.bounds.max.x;
        const dirX = Math.cos(m.angle);
        const targetVx = m.plugin.conveyor * dirX;
        for (const other of Composite.allBodies(this.world)) {
          if (other === m || other.isStatic) continue;
          // Rough contact: resting on / just above the belt surface
          const onBelt =
            other.bounds.max.y > beltTop - 4 &&
            other.bounds.min.y < beltTop + 18 &&
            other.position.x > beltLeft - 6 &&
            other.position.x < beltRight + 6;
          if (!onBelt) continue;
          Body.set(other, { isSleeping: false });
          Body.setVelocity(other, {
            x: other.velocity.x * 0.4 + targetVx * 0.6,
            y: other.velocity.y,
          });
        }
      }
      if (m.plugin.heater && on) {
        m.plugin.alwaysHot = true;
        for (const other of Composite.allBodies(this.world)) {
          if (other === m || other.isStatic) continue;
          const dist = Math.hypot(other.position.x - m.position.x, other.position.y - m.position.y);
          if (dist < 70 && Math.random() < 0.08) ignite(other, 0.8, 3);
        }
        if (Math.random() < 0.3) this.particles.flame(m.position.x, m.position.y - 10, 2);
      } else if (m.plugin.heater && !on) {
        m.plugin.alwaysHot = false;
      }
      if (m.plugin.flamethrower && on) {
        const a = m.angle - Math.PI / 2;
        const fx = m.position.x + Math.cos(a) * 28;
        const fy = m.position.y + Math.sin(a) * 28;
        this.particles.flame(fx, fy, 3);
        for (const other of Composite.allBodies(this.world)) {
          if (other === m || other.isStatic) continue;
          const dist = Math.hypot(other.position.x - fx, other.position.y - fy);
          if (dist < 50 && Math.random() < 0.2) ignite(other, 1.1, 4);
        }
      }
      // Coil / sprinkler only “work” when active (element tick may still check flags)
      if (m.plugin.coil) m.plugin.coilPowered = on;
      if (m.plugin.sprinkler) m.plugin.sprinklerOn = on;
      if (m.plugin.squeezer) {
        tickSqueezer(m, this.world, dt, this.particles);
      }
      if (m.plugin.boneMelter) {
        tickBoneMelter(m, this.world, dt, this.particles);
      }
      if (m.plugin.boneMold) {
        tickBoneMold(m, this.world, dt, this.particles, (wid, x, y) => this._spawnWeapon(wid, x, y));
      }
      if (m.plugin.boneReconnector) {
        tickBoneReconnector(m, this.world, dt, this.particles, this.groundY);
      }
      if (m.plugin.crystallizer) {
        tickCrystallizer(m, this.world, dt, this.particles, (x, y, color) => {
          const shard = createJuiceShard(x, y, color);
          Composite.add(this.world, shard);
          ensureNetId(shard);
          return shard;
        });
      }
      if (m.plugin.shardSmelter) {
        tickShardSmelter(m, this.world, dt, this.particles);
      }
    }

    // Remove shattered skeleton parts
    for (const b of Composite.allBodies(this.world)) {
      if (b.plugin?.state === "gone") {
        const cons = Composite.allConstraints(this.world).filter(
          (c) => c.bodyA === b || c.bodyB === b
        );
        Composite.remove(this.world, [b, ...cons]);
      }
    }

    this.particles.update(dt);
    if (this._shake > 0) this._shake *= 0.88;

    // Heal MP plugin drift (molds, squeezers, liquids) without waiting for need-full
    if (this.mp?.enabled && this.mp.isHost) {
      this._mpHeartbeatAcc = (this._mpHeartbeatAcc || 0) + dt;
      if (this._mpHeartbeatAcc > 3.5) {
        this._mpHeartbeatAcc = 0;
        this._mpQueueFullSync();
      }
    }
  }

  _frame(now) {
    const dt = Math.min(0.05, (now - this._last) / 1000);
    this._last = now;
    // Guests still tick cosmetics; host (or offline) runs full gameplay
    const guest = this.mp?.enabled && !this.mp.isHost;
    if (!this.paused) {
      if (guest) {
        this.particles.update(dt);
        if (this._shake > 0) this._shake *= 0.88;
      } else {
        this._tickGameplay(dt);
      }
    }
    if (this.mp?.enabled) this.mp.tick(dt);
    this._draw();
    requestAnimationFrame((t) => this._frame(t));
  }

  _draw() {
    const ctx = this._ctx || this.canvas.getContext("2d", { alpha: false });
    const { width, height } = this.canvas;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#2a2e34";
    ctx.fillRect(0, 0, width, height);

    const shakeX = (Math.random() - 0.5) * this._shake;
    const shakeY = (Math.random() - 0.5) * this._shake;

    ctx.setTransform(
      this.dpr * this.camera.zoom,
      0,
      0,
      this.dpr * this.camera.zoom,
      -this.camera.x * this.dpr * this.camera.zoom + shakeX * this.dpr,
      -this.camera.y * this.dpr * this.camera.zoom + shakeY * this.dpr
    );

    this._drawBackground(ctx);

    // Ground & platforms
    this._drawTerrain(ctx);

    const bodies = Composite.allBodies(this.world);
    // Element zones under everything
    for (const b of bodies) {
      if (b.plugin?.waterZone || b.plugin?.lavaZone) this._drawZone(ctx, b);
    }
    // Draw props/weapons first, fruit on top
    for (const b of bodies) {
      if (b.isStatic) continue;
      if (b.plugin?.fruit) continue;
      this._drawProp(ctx, b);
    }
    for (const b of bodies) {
      if (b.plugin?.fruit) {
        drawFruitBody(ctx, b);
        drawLivingAIBadge(ctx, b);
      }
    }

    drawMultiplayerGlows(ctx, this);

    this.particles.draw(ctx);

    // Ropes, welds, wires, grips
    for (const r of Composite.allConstraints(this.world)) {
      if (!r.bodyA) continue;
      const type = r.plugin?.draw;
      if (!type || !["rope", "soft", "weld", "pin", "signal", "grip", "pipe"].includes(type)) continue;

      let ax, ay, bx, by;
      if (r.plugin?.wallPin) {
        const pa = r.pointA || { x: 0, y: 0 };
        const cos = Math.cos(r.bodyA.angle);
        const sin = Math.sin(r.bodyA.angle);
        ax = r.bodyA.position.x + pa.x * cos - pa.y * sin;
        ay = r.bodyA.position.y + pa.x * sin + pa.y * cos;
        bx = r.pointB?.x ?? ax;
        by = r.pointB?.y ?? ay;
      } else if (!r.bodyB) {
        continue;
      } else {
        ax = r.bodyA.position.x + (r.pointA?.x || 0);
        ay = r.bodyA.position.y + (r.pointA?.y || 0);
        bx = r.bodyB.position.x + (r.pointB?.x || 0);
        by = r.bodyB.position.y + (r.pointB?.y || 0);
      }

      if (type === "pipe") {
        const src = r.bodyA.plugin?.liquid;
        const col = src?.amount > 0 ? src.color || "#4a9aaa" : "#4a9aaa";
        ctx.strokeStyle = "rgba(30,50,55,0.85)";
        ctx.lineWidth = 7;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();
        ctx.strokeStyle = col;
        ctx.globalAlpha = 0.75;
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();
        ctx.globalAlpha = 1;
        const mx = (ax + bx) / 2;
        const my = (ay + by) / 2;
        const ang = Math.atan2(by - ay, bx - ax);
        ctx.save();
        ctx.translate(mx, my);
        ctx.rotate(ang);
        ctx.fillStyle = "rgba(255,255,255,0.55)";
        ctx.beginPath();
        ctx.moveTo(6, 0);
        ctx.lineTo(-4, -4);
        ctx.lineTo(-4, 4);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else {
        const activeSignal = type === "signal" && isActive(r.bodyA);
        drawLinkStyle(ctx, type, ax, ay, bx, by, activeSignal);
      }
    }

    // Drag line
    if (this.drag.constraint && this.drag.body) {
      ctx.strokeStyle = "rgba(200,200,200,0.7)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(this.pointerWorld.x, this.pointerWorld.y);
      ctx.lineTo(this.drag.body.position.x, this.drag.body.position.y);
      ctx.stroke();
    }

    if (this.ropeAnchor) {
      const col =
        this.tool === "weld"
          ? "rgba(138,144,152,0.7)"
          : this.tool === "wire"
            ? "rgba(96,192,112,0.7)"
            : this.tool === "soft"
              ? "rgba(212,184,148,0.7)"
              : "rgba(196,165,116,0.6)";
      ctx.strokeStyle = col;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(this.ropeAnchor.position.x, this.ropeAnchor.position.y);
      ctx.lineTo(this.pointerWorld.x, this.pointerWorld.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (this.gripHand) {
      ctx.strokeStyle = "rgba(224,160,96,0.7)";
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(this.gripHand.position.x, this.gripHand.position.y);
      ctx.lineTo(this.pointerWorld.x, this.pointerWorld.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (this.platDrag) {
      const x0 = this.platDrag.x;
      const y0 = this.platDrag.y;
      const x1 = this.pointerWorld.x;
      const y1 = this.pointerWorld.y;
      ctx.strokeStyle = "rgba(150,160,170,0.8)";
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.strokeRect(
        Math.min(x0, x1),
        Math.min(y0, y1),
        Math.abs(x1 - x0),
        Math.max(12, Math.abs(y1 - y0))
      );
      ctx.setLineDash([]);
    }

    if (this.pipeAnchor) {
      ctx.strokeStyle = "rgba(74,154,170,0.7)";
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(this.pipeAnchor.position.x, this.pipeAnchor.position.y);
      ctx.lineTo(this.pointerWorld.x, this.pointerWorld.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineWidth = 1;
    }

    // Spawn ghost
    if (this.tool === "spawn" && this.spawnItem) {
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = this.spawnItem.color || "#fff";
      ctx.beginPath();
      ctx.arc(this.pointerWorld.x, this.pointerWorld.y, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  _drawBackground(ctx) {
    const bg = this._getBackgroundCache();
    if (bg) {
      ctx.drawImage(bg, 0, 0);
      return;
    }
    this._paintBackground(ctx, this.worldSize.w, this.groundY);
  }

  _getBackgroundCache() {
    const { w } = this.worldSize;
    const h = this.groundY + 8;
    const key = `${this.mapId}:${w}x${h}:${this.mapTheme}`;
    if (this._bgCache && this._bgCacheKey === key) return this._bgCache;

    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.floor(w));
    c.height = Math.max(1, Math.floor(h));
    const bctx = c.getContext("2d");
    this._paintBackground(bctx, w, this.groundY);
    this._bgCache = c;
    this._bgCacheKey = key;
    return c;
  }

  _paintBackground(ctx, w, groundY) {
    if (this.mapTheme === "void") {
      ctx.fillStyle = "#1a1c20";
      ctx.fillRect(0, 0, w, groundY);
      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.lineWidth = 1;
      for (let x = 0; x < w; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, groundY);
        ctx.stroke();
      }
      for (let y = 0; y < groundY; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
      return;
    }
    if (this.mapTheme === "yard") {
      const grad = ctx.createLinearGradient(0, 0, 0, groundY);
      grad.addColorStop(0, "#7eb8e8");
      grad.addColorStop(1, "#c8dff0");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, groundY);
      ctx.fillStyle = "#6a9a58";
      ctx.beginPath();
      ctx.moveTo(0, groundY - 40);
      for (let x = 0; x < w; x += 120) {
        ctx.quadraticCurveTo(x + 40, groundY - 80 - (x % 200) * 0.1, x + 120, groundY - 50);
      }
      ctx.lineTo(w, groundY);
      ctx.lineTo(0, groundY);
      ctx.fill();
      return;
    }

    // Clinical gray testing room — bake grid once
    ctx.fillStyle = "#5a5e64";
    ctx.fillRect(0, 0, w, groundY);

    ctx.fillStyle = "#50545a";
    for (let x = 0; x < w; x += 120) {
      ctx.fillRect(x, 0, 2, groundY);
    }
    for (let y = 0; y < groundY; y += 120) {
      ctx.fillRect(0, y, w, 2);
    }

    ctx.strokeStyle = "rgba(0,0,0,0.12)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x < w; x += 40) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, groundY);
    }
    for (let y = 0; y < groundY; y += 40) {
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();
  }

  _drawTerrain(ctx) {
    const gy = this.groundY;
    const { w } = this.worldSize;

    if (this.mapTheme === "yard") {
      ctx.fillStyle = "#4a7a38";
      ctx.fillRect(-50, gy, w + 100, 220);
      ctx.fillStyle = "#5a8a44";
      ctx.fillRect(-50, gy - 8, w + 100, 12);
      for (let x = 0; x < w; x += 28) {
        ctx.fillStyle = x % 56 === 0 ? "#3a6a28" : "#6a9a50";
        ctx.fillRect(x, gy - 4, 10, 4);
      }
    } else if (this.mapTheme === "void") {
      ctx.fillStyle = "#12141a";
      ctx.fillRect(-50, gy, w + 100, 220);
      ctx.fillStyle = "#2a2e38";
      ctx.fillRect(-50, gy - 4, w + 100, 6);
    } else {
      // Concrete floor
      ctx.fillStyle = "#3a3e44";
      ctx.fillRect(-50, gy, w + 100, 220);
      ctx.fillStyle = "#4a4e54";
      ctx.fillRect(-50, gy - 6, w + 100, 10);
      ctx.fillStyle = "#2e3238";
      for (let x = 0; x < w; x += 80) {
        ctx.fillRect(x, gy + 4, 40, 3);
      }
    }

    for (const p of this.platforms) {
      const { x, y } = p.position;
      const bw = p.bounds.max.x - p.bounds.min.x;
      const bh = p.bounds.max.y - p.bounds.min.y;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(p.angle);
      ctx.fillStyle = this.mapTheme === "yard" ? "#6a5840" : "#6a6e74";
      ctx.fillRect(-bw / 2, -bh / 2, bw, bh);
      ctx.fillStyle = this.mapTheme === "yard" ? "#8a7355" : "#7a8088";
      ctx.fillRect(-bw / 2, -bh / 2, bw, 3);
      ctx.strokeStyle = "#2a2e32";
      ctx.lineWidth = 1;
      ctx.strokeRect(-bw / 2, -bh / 2, bw, bh);
      ctx.restore();
    }
  }

  _drawZone(ctx, body) {
    const pl = body.plugin;
    const bw = body.bounds.max.x - body.bounds.min.x;
    const bh = body.bounds.max.y - body.bounds.min.y;
    const { x, y } = body.position;
    ctx.save();
    ctx.translate(x, y);
    if (pl.waterZone) {
      ctx.fillStyle = "rgba(40,120,170,0.45)";
      ctx.fillRect(-bw / 2, -bh / 2, bw, bh);
      ctx.strokeStyle = "rgba(120,200,230,0.5)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const wx = -bw / 2 + (i / 5) * bw;
        ctx.lineTo(wx, -bh / 2 + Math.sin(performance.now() / 400 + i) * 3);
      }
      ctx.stroke();
    } else if (pl.lavaZone) {
      ctx.fillStyle = "rgba(200,60,20,0.55)";
      ctx.fillRect(-bw / 2, -bh / 2, bw, bh);
      ctx.fillStyle = "rgba(255,160,40,0.35)";
      ctx.fillRect(-bw / 2, -bh / 2, bw, bh * 0.35);
    }
    ctx.restore();
  }

  _drawProp(ctx, body) {
    const pl = body.plugin;
    if (!pl?.draw) {
      // default invisible matter body skip
      if (body.label === "bullet") {
        ctx.fillStyle = "#222";
        ctx.beginPath();
        ctx.arc(body.position.x, body.position.y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    }

    const { x, y } = body.position;
    const a = body.angle;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);

    if (pl.draw === "box") {
      ctx.fillStyle = pl.color;
      ctx.fillRect(-24, -24, 48, 48);
      ctx.strokeStyle = "#8a6a40";
      ctx.lineWidth = 2;
      ctx.strokeRect(-24, -24, 48, 48);
      ctx.beginPath();
      ctx.moveTo(-24, -24);
      ctx.lineTo(24, 24);
      ctx.moveTo(24, -24);
      ctx.lineTo(-24, 24);
      ctx.stroke();
    } else if (pl.draw === "crate") {
      drawSprite(ctx, "crate", 4.4);
    } else if (pl.draw === "plank") {
      ctx.fillStyle = pl.color;
      ctx.fillRect(-70, -8, 140, 16);
      ctx.strokeStyle = "#7a5535";
      ctx.strokeRect(-70, -8, 140, 16);
    } else if (pl.draw === "barrel" || pl.draw === "tank") {
      const bw = pl.draw === "tank" ? 24 : 20;
      const bh = pl.draw === "tank" ? 32 : 26;
      ctx.fillStyle = pl.color;
      ctx.fillRect(-bw, -bh, bw * 2, bh * 2);
      ctx.strokeStyle = pl.draw === "tank" ? "#2a4a55" : "#5a4508";
      ctx.lineWidth = 2;
      ctx.strokeRect(-bw, -bh, bw * 2, bh * 2);
      const v = pl.liquid;
      if (v) {
        const fill = Math.max(0, Math.min(1, v.amount / v.capacity));
        const innerW = bw * 2 - 8;
        const innerH = bh * 2 - 16;
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.fillRect(-bw + 4, -bh + 8, innerW, innerH);
        ctx.fillStyle = v.amount > 0.5 ? v.color : "#555";
        ctx.globalAlpha = 0.85;
        ctx.fillRect(-bw + 4, -bh + 8 + innerH * (1 - fill), innerW, innerH * fill);
        ctx.globalAlpha = 1;
        ctx.fillStyle = "rgba(255,255,255,0.7)";
        ctx.font = "9px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(`${juicePercent(v)}%`, 0, 4);
      }
      if (pl.draw === "barrel") {
        ctx.strokeStyle = "#5a4508";
        ctx.beginPath();
        ctx.moveTo(-bw, -8);
        ctx.lineTo(bw, -8);
        ctx.moveTo(-bw, 8);
        ctx.lineTo(bw, 8);
        ctx.stroke();
      } else {
        // tank lid / nozzle
        ctx.fillStyle = "#3a5a64";
        ctx.fillRect(-8, -bh - 6, 16, 8);
        ctx.fillRect(-3, -bh - 14, 6, 10);
      }
    } else if (pl.draw === "ball") {
      ctx.fillStyle = pl.color;
      ctx.beginPath();
      ctx.arc(0, 0, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#3a6a90";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 12, 0, Math.PI * 2);
      ctx.stroke();
    } else if (pl.draw === "rock") {
      ctx.fillStyle = pl.color;
      ctx.beginPath();
      ctx.moveTo(-30, 10);
      ctx.lineTo(-20, -28);
      ctx.lineTo(8, -34);
      ctx.lineTo(32, -8);
      ctx.lineTo(22, 30);
      ctx.lineTo(-18, 28);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#555";
      ctx.stroke();
    } else if (pl.draw === "sword") {
      ctx.fillStyle = "#c8d0d8";
      ctx.fillRect(-4, -32, 8, 50);
      ctx.fillStyle = "#8a5a30";
      ctx.fillRect(-8, 18, 16, 10);
      ctx.fillStyle = "#666";
      ctx.fillRect(-3, -36, 6, 6);
    } else if (pl.draw === "hammer") {
      ctx.fillStyle = "#8a5a30";
      ctx.fillRect(-4, -5, 8, 40);
      ctx.fillStyle = "#6a7078";
      ctx.fillRect(-18, -22, 36, 18);
    } else if (pl.draw === "bomb") {
      const fuseOn = pl.fuse != null && pl.armed;
      const blink = fuseOn && pl.fuse < 0.8 && Math.floor(pl.fuse * 10) % 2 === 0;
      ctx.fillStyle = blink ? "#a03020" : pl.active ? "#3a2020" : "#2a2a2a";
      ctx.beginPath();
      ctx.arc(0, 0, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = fuseOn ? "#f0c14a" : "#666";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -16);
      ctx.quadraticCurveTo(8, -28, 4, -34);
      ctx.stroke();
    } else if (pl.draw === "pistol") {
      ctx.fillStyle = "#3a3e44";
      ctx.fillRect(-5, -10, 10, 22);
      ctx.fillStyle = "#5a6068";
      ctx.fillRect(-4, -18, 8, 10);
      ctx.fillStyle = "#8a7355";
      ctx.fillRect(-3, 8, 6, 10);
    } else if (pl.draw === "rifle") {
      ctx.fillStyle = "#3a3e44";
      ctx.fillRect(-5, -24, 10, 44);
      ctx.fillStyle = "#4a5048";
      ctx.fillRect(-4, -30, 8, 10);
      ctx.fillStyle = "#6a5840";
      ctx.fillRect(-4, 14, 8, 14);
    } else if (pl.draw === "car") {
      ctx.fillStyle = "#c05040";
      ctx.fillRect(-45, -14, 90, 28);
      ctx.fillStyle = "#2a3038";
      ctx.fillRect(-28, -22, 36, 12);
      ctx.fillStyle = "#f0e080";
      ctx.fillRect(32, -6, 8, 6);
      ctx.fillRect(32, 0, 8, 6);
    } else if (pl.draw === "wheel") {
      ctx.fillStyle = "#1a1a1a";
      ctx.beginPath();
      ctx.arc(0, 0, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#666";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 8, 0, Math.PI * 2);
      ctx.stroke();
    } else if (pl.draw === "rocket") {
      ctx.fillStyle = "#d45a3a";
      ctx.fillRect(-9, -20, 18, 36);
      ctx.fillStyle = "#eee";
      ctx.beginPath();
      ctx.moveTo(0, -28);
      ctx.lineTo(-9, -18);
      ctx.lineTo(9, -18);
      ctx.fill();
      ctx.fillStyle = "#f0c14a";
      ctx.fillRect(-6, 16, 4, 8);
      ctx.fillRect(2, 16, 4, 8);
    } else if (pl.draw === "spike") {
      ctx.fillStyle = "#9aa0a8";
      ctx.beginPath();
      ctx.moveTo(0, -22);
      ctx.lineTo(12, 18);
      ctx.lineTo(-12, 18);
      ctx.closePath();
      ctx.fill();
    } else if (pl.draw === "metal") {
      ctx.fillStyle = pl.color;
      ctx.fillRect(-80, -6, 160, 12);
      ctx.strokeStyle = "#3a3e44";
      ctx.strokeRect(-80, -6, 160, 12);
      for (let i = -60; i <= 60; i += 30) {
        ctx.fillStyle = "#9aa0a8";
        ctx.fillRect(i - 2, -3, 4, 6);
      }
    } else if (pl.draw === "weight") {
      ctx.fillStyle = pl.color;
      ctx.beginPath();
      ctx.arc(0, 0, 28, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#2a2e32";
      ctx.fillRect(-8, -8, 16, 16);
    } else if (pl.draw === "wall") {
      ctx.fillStyle = pl.color;
      ctx.fillRect(-11, -60, 22, 120);
      ctx.strokeStyle = "#2a2e32";
      ctx.strokeRect(-11, -60, 22, 120);
    } else if (pl.draw === "thruster") {
      ctx.fillStyle = "#6a6e74";
      ctx.fillRect(-14, -12, 28, 28);
      ctx.fillStyle = "#b54a3a";
      ctx.beginPath();
      ctx.moveTo(-10, 16);
      ctx.lineTo(0, 28);
      ctx.lineTo(10, 16);
      ctx.fill();
    } else if (pl.draw === "spinner") {
      ctx.fillStyle = "#8a9098";
      ctx.fillRect(-35, -6, 70, 12);
      ctx.fillStyle = "#4a4e54";
      ctx.beginPath();
      ctx.arc(0, 0, 6, 0, Math.PI * 2);
      ctx.fill();
    } else if (pl.draw === "piston") {
      ctx.fillStyle = "#6a7180";
      ctx.fillRect(-12, -25, 24, 50);
      ctx.fillStyle = "#9aa0a8";
      ctx.fillRect(-6, -40, 12, 18);
    } else if (pl.draw === "mine") {
      ctx.fillStyle = pl.armed ? "#2a2a2a" : "#555";
      ctx.beginPath();
      ctx.arc(0, 0, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#b54a3a";
      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, Math.PI * 2);
      ctx.fill();
    } else if (pl.draw === "saw") {
      ctx.fillStyle = "#c8ccd0";
      ctx.beginPath();
      ctx.arc(0, 0, 26, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#3a3e44";
      ctx.lineWidth = 2;
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 18, Math.sin(a) * 18);
        ctx.lineTo(Math.cos(a) * 28, Math.sin(a) * 28);
        ctx.stroke();
      }
    } else if (pl.draw === "syringe") {
      const v = pl.liquid;
      const fill = v ? Math.max(0, Math.min(1, v.amount / v.capacity)) : pl.used ? 0 : 1;
      const fluidCol = v && v.amount > 0.5 ? v.color : pl.used ? "#c8c8c8" : pl.fluid || pl.color;
      ctx.fillStyle = "#d8dce0";
      ctx.fillRect(-5, -10, 10, 22);
      const bh = 16;
      const fh = bh * fill;
      ctx.fillStyle = fluidCol;
      ctx.globalAlpha = fill > 0.05 ? 0.85 : 0.25;
      ctx.fillRect(-3.5, -8 + (bh - fh), 7, fh);
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#4a4e54";
      ctx.fillRect(-6, -16, 12, 5);
      ctx.fillRect(-2, -22, 4, 8);
      ctx.strokeStyle = "#9aa0a8";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, 12);
      ctx.lineTo(0, 22);
      ctx.stroke();
      ctx.fillStyle = pl.color || "#888";
      ctx.fillRect(-5, 6, 10, 4);
      if (v) {
        ctx.fillStyle = "rgba(20,20,20,0.55)";
        ctx.font = "7px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(`${juicePercent(v)}%`, 0, -26);
      }
    } else if (pl.draw === "brick") {
      ctx.fillStyle = pl.color;
      ctx.fillRect(-18, -10, 36, 20);
      ctx.strokeStyle = "#5a3028";
      ctx.strokeRect(-18, -10, 36, 20);
    } else if (pl.draw === "tire") {
      ctx.fillStyle = "#1a1a1a";
      ctx.beginPath();
      ctx.arc(0, 0, 26, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#3a3a3a";
      ctx.beginPath();
      ctx.arc(0, 0, 12, 0, Math.PI * 2);
      ctx.fill();
    } else if (pl.draw === "glass") {
      ctx.fillStyle = "rgba(168,208,224,0.45)";
      ctx.fillRect(-35, -5, 70, 10);
      ctx.strokeStyle = "rgba(200,230,240,0.8)";
      ctx.strokeRect(-35, -5, 70, 10);
    } else if (pl.draw === "anvil") {
      ctx.fillStyle = pl.color;
      ctx.fillRect(-25, -6, 50, 20);
      ctx.fillRect(-18, -14, 36, 10);
      ctx.fillRect(-10, 12, 20, 8);
    } else if (pl.draw === "cage") {
      ctx.strokeStyle = pl.color;
      ctx.lineWidth = 3;
      ctx.strokeRect(-35, -35, 70, 70);
      for (let i = -20; i <= 20; i += 20) {
        ctx.beginPath();
        ctx.moveTo(i, -35);
        ctx.lineTo(i, 35);
        ctx.stroke();
      }
    } else if (pl.draw === "balloon") {
      ctx.fillStyle = pl.color;
      ctx.beginPath();
      ctx.arc(0, -4, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#888";
      ctx.beginPath();
      ctx.moveTo(0, 12);
      ctx.lineTo(0, 28);
      ctx.stroke();
    } else if (pl.draw === "torch") {
      ctx.fillStyle = "#6a4a28";
      ctx.fillRect(-4, -4, 8, 22);
      ctx.fillStyle = "#ff8040";
      ctx.beginPath();
      ctx.arc(0, -10, 7, 0, Math.PI * 2);
      ctx.fill();
    } else if (pl.draw === "firebarrel" || pl.draw === "watercan") {
      ctx.fillStyle = pl.color;
      ctx.fillRect(-18, -22, 36, 44);
      ctx.strokeStyle = "#2a2a2a";
      ctx.strokeRect(-18, -22, 36, 44);
      if (pl.draw === "firebarrel") {
        ctx.fillStyle = "#ff9040";
        ctx.fillRect(-10, -30, 20, 10);
      }
    } else if (pl.draw === "battery") {
      ctx.fillStyle = "#2a2a2a";
      ctx.fillRect(-11, -17, 22, 34);
      ctx.fillStyle = "#3a8a50";
      ctx.fillRect(-11, 0, 22, 17);
      ctx.fillStyle = "#ccc";
      ctx.fillRect(-4, -22, 3, 6);
      ctx.fillRect(2, -22, 3, 6);
    } else if (pl.draw === "wire") {
      ctx.strokeStyle = pl.color || "#c4a040";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(-40, 0);
      ctx.quadraticCurveTo(0, -8, 40, 0);
      ctx.stroke();
    } else if (pl.draw === "shockpad") {
      ctx.fillStyle = "#d0c040";
      ctx.fillRect(-35, -6, 70, 12);
      ctx.fillStyle = "#2a2a2a";
      ctx.fillRect(-30, -3, 8, 6);
      ctx.fillRect(22, -3, 8, 6);
    } else if (pl.draw === "coil") {
      ctx.fillStyle = "#4a4e54";
      ctx.fillRect(-14, -10, 28, 34);
      ctx.strokeStyle = "#60a0d0";
      ctx.lineWidth = 3;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.arc(0, -18 - i * 5, 10 - i, 0, Math.PI * 2);
        ctx.stroke();
      }
    } else if (pl.draw === "sprinkler") {
      ctx.fillStyle = "#50a0c0";
      ctx.fillRect(-14, -6, 28, 16);
      ctx.fillStyle = "#7ec8e8";
      ctx.beginPath();
      ctx.arc(0, -10, 6, 0, Math.PI * 2);
      ctx.fill();
    } else if (pl.draw === "fan") {
      ctx.fillStyle = "#7a8088";
      ctx.fillRect(-25, -9, 50, 18);
      ctx.fillStyle = "#c8ccd0";
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + performance.now() / 120;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * 20, Math.sin(a) * 8);
        ctx.lineTo(Math.cos(a + 0.4) * 16, Math.sin(a + 0.4) * 6);
        ctx.fill();
      }
    } else if (pl.draw === "heater") {
      ctx.fillStyle = "#6a3030";
      ctx.fillRect(-20, -14, 40, 28);
      ctx.fillStyle = "#ff6040";
      ctx.fillRect(-14, -8, 28, 10);
    } else if (pl.draw === "conveyor") {
      ctx.fillStyle = "#5a6068";
      ctx.fillRect(-70, -7, 140, 14);
      ctx.fillStyle = "#3a3e44";
      for (let i = -60; i <= 60; i += 20) ctx.fillRect(i, -4, 10, 8);
    } else if (pl.draw === "axe") {
      ctx.fillStyle = "#6a4a28";
      ctx.fillRect(-3, -10, 6, 36);
      ctx.fillStyle = "#9aa0a8";
      ctx.beginPath();
      ctx.moveTo(-3, -28);
      ctx.lineTo(18, -18);
      ctx.lineTo(-3, -8);
      ctx.closePath();
      ctx.fill();
    } else if (pl.draw === "baton") {
      ctx.fillStyle = "#3a3e44";
      ctx.fillRect(-4, -26, 8, 52);
      ctx.fillStyle = "#50a0d0";
      ctx.fillRect(-5, -28, 10, 10);
    } else if (pl.draw === "flamethrower") {
      ctx.fillStyle = "#4a4e54";
      ctx.fillRect(-8, -22, 16, 44);
      ctx.fillStyle = "#d06020";
      ctx.fillRect(-6, -28, 12, 10);
    } else if (pl.draw === "firebomb") {
      ctx.fillStyle = "#b04020";
      ctx.beginPath();
      ctx.arc(0, 0, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#ff9040";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -14);
      ctx.lineTo(4, -24);
      ctx.stroke();
    } else if (pl.draw === "shotgun") {
      ctx.fillStyle = "#5a5040";
      ctx.fillRect(-5, -20, 10, 40);
      ctx.fillStyle = "#3a3a3a";
      ctx.fillRect(-4, -28, 8, 12);
    } else if (pl.draw === "minigun") {
      ctx.fillStyle = "#3a3e44";
      ctx.fillRect(-7, -26, 14, 48);
      ctx.fillStyle = "#6a7078";
      ctx.fillRect(-5, -32, 10, 10);
      ctx.fillStyle = "#222";
      for (let i = -4; i <= 4; i += 4) ctx.fillRect(i - 1, -20, 2, 30);
    } else if (pl.draw === "crossbow") {
      ctx.fillStyle = "#6a5840";
      ctx.fillRect(-4, -20, 8, 40);
      ctx.strokeStyle = "#8a7355";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, -18, 16, Math.PI * 0.15, Math.PI * 0.85);
      ctx.stroke();
    } else if (pl.draw === "grenade") {
      ctx.fillStyle = pl.active ? "#4a7a40" : "#3a5a38";
      ctx.beginPath();
      ctx.arc(0, 2, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#8a9098";
      ctx.fillRect(-4, -14, 8, 8);
    } else if (pl.draw === "bike") {
      ctx.fillStyle = "#4a6a88";
      ctx.fillRect(-25, -6, 50, 12);
      ctx.fillStyle = "#2a3038";
      ctx.fillRect(-8, -16, 6, 12);
    } else if (pl.draw === "bus") {
      ctx.fillStyle = "#d0a020";
      ctx.fillRect(-80, -20, 160, 40);
      ctx.fillStyle = "#2a3038";
      for (let i = -60; i <= 40; i += 28) ctx.fillRect(i, -16, 18, 12);
      ctx.fillStyle = "#f0e080";
      ctx.fillRect(68, -8, 8, 8);
    } else if (pl.draw === "cloth") {
      ctx.fillStyle = pl.color || "#888";
      if (pl.clothing === "hat") {
        ctx.beginPath();
        ctx.ellipse(0, 2, 14, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(-8, -10, 16, 10);
      } else if (pl.clothing === "helmet") {
        ctx.beginPath();
        ctx.arc(0, 2, 14, Math.PI, 0);
        ctx.fill();
      } else if (pl.clothing === "vest") {
        ctx.fillRect(-16, -18, 32, 36);
        ctx.strokeStyle = "#2a3a50";
        ctx.strokeRect(-16, -18, 32, 36);
      } else {
        ctx.beginPath();
        ctx.moveTo(-16, -16);
        ctx.lineTo(16, -16);
        ctx.lineTo(20, 20);
        ctx.lineTo(-20, 20);
        ctx.fill();
      }
    } else if (pl.draw === "sensor") {
      ctx.fillStyle = pl.active || pl.sensorTripped ? "#9dff90" : "#3a5a40";
      ctx.beginPath();
      ctx.arc(0, 0, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#60c070";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 10, 0, Math.PI * 2);
      ctx.stroke();
    } else if (pl.draw === "button") {
      ctx.fillStyle = pl.buttonPressed ? "#ff8080" : "#d05050";
      ctx.beginPath();
      ctx.arc(0, 0, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(0, 0, 6, 0, Math.PI * 2);
      ctx.fill();
    } else if (pl.draw === "toggle") {
      ctx.fillStyle = "#4a4e54";
      ctx.fillRect(-14, -10, 28, 20);
      ctx.fillStyle = pl.active ? "#9ad06a" : "#c0a040";
      ctx.fillRect(pl.active ? 2 : -12, -6, 10, 12);
    } else if (pl.draw === "squeezer") {
      ctx.fillStyle = "#5a5040";
      ctx.fillRect(-36, -20, 72, 48);
      ctx.fillStyle = "#3a3428";
      ctx.fillRect(-28, -28, 56, 14);
      ctx.fillStyle = pl.active ? "#8a7060" : "#6a5a48";
      ctx.fillRect(-22, -34, 44, 10);
      // Press plate
      const press = pl.active ? Math.sin((performance.now() / 180) % (Math.PI * 2)) * 4 : 0;
      ctx.fillStyle = "#8a9098";
      ctx.fillRect(-18, -8 + press, 36, 8);
      const v = pl.liquid;
      if (v) {
        const fill = Math.max(0, Math.min(1, v.amount / v.capacity));
        ctx.fillStyle = "rgba(0,0,0,0.4)";
        ctx.fillRect(-30, 6, 60, 16);
        ctx.fillStyle = v.amount > 0.5 ? v.color : "#444";
        ctx.fillRect(-30, 6 + 16 * (1 - fill), 60, 16 * fill);
        ctx.fillStyle = "rgba(255,255,255,0.75)";
        ctx.font = "9px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(`${juicePercent(v)}%`, 0, 18);
      }
    } else if (pl.draw === "boneMelter") {
      ctx.fillStyle = "#6a6558";
      ctx.fillRect(-34, -18, 68, 44);
      ctx.fillStyle = pl.active ? "#c07040" : "#8a7060";
      ctx.fillRect(-28, -26, 56, 12);
      ctx.fillStyle = "#3a3830";
      ctx.beginPath();
      ctx.moveTo(-20, -26);
      ctx.lineTo(0, -38);
      ctx.lineTo(20, -26);
      ctx.fill();
      const v = pl.liquid;
      if (v) {
        const fill = Math.max(0, Math.min(1, v.amount / v.capacity));
        ctx.fillStyle = "rgba(0,0,0,0.4)";
        ctx.fillRect(-28, 4, 56, 14);
        ctx.fillStyle = v.amount > 0.5 ? v.color : "#444";
        ctx.fillRect(-28, 4 + 14 * (1 - fill), 56, 14 * fill);
        ctx.fillStyle = "rgba(255,255,255,0.75)";
        ctx.font = "9px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(`${juicePercent(v)}%`, 0, 15);
      }
    } else if (
      pl.draw === "boneMoldSword" ||
      pl.draw === "boneMoldSpike" ||
      pl.draw === "boneMoldAxe" ||
      pl.draw === "boneMoldClub"
    ) {
      ctx.fillStyle = "#5a5648";
      ctx.fillRect(-24, -14, 48, 32);
      ctx.fillStyle = pl.active ? "#d8d0c0" : "#9a9488";
      ctx.fillRect(-16, -22, 32, 10);
      // Cavity silhouette
      ctx.fillStyle = "#2a2820";
      if (pl.draw === "boneMoldSpike") {
        ctx.beginPath();
        ctx.moveTo(0, -8);
        ctx.lineTo(6, 10);
        ctx.lineTo(-6, 10);
        ctx.fill();
      } else if (pl.draw === "boneMoldClub") {
        ctx.fillRect(-5, -6, 10, 18);
        ctx.beginPath();
        ctx.arc(0, -8, 8, 0, Math.PI * 2);
        ctx.fill();
      } else if (pl.draw === "boneMoldAxe") {
        ctx.fillRect(-3, -4, 6, 16);
        ctx.beginPath();
        ctx.moveTo(3, -6);
        ctx.lineTo(14, 0);
        ctx.lineTo(3, 6);
        ctx.fill();
      } else {
        ctx.fillRect(-3, -8, 6, 20);
      }
      const v = pl.liquid;
      if (v) {
        const fill = Math.max(0, Math.min(1, v.amount / v.capacity));
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.fillRect(-20, 8, 40, 8);
        ctx.fillStyle = v.amount > 0.5 ? v.color : "#444";
        ctx.fillRect(-20, 8 + 8 * (1 - fill), 40, 8 * fill);
      }
    } else if (pl.draw === "boneReconnector") {
      ctx.fillStyle = "#7a7568";
      ctx.fillRect(-40, -12, 80, 28);
      ctx.fillStyle = pl.active ? "#e8e0d0" : "#a8a090";
      ctx.fillRect(-34, -20, 68, 10);
      ctx.strokeStyle = "#d0c8b8";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-22, 0);
      ctx.lineTo(-8, 0);
      ctx.moveTo(8, 0);
      ctx.lineTo(22, 0);
      ctx.stroke();
      ctx.fillStyle = "#c8c0b0";
      ctx.beginPath();
      ctx.arc(-8, 0, 4, 0, Math.PI * 2);
      ctx.arc(8, 0, 4, 0, Math.PI * 2);
      ctx.fill();
      if (pl.active) {
        const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 200);
        ctx.strokeStyle = `rgba(232,224,208,${0.35 + pulse * 0.5})`;
        ctx.strokeRect(-36, -8, 72, 20);
      }
    } else if (pl.draw === "boneSword") {
      const col = pl.tint || pl.color || "#e8e0d0";
      ctx.fillStyle = col;
      ctx.fillRect(-3.5, -30, 7, 48);
      ctx.beginPath();
      ctx.moveTo(0, -36);
      ctx.lineTo(5, -28);
      ctx.lineTo(-5, -28);
      ctx.fill();
      ctx.fillStyle = pl.crystalWeapon ? col : "#a09070";
      ctx.fillRect(-8, 16, 16, 8);
      ctx.fillRect(-3, 22, 6, 10);
      if (pl.hybridWeapon || pl.crystalWeapon) {
        ctx.strokeStyle = "rgba(255,255,255,0.35)";
        ctx.strokeRect(-3.5, -30, 7, 48);
      }
    } else if (pl.draw === "boneSpike") {
      const col = pl.tint || pl.color || "#d8d0c0";
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(0, -22);
      ctx.lineTo(10, 16);
      ctx.lineTo(-10, 16);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = pl.crystalWeapon ? col : "#a09070";
      ctx.fillRect(-6, 14, 12, 8);
    } else if (pl.draw === "boneAxe") {
      const col = pl.tint || pl.color || "#e0d8c8";
      ctx.fillStyle = "#b8a888";
      ctx.fillRect(-3, -8, 6, 36);
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(3, -18);
      ctx.lineTo(18, -4);
      ctx.lineTo(18, 8);
      ctx.lineTo(3, 10);
      ctx.closePath();
      ctx.fill();
    } else if (pl.draw === "boneClub") {
      const col = pl.tint || pl.color || "#c8bca8";
      ctx.fillStyle = col;
      ctx.fillRect(-4, -5, 8, 36);
      ctx.beginPath();
      ctx.ellipse(0, -14, 12, 14, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#9a8870";
      ctx.fillRect(-5, 28, 10, 8);
    } else if (pl.draw === "juiceShard") {
      const col = pl.color || "#b8e86a";
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(0, -18);
      ctx.lineTo(7, 4);
      ctx.lineTo(2, 16);
      ctx.lineTo(-2, 16);
      ctx.lineTo(-7, 4);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.beginPath();
      ctx.moveTo(-1, -14);
      ctx.lineTo(3, 0);
      ctx.lineTo(0, 8);
      ctx.strokeStyle = "rgba(255,255,255,0.4)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else if (pl.draw === "crystallizer") {
      ctx.fillStyle = "#4a6050";
      ctx.fillRect(-32, -18, 64, 44);
      ctx.fillStyle = pl.active ? "#90d070" : "#6a9070";
      ctx.fillRect(-26, -28, 52, 12);
      ctx.fillStyle = "#2a4030";
      ctx.beginPath();
      ctx.moveTo(-14, -8);
      ctx.lineTo(0, 10);
      ctx.lineTo(14, -8);
      ctx.fill();
      const v = pl.liquid;
      if (v) {
        const fill = Math.max(0, Math.min(1, v.amount / v.capacity));
        ctx.fillStyle = "rgba(0,0,0,0.4)";
        ctx.fillRect(-26, 8, 52, 12);
        ctx.fillStyle = v.amount > 0.5 ? v.color : "#444";
        ctx.fillRect(-26, 8 + 12 * (1 - fill), 52, 12 * fill);
        ctx.fillStyle = "rgba(255,255,255,0.75)";
        ctx.font = "9px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(`${juicePercent(v)}%`, 0, 18);
      }
    } else if (pl.draw === "shardSmelter") {
      ctx.fillStyle = "#4a5868";
      ctx.fillRect(-33, -18, 66, 44);
      ctx.fillStyle = pl.active ? "#70a0c0" : "#5a7080";
      ctx.fillRect(-26, -28, 52, 12);
      ctx.fillStyle = "#c07040";
      ctx.fillRect(-18, -6, 36, 10);
      const v = pl.liquid;
      if (v) {
        const fill = Math.max(0, Math.min(1, v.amount / v.capacity));
        ctx.fillStyle = "rgba(0,0,0,0.4)";
        ctx.fillRect(-26, 8, 52, 12);
        ctx.fillStyle = v.amount > 0.5 ? v.color : "#444";
        ctx.fillRect(-26, 8 + 12 * (1 - fill), 52, 12 * fill);
        ctx.fillStyle = "rgba(255,255,255,0.75)";
        ctx.font = "9px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(`${juicePercent(v)}%`, 0, 18);
      }
    }

    if (pl.burn) {
      ctx.fillStyle = "rgba(255,120,40,0.35)";
      ctx.beginPath();
      ctx.arc(0, -8, 14, 0, Math.PI * 2);
      ctx.fill();
    }
    if (pl.shock) {
      ctx.strokeStyle = "rgba(120,200,255,0.85)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-10, -12);
      ctx.lineTo(-2, 0);
      ctx.lineTo(-8, 0);
      ctx.lineTo(6, 14);
      ctx.stroke();
    }
    if (pl.wet > 0.35) {
      ctx.fillStyle = "rgba(100,180,220,0.25)";
      ctx.fillRect(-16, -16, 32, 32);
    }

    if (pl.frozen) {
      ctx.strokeStyle = "rgba(140,200,255,0.7)";
      ctx.lineWidth = 2;
      ctx.strokeRect(-20, -20, 40, 40);
    }

    if (pl.activatable && pl.active) {
      ctx.strokeStyle = "rgba(154,208,106,0.9)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 22, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "rgba(154,208,106,0.85)";
      ctx.beginPath();
      ctx.arc(14, -14, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  // ——— Multiplayer ———

  _mpQueueFullSync() {
    if (!this.mp?.enabled || !this.mp.isHost) return;
    clearTimeout(this._mpFullTimer);
    this._mpFullTimer = setTimeout(() => {
      this.mp.send({ type: "full", data: this._mpSerialize() });
    }, 150);
  }

  _mpFindByNetId(netId) {
    if (!netId) return null;
    return Composite.allBodies(this.world).find((b) => b.plugin?.netId === netId) || null;
  }

  _mpStampWorld() {
    stampNetIds(Composite.allBodies(this.world));
  }

  _mpSerialize() {
    this._mpStampWorld();
    const data = serializeScene(this);
    data.netSeq = getNetSeq();
    // Attach netIds onto serialized items / fruit parts for MP
    const bodies = Composite.allBodies(this.world);
    const byPos = bodies.filter((b) => b.plugin?.netId);
    data.mpNet = byPos.map((b) => ({
      n: b.plugin.netId,
      x: b.position.x,
      y: b.position.y,
      a: b.angle,
      rid: b.plugin.ragdollId || null,
      slot: b.plugin.partSlot || null,
      draw: b.plugin.draw || null,
      fruit: !!b.plugin.fruit,
    }));
    return data;
  }

  _mpApplyFull(data) {
    try {
      deserializeScene(this, data);
      if (data.netSeq) setNetSeq(data.netSeq);
      // Remap netIds by nearest match from host dump
      if (Array.isArray(data.mpNet)) {
        const bodies = Composite.allBodies(this.world).filter(
          (b) => b.label !== "ground" && b.label !== "platform"
        );
        const used = new Set();
        for (const entry of data.mpNet) {
          let best = null;
          let bestD = 55;
          for (const b of bodies) {
            if (used.has(b.id)) continue;
            if (entry.fruit && !b.plugin?.fruit) continue;
            if (entry.slot && b.plugin?.partSlot && b.plugin.partSlot !== entry.slot) continue;
            if (entry.draw && b.plugin?.draw && b.plugin.draw !== entry.draw) continue;
            if (entry.rid && b.plugin?.ragdollId && entry.fruit) {
              // prefer same slot; rid will be remapped
            }
            const d = Math.hypot(b.position.x - entry.x, b.position.y - entry.y);
            if (d < bestD) {
              bestD = d;
              best = b;
            }
          }
          if (best) {
            if (!best.plugin) best.plugin = {};
            best.plugin.netId = entry.n;
            used.add(best.id);
          }
        }
      }
      this._mpStampWorld();
      if (this.mp?.enabled && !this.mp.isHost) {
        try {
          Runner.stop(this.runner);
        } catch (_) {}
      }
    } catch (err) {
      console.error("MP full sync failed", err);
    }
  }

  _mpBuildSnap() {
    this._mpStampWorld();
    const bodies = [];
    for (const b of Composite.allBodies(this.world)) {
      if (b.label === "ground" || b.label === "platform") continue;
      if (b.label === "bullet") continue; // ephemeral — never full-synced
      if (!b.plugin?.netId) continue;
      const row = {
        n: b.plugin.netId,
        x: b.position.x,
        y: b.position.y,
        a: b.angle,
        vx: b.velocity.x,
        vy: b.velocity.y,
        va: b.angularVelocity,
        st: b.isStatic ? 1 : 0,
      };
      if (b.plugin.activatable) row.on = b.plugin.active ? 1 : 0;
      if (b.plugin.fruit) {
        row.hp = Math.round(b.plugin.hp || 0);
        row.fs = b.plugin.state || "alive";
        row.co = b.plugin.conscious ? 1 : 0;
        if (b.plugin.ai?.mode && b.plugin.ai.mode !== "idle") row.ai = b.plugin.ai.mode;
      }
      if (b.plugin.liquid) {
        row.la = Math.round(b.plugin.liquid.amount || 0);
        row.lt = b.plugin.liquid.type || "empty";
        if (b.plugin.liquid.color) row.lc = b.plugin.liquid.color;
      }
      bodies.push(row);
    }
    const sels = {};
    for (const [pid, nid] of this.mp.selections) sels[pid] = nid;
    if (this._selectedNetId) sels[this.mp.id] = this._selectedNetId;
    return { mapId: this.mapId, bodies, sels };
  }

  _mpApplySnap(msg) {
    if (msg.mapId && msg.mapId !== this.mapId && MAPS[msg.mapId]) {
      const now = performance.now();
      if (now - (this._mpNeedFullAt || 0) > 800) {
        this._mpNeedFullAt = now;
        this.mp.send({ type: "need-full" });
      }
      return;
    }
    const byNet = new Map();
    for (const b of Composite.allBodies(this.world)) {
      if (b.plugin?.netId) byNet.set(b.plugin.netId, b);
    }
    let missing = 0;
    for (const s of msg.bodies || []) {
      const b = byNet.get(s.n);
      if (!b) {
        missing++;
        continue;
      }
      Body.setPosition(b, { x: s.x, y: s.y });
      Body.setAngle(b, s.a || 0);
      Body.setVelocity(b, { x: s.vx || 0, y: s.vy || 0 });
      Body.setAngularVelocity(b, s.va || 0);
      if (s.st != null && !!s.st !== !!b.isStatic) {
        Body.setStatic(b, !!s.st);
        if (!b.plugin) b.plugin = {};
        b.plugin.frozen = !!s.st;
      }
      if (s.on != null && b.plugin?.activatable) b.plugin.active = !!s.on;
      if (b.plugin?.fruit) {
        if (s.hp != null) b.plugin.hp = s.hp;
        if (s.fs) b.plugin.state = s.fs;
        if (s.co != null) b.plugin.conscious = !!s.co;
        if (s.ai) {
          if (!b.plugin.ai) b.plugin.ai = { mode: "idle", dir: 1, timer: 0, phase: 0, punchCd: 0 };
          b.plugin.ai.mode = s.ai;
        } else if (b.plugin.ai && s.ai === undefined && s.fs) {
          // leave AI alone when omitted
        }
      }
      if (b.plugin?.liquid && s.la != null) {
        b.plugin.liquid.amount = s.la;
        if (s.lt) b.plugin.liquid.type = s.lt;
        if (s.lc) b.plugin.liquid.color = s.lc;
      }
    }
    if (missing > 2) {
      const now = performance.now();
      if (now - (this._mpNeedFullAt || 0) > 1000) {
        this._mpNeedFullAt = now;
        this.mp.send({ type: "need-full" });
      }
    }
  }

  _mpHandleAction(msg) {
    if (!msg?.act) return;
    const { act } = msg;
    if (act === "spawn" && msg.item) {
      this._spawnAt(msg.item, msg.x, msg.y);
      return;
    }
    if (act === "poke") {
      this._poke(msg.x, msg.y);
      this._mpQueueFullSync();
      return;
    }
    if (act === "shoot") {
      this._shoot(msg.x, msg.y);
      return;
    }
    if (act === "explode") {
      this._explode(msg.x, msg.y, 0.12);
      this._mpQueueFullSync();
      return;
    }
    if (act === "delete") {
      this._deleteAt(msg.x, msg.y);
      this._mpQueueFullSync();
      return;
    }
    if (act === "freeze") {
      this._freezeAt(msg.x, msg.y);
      this._mpQueueFullSync();
      return;
    }
    if (act === "slice") {
      this._sliceAt(msg.x, msg.y);
      this._mpQueueFullSync();
      return;
    }
    if (act === "pliers") {
      this._pliersAt(msg.x, msg.y);
      this._mpQueueFullSync();
      return;
    }
    if (act === "clear") {
      this.clearAll();
      this._mpQueueFullSync();
      return;
    }
    if (act === "map" && msg.mapId) {
      this.loadMap(msg.mapId);
      this._mpStampWorld();
      this._mpQueueFullSync();
      return;
    }
    if (act === "ai" && msg.netId && msg.mode) {
      const body = this._mpFindByNetId(msg.netId);
      if (body) setLivingAI(this.world, body, msg.mode);
      this._mpQueueFullSync();
      return;
    }
    if (act === "context" && msg.action && msg.netId) {
      const body = this._mpFindByNetId(msg.netId);
      if (body) this._onContextAction(msg.action, body);
      this._mpQueueFullSync();
    }
  }

  _mpHandleRemoteDrag(msg) {
    const from = msg.from;
    if (!from) return;
    if (msg.phase === "end") {
      const c = this._remoteDragConstraints.get(from);
      if (c) {
        Composite.remove(this.world, c);
        this._remoteDragConstraints.delete(from);
      }
      return;
    }
    const body = this._mpFindByNetId(msg.netId);
    if (!body || body.isStatic) return;
    ensureNetId(body);
    this.mp.selections.set(from, msg.netId);

    let constraint = this._remoteDragConstraints.get(from);
    if (msg.phase === "start" || !constraint) {
      if (constraint) Composite.remove(this.world, constraint);
      Body.set(body, { isSleeping: false });
      const dx = msg.x - body.position.x;
      const dy = msg.y - body.position.y;
      const cos = Math.cos(-body.angle);
      const sin = Math.sin(-body.angle);
      constraint = Constraint.create({
        pointA: { x: msg.x, y: msg.y },
        bodyB: body,
        pointB: { x: dx * cos - dy * sin, y: dx * sin + dy * cos },
        stiffness: 0.45,
        damping: 0.08,
        length: 0,
        render: { visible: false },
      });
      Composite.add(this.world, constraint);
      this._remoteDragConstraints.set(from, constraint);
    } else {
      constraint.pointA.x = msg.x;
      constraint.pointA.y = msg.y;
    }
  }
}

function distToBodyBounds(body, x, y) {
  const bx = Math.max(body.bounds.min.x, Math.min(x, body.bounds.max.x));
  const by = Math.max(body.bounds.min.y, Math.min(y, body.bounds.max.y));
  return Math.hypot(x - bx, y - by);
}

function distPointToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-6) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

new Game();
