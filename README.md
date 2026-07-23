# 回声列车：终点站

一个以“死亡会改变世界”为核心的网页游戏原型。玩法保留经典魔塔的固定空间、路线规划和资源计算，但把死亡设计成继续推进内容的手段。

当前版本使用 **t3d 0.5.4 + WebGL2** 实现 2.5D 方块车厢，HTML/CSS 负责 HUD、对话和战斗界面，Vite 负责开发构建。

## 0.2 已实现

- 一节 13 × 9 的异常列车车厢
- WASD、方向键移动和点击自动寻路
- 路径预览与 t3d 射线拾取
- NPC 首次对话及死亡后的新对话选项
- 维修隔离门：情报、生命或回声三种解法
- 战斗前确定性结果预估
- 三种战术卡与逐回合战斗演出
- 精英敌人记忆并针对上一轮战术
- 记忆锚点和死亡回退
- 等级、永久记忆跨死亡保留
- 死亡遗产二选一：铭刻一件装备或命运抽取
- 回声等级强化敌人并解锁新解法
- 旧存档自动迁移到版本 2
- WebGL context lost 后保留存档并自动恢复页面
- `localStorage` 自动存档

## 启动

```bash
npm install
npm run dev
```

生产构建：

```bash
npm run build
npm run preview
```

无需安装依赖即可运行核心状态冒烟测试：

```bash
npm test
```

## 操作

- `WASD` / 方向键：移动一格
- 鼠标点击：自动寻路到目标地块
- `Esc`：关闭可取消的普通事件
- 红色/橙色：普通敌人与精英
- 青色：NPC
- 蓝色：可铭刻装备
- 紫色：记忆锚点
- 浅蓝：死亡回声
- 灰色门板：维修隔离门
- 黄色：章节出口

## 技术结构

```text
src/
├── game/
│   ├── map.js
│   └── state.js
├── render/
│   └── T3DTrainRenderer.js
├── ui/
│   └── GameUI.js
├── main.js
└── styles.css
scripts/
└── smoke-test.mjs
```

完整玩法目标见 [`docs/GAME_DESIGN.md`](docs/GAME_DESIGN.md)，技术规划见 [`docs/TECH_ARCHITECTURE.md`](docs/TECH_ARCHITECTURE.md)。

## 下一步

0.3 将把单车厢扩展为三节微观地图，并加入“安全 / 冲突 / 异常”三条宏观路线。死亡后主干路线保持稳定，但会长出新的支线与事件状态。
