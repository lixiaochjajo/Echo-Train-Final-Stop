import './styles.css';
import { GameState } from './game/state.js';
import { MAP_HEIGHT, MAP_WIDTH, neighbors, keyOf } from './game/map.js';
import { T3DTrainRenderer } from './render/T3DTrainRenderer.js';
import { GameUI } from './ui/GameUI.js';

const canvas = document.querySelector('#game-canvas');
const state = new GameState();
const ui = new GameUI(state);

let movementToken = 0;
let pendingEnemy = null;

const renderer = new T3DTrainRenderer(canvas, state, (x, y) => {
  if (ui.busy) return;
  moveToward(x, y);
});

state.subscribe((data, reason) => {
  ui.render(data);
  renderer.updateFromState(data, reason);

  if (reason === 'reset') {
    movementToken += 1;
    pendingEnemy = null;
    ui.setBusy(false);
    ui.clearEvent();
    return;
  }

  if (reason === 'death') {
    movementToken += 1;
    pendingEnemy = null;
    ui.setBusy(true);
    ui.showLegacyChoice(data.pendingLegacy, resolveLegacy);
  }
});

ui.render(state.data);
if (state.data.pendingLegacy) {
  ui.setBusy(true);
  ui.showLegacyChoice(state.data.pendingLegacy, resolveLegacy);
} else {
  ui.clearEvent();
}

function findPath(from, to) {
  const startKey = keyOf(from.x, from.y);
  const targetKey = keyOf(to.x, to.y);
  const queue = [{ ...from }];
  const cameFrom = new Map([[startKey, null]]);

  while (queue.length) {
    const current = queue.shift();
    const currentKey = keyOf(current.x, current.y);
    if (currentKey === targetKey) break;

    for (const next of neighbors(current.x, current.y)) {
      if (next.x < 0 || next.y < 0 || next.x >= MAP_WIDTH || next.y >= MAP_HEIGHT) continue;
      const nextKey = keyOf(next.x, next.y);
      if (cameFrom.has(nextKey)) continue;
      const isTarget = nextKey === targetKey;
      if (!state.canEnter(next.x, next.y, isTarget)) continue;
      cameFrom.set(nextKey, currentKey);
      queue.push(next);
    }
  }

  if (!cameFrom.has(targetKey)) return [];
  const path = [];
  let cursor = targetKey;
  while (cursor && cursor !== startKey) {
    const [x, y] = cursor.split(',').map(Number);
    path.push({ x, y });
    cursor = cameFrom.get(cursor);
  }
  return path.reverse();
}

async function moveToward(x, y) {
  const enemy = state.getEnemyAt(x, y);
  const targetTile = state.getTileState(x, y);
  const path = findPath(state.player, { x, y });

  if (!path.length) {
    const adjacent = Math.abs(state.player.x - x) + Math.abs(state.player.y - y) === 1;
    if (enemy && adjacent) openBattle(enemy);
    else if (targetTile.kind === 'door' && adjacent) openDoorEvent();
    return;
  }

  const token = ++movementToken;
  ui.setBusy(true);
  renderer.showPath(path);
  for (const step of path) {
    if (token !== movementToken) break;
    const targetEnemy = state.getEnemyAt(step.x, step.y);
    const tile = state.getTileState(step.x, step.y);
    if (targetEnemy) {
      pendingEnemy = targetEnemy;
      renderer.clearPath();
      openBattle(targetEnemy);
      return;
    }
    if (tile.kind === 'door') {
      renderer.clearPath();
      openDoorEvent();
      return;
    }
    state.movePlayer(step.x, step.y);
    await wait(90);
    if (handleTile(step.x, step.y)) {
      renderer.clearPath();
      return;
    }
  }
  renderer.clearPath();
  ui.setBusy(false);
}

function tryKeyboardMove(dx, dy) {
  if (ui.busy) return;
  const x = state.player.x + dx;
  const y = state.player.y + dy;
  const enemy = state.getEnemyAt(x, y);
  if (enemy) {
    openBattle(enemy);
    return;
  }
  const tile = state.getTileState(x, y);
  if (tile.kind === 'door') {
    openDoorEvent();
    return;
  }
  if (!state.canEnter(x, y)) return;
  state.movePlayer(x, y);
  handleTile(x, y);
}

function handleTile(x, y) {
  const tile = state.getTileState(x, y);

  if (tile.kind === 'npc') {
    ui.setBusy(true);
    const hasMetBefore = state.data.deaths > 0;
    const actions = [
      { label: '听取维护记录', primary: true, onClick: () => finishNpc('listen') },
      { label: '用 5 点生命交换兴奋剂', onClick: () => finishNpc('trade') }
    ];
    if (hasMetBefore) {
      actions.unshift({ label: '先说出记录结尾，逼他交出完整协议', primary: true, onClick: () => finishNpc('remember') });
    }
    ui.showEvent(
      '失忆乘客',
      hasMetBefore
        ? '他盯着你看了很久：“我们是不是已经见过？你为什么知道我下一句话？”'
        : '他藏着一份乘务长维护记录，但要求你先证明自己不是列车制造的幻觉。',
      actions
    );
    return true;
  }

  if (tile.kind === 'item') {
    state.collectItem();
    ui.showEvent('电弧短刃', '这把武器能被记忆锚点铭刻。死亡时，你也可以放弃它换取一次命运抽取。');
  } else if (tile.kind === 'checkpoint') {
    ui.setBusy(true);
    ui.showEvent(
      '维修站台 · 记忆锚点',
      state.data.checkpoint
        ? '锚点稳定运行中。站台可以恢复全部生命。'
        : '绑定后，死亡将回到这里。等级和记忆必定保留，装备与命运奖励则必须二选一。',
      [
        { label: state.data.checkpoint ? '恢复生命' : '绑定锚点', primary: true, onClick: bindCheckpoint },
        { label: '暂时离开', onClick: closeEvent }
      ]
    );
    return true;
  } else if (tile.kind === 'echo') {
    state.claimEcho();
    ui.showEvent('死亡回声', `上一轮的残影仍在重复：${state.data.lastDeath?.reason ?? '某种失败'}。你从中回收了生命与经验。`);
  } else if (tile.kind === 'exit') {
    const complete = state.useExit();
    ui.showEvent(
      complete ? '0.2 章节完成' : '车门锁定',
      complete
        ? '死亡遗产、敌人战术记忆、维修门和战斗演出已经接入。下一步将展开宏观路线与第二节车厢。'
        : '需要击败失控乘务长，夺取车门权限。'
    );
  }

  ui.setBusy(false);
  return false;
}

function openDoorEvent() {
  movementToken += 1;
  ui.setBusy(true);
  const hasCode = state.data.memories.includes('warden-code');
  const canEcho = state.data.echoLevel >= 2;
  ui.showEvent(
    '维修隔离门',
    '隔离门切断了上下车厢。你可以使用旧安全协议，也可以用身体代价强行打开。高回声状态下，门在另一条时间线里可能仍然敞开。',
    [
      {
        label: hasCode ? '输入旧安全协议｜无代价' : '输入旧安全协议｜尚无情报',
        primary: hasCode,
        disabled: !hasCode,
        onClick: () => resolveDoor('code')
      },
      {
        label: '强行撬门｜失去 8 点生命',
        onClick: () => resolveDoor('force')
      },
      {
        label: canEcho ? '穿过时间重影｜无生命损失' : '穿过时间重影｜需要回声等级 2',
        disabled: !canEcho,
        onClick: () => resolveDoor('echo')
      },
      { label: '暂时离开', onClick: closeEvent }
    ]
  );
}

function resolveDoor(method) {
  const opened = state.openDoor(method);
  if (state.data.pendingLegacy) return;
  if (opened) {
    const [x, y] = state.data.run.doorOpened ? [8, 4] : [state.player.x, state.player.y];
    state.movePlayer(x, y);
    ui.showEvent('隔离门开启', '新的下层区域已经可达。', [
      { label: '继续探索', primary: true, onClick: closeEvent }
    ]);
  }
}

function finishNpc(choice) {
  state.resolveNpc(choice);
  ui.setBusy(false);
  ui.clearEvent();
}

function bindCheckpoint() {
  if (state.data.checkpoint) state.heal(999, '维修站台');
  else state.bindCheckpoint();
  ui.setBusy(false);
  ui.clearEvent();
}

function closeEvent() {
  ui.setBusy(false);
  ui.clearEvent();
}

function resolveLegacy(choice) {
  const result = state.resolveLegacy(choice);
  ui.setBusy(true);
  ui.showEvent('遗产已确定', result ?? '锚点完成了本轮继承。', [
    { label: '返回列车', primary: true, onClick: closeEvent }
  ]);
}

function openBattle(enemy) {
  movementToken += 1;
  pendingEnemy = enemy;
  ui.setBusy(true);
  ui.showBattle(enemy, state.getBattleForecast(enemy), resolveBattle);
}

async function resolveBattle(tactic) {
  if (!pendingEnemy) return;
  const enemy = pendingEnemy;
  pendingEnemy = null;
  const result = state.simulateBattle(enemy, tactic);
  await ui.playBattle(enemy, result, (step) => renderer.animateBattleStep(enemy.key, step));
  state.finishBattle(enemy, result);

  if (result.victory) {
    state.movePlayer(enemy.x, enemy.y);
    ui.showEvent(
      `击败 ${enemy.name}`,
      `${result.countered ? '敌人识别了你上次的战术，但你仍然获胜。' : '战术执行完成。'} 最终剩余 ${result.playerHp} 点生命。`,
      [{ label: '继续探索', primary: true, onClick: closeEvent }]
    );
    ui.setBusy(true);
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

window.addEventListener('keydown', (event) => {
  if (event.code === 'Escape' && ui.busy && !state.data.pendingLegacy && !pendingEnemy) {
    closeEvent();
    return;
  }
  const directions = {
    ArrowUp: [0, -1],
    KeyW: [0, -1],
    ArrowDown: [0, 1],
    KeyS: [0, 1],
    ArrowLeft: [-1, 0],
    KeyA: [-1, 0],
    ArrowRight: [1, 0],
    KeyD: [1, 0]
  };
  const direction = directions[event.code];
  if (!direction) return;
  event.preventDefault();
  tryKeyboardMove(direction[0], direction[1]);
});
