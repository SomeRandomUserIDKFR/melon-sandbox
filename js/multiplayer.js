/** LAN multiplayer client — host runs physics, peers sync + glow selections. */

export const MP_COLORS = [
  "#ff5c5c",
  "#4ecdc4",
  "#ffe66d",
  "#a78bfa",
  "#45b7d1",
  "#f9a826",
  "#7bed9f",
  "#ff9ff3",
];

let netSeq = 1;

export function nextNetId() {
  return `n${netSeq++}`;
}

export function getNetSeq() {
  return netSeq;
}

export function setNetSeq(n) {
  if (typeof n === "number" && n > netSeq) netSeq = n;
}

export function ensureNetId(body) {
  if (!body) return null;
  if (!body.plugin) body.plugin = {};
  if (!body.plugin.netId) body.plugin.netId = nextNetId();
  return body.plugin.netId;
}

export function stampNetIds(bodies) {
  for (const b of bodies) ensureNetId(b);
}

export class MultiplayerClient {
  constructor(game) {
    this.game = game;
    this.ws = null;
    this.id = null;
    this.color = "#9ad06a";
    this.isHost = false;
    this.hostId = null;
    this.peers = [];
    this.connected = false;
    this.selections = new Map();
    this.remoteDrags = new Map();
    this._snapAcc = 0;
    this._enabled = false;
    this.onStatus = null;
    this._wantConnect = false;
  }

  get enabled() {
    return this._enabled && this.connected && !!this.id;
  }

  connect() {
    this._wantConnect = true;
    this._enabled = true;

    // Tear down any half-open socket so Join always retries
    if (this.ws) {
      try {
        this.ws.onopen = null;
        this.ws.onclose = null;
        this.ws.onerror = null;
        this.ws.onmessage = null;
        this.ws.close();
      } catch (_) {}
      this.ws = null;
    }

    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${proto}//${location.host}/mp`;
    this._status(`Connecting to ${url}…`);

    let ws;
    try {
      ws = new WebSocket(url);
    } catch (err) {
      this._status(`Failed: ${err.message || err}`);
      this.connected = false;
      this._refreshUi();
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      this.connected = true;
      this._status("Connected — waiting for room…");
      this._refreshUi();
    };

    ws.onclose = () => {
      const wanted = this._wantConnect;
      this.connected = false;
      this.ws = null;
      this.isHost = false;
      this.id = null;
      this._status(wanted ? "Disconnected — click MP to retry" : "Offline");
      this._refreshUi();
    };

    ws.onerror = () => {
      this._status("Connection error — is the Vite server running?");
      this._refreshUi();
    };

    ws.onmessage = (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      this._onMessage(msg);
    };
  }

  disconnect() {
    this._wantConnect = false;
    this._enabled = false;
    if (this.ws) {
      try {
        this.ws.close();
      } catch (_) {}
      this.ws = null;
    }
    this.connected = false;
    this.id = null;
    this.isHost = false;
    this.selections.clear();
    this.remoteDrags.clear();
    this._status("Offline");
    this._refreshUi();
  }

  toggle() {
    if (this.connected || (this.ws && this.ws.readyState === 0)) this.disconnect();
    else this.connect();
  }

  send(msg) {
    if (!this.ws || this.ws.readyState !== 1) return;
    this.ws.send(JSON.stringify(msg));
  }

  setLocalSelection(netId) {
    if (!this.enabled) return;
    this.selections.set(this.id, netId || null);
    this.send({ type: "select", netId: netId || null });
  }

  sendAction(act) {
    if (!this.enabled || this.isHost) return;
    this.send({ type: "act", ...act });
  }

  sendDrag(phase, payload) {
    if (!this.enabled) return;
    this.send({ type: "drag", phase, ...payload });
  }

  _onMessage(msg) {
    const g = this.game;
    switch (msg.type) {
      case "welcome":
        this.id = msg.id;
        this.color = msg.color;
        this.isHost = !!msg.isHost;
        this.hostId = msg.hostId;
        this.peers = msg.peers || [];
        this.connected = true;
        this._applyHostMode();
        this._status(
          this.isHost
            ? `Host · share ${location.origin}`
            : `Guest · synced to host`
        );
        this._refreshUi();
        // Guests: ask again in case need-full was missed
        if (!this.isHost) {
          setTimeout(() => this.send({ type: "need-full" }), 200);
        }
        break;

      case "roster":
        this.peers = msg.peers || [];
        this.hostId = msg.hostId;
        this.isHost = this.id === this.hostId;
        this._applyHostMode();
        this._refreshUi();
        break;

      case "host-changed":
        this.hostId = msg.hostId;
        this.isHost = this.id === this.hostId;
        this._applyHostMode();
        this._status(this.isHost ? "You are now host" : "New host elected");
        this._refreshUi();
        if (this.isHost) {
          // Push scene to everyone
          try {
            this.send({ type: "full", data: g._mpSerialize() });
          } catch (err) {
            console.error(err);
          }
        } else {
          this.send({ type: "need-full" });
        }
        break;

      case "peer-leave":
        this.selections.delete(msg.id);
        this.remoteDrags.delete(msg.id);
        break;

      case "need-full":
        if (this.isHost) {
          try {
            const data = g._mpSerialize();
            this.send({ type: "full", forId: msg.forId, data });
          } catch (err) {
            console.error("MP serialize failed", err);
            this._status("Host sync error — see console");
          }
        }
        break;

      case "full":
        if (!this.isHost && msg.data) {
          try {
            g._mpApplyFull(msg.data);
            this._status("Guest · scene synced");
          } catch (err) {
            console.error("MP apply full failed", err);
            this._status("Sync failed — see console");
          }
        }
        break;

      case "snap":
        if (!this.isHost && msg.bodies) {
          g._mpApplySnap(msg);
        }
        if (msg.sels) {
          for (const [pid, nid] of Object.entries(msg.sels)) {
            this.selections.set(pid, nid);
          }
        }
        break;

      case "select":
        if (msg.from) this.selections.set(msg.from, msg.netId || null);
        break;

      case "act":
        if (this.isHost) g._mpHandleAction(msg);
        break;

      case "drag":
        if (msg.from && msg.from !== this.id) {
          if (msg.phase === "end") this.remoteDrags.delete(msg.from);
          else
            this.remoteDrags.set(msg.from, {
              netId: msg.netId,
              x: msg.x,
              y: msg.y,
              color: msg.color,
            });
        }
        if (this.isHost && msg.from !== this.id) {
          g._mpHandleRemoteDrag(msg);
        }
        if (msg.phase !== "end" && msg.from) {
          this.selections.set(msg.from, msg.netId || null);
        }
        break;

      default:
        break;
    }
  }

  _applyHostMode() {
    const g = this.game;
    if (!g?.runner) return;
    try {
      if (this.isHost) {
        if (!g.paused) Matter.Runner.run(g.runner, g.engine);
      } else {
        Matter.Runner.stop(g.runner);
      }
    } catch (_) {}
  }

  tick(dt) {
    if (!this.enabled || !this.isHost) return;
    this._snapAcc += dt;
    if (this._snapAcc < 0.08) return;
    this._snapAcc = 0;
    try {
      const snap = this.game._mpBuildSnap();
      this.send({ type: "snap", ...snap });
    } catch (err) {
      console.error("MP snap failed", err);
    }
  }

  _status(text) {
    if (typeof this.onStatus === "function") this.onStatus(text);
    const el = document.getElementById("mp-status");
    if (el) el.textContent = text;
  }

  _refreshUi() {
    const btn = document.getElementById("btn-mp");
    const panel = document.getElementById("mp-panel");
    const swatch = document.getElementById("mp-swatch");
    const list = document.getElementById("mp-peers");
    if (swatch) {
      swatch.style.background = this.color || "#888";
      swatch.style.boxShadow = `0 0 10px ${this.color || "#888"}`;
    }
    if (btn) {
      const on = this.connected && !!this.id;
      btn.classList.toggle("active", on);
      btn.title = on ? "Leave multiplayer" : "Join LAN multiplayer";
      btn.textContent = on ? (this.isHost ? "MP Host" : "MP On") : "MP Join";
    }
    if (list) {
      list.innerHTML = "";
      for (const p of this.peers) {
        const li = document.createElement("li");
        li.innerHTML = `<span class="mp-dot" style="background:${p.color}"></span>${escapeHtml(
          p.name
        )}${p.isHost ? " (host)" : ""}${p.id === this.id ? " · you" : ""}`;
        list.appendChild(li);
      }
    }
    if (panel) {
      // Show panel while connecting or connected
      const show = this._wantConnect || this.connected;
      panel.classList.toggle("hidden", !show);
    }
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Draw selection rings for every peer's selected object. */
export function drawMultiplayerGlows(ctx, game) {
  const mp = game.mp;
  if (!mp?.enabled) return;
  const bodies = Matter.Composite.allBodies(game.world);
  const byNet = new Map();
  for (const b of bodies) {
    if (b.plugin?.netId) byNet.set(b.plugin.netId, b);
  }

  for (const [peerId, netId] of mp.selections) {
    if (!netId) continue;
    const body = byNet.get(netId);
    if (!body) continue;
    const peer = mp.peers.find((p) => p.id === peerId);
    const color = peer?.color || (peerId === mp.id ? mp.color : "#fff");
    const { x, y } = body.position;
    const rw = (body.bounds.max.x - body.bounds.min.x) * 0.55 + 10;
    const rh = (body.bounds.max.y - body.bounds.min.y) * 0.55 + 10;
    const r = Math.max(rw, rh);

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(body.angle);
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 3;
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  }

  for (const [peerId, d] of mp.remoteDrags) {
    if (peerId === mp.id) continue;
    const peer = mp.peers.find((p) => p.id === peerId);
    const color = d.color || peer?.color || "#fff";
    ctx.save();
    ctx.fillStyle = color;
    ctx.strokeStyle = "#111";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(d.x, d.y);
    ctx.lineTo(d.x + 10, d.y + 14);
    ctx.lineTo(d.x + 4, d.y + 14);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}
