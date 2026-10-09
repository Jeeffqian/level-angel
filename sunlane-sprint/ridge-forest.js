import * as THREE from 'three';

const TAU=Math.PI*2, CHUNK=180, GROVE_TREES=6, NEAR_PLANES=5;
function randomSource(seed) {let n=seed>>>0;return()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};}

// Original forest atlas: eight individually authored branch/needle silhouettes.
// Unequal boughs, open branch gaps and small edge needles replace triangle crowns.
function forestAtlas() {
  const canvas=document.createElement('canvas');canvas.width=canvas.height=2048;
  const c=canvas.getContext('2d'),random=randomSource(573819);
  for(let tile=0;tile<8;tile++) {
    c.save();c.translate(tile%4*512,Math.floor(tile/4)*1024);c.beginPath();c.rect(5,5,502,1014);c.clip();
    const lean=(random()-.5)*55,broad=tile%4===3;
    c.strokeStyle='#665d4b';c.lineWidth=11;c.lineCap='round';c.beginPath();c.moveTo(256,1015);
    c.bezierCurveTo(251,780,256+lean,415,256+lean*.7,61);c.stroke();
    const tiers=broad?13:19;
    for(let tier=0;tier<tiers;tier++) {
      const t=tier/(tiers-1),y=(broad?790:871)-t*(broad?640:808)+(random()-.5)*24;
      const maxReach=broad?155*Math.pow(Math.sin((.12+t*.82)*Math.PI),.6):198*Math.pow(1-t,.72)+11;
      for(const side of [-1,1]) {
        if(tier>0&&random()<.1)continue;
        const reach=maxReach*(.65+random()*.38),sx=256+lean*(1-y/1024),ex=sx+side*reach;
        const ey=y+18+random()*26;
        c.strokeStyle='#51634c';c.lineWidth=3.2;c.beginPath();c.moveTo(sx,y-5);c.quadraticCurveTo(sx+side*reach*.48,y+21,ex,ey);c.stroke();
        const tufts=5+Math.floor(reach/17);
        for(let tuft=0;tuft<tufts;tuft++) {
          const u=(tuft+random()*.5)/tufts,x=sx+(ex-sx)*u,ty=y+(ey-y)*u;
          const radius=13+random()*20,depth=.82+t*.18;
          // Lit tops and darker undersides are baked into the tiny distant
          // sprays, avoiding plane-dependent lighting or expensive shadows.
          for(let needle=0;needle<22;needle++) {
            const a=TAU*random(),r=Math.sqrt(random())*radius;
            const px=x+Math.cos(a)*r,py=ty+Math.sin(a)*r*.58;
            const tone=.36+random()*.21+(ty-py)/radius*.10;
            const red=Math.round((62+tone*53)*depth),green=Math.round((89+tone*64)*depth),blue=Math.round((70+tone*51)*depth);
            c.strokeStyle='rgb('+red+','+green+','+blue+')';c.lineWidth=2.4+random()*2.2;
            c.beginPath();c.moveTo(px,py);c.lineTo(px+side*(4+random()*12),py-5-random()*13);c.stroke();
          }
        }
      }
    }
    // Irregular leading shoots leave fine, non-geometric tree tops.
    for(let n=0;n<25;n++) {
      const y=50+random()*96,x=256+lean*.7+(random()-.5)*(y-35)*.35;
      c.strokeStyle=n%2?'#768c69':'#536e55';c.lineWidth=2.5;c.beginPath();c.moveTo(x,y);c.lineTo(x+(random()-.5)*15,y-9-random()*18);c.stroke();
    }
    c.restore();
  }
  // Bleed evergreen RGB into fully transparent texels. Mip filtering then
  // softens fine needles without the black fringe from a transparent canvas.
  const source=c.getImageData(0,0,2048,2048).data,pixels=new Uint8Array(source.length),rowBytes=2048*4;
  for(let y=0;y<2048;y++)for(let x=0;x<2048;x++){
    const from=y*rowBytes+x*4,to=(2047-y)*rowBytes+x*4,alpha=source[from+3];
    pixels[to]=alpha?source[from]:89;pixels[to+1]=alpha?source[from+1]:119;pixels[to+2]=alpha?source[from+2]:92;pixels[to+3]=alpha;
  }
  const texture=new THREE.DataTexture(pixels,2048,2048);texture.name='Authored irregular ridge evergreen atlas';
  texture.generateMipmaps=true;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;
  texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;texture.needsUpdate=true;return texture;
}

function groundedGroves(placements) {
  const trees=[];
  placements.forEach((p,index)=>{
    const random=randomSource(p.seed??19373+index*1543),triangle=p.triangle;
    for(let tree=0;tree<GROVE_TREES;tree++) {
      let x=p.x,y=p.y,z=p.z;
      if(tree&&triangle) {
        const a=Math.sqrt(random()),b=random(),u=1-a,v=a*(1-b),w=a*b;
        const tx=triangle[0]*u+triangle[3]*v+triangle[6]*w,ty=triangle[1]*u+triangle[4]*v+triangle[7]*w,tz=triangle[2]*u+triangle[5]*v+triangle[8]*w;
        const distance=Math.hypot(tx-p.x,tz-p.z),blend=Math.min(1,(7+random()*10)/Math.max(distance,.001));
        x+=(tx-x)*blend;z+=(tz-z)*blend;
        // Both endpoints lie on the same triangle. Interpolation keeps every
        // added trunk on that exact slope, including the irregular ridge folds.
        y=(p.y+.25)+(ty-(p.y+.25))*blend-.3;
      }
      const height=p.height*(tree?.55+random()*.4:.84+random()*.12);
      trees.push({x,y:y-.1,z,height,width:height*(.46+random()*.18),yaw:random()*TAU,
        tile:Math.floor(random()*8),tint:new THREE.Color().setRGB(.87+random()*.15,.91+random()*.12,.9+random()*.13)});
    }
  });
  return trees;
}

/** Budgeted hillside groves; caller owns visibility and caches this helper. */
export function createRidgeForest(parent,placements) {
  const root=new THREE.Group();root.name='valley-detailed-ridge-forest';parent.add(root);
  const atlas=forestAtlas(),time={value:0};
  const material=new THREE.MeshBasicMaterial({name:'Ridge forest needle silhouettes',map:atlas,side:THREE.DoubleSide,alphaTest:.32,transparent:false,depthWrite:true,fog:true});
  material.onBeforeCompile=shader=>{
    shader.uniforms.forestTime=time;
    shader.vertexShader='attribute vec2 forestTile;\nuniform float forestTime;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>','#include <uv_vertex>\n vMapUv=(vMapUv+forestTile)*vec2(.25,.5);');
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      float phase=instanceMatrix[3].x*.07+instanceMatrix[3].z*.09;
      transformed.x+=sin(forestTime*.38+phase)*.004*pow(position.y+.5,2.0);`);
  };
  material.customProgramCacheKey=()=> 'ridge-forest-atlas-r180-v1';
  const trees=groundedGroves(placements),groups=new Map(),chunks=[],geometries=new Set(),dummy=new THREE.Object3D();
  for(const tree of trees){const key=Math.floor(tree.x/CHUNK)+','+Math.floor(tree.z/CHUNK);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(tree);}
  for(const items of groups.values()) {
    const geometry=new THREE.PlaneGeometry(1,1),tiles=new Float32Array(items.length*NEAR_PLANES*2);
    geometry.setAttribute('forestTile',new THREE.InstancedBufferAttribute(tiles,2));geometries.add(geometry);
    const mesh=new THREE.InstancedMesh(geometry,material,items.length*NEAR_PLANES);mesh.name='ridge-forest-chunk';
    let slot=0;
    // Prefix order preserves every tree when fewer crossed planes are needed.
    for(let plane=0;plane<NEAR_PLANES;plane++)for(const tree of items) {
      dummy.position.set(tree.x,tree.y+tree.height*.5,tree.z);dummy.rotation.set(0,tree.yaw+plane*Math.PI*.4,0);dummy.scale.set(tree.width,tree.height,1);dummy.updateMatrix();
      mesh.setMatrixAt(slot,dummy.matrix);mesh.setColorAt(slot,tree.tint);
      tiles[slot*2]=tree.tile%4;tiles[slot*2+1]=Math.floor(tree.tile/4);slot++;
    }
    mesh.instanceMatrix.needsUpdate=true;mesh.instanceColor.needsUpdate=true;
    mesh.computeBoundingBox();mesh.boundingBox.expandByScalar(.1);mesh.computeBoundingSphere();mesh.boundingSphere.radius+=.1;root.add(mesh);
    chunks.push({mesh,trees:items.length,bounds:mesh.boundingBox.clone(),planes:NEAR_PLANES});
  }
  const diagnostics={anchors:placements.length,trees:trees.length,treesPerGrove:GROVE_TREES,variants:8,batches:chunks.length,textures:1,materials:1,atlasSize:2048,
    maximumTriangles:trees.length*NEAR_PLANES*2,maximumDrawCalls:chunks.length,visibleDrawCalls:0,visibleTriangles:0,visibleTrees:0,nearTrees:0,midTrees:0,farTrees:0,disposed:false};
  const cameraPosition=new THREE.Vector3(),nearest=new THREE.Vector3(),bounds=new THREE.Box3(),matrix=new THREE.Matrix4(),frustum=new THREE.Frustum();
  let disposed=false;
  return {root,diagnostics,
    update(seconds){if(!disposed&&root.visible)time.value=seconds;},
    beforeRender(camera){
      if(disposed||!root.visible)return;
      root.updateWorldMatrix(true,false);camera.getWorldPosition(cameraPosition);matrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);frustum.setFromProjectionMatrix(matrix);
      diagnostics.visibleDrawCalls=0;diagnostics.visibleTriangles=0;diagnostics.visibleTrees=0;diagnostics.nearTrees=0;diagnostics.midTrees=0;diagnostics.farTrees=0;
      for(const chunk of chunks){
        bounds.copy(chunk.bounds).applyMatrix4(root.matrixWorld);bounds.clampPoint(cameraPosition,nearest);const distance=nearest.distanceTo(cameraPosition);
        if(chunk.planes===5&&distance>240)chunk.planes=3;else if(chunk.planes!==5&&distance<215)chunk.planes=5;
        if(chunk.planes===3&&distance>390)chunk.planes=2;else if(chunk.planes===2&&distance<360)chunk.planes=3;
        chunk.mesh.count=chunk.trees*chunk.planes;
        if(frustum.intersectsBox(bounds)){
          diagnostics.visibleDrawCalls++;diagnostics.visibleTriangles+=chunk.mesh.count*2;diagnostics.visibleTrees+=chunk.trees;
          diagnostics[chunk.planes===5?'nearTrees':chunk.planes===3?'midTrees':'farTrees']+=chunk.trees;
        }
      }
    },
    dispose(){if(disposed)return;disposed=true;diagnostics.disposed=true;root.removeFromParent();geometries.forEach(g=>g.dispose());chunks.forEach(c=>c.mesh.dispose());material.dispose();atlas.dispose();root.clear();},
  };
}
