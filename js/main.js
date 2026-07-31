import { ParticleSystem } from "./particles.js";
import {
  FRUITS,
  createFruitRagdoll,
  damagePart,
  drawFruitBody,
  tickFruitPlugins,
  applyStandingMuscle,
  detachLimb,
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
} from "./liquids.js";
import { tickElements, onElementCollision, ignite } from "./elements.js";

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
  { id: "pipe", label: "Pipe", icon: "L", color: "#4a9aaa" },
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

const PROPS = [
  { id: "box", label: "Crate", kind: "prop", color: "#8a7355", icon: "■" },
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
];

const WEAPONS = [
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
    this.ropes = [];
    this.ropeAnchor = null;
    this.pipes = [];
    this.pipeAnchor = null;
    this.drag = { body: null, constraint: null, pointerId: null };
    this.pointerWorld = { x: 0, y: 0 };
    this.camera = { x: 0, y: 0, zoom: 1 };
    this.worldSize = { w: 2400, h: 1200 };
    this._last = performance.now();
    this._shake = 0;

    this.engine = Engine.create({
      gravity: { x: 0, y: 1.05 },
      enableSleeping: true,
    });
    this.world = this.engine.world;

    this._buildArena();
    this._bindUI();
    this._bindInput();
    this._resize();
    window.addEventListener("resize", () => this._resize());

    Events.on(this.engine, "collisionStart", (e) => this._onCollisions(e));
    Events.on(this.engine, "beforeUpdate", () => {
      applyStandingMuscle(Composite.allBodies(this.world));
      this._updateDragConstraint();
    });

    this.runner = Runner.create();
    Runner.run(this.runner, this.engine);

    // Welcome melons standing on the ground in view
    createFruitRagdoll(this.world, 1050, this.groundY, "melon");
    createFruitRagdoll(this.world, 1140, this.groundY, "pumpkin");
    this._spawnProp("box", 1280, this.groundY - 28);
    this._spawnProp("plank", 1340, this.groundY - 16);

    window.game = this;
    requestAnimationFrame((t) => this._frame(t));
  }

  _buildArena() {
    const { w, h } = this.worldSize;
    const thick = 80;
    const groundY = h - 100;
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

    // Clinical testing-room ledges (concrete slabs)
    const platOpts = { ...opts, label: "platform" };
    const platforms = [
      Bodies.rectangle(480, groundY - 160, 260, 18, platOpts),
      Bodies.rectangle(1100, groundY - 260, 200, 18, platOpts),
      Bodies.rectangle(1650, groundY - 140, 300, 18, platOpts),
      Bodies.rectangle(900, groundY - 400, 140, 16, platOpts),
      // Vertical wall segment for pinning / crushing setups
      Bodies.rectangle(700, groundY - 80, 18, 140, platOpts),
    ];

    Composite.add(this.world, [this.ground, left, right, ceiling, ...platforms]);
    this.platforms = platforms;
    this.groundY = groundY;
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
      hits.sort(
        (a, b) =>
          Vector.magnitudeSquared(Vector.sub(a.position, { x, y })) -
          Vector.magnitudeSquared(Vector.sub(b.position, { x, y }))
      );
    }
    return hits.filter((b) => {
      if (b.label === "ground" || b.label === "platform") return false;
      if (!b.isStatic) return true;
      return includeFrozen && !!b.plugin?.frozen;
    });
  }

  _startDrag(body, world, pointerId) {
    this._endDrag();
    if (!body || body.isStatic) return;
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
    if (!this.drag.constraint) return;
    this.drag.constraint.pointA.x = this.pointerWorld.x;
    this.drag.constraint.pointA.y = this.pointerWorld.y;
  }

  _endDrag() {
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

    document.getElementById("btn-pause").onclick = () => this.togglePause();
    document.getElementById("btn-clear").onclick = () => this.clearAll();
    document.getElementById("btn-help").onclick = () => this._showHelp(true);
    document.getElementById("help-close").onclick = () => this._showHelp(false);
    this._refreshActive();
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
    if (id !== "rope") this.ropeAnchor = null;
    if (id !== "pipe") this.pipeAnchor = null;
    const labels = {
      drag: "Drag",
      freeze: "Freeze",
      rope: "Rope",
      pipe: "Pipe",
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
    this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());

    this.canvas.addEventListener("pointerdown", (e) => {
      this.canvas.setPointerCapture?.(e.pointerId);
      const world = this._eventToWorld(e);
      this.pointerWorld = world;

      if (e.button === 1 || (e.button === 0 && e.altKey)) {
        this._panning = true;
        this._panLast = { x: e.clientX, y: e.clientY };
        return;
      }
      if (e.button === 2) {
        this._deleteAt(world.x, world.y);
        return;
      }
      if (e.button !== 0) return;

      if (this.tool === "drag") {
        const hits = this._bodiesAt(world.x, world.y, { radius: 18 });
        if (hits[0]) this._startDrag(hits[0], world, e.pointerId);
        return;
      }
      if (this.tool === "spawn" && this.spawnItem) {
        this._spawnAt(this.spawnItem, world.x, world.y);
        return;
      }
      if (this.tool === "freeze") {
        this._freezeAt(world.x, world.y);
        return;
      }
      if (this.tool === "rope") {
        this._ropeAt(world.x, world.y);
        return;
      }
      if (this.tool === "pipe") {
        this._pipeAt(world.x, world.y);
        return;
      }
      if (this.tool === "poke") {
        this._poke(world.x, world.y);
        return;
      }
      if (this.tool === "shoot") {
        this._shoot(world.x, world.y);
        return;
      }
      if (this.tool === "explode") {
        this._explode(world.x, world.y, 0.12);
        return;
      }
      if (this.tool === "delete") {
        this._deleteAt(world.x, world.y);
      }
    });

    this.canvas.addEventListener("pointermove", (e) => {
      const world = this._eventToWorld(e);
      this.pointerWorld = world;

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
      if (e.key === "4") this.setTool("pipe");
      if (e.key === "5") this.setTool("poke");
      if (e.key === "6") this.setTool("shoot");
      if (e.key === "7") this.setTool("explode");
      if (e.key === "8") this.setTool("delete");
      if (e.key === "?" || e.key === "h") this._showHelp(true);
      this._refreshActive();
    });
  }

  _showHelp(show) {
    document.getElementById("help-modal").classList.toggle("hidden", !show);
  }

  togglePause() {
    this.paused = !this.paused;
    if (this.paused) Runner.stop(this.runner);
    else Runner.run(this.runner, this.engine);
    document.getElementById("btn-pause").textContent = this.paused ? "Resume" : "Pause";
  }

  clearAll() {
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
    this.ropes = [];
    this.ropeAnchor = null;
    this.pipes = [];
    this.pipeAnchor = null;
    this.particles.particles = [];
  }

  _resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = this.wrap.getBoundingClientRect();
    this.canvas.width = Math.floor(rect.width * dpr);
    this.canvas.height = Math.floor(rect.height * dpr);
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height}px`;
    this.viewW = rect.width;
    this.viewH = rect.height;
    this.dpr = dpr;
    // Center camera on arena floor mid
    if (this.camera.x === 0 && this.camera.y === 0) {
      this.camera.x = this.worldSize.w / 2 - rect.width / 2;
      this.camera.y = this.groundY - rect.height * 0.65;
    }
  }

  _spawnAt(item, x, y) {
    if (item.kind === "fruit") {
      createFruitRagdoll(this.world, x, y, item.id);
      return;
    }
    if (item.kind === "prop") {
      this._spawnProp(item.id, x, y);
      return;
    }
    if (item.kind === "machine") {
      this._spawnMachine(item.id, x, y);
      return;
    }
    if (item.kind === "weapon") {
      this._spawnWeapon(item.id, x, y);
      return;
    }
    if (item.kind === "syringe") {
      this._spawnSyringe(item.id, x, y);
      return;
    }
    if (item.kind === "element") {
      this._spawnElement(item.id, x, y);
    }
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
    const hits = this._bodiesAt(x, y, { includeFrozen: true, radius: 18 });
    if (!hits.length) {
      this.ropeAnchor = null;
      return;
    }
    const body = hits[0];
    if (!this.ropeAnchor) {
      this.ropeAnchor = body;
      this.particles.burst(body.position.x, body.position.y, "#c4a574", 6, 2);
      this.hudTool.textContent = "Tool: Rope (pick 2nd)";
      return;
    }
    if (this.ropeAnchor === body) {
      this.ropeAnchor = null;
      return;
    }
    const rope = Constraint.create({
      bodyA: this.ropeAnchor,
      bodyB: body,
      stiffness: 0.4,
      damping: 0.05,
      length: Math.max(
        40,
        Vector.magnitude(Vector.sub(this.ropeAnchor.position, body.position))
      ),
      render: { visible: false },
    });
    rope.plugin = { draw: "rope" };
    Composite.add(this.world, rope);
    this.ropes.push(rope);
    this.ropeAnchor = null;
    this.hudTool.textContent = "Tool: Rope";
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
      this.machines.push(body);
    } else if (id === "spinner") {
      body = Bodies.rectangle(x, y, 70, 12, { ...base, label: "mach-spinner", density: 0.008 });
      body.plugin = { draw: "spinner", spin: 0.22 };
      this.machines.push(body);
    } else if (id === "piston") {
      body = Bodies.rectangle(x, y, 24, 50, { ...base, label: "mach-piston", density: 0.01 });
      body.plugin = { draw: "piston", pistonT: 0, pistonForce: 0.04 };
      this.machines.push(body);
    } else if (id === "mine") {
      body = Bodies.circle(x, y, 14, { ...base, label: "mach-mine", density: 0.005 });
      body.plugin = { draw: "mine", armed: true, triggerSpeed: 4 };
      this.machines.push(body);
    } else if (id === "coil") {
      body = Bodies.rectangle(x, y, 28, 48, { ...base, label: "mach-coil", density: 0.007 });
      body.plugin = { draw: "coil", coil: true, conductive: true };
      this.machines.push(body);
    } else if (id === "sprinkler") {
      body = Bodies.rectangle(x, y, 28, 24, { ...base, label: "mach-sprinkler", density: 0.004 });
      body.plugin = { draw: "sprinkler", sprinkler: true };
      this.machines.push(body);
    } else if (id === "fan") {
      body = Bodies.rectangle(x, y, 50, 18, { ...base, label: "mach-fan", density: 0.005 });
      body.plugin = { draw: "fan", fan: 0.012 };
      this.machines.push(body);
    } else if (id === "heater") {
      body = Bodies.rectangle(x, y, 40, 28, { ...base, label: "mach-heater", density: 0.008 });
      body.plugin = { draw: "heater", alwaysHot: true, heater: true };
      this.machines.push(body);
    } else if (id === "conveyor") {
      body = Bodies.rectangle(x, y, 140, 14, { ...base, label: "mach-conveyor", density: 0.01 });
      body.plugin = { draw: "conveyor", conveyor: 2.8 };
      this.machines.push(body);
    }
    if (body) Composite.add(this.world, body);
    return body;
  }

  _spawnWeapon(id, x, y) {
    let body;
    const base = { friction: 0.3, restitution: 0.1, render: { visible: false } };
    if (id === "sword") {
      body = Bodies.rectangle(x, y, 12, 70, { ...base, label: "weapon-sword", density: 0.006 });
      body.plugin = { draw: "sword", sharp: true, damage: 18 };
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
      body.plugin = { draw: "bomb", fuse: 2.2, armed: true };
      this.bombs.push(body);
    } else if (id === "rocket") {
      body = Bodies.rectangle(x, y, 18, 40, { ...base, label: "weapon-rocket", density: 0.003 });
      body.plugin = { draw: "rocket", thrust: true, life: 3 };
      Body.setVelocity(body, { x: (Math.random() - 0.5) * 2, y: -8 });
      this.projectiles.push(body);
    } else if (id === "spike") {
      body = Bodies.rectangle(x, y, 20, 40, { ...base, label: "weapon-spike", density: 0.008, isStatic: false });
      body.plugin = { draw: "spike", sharp: true, damage: 22 };
    } else if (id === "saw") {
      body = Bodies.circle(x, y, 26, { ...base, label: "weapon-saw", density: 0.01, friction: 0.05 });
      body.plugin = { draw: "saw", sharp: true, damage: 30, spin: 0.35 };
      this.machines.push(body);
    } else if (id === "axe") {
      body = Bodies.rectangle(x, y, 16, 56, { ...base, label: "weapon-axe", density: 0.007 });
      body.plugin = { draw: "axe", sharp: true, damage: 24 };
    } else if (id === "baton") {
      body = Bodies.rectangle(x, y, 10, 56, { ...base, label: "weapon-baton", density: 0.004 });
      body.plugin = { draw: "baton", shockOnHit: true, damage: 8, conductive: true };
    } else if (id === "flamethrower") {
      body = Bodies.rectangle(x, y, 18, 50, { ...base, label: "weapon-flamer", density: 0.005 });
      body.plugin = { draw: "flamethrower", flamethrower: true };
      this.machines.push(body);
    } else if (id === "firebomb") {
      body = Bodies.circle(x, y, 14, { ...base, label: "weapon-firebomb", density: 0.0035 });
      body.plugin = { draw: "firebomb", fuse: 1.8, armed: true, fireBurst: true };
      this.bombs.push(body);
    } else if (id === "shotgun") {
      body = Bodies.rectangle(x, y, 14, 48, { ...base, label: "weapon-shotgun", density: 0.005 });
      body.plugin = { draw: "shotgun", shotgun: true, damage: 12 };
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
    bullet.plugin = { draw: "bullet", damage: 35, life: 2.5 };
    Body.setVelocity(bullet, { x: dir.x * 28, y: dir.y * 28 });
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

      const fruit = bodyA.plugin?.fruit ? bodyA : bodyB.plugin?.fruit ? bodyB : null;
      const other = fruit === bodyA ? bodyB : bodyA;

      if (fruit && speed > 6) {
        const dmg = Math.min(55, (speed - 5) * 4.2);
        const result = damagePart(fruit, dmg, this.particles, pair.collision.supports[0]);
        if (result === "burst") this._shake = Math.min(10, this._shake + 4);
        if (speed > 12 && fruit.plugin.part !== "torso" && fruit.plugin.part !== "head") {
          if (detachLimb(this.world, fruit)) {
            this.particles.burst(fruit.position.x, fruit.position.y, fruit.plugin.fruit.juice, 14, 6);
          }
        }
      }

      // Sharp weapons / bullets
      const weapon = [bodyA, bodyB].find((b) => b.plugin?.damage || b.plugin?.sharp);
      const target = weapon === bodyA ? bodyB : bodyA;
      if (weapon && target.plugin?.fruit && speed > 3) {
        damagePart(target, weapon.plugin.damage || 15, this.particles, pair.collision.supports[0]);
        if ((weapon.plugin.sharp || speed > 10) && target.plugin.part !== "torso") {
          detachLimb(this.world, target);
        }
      }

      if ((bodyA.label === "bullet" || bodyB.label === "bullet") && fruit) {
        const bullet = bodyA.label === "bullet" ? bodyA : bodyB;
        damagePart(fruit, bullet.plugin?.damage || 30, this.particles, fruit.position);
        if (fruit.plugin.part !== "torso") detachLimb(this.world, fruit);
        Composite.remove(this.world, bullet);
        this.projectiles = this.projectiles.filter((p) => p !== bullet);
      }

      // Syringe contact: inject serum OR transfer juice into living
      const syringe = [bodyA, bodyB].find((b) => b.plugin?.draw === "syringe");
      const patient = syringe === bodyA ? bodyB : bodyA;
      if (syringe && patient.plugin?.fruit) {
        ensureSyringeVessel(syringe);
        const v = syringe.plugin.liquid;
        const hasFluid = v && v.amount > 1;
        if (hasFluid && v.type === "juice") {
          // Stab with juice-filled syringe → dump juice into the living
          const dest = getOrCreateVessel(patient) || patient.plugin.liquid;
          if (dest) {
            const moved = transferLiquid(v, dest, v.amount, this.particles, syringe.position, patient.position, {
              force: true,
            });
            if (moved > 0) {
              syncSyringeFromVessel(syringe);
              this.particles.burst(patient.position.x, patient.position.y, dest.color, 10, 3);
            }
          }
        } else if (hasFluid && !syringe.plugin.used && v.type === syringe.plugin.syringe) {
          if (injectSyringe(this.world, patient, syringe.plugin.syringe, this.particles)) {
            syringe.plugin.used = true;
            drainSyringeVessel(syringe);
            syncSyringeFromVessel(syringe);
            Body.setVelocity(syringe, {
              x: (syringe.position.x - patient.position.x) * 0.15,
              y: -2,
            });
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
            bullet.plugin = { draw: "bullet", damage: 18, life: 0.8 };
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

  _tickGameplay(dt) {
    const bodies = Composite.allBodies(this.world);
    tickFruitPlugins(bodies, dt);
    tickSyringeEffects(this.world, bodies, dt, this.particles);
    tickLiquids(this.world, dt, this.particles);
    tickPipes(this.pipes, this.world, dt, this.particles);
    tickElements(this.world, dt, this.particles, (x, y, p) => this._explode(x, y, p));

    // Bombs
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const b = this.bombs[i];
      if (!b.plugin || b.plugin.fuse == null) {
        this.bombs.splice(i, 1);
        continue;
      }
      if (!Composite.allBodies(this.world).includes(b)) {
        this.bombs.splice(i, 1);
        continue;
      }
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

    // Rockets & bullets lifetime
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      if (!Composite.allBodies(this.world).includes(p)) {
        this.projectiles.splice(i, 1);
        continue;
      }
      if (p.plugin?.thrust) {
        const a = p.angle - Math.PI / 2;
        Body.applyForce(p, p.position, { x: Math.cos(a) * 0.012, y: Math.sin(a) * 0.012 });
        this.particles.drip(p.position.x, p.position.y, "#ffaa60", 2);
      }
      if (p.plugin?.life != null) {
        p.plugin.life -= dt;
        if (p.plugin.life <= 0) {
          if (p.plugin.thrust) this._explode(p.position.x, p.position.y, 0.1);
          Composite.remove(this.world, p);
          this.projectiles.splice(i, 1);
        }
      }
    }

    // Machines: thrusters, spinners, pistons, mines, saws
    for (let i = this.machines.length - 1; i >= 0; i--) {
      const m = this.machines[i];
      if (!Composite.allBodies(this.world).includes(m) || !m.plugin) {
        this.machines.splice(i, 1);
        continue;
      }
      if (m.isStatic && m.plugin.draw !== "mine") continue;
      if (m.plugin.thrust) {
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
      if (m.plugin.spin) {
        Body.setAngularVelocity(m, m.plugin.spin);
      }
      if (m.plugin.pistonForce != null) {
        m.plugin.pistonT = (m.plugin.pistonT || 0) + dt;
        const pulse = Math.sin(m.plugin.pistonT * 6);
        Body.applyForce(m, m.position, { x: 0, y: pulse * m.plugin.pistonForce });
      }
      if (m.plugin.lift) {
        Body.applyForce(m, m.position, { x: 0, y: -m.plugin.lift });
      }
      if (m.plugin.fan) {
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
            const f = m.plugin.fan * (1 - dist / 120);
            Body.applyForce(other, other.position, { x: Math.cos(a) * f, y: Math.sin(a) * f });
          }
        }
      }
      if (m.plugin.conveyor) {
        // Push bodies resting on top along local +X
        for (const other of Composite.allBodies(this.world)) {
          if (other === m || other.isStatic) continue;
          if (
            other.position.y < m.position.y &&
            other.position.y > m.position.y - 28 &&
            Math.abs(other.position.x - m.position.x) < 75
          ) {
            Body.setVelocity(other, {
              x: m.plugin.conveyor * Math.cos(m.angle),
              y: other.velocity.y,
            });
          }
        }
      }
      if (m.plugin.heater) {
        for (const other of Composite.allBodies(this.world)) {
          if (other === m || other.isStatic) continue;
          const dist = Math.hypot(other.position.x - m.position.x, other.position.y - m.position.y);
          if (dist < 70 && Math.random() < 0.08) ignite(other, 0.8, 3);
        }
        if (Math.random() < 0.3) this.particles.flame(m.position.x, m.position.y - 10, 2);
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
  }

  _frame(now) {
    const dt = Math.min(0.05, (now - this._last) / 1000);
    this._last = now;
    if (!this.paused) this._tickGameplay(dt);
    this._draw();
    requestAnimationFrame((t) => this._frame(t));
  }

  _draw() {
    const ctx = this.canvas.getContext("2d");
    const { width, height } = this.canvas;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);

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
      if (b.plugin?.fruit) drawFruitBody(ctx, b);
    }

    this.particles.draw(ctx);

    // Ropes & pipes
    for (const r of Composite.allConstraints(this.world)) {
      if (!r.bodyA || !r.bodyB) continue;
      const ax = r.bodyA.position.x + (r.pointA?.x || 0);
      const ay = r.bodyA.position.y + (r.pointA?.y || 0);
      const bx = r.bodyB.position.x + (r.pointB?.x || 0);
      const by = r.bodyB.position.y + (r.pointB?.y || 0);
      if (r.plugin?.draw === "rope") {
        ctx.strokeStyle = "#8a7348";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();
      } else if (r.plugin?.draw === "pipe") {
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
        // Flow chevron mid-pipe
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
      ctx.strokeStyle = "rgba(196,165,116,0.6)";
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(this.ropeAnchor.position.x, this.ropeAnchor.position.y);
      ctx.lineTo(this.pointerWorld.x, this.pointerWorld.y);
      ctx.stroke();
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
    const { w, h } = this.worldSize;
    // Clinical gray testing room
    ctx.fillStyle = "#5a5e64";
    ctx.fillRect(-100, -100, w + 200, h + 200);

    // Wall panels
    ctx.fillStyle = "#50545a";
    for (let x = 0; x < w; x += 120) {
      ctx.fillRect(x, 0, 2, this.groundY);
    }
    for (let y = 0; y < this.groundY; y += 120) {
      ctx.fillRect(0, y, w, 2);
    }

    // Floor grid
    ctx.strokeStyle = "rgba(0,0,0,0.12)";
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.groundY);
      ctx.stroke();
    }
    for (let y = 0; y < this.groundY; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
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

  _drawTerrain(ctx) {
    const gy = this.groundY;
    const { w } = this.worldSize;

    // Concrete floor
    ctx.fillStyle = "#3a3e44";
    ctx.fillRect(-50, gy, w + 100, 220);
    ctx.fillStyle = "#4a4e54";
    ctx.fillRect(-50, gy - 6, w + 100, 10);
    ctx.fillStyle = "#2e3238";
    for (let x = 0; x < w; x += 80) {
      ctx.fillRect(x, gy + 4, 40, 3);
    }

    for (const p of this.platforms) {
      const { x, y } = p.position;
      const bw = p.bounds.max.x - p.bounds.min.x;
      const bh = p.bounds.max.y - p.bounds.min.y;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(p.angle);
      ctx.fillStyle = "#6a6e74";
      ctx.fillRect(-bw / 2, -bh / 2, bw, bh);
      ctx.fillStyle = "#7a8088";
      ctx.fillRect(-bw / 2, -bh / 2, bw, 3);
      ctx.strokeStyle = "#2a2e32";
      ctx.lineWidth = 1;
      ctx.strokeRect(-bw / 2, -bh / 2, bw, bh);
      ctx.restore();
    }
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
      const blink = pl.fuse < 0.8 && Math.floor(pl.fuse * 10) % 2 === 0;
      ctx.fillStyle = blink ? "#a03020" : "#2a2a2a";
      ctx.beginPath();
      ctx.arc(0, 0, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#f0c14a";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -16);
      ctx.quadraticCurveTo(8, -28, 4, -34);
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

    ctx.restore();
  }
}

new Game();
