/** Melon-style object context menu (right-click / long-press). */

export class ContextMenu {
  constructor({ onAction }) {
    this.onAction = onAction;
    this.body = null;
    this.el = document.createElement("div");
    this.el.id = "context-menu";
    this.el.className = "context-menu hidden";
    this.el.setAttribute("role", "menu");
    document.body.appendChild(this.el);

    this.el.addEventListener("pointerdown", (e) => e.stopPropagation());
    // Dismiss on outside click — skip right-button so open isn't instantly closed
    document.addEventListener("pointerdown", (e) => {
      if (e.button === 2) return;
      if (this.el.classList.contains("hidden")) return;
      if (!this.el.contains(e.target)) this.hide();
    });
  }

  hide() {
    this.el.classList.add("hidden");
    this.el.innerHTML = "";
    this.body = null;
  }

  show(clientX, clientY, body, items) {
    this.body = body;
    this.el.innerHTML = "";
    const title = document.createElement("div");
    title.className = "context-title";
    title.textContent = labelFor(body);
    this.el.appendChild(title);

    for (const item of items) {
      if (item.sep) {
        const hr = document.createElement("div");
        hr.className = "context-sep";
        this.el.appendChild(hr);
        continue;
      }
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "context-item" + (item.danger ? " danger" : "");
      btn.textContent = item.label;
      btn.disabled = !!item.disabled;
      btn.onclick = () => {
        const b = this.body;
        this.hide();
        this.onAction(item.id, b);
      };
      this.el.appendChild(btn);
    }

    this.el.classList.remove("hidden");
    const pad = 8;
    const rect = this.el.getBoundingClientRect();
    let x = clientX;
    let y = clientY;
    if (x + rect.width > window.innerWidth - pad) x = window.innerWidth - rect.width - pad;
    if (y + rect.height > window.innerHeight - pad) y = window.innerHeight - rect.height - pad;
    this.el.style.left = `${Math.max(pad, x)}px`;
    this.el.style.top = `${Math.max(pad, y)}px`;
  }
}

function labelFor(body) {
  const pl = body?.plugin;
  if (!pl) return "Object";
  if (pl.fruit) {
    const name = pl.fruitKey || "Living";
    const part = pl.part || "";
    const ai = pl.ai?.mode && pl.ai.mode !== "idle" ? ` · ${pl.ai.mode}` : "";
    return `${capitalize(name)} · ${part}${ai}`;
  }
  if (pl.syringe) return `Syringe · ${pl.syringe}`;
  if (pl.draw) return capitalize(pl.draw);
  return body.label || "Object";
}

function capitalize(s) {
  return String(s).charAt(0).toUpperCase() + String(s).slice(1);
}

export function buildMenuItems(body, { isActivatable, isActive, livingHolds = false } = {}) {
  const pl = body.plugin || {};
  const items = [];

  if (isActivatable(body)) {
    items.push({
      id: "activate",
      label: isActive(body) ? "Deactivate" : "Activate",
    });
  }

  items.push({
    id: "freeze",
    label: pl.frozen || body.isStatic ? "Unfreeze" : "Freeze",
  });

  if (pl.fruit) {
    const mode = pl.ai?.mode || "idle";
    const mark = (id) => (mode === id ? "✓ " : "");
    items.push({ sep: true });
    items.push({ id: "ai-idle", label: `${mark("idle")}Stop / Idle` });
    items.push({ id: "ai-walk", label: `${mark("walk")}Walk` });
    items.push({ id: "ai-fight", label: `${mark("fight")}Fight` });
    items.push({ id: "ai-flee", label: `${mark("flee")}Flee` });
    items.push({ id: "ai-follow", label: `${mark("follow")}Follow` });
    items.push({ sep: true });
    items.push({ id: "kill", label: "Kill", danger: true });
    if (pl.part !== "torso" && pl.part !== "head") {
      items.push({ id: "detach", label: "Detach limb" });
    }
    if (pl.holding || pl.hat || pl.vest || pl.helmet || pl.cloak || livingHolds) {
      items.push({ id: "drop", label: "Drop / unequip" });
    }
  }

  if (pl.heldBy || pl.heldHand) {
    items.push({ id: "drop", label: "Drop" });
  }

  if (pl.clothing) {
    items.push({ id: "equip", label: "Equip nearby living" });
  }

  items.push({ sep: true });
  items.push({ id: "delete", label: "Delete", danger: true });
  return items;
}
