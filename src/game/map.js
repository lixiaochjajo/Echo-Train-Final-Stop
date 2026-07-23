export const TILE = Object.freeze({
  WALL: '#',
  FLOOR: '.',
  START: 'S',
  NPC: 'N',
  ENEMY: 'E',
  ITEM: 'I',
  CHECKPOINT: 'C',
  ELITE: 'M',
  ECHO: 'X',
  DOOR: 'D',
  EXIT: 'G'
});

export const MAP_TEMPLATE = [
  '#############',
  '#S..N....E..#',
  '#.###.##.#..#',
  '#...I....#..#',
  '###.####D#..#',
  '#...C..M....#',
  '#.#####.###.#',
  '#....E...X.G#',
  '#############'
];

export const MAP_WIDTH = MAP_TEMPLATE[0].length;
export const MAP_HEIGHT = MAP_TEMPLATE.length;

export const POSITION_KEYS = Object.freeze({
  start: '1,1',
  npc: '4,1',
  enemyA: '9,1',
  item: '4,3',
  door: '8,4',
  checkpoint: '4,5',
  elite: '7,5',
  enemyB: '5,7',
  echo: '9,7',
  exit: '11,7'
});

export function keyOf(x, y) {
  return `${x},${y}`;
}

export function parseKey(key) {
  const [x, y] = key.split(',').map(Number);
  return { x, y };
}

export function tileAt(x, y) {
  return MAP_TEMPLATE[y]?.[x] ?? TILE.WALL;
}

export function findTile(symbol) {
  for (let y = 0; y < MAP_HEIGHT; y += 1) {
    const x = MAP_TEMPLATE[y].indexOf(symbol);
    if (x >= 0) return { x, y };
  }
  return { x: 1, y: 1 };
}

export function neighbors(x, y) {
  return [
    { x: x + 1, y },
    { x: x - 1, y },
    { x, y: y + 1 },
    { x, y: y - 1 }
  ];
}
