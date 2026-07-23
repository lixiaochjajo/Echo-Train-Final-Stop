import { findTile, keyOf, parseKey, POSITION_KEYS, TILE, tileAt } from './map.js';

const SAVE_KEY = 'echo-train-prototype-v1';
const SAVE_VERSION = 2;

const ENEMIES = Object.freeze({
  [POSITION_KEYS.enemyA]: {
    id: 'scavenger',
    name: '拾荒者',
    hp: 22,
    attack: 7,
    xp: 12,
    threat: 8,
    description: '他正在拆走维生设备，看见你后立刻举起了切割枪。'
  },
  [POSITION_KEYS.enemyB]: {
    id: 'hound',
    name: '机械猎犬',
    hp: 34,
    attack: 10,
    xp: 20,
    threat: 14,
    description: '它的识别灯闪烁着。你的脸已经被列入清除名单。'
  },
  [POSITION_KEYS.elite]: {
    id: 'warden',
    name: '失控乘务长',
    hp: 54,
    attack: 13,
    xp: 36,
    threat: 22,
    elite: true,
    description: '制服下没有人，只剩一副被列车规则驱动的外壳。'
  }
});

function maxHpFor(data) {
  return 40 + (data.level - 1) * 6 + (data.maxHpBonus ?? 0);
}

function createRunState(maxHp = 40) {
  const start = findTile(TILE.START);
  return {
    player: { ...start, hp: maxHp, maxHp },
    defeated: [],
    collected: [],
    npcResolved: false,
    doorOpened: false,
    exitUnlocked: false,
    echoClaimed: false
  };
}

function createDefaultState() {
  const data = {
    version: SAVE_VERSION,
    level: 1,
    xp: 0,
    attack: 8,
    defense: 2,
    maxHpBonus: 0,
    deaths: 0,
    echoLevel: 0,
    checkpoint: null,
    retainedEquipment: null,
    memories: [],
    enemyMemory: {},
    pendingLegacy: null,
    lastLegacy: null,
    lastDeath: null,
    deathHistory: [],
    run: null,
    log: [
      '你在一节没有编号的车厢中醒来。',
      '列车广播：请在终点站前完成身份确认。'
    ]
  };
  data.run = createRunState(maxHpFor(data));
  return data;
}

function migrateState(parsed) {
  if (!parsed || typeof parsed !== 'object') return createDefaultState();
  if (parsed.version === SAVE_VERSION) return parsed;
  if (parsed.version !== 1) return createDefaultState();

  const migrated = {
    ...parsed,
    version: SAVE_VERSION,
    maxHpBonus: 0,
    enemyMemory: {},
    pendingLegacy: null,
    lastLegacy: null,
    deathHistory: parsed.lastDeath ? [parsed.lastDeath] : [],
    run: {
      ...parsed.run,
      doorOpened: false
    }
  };
  const maxHp = maxHpFor(migrated);
  migrated.run.player.maxHp = maxHp;
  migrated.run.player.hp = Math.min(migrated.run.player.hp, maxHp);
  return migrated;
}

function deterministicPick(seed, length) {
  const value = Math.abs(Math.imul(seed ^ 0x9e3779b9, 2654435761));
  return value % length;
}

export class GameState {
  constructor() {
    this.data = this.load();
    this.listeners = new Set();
  }

  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      return raw ? migrateState(JSON.parse(raw)) : createDefaultState();
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
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.data));
    } catch (error) {
      console.warn('Failed to save game state.', error);
    }
    this.listeners.forEach((listener) => listener(this.data, reason));
  }

  reset() {
    localStorage.removeItem(SAVE_KEY);
    this.data = createDefaultState();
    this.notify('reset');
  }

  addLog(message) {
    this.data.log.unshift(message);
    this.data.log = this.data.log.slice(0, 14);
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
    const base = ENEMIES[key];
    if (!base) return null;

    const echoBoost = Math.max(0, this.data.echoLevel - 1);
    return {
      ...base,
      hp: base.hp + echoBoost * (base.elite ? 8 : 3),
      attack: base.attack + echoBoost,
      key,
      x,
      y
    };
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
    if (symbol === TILE.DOOR && !this.data.run.doorOpened) {
      return { kind: 'door', walkable: false, interactable: true };
    }
    if (symbol === TILE.CHECKPOINT) return { kind: 'checkpoint', walkable: true };
    if (symbol === TILE.ECHO && this.isEchoVisible()) return { kind: 'echo', walkable: true };
    if (symbol === TILE.EXIT) return { kind: 'exit', walkable: true };
    return { kind: 'floor', walkable: true };
  }

  canEnter(x, y, target = false) {
    const enemy = this.getEnemyAt(x, y);
    if (enemy) return target;
    const tile = this.getTileState(x, y);
    if (tile.interactable) return target;
    return tile.walkable;
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

    if (choice === 'listen' || choice === 'remember') {
      if (!this.data.memories.includes('warden-code')) this.data.memories.push('warden-code');
      this.addLog(choice === 'remember'
        ? '你先说出了维护记录的结尾。乘客沉默着交出了完整协议。'
        : '乘客告诉你：乘务长的左臂仍遵循旧安全协议。');
    } else {
      this.data.attack += 1;
      this.player.hp = Math.max(1, this.player.hp - 5);
      this.addLog('你用血液换到一支神经兴奋剂：攻击永久 +1。');
    }
    this.notify('npc');
  }

  openDoor(method) {
    if (this.data.run.doorOpened) return true;

    if (method === 'code') {
      if (!this.data.memories.includes('warden-code')) return false;
      this.addLog('旧安全协议通过，维修隔离门无声滑开。');
    } else if (method === 'echo') {
      if (this.data.echoLevel < 2) return false;
      this.addLog('你让两条时间线短暂重叠，从尚未关闭的门中穿过。');
    } else {
      this.player.hp -= 8;
      this.addLog('你强行撬开隔离门，失去 8 点生命。');
      if (this.player.hp <= 0) {
        this.die('强行撬门导致失血过多', POSITION_KEYS.door);
        return false;
      }
    }

    this.data.run.doorOpened = true;
    this.notify('door');
    return true;
  }

  collectItem() {
    if (this.data.run.collected.includes(POSITION_KEYS.item)) return;
    this.data.run.collected.push(POSITION_KEYS.item);
    this.data.retainedEquipment = {
      id: 'arc-blade',
      name: '电弧短刃',
      attack: 3
    };
    this.addLog('获得电弧短刃。死亡时可以选择将它铭刻进锚点。');
    this.notify('item');
  }

  claimEcho() {
    if (!this.isEchoVisible()) return;
    this.data.run.echoClaimed = true;
    this.player.hp = Math.min(this.player.maxHp, this.player.hp + 12);
    this.data.xp += 8 + this.data.echoLevel * 2;
    this.addLog(`回收死亡回声：生命 +12，经验 +${8 + this.data.echoLevel * 2}。`);
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
    const steps = [];
    const countered = enemy.elite && this.data.enemyMemory[enemy.id] === tactic;
    let baseAttack = this.totalAttack(tactic, enemy);
    let damageReduction = tactic === 'guard' ? 5 : 0;
    let enemyAttack = Math.max(1, enemy.attack - this.data.defense - damageReduction);

    if (countered && tactic === 'assault') enemyAttack += 3;
    if (countered && tactic === 'guard') {
      damageReduction = 2;
      enemyAttack = Math.max(1, enemy.attack - this.data.defense - damageReduction);
    }
    if (countered && tactic === 'pierce') baseAttack = Math.max(1, baseAttack - 4);

    for (let round = 1; round <= 8; round += 1) {
      let playerDamage = Math.max(1, baseAttack + ((round * 3 + this.data.deaths) % 4) - 1);
      if (tactic === 'pierce' && round === 1 && !countered) playerDamage += 4;
      enemyHp = Math.max(0, enemyHp - playerDamage);
      rounds.push(`第 ${round} 轮：你造成 ${playerDamage} 点伤害。`);
      steps.push({ actor: 'player', round, amount: playerDamage, playerHp, enemyHp });
      if (enemyHp <= 0) {
        return { victory: true, rounds, steps, playerHp, enemyHp: 0, countered, tactic };
      }

      let retaliation = enemyAttack;
      if (tactic === 'assault') retaliation += 2;
      playerHp = Math.max(0, playerHp - retaliation);
      rounds.push(`${enemy.name}反击，造成 ${retaliation} 点伤害。`);
      steps.push({ actor: 'enemy', round, amount: retaliation, playerHp, enemyHp });
      if (playerHp <= 0) {
        return { victory: false, rounds, steps, playerHp: 0, enemyHp, countered, tactic };
      }
    }

    const victory = playerHp >= enemyHp;
    return { victory, rounds, steps, playerHp, enemyHp, countered, tactic };
  }

  getBattleForecast(enemy) {
    return Object.fromEntries(
      ['assault', 'guard', 'pierce'].map((tactic) => [tactic, this.simulateBattle(enemy, tactic)])
    );
  }

  finishBattle(enemy, result) {
    this.data.enemyMemory[enemy.id] = result.tactic;
    this.player.hp = Math.max(0, result.playerHp);
    result.rounds.slice(-4).forEach((line) => this.addLog(line));

    if (!result.victory) {
      this.die(`被${enemy.name}击败`, enemy.key);
      return;
    }

    this.data.run.defeated.push(enemy.key);
    this.data.xp += enemy.xp;
    this.addLog(`击败${enemy.name}，获得 ${enemy.xp} 经验。`);

    if (result.countered) this.addLog(`${enemy.name}记住了你上一次的战术，并进行了针对。`);
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
      this.player.maxHp = maxHpFor(this.data);
      this.player.hp = this.player.maxHp;
      this.addLog(`等级提升至 ${this.data.level}：攻击 +2，防御 +1。`);
      required = this.data.level * 20;
    }
  }

  die(reason, locationKey) {
    const lostEquipment = this.data.retainedEquipment;
    const enemy = ENEMIES[locationKey] ?? null;
    const playerPower = this.data.attack + this.data.defense + this.data.level * 2;
    const pressure = Math.max(0, (enemy?.threat ?? 10) - playerPower);

    this.data.deaths += 1;
    this.data.echoLevel = Math.min(3, this.data.echoLevel + 1);
    this.data.lastDeath = { reason, locationKey, at: Date.now() };
    this.data.deathHistory.unshift(this.data.lastDeath);
    this.data.deathHistory = this.data.deathHistory.slice(0, 10);
    this.data.pendingLegacy = {
      equipment: lostEquipment,
      equipmentPower: lostEquipment?.attack ?? 0,
      pressure,
      reason
    };

    this.data.run = createRunState(maxHpFor(this.data));
    const spawn = this.checkpointPosition;
    this.data.run.player.x = spawn.x;
    this.data.run.player.y = spawn.y;
    this.data.retainedEquipment = null;

    this.addLog(`死亡回退：${reason}。等级与记忆已保留。`);
    this.addLog('锚点要求你选择一项遗产。列车同时生成了一处新回声。');
    this.notify('death');
  }

  resolveLegacy(choice) {
    const legacy = this.data.pendingLegacy;
    if (!legacy) return null;

    if (choice === 'equipment' && legacy.equipment) {
      this.data.retainedEquipment = legacy.equipment;
      this.data.lastLegacy = `铭刻装备：${legacy.equipment.name}`;
      this.addLog(`${legacy.equipment.name}被铭刻进锚点，继续随你进入下一轮。`);
    } else {
      const pool = [
        { id: 'attack', label: '攻击永久 +1', apply: () => { this.data.attack += 1; } },
        { id: 'defense', label: '防御永久 +1', apply: () => { this.data.defense += 1; } },
        { id: 'vitality', label: '生命上限永久 +6', apply: () => { this.data.maxHpBonus += 6; } },
        {
          id: 'experience',
          label: `获得 ${12 + legacy.equipmentPower * 3 + legacy.pressure} 经验`,
          apply: () => { this.data.xp += 12 + legacy.equipmentPower * 3 + legacy.pressure; }
        }
      ];
      const seed = this.data.deaths * 31 + this.data.level * 17 + legacy.equipmentPower * 11 + legacy.pressure;
      const reward = pool[deterministicPick(seed, pool.length)];
      reward.apply();
      this.data.lastLegacy = `命运抽取：${reward.label}`;
      this.addLog(`命运抽取结果：${reward.label}。`);
      this.player.maxHp = maxHpFor(this.data);
      this.player.hp = this.player.maxHp;
      this.checkLevelUp();
    }

    this.data.pendingLegacy = null;
    this.notify('legacy');
    return this.data.lastLegacy;
  }

  useExit() {
    if (!this.data.run.exitUnlocked) {
      this.addLog('车门被乘务长权限锁定。');
      this.notify('locked-exit');
      return false;
    }
    this.addLog('0.2 章节完成：你进入下一节尚未展开的车厢。');
    this.notify('complete');
    return true;
  }
}
