/** Tiny pixel-art sprites (nearest-neighbor) for Melon Sandbox look. */

/** @type {Record<string, { w: number, h: number, pixels: string[] }>} */
const SPRITES = {
  melonHead: {
    w: 12,
    h: 12,
    pixels: [
      "..222222....",
      ".221111122..",
      "22111111122.",
      "21113111112.",
      "21111111112.",
      "21114111112.",
      "21111111112.",
      "21111111112.",
      "22111111122.",
      ".221111122..",
      "..222222....",
      "............",
    ],
  },
  crate: {
    w: 10,
    h: 10,
    pixels: [
      "3333333333",
      "3AAAAAAA43",
      "3A4AAAA4A3",
      "3AA4AA4AA3",
      "3AAA44AAA3",
      "3AA4AA4AA3",
      "3A4AAAA4A3",
      "3AAAAAAA43",
      "3444444443",
      "3333333333",
    ],
  },
  barrel: {
    w: 8,
    h: 10,
    pixels: [
      ".666666.",
      "66888866",
      "68888886",
      "66888866",
      "68888886",
      "66888866",
      "68888886",
      "66888866",
      "68888886",
      ".666666.",
    ],
  },
};

const PALETTE = {
  ".": null,
  "1": "#6fbf4a",
  "2": "#3d8a2e",
  "3": "#5a4030",
  "4": "#8a6a40",
  A: "#a07848",
  "6": "#4a4018",
  "8": "#6a5a28",
};

/** @type {Map<string, HTMLCanvasElement>} */
const sheetCache = new Map();

function getSpriteSheet(id) {
  let sheet = sheetCache.get(id);
  if (sheet) return sheet;
  const spr = SPRITES[id];
  if (!spr) return null;
  sheet = document.createElement("canvas");
  sheet.width = spr.w;
  sheet.height = spr.h;
  const sctx = sheet.getContext("2d");
  for (let y = 0; y < spr.h; y++) {
    const row = spr.pixels[y];
    for (let x = 0; x < spr.w; x++) {
      const col = PALETTE[row[x]];
      if (!col) continue;
      sctx.fillStyle = col;
      sctx.fillRect(x, y, 1, 1);
    }
  }
  sheetCache.set(id, sheet);
  return sheet;
}

/**
 * Draw a pixel sprite centered at origin (caller already translated/rotated).
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} id
 * @param {number} scale pixel size
 * @param {Record<string,string>} [recolor] override palette keys (uncached path)
 */
export function drawSprite(ctx, id, scale = 2, recolor = null) {
  const spr = SPRITES[id];
  if (!spr) return false;

  // Recolor is rare — fall back to per-pixel
  if (recolor) {
    const pal = { ...PALETTE, ...recolor };
    const ox = (-spr.w * scale) / 2;
    const oy = (-spr.h * scale) / 2;
    for (let y = 0; y < spr.h; y++) {
      const row = spr.pixels[y];
      for (let x = 0; x < spr.w; x++) {
        const col = pal[row[x]];
        if (!col) continue;
        ctx.fillStyle = col;
        ctx.fillRect(ox + x * scale, oy + y * scale, scale, scale);
      }
    }
    return true;
  }

  const sheet = getSpriteSheet(id);
  if (!sheet) return false;
  const w = spr.w * scale;
  const h = spr.h * scale;
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sheet, -w / 2, -h / 2, w, h);
  ctx.imageSmoothingEnabled = prev;
  return true;
}

/** Soft black outline around a filled path already drawn — call after flesh fill. */
export function strokePixelOutline(ctx, drawPathFn, color = "rgba(20,20,18,0.85)", width = 1.5) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = "round";
  drawPathFn();
  ctx.stroke();
  ctx.restore();
}

export function hasSprite(id) {
  return !!SPRITES[id];
}
