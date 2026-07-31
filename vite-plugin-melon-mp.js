/** Vite plugin — LAN multiplayer WebSocket on the same HTTP server. */
import { WebSocketServer } from "ws";

const COLORS = [
  "#ff5c5c",
  "#4ecdc4",
  "#ffe66d",
  "#a78bfa",
  "#45b7d1",
  "#f9a826",
  "#7bed9f",
  "#ff9ff3",
];

export function melonMultiplayer() {
  return {
    name: "melon-multiplayer",
    configureServer(server) {
      // Attach after HTTP server exists / is listening
      const attach = () => attachMelonMp(server.httpServer);
      if (server.httpServer?.listening) attach();
      else server.httpServer?.once("listening", attach);
      // Also try immediately — Vite usually has httpServer already
      attach();
    },
    configurePreviewServer(server) {
      const attach = () => attachMelonMp(server.httpServer);
      if (server.httpServer?.listening) attach();
      else server.httpServer?.once("listening", attach);
      attach();
    },
  };
}

function attachMelonMp(httpServer) {
  if (!httpServer) return;
  if (httpServer.__melonMpAttached) return;
  httpServer.__melonMpAttached = true;

  const wss = new WebSocketServer({ noServer: true });
  /** @type {Map<string, { ws: import('ws').WebSocket, id: string, color: string, name: string, isHost: boolean, lastPong: number }>} */
  const peers = new Map();
  let nextId = 1;
  let hostId = null;

  function alive(peer) {
    return peer && peer.ws && peer.ws.readyState === 1;
  }

  function ensureLiveHost() {
    if (hostId && peers.has(hostId) && alive(peers.get(hostId))) return hostId;
    // Pick first live peer
    hostId = null;
    for (const p of peers.values()) {
      if (alive(p)) {
        hostId = p.id;
        p.isHost = true;
        break;
      }
    }
    for (const p of peers.values()) {
      p.isHost = p.id === hostId;
    }
    return hostId;
  }

  httpServer.on("upgrade", (req, socket, head) => {
    try {
      const url = req.url || "";
      const path = url.split("?")[0];
      if (path !== "/mp" && path !== "/mp/") return;

      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    } catch (err) {
      console.error("[melon-mp] upgrade error", err);
      try {
        socket.destroy();
      } catch (_) {}
    }
  });

  function broadcast(msg, exceptId = null) {
    const raw = JSON.stringify(msg);
    for (const p of peers.values()) {
      if (p.id === exceptId) continue;
      if (alive(p)) p.ws.send(raw);
    }
  }

  function send(peer, msg) {
    if (alive(peer)) peer.ws.send(JSON.stringify(msg));
  }

  function roster() {
    ensureLiveHost();
    return [...peers.values()]
      .filter((p) => alive(p))
      .map((p) => ({
        id: p.id,
        color: p.color,
        name: p.name,
        isHost: p.id === hostId,
      }));
  }

  function sendRoster() {
    broadcast({ type: "roster", peers: roster(), hostId });
  }

  // Drop half-open sockets
  const heartbeat = setInterval(() => {
    const now = Date.now();
    for (const [id, p] of peers) {
      if (!alive(p)) {
        peers.delete(id);
        continue;
      }
      if (now - (p.lastPong || now) > 25000) {
        try {
          p.ws.terminate();
        } catch (_) {}
        peers.delete(id);
        continue;
      }
      try {
        p.ws.ping();
      } catch (_) {}
    }
    if (hostId && !peers.has(hostId)) {
      ensureLiveHost();
      if (hostId) broadcast({ type: "host-changed", hostId });
      sendRoster();
    }
  }, 8000);
  heartbeat.unref?.();

  wss.on("connection", (ws) => {
    ensureLiveHost();
    const id = String(nextId++);
    const color = COLORS[(Number(id) - 1) % COLORS.length];
    const isHost = hostId == null;
    if (isHost) hostId = id;

    const peer = {
      ws,
      id,
      color,
      name: `Player ${id}`,
      isHost,
      lastPong: Date.now(),
    };
    peers.set(id, peer);

    ws.on("pong", () => {
      peer.lastPong = Date.now();
    });

    console.log(`[melon-mp] join ${id} host=${hostId} peers=${peers.size}`);

    send(peer, {
      type: "welcome",
      id,
      color,
      isHost: id === hostId,
      hostId,
      peers: roster(),
    });
    broadcast(
      { type: "peer-join", peer: { id, color, name: peer.name, isHost: id === hostId } },
      id
    );
    sendRoster();

    // Ask live host for a full scene dump for the new peer
    if (id !== hostId) {
      const host = hostId && peers.get(hostId);
      if (alive(host)) send(host, { type: "need-full", forId: id });
    }

    ws.on("message", (buf) => {
      peer.lastPong = Date.now();
      let msg;
      try {
        msg = JSON.parse(String(buf));
      } catch {
        return;
      }
      if (!msg || typeof msg !== "object") return;

      if (msg.type === "name") {
        peer.name = String(msg.name || peer.name).slice(0, 24);
        sendRoster();
        return;
      }

      if (msg.type === "pong-client") {
        peer.lastPong = Date.now();
        return;
      }

      // Any peer can request a full dump from host
      if (msg.type === "need-full") {
        ensureLiveHost();
        const host = hostId && peers.get(hostId);
        if (alive(host)) send(host, { type: "need-full", forId: msg.forId || id });
        return;
      }

      // Host-only: full scene / snapshots
      if (msg.type === "full" || msg.type === "snap") {
        ensureLiveHost();
        if (id !== hostId) return;
        if (msg.type === "full" && msg.forId) {
          const target = peers.get(String(msg.forId));
          if (alive(target)) send(target, { type: "full", data: msg.data });
          else broadcast({ type: "full", data: msg.data }, id);
        } else {
          broadcast(msg, id);
        }
        return;
      }

      // Peers → host (actions, select, drag)
      if (msg.type === "act" || msg.type === "select" || msg.type === "drag" || msg.type === "ping") {
        msg.from = id;
        msg.color = peer.color;
        ensureLiveHost();
        const host = hostId && peers.get(hostId);
        if (!alive(host)) return;

        if (id === hostId) {
          if (msg.type === "select" || msg.type === "drag") broadcast(msg, id);
        } else {
          send(host, msg);
          if (msg.type === "select" || msg.type === "drag") broadcast(msg, id);
        }
        return;
      }
    });

    ws.on("close", () => {
      peers.delete(id);
      console.log(`[melon-mp] leave ${id} remaining=${peers.size}`);
      const wasHost = hostId === id;
      if (wasHost) {
        hostId = null;
        ensureLiveHost();
        if (hostId) broadcast({ type: "host-changed", hostId });
      }
      broadcast({ type: "peer-leave", id });
      sendRoster();
    });

    ws.on("error", (err) => {
      console.error("[melon-mp] socket error", id, err.message);
    });
  });
}

export default melonMultiplayer;
