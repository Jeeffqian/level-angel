import * as THREE from 'three';

const TAU=Math.PI*2;
const seeded=initial=>{let seed=initial>>>0;return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};};
const data=()=>({position:[],color:[],wind:[],index:[]});
const v=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
function vertex(target,point,color,flex=0,phase=0,flutter=0) {
  const index=target.position.length/3;target.position.push(point.x,point.y,point.z);target.color.push(color.r,color.g,color.b);target.wind.push(flex,phase,flutter);return index;
}

// Continuous transported frames avoid discontinuous collars on curved trunks.
function tube(target,points,radii,sides,color,phase=0,flex=0,ringed=false) {
  const start=target.position.length/3,tangent=v(),right=v(),up=v(),p=v();
  for(let row=0;row<points.length;row++) {
    const rowFlex=typeof flex==='function'?flex(row/(points.length-1)):flex;
    tangent.subVectors(points[Math.min(row+1,points.length-1)],points[Math.max(row-1,0)]).normalize();
    if(row===0)right.crossVectors(tangent,Math.abs(tangent.y)>.9?v(1,0,0):v(0,1,0)).normalize();
    else right.addScaledVector(tangent,-right.dot(tangent)).normalize();
    up.crossVectors(right,tangent).normalize();
    for(let side=0;side<sides;side++) {
      const a=side/sides*TAU;p.copy(points[row]).addScaledVector(right,Math.cos(a)*radii[row]).addScaledVector(up,Math.sin(a)*radii[row]);
      const tone=color.clone().multiplyScalar(ringed?(row%3===1?.8:row%3===2?1.08:.98):1);
      vertex(target,p,tone,rowFlex,phase);
      if(row<points.length-1){const n=start+row*sides+side,next=start+row*sides+(side+1)%sides;target.index.push(n,n+sides,next,next,n+sides,next+sides);}
    }
  }
  // Closed crown end; the root end remains buried beneath the terrain.
  const end=vertex(target,points.at(-1),color,typeof flex==='function'?flex(1):flex,phase),ring=start+(points.length-1)*sides;
  for(let i=0;i<sides;i++)target.index.push(end,ring+(i+1)%sides,ring+i);
}

function leaflet(target,start,tip,width,tone,phase,flex,detailed) {
  const delta=tip.clone().sub(start),right=v(delta.z,0,-delta.x).normalize(),segments=detailed?2:1;
  const base=target.position.length/3;
  for(let row=0;row<=segments;row++) {
    const t=row/segments,p=start.clone().lerp(tip,t);p.y+=Math.sin(t*Math.PI)*width*.85;
    const w=width*(row===0?(detailed?.35:.65):row===segments?0:1);
    for(const side of [-1,1])vertex(target,p.clone().addScaledVector(right,side*w),tone,flex,phase,.018*t);
    if(row<segments){const a=base+row*2;target.index.push(a,a+2,a+1);if(row<segments-1)target.index.push(a+1,a+2,a+3);}
  }
}

function palm(placement,index,bark,foliage,detailed,groundY) {
  const random=seeded(73219+index*6173+Math.round((placement.spin??0)*997)),scale=placement.size??1,yaw=placement.spin??0;
  const height=7*scale,lean=(.65+random()*.5)*scale,phase=random()*TAU;
  const center=t=>v(placement.x+Math.cos(yaw)*lean*t*t,groundY+height*t,placement.z+Math.sin(yaw)*lean*t*t);
  const points=[],radii=[],rings=detailed?12:9;
  for(let i=0;i<=rings;i++)for(let j=0;j<(detailed?3:1);j++) {
    const t=Math.min(1,(i+(j===1?.12:j===2?.25:0))/rings);if(i===rings&&j>0)continue;
    points.push(center(t));radii.push((.25-.1*t+.07*Math.exp(-t*24)+(detailed&&j===1?.015:0))*scale);
  }
  tube(bark,points,radii,detailed?8:6,new THREE.Color('#aa8d64'),0,0,detailed);
  const crown=center(1),fronds=10+index%5;
  for(let arm=0;arm<fronds;arm++) {
    const angle=yaw+arm*TAU/fronds+(random()-.5)*.27,dx=Math.sin(angle),dz=Math.cos(angle);
    const upper=arm%4===0,reach=(upper?2.35:3.45)*( .9+random()*.2)*scale;
    const arch=(upper?2.35:1.6)*scale,drop=(upper?.12:1.25+random()*.35)*scale;
    const path=t=>v(crown.x+dx*reach*t,crown.y+arch*Math.sin(t*Math.PI*.82)-drop*t*t,crown.z+dz*reach*t);
    const ribs=[],ribRadii=[],ribSegments=detailed?7:5;
    for(let i=0;i<=ribSegments;i++){ribs.push(path(i/ribSegments));ribRadii.push((.038*(1-i/ribSegments)+.004)*scale);}
    const tone=new THREE.Color(upper?'#659342':arm%3===0?'#426f39':'#4e823d').multiplyScalar(.91+random()*.17);
    tube(foliage,ribs,ribRadii,3,tone,phase,t=>.1+t*t*.12);
    // Both LODs consume identical random values, so frond poses and colors
    // remain identical. Far detail omits alternate pairs instead of reshaping.
    const pairs=16;
    for(let pair=0;pair<pairs;pair++)for(const side of [-1,1]) {
      const t=.13+(pair+(side===1?.27:0))*.81/pairs,p=path(t);
      const length=(.2+.72*Math.sin(t*Math.PI)**.65)*(upper?.8:1)*scale*(.85+random()*.25);
      const forward=(.15+t*.3)*length,tip=p.clone().add(v(dx*forward+dz*side*length,-length*(.24+t*.6),dz*forward-dx*side*length));
      const leafTone=tone.clone().multiplyScalar(.86+random()*.25);
      if(detailed||pair%2===0)leaflet(foliage,p,tip,(.035+Math.sin(t*Math.PI)*.027)*scale,leafTone,phase,.1+t*t*.12,detailed);
    }
  }
  // Coconuts are part of the bark batch, with shared geometry and no child draws.
  const nutColor=new THREE.Color('#896a3e'),sides=detailed?7:5,rows=5;
  for(let nut=0;nut<4;nut++) {
    const angle=yaw+nut*2.1,p=crown.clone().add(v(Math.cos(angle)*.25*scale,-.25*scale,Math.sin(angle)*.25*scale)),start=bark.position.length/3;
    for(let row=0;row<=rows;row++)for(let side=0;side<sides;side++) {
      const phi=row/rows*Math.PI,a=side/sides*TAU;
      vertex(bark,p.clone().add(v(Math.cos(a)*Math.sin(phi)*.2*scale,Math.cos(phi)*.27*scale,Math.sin(a)*Math.sin(phi)*.2*scale)),nutColor);
      if(row<rows){const n=start+row*sides+side,next=start+row*sides+(side+1)%sides;bark.index.push(n,next,n+sides,next,next+sides,n+sides);}
    }
  }
}

function geometryFrom(source) {
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(source.position,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(source.color,3));geometry.setAttribute('palmWind',new THREE.Float32BufferAttribute(source.wind,3));
  geometry.setIndex(source.index);geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
  geometry.boundingBox.expandByScalar(.32);geometry.boundingSphere.radius+=.32;return geometry;
}

/** Original authored palm kit; all geometries/materials belong to this helper. */
export function createPalmTrees(parent,placements,{groundY=-.01}={}) {
  const root=new THREE.Group();root.name='detailed-palm-trees';parent.add(root);
  const time={value:0},geometries=[],chunks=[],eye=v(),matrix=new THREE.Matrix4(),frustum=new THREE.Frustum(),worldBox=new THREE.Box3();
  const barkMaterial=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.96});barkMaterial.name='palm-ringed-bark';
  const leafMaterial=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.86,side:THREE.DoubleSide});leafMaterial.name='palm-leaflets';
  const depthMaterial=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,side:THREE.DoubleSide});
  function wind(shader){shader.uniforms.palmTime=time;shader.vertexShader='uniform float palmTime; attribute vec3 palmWind;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      transformed.x += sin(palmTime * 0.82 + palmWind.y) * palmWind.x;
      transformed.z += cos(palmTime * 0.67 + palmWind.y) * palmWind.x * 0.6;
      transformed.y += sin(palmTime * 1.9 + palmWind.y + position.x * 2.0) * palmWind.z;
    `);
  }
  leafMaterial.onBeforeCompile=shader=>{wind(shader);shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_begin>',`#include <normal_fragment_begin>
      vec3 palmUp = normalize(mat3(viewMatrix) * vec3(0.0, 1.0, 0.0));
      normal = normalize(normal + palmUp * (0.45 + max(0.0, -dot(normal, palmUp)) * 1.65));
    `);};
  leafMaterial.customProgramCacheKey=()=> 'palm-leaf-wind-v1';depthMaterial.onBeforeCompile=wind;depthMaterial.customProgramCacheKey=()=> 'palm-depth-wind-v1';
  const diagnostics={count:placements.length,variants:5,chunks:0,materials:3,mainMaterials:2,shadowMaterials:1,textures:0,allocatedTriangles:0,
    visibleTrees:0,nearTrees:0,farTrees:0,visibleTriangles:0,visibleDrawCalls:0,estimates:true,time:0,windAnimated:true,disposed:false};
  const cells=new Map();placements.forEach((placement,index)=>{const key=`${placement.x<0?0:1},${placement.z<0?0:1}`;if(!cells.has(key))cells.set(key,[]);cells.get(key).push({placement,index});});
  for(const trees of cells.values()) {
    const chunk={near:null,far:null,box:new THREE.Box3(),count:trees.length,level:'near',nearTriangles:0,farTriangles:0};
    for(const detailed of [true,false]) {
      const bark=data(),leaves=data(),group=new THREE.Group();group.name=detailed?'palm-near-batch':'palm-far-batch';
      for(const {placement,index} of trees)palm(placement,index,bark,leaves,detailed,groundY);
      for(const [source,material] of [[bark,barkMaterial],[leaves,leafMaterial]]) {
        const geometry=geometryFrom(source),mesh=new THREE.Mesh(geometry,material);geometries.push(geometry);
        mesh.castShadow=true;mesh.receiveShadow=true;if(material===leafMaterial)mesh.customDepthMaterial=depthMaterial;
        group.add(mesh);chunk[detailed?'nearTriangles':'farTriangles']+=source.index.length/3;
        diagnostics.allocatedTriangles+=source.index.length/3;
      }
      chunk[detailed?'near':'far']=group;group.visible=detailed;root.add(group);
    }
    for(const mesh of chunk.near.children)chunk.box.union(mesh.geometry.boundingBox);
    chunks.push(chunk);
  }
  diagnostics.chunks=chunks.length;
  let disposed=false;
  return {root,diagnostics,
    update(value){time.value=value;diagnostics.time=value;},
    beforeRender(camera){camera.updateMatrixWorld();root.updateWorldMatrix(true,false);camera.getWorldPosition(eye);matrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);frustum.setFromProjectionMatrix(matrix);
      diagnostics.visibleTrees=diagnostics.nearTrees=diagnostics.farTrees=diagnostics.visibleTriangles=diagnostics.visibleDrawCalls=0;
      for(const chunk of chunks){worldBox.copy(chunk.box).applyMatrix4(root.matrixWorld);const distance=worldBox.distanceToPoint(eye);
        if(chunk.level==='near'&&distance>105)chunk.level='far';else if(chunk.level==='far'&&distance<90)chunk.level='near';
        chunk.near.visible=chunk.level==='near';chunk.far.visible=chunk.level==='far';
        if(!root.visible||!frustum.intersectsBox(worldBox))continue;
        diagnostics.visibleTrees+=chunk.count;diagnostics[chunk.level==='near'?'nearTrees':'farTrees']+=chunk.count;
        diagnostics.visibleDrawCalls+=2;diagnostics.visibleTriangles+=chunk[chunk.level==='near'?'nearTriangles':'farTriangles'];
      }
    },
    dispose(){if(disposed)return;disposed=true;root.removeFromParent();geometries.forEach(g=>g.dispose());barkMaterial.dispose();leafMaterial.dispose();depthMaterial.dispose();diagnostics.disposed=true;}
  };
}
