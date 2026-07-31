/** Arena map definitions (Melon Sandbox–style worlds). */



export const MAPS = {

  lab: {

    id: "lab",

    label: "Lab",

    size: { w: 2400, h: 1200 },

    theme: "lab",

    groundY: 1100,

    platforms: [

      { x: 480, y: 940, w: 260, h: 18 },

      { x: 1100, y: 840, w: 200, h: 18 },

      { x: 1650, y: 960, w: 300, h: 18 },

      { x: 900, y: 700, w: 140, h: 16 },

      { x: 700, y: 1020, w: 18, h: 140 },

    ],

    spawn: [

      { kind: "fruit", id: "melon", x: 1050 },

      { kind: "fruit", id: "pumpkin", x: 1140 },

      { kind: "prop", id: "box", x: 1280, yOff: -28 },

      { kind: "prop", id: "plank", x: 1340, yOff: -16 },

    ],

  },

  yard: {

    id: "yard",

    label: "Yard",

    size: { w: 2800, h: 1200 },

    theme: "yard",

    groundY: 1100,

    platforms: [

      { x: 400, y: 980, w: 180, h: 16 },

      { x: 900, y: 880, w: 220, h: 16 },

      { x: 1500, y: 960, w: 160, h: 16 },

      { x: 2000, y: 820, w: 280, h: 18 },

      { x: 2400, y: 1000, w: 120, h: 14 },

      { x: 1200, y: 1040, w: 100, h: 14 },

      { x: 1280, y: 1020, w: 100, h: 14 },

      { x: 1360, y: 1000, w: 100, h: 14 },

    ],

    spawn: [

      { kind: "fruit", id: "melon", x: 700 },

      { kind: "fruit", id: "apple", x: 780 },

      { kind: "prop", id: "crate", x: 900, yOff: -28 },

      { kind: "prop", id: "ball", x: 1000, yOff: -22 },

      { kind: "vehicle", id: "car", x: 1600, yOff: -40 },

    ],

  },

  warehouse: {

    id: "warehouse",

    label: "Warehouse",

    size: { w: 3000, h: 1200 },

    theme: "lab",

    groundY: 1100,

    platforms: [

      { x: 300, y: 980, w: 200, h: 16 },

      { x: 300, y: 860, w: 200, h: 16 },

      { x: 300, y: 740, w: 200, h: 16 },

      { x: 700, y: 900, w: 16, h: 380 },

      { x: 1200, y: 950, w: 400, h: 18 },

      { x: 1800, y: 800, w: 280, h: 18 },

      { x: 2300, y: 700, w: 200, h: 16 },

      { x: 2600, y: 980, w: 160, h: 16 },

    ],

    spawn: [

      { kind: "fruit", id: "robot", x: 1100 },

      { kind: "fruit", id: "corn", x: 1200 },

      { kind: "prop", id: "crate", x: 1400, yOff: -28 },

      { kind: "prop", id: "crate", x: 1450, yOff: -28 },

      { kind: "machine", id: "conveyor", x: 1600, yOff: -20 },

    ],

  },

  highway: {

    id: "highway",

    label: "Highway",

    size: { w: 3600, h: 1100 },

    theme: "yard",

    groundY: 1000,

    platforms: [

      { x: 600, y: 880, w: 300, h: 14 },

      { x: 1400, y: 820, w: 400, h: 14 },

      { x: 2200, y: 880, w: 280, h: 14 },

      { x: 3000, y: 780, w: 320, h: 14 },

    ],

    spawn: [

      { kind: "fruit", id: "melon", x: 400 },

      { kind: "vehicle", id: "car", x: 800, yOff: -40 },

      { kind: "vehicle", id: "bus", x: 1400, yOff: -50 },

      { kind: "vehicle", id: "bike", x: 2000, yOff: -30 },

      { kind: "prop", id: "boulder", x: 2600, yOff: -40 },

    ],

  },

  void: {

    id: "void",

    label: "Void (Editor)",

    size: { w: 2400, h: 1200 },

    theme: "void",

    groundY: 1100,

    platforms: [],

    spawn: [{ kind: "fruit", id: "melon", x: 1200 }],

  },

  boneLab: {

    id: "boneLab",

    label: "Bone Lab",

    size: { w: 2600, h: 1200 },

    theme: "lab",

    groundY: 1100,

    platforms: [

      { x: 420, y: 920, w: 280, h: 18 },

      { x: 900, y: 780, w: 220, h: 18 },

      { x: 1400, y: 860, w: 320, h: 18 },

      { x: 1900, y: 720, w: 200, h: 16 },

      { x: 2100, y: 980, w: 260, h: 18 },

      { x: 700, y: 1000, w: 18, h: 160 },

      { x: 1600, y: 1000, w: 18, h: 160 },

    ],

    spawn: [

      { kind: "fruit", id: "melon", x: 520 },

      { kind: "fruit", id: "pumpkin", x: 620 },

      { kind: "machine", id: "squeezer", x: 1100, yOff: -40 },

      { kind: "machine", id: "boneMelter", x: 1280, yOff: -38 },

      { kind: "machine", id: "boneMoldSword", x: 1460, yOff: -32 },

      { kind: "machine", id: "boneMoldSpike", x: 1540, yOff: -32 },

      { kind: "machine", id: "boneMoldAxe", x: 1620, yOff: -32 },

      { kind: "machine", id: "boneMoldClub", x: 1700, yOff: -32 },

      { kind: "machine", id: "boneReconnector", x: 1900, yOff: -30 },

      { kind: "machine", id: "crystallizer", x: 1000, yOff: -38 },

      { kind: "machine", id: "shardSmelter", x: 1180, yOff: -38 },

      { kind: "prop", id: "barrel", x: 880, yOff: -30 },

      { kind: "prop", id: "tank", x: 1380, yOff: -36 },

      { kind: "prop", id: "box", x: 780, yOff: -28 },

    ],

  },

};



export function listMaps() {

  return Object.values(MAPS);

}


