const store = new Map();
globalThis.localStorage = {
  getItem: (key) => store.get(key) ?? null,
  setItem: (key, value) => store.set(key, value),
  removeItem: (key) => store.delete(key)
};

const { GameState } = await import('../src/game/state.js');
const { MAP_TEMPLATE, MAP_WIDTH, POSITION_KEYS } = await import('../src/game/map.js');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(MAP_TEMPLATE.every((row) => row.length === MAP_WIDTH), '地图行宽不一致');

const state = new GameState();
state.resolveNpc('listen');
assert(state.data.memories.includes('warden-code'), 'NPC 情报没有永久保存');
assert(state.openDoor('code'), '拥有协议时应能无损开门');

state.collectItem();
const enemy = state.getEnemyAt(9, 1);
const forecasts = state.getBattleForecast(enemy);
assert(['assault', 'guard', 'pierce'].every((key) => forecasts[key]), '战术预估不完整');

state.die('自动测试死亡', POSITION_KEYS.enemyA);
assert(state.data.pendingLegacy, '死亡后没有生成遗产选择');
state.resolveLegacy('equipment');
assert(state.data.retainedEquipment?.id === 'arc-blade', '装备铭刻失败');

state.die('自动测试抽取', POSITION_KEYS.enemyB);
state.resolveLegacy('draw');
assert(!state.data.pendingLegacy, '命运抽取后遗产状态未清理');
assert(state.data.version === 2, '存档版本不是 2');

console.log('Echo Train smoke test passed.', {
  map: `${MAP_WIDTH}x${MAP_TEMPLATE.length}`,
  deaths: state.data.deaths,
  level: state.data.level,
  lastLegacy: state.data.lastLegacy
});
