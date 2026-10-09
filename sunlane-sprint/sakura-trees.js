import * as THREE from 'three';

const FULL_CARDS = 192, MID_CARDS = 96, FAR_CARDS = 48, CHUNK_SIZE = 112;
const TAU = Math.PI * 2;
function randomSource(seed) {
  let state = (Number(seed) || 1) >>> 0;
  return () => { state += 0x6D2B79F5; let n = state; n = Math.imul(n ^ n >>> 15,n | 1); n ^= n + Math.imul(n ^ n >>> 7,n | 61); return ((n ^ n >>> 14) >>> 0) / 4294967296; };
}

// Original four-tile blossom atlas. Each tile contains individual notched,
// five-petal flowers with transparent space between the outer sprays.
function blossomAtlas() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1024;
  const c = canvas.getContext('2d');
  const random = randomSource(897431);
  const colors = ['#f3d2df','#f7e1e7','#eab9cf','#f1c7da'];
  for (let tile = 0; tile < 4; tile++) {
    const ox = tile % 2 * 512, oy = Math.floor(tile / 2) * 512;
    c.save(); c.beginPath(); c.rect(ox+4,oy+4,504,504); c.clip();
    // Delicate twigs read through the flowers at close range, not as opaque blobs.
    c.strokeStyle = '#806775'; c.lineWidth = 2.2; c.lineCap = 'round';
    for (let branch = 0; branch < 5; branch++) {
      const a = branch*TAU/5+.3, reach = 150+random()*55;
      c.beginPath(); c.moveTo(ox+255,oy+330);
      c.quadraticCurveTo(ox+255+Math.cos(a)*80,oy+245,ox+256+Math.cos(a)*reach,oy+250+Math.sin(a)*reach); c.stroke();
    }
    for (let f = 0; f < 44; f++) {
      const angle = f*2.39996+tile, radius = Math.sqrt((f+.5)/44)*(170+random()*20);
      const x = ox+256+Math.cos(angle)*radius, y = oy+256+Math.sin(angle)*radius*.87;
      const r = 16+random()*9;
      c.save(); c.translate(x,y); c.rotate(random()*TAU);
      for (let petal = 0; petal < 5; petal++) {
        c.rotate(TAU/5); c.beginPath(); c.moveTo(-r*.11,r*.04);
        c.bezierCurveTo(-r*.68,-r*.32,-r*.65,-r*.93,-r*.2,-r);
        c.lineTo(0,-r*.83); c.lineTo(r*.18,-r);
        c.bezierCurveTo(r*.65,-r*.92,r*.66,-r*.31,r*.11,r*.04); c.closePath();
        c.fillStyle = colors[(tile+f+petal)%colors.length]; c.fill();
        c.strokeStyle = 'rgba(192,121,154,.35)'; c.lineWidth = .9; c.stroke();
      }
      c.fillStyle = '#d69eb8'; c.beginPath(); c.arc(0,0,r*.16,0,TAU); c.fill();
      c.strokeStyle = '#bd7894'; c.lineWidth = .8;
      for (let stamen = 0; stamen < 7; stamen++) {
        const a = stamen*TAU/7, sx = Math.cos(a)*r*.28, sy = Math.sin(a)*r*.28;
        c.beginPath(); c.moveTo(0,0); c.lineTo(sx,sy); c.stroke();
        c.fillStyle = '#f5dbc0'; c.beginPath(); c.arc(sx,sy,1.2,0,TAU); c.fill();
      }
      c.restore();
    }
    c.restore();
  }
  const texture = new THREE.CanvasTexture(canvas); texture.name = 'Authored sakura five-petal atlas';
  texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
  return texture;
}

// Append a bent, tapered tube to a chunk, including subtle bark color facets.
// The radii and points are authored per tree; no intersecting straight trunk poles.
function appendBranch(data, points, radii, sides, origin, scale, random) {
  const start = data.positions.length/3;
  const tangent = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3();
  const reference = new THREE.Vector3(0,1,0), position = new THREE.Vector3();
  for (let row = 0; row < points.length; row++) {
    tangent.subVectors(points[Math.min(row+1,points.length-1)],points[Math.max(0,row-1)]).normalize();
    if (row === 0) {
      reference.set(Math.abs(tangent.y) > .93 ? 1 : 0,Math.abs(tangent.y) > .93 ? 0 : 1,0);
      right.crossVectors(tangent,reference).normalize();
    } else {
      // Parallel transport keeps successive rings aligned through every bend.
      // Re-selecting a world-axis basis produces twisted collars at joints.
      right.addScaledVector(tangent,-right.dot(tangent)).normalize();
    }
    up.crossVectors(right,tangent).normalize();
    for (let ring = 0; ring < sides; ring++) {
      const angle = ring*TAU/sides, radius = radii[row]*(1+Math.sin(ring*2.7)*.075);
      position.copy(points[row]).addScaledVector(right,Math.cos(angle)*radius).addScaledVector(up,Math.sin(angle)*radius);
      data.positions.push(origin.x+position.x*scale, -.08+position.y*scale,origin.z+position.z*scale);
      const tone = .86+random()*.21;
      data.colors.push(.082*tone,.054*tone,.06*tone);
      if (row < points.length-1) {
        const a = start+row*sides+ring, b = start+row*sides+(ring+1)%sides;
        data.indices.push(a,a+sides,b,b,a+sides,b+sides);
      }
    }
  }
}

function authorTree(placement, index, data) {
  const seed = placement.seed ?? Math.imul(index+1,7907), random = randomSource(seed);
  const variant = ((Number(seed)||index) >>> 0)%4;
  const scale = placement.scale ?? 1, origin = placement;
  const lean = (random()-.5)*.7, yaw = random()*TAU;
  const vector = (x,y,z) => new THREE.Vector3(x,y,z);
  const bend = vector(lean,3.2,.16), top = vector(lean-.2,5.4,.2);
  // Continuous root flare replaces intersecting open-ended root cylinders.
  appendBranch(data,[vector(0,-.035,0),vector(0,.28,0),vector(-lean*.25,1.4,-.08),bend,top],
    [.43,.32,.25,.17,.035],10,origin,scale,random);
  const lobes = [];
  for (let b = 0; b < 5; b++) {
    const angle = yaw+b*TAU/5+(random()-.5)*.45;
    const reach = 2.3+random()*.55+(variant===1?.25:0);
    const end = vector(Math.sin(angle)*reach+lean,4.65+random()*.9,Math.cos(angle)*reach);
    const mid = vector(end.x*.55,3.7+random()*.35,end.z*.5);
    const fork = vector(end.x*.83,end.y-.1,end.z*.79);
    appendBranch(data,[vector(lean*.65,2.4+b*.17,.05),mid,fork,end],[.115,.09,.055,.018],6,origin,scale,random);
    lobes.push(end.clone().add(vector(0,.3,0)));
    // Lower inner sprays connect the crown to its central branching structure.
    lobes.push(mid.clone().add(vector(0,.95,0)));
    for (let twig = 0; twig < 2; twig++) {
      const sign = twig ? 1 : -1, turn = angle+sign*(.48+random()*.2);
      const tip = end.clone().add(vector(Math.sin(turn)*.68,.6+random()*.45,Math.cos(turn)*.68));
      const elbow = fork.clone().lerp(tip,.53); elbow.y += .25;
      if (variant === 2 && b%2 === 0) tip.y -= .85; // Sparse hanging outer sprays.
      appendBranch(data,[fork,elbow,tip],[.052,.03,.009],4,origin,scale,random);
      lobes.push(tip.clone().add(vector(0,.15,0)));
    }
  }
  lobes.push(top.clone().add(vector(.1,.55,.1)));
  for (const lobe of lobes) { lobe.x*=.8; lobe.z*=.8; }
  const cards = [], dummy = new THREE.Object3D(), color = new THREE.Color();
  const normal = new THREE.Vector3(), axis = new THREE.Vector3(0,0,1);
  for (let i = 0; i < FULL_CARDS; i++) {
    const lobe = lobes[i%lobes.length], angle = random()*TAU, y = random()*2-1;
    const ring = Math.sqrt(1-y*y), radius = Math.pow(random(),.45);
    const offset = vector(Math.cos(angle)*ring*radius*.95, y*radius*.53,Math.sin(angle)*ring*radius*.95);
    dummy.position.copy(lobe).add(offset);
    dummy.position.set(origin.x+dummy.position.x*scale,-.08+dummy.position.y*scale,origin.z+dummy.position.z*scale);
    normal.set(Math.cos(angle)*ring,y*.8,Math.sin(angle)*ring).normalize();
    dummy.quaternion.setFromUnitVectors(axis,normal); dummy.rotateZ(random()*TAU);
    const cardSize = (i<FAR_CARDS ? 1.5 : 1.05+random()*.42)*scale;
    dummy.scale.set(cardSize,cardSize*(.85+random()*.3),1); dummy.updateMatrix();
    color.setHSL(.925+random()*.035,.10+random()*.13,.79+random()*.15);
    // Soft self-occlusion within the crown gives overlapping sprays depth
    // without adding another alpha-tested shadow pass for every flower.
    const crownHeight = THREE.MathUtils.smoothstep((dummy.position.y+.08)/scale, 4.1, 6.7);
    color.multiplyScalar(.46 + crownHeight*.54);
    // Soft crown normals prevent two-sided flower cards reading as black slabs.
    // They are independent of each card's orientation and retain gentle depth.
    const canopyNormal = vector(lobe.x*.3+offset.x*.6,.8+offset.y*.35,lobe.z*.3+offset.z*.6).normalize();
    cards.push({matrix:dummy.matrix.clone(),color:color.clone(),tile:Math.floor(random()*4),normal:canopyNormal});
  }
  return cards;
}

/** Instanced high-quality trees; caller caches root and controls root.visible. */
export function createSakuraTrees(parent, placements) {
  const root = new THREE.Group(); root.name = 'valley-detailed-sakura'; parent.add(root);
  const atlas = blossomAtlas(), timeUniform = {value:0};
  const barkMaterial = new THREE.MeshStandardMaterial({name:'Sakura tapered bark',vertexColors:true,roughness:1});
  const blossomMaterial = new THREE.MeshStandardMaterial({name:'Sakura flower cutouts',map:atlas,color:'#ffffff',roughness:.98,
    side:THREE.DoubleSide,alphaTest:.38,transparent:false,depthWrite:true,emissive:'#ad688c',emissiveIntensity:.06});
  blossomMaterial.onBeforeCompile = shader => {
    shader.uniforms.sakuraTime = timeUniform;
    shader.vertexShader = 'attribute vec2 blossomTile;\nattribute vec3 canopyNormal;\nvarying vec3 vSakuraNormal;\nuniform float sakuraTime;\n'+shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>','#include <uv_vertex>\n vMapUv = (vMapUv + blossomTile) * .5;');
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      vSakuraNormal = normalMatrix * canopyNormal;
      float branchPhase = instanceMatrix[3].x*.19+instanceMatrix[3].z*.13;
      transformed.x += sin(sakuraTime*.72+branchPhase)*.035*(position.y+.5);
      transformed.z += cos(sakuraTime*.61+branchPhase)*.02*(position.y+.5);`);
    shader.fragmentShader = 'varying vec3 vSakuraNormal;\n'+shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>',
      '#include <normal_fragment_begin>\n normal = normalize(vSakuraNormal);');
  };
  blossomMaterial.customProgramCacheKey = () => 'sakura-atlas-wind-r180-v2';
  const geometries = new Set(), chunks = [], groups = new Map();
  placements.forEach((p,index) => {
    const key = `${Math.floor(p.x/CHUNK_SIZE)},${Math.floor(p.z/CHUNK_SIZE)}`;
    if (!groups.has(key)) groups.set(key,[]); groups.get(key).push({p,index});
  });
  let branchTriangles = 0;
  for (const trees of groups.values()) {
    const data = {positions:[],colors:[],indices:[]};
    const treeCards = trees.map(({p,index}) => authorTree(p,index,data));
    const branchGeometry = new THREE.BufferGeometry();
    branchGeometry.setAttribute('position',new THREE.Float32BufferAttribute(data.positions,3));
    branchGeometry.setAttribute('color',new THREE.Float32BufferAttribute(data.colors,3));
    branchGeometry.setIndex(data.indices); branchGeometry.computeVertexNormals(); branchGeometry.computeBoundingSphere(); geometries.add(branchGeometry);
    const branches = new THREE.Mesh(branchGeometry,barkMaterial); branches.name='sakura-branch-chunk';
    branches.castShadow = true; branches.receiveShadow = true; root.add(branches);
    const cardGeometry = new THREE.PlaneGeometry(1,1), tiles = new Float32Array(trees.length*FULL_CARDS*2);
    const canopyNormals = new Float32Array(trees.length*FULL_CARDS*3);
    cardGeometry.setAttribute('blossomTile',new THREE.InstancedBufferAttribute(tiles,2)); geometries.add(cardGeometry);
    cardGeometry.setAttribute('canopyNormal',new THREE.InstancedBufferAttribute(canopyNormals,3));
    const flowers = new THREE.InstancedMesh(cardGeometry,blossomMaterial,trees.length*FULL_CARDS); flowers.name='sakura-flower-chunk';
    // Do not spend a second alpha-tested pass on flower shadows. Branch shadows
    // ground the trees; cutouts receive the scene's existing shadow lighting.
    flowers.castShadow = false; flowers.receiveShadow = true;
    let slot = 0;
    for (let layer = 0; layer < FULL_CARDS; layer++) for (const cards of treeCards) {
      const card = cards[layer]; flowers.setMatrixAt(slot,card.matrix); flowers.setColorAt(slot,card.color);
      tiles[slot*2]=card.tile%2; tiles[slot*2+1]=Math.floor(card.tile/2);
      card.normal.toArray(canopyNormals,slot*3); slot++;
    }
    flowers.instanceMatrix.needsUpdate = true; flowers.instanceColor.needsUpdate = true;
    flowers.computeBoundingBox(); flowers.boundingBox.expandByScalar(.08); flowers.computeBoundingSphere(); flowers.boundingSphere.radius += .08;
    root.add(flowers);
    const triangles = data.indices.length/3; branchTriangles += triangles;
    chunks.push({branches,flowers,trees:trees.length,triangles,level:FULL_CARDS,bounds:flowers.boundingBox.clone()});
  }
  const diagnostics = {trees:placements.length,variants:4,chunks:chunks.length,batches:chunks.length*2,materials:2,textures:1,atlasSize:1024,
    maximumDrawCalls:chunks.length*2,branchTriangles,maximumTriangles:branchTriangles+placements.length*FULL_CARDS*2,
    visibleDrawCalls:0,visibleTriangles:0,visibleTrees:0,nearTrees:0,midTrees:0,farTrees:0,nearChunks:0,midChunks:0,farChunks:0,disposed:false};
  const frustum = new THREE.Frustum(), matrix = new THREE.Matrix4(), worldBox = new THREE.Box3();
  const cameraPosition = new THREE.Vector3(), nearest = new THREE.Vector3();
  let disposed = false;
  function beforeRender(camera) {
    if (disposed || !root.visible) return;
    root.updateWorldMatrix(true,false); camera.getWorldPosition(cameraPosition);
    matrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse); frustum.setFromProjectionMatrix(matrix);
    diagnostics.visibleDrawCalls=0; diagnostics.visibleTriangles=0; diagnostics.visibleTrees=0;
    diagnostics.nearTrees=0; diagnostics.midTrees=0; diagnostics.farTrees=0;
    diagnostics.nearChunks=0; diagnostics.midChunks=0; diagnostics.farChunks=0;
    for (const chunk of chunks) {
      worldBox.copy(chunk.bounds).applyMatrix4(root.matrixWorld);
      worldBox.clampPoint(cameraPosition,nearest); const distance = nearest.distanceTo(cameraPosition);
      // Hysteresis prevents toggling detail when a kart rides the threshold.
      if (chunk.level === FULL_CARDS && distance > 100) chunk.level = MID_CARDS;
      else if (chunk.level !== FULL_CARDS && distance < 84) chunk.level = FULL_CARDS;
      if (chunk.level === MID_CARDS && distance > 210) chunk.level = FAR_CARDS;
      else if (chunk.level === FAR_CARDS && distance < 188) chunk.level = MID_CARDS;
      chunk.flowers.count=chunk.level*chunk.trees;
      if (frustum.intersectsBox(worldBox)) {
        diagnostics.visibleDrawCalls += 2;
        diagnostics.visibleTriangles += chunk.triangles+chunk.flowers.count*2;
        diagnostics.visibleTrees += chunk.trees;
        diagnostics[chunk.level===FULL_CARDS?'nearTrees':chunk.level===MID_CARDS?'midTrees':'farTrees'] += chunk.trees;
        diagnostics[chunk.level===FULL_CARDS?'nearChunks':chunk.level===MID_CARDS?'midChunks':'farChunks']++;
      }
    }
  }
  return {root,diagnostics,beforeRender,
    update(time) { if (!disposed && root.visible) timeUniform.value=time; },
    dispose() {
      if (disposed) return; disposed=true; diagnostics.disposed=true;
      root.removeFromParent(); geometries.forEach(geometry=>geometry.dispose());
      for (const chunk of chunks) chunk.flowers.dispose();
      barkMaterial.dispose(); blossomMaterial.dispose(); atlas.dispose(); root.clear();
    },
  };
}
