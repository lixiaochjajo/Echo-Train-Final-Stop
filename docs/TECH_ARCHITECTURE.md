# 技术架构与迭代计划

## 1. 技术选择

- 渲染：t3d 0.5.4 / WebGL2
- 构建：Vite
- 语言：第一版使用原生 ES Modules，后续可迁移 TypeScript
- UI：HTML + CSS 覆盖层
- 存档：localStorage，正式版升级 IndexedDB
- 地图：当前为字符模板，后续使用 JSON 数据与编辑器导出

选择 t3d 的原因：

- 项目需要 2.5D/3D 方块地图与轻量特效
- 渲染与游戏逻辑可以完全解耦
- 后续可以接入 PBR、模型、后处理、批处理和自定义渲染流程
- 与现有 ThingJS / t3d 技术经验一致

## 2. 分层原则

### GameState

唯一可信游戏状态，负责：

- 玩家成长
- 当前轮次
- 死亡与继承
- 地图事件状态
- 战斗规则
- 存档序列化

不保存任何 GPU 或 DOM 对象。

### Renderer

只读取状态并表现：

- 地块
- 角色与事件物体
- 摄像机
- 动画
- 射线拾取

渲染层替换或上下文恢复不应影响游戏状态。

### UI

负责：

- HUD
- 日志
- 对话
- 卡牌选择
- 系统菜单

长文本和复杂面板不绘制进 WebGL Canvas。

### Orchestrator

`main.js` 连接输入、寻路、状态和渲染，后续应进一步拆分为：

- InputController
- NavigationSystem
- EventSystem
- BattleSystem
- SaveService

## 3. 地图数据演进

第一版字符地图：

```text
# 墙
. 地板
S 起点
N NPC
E 普通敌人
I 装备
C 锚点
M 精英
X 回声
G 出口
```

下一阶段改为数据驱动：

```js
{
  id: 'carriage-01',
  width: 13,
  height: 9,
  terrain: [...],
  entities: [...],
  events: [...],
  variants: {
    afterPoisonDeath: [...],
    echoLevel2: [...]
  }
}
```

## 4. 事件状态机

正式事件不直接写死在 UI 回调中。建议结构：

```js
{
  id: 'injured-passenger',
  states: {
    firstMeeting: { ... },
    knownBetrayal: { ... },
    hasEvidence: { ... },
    highEcho: { ... }
  },
  transitions: [...]
}
```

事件条件读取：

- 永久记忆
- 当前轮次状态
- 死亡原因
- 回声等级
- 装备与卡牌
- NPC 关系

## 5. 性能策略

当前地图很小，优先验证玩法。扩展后需要：

- 只挂载当前车厢和相邻车厢
- 静态地块批处理或实例化
- 图集与合并纹理
- 对象池复用特效
- 限制 DPR 不超过 2
- 无风险战斗快速结算
- 清空区域支持快速移动
- WebGL context lost / restored 处理

## 6. 下一步里程碑

### Milestone 0.2：完整死亡遗产

- 死亡时装备保留或命运抽取二选一
- 死亡位置动态生成回声尸体
- 三种死亡原因变体
- 锚点 UI 和确认流程

### Milestone 0.3：多车厢

- 三个微观地图
- 宏观路线选择
- 安全 / 冲突 / 异常三条路线
- 地图信息在死亡后保留

### Milestone 0.4：战斗深化

- 8 张基础战术卡
- 能量与打断窗口
- 自动战斗规则配置
- 精英根据上一轮战术获得针对能力

### Milestone 0.5：内容工具

- JSON Schema
- 地图编辑器导入
- 对话事件编辑器
- 数值模拟与自动跑局

## 7. 原型验收标准

第一版完成标准：

- 浏览器可运行
- t3d 正常渲染车厢
- 键盘与鼠标移动可用
- 普通敌人和精英可战斗
- NPC、装备、锚点和出口事件可触发
- 玩家能死亡并从锚点回退
- 等级与一件装备可以跨死亡保留
- 死亡后出现新的回声事件
- 存档刷新页面后仍存在
