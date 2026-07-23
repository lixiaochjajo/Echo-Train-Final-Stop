import * as t3d from 't3d';
import { ForwardRenderer } from 't3d/addons/render/ForwardRenderer.js';
import { MAP_HEIGHT, MAP_TEMPLATE, MAP_WIDTH, TILE, keyOf } from '../game/map.js';

const TILE_COLORS = Object.freeze({
  floor: 0x17242c,
  wall: 0x36434b,
  npc: 0x48b8a8,
  enemy: 0xb7594c,
  elite: 0xdb8748,
  item: 0x4e8ed0,
  checkpoint: 0x8e6bc5,
  echo: 0x4dd2ef,
  door: 0x788892,
  exit: 0xd4bc62
});

function material(hex) {
  const result = new t3d.BasicMaterial();
  result.diffuse.setHex(hex);
  return result;
}

export class T3DTrainRenderer {
  constructor(canvas, state, onTileClick) {
    this.canvas = canvas;
    this.state = state;
    this.onTileClick = onTileClick;
    this.scene = new t3d.Scene();
    this.camera = new t3d.Camera();
    this.forwardRenderer = new ForwardRenderer(canvas);
    this.raycaster = new t3d.Raycaster();
    this.pointer = new t3d.Vector2();
    this.tiles = new Map();
    this.entities = new Map();
    this.hovered = null;
    this.pathKeys = new Set();
    this.playerMesh = null;
    this.running = true;

    this.buildScene();
    this.bindEvents();
    this.resize();
    requestAnimationFrame((time) => this.loop(time));
  }

  buildScene() {
    const centerX = (MAP_WIDTH - 1) / 2;
    const centerZ = (MAP_HEIGHT - 1) / 2;

    this.camera.position.set(centerX + 1.5, 12.5, centerZ + 10.5);
    this.camera.lookAt(new t3d.Vector3(centerX, 0, centerZ), new t3d.Vector3(0, 1, 0));
    this.scene.add(this.camera);

    const floorGeometry = new t3d.BoxGeometry(0.92, 0.12, 0.92);
    const wallGeometry = new t3d.BoxGeometry(1, 1.25, 1);
    const railGeometry = new t3d.BoxGeometry(MAP_WIDTH + 1.2, 0.18, 0.18);

    for (let y = 0; y < MAP_HEIGHT; y += 1) {
      for (let x = 0; x < MAP_WIDTH; x += 1) {
        const symbol = MAP_TEMPLATE[y][x];
        if (symbol === TILE.WALL) {
          const wall = new t3d.Mesh(wallGeometry, material(TILE_COLORS.wall));
          wall.position.set(x, 0.55, y);
          this.scene.add(wall);
          continue;
        }

        const floorMaterial = material(TILE_COLORS.floor);
        const floor = new t3d.Mesh(floorGeometry, floorMaterial);
        floor.position.set(x, 0, y);
        floor.__tile = { x, y, baseColor: TILE_COLORS.floor };
        this.scene.add(floor);
        this.tiles.set(keyOf(x, y), floor);
      }
    }

    const leftRail = new t3d.Mesh(railGeometry, material(0x68737b));
    leftRail.position.set(centerX, 0.12, -0.72);
    this.scene.add(leftRail);
    const rightRail = new t3d.Mesh(railGeometry, material(0x68737b));
    rightRail.position.set(centerX, 0.12, MAP_HEIGHT - 0.28);
    this.scene.add(rightRail);

    this.playerMesh = new t3d.Mesh(
      new t3d.CylinderGeometry(0.28, 0.36, 0.72, 12),
      material(0xe8e0ce)
    );
    this.playerMesh.position.y = 0.52;
    this.scene.add(this.playerMesh);

    this.updateFromState(this.state.data, 'init');
  }

  createEntity(kind, x, y) {
    let mesh;
    if (kind === 'npc') {
      mesh = new t3d.Mesh(new t3d.CylinderGeometry(0.23, 0.3, 0.66, 10), material(TILE_COLORS.npc));
    } else if (kind === 'enemy') {
      mesh = new t3d.Mesh(new t3d.BoxGeometry(0.58, 0.58, 0.58), material(TILE_COLORS.enemy));
    } else if (kind === 'elite') {
      mesh = new t3d.Mesh(new t3d.BoxGeometry(0.72, 0.82, 0.72), material(TILE_COLORS.elite));
    } else if (kind === 'item') {
      mesh = new t3d.Mesh(new t3d.BoxGeometry(0.18, 0.18, 0.7), material(TILE_COLORS.item));
      mesh.euler.z = -0.35;
    } else if (kind === 'checkpoint') {
      mesh = new t3d.Mesh(new t3d.CylinderGeometry(0.3, 0.42, 0.22, 16), material(TILE_COLORS.checkpoint));
    } else if (kind === 'echo') {
      mesh = new t3d.Mesh(new t3d.SphereGeometry(0.3, 12, 8), material(TILE_COLORS.echo));
    } else if (kind === 'door') {
      mesh = new t3d.Mesh(new t3d.BoxGeometry(0.88, 1.08, 0.16), material(TILE_COLORS.door));
    } else if (kind === 'exit') {
      mesh = new t3d.Mesh(new t3d.BoxGeometry(0.78, 1.05, 0.2), material(TILE_COLORS.exit));
    }

    if (!mesh) return null;
    mesh.position.set(x, kind === 'checkpoint' ? 0.24 : 0.5, y);
    mesh.__entityKind = kind;
    mesh.__baseY = mesh.position.y;
    this.scene.add(mesh);
    return mesh;
  }

  removeEntity(key) {
    const mesh = this.entities.get(key);
    if (!mesh) return;
    this.scene.remove(mesh);
    this.entities.delete(key);
  }

  updateFromState(data, reason = 'state') {
    const activeKeys = new Set();
    for (let y = 0; y < MAP_HEIGHT; y += 1) {
      for (let x = 0; x < MAP_WIDTH; x += 1) {
        const tileState = this.state.getTileState(x, y);
        if (tileState.kind === 'wall' || tileState.kind === 'floor') continue;
        const key = keyOf(x, y);
        activeKeys.add(key);
        const existing = this.entities.get(key);
        if (!existing || existing.__entityKind !== tileState.kind) {
          this.removeEntity(key);
          const entity = this.createEntity(tileState.kind, x, y);
          if (entity) this.entities.set(key, entity);
        }
      }
    }

    for (const key of [...this.entities.keys()]) {
      if (!activeKeys.has(key)) this.removeEntity(key);
    }

    this.playerMesh.position.x = data.run.player.x;
    this.playerMesh.position.z = data.run.player.y;
    this.refreshAllTileColors();

    if (reason === 'death') {
      this.playerMesh.scale.set(1.35, 0.35, 1.35);
      setTimeout(() => this.playerMesh.scale.set(1, 1, 1), 260);
    }
  }

  bindEvents() {
    this.canvas.addEventListener('pointermove', (event) => this.handlePointer(event, false));
    this.canvas.addEventListener('pointerleave', () => this.setHovered(null));
    this.canvas.addEventListener('click', (event) => this.handlePointer(event, true));
    this.canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      this.running = false;
      console.warn('WebGL context lost. Game state remains saved.');
    });
    this.canvas.addEventListener('webglcontextrestored', () => {
      window.location.reload();
    });
    window.addEventListener('resize', () => this.resize());
  }

  handlePointer(event, activate) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const intersections = this.raycaster.intersectObject(this.scene, true);
    const tileHit = intersections.find((entry) => entry.object?.__tile)?.object?.__tile ?? null;
    this.setHovered(tileHit ? keyOf(tileHit.x, tileHit.y) : null);
    if (activate && tileHit) this.onTileClick(tileHit.x, tileHit.y);
  }

  showPath(path) {
    this.pathKeys = new Set(path.map((step) => keyOf(step.x, step.y)));
    this.refreshAllTileColors();
  }

  clearPath() {
    if (!this.pathKeys.size) return;
    this.pathKeys.clear();
    this.refreshAllTileColors();
  }

  setHovered(key) {
    if (this.hovered === key) return;
    const previous = this.hovered;
    this.hovered = key;
    if (previous) this.refreshTileColor(previous);
    if (key) this.refreshTileColor(key);
  }

  refreshAllTileColors() {
    for (const key of this.tiles.keys()) this.refreshTileColor(key);
  }

  refreshTileColor(key) {
    const tile = this.tiles.get(key);
    if (!tile) return;
    let color = tile.__tile.baseColor;
    if (this.state.data.checkpoint === key) color = 0x46355f;
    if (this.pathKeys.has(key)) color = 0x294f59;
    if (this.hovered === key) color = 0x386b78;
    tile.material.diffuse.setHex(color);
  }

  animateBattleStep(enemyKey, step) {
    const mesh = step.actor === 'player' ? this.entities.get(enemyKey) : this.playerMesh;
    if (!mesh) return;
    mesh.scale.set(1.28, 0.72, 1.28);
    setTimeout(() => mesh.scale.set(1, 1, 1), 130);
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(2, Math.floor(rect.width * dpr));
    const height = Math.max(2, Math.floor(rect.height * dpr));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      this.camera.setPerspective(42 / 180 * Math.PI, width / height, 0.1, 100);
      this.forwardRenderer.screenRenderTarget.resize(width, height);
    }
  }

  loop(time) {
    if (!this.running) return;
    requestAnimationFrame((next) => this.loop(next));

    for (const entity of this.entities.values()) {
      if (entity.__entityKind === 'echo') {
        entity.position.y = entity.__baseY + Math.sin(time * 0.004) * 0.12;
        entity.euler.y = time * 0.0015;
      } else if (entity.__entityKind === 'checkpoint') {
        entity.euler.y = time * 0.0008;
      } else if (entity.__entityKind === 'item') {
        entity.position.y = entity.__baseY + Math.sin(time * 0.003) * 0.04;
      } else if (entity.__entityKind === 'elite') {
        entity.euler.y = Math.sin(time * 0.001) * 0.08;
      }
    }

    this.forwardRenderer.render(this.scene, this.camera);
  }
}
