import * as THREE from 'three';

const TAU=Math.PI*2, CARDS=192, MID=96, FAR=48, CHUNK=160;
function seeded(seed) {
  let state=(Number(seed)||1)>>>0;
  return () => {state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
}

// Original needle-spray atlas: irregular forked cedar and radiating pine twigs.
// Transparent gaps continue all the way to the silhouette; no opaque crown blobs.
function needleAtlas() {
  const canvas=document.createElement('canvas');canvas.width=canvas.height=1024;
  const c=canvas.getContext('2d'), random=seeded(214519);
  const greens=['#426b51','#66846a','#315b45','#7c9978','#50785a'];
  function needle(x,y,a,length,tone,width=2.5) {
    c.strokeStyle=greens[tone%greens.length];c.lineWidth=width;c.beginPath();c.moveTo(x,y);
    c.quadraticCurveTo(x+Math.cos(a+.11)*length*.52,y+Math.sin(a+.11)*length*.52,x+Math.cos(a)*length,y+Math.sin(a)*length);c.stroke();
  }
  for(let tile=0;tile<4;tile++) {
    c.save();c.translate(tile%2*512,Math.floor(tile/2)*512);c.beginPath();c.rect(8,8,496,496);c.clip();c.lineCap='round';
    const pine=tile>=2;
    function twig(sx,sy,ex,ey,width) {
      const bend=(random()-.5)*65,cx=(sx+ex)*.5+bend,cy=(sy+ey)*.5;
      c.strokeStyle='#556444';c.lineWidth=width;c.beginPath();c.moveTo(sx,sy);c.quadraticCurveTo(cx,cy,ex,ey);c.stroke();
      const steps=Math.ceil(Math.hypot(ex-sx,ey-sy)/7);
      for(let n=0;n<steps;n++) {
        if(random()<.12)continue; // Uneven gaps break mirrored fern-like rows.
        const t=(n+random()*.7)/steps,u=1-t,x=u*u*sx+2*u*t*cx+t*t*ex,y=u*u*sy+2*u*t*cy+t*t*ey;
        const direction=Math.atan2(u*(cy-sy)+t*(ey-cy),u*(cx-sx)+t*(ex-cx));
        const pairs=pine?3:2;
        for(let k=0;k<pairs;k++)for(const side of [-1,1]) {
          if(random()<.16)continue;
          const a=direction+side*(.42+random()*.95),length=(pine?15:11)+random()*(pine?26:20);
          needle(x+(random()-.5)*4,y+(random()-.5)*4,a,length,Math.floor(random()*5),pine?2.5:3.1);
        }
      }
    }
    // Five uneven primary shoots plus offset forks form a small needle mass,
    // without the single central spine and repeated triangular fan outline.
    for(let shoot=0;shoot<5;shoot++) {
      const sx=235+(random()-.5)*95,sy=385+random()*50;
      const ex=70+shoot*78+(random()-.5)*45,ey=65+random()*150;
      twig(sx,sy,ex,ey,2.4);
      for(let fork=0;fork<2;fork++) {
        const t=.28+random()*.46,x=sx+(ex-sx)*t,y=sy+(ey-sy)*t;
        const side=random()<.5?-1:1;
        twig(x,y,Math.max(45,Math.min(465,x+side*(45+random()*75))),y-35-random()*65,1.6);
      }
    }
    c.restore();
  }
  const texture=new THREE.CanvasTexture(canvas);texture.name='Authored cedar and pine needles';
  texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;return texture;
}

function tube(data,points,radii,sides,placement,random) {
  const first=data.positions.length/3,scale=placement.scale??1;
  const tangent=new THREE.Vector3(),right=new THREE.Vector3(),up=new THREE.Vector3(),reference=new THREE.Vector3(),p=new THREE.Vector3();
  for(let row=0;row<points.length;row++) {
    tangent.subVectors(points[Math.min(row+1,points.length-1)],points[Math.max(0,row-1)]).normalize();
    if(row===0) {reference.set(Math.abs(tangent.y)>.93?1:0,Math.abs(tangent.y)>.93?0:1,0);right.crossVectors(tangent,reference).normalize();}
    else right.addScaledVector(tangent,-right.dot(tangent)).normalize();
    up.crossVectors(right,tangent).normalize();
    for(let j=0;j<sides;j++) {
      const angle=j*TAU/sides,r=radii[row]*(1+.06*Math.sin(j*2.1));
      p.copy(points[row]).addScaledVector(right,Math.cos(angle)*r).addScaledVector(up,Math.sin(angle)*r);
      data.positions.push(placement.x+p.x*scale,-.08+p.y*scale,placement.z+p.z*scale);
      const shade=.86+random()*.2;data.colors.push(.064*shade,.053*shade,.044*shade);
      if(row<points.length-1) {
        const a=first+row*sides+j,b=first+row*sides+(j+1)%sides;
        // Exterior winding; each tube remains FrontSide, including bent joints.
        data.indices.push(a,a+sides,b,b,a+sides,b+sides);
      }
    }
  }
}

function treeCards(placement,index,data) {
  const seed=placement.seed??23813+index*7919,random=seeded(seed),variant=(seed>>>0)%4;
  const scale=placement.scale??1,spreading=variant===1||variant===3;
  const v=(x,y,z)=>new THREE.Vector3(x,y,z);
  const height=spreading?6.5+random()*.6:7.6+random()*.7,lean=(random()-.5)*(spreading?1.25:.48),yaw=random()*TAU;
  const spine=[v(0,-.04,0),v(0,.3,0),v(lean*.15,2.1,.08),v(lean*.53,height*.55,-.07),v(lean,height*.8,.1),v(lean*1.13,height,0)];
  tube(data,spine,[.34,.24,.19,.125,.075,.012],8,placement,random);
  const sprays=[];
  const tiers=spreading?4:6;
  for(let tier=0;tier<tiers;tier++) {
    const t=tier/(tiers-1),y=spreading?3.3+t*2.6:1.8+t*(height-2.3);
    const width=spreading?(2.6-Math.abs(t-.55)*1.05):(2.2*(1-t)+.3);
    const count=spreading?4:5;
    for(let arm=0;arm<count;arm++) {
      const angle=yaw+arm*TAU/count+tier*2.1+(random()-.5)*.4;
      const reach=width*(.7+random()*.35),start=v(lean*y/height,y,0);
      const mid=v(start.x+Math.sin(angle)*reach*.55,y-(spreading?.1:.27),Math.cos(angle)*reach*.55);
      const tip=v(start.x+Math.sin(angle)*reach,y+(spreading?.28:.03)+random()*.2,Math.cos(angle)*reach);
      tube(data,[start,mid,tip],[.085*(1-t*.6),.046*(1-t*.5),.008],4,placement,random);
      // Sprays follow each bough, with more needle mass near the tips and open
      // gaps between asymmetric tiers. Spreading pines have broad flat boughs.
      sprays.push({p:mid.clone().lerp(tip,.35),angle,width:spreading?1.2:1.05,drop:spreading?.2:.4,t});
      sprays.push({p:tip.clone(),angle:angle+.35,width:spreading?1.05:.85,drop:.2,t});
    }
  }
  sprays.push({p:v(lean*1.1,height-.2,0),angle:yaw,width:.65,drop:.15,t:1});
  const cards=[],dummy=new THREE.Object3D(),axis=v(0,0,1),normal=new THREE.Vector3(),color=new THREE.Color();
  for(let i=0;i<CARDS;i++) {
    // Coprime stride keeps the reduced prefixes distributed through every tier.
    const spray=sprays[(i*37)%sprays.length],a=spray.angle+(random()-.5)*2.2;
    const offset=spreading?.83:.7;
    dummy.position.copy(spray.p).add(v((random()-.5)*offset,(random()-.5)*.62,(random()-.5)*offset));
    dummy.position.set(placement.x+dummy.position.x*scale,-.08+dummy.position.y*scale,placement.z+dummy.position.z*scale);
    // Mix tilted fans and upright sprays so crowns hold their shape from the
    // road and reflection camera, without stacked horizontal card silhouettes.
    const elevation=.15+random()*1.25;
    normal.set(Math.sin(a)*.8,elevation,Math.cos(a)*.8).normalize();
    dummy.quaternion.setFromUnitVectors(axis,normal);dummy.rotateZ((random()-.5)*TAU);
    const size=(i<FAR?1.32:.88+random()*.4)*spray.width*scale;
    dummy.scale.set(size*(.85+random()*.25),size*(.8+random()*.35),1);dummy.updateMatrix();
    // Needle hue is carried by the atlas; lower boughs stay a deeper forest green.
    const tone=.61+spray.t*.15+random()*.2,hue=random();color.setRGB(tone*(.83+hue*.15),tone,tone*(.82+(1-hue)*.2));
    const shadeNormal=v(Math.sin(a)*.6,.85+random()*.35,Math.cos(a)*.6).normalize();
    cards.push({matrix:dummy.matrix.clone(),color:color.clone(),normal:shadeNormal,tile:spreading?2+Math.floor(random()*2):Math.floor(random()*2)});
  }
  return cards;
}

/** Authored High-mode evergreens. Caller caches root and toggles its visibility. */
export function createGreenTrees(parent,placements) {
  const root=new THREE.Group();root.name='valley-detailed-evergreens';parent.add(root);
  const atlas=needleAtlas(),time={value:0},geometries=new Set();
  const bark=new THREE.MeshStandardMaterial({name:'Green tree tapered bark',vertexColors:true,roughness:1});
  const foliage=new THREE.MeshStandardMaterial({name:'Green tree needle sprays',map:atlas,roughness:1,side:THREE.DoubleSide,
    alphaTest:.29,transparent:false,depthWrite:true,emissive:'#29452e',emissiveIntensity:.08});
  foliage.onBeforeCompile=shader=>{
    shader.uniforms.greenTime=time;
    shader.vertexShader='attribute vec2 needleTile;\nattribute vec3 canopyNormal;\nvarying vec3 vGreenNormal;\nuniform float greenTime;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>','#include <uv_vertex>\n vMapUv=(vMapUv+needleTile)*.5;');
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      vGreenNormal=normalMatrix*canopyNormal;
      float phase=instanceMatrix[3].x*.18+instanceMatrix[3].z*.12;
      transformed.x+=sin(greenTime*.6+phase)*.025*(position.y+.5);
      transformed.z+=cos(greenTime*.47+phase)*.019*(position.y+.5);`);
    shader.fragmentShader='varying vec3 vGreenNormal;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_begin>','#include <normal_fragment_begin>\n normal=normalize(vGreenNormal);');
  };
  foliage.customProgramCacheKey=()=> 'green-needle-wind-r180-v1';
  const groups=new Map(),chunks=[];
  placements.forEach((p,index)=>{const key=`${Math.floor(p.x/CHUNK)},${Math.floor(p.z/CHUNK)}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push({p,index});});
  let branchTriangles=0;
  for(const trees of groups.values()) {
    const data={positions:[],colors:[],indices:[]},cards=trees.map(({p,index})=>treeCards(p,index,data));
    const branchGeometry=new THREE.BufferGeometry();branchGeometry.setAttribute('position',new THREE.Float32BufferAttribute(data.positions,3));
    branchGeometry.setAttribute('color',new THREE.Float32BufferAttribute(data.colors,3));branchGeometry.setIndex(data.indices);
    branchGeometry.computeVertexNormals();branchGeometry.computeBoundingBox();branchGeometry.computeBoundingSphere();geometries.add(branchGeometry);
    const branches=new THREE.Mesh(branchGeometry,bark);branches.name='green-branch-chunk';branches.castShadow=true;branches.receiveShadow=true;root.add(branches);
    const geometry=new THREE.PlaneGeometry(1,1),tiles=new Float32Array(trees.length*CARDS*2),normals=new Float32Array(trees.length*CARDS*3);
    geometry.setAttribute('needleTile',new THREE.InstancedBufferAttribute(tiles,2));geometry.setAttribute('canopyNormal',new THREE.InstancedBufferAttribute(normals,3));geometries.add(geometry);
    const leaves=new THREE.InstancedMesh(geometry,foliage,trees.length*CARDS);leaves.name='green-needle-chunk';leaves.receiveShadow=true;leaves.castShadow=false;
    let slot=0;
    for(let layer=0;layer<CARDS;layer++)for(const tree of cards) {
      const card=tree[layer];leaves.setMatrixAt(slot,card.matrix);leaves.setColorAt(slot,card.color);
      tiles[slot*2]=card.tile%2;tiles[slot*2+1]=Math.floor(card.tile/2);card.normal.toArray(normals,slot*3);slot++;
    }
    leaves.instanceMatrix.needsUpdate=true;leaves.instanceColor.needsUpdate=true;
    leaves.computeBoundingBox();leaves.boundingBox.expandByScalar(.1);leaves.computeBoundingSphere();leaves.boundingSphere.radius+=.1;root.add(leaves);
    const triangles=data.indices.length/3;branchTriangles+=triangles;
    const bounds=leaves.boundingBox.clone().union(branchGeometry.boundingBox);
    chunks.push({branches,leaves,bounds,trees:trees.length,triangles,level:CARDS});
  }
  const diagnostics={trees:placements.length,variants:4,chunks:chunks.length,batches:chunks.length*2,materials:2,textures:1,atlasSize:1024,
    branchTriangles,maximumTriangles:branchTriangles+placements.length*CARDS*2,maximumDrawCalls:chunks.length*2,
    visibleDrawCalls:0,visibleTriangles:0,visibleTrees:0,nearTrees:0,midTrees:0,farTrees:0,disposed:false};
  const cameraPosition=new THREE.Vector3(),nearest=new THREE.Vector3(),worldBox=new THREE.Box3(),matrix=new THREE.Matrix4(),frustum=new THREE.Frustum();
  let disposed=false;
  return {root,diagnostics,
    update(seconds){if(!disposed&&root.visible)time.value=seconds;},
    beforeRender(camera){
      if(disposed||!root.visible)return;
      root.updateWorldMatrix(true,false);camera.getWorldPosition(cameraPosition);matrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);frustum.setFromProjectionMatrix(matrix);
      diagnostics.visibleDrawCalls=0;diagnostics.visibleTriangles=0;diagnostics.visibleTrees=0;diagnostics.nearTrees=0;diagnostics.midTrees=0;diagnostics.farTrees=0;
      for(const chunk of chunks){
        worldBox.copy(chunk.bounds).applyMatrix4(root.matrixWorld);worldBox.clampPoint(cameraPosition,nearest);const distance=nearest.distanceTo(cameraPosition);
        if(chunk.level===CARDS&&distance>100)chunk.level=MID;else if(chunk.level!==CARDS&&distance<82)chunk.level=CARDS;
        if(chunk.level===MID&&distance>225)chunk.level=FAR;else if(chunk.level===FAR&&distance<198)chunk.level=MID;
        chunk.leaves.count=chunk.level*chunk.trees;
        if(frustum.intersectsBox(worldBox)){
          diagnostics.visibleDrawCalls+=2;diagnostics.visibleTriangles+=chunk.triangles+chunk.leaves.count*2;diagnostics.visibleTrees+=chunk.trees;
          diagnostics[chunk.level===CARDS?'nearTrees':chunk.level===MID?'midTrees':'farTrees']+=chunk.trees;
        }
      }
    },
    dispose(){if(disposed)return;disposed=true;diagnostics.disposed=true;root.removeFromParent();
      geometries.forEach(g=>g.dispose());chunks.forEach(chunk=>chunk.leaves.dispose());bark.dispose();foliage.dispose();atlas.dispose();root.clear();},
  };
}
