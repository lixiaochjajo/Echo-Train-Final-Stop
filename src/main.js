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
  if (reason === 'reset' || reason === 'death') {
    movementToken += 1;
    pendingEnemy = null;
    ui.setBusy(false);
    ui.clearEvent();
  }
});

ui.render(state.data);
ui.clearEvent();

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
  const path = findPath(state.player, { x, y });
  if (!path.length) {
    if (enemy && Math.abs(state.player.x - x) + Math.abs(state.player.y - y) === 1) {
      openBattle(enemy);
    }
    return;
  }

  const token = ++movementToken;
  ui.setBusy(true);
  for (const step of path) {
    if (token !== movementToken) break;
    const targetEnemy = state.getEnemyAt(step.x, step.y);
    if (targetEnemy) {
      pendingEnemy = targetEnemy;
      openBattle(targetEnemy);
      return;
    }
    state.movePlayer(step.x, step.y);
    await wait(90);
    if (handleTile(step.x, step.y)) return;
  }
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
  if (!state.canEnter(x, y)) return;
  state.movePlayer(x, y);
  handleTile(x, y);
}

function handleTile(x, y) {
  const tile = state.getTileState(x, y);

  if (tile.kind === 'npc') {
    ui.setBusy(true);
    ui.showEvent(
      '失忆乘客',
      state.data.deaths > 0
        ? '他盯着你看了很久：“我们是不是已经见过？这次别再相信乘务长的右手。”'
        : '他藏着一份乘务长维护记录，但要求你先证明自己不是列车制造的幻觉。',
      [
        { label: '听取维护记录', primary: true, onClick: () => finishNpc('listen') },
        { label: '用 5 点生命交换兴奋剂', onClick: () => finishNpc('trade') }
      ]
    );
    return true;
  }

  if (tile.kind === 'item') {
    state.collectItem();
    ui.showEvent('电弧短刃', '这把武器能被记忆锚点铭刻。死亡后仍会跟随你回到过去。');
  } else if (tile.kind === 'checkpoint') {
    ui.setBusy(true);
    ui.showEvent(
      '维修站台 · 记忆锚点',
      state.data.checkpoint
        ? '锚点稳定运行中。站台可以恢复全部生命。'
        : '绑定后，死亡将回到这里。等级和一件装备会被保留，但车厢事件会重置。',
      [
        { label: state.data.checkpoint ? '恢复生命' : '绑定锚点', primary: true, onClick: bindCheckpoint },
        { label: '暂时离开', onClick: closeEvent }
      ]
    );
    return true;
  } else if (tile.kind === 'echo') {
    state.claimEcho();
    ui.showEvent('死亡回声', `你触碰到上一次死亡留下的残影。${state.data.lastDeath?.reason ?? '某种失败'}仍在其中重复。`);
  } else if (tile.kind === 'exit') {
    const complete = state.useExit();
    ui.showEvent(
      complete ? '原型章节完成' : '车门锁定',
      complete
        ? '第一节车厢的核心循环已经跑通。后续版本将接入宏观路线、更多车厢与十层锚点选择。'
        : '需要击败失控乘务长，夺取车门权限。'
    );
  }

  ui.setBusy(false);
  return false;
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

function openBattle(enemy) {
  movementToken += 1;
  pendingEnemy = enemy;
  ui.setBusy(true);
  ui.showBattle(enemy, resolveBattle);
}

function resolveBattle(tactic) {
  if (!pendingEnemy) return;
  const enemy = pendingEnemy;
  pendingEnemy = null;
  const result = state.simulateBattle(enemy, tactic);
  state.finishBattle(enemy, result);

  if (result.victory) {
    state.movePlayer(enemy.x, enemy.y);
    ui.showEvent(
      `击败 ${enemy.name}`,
      result.rounds.slice(-4).join(' '),
      [{ label: '继续探索', primary: true, onClick: closeEvent }]
    );
  }

  ui.setBusy(!result.victory ? false : true);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

window.addEventListener('keydown', (event) => {
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
