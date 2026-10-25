// ============================================================
//  《是噜噜吗？》—— Three.js 3D 橘子世界跑酷
//  世界：橘子大世界（橘子树/橘子小屋/三段天色变化）
//  主角：AI 生成的 3D 模型（models/character.glb，未加载时用备用小人）
//  玩法：三赛道跑酷 + 点击丢橘子打爆卡皮巴拉敌人
//  剧情：开场互动动画（可跳过）→ 途中事件 → 1500m 通关结局动画
// ============================================================

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ---------- 启动自检 ----------
// 双击 index.html（file:// 协议）时 ES 模块能加载，但部分浏览器仍会限制，
// 这里给出明确提示，避免"点了没反应"不知道原因
(function bootCheck() {
  const hint = document.getElementById('boot-hint');
  if (!hint) return;
  if (location.protocol === 'file:') {
    const err = document.getElementById('boot-error');
    if (err) {
      err.style.display = 'block';
      err.innerHTML = '⚠️ 检测到你是<b>直接双击打开</b>的 index.html，这样游戏跑不起来！<br />' +
        '正确方式二选一：<br />① VSCode 打开文件夹 → 右键 index.html → Open with Live Server<br />② 告诉 AI 助手，让它在本地起一个服务器给你链接';
    }
  }
  window.__hideBootHint = () => { const h = document.getElementById('boot-hint'); if (h) { h.style.transition = 'opacity .6s'; h.style.opacity = '0'; setTimeout(() => h.remove(), 700); } };
})();
// 注意：提示层不定时消失，改为在 animate() 第一帧渲染成功后调用 __hideBootHint()

// ---------- 游戏配置 ----------
const LANES = [-5.2, -2.6, 0, 2.6, 5.2];  // 五条赛道
const PLAYER_Z = 6;
const START_SPEED = 16;
const MAX_SPEED = 34;
const ACCEL = 0.45;
const GRAVITY = 38;
const JUMP_V = 13.5;
const SLIDE_TIME = 0.65;
const SPAWN_Z = -110;
const DESPAWN_Z = 16;
const WIN_DIST = 1500;
const THROW_CD = 0.35;          // 丢橘子冷却

// ---------- 渲染基础 ----------
const scene = new THREE.Scene();

// 天空渐变（区域切换时重绘）
const skyCanvas = document.createElement('canvas');
skyCanvas.width = 2; skyCanvas.height = 512;
const skyTex = new THREE.CanvasTexture(skyCanvas);
skyTex.colorSpace = THREE.SRGBColorSpace;
scene.background = skyTex;

const ZONES = [
  { name: '星夜橘园', sky: ['#0a0a2a', '#1a1a48', '#3a2a58', '#8a5a38'], fog: 0x3a2a50, star: 1,    sun: 0xdde8ff, light: 0x8aa0d0, snow: 0 },
  { name: '橘子晨光', sky: ['#7a8fc0', '#c0a8d0', '#ffb890', '#ffe8c0'], fog: 0xffd0a8, star: 0,    sun: 0xfff0c0, light: 0xffe0b8, snow: 0 },
  { name: '雪原橘镇', sky: ['#8aa8c8', '#b8c8d8', '#e4ecf4', '#f4f8fc'], fog: 0xe0eaf4, star: 0,    sun: 0xffffff, light: 0xeaf2ff, snow: 1 },
  { name: '橘子落日', sky: ['#4a3a80', '#c86a6a', '#ff9040', '#ffd080'], fog: 0xffa060, star: 0.1,  sun: 0xffcf7a, light: 0xffb070, snow: 0 },
];
const ZONE_STORY = {
  '橘子晨光': '天亮了！橘子城在晨光里慢慢醒来……那句话越来越清晰，跟着声音跑！',
  '雪原橘镇': '前面的橘子镇下起了雪！呼出的气都是白色的——噜妹的脚印通向雪地深处！',
  '橘子落日': '跑出雪原，夕阳把橘子染成了金色——噜妹的声音就在前方，最后一段路，冲！'
};
// 地面/路面/人行道材质（区域切换时染成雪色用）
let groundMat, walkMat, floorMat;
function drawSky(a, b, t) {
  const g = skyCanvas.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 512);
  const stops = [0, 0.45, 0.72, 1];
  for (let i = 0; i < 4; i++) {
    const c = new THREE.Color(a.sky[i]).lerp(new THREE.Color(b.sky[i]), t);
    grad.addColorStop(stops[i], '#' + c.getHexString());
  }
  g.fillStyle = grad;
  g.fillRect(0, 0, 2, 512);
  skyTex.needsUpdate = true;
}
drawSky(ZONES[0], ZONES[0], 0);
scene.fog = new THREE.Fog(ZONES[0].fog, 45, 130);

const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 300);
const GAME_CAM = {
  pos: new THREE.Vector3(0, 5.2, PLAYER_Z + 8.5),
  look: new THREE.Vector3(0, 2, PLAYER_Z - 12)
};
// 开场镜头（正面怼脸展示角色）→ 开跑时环绕到背后
const SWING_FROM_POS = new THREE.Vector3(0, 1.7, PLAYER_Z - 4.5);
const SWING_FROM_LOOK = new THREE.Vector3(0, 1.35, PLAYER_Z);
let camSwingT = -1;
function setCam(pos, look) {
  camera.position.set(pos[0], pos[1], pos[2]);
  camera.lookAt(look[0], look[1], look[2]);
}
function restoreCam() {
  camera.position.copy(GAME_CAM.pos);
  camera.lookAt(GAME_CAM.look);
}
setCam(GAME_CAM.pos.toArray(), GAME_CAM.look.toArray());

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.body.appendChild(renderer.domElement);

// ---------- 灯光 ----------
scene.add(new THREE.HemisphereLight(0xffe8d0, 0x8a6a4a, 1.0));
const sunLight = new THREE.DirectionalLight(0xffb070, 2.0);
sunLight.position.set(-14, 12, -30);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.left = -16;
sunLight.shadow.camera.right = 16;
sunLight.shadow.camera.top = 16;
sunLight.shadow.camera.bottom = -16;
scene.add(sunLight);

const sunBall = new THREE.Mesh(
  new THREE.SphereGeometry(14, 32, 32),
  new THREE.MeshBasicMaterial({ color: 0xfff0c0, fog: false })
);
sunBall.position.set(-24, 12, -140);
scene.add(sunBall);

// 星星
const starGeo = new THREE.BufferGeometry();
{
  const pos = [];
  for (let i = 0; i < 400; i++) {
    pos.push((Math.random() - 0.5) * 260, Math.random() * 90 + 15, -Math.random() * 180 - 30);
  }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
}
const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.7, transparent: true, opacity: 0, fog: false });
scene.add(new THREE.Points(starGeo, starMat));

// ---------- 降雪粒子（雪原区域） ----------
let curSnow = 0;  // 当前降雪强度 0~1（随区域渐变）
const snowCount = 700;
const snowGeo = new THREE.BufferGeometry();
{
  const pos = new Float32Array(snowCount * 3);
  for (let i = 0; i < snowCount; i++) {
    pos[i * 3]     = (Math.random() - 0.5) * 70;
    pos[i * 3 + 1] = Math.random() * 26;
    pos[i * 3 + 2] = -Math.random() * 130 + 12;
  }
  snowGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
}
const snowMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.32, transparent: true, opacity: 0, fog: false, depthWrite: false });
const snowPoints = new THREE.Points(snowGeo, snowMat);
scene.add(snowPoints);

// ---------- 橘子城：城市地面 ----------
{
  groundMat = new THREE.MeshStandardMaterial({ color: 0xdca76a, roughness: 0.95 });
  const ground = new THREE.Mesh(new THREE.BoxGeometry(320, 0.5, 520), groundMat);
  ground.position.set(0, -0.58, -140);
  ground.receiveShadow = true;
  scene.add(ground);
  // 人行道（赛道两侧的浅色步道）
  walkMat = new THREE.MeshStandardMaterial({ color: 0xf2d8a8, roughness: 0.9 });
  [-9.9, 9.9].forEach((x) => {
    const walk = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.42, 520), walkMat);
    walk.position.set(x, -0.52, -140);
    walk.receiveShadow = true;
    scene.add(walk);
  });
}

// ---------- 橘子城：街景建筑（循环移动） ----------
const cityProps = [];
{
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8a5a38, roughness: 0.9 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x5a9a44, roughness: 0.9 });
  const orangeMat = new THREE.MeshStandardMaterial({ color: 0xff9a2a, roughness: 0.55 });
  const orangeMat2 = new THREE.MeshStandardMaterial({ color: 0xffb35c, roughness: 0.6 });
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x7a4a28, roughness: 0.8 });
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xffd070, emissive: 0xffa030, emissiveIntensity: 0.9 });
  // 建筑墙面：用 canvas 画暖色墙 + 发光窗
  function makeWallTexture(base, win) {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = base; g.fillRect(0, 0, 128, 256);
    g.fillStyle = win;
    for (let ry = 0; ry < 6; ry++) {
      for (let rx = 0; rx < 3; rx++) {
        if (Math.random() < 0.25) continue; // 有些窗没亮灯，更自然
        g.fillRect(18 + rx * 38, 20 + ry * 38, 22, 26);
      }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
  const wallTexA = makeWallTexture('#ffb066', '#fff3c8');
  const wallTexB = makeWallTexture('#f2955a', '#ffe2a0');
  const wallMatA = new THREE.MeshStandardMaterial({ map: wallTexA, roughness: 0.85 });
  const wallMatB = new THREE.MeshStandardMaterial({ map: wallTexB, roughness: 0.85 });

  // 橘子大厦：楼体 + 巨大橘子圆顶
  function makeTower() {
    const g = new THREE.Group();
    const h = 4 + Math.random() * 6;
    const body = new THREE.Mesh(new THREE.BoxGeometry(3 + Math.random() * 1.5, h, 3 + Math.random() * 1.5),
      Math.random() < 0.5 ? wallMatA : wallMatB);
    body.position.y = h / 2; body.castShadow = true; body.receiveShadow = true;
    g.add(body);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1.6, 18, 14), Math.random() < 0.5 ? orangeMat : orangeMat2);
    dome.position.y = h + 1.0; dome.scale.y = 0.85; dome.castShadow = true;
    g.add(dome);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.5, 6), trunkMat);
    stem.position.y = h + 2.1; g.add(stem);
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.7, 6), leafMat);
    leaf.position.y = h + 2.45; leaf.rotation.x = Math.PI; g.add(leaf);
    return g;
  }
  // 橘子雕塑（街心公园那种）
  function makeOrangeStatue() {
    const g = new THREE.Group();
    const o = new THREE.Mesh(new THREE.SphereGeometry(1.4, 18, 16), orangeMat);
    o.position.y = 1.9; o.castShadow = true; g.add(o);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, 0.7, 12), poleMat);
    base.position.y = 0.35; g.add(base);
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.7, 6), leafMat);
    leaf.position.y = 3.5; leaf.rotation.x = Math.PI; g.add(leaf);
    return g;
  }
  // 橘子路灯
  function makeLamp() {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 3.6, 8), poleMat);
    pole.position.y = 1.8; pole.castShadow = true; g.add(pole);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 12), lampMat);
    lamp.position.y = 3.8; g.add(lamp);
    return g;
  }
  // 橘子树（城市行道树）
  function makeOrangeTreeCity() {
    const t = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, 1.8, 8), trunkMat);
    trunk.position.y = 0.9; trunk.castShadow = true;
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(1.5, 16, 14), leafMat);
    canopy.position.y = 2.6; canopy.scale.y = 0.85; canopy.castShadow = true;
    t.add(trunk, canopy);
    for (let k = 0; k < 4; k++) {
      const o = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 10), orangeMat);
      const a = Math.random() * Math.PI * 2;
      o.position.set(Math.cos(a) * 1.15, 2.6 + (Math.random() - 0.5) * 0.9, Math.sin(a) * 1.15);
      t.add(o);
    }
    return t;
  }
  const SPACING = 11, COUNT = 30;
  for (let i = 0; i < COUNT; i++) {
    const r = Math.random();
    const g = r < 0.42 ? makeTower() : (r < 0.62 ? makeLamp() : (r < 0.8 ? makeOrangeStatue() : makeOrangeTreeCity()));
    const side = (i % 2 === 0) ? -1 : 1;
    g.position.set(side * (13.5 + Math.random() * 9), -0.35, 16 - i * SPACING);
    g.rotation.y = Math.random() * Math.PI * 2;
    scene.add(g);
    cityProps.push(g);
  }
  cityProps._spacing = SPACING; cityProps._count = COUNT;
}

// ---------- 浮空赛道（橘子奶油配色） ----------
const SEG_LEN = 24, SEG_COUNT = 8;
const segments = [];
{
  floorMat = new THREE.MeshStandardMaterial({ color: 0xf0b070, roughness: 0.85 });
  const railMat = new THREE.MeshStandardMaterial({ color: 0xffd080, roughness: 0.5, emissive: 0x663300, emissiveIntensity: 0.4 });
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xfff0c0 });
  for (let i = 0; i < SEG_COUNT; i++) {
    const seg = new THREE.Group();
    const floor = new THREE.Mesh(new THREE.BoxGeometry(14.6, 0.6, SEG_LEN), floorMat);
    floor.receiveShadow = true;
    seg.add(floor);
    [-7.05, 7.05].forEach((x) => {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.35, SEG_LEN), railMat);
      rail.position.set(x, 0.45, 0);
      seg.add(rail);
    });
    [-3.9, -1.3, 1.3, 3.9].forEach((x) => {
      const line = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, SEG_LEN), lineMat);
      line.position.set(x, 0.31, 0);
      seg.add(line);
    });
    seg.position.y = -0.3;  // 路面顶面精确落在 y=0，角色/道具不再陷进地里
    seg.position.z = PLAYER_Z - i * SEG_LEN + SEG_LEN;
    scene.add(seg);
    segments.push(seg);
  }
}

// ---------- 橘子大世界布景：橘子树 + 橘子小屋 ----------
const sideProps = [];
{
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8a5a38, roughness: 0.9 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x5a9a44, roughness: 0.9 });
  const orangeMat = new THREE.MeshStandardMaterial({ color: 0xff9a2a, roughness: 0.6 });
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x8a5a38 });

  function makeOrangeTree() {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, 1.6, 8), trunkMat);
    trunk.position.y = 0.8; trunk.castShadow = true;
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(1.3, 16, 14), leafMat);
    canopy.position.y = 2.3; canopy.scale.y = 0.85; canopy.castShadow = true;
    g.add(trunk, canopy);
    for (let i = 0; i < 4; i++) {
      const o = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 10), orangeMat);
      const a = Math.random() * Math.PI * 2;
      o.position.set(Math.cos(a) * 1.0, 2.3 + (Math.random() - 0.5) * 0.8, Math.sin(a) * 1.0);
      g.add(o);
    }
    return g;
  }
  function makeOrangeHouse() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(1.25, 18, 16), orangeMat);
    body.position.y = 1.1; body.scale.y = 0.92; body.castShadow = true;
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.85, 0.12), doorMat);
    door.position.set(0, 0.45, 1.18);
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.5, 6), leafMat);
    leaf.position.y = 2.42; leaf.rotation.x = Math.PI;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.3, 6), trunkMat);
    stem.position.y = 2.35;
    g.add(body, door, leaf, stem);
    return g;
  }
  for (let i = 0; i < 26; i++) {
    const g = (i % 3 === 2) ? makeOrangeHouse() : makeOrangeTree();
    const side = (i % 2 === 0) ? -1 : 1;
    g.position.set(side * (10.2 + Math.random() * 2.5), -0.2, 14 - i * 7);
    g.rotation.y = Math.random() * Math.PI * 2;
    scene.add(g);
    sideProps.push(g);
  }
}

// ---------- 玩家 ----------
const player = new THREE.Group();
player.position.set(0, 0, PLAYER_Z);
scene.add(player);

const charSlot = new THREE.Group();
player.add(charSlot);

// 备用小人（模型没到位时顶替，圆润贴地不穿模）
const fallback = new THREE.Group();
{
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xffc93c, roughness: 0.7 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.75, 20, 20), bodyMat);
  body.scale.set(1, 1.25, 0.9);
  body.position.y = 1.0;
  body.castShadow = true;
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a });
  [-0.25, 0.25].forEach((x) => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 10), eyeMat);
    eye.position.set(x, 1.35, 0.62);
    fallback.add(eye);
  });
  fallback.add(body);
  fallback.rotation.y = Math.PI; // 和正式模型一致：面朝跑步方向
  charSlot.add(fallback);
}

let modelReady = false;
let charSceneRoot = null; // 保留引用，结局动画里克隆出噜妹
new GLTFLoader().load(
  'models/character.glb',
  (gltf) => {
    const model = gltf.scene;
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const s = 1.6 / Math.max(size.y, 0.001);
    model.scale.setScalar(s);
    model.position.x -= center.x * s;
    model.position.z -= center.z * s;
    model.position.y -= box.min.y * s;
    model.rotation.y = Math.PI; // 让角色背对玩家镜头、面朝跑步方向（-z）
    model.traverse((o) => {
      if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; }
    });
    charSlot.add(model);
    fallback.visible = false;
    charSceneRoot = model;
    modelReady = true;
    applySkin(); // 正式模型加载完，立刻穿上保存的皮肤
  },
  undefined,
  (p) => { // 加载进度：显示在启动提示层
    const el = document.getElementById('boot-progress');
    if (el && p.total > 0) {
      const pct = Math.min(100, Math.round((p.loaded / p.total) * 100));
      el.textContent = `正在加载噜噜模型… ${pct}%`;
    } else if (el) {
      el.textContent = `正在加载噜噜模型… ${(p.loaded / 1048576).toFixed(1)}MB`;
    }
  },
  () => { /* 加载失败继续用备用小人 */ }
);

// ---------- Boss 模型（奶龙）预加载 ----------
let bossTemplate = null;
new GLTFLoader().load(
  'models/boss.glb',
  (gltf) => {
    const m = gltf.scene;
    const box = new THREE.Box3().setFromObject(m);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const s = 4.6 / Math.max(size.y, 0.001);   // Boss 身高 4.6 米
    m.scale.setScalar(s);
    m.position.x -= center.x * s;
    m.position.z -= center.z * s;
    m.position.y -= box.min.y * s;             // 脚底贴地
    m.traverse((o) => {
      if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; }
    });
    bossTemplate = m;
  },
  undefined,
  () => { /* 加载失败退回卡皮巴拉 Boss */ }
);

const P = { lane: 1, x: 0, y: 0, vy: 0, jumping: false, sliding: false, slideT: 0, runT: 0 };

// ---------- 卡皮巴拉敌人 ----------
const enemies = [];
const dying = [];
function createCapy() {
  const g = new THREE.Group();
  const fur = new THREE.MeshStandardMaterial({ color: 0xb08050, roughness: 0.9 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x8a6038, roughness: 0.9 });
  const black = new THREE.MeshStandardMaterial({ color: 0x30241a });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.55, 18, 18), fur);
  body.scale.set(1.0, 0.92, 1.12); body.position.y = 0.62; body.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 18, 18), fur);
  head.scale.set(1.0, 0.88, 0.95); head.position.set(0, 1.15, 0.3);
  [-0.2, 0.2].forEach((x) => {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 10), dark);
    ear.position.set(x, 1.48, 0.18);
    g.add(ear);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), black);
    eye.position.set(x, 1.22, 0.64);
    g.add(eye);
  });
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), black);
  nose.position.set(0, 1.08, 0.72);
  [-0.3, 0.3].forEach((x) => {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.3, 8), dark);
    leg.position.set(x, 0.15, 0.3);
    g.add(leg);
  });
  g.add(body, head);
  return g;
}

// ---------- 丢出的橘子 ----------
const projectiles = [];
let throwCd = 0;
let throwAnimT = -1;
// 右键必杀技「转身特写」+ 橘子汽车
let specialCd = 0;      // 冷却剩余秒数
let specialT = -1;      // 特写小剧场进度（-1 = 未激活）
let quadBuffT = -1;     // 大招后的四连弹道剩余秒数（-1 = 无）
const SPECIAL_CD = 10;
const SPECIAL_DUR = 3.0;
const SPECIAL_CAM_POS = new THREE.Vector3(0.9, 1.5, PLAYER_Z + 2.4);  // 特写机位
const SPECIAL_CAM_LOOK = new THREE.Vector3(0, 1.15, PLAYER_Z);
// 橘子汽车（捡到飞上天）
const cars = [];
let flightT = -1;
const FLIGHT_DUR = 4.5;
// 飞行喷气特效粒子
const jetParts = [];
const jetGeo = new THREE.SphereGeometry(0.13, 8, 6);
function spawnJetFlame() {
  const cols = [0xffa030, 0xffd070, 0xfff0c0];
  const m = new THREE.Mesh(jetGeo, new THREE.MeshBasicMaterial({
    color: cols[Math.floor(Math.random() * 3)], transparent: true
  }));
  m.position.set(P.x + (Math.random() - 0.5) * 0.7, P.y + 0.25 + Math.random() * 0.35, PLAYER_Z + 0.7);
  scene.add(m);
  jetParts.push({ mesh: m, life: 0, vx: (Math.random() - 0.5) * 1.6, vy: -2 - Math.random() * 2.5, vz: 7 + Math.random() * 4 });
}
const projOrangeMat = new THREE.MeshStandardMaterial({ color: 0xff9a2a, roughness: 0.55 });
const projLeafMat = new THREE.MeshStandardMaterial({ color: 0x5a9a44 });

// ---------- Boss 战 ----------
let boss = null;            // { mesh, hp, maxHp, atkCd, hitT, level }
let nextBossDist = 500;     // 下次 Boss 出现距离
let bossLevel = 0;          // 越打越强
const BOSS_GAP = 600;       // 每隔 600 米一个 Boss
const bossBar = document.getElementById('boss-bar');
const bossFill = document.getElementById('boss-fill');
const bossName = document.getElementById('boss-name');
const BOSS_NAMES = ['野生奶龙', '暴走奶龙', '奶龙骑士', '究极奶龙魔神'];
// Boss 砸出的滚石
const bossRocks = [];
const rockMat = new THREE.MeshStandardMaterial({ color: 0x8a7260, roughness: 0.95, flatShading: true });
function spawnBossRock() {
  const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.75, 0), rockMat);
  m.position.set(boss.mesh.position.x + (Math.random() - 0.5) * 2, 0.75, boss.mesh.position.z);
  scene.add(m);
  bossRocks.push({ mesh: m, lane: Math.floor(Math.random() * LANES.length), spin: 2 + Math.random() * 4 });
  // 滚石朝玩家所在车道飘
  bossRocks[bossRocks.length - 1].targetX = LANES[Math.floor(Math.random() * LANES.length)];
}
function createBoss() {
  let g, baseS;
  if (bossTemplate) {
    g = bossTemplate.clone();          // 奶龙模型
    baseS = g.scale.x;
  } else {
    g = createCapy();                  // 模型没加载好时退回卡皮巴拉
    baseS = 4.2;
    g.scale.setScalar(baseS);
  }
  g.position.set(0, 0, SPAWN_Z);
  scene.add(g);
  const hp = 14 + bossLevel * 6;
  boss = { mesh: g, hp, maxHp: hp, atkCd: 2.0, hitT: -1, level: bossLevel, baseS };
  bossName.textContent = `🐉 ${BOSS_NAMES[Math.min(bossLevel, BOSS_NAMES.length - 1)]}`;
  bossFill.style.width = '100%';
  bossBar.classList.add('show');
  showBanner('⚠️ 拦路的奶龙出现！丢橘子打倒它！');
}
function defeatBoss() {
  const reward = 15 + bossLevel * 5;
  smashThing(boss.mesh, 5);
  coinCount += reward;
  coinsEl.textContent = coinCount;
  pop(coinsEl);
  saveShop();
  showBanner(`🎉 Boss 倒下了！奖励 ${reward} 个橘子！`);
  boss = null;
  bossLevel++;
  nextBossDist = distance + BOSS_GAP;
  bossBar.classList.remove('show');
}
function makeOrangeBall() {
  const g = new THREE.Group();
  const o = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 12), projOrangeMat);
  const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.22, 5), projLeafMat);
  leaf.position.y = 0.3; leaf.rotation.z = 0.6;
  g.add(o, leaf);
  return g;
}
function throwOrange() {
  if (throwCd > 0) return;
  throwCd = THROW_CD;
  throwAnimT = 0;
  // 四连弹道（大招后 buff）：一次射出 4 发扇形橘子
  if (quadBuffT > 0) {
    const spreads = [[-1.4, -7], [-0.5, -2.5], [0.5, 2.5], [1.4, 7]];
    for (const [dx, vx] of spreads) {
      const g = makeOrangeBall();
      g.position.set(P.x + dx * 0.3, P.y + 1.3, PLAYER_Z - 0.4);
      scene.add(g);
      projectiles.push({ mesh: g, v: new THREE.Vector3(vx, 2.6, -34) });
    }
    return;
  }
  const g = makeOrangeBall();
  g.position.set(P.x, P.y + 1.3, PLAYER_Z - 0.4);
  scene.add(g);
  projectiles.push({
    mesh: g,
    v: new THREE.Vector3(0, 2.6, -34)
  });
}

// ---------- 障碍物 & 金币 ----------
const obstacles = [];
const coins = [];
const crateMat = new THREE.MeshStandardMaterial({ color: 0xe08030, roughness: 0.8 });
const crateEdgeMat = new THREE.MeshStandardMaterial({ color: 0xa85a20, roughness: 0.8 });
const barMat = new THREE.MeshStandardMaterial({ color: 0xd86040, roughness: 0.5, emissive: 0x401008, emissiveIntensity: 0.5 });
const wallMat = new THREE.MeshStandardMaterial({ color: 0xff9a2a, roughness: 0.6, emissive: 0x663300, emissiveIntensity: 0.35 });
const coinMat = new THREE.MeshStandardMaterial({ color: 0xffa830, roughness: 0.25, metalness: 0.6, emissive: 0x905000, emissiveIntensity: 0.5 });

function spawnObstacle(zPos, forceLane) {
  const lane = (forceLane !== undefined) ? forceLane : Math.floor(Math.random() * LANES.length);
  const roll = Math.random();
  let mesh, type;
  if (roll < 0.4) {
    type = 'box';
    mesh = new THREE.Group();
    const crate = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.0, 1.0), crateMat);
    crate.position.y = 0.8; crate.castShadow = true;
    const edge = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.15, 1.1), crateEdgeMat);
    edge.position.y = 1.35;
    mesh.add(crate, edge);
    mesh.position.set(LANES[lane], 0, zPos);
  } else if (roll < 0.75) {
    type = 'bar';
    mesh = new THREE.Group();
    const bar = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 0.8), barMat);
    bar.position.y = 1.55;
    mesh.add(bar);
    [-1.0, 1.0].forEach((dx) => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.8, 8), barMat);
      post.position.set(dx, 0.9, 0);
      mesh.add(post);
    });
    mesh.position.set(LANES[lane], 0, zPos);
  } else {
    type = 'wall';
    mesh = new THREE.Mesh(new THREE.SphereGeometry(1.35, 18, 16), wallMat);
    mesh.scale.y = 0.95;
    mesh.castShadow = true;
    mesh.position.set(LANES[lane], 1.4, zPos);
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.5, 6), new THREE.MeshStandardMaterial({ color: 0x5a9a44 }));
    leaf.position.y = 1.5; leaf.rotation.x = Math.PI;
    mesh.add(leaf);
  }
  scene.add(mesh);
  obstacles.push({ mesh, type, lane });
}

function spawnCoinLine(zPos) {
  const lane = Math.floor(Math.random() * LANES.length);
  const n = 3 + Math.floor(Math.random() * 4);
  const arc = Math.random() < 0.4;
  for (let i = 0; i < n; i++) {
    const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.08, 20), coinMat);
    coin.rotation.x = Math.PI / 2;
    const y = arc ? 0.9 + Math.sin(i / (n - 1) * Math.PI) * 1.6 : 1.0;
    coin.position.set(LANES[lane], y, zPos - i * 2.2);
    scene.add(coin);
    coins.push({ mesh: coin });
  }
}

// ---------- 橘子汽车（随机出现，捡到飞上天） ----------
function spawnOrangeCar(zPos) {
  const g = new THREE.Group();
  const carBodyMat = new THREE.MeshStandardMaterial({ color: 0xff8a2a, roughness: 0.5 });
  const carCreamMat = new THREE.MeshStandardMaterial({ color: 0xfff0d0, roughness: 0.6 });
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x3a2a20, roughness: 0.9 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.6, 2.4), carBodyMat);
  body.position.y = 0.55; body.castShadow = true;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 1.1), carCreamMat);
  cabin.position.set(0, 1.05, -0.15); cabin.castShadow = true;
  g.add(body, cabin);
  [[-0.72, 0.8], [0.72, 0.8], [-0.72, -0.8], [0.72, -0.8]].forEach(([x, z]) => {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.22, 12), wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, 0.3, z);
    g.add(w);
  });
  const deco = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 12),
    new THREE.MeshStandardMaterial({ color: 0xff9a2a, roughness: 0.55 }));
  deco.position.set(0, 1.55, -0.15);
  const dleaf = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.25, 6),
    new THREE.MeshStandardMaterial({ color: 0x5a9a44 }));
  dleaf.position.set(0, 2.05, -0.15); dleaf.rotation.x = Math.PI;
  g.add(deco, dleaf);
  g.position.set(LANES[Math.floor(Math.random() * LANES.length)], 0, zPos);
  scene.add(g);
  cars.push({ mesh: g });
}

// ---------- 游戏状态 & UI ----------
let state = 'intro';        // intro / playing / ending / over / special / shop
let speed = START_SPEED;
let distance = 0;
let coinCount = 0;
let smashCount = 0;
let spawnDist = 14;
let enemyDist = 110;
let elapsed = 0;

// ============================================================
//  皮肤商店（橘子货币，localStorage 永久保存）
// ============================================================
const SKINS = [
  { id: 'classic', name: '经典黄', price: 0,  color: null },
  { id: 'cream',   name: '奶油白', price: 10, color: 0xfff2dc },
  { id: 'pink',    name: '樱花粉', price: 20, color: 0xffa8c8 },
  { id: 'mint',    name: '薄荷绿', price: 20, color: 0x8fe0b0 },
  { id: 'sky',     name: '天空蓝', price: 30, color: 0x8ab8ff },
  { id: 'lava',    name: '烈焰红', price: 40, color: 0xff5a4a },
];
const SHOP_KEY = 'lulu-shop-v1';
let shopData = { owned: ['classic'], current: 'classic' };
try {
  const saved = JSON.parse(localStorage.getItem(SHOP_KEY));
  if (saved && Array.isArray(saved.owned)) shopData = saved;
} catch (e) { /* 第一次玩，无存档 */ }
function saveShop() {
  try { localStorage.setItem(SHOP_KEY, JSON.stringify(shopData)); } catch (e) {}
}

// 给角色染色：保留贴图，把材质颜色向皮肤色靠拢；null = 恢复经典色
const origColors = new Map(); // material.uuid -> 原始颜色
function applySkin() {
  const skin = SKINS.find((s) => s.id === shopData.current) || SKINS[0];
  charSlot.traverse((o) => {
    if (!o.isMesh || !o.material || !o.material.color) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    mats.forEach((m) => {
      if (!m.color) return;
      if (!origColors.has(m.uuid)) origColors.set(m.uuid, m.color.clone());
      const orig = origColors.get(m.uuid);
      if (skin.color === null) m.color.copy(orig);
      else m.color.copy(orig).lerp(new THREE.Color(skin.color), 0.85); // 85% 染色，效果明显
    });
  });
}

const distEl = document.getElementById('dist');
const coinsEl = document.getElementById('coins');
const smashEl = document.getElementById('smash');
const overlay = document.getElementById('overlay');
const endPanel = document.getElementById('end-panel');
const finalScoreEl = document.getElementById('final-score');
const finalDetailEl = document.getElementById('final-detail');
const endTitle = document.getElementById('end-title');
const endStory = document.getElementById('end-story');
const cineTop = document.getElementById('cine-top');
const cineBottom = document.getElementById('cine-bottom');
const whiteFlash = document.getElementById('white-flash');
const cutDialog = document.getElementById('cut-dialog');
const cutWho = document.getElementById('cut-who');
const cutText = document.getElementById('cut-text');
const choiceBox = document.getElementById('cut-choice');
const choiceA = document.getElementById('choice-a');
const choiceB = document.getElementById('choice-b');
const skipBtn = document.getElementById('skip-btn');
const banner = document.getElementById('event-banner');
const bannerText = document.getElementById('event-text');
const feverTint = document.getElementById('fever-tint');
const storyBox = document.getElementById('story-box');
const storyText = document.getElementById('story-text');
const ctrlHint = document.getElementById('ctrl-hint');

function getScore() { return Math.floor(distance) + coinCount * 10 + smashCount * 5; }
function pop(el) {
  el.parentElement.classList.add('pop');
  setTimeout(() => el.parentElement.classList.remove('pop'), 150);
}
function showBanner(text) {
  bannerText.textContent = text;
  banner.style.opacity = '1';
  banner.style.transform = 'translateX(-50%) scale(1.08)';
  clearTimeout(showBanner._t);
  showBanner._t = setTimeout(() => {
    banner.style.opacity = '0';
    banner.style.transform = 'translateX(-50%) scale(1)';
  }, 2600);
}
let storyTimer = null;
function showStory(text) {
  storyText.textContent = text;
  storyBox.style.opacity = '1';
  clearTimeout(storyTimer);
  storyTimer = setTimeout(() => { storyBox.style.opacity = '0'; }, 4500);
}
function showHint(text, sec) {
  ctrlHint.textContent = text;
  ctrlHint.style.opacity = '1';
  clearTimeout(showHint._t);
  showHint._t = setTimeout(() => { ctrlHint.style.opacity = '0'; }, sec * 1000);
}
function flashTo(cb) {
  whiteFlash.style.opacity = '1';
  setTimeout(() => { if (cb) cb(); whiteFlash.style.opacity = '0'; }, 450);
}

// ---------- 特殊事件 ----------
const EVENT_LIST = ['rain', 'fever', 'magnet'];
let event = null;
let nextEventDist = 200;
function startEvent() {
  const type = EVENT_LIST[Math.floor(Math.random() * EVENT_LIST.length)];
  event = { type, t: 0, spawnT: 0 };
  if (type === 'rain') showBanner('🪙 特殊事件：金币雨！');
  if (type === 'fever') { showBanner('🔥 特殊事件：暴走模式！横冲直撞！'); feverTint.style.opacity = '1'; }
  if (type === 'magnet') showBanner('🧲 特殊事件：磁力时间！');
}
function endEvent() {
  if (event && event.type === 'fever') feverTint.style.opacity = '0';
  event = null;
}

// ---------- 区域切换 ----------
let zoneIdx = 0;
let zoneTransition = null;

// ============================================================
//  过场动画系统（剧本执行器）
// ============================================================
const Cut = {
  steps: [], idx: -1, onEnd: null, active: false,
  typing: false, typeI: 0, full: '', pending: null,
  start(steps, onEnd) {
    this.steps = steps.slice();
    this.idx = -1;
    this.onEnd = onEnd;
    this.active = true;
    cineTop.style.height = '11vh';
    cineBottom.style.height = '11vh';
    this.next();
  },
  next() {
    this.idx++;
    if (this.idx >= this.steps.length) { this.finish(); return; }
    const s = this.steps[this.idx];
    if (s.cam) setCam(s.cam[0], s.cam[1]);
    if (s.who !== undefined) {
      cutDialog.style.display = 'block';
      cutWho.textContent = s.who || '……';
      this.full = s.text;
      this.typeI = 0;
      cutText.textContent = '';
      this.typing = true;
    } else if (s.choice) {
      cutDialog.style.display = 'none';
      choiceBox.style.display = 'flex';
      choiceA.textContent = s.choice[0];
      choiceB.textContent = s.choice[1];
      this.pending = s.next;
    }
    // 纯动作步骤（有 dur 无 who 无 choice）由 update 推进
  },
  choose(i) {
    choiceBox.style.display = 'none';
    if (this.pending) this.steps.splice(this.idx + 1, 0, this.pending[i]);
    this.next();
  },
  advance() {
    if (!this.active) return;
    const s = this.steps[this.idx];
    if (!s || s.who === undefined) return;
    if (this.typing) { this.typing = false; cutText.textContent = this.full; return; }
    cutDialog.style.display = 'none';
    this.next();
  },
  update(dt) {
    if (!this.active) return;
    const s = this.steps[this.idx];
    if (!s) return;
    if (this.typing) {
      this.typeI += dt * 32;
      const n = Math.min(Math.floor(this.typeI), this.full.length);
      cutText.textContent = this.full.slice(0, n);
      if (n >= this.full.length) this.typing = false;
    }
    if (s.who === undefined && !s.choice && s.dur !== undefined) {
      this._t = (this._t || 0) + dt;
      const t = Math.min(1, this._t / s.dur);
      const e = t * t * (3 - 2 * t);
      if (s.camFrom) {
        const p = new THREE.Vector3(...s.camFrom[0]).lerp(new THREE.Vector3(...s.camTo[0]), e);
        const l = new THREE.Vector3(...s.camFrom[1]).lerp(new THREE.Vector3(...s.camTo[1]), e);
        camera.position.copy(p);
        camera.lookAt(l);
      }
      if (s.run) s.run(e);
      if (t >= 1) { this._t = 0; this.next(); }
    }
  },
  finish() {
    this.active = false;
    cutDialog.style.display = 'none';
    choiceBox.style.display = 'none';
    skipBtn.style.display = 'none';
    cineTop.style.height = '0';
    cineBottom.style.height = '0';
    const cb = this.onEnd;
    this.onEnd = null;
    if (cb) cb();
  }
};

// ---------- 噜妹（结局用） ----------
let lumei = null;
function makeLumei() {
  let g;
  if (modelReady && charSceneRoot) {
    g = charSceneRoot.clone(true);
    g.traverse((o) => {
      if (o.isMesh) {
        o.material = o.material.clone();
        if (o.material.color) o.material.color.lerp(new THREE.Color(0xff8fb8), 0.45);
      }
    });
    const box = new THREE.Box3().setFromObject(g);
    var topY = box.max.y;
  } else {
    g = fallback.clone(true);
    g.traverse((o) => {
      if (o.isMesh) {
        o.material = o.material.clone();
        o.material.color.lerp(new THREE.Color(0xff8fb8), 0.5);
      }
    });
    var topY = 1.75;
  }
  // 粉色蝴蝶结
  const bow = new THREE.Group();
  const bowMat = new THREE.MeshStandardMaterial({ color: 0xff5a8a, roughness: 0.5 });
  [-1, 1].forEach((s) => {
    const wing = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), bowMat);
    wing.scale.set(1.2, 0.7, 0.6);
    wing.position.x = s * 0.16;
    bow.add(wing);
  });
  const knot = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), bowMat);
  bow.add(knot);
  bow.position.set(0.3, topY + 0.05, 0);
  g.add(bow);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// ---------- 开场剧本 ----------
const introSteps = [
  { dur: 4.5, camFrom: [[-2.6, 1.7, PLAYER_Z - 4.2], [0, 1.35, PLAYER_Z]], camTo: [[2.6, 2.0, PLAYER_Z - 4.6], [0, 1.35, PLAYER_Z]] },
  { who: '', text: '橘子香气弥漫的异世界。噜噜从电视里跌出来，摔在了云海赛道上。' },
  { who: '？？？', text: '……是噜噜吗？' },
  { who: '噜噜', text: '？！那个声音——是噜妹吗？！' },
  { choice: ['是！我是噜噜！', '……等等，我是谁？'], next: [
    { who: '噜噜', text: '没错！是我！噜妹你在哪儿，我马上来！' },
    { who: '噜噜', text: '管我是谁——噜妹在等我，这就够了！' }
  ] },
  { who: '', text: '橘子在脚边滚来滚去。噜噜捡起一个掂了掂——嗯，手感刚好可以丢！' },
  { who: '', text: '（小提示：点击丢橘子；按右键，噜噜会慢慢转身亮相～捡到橘子汽车能飞上天；收集的橘子可以在左上角商店换新皮肤！）' },
];

// ---------- 结局剧本 ----------
function startEnding() {
  state = 'ending';
  endEvent();
  skipBtn.style.display = 'block';
  lumei = makeLumei();
  lumei.rotation.y = 0; // 噜妹面朝噜噜（+z 方向）
  lumei.position.set(0, 0, PLAYER_Z - 11);
  scene.add(lumei);
  Cut.start([
    { dur: 2.5, camFrom: [[3, 2.4, PLAYER_Z + 5], [0, 1.2, PLAYER_Z - 6]], camTo: [[2, 1.8, PLAYER_Z + 3.5], [0, 1.1, PLAYER_Z - 5]],
      run: (t) => { lumei.position.z = THREE.MathUtils.lerp(PLAYER_Z - 11, PLAYER_Z - 2.3, t); } },
    { who: '噜妹', text: '……噜噜？真的是、真的是噜噜吗？！' },
    { who: '噜噜', text: '是我！我丢着橘子跑过了三个橘子天地，来找你了！' },
    { dur: 2.2, camFrom: [[1.5, 1.6, PLAYER_Z + 3], [0, 1.0, PLAYER_Z - 2]], camTo: [[-1.5, 1.8, PLAYER_Z + 3], [0, 1.0, PLAYER_Z - 2]],
      run: (t) => {
        const h = Math.abs(Math.sin(t * Math.PI * 3)) * 0.45;
        player.position.y = h;
        lumei.position.y = h;
      } },
    { who: '噜噜 & 噜妹', text: '走吧——回家吃橘子！' },
  ], () => {
    showEndPanel(true);
  });
}

// ---------- 开始 / 结束 ----------
function startRun() {
  enemies.forEach((e) => scene.remove(e.mesh));
  projectiles.forEach((p) => scene.remove(p.mesh));
  obstacles.forEach((o) => scene.remove(o.mesh));
  coins.forEach((c) => scene.remove(c.mesh));
  if (lumei) { scene.remove(lumei); lumei = null; }
  enemies.length = 0;
  projectiles.length = 0;
  obstacles.length = 0;
  coins.length = 0;
  dying.length = 0;
  speed = START_SPEED;
  distance = 0;
  smashCount = 0;
  spawnDist = 14;
  enemyDist = 110;
  elapsed = 0;
  throwCd = 0;
  endEvent();
  nextEventDist = 200;
  zoneIdx = 0;
  zoneTransition = null;
  drawSky(ZONES[0], ZONES[0], 0);
  scene.fog.color.set(ZONES[0].fog);
  starMat.opacity = 0;
  curSnow = 0; snowMat.opacity = 0;
  groundMat.color.set(0xdca76a);
  walkMat.color.set(0xf2d8a8);
  floorMat.color.set(0xf0b070);
  sunBall.material.color.set(ZONES[0].sun);
  sunLight.color.set(ZONES[0].light);
  P.lane = 1; P.x = 0; P.y = 0; P.vy = 0;
  P.jumping = false; P.sliding = false; P.slideT = 0;
  specialCd = 0; specialT = -1; flightT = -1; quadBuffT = -1;
  if (boss) { scene.remove(boss.mesh); boss = null; }
  bossLevel = 0; nextBossDist = 500;
  bossBar.classList.remove('show');
  bossRocks.forEach((r) => scene.remove(r.mesh));
  bossRocks.length = 0;
  cars.forEach((c) => scene.remove(c.mesh));
  cars.length = 0;
  player.position.set(0, 0, PLAYER_Z);
  player.rotation.set(0, 0, 0);
  charSlot.rotation.set(0, 0, 0);
  charSlot.position.set(0, 0, 0);
  distEl.textContent = '0';
  updateBalance(); // 橘子是跨局银行，不清零
  smashEl.textContent = '0';
  overlay.classList.add('hidden');
  // 开跑：镜头从正面环绕 180° 摆到背后
  camSwingT = 0;
  camera.position.copy(SWING_FROM_POS);
  camera.lookAt(SWING_FROM_LOOK);
  state = 'playing';
  showHint('←→ 变道 · 空格跳 · ↓滑铲 · 点击丢橘子 · 右键必杀技 🍊', 4.5);
}

function showEndPanel(win) {
  state = 'over';
  bossBar.classList.remove('show');
  if (win) {
    endTitle.textContent = '「是噜噜吗？」——「是噜噜！」';
    endStory.textContent = '穿过橘子晨光、落日与星夜，噜噜终于找到了噜妹。两只小家伙抱着滚成了一团。';
  } else {
    endTitle.textContent = '摔了个屁股蹲儿！';
    endStory.textContent = '噜噜揉揉脑袋爬起来——不行，噜妹还在等它，再跑一次！';
  }
  finalScoreEl.textContent = getScore();
  finalDetailEl.textContent =
    `跑了 ${Math.floor(distance)} 米 · 累计 ${coinCount} 橘子（可去商店买皮肤）· 打飞 ${smashCount} 只卡皮巴拉`;
  overlay.classList.remove('hidden');
}

function gameOver() {
  if (state !== 'playing') return;
  bossBar.classList.remove('show');
  showEndPanel(false);
}

document.getElementById('restart-btn').addEventListener('click', startRun);
skipBtn.addEventListener('click', () => Cut.finish());
choiceA.addEventListener('click', (e) => { e.stopPropagation(); Cut.choose(0); });
choiceB.addEventListener('click', (e) => { e.stopPropagation(); Cut.choose(1); });

// ---------- 皮肤商店界面 ----------
const shopBtn = document.getElementById('shop-btn');
const shopBalanceEl = document.getElementById('shop-balance');
const shopPanel = document.getElementById('shop-panel');
const skinList = document.getElementById('skin-list');
let shopPrevState = null;

function updateBalance() {
  shopBalanceEl.textContent = coinCount;
  coinsEl.textContent = coinCount;
}

function renderShop() {
  skinList.innerHTML = '';
  SKINS.forEach((s) => {
    const card = document.createElement('div');
    card.className = 'skin-card' + (shopData.current === s.id ? ' equipped' : '');
    const owned = shopData.owned.includes(s.id);
    const hex = '#' + (s.color || 0xffc93c).toString(16).padStart(6, '0');
    card.innerHTML =
      `<div class="skin-color" style="background:${hex}"></div>` +
      `<div class="skin-name">${s.name}</div>` +
      (owned
        ? `<div class="skin-price owned">${shopData.current === s.id ? '✓ 使用中' : '点击换上'}</div>`
        : `<div class="skin-price">🍊 ${s.price}</div>`);
    card.addEventListener('click', () => {
      if (shopData.owned.includes(s.id)) {
        shopData.current = s.id; saveShop(); applySkin(); renderShop();
        showHint(`已换上「${s.name}」皮肤！`, 2);
      } else if (coinCount >= s.price) {
        coinCount -= s.price;
        shopData.owned.push(s.id);
        shopData.current = s.id;
        saveShop(); applySkin(); renderShop(); updateBalance();
        showHint(`🎉 购买成功，已换上「${s.name}」！`, 2.2);
      } else {
        card.querySelector('.skin-price').textContent = '橘子不够啦！';
        setTimeout(renderShop, 900);
      }
    });
    skinList.appendChild(card);
  });
}

function openShop() {
  if (state !== 'playing' && state !== 'over') return; // 过场动画中不开店
  shopPrevState = state;
  state = 'shop';       // 世界暂停
  // 镜头绕到正面看噜噜，换肤实时可见
  camera.position.set(1.6, 1.6, PLAYER_Z - 3.2);
  camera.lookAt(0, 1.1, PLAYER_Z);
  updateBalance(); renderShop();
  shopPanel.classList.add('open');
}
function closeShop() {
  shopPanel.classList.remove('open');
  camera.position.copy(GAME_CAM.pos);
  camera.lookAt(GAME_CAM.look);
  if (shopPrevState === 'over') {
    state = 'over';
    overlay.classList.remove('hidden'); // 恢复结算面板
  } else {
    state = 'playing';
  }
}
shopBtn.addEventListener('click', openShop);
document.getElementById('shop-close').addEventListener('click', closeShop);
updateBalance();
applySkin(); // 开局先穿上保存的皮肤（备用小人）

// ---------- 操作 ----------
const keys = {};
window.addEventListener('keydown', (e) => {
  if (keys[e.key]) return;
  keys[e.key] = true;
  if (Cut.active && (e.key === ' ' || e.key === 'Enter')) { Cut.advance(); return; }
  if (state !== 'playing') return;
  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') moveLane(-1);
  if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') moveLane(1);
  if (e.key === 'ArrowUp' || e.key === ' ' || e.key === 'w' || e.key === 'W') doJump();
  if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') doSlide();
});
window.addEventListener('keyup', (e) => { keys[e.key] = false; });

function moveLane(dir) { P.lane = THREE.MathUtils.clamp(P.lane + dir, 0, LANES.length - 1); }
function doJump() {
  if (!P.jumping) { P.jumping = true; P.vy = JUMP_V; P.sliding = false; }
}
function doSlide() {
  if (!P.sliding) {
    P.sliding = true; P.slideT = SLIDE_TIME;
    if (P.jumping) P.vy = -20;
  }
}

// ---------- 右键必杀技：慢速转身 + 脸部特写 ----------
const bigOrangeEl = document.getElementById('big-orange');
window.addEventListener('contextmenu', (e) => {
  e.preventDefault(); // 屏蔽浏览器右键菜单
  doSpecial();
});
function doSpecial() {
  if (state !== 'playing' || specialCd > 0 || specialT >= 0) {
    if (state === 'playing' && specialCd > 0) showHint(`必杀技冷却中… ${specialCd.toFixed(1)}s`, 1.2);
    return;
  }
  specialCd = SPECIAL_CD;
  specialT = 0;
  state = 'special';   // 世界暂停，进入特写小剧场（不放任何提示挡噜噜）
  bigOrangeEl.classList.remove('show');
  void bigOrangeEl.offsetWidth;
  bigOrangeEl.classList.add('show');
}
// 特写结束后的冲击波
function doShockwave() {
  let smashed = 0;
  enemies.slice().forEach((en) => {
    const z = en.mesh.position.z;
    if (z < PLAYER_Z + 3 && z > PLAYER_Z - 22) {
      smashThing(en.mesh, 2);
      enemies.splice(enemies.indexOf(en), 1);
      smashed++;
    }
  });
  if (smashed > 0) showHint(`🍊 橘子大爆发！震飞 ${smashed} 只卡皮巴拉！`, 1.6);
}
// 特写小剧场：慢慢转身面向镜头 → 定格卖萌 → 慢慢转回去
function updateSpecial(dt) {
  specialT += dt / SPECIAL_DUR;
  const t = specialT;
  const target = modelReady ? charSlot : fallback;
  const ease = (x) => x * x * (3 - 2 * x);
  if (t < 0.26) {
    // 阶段1：转身面向镜头（节奏更快），镜头同时推近
    const e = ease(t / 0.26);
    target.rotation.y = e * Math.PI;
    target.position.y = Math.sin(e * Math.PI) * 0.45;
    camera.position.lerpVectors(GAME_CAM.pos, SPECIAL_CAM_POS, e);
    camera.lookAt(new THREE.Vector3().lerpVectors(GAME_CAM.look, SPECIAL_CAM_LOOK, e));
  } else if (t < 0.6) {
    // 阶段2：脸部特写定格，左右轻轻摇摆卖萌
    target.rotation.y = Math.PI;
    const b = (t - 0.26) / 0.34;
    target.position.y = Math.abs(Math.sin(b * Math.PI * 3)) * 0.15;
    target.rotation.z = Math.sin(b * Math.PI * 4) * 0.09;
    camera.position.copy(SPECIAL_CAM_POS);
    camera.lookAt(SPECIAL_CAM_LOOK);
  } else {
    // 阶段3：转回去，镜头拉回跑酷视角
    const e = ease(Math.min(1, (t - 0.6) / 0.4));
    target.rotation.y = Math.PI + e * Math.PI;
    target.position.y = Math.sin(e * Math.PI) * 0.3;
    target.rotation.z = 0;
    camera.position.lerpVectors(SPECIAL_CAM_POS, GAME_CAM.pos, e);
    camera.lookAt(GAME_CAM.look);
    if (t >= 1) {
      specialT = -1;
      target.rotation.set(0, 0, 0);
      target.position.y = 0;
      state = 'playing';
      doShockwave();
      // 大招奖励：8 秒四连弹道
      quadBuffT = 8;
      showHint('🍊 四连弹道开启！8 秒！', 2.5);
    }
  }
}

let touchStart = null;
renderer.domElement.addEventListener('pointerdown', (e) => {
  touchStart = { x: e.clientX, y: e.clientY, t: Date.now() };
});
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!touchStart) return;
  const dx = e.clientX - touchStart.x;
  const dy = e.clientY - touchStart.y;
  const dtms = Date.now() - touchStart.t;
  touchStart = null;
  if (Cut.active) { Cut.advance(); return; }
  if (state !== 'playing') return;
  if (Math.abs(dx) > 30 || Math.abs(dy) > 30) {
    if (Math.abs(dx) > Math.abs(dy)) moveLane(dx > 0 ? 1 : -1);
    else if (dy < 0) doJump();
    else doSlide();
  } else if (dtms < 350) {
    throwOrange(); // 轻点 = 丢橘子
  }
});

// ---------- 碰撞 ----------
function playerHitbox() {
  const h = P.sliding ? 0.9 : 1.9;
  return { x: P.x, yMin: P.y, yMax: P.y + h };
}
function hitTest(oMinY, oMaxY, oX, oZ, tolerance) {
  if (Math.abs(oZ - PLAYER_Z) > 1.0) return false;
  if (Math.abs(oX - P.x) > (tolerance || 1.5)) return false;
  const hb = playerHitbox();
  return hb.yMin < oMaxY && hb.yMax > oMinY;
}
function smashThing(mesh, reward) {
  mesh.traverse((o) => {
    if (o.isMesh) {
      o.material = o.material.clone();
      o.material.transparent = true;
    }
  });
  dying.push({ mesh, t: 0 });
  smashCount += reward;
  smashEl.textContent = smashCount;
  pop(smashEl);
}

// ---------- 主循环 ----------
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  // 第一帧渲染成功，撤掉启动自检层
  if (!animate._booted) {
    animate._booted = true;
    if (window.__hideBootHint) window.__hideBootHint();
  }

  // 橘子城街景循环：游戏中全速后移（与路面一致），过场时缓缓漂流
  const cityMove = state === 'playing'
    ? (speed + (event && event.type === 'fever' ? 10 : 0) + (flightT >= 0 ? speed * 1.4 : 0)) * dt
    : 0.7 * dt;
  cityProps.forEach((g) => {
    g.position.z += cityMove;
    if (g.position.z > 24) g.position.z -= cityProps._spacing * cityProps._count;
  });
  sideProps.forEach((g) => {
    g.position.z += cityMove;
    if (g.position.z > 24) g.position.z -= 26 * 7;
  });

  if (Cut.active) Cut.update(dt);
  throwCd -= dt;
  if (quadBuffT > 0) quadBuffT -= dt;
  if (specialCd > 0) specialCd = Math.max(0, specialCd - dt);

  // 喷气粒子更新
  for (let i = jetParts.length - 1; i >= 0; i--) {
    const p = jetParts[i];
    p.life += dt;
    p.mesh.position.x += p.vx * dt;
    p.mesh.position.y += p.vy * dt;
    p.mesh.position.z += p.vz * dt;
    p.mesh.material.opacity = Math.max(0, 0.9 - p.life * 1.7);
    p.mesh.scale.setScalar(Math.max(0.05, 1 - p.life * 1.5));
    if (p.life > 0.6) { scene.remove(p.mesh); p.mesh.material.dispose(); jetParts.splice(i, 1); }
  }

  if (state === 'playing') {
    elapsed += dt;
    speed = Math.min(MAX_SPEED, speed + ACCEL * dt);
    const feverBoost = (event && event.type === 'fever') ? 10 : 0;
    const flightBoost = (flightT >= 0) ? speed * 1.4 : 0; // 飞行时大幅提速
    const move = (speed + feverBoost + flightBoost) * dt;
    distance += move;
    distEl.textContent = Math.floor(distance);

    // 赛道循环
    segments.forEach((seg) => {
      seg.position.z += move;
      if (seg.position.z > PLAYER_Z + SEG_LEN) seg.position.z -= SEG_LEN * SEG_COUNT;
    });

    // 区域切换
    const newZone = Math.floor(distance / 375) % ZONES.length;
    if (newZone !== zoneIdx && !zoneTransition) {
      zoneIdx = newZone;
      zoneTransition = { from: ZONES[(zoneIdx + ZONES.length - 1) % ZONES.length], to: ZONES[zoneIdx], t: 0 };
      showBanner('✨ 进入新区域 · ' + ZONES[zoneIdx].name);
      if (ZONE_STORY[ZONES[zoneIdx].name]) showStory(ZONE_STORY[ZONES[zoneIdx].name]);
    }
    if (zoneTransition) {
      zoneTransition.t = Math.min(1, zoneTransition.t + dt / 3);
      const { from, to, t } = zoneTransition;
      drawSky(from, to, t);
      scene.fog.color.set(from.fog).lerp(new THREE.Color(to.fog), t);
      starMat.opacity = THREE.MathUtils.lerp(from.star, to.star, t);
      sunBall.material.color.set(from.sun).lerp(new THREE.Color(to.sun), t);
      sunLight.color.set(from.light).lerp(new THREE.Color(to.light), t);
      // 雪地染色：路面/人行道/大地渐变覆雪
      curSnow = THREE.MathUtils.lerp(from.snow || 0, to.snow || 0, t);
      const snowWhite = new THREE.Color(0xf2f7fc);
      groundMat.color.set(0xdca76a).lerp(snowWhite, curSnow);
      walkMat.color.set(0xf2d8a8).lerp(new THREE.Color(0xffffff), curSnow);
      floorMat.color.set(0xf0b070).lerp(new THREE.Color(0xe8f0f8), curSnow);
      if (t >= 1) zoneTransition = null;
    }
    snowMat.opacity = curSnow * 0.95;
    // 雪花飘落
    if (curSnow > 0.01) {
      const arr = snowGeo.attributes.position.array;
      for (let i = 0; i < snowCount; i++) {
        arr[i * 3 + 1] -= (2.2 + (i % 5) * 0.7) * dt;
        arr[i * 3] += Math.sin(elapsed * 1.5 + i) * dt * 0.6;
        arr[i * 3 + 2] += (state === 'playing' ? speed : 1) * dt * 0.25;
        if (arr[i * 3 + 1] < 0) { arr[i * 3 + 1] = 26; arr[i * 3 + 2] = -Math.random() * 130 + 12; }
        if (arr[i * 3 + 2] > 16) arr[i * 3 + 2] -= 140;
      }
      snowGeo.attributes.position.needsUpdate = true;
    }

    // 特殊事件
    if (!event && distance > nextEventDist) {
      startEvent();
      nextEventDist = distance + 260 + Math.random() * 140;
    }
    if (event) {
      event.t += dt;
      if (event.type === 'rain') {
        event.spawnT -= dt;
        if (event.spawnT <= 0) { spawnCoinLine(SPAWN_Z + 8); event.spawnT = 0.45; }
      }
      if (event.t >= (event.type === 'magnet' ? 7 : 5)) endEvent();
    }

    // 玩家
    P.x += (LANES[P.lane] - P.x) * Math.min(1, dt * 12);
    if (flightT >= 0) {
      // 飞行中：正弦升空再平稳落地，空中无敌、喷气、超速
      flightT += dt / FLIGHT_DUR;
      if (flightT >= 1) { flightT = -1; P.y = 0; P.vy = 0; P.jumping = false; }
      else { P.y = Math.sin(flightT * Math.PI) * 7; P.jumping = false; P.sliding = false; }
      spawnJetFlame(); // 喷气特效
    } else if (P.jumping || P.y > 0) {
      P.vy -= GRAVITY * dt;
      P.y += P.vy * dt;
      if (P.y <= 0) { P.y = 0; P.vy = 0; P.jumping = false; }
    }
    if (P.sliding) {
      P.slideT -= dt;
      if (P.slideT <= 0) P.sliding = false;
    }
    player.position.x = P.x;
    player.position.y = P.y;
    // 镜头环绕过渡（正面 → 背后）
    if (camSwingT >= 0) {
      camSwingT += dt / 1.6;
      const e = Math.min(1, camSwingT);
      const s = e * e * (3 - 2 * e);
      camera.position.lerpVectors(SWING_FROM_POS, GAME_CAM.pos, s);
      camera.lookAt(new THREE.Vector3().lerpVectors(SWING_FROM_LOOK, GAME_CAM.look, s));
      if (e >= 1) camSwingT = -1;
    }
    // 飞行时镜头跟着噜噜升高
    else if (flightT >= 0) {
      const fy = Math.sin(Math.min(flightT, 1) * Math.PI) * 7;
      camera.position.set(P.x * 0.4, 5.2 + fy * 0.85, PLAYER_Z + 8.5);
      camera.lookAt(P.x * 0.5, 2 + fy * 0.9, PLAYER_Z - 12);
    }
    // 跑步动作：起伏 + 压扁拉伸 + 摇摆 + 转向倾斜
    P.runT += dt * speed * 0.9;
    const target = modelReady ? charSlot : fallback;
    if (P.sliding) {
      target.position.y = 0.05;
      target.rotation.x = -1.1;
      target.scale.set(1.15, 0.65, 1.15);
    } else {
      target.position.y = Math.abs(Math.sin(P.runT)) * 0.12;
      target.rotation.x = P.jumping ? 0.12 : 0;
      const sq = P.jumping ? 1 : 1 + Math.sin(P.runT * 2) * 0.05;
      target.scale.set(1 - (sq - 1) * 0.7, sq, 1 - (sq - 1) * 0.7);
    }
    target.rotation.z = (LANES[P.lane] - P.x) * -0.15 +
      (P.jumping || P.sliding ? 0 : Math.sin(P.runT) * 0.05);
    // 丢橘子投掷动作（前倾后回弹）
    if (throwAnimT >= 0) {
      throwAnimT += dt / 0.28;
      if (throwAnimT >= 1) throwAnimT = -1;
      else target.rotation.x += -0.55 * Math.sin(throwAnimT * Math.PI);
    }

    // 生成障碍 / 金币 / 敌人 / 橘子汽车（飞行时全是金币！）
    spawnDist -= move;
    if (spawnDist <= 0) {
      if (flightT >= 0) {
        spawnCoinLine(SPAWN_Z - 4);
        spawnDist = 7;
      } else if (!boss) {  // Boss 战期间不刷普通障碍，专心打
        spawnObstacle(SPAWN_Z);
        // 高速时多车道同时封路（5 条道最多封 3 条，必有活路但要快速反应）
        const blocked = new Set();
        obstacles.length > 0 && blocked.add(obstacles[obstacles.length - 1].lane);
        if (speed > 19 && Math.random() < 0.4) {
          let l2; do { l2 = Math.floor(Math.random() * LANES.length); } while (blocked.has(l2));
          spawnObstacle(SPAWN_Z + (Math.random() - 0.5) * 2, l2);
          blocked.add(l2);
        }
        if (speed > 26 && Math.random() < 0.3) {
          let l3; do { l3 = Math.floor(Math.random() * LANES.length); } while (blocked.has(l3));
          spawnObstacle(SPAWN_Z + (Math.random() - 0.5) * 2, l3);
        }
        if (Math.random() < 0.75) spawnCoinLine(SPAWN_Z - 8);
        if (Math.random() < 0.09 && cars.length < 2) spawnOrangeCar(SPAWN_Z - 16);
        const gap = THREE.MathUtils.lerp(16, 9, (speed - START_SPEED) / (MAX_SPEED - START_SPEED));
        spawnDist = gap * (0.85 + Math.random() * 0.4);
      } else {
        if (Math.random() < 0.5) spawnCoinLine(SPAWN_Z - 8);  // Boss 战只有少量金币补给
        spawnDist = 9;
      }
    }
    if (!boss) {
      enemyDist -= move;
      if (enemyDist <= 0) {
        const capy = createCapy();
        const lane = Math.floor(Math.random() * LANES.length);
        capy.position.set(LANES[lane], 0, SPAWN_Z);
        scene.add(capy);
        enemies.push({ mesh: capy, lane, ownSpeed: 3.2 + elapsed * 0.03 });
        enemyDist = 55 + Math.random() * 55;
      }
    }

    // ---------- Boss 战 ----------
    if (!boss && distance >= nextBossDist) createBoss();
    if (boss) {
      const bz = boss.mesh.position.z;
      // 逼近到玩家前方 16 米处停下（保持距离，不压迫），左右缓慢跟踪玩家
      if (bz < PLAYER_Z - 16) {
        boss.mesh.position.z = Math.min(PLAYER_Z - 16, bz + move);
      }
      boss.mesh.position.x += (P.x - boss.mesh.position.x) * Math.min(1, dt * 0.7);
      boss.mesh.position.x = THREE.MathUtils.clamp(boss.mesh.position.x, LANES[0], LANES[LANES.length - 1]);
      // 呼吸 + 蹦跳威慑动画
      const bs = boss.baseS * (1 + Math.sin(elapsed * 6) * 0.02);
      boss.mesh.scale.setScalar(bs);
      boss.mesh.position.y = Math.abs(Math.sin(elapsed * 5)) * 0.25;
      boss.mesh.rotation.z = Math.sin(elapsed * 4) * 0.05;
      // 受击闪红回弹
      if (boss.hitT >= 0) {
        boss.hitT += dt * 6;
        const punch = 1 + Math.sin(boss.hitT * Math.PI) * 0.12;
        boss.mesh.scale.setScalar(bs * punch);
        if (boss.hitT >= 1) boss.hitT = -1;
      }
      // 定时砸滚石
      boss.atkCd -= dt;
      if (boss.atkCd <= 0 && bz > SPAWN_Z * 0.4) {
        spawnBossRock();
        if (bossLevel >= 1) spawnBossRock();  // 高等级 Boss 一次砸两块
        boss.atkCd = Math.max(1.0, 2.0 - bossLevel * 0.25);
      }
    }
    // Boss 滚石更新
    for (let i = bossRocks.length - 1; i >= 0; i--) {
      const r = bossRocks[i];
      r.mesh.position.z += move + 13 * dt;
      r.mesh.position.x += (r.targetX - r.mesh.position.x) * dt * 1.5;
      r.mesh.rotation.x -= r.spin * dt;
      if (r.mesh.position.z > DESPAWN_Z) { scene.remove(r.mesh); bossRocks.splice(i, 1); continue; }
      if (flightT < 0 && hitTest(0.15, 1.5, r.mesh.position.x, r.mesh.position.z, 0.9)) {
        gameOver();
        break;
      }
    }

    // 障碍更新
    for (let i = obstacles.length - 1; i >= 0; i--) {
      const o = obstacles[i];
      o.mesh.position.z += move;
      if (o.mesh.position.z > DESPAWN_Z) { scene.remove(o.mesh); obstacles.splice(i, 1); continue; }
      let oMinY = 0.3, oMaxY = 1.3;
      if (o.type === 'bar') { oMinY = 1.3; oMaxY = 2.6; }
      if (o.type === 'wall') { oMaxY = 2.9; }
      if (flightT >= 0) continue; // 飞行中无敌
      if (hitTest(oMinY, oMaxY, o.mesh.position.x, o.mesh.position.z)) {
        if (event && event.type === 'fever') {
          smashThing(o.mesh, 1);
          obstacles.splice(i, 1);
          continue;
        }
        gameOver();
        break;
      }
    }

    // 敌人更新
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      e.mesh.position.z += move + e.ownSpeed * dt;
      e.mesh.rotation.z = Math.sin(elapsed * 10 + i) * 0.08;
      e.mesh.position.y = Math.abs(Math.sin(elapsed * 8 + i)) * 0.08;
      if (e.mesh.position.z > DESPAWN_Z) { scene.remove(e.mesh); enemies.splice(i, 1); continue; }
      if (flightT >= 0) continue; // 飞行中无敌
      if (hitTest(0.1, 1.45, e.mesh.position.x, e.mesh.position.z, 1.4)) {
        if (event && event.type === 'fever') {
          smashThing(e.mesh, 2);
          enemies.splice(i, 1);
          continue;
        }
        gameOver();
        break;
      }
    }

    // 橘子汽车更新
    for (let i = cars.length - 1; i >= 0; i--) {
      const car = cars[i];
      car.mesh.position.z += move;
      car.mesh.rotation.y = Math.sin(elapsed * 3 + i) * 0.08;
      const cp = car.mesh.position;
      if (cp.z > DESPAWN_Z) { scene.remove(car.mesh); cars.splice(i, 1); continue; }
      if (flightT < 0 && Math.abs(cp.z - PLAYER_Z) < 1.5 && Math.abs(cp.x - P.x) < 1.5) {
        flightT = 0;  // 捡到！起飞！
        coinCount += 5; coinsEl.textContent = coinCount;
        shopBalanceEl.textContent = coinCount;
        saveShop(); // 橘子进银行，立刻保存
        pop(coinsEl); // 顺手奖励5金币
        showHint('🚗 橘子汽车！噜噜飞上天啦！', 1.8);
        scene.remove(car.mesh);
        cars.splice(i, 1);
      }
    }

    // 金币更新
    for (let i = coins.length - 1; i >= 0; i--) {
      const c = coins[i];
      c.mesh.position.z += move;
      c.mesh.rotation.y += dt * 4;
      const cp = c.mesh.position;
      if (cp.z > DESPAWN_Z) { scene.remove(c.mesh); coins.splice(i, 1); continue; }
      if (flightT >= 0 || (event && event.type === 'magnet')) {
        const dx = P.x - cp.x, dy = (P.y + 1) - cp.y, dz = PLAYER_Z - cp.z;
        const r2 = flightT >= 0 ? 220 : 81; // 飞行时吸橘子范围更大
        if (dx * dx + dy * dy + dz * dz < r2) {
          cp.x += dx * dt * 8; cp.y += dy * dt * 8; cp.z += dz * dt * 8;
        }
      }
      const hb = playerHitbox();
      if (Math.abs(cp.z - PLAYER_Z) < 1.1 && Math.abs(cp.x - P.x) < 1.2 &&
          cp.y > hb.yMin - 0.4 && cp.y < hb.yMax + 0.4) {
        coinCount++;
        coinsEl.textContent = coinCount;
        shopBalanceEl.textContent = coinCount;
        saveShop(); // 橘子进银行，立刻保存
        pop(coinsEl);
        scene.remove(c.mesh);
        coins.splice(i, 1);
      }
    }

    // 橘子炮弹
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      p.v.y -= 10 * dt;   // 弹道更平，射程更远（能打到 16 米外的奶龙）
      p.mesh.position.addScaledVector(p.v, dt);
      p.mesh.position.z += move * 0.4;
      p.mesh.rotation.x -= dt * 9;
      let removed = false;
      // 打 Boss
      if (!removed && boss) {
        const bc = boss.mesh.position.clone(); bc.y += 2.2;
        if (p.mesh.position.distanceTo(bc) < 3.4) {
          boss.hp--;
          boss.hitT = 0;
          bossFill.style.width = Math.max(0, (boss.hp / boss.maxHp) * 100) + '%';
          scene.remove(p.mesh);
          projectiles.splice(i, 1);
          removed = true;
          if (boss.hp <= 0) defeatBoss();
        }
      }
      if (removed) continue;
      // 打掉滚石
      for (let j = bossRocks.length - 1; j >= 0; j--) {
        const r = bossRocks[j];
        if (p.mesh.position.distanceTo(r.mesh.position.clone().setY(0.75)) < 1.3) {
          smashThing(r.mesh, 1);
          bossRocks.splice(j, 1);
          scene.remove(p.mesh);
          projectiles.splice(i, 1);
          removed = true;
          break;
        }
      }
      if (removed) continue;
      // 打敌人
      for (let j = enemies.length - 1; j >= 0; j--) {
        const e = enemies[j];
        if (p.mesh.position.distanceTo(e.mesh.position.clone().setY(e.mesh.position.y + 0.7)) < 1.1) {
          smashThing(e.mesh, 2);
          enemies.splice(j, 1);
          scene.remove(p.mesh);
          projectiles.splice(i, 1);
          removed = true;
          break;
        }
      }
      if (removed) continue;
      // 打木箱
      for (let j = obstacles.length - 1; j >= 0; j--) {
        const o = obstacles[j];
        if (o.type !== 'box') continue;
        if (p.mesh.position.distanceTo(o.mesh.position.clone().setY(0.8)) < 1.2) {
          smashThing(o.mesh, 1);
          obstacles.splice(j, 1);
          scene.remove(p.mesh);
          projectiles.splice(i, 1);
          removed = true;
          break;
        }
      }
      if (removed) continue;
      if (p.mesh.position.y < 0.2 || p.mesh.position.z < -90) {
        scene.remove(p.mesh);
        projectiles.splice(i, 1);
      }
    }

    // 碎裂动画
    for (let i = dying.length - 1; i >= 0; i--) {
      const d = dying[i];
      d.t += dt * 3.5;
      const s = 1 + d.t * 0.5;
      d.mesh.scale.setScalar(s);
      d.mesh.traverse((o) => { if (o.isMesh && o.material.opacity !== undefined) o.material.opacity = 1 - d.t; });
      if (d.t >= 1) { scene.remove(d.mesh); dying.splice(i, 1); }
    }

    // 通关终点
    if (distance >= WIN_DIST) startEnding();
  } else if (state === 'special') {
    // 必杀技特写小剧场（世界暂停，镜头专心拍噜噜）
    updateSpecial(dt);
  }

  renderer.render(scene, camera);
}

// ============================================================
//  背景音乐（WebAudio 程序化生成，无需音频文件）
// ============================================================
let audioCtx = null, musicMuted = false, musicStep = 0, musicNext = 0, musicGain = null;
const NT = { C3:130.81, A3:220.00, F3:174.61, G3:196.00, A4:440.00, C5:523.25, D5:587.33, E5:659.25, G5:783.99, A5:880.00, C6:1046.50 };
const MELODY = [
  NT.C5, NT.E5, NT.G5, NT.A5,  NT.C6, NT.A5, NT.G5, NT.E5,
  NT.D5, NT.E5, NT.G5, NT.A5,  NT.G5, NT.E5, NT.D5, NT.C5,
  NT.C5, NT.E5, NT.G5, NT.A5,  NT.C6, NT.A5, NT.G5, NT.E5,
  NT.D5, NT.E5, NT.D5, NT.C5,  NT.A4, NT.C5, NT.D5, NT.E5,
];
const BASSLINE = [NT.C3, NT.A3, NT.F3, NT.G3];
const STEP_TIME = 0.16;
function playNote(freq, time, dur, type, vol) {
  const o = audioCtx.createOscillator(), g = audioCtx.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(vol, time);
  g.gain.exponentialRampToValueAtTime(0.001, time + dur);
  o.connect(g); g.connect(musicGain);
  o.start(time); o.stop(time + dur);
}
function musicTick() {
  if (!audioCtx || musicMuted) return;
  const now = audioCtx.currentTime;
  if (musicNext < now) musicNext = now + 0.05;
  while (musicNext < now + 0.35) {
    const i = musicStep % 32;
    playNote(MELODY[i], musicNext, STEP_TIME * 0.95, 'square', 0.045);
    if (i % 4 === 0) playNote(BASSLINE[(i / 4) % 4], musicNext, STEP_TIME * 3.6, 'triangle', 0.09);
    musicStep++;
    musicNext += STEP_TIME;
  }
}
function startMusic() {
  if (musicMuted) return;
  if (bgmState === 'ready' && bgmAudio) {
    // 有用户自定义音乐 → 播它，不用合成音乐
    bgmAudio.play().catch(() => {});
    return;
  }
  if (bgmState === 'pending') {
    // 自定义音乐还在加载，等它 2 秒；加载失败/超时才用合成音乐
    setTimeout(() => {
      if (!musicMuted && bgmState === 'ready' && bgmAudio) bgmAudio.play().catch(() => {});
      else if (!musicMuted && bgmState !== 'ready') startSynthMusic();
    }, 2000);
    return;
  }
  startSynthMusic();
}
function startSynthMusic() {
  if (audioCtx) return;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    musicGain = audioCtx.createGain();
    musicGain.gain.value = musicMuted ? 0 : 0.5;
    musicGain.connect(audioCtx.destination);
    musicNext = audioCtx.currentTime + 0.1;
    setInterval(musicTick, 120);
  } catch (e) { /* 浏览器不支持就算了 */ }
}
// 浏览器自动播放限制：首次点击/按键时启动音乐
window.addEventListener('pointerdown', startMusic);
window.addEventListener('keydown', startMusic);

// 用户自定义音乐：把 mp3/wav 放到 music/bgm.mp3 就会优先播放，
// 没有该文件时自动回退到上面的合成音乐
let bgmAudio = null, bgmState = 'pending'; // pending / ready / failed
function tryLoadBgmFile() {
  const a = new Audio();
  a.loop = true;
  a.volume = 0.55;
  a.addEventListener('canplaythrough', () => { bgmState = 'ready'; bgmAudio = a; }, { once: true });
  a.addEventListener('error', () => { bgmState = 'failed'; }, { once: true });
  a.src = 'music/bgm.mp3';
  a.load();
}
tryLoadBgmFile();

const musicBtn = document.getElementById('music-btn');
musicBtn.addEventListener('click', () => {
  musicMuted = !musicMuted;
  musicBtn.textContent = musicMuted ? '🎵 音乐关' : '🎵 音乐开';
  if (bgmAudio) {
    if (musicMuted) bgmAudio.pause(); else bgmAudio.play().catch(() => {});
  } else if (audioCtx) {
    if (musicMuted) audioCtx.suspend(); else audioCtx.resume();
  }
});

// ---------- 启动开场动画 ----------
Cut.start(introSteps, () => startRun());

// ---------- 启动主渲染循环 ----------
animate();

// ---------- 窗口自适应 ----------
window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
