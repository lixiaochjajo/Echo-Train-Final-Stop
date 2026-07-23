import { findTile, keyOf, parseKey, POSITION_KEYS, TILE, tileAt } from './map.js';

const SAVE_KEY = 'echo-train-prototype-v1';

const ENEMIES = Object.freeze({
  [POSITION_KEYS.enemyA]: {
    id: 'scavenger',
    name: '拾荒者',
    hp: 22,
    attack: 7,
    xp: 12,
    description: '他正在拆走维生设备，看见你后立刻举起了切割枪。'
  },
  [POSITION_KEYS.enemyB]: {
    id: 'hound',
    name: '机械猎犬',
    hp: 34,
    attack: 10,
    xp: 20,
    description: '它的识别灯闪烁着。你的脸已经被列入清除名单。'
  },
  [POSITION_KEYS.elite]: {
    id: 'warden',
    name: '失控乘务长',
    hp: 54,
    attack: 13,
    xp: 36,
    elite: true,
    description: '制服下没有人，只剩一副被列车规则驱动的外壳。'
  }
});

function createRunState() {
  const start = findTile(TILE.START);
  return {
    player: { ...start, hp: 40, maxHp: 40 },
    defeated: [],
    collected: [],
    npcResolved: false,
    exitUnlocked: false,
    echoClaimed: false
  };
}

function createDefaultState() {
  return {
    version: 1,
    level: 1,
    xp: 0,
    attack: 8,
    defense: 2,
    deaths: 0,
    echoLevel: 0,
    checkpoint: null,
    retainedEquipment: null,
    memories: [],
    lastDeath: null,
    run: createRunState(),
    log: [
      '你在一节没有编号的车厢中醒来。',
      '列车广播：请在终点站前完成身份确认。'
    ]
  };
}

export class GameState {
  constructor() {
    this.data = this.load();
    this.listeners = new Set();
  }

  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return createDefaultState();
      const parsed = JSON.parse(raw);
      if (parsed?.version !== 1) return createDefaultState();
      return parsed;
    } catch (error) {
      console.warn('Failed to load save data.', error);
      return createDefaultState();
    }
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(reason = 'state') {
    localStorage.setItem(SAVE_KEY, JSON.stringify(this.data));
    this.listeners.forEach((listener) => listener(this.data, reason));
  }

  reset() {
    localStorage.removeItem(SAVE_KEY);
    this.data = createDefaultState();
    this.notify('reset');
  }

  addLog(message) {
    this.data.log.unshift(message);
    this.data.log = this.data.log.slice(0, 12);
  }

  get player() {
    return this.data.run.player;
  }

  get checkpointPosition() {
    if (!this.data.checkpoint) return findTile(TILE.START);
    return parseKey(this.data.checkpoint);
  }

  getEnemyAt(x, y) {
    const key = keyOf(x, y);
    if (this.data.run.defeated.includes(key)) return null;
    return ENEMIES[key] ? { ...ENEMIES[key], key, x, y } : null;
  }

  isEchoVisible() {
    return this.data.deaths > 0 && !this.data.run.echoClaimed;
  }

  getTileState(x, y) {
    const symbol = tileAt(x, y);
    const key = keyOf(x, y);

    if (symbol === TILE.WALL) return { kind: 'wall', walkable: false };
    if (ENEMIES[key] && !this.data.run.defeated.includes(key)) {
      return { kind: ENEMIES[key].elite ? 'elite' : 'enemy', walkable: false };
    }
    if (symbol === TILE.ITEM && !this.data.run.collected.includes(key)) {
      return { kind: 'item', walkable: true };
    }
    if (symbol === TILE.NPC && !this.data.run.npcResolved) {
      return { kind: 'npc', walkable: true };
    }
    if (symbol === TILE.CHECKPOINT) return { kind: 'checkpoint', walkable: true };
    if (symbol === TILE.ECHO && this.isEchoVisible()) return { kind: 'echo', walkable: true };
    if (symbol === TILE.EXIT) return { kind: 'exit', walkable: true };
    return { kind: 'floor', walkable: true };
  }

  canEnter(x, y, target = false) {
    const enemy = this.getEnemyAt(x, y);
    if (enemy) return target;
    return this.getTileState(x, y).walkable;
  }

  movePlayer(x, y) {
    this.data.run.player.x = x;
    this.data.run.player.y = y;
    this.notify('move');
  }

  heal(amount, source) {
    const before = this.player.hp;
    this.player.hp = Math.min(this.player.maxHp, this.player.hp + amount);
    const recovered = this.player.hp - before;
    if (recovered > 0) this.addLog(`${source}恢复了 ${recovered} 点生命。`);
    this.notify('heal');
  }

  bindCheckpoint() {
    this.data.checkpoint = POSITION_KEYS.checkpoint;
    this.player.hp = this.player.maxHp;
    this.addLog('记忆锚点已绑定。死亡后将从这里醒来。');
    this.notify('checkpoint');
  }

  resolveNpc(choice) {
    if (this.data.run.npcResolved) return;
    this.data.run.npcResolved = true;
    if (choice === 'listen') {
      if (!this.data.memories.includes('warden-code')) {
        this.data.memories.push('warden-code');
      }
      this.addLog('乘客告诉你：乘务长的左臂仍遵循旧安全协议。');
    } else {
      this.data.attack += 1;
      this.player.hp = Math.max(1, this.player.hp - 5);
      this.addLog('你用血液换到一支神经兴奋剂：攻击永久 +1。');
    }
    this.notify('npc');
  }

  collectItem() {
    if (this.data.run.collected.includes(POSITION_KEYS.item)) return;
    this.data.run.collected.push(POSITION_KEYS.item);
    this.data.retainedEquipment = {
      id: 'arc-blade',
      name: '电弧短刃',
      attack: 3
    };
    this.addLog('获得电弧短刃。死亡时它会作为本轮保留装备。');
    this.notify('item');
  }

  claimEcho() {
    if (!this.isEchoVisible()) return;
    this.data.run.echoClaimed = true;
    this.player.hp = Math.min(this.player.maxHp, this.player.hp + 12);
    this.data.xp += 8;
    this.addLog('你回收了上一轮残留的回声：生命 +12，经验 +8。');
    this.checkLevelUp();
    this.notify('echo');
  }

  totalAttack(tactic = 'balanced', enemy = null) {
    let value = this.data.attack + (this.data.retainedEquipment?.attack ?? 0);
    if (tactic === 'assault') value += 5;
    if (tactic === 'pierce' && enemy?.elite && this.data.memories.includes('warden-code')) value += 8;
    return value;
  }

  simulateBattle(enemy, tactic) {
    let enemyHp = enemy.hp;
    let playerHp = this.player.hp;
    const rounds = [];
    const baseAttack = this.totalAttack(tactic, enemy);
    const damageReduction = tactic === 'guard' ? 5 : 0;
    const enemyAttack = Math.max(1, enemy.attack - this.data.defense - damageReduction);

    for (let round = 1; round <= 8; round += 1) {
      let playerDamage = Math.max(1, baseAttack + ((round * 3 + this.data.deaths) % 4) - 1);
      if (tactic === 'pierce' && round === 1) playerDamage += 4;
      enemyHp -= playerDamage;
      rounds.push(`第 ${round} 轮：你造成 ${playerDamage} 点伤害。`);
      if (enemyHp <= 0) {
        return { victory: true, rounds, playerHp, enemyHp: 0 };
      }

      let retaliation = enemyAttack;
      if (tactic === 'assault') retaliation += 2;
      playerHp -= retaliation;
      rounds.push(`${enemy.name}反击，造成 ${retaliation} 点伤害。`);
      if (playerHp <= 0) {
        return { victory: false, rounds, playerHp: 0, enemyHp };
      }
    }

    return { victory: playerHp >= enemyHp, rounds, playerHp, enemyHp };
  }

  finishBattle(enemy, result) {
    this.player.hp = Math.max(0, result.playerHp);
    result.rounds.slice(-4).forEach((line) => this.addLog(line));

    if (!result.victory) {
      this.die(`被${enemy.name}击败`, enemy.key);
      return;
    }

    this.data.run.defeated.push(enemy.key);
    this.data.xp += enemy.xp;
    this.addLog(`击败${enemy.name}，获得 ${enemy.xp} 经验。`);

    if (enemy.elite) {
      this.data.run.exitUnlocked = true;
      this.addLog('乘务长权限被夺取，通往下一节车厢的门已解锁。');
    }

    this.checkLevelUp();
    this.notify('battle');
  }

  checkLevelUp() {
    let required = this.data.level * 20;
    while (this.data.xp >= required) {
      this.data.xp -= required;
      this.data.level += 1;
      this.data.attack += 2;
      this.data.defense += 1;
      this.player.maxHp += 6;
      this.player.hp = this.player.maxHp;
      this.addLog(`等级提升至 ${this.data.level}：攻击 +2，防御 +1。`);
      required = this.data.level * 20;
    }
  }

  die(reason, locationKey) {
    const retainedLevel = this.data.level;
    const retainedItem = this.data.retainedEquipment;
    this.data.deaths += 1;
    this.data.echoLevel = Math.min(3, this.data.echoLevel + 1);
    this.data.lastDeath = {
      reason,
      locationKey,
      at: Date.now()
    };

    this.data.run = createRunState();
    const spawn = this.checkpointPosition;
    this.data.run.player.x = spawn.x;
    this.data.run.player.y = spawn.y;
    this.data.run.player.maxHp = 40 + (retainedLevel - 1) * 6;
    this.data.run.player.hp = this.data.run.player.maxHp;
    this.data.level = retainedLevel;
    this.data.retainedEquipment = retainedItem;

    this.addLog(`死亡回退：${reason}。等级与一件装备被保留。`);
    this.addLog('列车发生偏移：一处回声残骸已经出现。');
    this.notify('death');
  }

  useExit() {
    if (!this.data.run.exitUnlocked) {
      this.addLog('车门被乘务长权限锁定。');
      this.notify('locked-exit');
      return false;
    }
    this.addLog('原型章节完成：你进入了下一节未实现的车厢。');
    this.notify('complete');
    return true;
  }
}
