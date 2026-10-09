import * as THREE from 'three';
import {createRiverWater} from './river-water.js';
import {createSakuraTrees} from './sakura-trees.js';
import {createGreenTrees} from './green-trees.js';
import {createRidgeForest} from './ridge-forest.js';
import {createGrass} from './grass.js';
import {createRocks} from './rocks.js';

// Every resource belongs to this world instance. No renderer, scene lighting,
// collision state, or shared track data is changed here.
export const riverCenter = z => 18 * Math.sin(z / 65);
const RIVER_HALF = 16;
const up = new THREE.Vector3(0, 1, 0);

function seededRandom(seed = 62473) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}

class Instances {
  constructor(root) { this.root = root; this.batches = new Map(); this.dummy = new THREE.Object3D(); }
  add(geometry, material, position, scale = [1, 1, 1], rotation = [0, 0, 0], color = null) {
    const key = geometry.uuid + material.uuid;
    if (!this.batches.has(key)) this.batches.set(key, { geometry, material, items: [] });
    this.dummy.position.fromArray(position); this.dummy.scale.fromArray(scale); this.dummy.rotation.fromArray(rotation); this.dummy.updateMatrix();
    this.batches.get(key).items.push({ matrix: this.dummy.matrix.clone(), color });
  }
  beam(geometry, material, from, to, width, depth = width) {
    const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to), direction = b.clone().sub(a);
    this.dummy.position.copy(a).add(b).multiplyScalar(.5); this.dummy.scale.set(width, direction.length(), depth);
    this.dummy.quaternion.setFromUnitVectors(up, direction.normalize()); this.dummy.updateMatrix();
    const key = geometry.uuid + material.uuid;
    if (!this.batches.has(key)) this.batches.set(key, { geometry, material, items: [] });
    this.batches.get(key).items.push({ matrix: this.dummy.matrix.clone(), color: null });
  }
  finish() {
    for (const { geometry, material, items } of this.batches.values()) {
      const mesh = new THREE.InstancedMesh(geometry, material, items.length);
      items.forEach((item, i) => { mesh.setMatrixAt(i, item.matrix); if (item.color) mesh.setColorAt(i, item.color); });
      mesh.name = `valley-${material.name || 'detail'}`; mesh.receiveShadow = true;
      mesh.castShadow = ['bark', 'blossom', 'pine', 'bridge', 'wood'].includes(material.name);
      mesh.computeBoundingSphere(); mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      this.root.add(mesh);
    }
  }
}

function texture(width, height, draw) {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4;
  return map;
}

function strip(root, track, left, right, height, material, steps = 650, start = 0, length = track.trackLength) {
  if (left > right) [left, right] = [right, left];
  const positions = [], uv = [], indices = [], alternating = [[], []];
  for (let i = 0; i <= steps; i++) {
    const s = start + length * i / steps;
    for (const lateral of [left, right]) { const p = track.sampleTrack(s, lateral); positions.push(p.x, height, p.z); uv.push(lateral / 5, s / 5); }
    if (i < steps) { const j = i * 2, target = Array.isArray(material) ? alternating[Math.floor((s + track.trackLength / steps * .5) / 4.5) % 2] : indices;
      target.push(j, j + 2, j + 1, j + 1, j + 2, j + 3); }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  if (Array.isArray(material)) { geometry.setIndex([...alternating[0], ...alternating[1]]); geometry.addGroup(0, alternating[0].length, 0); geometry.addGroup(alternating[0].length, alternating[1].length, 1); }
  else geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material); mesh.receiveShadow = true; root.add(mesh); return mesh;
}

export function buildValleyWorld(group, track, {quality = 'high'} = {}) {
  let currentQuality = quality === 'low' ? 'low' : 'high';
  const random = seededRandom(), batch = new Instances(group);
  const materials = new Set(), geometries = new Set(), textures = new Set();
  const material = (name, color, roughness = .85, extra = {}) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness, ...extra }); m.name = name; materials.add(m); return m;
  };
  const shape = geometry => { geometries.add(geometry); return geometry; };
  const map = (...args) => { const result = texture(...args); textures.add(result); return result; };
  const box = shape(new THREE.BoxGeometry(1, 1, 1)), cone = shape(new THREE.ConeGeometry(1, 1, 7));
  const trunk = shape(new THREE.CylinderGeometry(.65, 1, 1, 6));
  const blossom = shape(new THREE.IcosahedronGeometry(1, 1)), rock = shape(new THREE.IcosahedronGeometry(1, 0));
  const cylinder = shape(new THREE.CylinderGeometry(1, 1, 1, 12));
  const palette = {
    ground: material('banks', '#a7b5a3', 1, {vertexColors: true}),
    bark: material('bark', '#594857'), wood: material('wood', '#69574f'), woodLight: material('cedar', '#ae8975'),
    bridge: material('bridge', '#ae484b', .63), redDark: material('bridge-trim', '#6b3547'),
    cream: material('ivory', '#eddfca'), gold: material('brass', '#bd9670', .4, {metalness: .25}),
    pine: material('pine', '#ffffff', .94), blossom: material('blossom', '#ffffff', .96),
    stone: material('river-stone', '#899793'), reeds: material('reed', '#9ba880'),
    lantern: material('lantern', '#ffdeac', .6, {emissive: '#ffb65b', emissiveIntensity: 1.15}),
    roof: material('roof', '#475d60'), dark: material('ink', '#303b4c'),
  };
  const blossoms = ['#edacc0', '#f6c7d0', '#df91b3', '#f2bccb'].map(c => new THREE.Color(c));
  const pines = ['#3d665f', '#4d786c', '#61877a', '#52766e'].map(c => new THREE.Color(c));

  const skyMap = map(2048, 1024, (c, w, h) => {
    const gradient = c.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, '#819ab2'); gradient.addColorStop(.28, '#aebaca');
    gradient.addColorStop(.43, '#d4c8cb'); gradient.addColorStop(.50, '#efd1c2');
    gradient.addColorStop(.56, '#c4ced0'); gradient.addColorStop(1, '#bbcbd4');
    c.fillStyle = gradient; c.fillRect(0, 0, w, h);
    const skyRandom = seededRandom(8132);
    for (let i = 0; i < 52; i++) {
      const x = skyRandom() * w, y = 245 + skyRandom() * 235, rx = 70 + skyRandom() * 180, ry = 3 + skyRandom() * 13;
      c.filter = 'blur(6px)'; c.fillStyle = `rgba(255,236,220,${.08 + skyRandom() * .13})`;
      for (const offset of [-w, 0, w]) { c.beginPath(); c.ellipse(x + offset, y, rx, ry, -.025, 0, Math.PI * 2); c.fill(); }
      c.filter = 'none'; c.strokeStyle = 'rgba(247,228,215,.055)'; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(x - rx, y + ry); c.bezierCurveTo(x - rx * .3, y + ry * .5, x + rx * .6, y + ry * .6, x + rx, y); c.stroke();
    }
  });
  const skyMaterial = new THREE.MeshBasicMaterial({map: skyMap, side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false});
  skyMaterial.name = 'valley-dusk-sky'; materials.add(skyMaterial);
  const sky = new THREE.Mesh(shape(new THREE.SphereGeometry(800, 48, 24)), skyMaterial);
  sky.name = 'valley-dusk-sky'; sky.renderOrder = -100; group.add(sky);

  // Two continuous banks leave real open water between them. Terrain stays below
  // the racing deck throughout the playable valley and rises only in the distance.
  const bankVertices = new Map();
  for (const side of [-1, 1]) {
    const positions = [], colors = [], indices = [], rows = 120, columns = 20;
    for (let row = 0; row <= rows; row++) {
      const z = -650 + row / rows * 1300;
      for (let col = 0; col <= columns; col++) {
        const distance = col === 0 ? RIVER_HALF : RIVER_HALF + 3 + (col - 1) / (columns - 1) * 630;
        const x = riverCenter(z) + side * distance, radius = Math.hypot(x, z);
        const hill = Math.max(0, radius - 160) * .055 * (1 + .5 * Math.sin(x * .019 + z * .027));
        const y = col === 0 ? -.72 : -.12 + hill;
        positions.push(x, y, z);
        const color = new THREE.Color('#78988a').lerp(new THREE.Color('#476f6c'), .15 + random() * .5);
        if (col === 0) color.set('#c6bd9e'); else if (col === 1) color.set('#a9ad91');
        colors.push(color.r, color.g, color.b);
        if (row < rows && col < columns) { const a = row * (columns + 1) + col, b = a + columns + 1;
          if (side > 0) indices.push(a, b, a + 1, a + 1, b, b + 1); else indices.push(a, a + 1, b, a + 1, b + 1, b);
        }
      }
    }
    const g = shape(new THREE.BufferGeometry()); g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); g.setIndex(indices); g.computeVertexNormals();
    const bank = new THREE.Mesh(g, palette.ground); bank.receiveShadow = true; group.add(bank);
    bankVertices.set(side, g.attributes.position.array);
  }

  // Match the actual bank triangles, including their diagonal interpolation.
  // Grass roots follow the slope rather than floating on a separate patch pad.
  function grassGround(x,z) {
    const rowPosition=Math.max(0,Math.min(119.999999,(z+650)/1300*120));
    const row=Math.floor(rowPosition),v=rowPosition-row,z0=-650+row/120*1300,z1=z0+1300/120;
    const center=riverCenter(z0)*(1-v)+riverCenter(z1)*v,side=x<center?-1:1,d=Math.abs(x-center),step=630/19;
    const col=Math.max(0,Math.min(19,d<19?0:1+Math.floor((d-19)/step)));
    const left=col===0?16:19+(col-1)*step,width=col===0?3:step,u=Math.max(0,Math.min(1,(d-left)/width));
    const a=(row*21+col)*3+1,b=a+63,data=bankVertices.get(side);
    return u+v<=1 ? data[a]+(data[b]-data[a])*v+(data[a+3]-data[a])*u
      : data[b+3]+(data[a+3]-data[b+3])*(1-v)+(data[b]-data[b+3])*(1-u);
  }

  // Preserve the seeded placement sequence while removing the old painted map.
  for (let i = 0; i < 550 * 4; i++) random();
  const waterPositions = [], waterUvs = [], waterIndices = [];
  for (let i = 0; i <= 240; i++) { const z = -650 + i / 240 * 1300;
    for (const side of [-1, 1]) { waterPositions.push(riverCenter(z) + side * RIVER_HALF, -.57, z); waterUvs.push((side + 1) / 2, z / 105); }
    if (i < 240) { const j = i * 2; waterIndices.push(j, j + 2, j + 1, j + 1, j + 2, j + 3); }
  }
  const waterGeometry = shape(new THREE.BufferGeometry()); waterGeometry.setAttribute('position', new THREE.Float32BufferAttribute(waterPositions, 3));
  waterGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(waterUvs, 2)); waterGeometry.setIndex(waterIndices); waterGeometry.computeVertexNormals();
  const river = createRiverWater(waterGeometry, {height: -.57, quality: currentQuality}); group.add(river.bed,river.mesh);

  // Small open-sided tree silhouettes need only21 triangles each. They are
  // anchored to the actual ridge triangles, so the forest follows every fold.
  const forestGeometry = shape(new THREE.BufferGeometry()), forestPositions = [];
  for (let tier = 0; tier < 3; tier++) for (let side = 0; side < 7; side++) {
    const a = side / 7 * Math.PI * 2, b = (side + 1) / 7 * Math.PI * 2;
    const radius = .5 - tier * .12, y = .08 + tier * .23;
    forestPositions.push(Math.sin(a) * radius, y, Math.cos(a) * radius, Math.sin(b) * radius, y, Math.cos(b) * radius, 0, y + .5, 0);
  }
  forestGeometry.setAttribute('position', new THREE.Float32BufferAttribute(forestPositions, 3)); forestGeometry.computeVertexNormals();
  const forestMaterial = material('distant-forest', '#ffffff', 1, {flatShading: true});
  const simpleRidgeForest = new THREE.Group(); simpleRidgeForest.name='valley-simple-ridge-forest'; group.add(simpleRidgeForest);
  const ridgeBatch = new Instances(simpleRidgeForest), ridgePlacements = [];
  let ridgeTrees = 0;
  // Contour bands, offset crests and mottled elevation colors create overlapping
  // foothills instead of one giant triangular wall across the horizon.
  for (let layer = 0; layer < 3; layer++) {
    const ridgeMaterial = material(`ridge-${layer}`, '#ffffff', 1, {vertexColors: true, flatShading: true});
    const g = shape(new THREE.BufferGeometry()), positions = [], colors = [], indices = [];
    const radius = 178 + layer * 125, segments = 160, bands = 9;
    for (let i = 0; i <= segments; i++) {
      const angle = i / segments * Math.PI * 2;
      const height = 38 + layer * 20 + 24 * Math.pow(.5 + .5 * Math.sin(angle * 5 + layer), 2) + 8 * Math.sin(angle * 13 + layer);
      for (let j = 0; j < bands; j++) {
        const fraction = j / (bands - 1), crest = Math.pow(Math.sin(fraction * Math.PI), .85);
        const reach = radius + j * 20 + Math.sin(angle * 7 + j * .67) * 10 + Math.sin(angle * 19) * 3;
        const y = j === 0 || j === bands - 1 ? -3 : crest * height + Math.sin(angle * 23 + j * 1.71) * crest * 5;
        positions.push(Math.sin(angle) * reach, y, Math.cos(angle) * reach);
        const low = new THREE.Color(['#49756b', '#678983', '#93a6a5'][layer]);
        const high = new THREE.Color(['#8a9b8b', '#9ca8a1', '#b0b8b8'][layer]);
        const stone = .5 + .5 * Math.sin(angle * 17 + j * 2.2);
        low.lerp(high, Math.min(1, .14 + crest * .44 + stone * .16)).multiplyScalar(.92 + .10 * Math.sin(angle * 37 + j));
        colors.push(low.r, low.g, low.b);
        if (i < segments && j < bands - 1) { const a = i * bands + j; indices.push(a, a + 1, a + bands, a + 1, a + bands + 1, a + bands); }
      }
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); g.setIndex(indices); g.computeVertexNormals();
    ridgeMaterial.side = THREE.DoubleSide; group.add(new THREE.Mesh(g, ridgeMaterial));
    if (layer < 2) for (let i = 0; i < 660; i++) {
      const triangle = Math.floor(random() * indices.length / 3) * 3;
      const u = random(), v = random() * (1 - u), w = 1 - u - v;
      const point = [0, 0, 0];
      for (let axis = 0; axis < 3; axis++) point[axis] = positions[indices[triangle] * 3 + axis] * u + positions[indices[triangle + 1] * 3 + axis] * v + positions[indices[triangle + 2] * 3 + axis] * w;
      if (point[1] < 2) continue;
      point[1] -= .25;
      const height = 4 + random() * 7, width = 2.5 + random() * 3;
      const color = new THREE.Color(layer ? '#64817b' : '#345e57').lerp(new THREE.Color(layer ? '#a0b0a8' : '#688a75'), random() * .65);
      const rotation = random()*6;
      ridgeBatch.add(forestGeometry, forestMaterial, point, [width, height, width], [0, rotation, 0], color);
      ridgePlacements.push({x:point[0],y:point[1],z:point[2],width,height,rotation,layer,seed:15317+ridgeTrees*7919,
        triangle:indices.slice(triangle,triangle+3).flatMap(vertex=>positions.slice(vertex*3,vertex*3+3))});
      ridgeTrees++;
    }
  }

  const asphaltMap = map(128, 128, (c, w, h) => {
    c.fillStyle = '#515769'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 3500; i++) { c.fillStyle = i % 2 ? 'rgba(230,223,218,.055)' : 'rgba(20,28,40,.07)'; c.fillRect(random() * w, random() * h, 1, 1); }
  });
  asphaltMap.wrapS = asphaltMap.wrapT = THREE.RepeatWrapping;
  const roadMaterial = material('road', '#ffffff', .93, {map: asphaltMap});
  const half = track.ROAD_WIDTH / 2;
  strip(group, track, -half - .75, half + .75, .012, palette.dark);
  strip(group, track, -half, half, .03, roadMaterial);
  for (const side of [-1, 1]) strip(group, track, side * (half - .28), side * (half - .15), .038, palette.cream);
  // Continuous topology prevents adjacent curb boxes from intersecting on bends.
  for (const side of [-1, 1]) strip(group, track, side * (half + .14), side * (half + .72), .078, [palette.bridge, palette.cream]);

  const inBridge = p => Math.abs(p.x - riverCenter(p.z)) < 25;
  for (let s = 0; s < track.trackLength; s += 4.5) {
    if (Math.floor(s / 4.5) % 3 === 0) { const p = track.sampleTrack(s); batch.add(box, palette.cream, [p.x, .055, p.z], [.14, .012, 2], [0, p.heading, 0]); }
  }
  // Boundary posts sit outside the physics corridor; long rails are omitted
  // beside views of the river so the racing route does not become a tunnel.
  for (let s = 0; s < track.trackLength; s += 7) {
    if (inBridge(track.sampleTrack(s))) continue;
    for (const side of [-1, 1]) {
      const p = track.sampleTrack(s, side * (half + 1.05)), q = track.sampleTrack(s + 6.6, side * (half + 1.05));
      batch.add(box, palette.wood, [p.x, .48, p.z], [.2, 1.08, .2], [0, p.heading, 0]);
      batch.beam(box, palette.woodLight, [p.x, .83, p.z], [q.x, .83, q.z], .14);
    }
  }

  const bridges = [];
  for (let s = 0; s < track.trackLength; s += 1) {
    const a = track.sampleTrack(s), b = track.sampleTrack(s + 1);
    if ((a.x - riverCenter(a.z)) * (b.x - riverCenter(b.z)) < 0) bridges.push(s + .5);
  }
  const woodMap = map(256, 256, (c, w, h) => {
    const grain = seededRandom(231);
    for (let plank = 0; plank < 2; plank++) {
      c.fillStyle = plank ? '#977762' : '#8a6957'; c.fillRect(0, plank * h / 2, w, h / 2);
      c.fillStyle = '#514b45'; c.fillRect(0, plank * h / 2, w, 2);
      for (let i = 0; i < 90; i++) {
        c.fillStyle = i % 2 ? 'rgba(42,29,22,.09)' : 'rgba(230,202,167,.12)';
        c.fillRect(grain() * w, plank * h / 2 + 4 + grain() * (h / 2 - 8), 8 + grain() * 110, .6);
      }
    }
  });
  woodMap.wrapS = woodMap.wrapT = THREE.RepeatWrapping;
  const deckMaterial = material('bridge-deck', '#ffffff', .86, {map: woodMap});
  for (const center of bridges) {
    const length = 51;
    // One curved surface avoids coplanar overlaps between rotated plank boxes.
    strip(group, track, -half + .4, half - .4, .048, deckMaterial, 80, center - length / 2, length);
    for (let u = 0; u <= length; u += 2.55) {
      const s = center + u - length / 2, p = track.sampleTrack(s), arch = Math.sin(u / length * Math.PI);
      for (const side of [-1, 1]) {
        const a = track.sampleTrack(s, side * (half + 1.2));
        batch.add(box, palette.bridge, [a.x, (1.35 + arch * 2) / 2, a.z], [.34, 1.35 + arch * 2, .34], [0, p.heading, 0]);
        batch.add(box, palette.gold, [a.x, 1.42 + arch * 2, a.z], [.46, .13, .46]);
        if (u < length - .1) {
          const b = track.sampleTrack(s + 2.55, side * (half + 1.2)), next = Math.sin((u + 2.55) / length * Math.PI);
          for (const dy of [.55, 1.35]) batch.beam(box, palette.bridge, [a.x, dy + arch * 2, a.z], [b.x, dy + next * 2, b.z], .2, .25);
        }
        if (Math.round(u / 2.55) % 5 === 0) batch.add(box, palette.stone, [a.x, -1, a.z], [1.3, 2, 1.6]);
      }
    }
  }

  function lantern(x, y, z, scale = 1, target = batch) {
    target.add(cylinder, palette.lantern, [x, y, z], [.31 * scale, .7 * scale, .31 * scale]);
    for (const dy of [-.39, .39]) target.add(box, palette.redDark, [x, y + dy * scale, z], [.73 * scale, .09 * scale, .73 * scale]);
    target.add(cone, palette.roof, [x, y + .55 * scale, z], [.55 * scale, .27 * scale, .55 * scale], [0, Math.PI / 4, 0]);
  }
  // Lantern gantry follows the exact start tangent, with generous vertical clearance.
  const start = track.sampleTrack(0);
  for (const side of [-1, 1]) {
    const p = track.sampleTrack(0, side * (half + 2));
    batch.add(box, palette.bridge, [p.x, 3.8, p.z], [.65, 7.6, .65], [0, start.heading, 0]);
    batch.add(box, palette.stone, [p.x, .28, p.z], [1.2, .6, 1.2]);
  }
  batch.add(box, palette.redDark, [start.x, 7.35, start.z], [track.ROAD_WIDTH + 6.5, .42, .72], [0, start.heading, 0]);
  batch.add(box, palette.bridge, [start.x, 7.82, start.z], [track.ROAD_WIDTH + 7.8, .24, 1.18], [0, start.heading, 0]);
  for (const lateral of [-7, -3.5, 3.5, 7]) { const p = track.sampleTrack(0, lateral); lantern(p.x, 6.57, p.z, 1.1); }
  const titleMap = map(1024, 192, (c, w, h) => {
    c.fillStyle = '#34434b'; c.fillRect(0, 0, w, h); c.strokeStyle = '#d4b491'; c.lineWidth = 7; c.strokeRect(8, 8, w - 16, h - 16);
    c.fillStyle = '#f7e5d6'; c.font = '600 70px Georgia'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('SAKURA VALLEY', w / 2, h / 2);
  });
  const titleMaterial = material('start-title', '#ffffff', .8, {map: titleMap, side: THREE.DoubleSide});
  const title = new THREE.Mesh(shape(new THREE.PlaneGeometry(8.7, 1.63)), titleMaterial);
  title.position.set(start.x, 7.4, start.z); title.rotation.y = start.heading + Math.PI; group.add(title);
  for (let x = -8; x < 9; x += 1) for (let row = 0; row < 2; row++) {
    const p = track.sampleTrack(row * .9, x + .5);
    batch.add(box, (x + row) % 2 ? palette.cream : palette.dark, [p.x, .056, p.z], [.98, .015, .88], [0, p.heading, 0]);
  }

  const arrowMap = map(128, 128, c => {
    c.fillStyle = '#364754'; c.fillRect(0, 0, 128, 128); c.strokeStyle = '#ffe3b7'; c.lineWidth = 18;
    c.beginPath(); c.moveTo(40, 20); c.lineTo(84, 64); c.lineTo(40, 108); c.stroke();
  });
  const arrowMaterial = material('corner-arrow', '#ffffff', .7, {map: arrowMap, side: THREE.DoubleSide});
  const arrowGeometry = shape(new THREE.PlaneGeometry(1, 1));
  for (let s = 35; s < track.trackLength; s += 48) {
    const a = track.sampleTrack(s), b = track.sampleTrack(s + 20);
    const bend = Math.atan2(Math.sin(b.heading - a.heading), Math.cos(b.heading - a.heading));
    if (Math.abs(bend) < .17 || inBridge(a)) continue;
    const side = -Math.sign(bend), p = track.sampleTrack(s + 8, side * (half + 2));
    batch.add(box, palette.wood, [p.x, 1.15, p.z], [.16, 2.3, .16]);
    batch.add(arrowGeometry, arrowMaterial, [p.x, 2.1, p.z], [1.9, 1.5, 1], [0, a.heading + Math.PI, bend < 0 ? Math.PI : 0]);
  }

  const simpleTrees = new THREE.Group(); simpleTrees.name = 'valley-simple-cherries'; group.add(simpleTrees);
  const cherryBatch = new Instances(simpleTrees), cherryPlacements = [];
  const simplePines = new THREE.Group(); simplePines.name = 'valley-simple-evergreens'; group.add(simplePines);
  const pineBatch = new Instances(simplePines), pinePlacements = [];
  const simpleRocks = new THREE.Group(); simpleRocks.name = 'valley-simple-rocks'; group.add(simpleRocks);
  const rockBatch = new Instances(simpleRocks), rockPlacements = [];
  function decorativeRock(position,scale,rotation) {
    rockPlacements.push({position,scale,rotation,seed:51673+rockPlacements.length*7919});
    rockBatch.add(rock,palette.stone,position,scale,rotation);
  }
  function cherry(x, z, scale) {
    // Keep the original seeded placement/decoration sequence in both modes.
    cherryPlacements.push({x, z, scale, seed: 19381 + cherryPlacements.length * 7919});
    const y = -.08, lean = (random() - .5) * .9;
    cherryBatch.beam(trunk, palette.bark, [x, y, z], [x + lean, y + 4.5 * scale, z], .34 * scale, .32 * scale);
    for (let i = 0; i < 4; i++) {
      const angle = i * Math.PI * .5 + random() * .6, reach = (1.8 + random() * .8) * scale;
      const bx = x + Math.sin(angle) * reach, bz = z + Math.cos(angle) * reach, by = (4.5 + random() * 1.5) * scale;
      cherryBatch.beam(trunk, palette.bark, [x + lean * .5, 2.8 * scale, z], [bx, by, bz], .17 * scale);
      for (let j = 0; j < 2; j++) cherryBatch.add(blossom, palette.blossom,
        [bx + (random() - .5) * scale, by + j * .5 * scale, bz + (random() - .5) * scale],
        [(1.6 + random() * .7) * scale, (1.05 + random() * .35) * scale, (1.35 + random() * .6) * scale],
        [random(), random() * 6, random()], blossoms[Math.floor(random() * blossoms.length)]);
    }
    cherryBatch.add(blossom, palette.blossom, [x + lean, 6.2 * scale, z], [2 * scale, 1.3 * scale, 1.8 * scale], [0, random() * 6, 0], blossoms[1]);
  }
  function pine(x, z, scale) {
    pinePlacements.push({x,z,scale,seed:23813+pinePlacements.length*7919});
    pineBatch.add(trunk, palette.bark, [x, scale * 2.8, z], [.3 * scale, 5.6 * scale, .3 * scale]);
    for (let j = 0; j < 4; j++) pineBatch.add(cone, palette.pine, [x, (3.2 + j * 1.22) * scale, z],
      [(2.05 - j * .37) * scale, 3.35 * scale, (2.05 - j * .37) * scale], [0, j * .6 + random(), 0], pines[Math.floor(random() * 4)]);
  }
  const clear = (x, z, radius = 5) => Math.hypot(x, z) > 12 + radius && Math.abs(x - riverCenter(z)) > RIVER_HALF + radius && track.nearestTrack(x, z).distance > half + radius + 1;
  let cherries = 0, evergreens = 0;
  // The riverbank clusters anchor the garage view and create long blossom vistas.
  for (let i = 0; i < 180; i++) {
    const z = -210 + random() * 420, side = i % 2 ? 1 : -1, x = riverCenter(z) + side * (22 + random() * 27);
    if (clear(x, z, 4.4) && cherries < 110) { cherry(x, z, .85 + random() * .48); cherries++; }
  }
  for (let i = 0; i < 850 && (cherries < 135 || evergreens < 225); i++) {
    const angle = random() * Math.PI * 2, radius = 38 + random() * 250, x = Math.sin(angle) * radius, z = Math.cos(angle) * radius;
    if (!clear(x, z, 5)) continue;
    if (cherries < 135 && radius < 165 && random() < .4) { cherry(x, z, .8 + random() * .6); cherries++; }
    else if (evergreens < 225) { pine(x, z, .85 + random() * 1.05); evergreens++; }
  }
  for (let i = 0; i < 220; i++) {
    const z = -300 + random() * 600, side = i % 2 ? 1 : -1, x = riverCenter(z) + side * (16.5 + random() * 3.7);
    if (track.nearestTrack(x, z).distance < half + 3.2 || Math.hypot(x, z) < 13) continue;
    const size = .4 + random() * 1.45;
    decorativeRock([x, -.2, z], [size * 1.6, size * .8, size], [random(), random() * 6, random()]);
    if (i % 3 === 0) for (let j = 0; j < 4; j++) batch.add(cone, palette.reeds, [x + j * .22, .33, z + .7], [.1, 1.15 + random() * .8, .1], [0, 0, (j - 1.5) * .1]);
  }

  const grassPlacements=[];
  let meadowPatches = 0;
  for (let i = 0; i < 240 && meadowPatches < 110; i++) {
    const point = track.sampleTrack(random() * track.trackLength, (i % 2 ? 1 : -1) * (half + 8 + random() * 22));
    if (Math.hypot(point.x, point.z) > 158 || !clear(point.x, point.z, 4)) continue;
    // Consume the former pad/tuft random draws unchanged: later scenery keeps
    // its exact seeded placement, while the grass kit uses its own seed.
    random(); const sizeX=2+random()*2,sizeZ=1.8+random()*1.5; random();
    grassPlacements.push({x:point.x,z:point.z,radius:Math.min(2.6,(sizeX+sizeZ)*.42),seed:7463+meadowPatches*719});
    for(let tuft=0;tuft<8;tuft++) {random();random();random();random();}
    if (i % 7 === 0) decorativeRock([point.x + .8, .1, point.z], [.65, .4, .5], [random(), random(), random()]);
    meadowPatches++;
  }

  // Low timber pavilion deck: no foreground uprights obscure the selected kart.
  batch.add(cylinder, palette.dark, [0, -.24, 0], [6.7, .43, 6.7], [0, Math.PI / 12, 0]);
  for (let x = -5.9; x < 6; x += .52) {
    const length = 2 * Math.sqrt(6.25 ** 2 - x ** 2);
    batch.add(box, palette.woodLight, [x, -.012, 0], [.49, .075, length]);
  }
  const turntable = new THREE.Mesh(shape(new THREE.CylinderGeometry(3.4, 3.55, .08, 64)), material('turntable', '#839494', .48, {metalness: .1}));
  turntable.position.y = .07; turntable.receiveShadow = true; group.add(turntable);
  const trim = new THREE.Mesh(shape(new THREE.TorusGeometry(3.5, .035, 6, 64)), palette.gold); trim.rotation.x = Math.PI / 2; trim.position.y = .092; group.add(trim);
  for (const x of [-5, 5]) for (const z of [-4, 4]) batch.add(trunk, palette.wood, [x, -.8, z], [.28, 1.8, .28]);
  for (const x of [-5.4, 5.4]) { batch.add(box, palette.wood, [x, .8, -4.2], [.25, 1.65, .25]); lantern(x, 1.65, -4.2, .8); }
  // A short landing behind the turntable draws the eye toward the boats and banks.
  for (let z = -6; z > -14; z -= .55) batch.add(box, palette.woodLight, [-2.6, -.05, z], [2.2, .12, .5]);

  const boats = [];
  for (const [z, offset, angle, scale] of [[-23, 3, -.15, 1], [46, -5, .2, .85], [-78, -2, .1, .75]]) {
    const root = new THREE.Group(); root.position.set(riverCenter(z) + offset, -.41, z); root.rotation.y = angle; root.scale.setScalar(scale); group.add(root);
    const boatBatch = new Instances(root);
    const hullShape = new THREE.Shape(); hullShape.moveTo(-1.4, -3.8); hullShape.quadraticCurveTo(-2.2, 0, -1.3, 3.5);
    hullShape.quadraticCurveTo(0, 5, 1.3, 3.5); hullShape.quadraticCurveTo(2.2, 0, 1.4, -3.8); hullShape.quadraticCurveTo(0, -4.4, -1.4, -3.8);
    const hullGeometry = shape(new THREE.ExtrudeGeometry(hullShape, {depth: .38, bevelEnabled: true, bevelSegments: 1, steps: 1, bevelSize: .12, bevelThickness: .12, curveSegments: 8}));
    const hull = new THREE.Mesh(hullGeometry, palette.wood); hull.rotation.x = -Math.PI / 2; root.add(hull);
    for (let i = -3; i <= 3; i++) boatBatch.add(box, palette.woodLight, [0, .41, i], [2.55, .08, .85]);
    for (const x of [-1.15, 1.15]) for (const z of [-2, 2]) boatBatch.add(box, palette.bridge, [x, 1.62, z], [.13, 2.4, .13]);
    for (const side of [-1, 1]) boatBatch.add(box, palette.roof, [side * .79, 3.02, 0], [1.8, .16, 5.4], [0, 0, side * -.32]);
    boatBatch.add(box, palette.redDark, [0, 3.36, 0], [.2, .17, 5.6]);
    for (const z of [-1.8, 1.8]) lantern(0, 2.55, z, .65, boatBatch);
    boatBatch.add(box, palette.woodLight, [0, .82, 0], [2.4, .18, .65]);
    boatBatch.beam(trunk, palette.wood, [1.7, .7, -3], [2.6, -.1, 1.8], .08);
    boatBatch.finish(); boats.push({root, y: root.position.y, phase: random() * 6});
  }
  batch.finish();
  cherryBatch.finish();
  pineBatch.finish();
  ridgeBatch.finish();
  rockBatch.finish();

  // Crown emitters concentrate the shower where players can see it. All petals
  // still share one tiny instanced silhouette, material and draw call.
  const petalShape = new THREE.Shape(); petalShape.moveTo(0, -.55); petalShape.bezierCurveTo(-.62, -.05, -.52, .5, 0, .28); petalShape.bezierCurveTo(.52, .5, .62, -.05, 0, -.55);
  const petalGeometry = shape(new THREE.ShapeGeometry(petalShape, 3));
  const petalMaterial = material('petal', '#f1bfd1', .9, {side: THREE.DoubleSide});
  const HIGH_PETALS = 1600, LOW_PETALS = 160;
  const petals = new THREE.InstancedMesh(petalGeometry, petalMaterial, HIGH_PETALS), dummy = new THREE.Object3D();
  const petalUploadRange = {start:0,count:HIGH_PETALS*16};
  petals.name = 'valley-petals'; petals.frustumCulled = false; group.add(petals);
  petals.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const petalRandom = seededRandom(93517);
  const emitters = cherryPlacements.map(tree => ({...tree,road:track.nearestTrack(tree.x,tree.z)}));
  const garageEmitters = emitters.filter(tree => Math.hypot(tree.x,tree.z) < 78);
  const roadEmitters = emitters.filter(tree => tree.road.distance < 31);
  const seeds = Array.from({length: HIGH_PETALS}, (_,i) => {
    // Interleave all emitter groups so the smaller Low prefix stays balanced.
    const pool = i%4===0 && garageEmitters.length ? garageEmitters : i%4===1 && roadEmitters.length ? roadEmitters : emitters;
    const tree = pool[Math.floor(petalRandom()*pool.length)];
    const x = tree.x+(petalRandom()-.5)*5*tree.scale, z = tree.z+(petalRandom()-.5)*5*tree.scale;
    const towardRoad = i%4===1 || (tree.road.distance<24 && petalRandom()<.6);
    const targetX = towardRoad ? tree.road.x+(petalRandom()-.5)*10 : riverCenter(tree.z)+(petalRandom()-.5)*17;
    const targetZ = towardRoad ? tree.road.z+(petalRandom()-.5)*14 : tree.z+(petalRandom()-.5)*22;
    const reach = .72+petalRandom()*.36;
    const windLimit = Math.min(1,38/Math.max(1,Math.hypot(targetX-x,targetZ-z)*reach));
    const dx = (targetX-x)*reach*windLimit, dz = (targetZ-z)*reach*windLimit;
    const endY = Math.abs(x+dx-riverCenter(z+dz))<RIVER_HALF ? -.48 : .08;
    return {x,z,dx,dz,endY,height:(4.8+petalRandom()*1.5)*tree.scale,
      duration:15+petalRandom()*11,phase:petalRandom(),flutter:petalRandom()*Math.PI*2,size:.105+petalRandom()*.105};
  });
  const ambientDiagnostics = {quality:currentQuality,petalCount:currentQuality==='low'?LOW_PETALS:HIGH_PETALS,
    capacity:HIGH_PETALS,emitterTrees:emitters.length,garageEmitters:garageEmitters.length,roadEmitters:roadEmitters.length,
    updateHz:currentQuality==='low'?15:null,time:0};
  let lastAmbientTime = -Infinity, lastWorldTime = 0;
  let grass = null;
  let detailedTrees = null;
  let detailedGreenTrees = null;
  let detailedRidgeForest = null;
  let detailedRocks = null;
  let disposed = false;
  const treeDiagnostics = {quality: currentQuality, count: cherries, detailedAllocated: false};
  const greenTreeDiagnostics = {quality:currentQuality,count:evergreens,detailedAllocated:false};
  const ridgeForestDiagnostics = {quality:currentQuality,count:ridgeTrees,detailedAllocated:false};
  const rockDiagnostics = {quality:currentQuality,count:rockPlacements.length,detailedAllocated:false};
  function syncTreeQuality() {
    if (currentQuality === 'high' && !detailedTrees) detailedTrees = createSakuraTrees(group, cherryPlacements);
    if (currentQuality === 'high' && !detailedGreenTrees) detailedGreenTrees = createGreenTrees(group,pinePlacements);
    if (currentQuality === 'high' && !detailedRidgeForest) detailedRidgeForest = createRidgeForest(group,ridgePlacements);
    if (currentQuality === 'high' && !detailedRocks) detailedRocks = createRocks(group,rockPlacements,{style:'valley'});
    simpleTrees.visible = currentQuality === 'low';
    simplePines.visible = currentQuality === 'low';
    simpleRidgeForest.visible = currentQuality === 'low';
    simpleRocks.visible = currentQuality === 'low';
    if (detailedTrees) detailedTrees.root.visible = currentQuality === 'high';
    if (detailedGreenTrees) detailedGreenTrees.root.visible = currentQuality === 'high';
    if (detailedRidgeForest) detailedRidgeForest.root.visible = currentQuality === 'high';
    if (detailedRocks) detailedRocks.root.visible = currentQuality === 'high';
    Object.assign(treeDiagnostics, detailedTrees?.diagnostics, {quality: currentQuality, count: cherries, detailedAllocated: !!detailedTrees, detailedVisible: currentQuality === 'high', simpleVisible: simpleTrees.visible});
    if (currentQuality === 'low') Object.assign(treeDiagnostics, {visibleDrawCalls: 0, visibleTriangles: 0, visibleTrees: 0, nearTrees: 0, midTrees: 0, farTrees: 0, nearChunks: 0, midChunks: 0, farChunks: 0});
    Object.assign(greenTreeDiagnostics,detailedGreenTrees?.diagnostics,{quality:currentQuality,count:evergreens,detailedAllocated:!!detailedGreenTrees,detailedVisible:currentQuality==='high',simpleVisible:simplePines.visible});
    if (currentQuality === 'low') Object.assign(greenTreeDiagnostics,{visibleDrawCalls:0,visibleTriangles:0,visibleTrees:0,nearTrees:0,midTrees:0,farTrees:0});
    Object.assign(ridgeForestDiagnostics,detailedRidgeForest?.diagnostics,{quality:currentQuality,count:ridgeTrees,detailedAllocated:!!detailedRidgeForest,detailedVisible:currentQuality==='high',simpleVisible:simpleRidgeForest.visible});
    if(currentQuality==='low') Object.assign(ridgeForestDiagnostics,{visibleDrawCalls:0,visibleTriangles:0,visibleTrees:0,nearTrees:0,midTrees:0,farTrees:0});
    Object.assign(rockDiagnostics,detailedRocks?.diagnostics,{quality:currentQuality,count:rockPlacements.length,detailedAllocated:!!detailedRocks,detailedVisible:currentQuality==='high',simpleVisible:simpleRocks.visible});
    if(currentQuality==='low') Object.assign(rockDiagnostics,{visibleDrawCalls:0,visibleTriangles:0,visibleRocks:0,nearRocks:0,midRocks:0,farRocks:0});
  }
  petals.count = currentQuality === 'low' ? LOW_PETALS : HIGH_PETALS;
  function setQuality(value) {
    currentQuality = value === 'low' ? 'low' : 'high';
    river.setQuality(currentQuality);
    grass?.setQuality(currentQuality);
    syncTreeQuality();
    petals.count = currentQuality === 'low' ? LOW_PETALS : HIGH_PETALS;
    Object.assign(ambientDiagnostics,{quality:currentQuality,petalCount:petals.count,updateHz:currentQuality==='low'?15:null});
    lastAmbientTime = -Infinity;
    // Quality can change while capture/gameplay is paused: initialize every
    // newly visible instance now instead of waiting for the next world tick.
    update(lastWorldTime);
  }
  function update(time) {
    lastWorldTime = time;
    grass?.update(time);
    ambientDiagnostics.time = time;
    if (currentQuality === 'high') detailedTrees?.update(time);
    if (currentQuality === 'high') detailedGreenTrees?.update(time);
    if (currentQuality === 'high') detailedRidgeForest?.update(time);
    if (currentQuality === 'high') detailedRocks?.update(time);
    // Shader waves remain continuous; only decorative CPU animation is capped.
    if (currentQuality === 'low' && time >= lastAmbientTime && time-lastAmbientTime < 1/15) {
      river.update(time); return;
    }
    lastAmbientTime = time;
    for (const boat of boats) { boat.root.position.y = boat.y + Math.sin(time * .72 + boat.phase) * .035; boat.root.rotation.z = Math.sin(time * .47 + boat.phase) * .012; }
    river.update(time, boats);
    for (let i = 0; i < petals.count; i++) {
      const seed = seeds[i];
      const age = ((time/seed.duration+seed.phase)%1+1)%1, flutter = seed.flutter;
      dummy.position.set(seed.x+seed.dx*age+Math.sin(time*.83+flutter)*1.2,
        seed.endY+seed.height*(1-age)+Math.sin(time*1.7+flutter)*.13,
        seed.z+seed.dz*age+Math.cos(time*.64+flutter)*1.05);
      // Tiny petals ease into and out of each fall instead of visibly teleporting.
      const fade = Math.min(1,age/.07,(1-age)/.12);
      dummy.scale.setScalar(seed.size*fade);
      dummy.rotation.set(time*1.5+flutter,flutter+time*.42,time*.84+flutter);
      dummy.updateMatrix(); petals.setMatrixAt(i, dummy.matrix);
    }
    petalUploadRange.count=petals.count*16;
    petals.instanceMatrix.clearUpdateRanges(); petals.instanceMatrix.updateRanges.push(petalUploadRange);
    petals.instanceMatrix.needsUpdate = true;
  }
  update(0);
  // Track strips create their own geometry; register those for complete disposal.
  group.traverse(object => { if (object.geometry && object !== river.bed) geometries.add(object.geometry); });
  let triangles = 0, calls = 0;
  group.traverse(object => { if (object.isMesh) { calls += Array.isArray(object.material) ? object.geometry.groups.length : 1; triangles += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3 * (object.isInstancedMesh ? object.count : 1); } });
  group.userData.valley = {cherryTrees: cherries, evergreenTrees: evergreens, ridgeTrees, meadowPatches, bridgeCrossings: bridges.length, estimatedDrawCalls: calls, triangles};
  // Detailed-tree resources are created after the world's geometry inventory;
  // their helper owns them, including lazy creation from a Performance start.
  syncTreeQuality();
  grass=createGrass(group,grassPlacements,{quality:currentQuality,groundHeight:grassGround});
  const grassDiagnostics=grass.diagnostics;
  function beforeRender(renderer, scene, camera, options) {
    if (currentQuality === 'high') {
      detailedTrees.beforeRender(camera);
      Object.assign(treeDiagnostics, detailedTrees.diagnostics);
      detailedGreenTrees.beforeRender(camera);
      Object.assign(greenTreeDiagnostics,detailedGreenTrees.diagnostics);
      detailedRidgeForest.beforeRender(camera);
      Object.assign(ridgeForestDiagnostics,detailedRidgeForest.diagnostics);
      detailedRocks.beforeRender(camera);
      Object.assign(rockDiagnostics,detailedRocks.diagnostics);
    }
    grass.beforeRender(camera);
    river.beforeRender(renderer, scene, camera, options);
  }
  return {update, setQuality, beforeRender, grassDiagnostics, treeDiagnostics, greenTreeDiagnostics, ridgeForestDiagnostics, rockDiagnostics, ambientDiagnostics, waterDiagnostics: river.diagnostics, showroomPosition: new THREE.Vector3(0, .15, 0),
    dispose() { if(disposed)return;disposed=true;detailedRocks?.dispose();grass.dispose(); detailedTrees?.dispose(); detailedGreenTrees?.dispose(); detailedRidgeForest?.dispose(); river.dispose(); geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose()); }};
}
