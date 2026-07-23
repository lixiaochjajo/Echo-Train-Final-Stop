# 回声列车：终点站

一个以“死亡会改变世界”为核心的网页游戏原型。玩法灵感来自经典魔塔的空间规划与资源计算，但地图、战斗和存档循环采用自己的设定。

当前版本用 **t3d + WebGL2** 实现 2.5D/3D 方块车厢，界面使用原生 HTML/CSS，构建工具使用 Vite。

## 当前可玩内容

- 一节 13 × 9 的异常列车车厢
- WASD、方向键移动
- 点击地块自动寻路
- NPC 对话与永久情报
- 装备拾取与死亡保留
- 三种战术卡选择 + 自动战斗结算
- 维修站台记忆锚点
- 死亡回退、等级保留和世界回声
- 击败精英后解锁车门
- `localStorage` 自动存档

## 启动

```bash
npm install
npm run dev
```

构建生产版本：

```bash
npm run build
npm run preview
```

## 原型操作

- `WASD` / 方向键：移动一格
- 鼠标点击：自动寻路到目标地块
- 红色/橙色单位：普通敌人与精英
- 青色单位：NPC
- 蓝色物体：可保留装备
- 紫色装置：记忆锚点
- 浅蓝回声：死亡后出现的新内容
- 黄色车门：章节出口

## 技术结构

```text
src/
├── game/
│   ├── map.js       # 固定地图模板与坐标工具
│   └── state.js     # 存档、死亡循环、事件和战斗规则
├── render/
│   └── T3DTrainRenderer.js  # t3d 场景、地块、角色和射线拾取
├── ui/
│   └── GameUI.js    # HUD、对话、战术选择和日志
├── main.js          # 输入、寻路和系统编排
└── styles.css
```

玩法目标见 [`docs/GAME_DESIGN.md`](docs/GAME_DESIGN.md)，技术规划见 [`docs/TECH_ARCHITECTURE.md`](docs/TECH_ARCHITECTURE.md)。

## 当前定位

这不是完整的 50 层内容，而是第一块“垂直切片”：验证玩家是否愿意在同一张可记忆地图中死亡、回退、获得新情报，再用新的解法推进。
