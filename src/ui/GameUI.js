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
    this.stats.innerHTML = `
      <div class="stat"><span>等级</span><strong>${data.level}</strong></div>
      <div class="stat"><span>生命</span><strong>${data.run.player.hp} / ${data.run.player.maxHp}</strong></div>
      <div class="stat"><span>攻击</span><strong>${attack}</strong></div>
      <div class="stat"><span>防御</span><strong>${data.defense}</strong></div>
      <div class="stat"><span>死亡</span><strong>${data.deaths}</strong></div>
      <div class="stat"><span>回声等级</span><strong>${data.echoLevel}</strong></div>
      <div class="wide-stat"><span>保留装备</span><strong>${data.retainedEquipment?.name ?? '无'}</strong></div>
      <div class="wide-stat"><span>锚点</span><strong>${data.checkpoint ? '维修站台' : '初始车厢'}</strong></div>
    `;

    this.objective.textContent = data.run.exitUnlocked
      ? '前往黄色车门，离开当前车厢。'
      : '找到并击败失控乘务长，夺取车门权限。';

    this.log.innerHTML = data.log.map((entry) => `<li>${entry}</li>`).join('');
  }

  clearEvent() {
    this.eventContent.innerHTML = '<p>沿列车向前探索。地块颜色代表不同事件。</p>';
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
      button.addEventListener('click', action.onClick);
      this.eventActions.appendChild(button);
    }
  }

  showBattle(enemy, onSelect) {
    const knownWeakness = enemy.elite && this.state.data.memories.includes('warden-code');
    this.showEvent(
      enemy.elite ? `精英：${enemy.name}` : enemy.name,
      `${enemy.description} 生命 ${enemy.hp}，攻击 ${enemy.attack}。选择一张战术卡，战斗随后自动结算。`,
      [
        {
          label: '强攻｜伤害 +5，承伤 +2',
          primary: true,
          onClick: () => onSelect('assault')
        },
        {
          label: '防守｜每次承伤 -5',
          onClick: () => onSelect('guard')
        },
        {
          label: knownWeakness ? '协议穿刺｜已知弱点，大幅增伤' : '协议穿刺｜首轮追加伤害',
          onClick: () => onSelect('pierce')
        }
      ]
    );
  }

  setBusy(value) {
    this.busy = value;
    document.body.classList.toggle('is-busy', value);
  }
}
