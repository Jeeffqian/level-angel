import * as THREE from 'three';

const SEA=-.66,TAU=Math.PI*2;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
const randomFor=initial=>{let seed=initial>>>0;return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};};
const wrapAngle=a=>Math.atan2(Math.sin(a),Math.cos(a));

function islandShape(placement,index) {
  const random=randomFor(placement.seed??58131+index*7919),phase=random()*TAU,cove=phase+1.1,headland=phase+3.6;
  function coast(angle) {
    const bay=Math.exp(-((wrapAngle(angle-cove)/.43)**2)),cape=Math.exp(-((wrapAngle(angle-headland)/.35)**2));
    return clamp(.85+.075*Math.sin(angle*3+phase)+.045*Math.sin(angle*7-phase)+.025*Math.cos(angle*11+phase)-.22*bay+.09*cape,.54,1.05);
  }
  function height(t,angle) {
    if(t>=.98)return SEA-.16-(t-.98)/.10*5.4;
    const x=Math.cos(angle)*t,z=Math.sin(angle)*t;
    const ridges=.8+.13*Math.sin(x*5+phase)*Math.cos(z*4-phase)+.07*Math.sin(x*11+z*7+phase);
    const exposed=smooth(-.45,.75,Math.cos(angle-phase));
    const cutoff=1-smooth(.66+.11*(1-exposed),.87+.065*(1-exposed),t);
    const plateau=placement.height*.76*(1-t*.43)*ridges*cutoff;
    const crest=placement.height*.2*Math.max(0,1-(t/.76)**2)*( .65+.35*Math.cos(x*4-z*6+phase));
    const beach=.95*(1-smooth(.82,.98,t));
    const cliff=smooth(.48,.68,t)*(1-smooth(.87,.95,t));
    const erosion=(.6*Math.sin(x*29+phase)*Math.sin(z*23-phase)+.65*Math.sin(angle*17+phase)+.35*Math.sin(angle*29-phase))*cliff;
    const shelves=.45*Math.sin(plateau*1.8+Math.sin(angle*4+phase))*cliff;
    return SEA+plateau+crest+beach+erosion+shelves;
  }
  function point(t,angle,out) {
    const r=t*coast(angle);return out.set(placement.x+Math.cos(angle)*placement.rx*r,height(t,angle),placement.z+Math.sin(angle)*placement.rz*r);
  }
  return {placement,phase,coast,height,point,random};
}

function terrain(shape,detailed) {
  const rings=detailed?[.08,.16,.24,.32,.4,.47,.54,.6,.66,.7,.74,.78,.81,.84,.87,.90,.93,.96,.98,1.08]:[.14,.28,.42,.54,.65,.73,.80,.86,.91,.96,.98,1.08];
  const segments=detailed?80:40,positions=[],colors=[],rockWeights=[],indices=[],p=new THREE.Vector3();
  const sand=new THREE.Color('#d5c293'),wetSand=new THREE.Color('#7f9682'),stone=new THREE.Color('#a28f75'),darkStone=new THREE.Color('#697769');
  const grass=new THREE.Color('#6b985d'),green=new THREE.Color('#4a7852'),color=new THREE.Color();
  function add(t,angle){shape.point(t,angle,p);positions.push(p.x,p.y,p.z);
    const mottling=(Math.sin(p.x*.37+shape.phase)*Math.sin(p.z*.43)+1)*.5;
    const slope=Math.abs(shape.height(Math.max(0,t-.015),angle)-shape.height(Math.min(.98,t+.015),angle))/(.03*shape.coast(angle)*Math.min(shape.placement.rx,shape.placement.rz));
    const rockWeight=smooth(.3,.85,slope)*smooth(.43,.62,t)*(1-smooth(.91,.97,t));rockWeights.push(rockWeight);
    color.copy(grass).lerp(green,mottling*.65).lerp(stone,rockWeight);
    color.lerp(darkStone,rockWeight*(.18+.22*Math.sin(p.y*1.7+p.x*.09)**2));
    color.lerp(sand,smooth(.82,.95,t));if(t>.95)color.lerp(wetSand,smooth(.95,1.08,t));
    color.multiplyScalar(.94+.10*mottling);colors.push(color.r,color.g,color.b);
  }
  // A single center and shared contour vertices make one continuous surface.
  add(0,0);
  for(const t of rings)for(let j=0;j<segments;j++)add(t,j/segments*TAU);
  for(let j=0;j<segments;j++)indices.push(0,1+(j+1)%segments,1+j);
  for(let row=0;row<rings.length-1;row++)for(let j=0;j<segments;j++){
    const a=1+row*segments+j,b=1+row*segments+(j+1)%segments,c=a+segments,d=b+segments;
    indices.push(a,b,c,b,d,c);
  }
  const bottom=positions.length/3;positions.push(shape.placement.x,SEA-6.1,shape.placement.z);colors.push(wetSand.r,wetSand.g,wetSand.b);rockWeights.push(0);
  const outer=1+(rings.length-1)*segments;
  const underside=positions.length/3;
  // Separate coincident rim normals at the sharp underwater underside crease.
  for(let j=0;j<segments;j++){const at=(outer+j)*3;positions.push(...positions.slice(at,at+3));colors.push(wetSand.r,wetSand.g,wetSand.b);rockWeights.push(0);}
  // Closed underwater skirt/base: never a floating terrain disk or grass pad.
  for(let j=0;j<segments;j++)indices.push(bottom,underside+j,underside+(j+1)%segments);
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setIndex(indices);
  geometry.setAttribute('islandRock',new THREE.Float32BufferAttribute(rockWeights,1));
  geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
}

function forestAtlas() {
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=256;const c=canvas.getContext('2d'),random=randomFor(72717);
  // Broadleaf island groves: fine irregular edges and open gaps between crowns.
  c.strokeStyle='#536647';c.lineWidth=8;c.beginPath();c.moveTo(128,250);c.lineTo(128,115);c.stroke();
  for(let branch=0;branch<8;branch++){const x=54+random()*145,y=70+random()*90;c.lineWidth=3;c.beginPath();c.moveTo(128,210);c.lineTo(x,y);c.stroke();}
  const greens=['#456c45','#658452','#819562','#52784c'];
  for(let i=0;i<135;i++){
    const a=random()*TAU,r=Math.sqrt(random()),x=128+Math.cos(a)*r*102,y=110+Math.sin(a)*r*78;
    c.fillStyle=greens[Math.floor(random()*greens.length)];c.beginPath();c.ellipse(x,y,10+random()*17,7+random()*13,random(),0,TAU);c.fill();
  }
  // A second tile breaks the skyline with recognizably tropical palm crowns.
  c.save();c.translate(256,0);c.strokeStyle='#686846';c.lineWidth=6;c.beginPath();c.moveTo(116,250);c.quadraticCurveTo(133,177,132,95);c.stroke();
  for(let arm=0;arm<10;arm++) {
    const a=arm/10*TAU,reach=58+random()*51,dx=Math.cos(a),dy=Math.sin(a)*.38;
    c.strokeStyle=greens[arm%4];c.lineWidth=3;c.beginPath();c.moveTo(132,95);c.quadraticCurveTo(132+dx*reach*.65,55+dy*reach,132+dx*reach,116+dy*reach);c.stroke();
    for(let leaf=1;leaf<13;leaf++)for(const side of [-1,1]) {
      const t=leaf/13,u=1-t,x=u*u*132+2*u*t*(132+dx*reach*.65)+t*t*(132+dx*reach),y=u*u*95+2*u*t*(55+dy*reach)+t*t*(116+dy*reach);
      c.lineWidth=2.6;c.beginPath();c.moveTo(x,y);c.lineTo(x+side*(9+random()*6)*(1-t*.65),y+8+random()*15);c.stroke();
    }
  }
  c.restore();const texture=new THREE.CanvasTexture(canvas);texture.name='Original offshore tropical forest atlas';texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;return texture;
}

function forestGeometry() {
  const positions=[],uv=[],indices=[];
  for(let card=0;card<3;card++) {
    const angle=card*Math.PI/3,dx=Math.cos(angle)*.5,dz=Math.sin(angle)*.5,index=positions.length/3;
    positions.push(-dx,0,-dz,dx,0,dz,-dx,1,-dz,dx,1,dz);uv.push(0,0,1,0,0,1,1,1);indices.push(index,index+1,index+2,index+1,index+3,index+2);
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}

/** Natural offshore scenery only. All resources are instance-owned and cached. */
export function createCoastIslands(parent,placements) {
  const root=new THREE.Group();root.name='coast-high-islands';parent.add(root);
  const terrainMaterial=new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:.98});terrainMaterial.name='coast-island-continuous-terrain';
  terrainMaterial.onBeforeCompile=shader=>{
    shader.vertexShader='attribute float islandRock; varying float vIslandRock; varying vec3 vIslandPosition;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n vIslandRock=islandRock; vIslandPosition=position;');
    shader.fragmentShader=`varying float vIslandRock; varying vec3 vIslandPosition;
      float islandHash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
      float islandNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(mix(islandHash(i),islandHash(i+vec3(1,0,0)),f.x),mix(islandHash(i+vec3(0,1,0)),islandHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(islandHash(i+vec3(0,0,1)),islandHash(i+vec3(1,0,1)),f.x),mix(islandHash(i+vec3(0,1,1)),islandHash(i+vec3(1,1,1)),f.x),f.y),f.z);}
      `+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      float coarse=islandNoise(vIslandPosition*.32), grain=islandNoise(vIslandPosition*3.7);
      float layer=sin(vIslandPosition.y*3.0+coarse*3.2+sin(vIslandPosition.x*.11+vIslandPosition.z*.17));
      float seams=pow(1.0-abs(layer),8.0);
      float cracks=pow(1.0-abs(sin(vIslandPosition.x*.81+vIslandPosition.z*.63+coarse*5.0)),18.0);
      vec3 limestone=mix(vec3(.28,.25,.19),vec3(.57,.50,.37),coarse*.55+grain*.45);
      limestone*=1.08-seams*.22-cracks*.19;
      diffuseColor.rgb=mix(diffuseColor.rgb,limestone,vIslandRock*.92);
    `);
  };terrainMaterial.customProgramCacheKey=()=> 'coast-island-stratified-limestone-v1';
  const atlas=forestAtlas(),leafMaterial=new THREE.MeshLambertMaterial({map:atlas,color:0xffffff,alphaTest:.42,side:THREE.DoubleSide,emissive:'#182719',emissiveIntensity:.12});
  leafMaterial.name='coast-island-forest';leafMaterial.onBeforeCompile=shader=>{shader.vertexShader='attribute float islandTile;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>','#include <uv_vertex>\n vMapUv.x=(vMapUv.x+islandTile)*0.5;');};leafMaterial.customProgramCacheKey=()=> 'coast-island-forest-atlas-v1';
  const geometries=[],islands=[],trees=[],point=new THREE.Vector3(),dummy=new THREE.Object3D(),color=new THREE.Color();
  const diagnostics={count:placements.length,allocatedTriangles:0,visibleTriangles:0,visibleDrawCalls:0,nearIslands:0,farIslands:0,forestTrees:0,textures:1,materials:2,estimates:true,disposed:false};
  placements.forEach((placement,index)=>{
    const shape=islandShape(placement,index),nearGeometry=terrain(shape,true),farGeometry=terrain(shape,false);geometries.push(nearGeometry,farGeometry);
    const near=new THREE.Mesh(nearGeometry,terrainMaterial),far=new THREE.Mesh(farGeometry,terrainMaterial);near.name='coast-island-near';far.name='coast-island-far';far.visible=false;root.add(near,far);
    const island={near,far,box:nearGeometry.boundingBox.clone(),level:'near',nearTriangles:nearGeometry.index.count/3,farTriangles:farGeometry.index.count/3};islands.push(island);
    diagnostics.allocatedTriangles+=island.nearTriangles+island.farTriangles;
    const count=48+index%3*7;
    for(let i=0;i<count;i++) {
      const angle=shape.random()*TAU,t=.08+Math.sqrt(shape.random())*.62;shape.point(t,angle,point);
      const palm=i%6===0,height=(palm?4.8:3.1)+shape.random()*(palm?2.4:2.1),width=palm?height*.83:height*(.95+shape.random()*.35);
      trees.push({x:point.x,y:point.y-.32,z:point.z,width,height,tile:palm?1:0,angle:shape.random()*TAU,tint:.82+shape.random()*.25});
    }
  });
  const treeGeometry=forestGeometry();geometries.push(treeGeometry);const forest=new THREE.InstancedMesh(treeGeometry,leafMaterial,trees.length),tiles=new Float32Array(trees.length);
  forest.name='coast-island-forest';forest.castShadow=false;forest.receiveShadow=false;
  for(let i=0;i<trees.length;i++){const tree=trees[i];dummy.position.set(tree.x,tree.y,tree.z);dummy.scale.set(tree.width,tree.height,tree.width);dummy.rotation.set(0,tree.angle,0);dummy.updateMatrix();forest.setMatrixAt(i,dummy.matrix);color.setRGB(tree.tint,tree.tint,tree.tint);forest.setColorAt(i,color);tiles[i]=tree.tile;}
  treeGeometry.setAttribute('islandTile',new THREE.InstancedBufferAttribute(tiles,1));forest.instanceMatrix.needsUpdate=true;if(forest.instanceColor)forest.instanceColor.needsUpdate=true;
  forest.computeBoundingBox();forest.computeBoundingSphere();root.add(forest);
  diagnostics.forestTrees=trees.length;diagnostics.allocatedTriangles+=trees.length*6;
  const cameraPoint=new THREE.Vector3(),worldBox=new THREE.Box3(),matrix=new THREE.Matrix4(),frustum=new THREE.Frustum();let disposed=false;
  return {root,diagnostics,update(){},
    beforeRender(camera){camera.updateMatrixWorld();root.updateWorldMatrix(true,false);camera.getWorldPosition(cameraPoint);matrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);frustum.setFromProjectionMatrix(matrix);
      diagnostics.visibleTriangles=diagnostics.visibleDrawCalls=diagnostics.nearIslands=diagnostics.farIslands=0;
      if(!root.visible)return;
      for(const island of islands){worldBox.copy(island.box).applyMatrix4(root.matrixWorld);const distance=worldBox.distanceToPoint(cameraPoint);
        if(island.level==='near'&&distance>330)island.level='far';else if(island.level==='far'&&distance<290)island.level='near';
        island.near.visible=island.level==='near';island.far.visible=island.level==='far';
        if(!frustum.intersectsBox(worldBox))continue;diagnostics[island.level==='near'?'nearIslands':'farIslands']++;diagnostics.visibleDrawCalls++;diagnostics.visibleTriangles+=island[island.level==='near'?'nearTriangles':'farTriangles'];
      }
      if(forest.count){worldBox.copy(forest.boundingBox).applyMatrix4(root.matrixWorld);if(frustum.intersectsBox(worldBox)){diagnostics.visibleDrawCalls++;diagnostics.visibleTriangles+=forest.count*6;}}
    },
    dispose(){if(disposed)return;disposed=true;root.removeFromParent();forest.dispose();geometries.forEach(geometry=>geometry.dispose());terrainMaterial.dispose();leafMaterial.dispose();atlas.dispose();diagnostics.disposed=true;}
  };
}
