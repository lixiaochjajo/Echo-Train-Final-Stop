const TACTIC_LABELS = Object.freeze({
  assault: '强攻',
  guard: '防守',
  pierce: '协议穿刺'
});

function outcomeLabel(result) {
  return result.victory
    ? `胜利 · 剩余 ${result.playerHp} HP`
    : `失败 · 敌方剩余 ${result.enemyHp} HP`;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class GameUI {
  constructor(state) {
    this.state = state;
    this.stats = document.querySelector('#stats');
    this.objective = document.querySelector('#objective');
    this.eventContent = document.querySelector('#event-content');
    this.eventActions = document.querySelector('#event-actions');
    this.log = document.querySelector('#log');
    this.resetButton = document.querySelector('#reset-button');
    this.busy = false;

    this.resetButton.addEventListener('click', () => {
      if (window.confirm('确定清除当前原型存档吗？')) this.state.reset();
    });
  }

  render(data) {
    const attack = data.attack + (data.retainedEquipment?.attack ?? 0);
    const requiredXp = data.level * 20;
    this.stats.innerHTML = `
      <div class="stat"><span>等级</span><strong>${data.level}</strong></div>
      <div class="stat"><span>经验</span><strong>${data.xp} / ${requiredXp}</strong></div>
      <div class="stat"><span>生命</span><strong>${data.run.player.hp} / ${data.run.player.maxHp}</strong></div>
      <div class="stat"><span>攻击</span><strong>${attack}</strong></div>
      <div class="stat"><span>防御</span><strong>${data.defense}</strong></div>
      <div class="stat"><span>死亡</span><strong>${data.deaths}</strong></div>
      <div class="stat"><span>回声等级</span><strong>${data.echoLevel}</strong></div>
      <div class="stat"><span>永久记忆</span><strong>${data.memories.length}</strong></div>
      <div class="wide-stat"><span>保留装备</span><strong>${data.retainedEquipment?.name ?? '无'}</strong></div>
      <div class="wide-stat"><span>锚点</span><strong>${data.checkpoint ? '维修站台' : '初始车厢'}</strong></div>
      <div class="wide-stat"><span>上次遗产</span><strong>${data.lastLegacy ?? '尚未选择'}</strong></div>
    `;

    this.objective.textContent = data.pendingLegacy
      ? '先在锚点中选择本次死亡遗产。'
      : data.run.exitUnlocked
        ? '前往黄色车门，离开当前车厢。'
        : '穿过维修隔离门，找到并击败失控乘务长。';

    this.log.innerHTML = data.log.map((entry) => `<li>${entry}</li>`).join('');
  }

  clearEvent() {
    this.eventContent.innerHTML = '<p>沿列车向前探索。点击地块可自动寻路，靠近阻挡物会触发交互。</p>';
    this.eventActions.innerHTML = '';
  }

  showEvent(title, description, actions = []) {
    this.eventContent.innerHTML = `<h2>${title}</h2><p>${description}</p>`;
    this.eventActions.innerHTML = '';
    for (const action of actions) {
      const button = document.createElement('button');
      button.className = action.primary ? 'primary-button' : 'event-button';
      button.textContent = action.label;
      button.disabled = Boolean(action.disabled);
      if (action.hint) button.title = action.hint;
      button.addEventListener('click', action.onClick);
      this.eventActions.appendChild(button);
    }
  }

  showBattle(enemy, forecasts, onSelect) {
    const knownWeakness = enemy.elite && this.state.data.memories.includes('warden-code');
    const remembered = this.state.data.enemyMemory[enemy.id];
    const cards = [
      {
        id: 'assault',
        title: '强攻',
        description: '伤害 +5，但每次反击额外承受 2 点伤害。'
      },
      {
        id: 'guard',
        title: '防守',
        description: '降低每次承伤，适合保住当前生命。'
      },
      {
        id: 'pierce',
        title: '协议穿刺',
        description: knownWeakness ? '已知乘务长弱点，精英战中大幅增伤。' : '首轮追加伤害，等待情报强化。'
      }
    ];

    const warning = remembered
      ? `<div class="battle-warning">敌人记得你上次使用了「${TACTIC_LABELS[remembered]}」，重复使用可能被针对。</div>`
      : '';

    this.eventContent.innerHTML = `
      <h2>${enemy.elite ? `精英：${enemy.name}` : enemy.name}</h2>
      <p>${enemy.description}</p>
      <div class="enemy-summary"><span>生命 ${enemy.hp}</span><span>攻击 ${enemy.attack}</span></div>
      ${warning}
      <div class="battle-grid">
        ${cards.map((card) => {
          const forecast = forecasts[card.id];
          return `
            <button class="tactic-card ${forecast.victory ? 'is-win' : 'is-loss'}" data-tactic="${card.id}">
              <strong>${card.title}</strong>
              <span>${card.description}</span>
              <em>${outcomeLabel(forecast)}${forecast.countered ? ' · 被针对' : ''}</em>
            </button>
          `;
        }).join('')}
      </div>
    `;
    this.eventActions.innerHTML = '';
    this.eventContent.querySelectorAll('[data-tactic]').forEach((button) => {
      button.addEventListener('click', () => onSelect(button.dataset.tactic));
    });
  }

  showLegacyChoice(legacy, onSelect) {
    const equipment = legacy.equipment;
    const pressureText = legacy.pressure >= 8
      ? '这次死亡的等级差较大，命运池会获得更高补偿。'
      : '这次死亡压力一般，命运池以基础奖励为主。';

    this.showEvent(
      '锚点遗产选择',
      `你已经死亡并完成回退。${pressureText} 只能选择一种遗产，选择后才能继续行动。`,
      [
        {
          label: equipment ? `铭刻装备｜保留 ${equipment.name}` : '铭刻装备｜没有可保留装备',
          primary: Boolean(equipment),
          disabled: !equipment,
          onClick: () => onSelect('equipment')
        },
        {
          label: '命运抽取｜放弃装备，按压力与装备价值抽一次',
          primary: !equipment,
          onClick: () => onSelect('draw')
        }
      ]
    );
  }

  async playBattle(enemy, result, onStep) {
    this.eventActions.innerHTML = '';
    this.eventContent.innerHTML = `
      <h2>战斗中 · ${enemy.name}</h2>
      <div class="battle-bars">
        <div><span>你</span><div class="bar"><i id="player-hp-bar"></i></div><strong id="player-hp-text"></strong></div>
        <div><span>${enemy.name}</span><div class="bar enemy"><i id="enemy-hp-bar"></i></div><strong id="enemy-hp-text"></strong></div>
      </div>
      <ol class="battle-timeline" id="battle-timeline"></ol>
    `;

    const playerBar = this.eventContent.querySelector('#player-hp-bar');
    const enemyBar = this.eventContent.querySelector('#enemy-hp-bar');
    const playerText = this.eventContent.querySelector('#player-hp-text');
    const enemyText = this.eventContent.querySelector('#enemy-hp-text');
    const timeline = this.eventContent.querySelector('#battle-timeline');
    const playerMax = this.state.player.maxHp;

    const updateBars = (step) => {
      playerBar.style.width = `${Math.max(0, step.playerHp / playerMax) * 100}%`;
      enemyBar.style.width = `${Math.max(0, step.enemyHp / enemy.hp) * 100}%`;
      playerText.textContent = `${step.playerHp} / ${playerMax}`;
      enemyText.textContent = `${step.enemyHp} / ${enemy.hp}`;
    };

    updateBars({ playerHp: this.state.player.hp, enemyHp: enemy.hp });
    for (const step of result.steps) {
      const line = document.createElement('li');
      line.textContent = step.actor === 'player'
        ? `第 ${step.round} 轮：你造成 ${step.amount} 点伤害。`
        : `${enemy.name}反击，造成 ${step.amount} 点伤害。`;
      timeline.prepend(line);
      while (timeline.children.length > 5) timeline.lastElementChild.remove();
      updateBars(step);
      onStep?.(step);
      await wait(170);
    }
  }

  setBusy(value) {
    this.busy = value;
    document.body.classList.toggle('is-busy', value);
  }
}
