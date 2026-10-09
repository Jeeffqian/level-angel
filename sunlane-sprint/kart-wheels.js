import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// Analytic, circular wheel surfaces replace the uneven generated tire partitions.
// A kit is shared by every garage preview and racer using this kart/axle.
const kits=new Map();
const SEGMENTS=64;
const DESIGNS=[{spokes:5,sweep:.12},{spokes:6,sweep:.22},{spokes:5,sweep:0},{spokes:8,sweep:.06},{spokes:6,sweep:-.18}];
let rubber;
function tireMaterial(){
  if(rubber)return rubber;
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=256;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#999';ctx.fillRect(0,0,1024,256);
  // Fine molded rubber and diagonal tread sipes, not lumps on the rolling edge.
  let seed=19;for(let i=0;i<10000;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const x=seed%1024;seed=(Math.imul(seed,1664525)+1013904223)>>>0;ctx.fillStyle=i%2?'#909090':'#a0a0a0';ctx.fillRect(x,seed%256,1,1);}
  ctx.strokeStyle='#292929';ctx.lineWidth=4;
  for(let x=-32;x<1056;x+=32){ctx.beginPath();ctx.moveTo(x,63);ctx.lineTo(x+13,115);ctx.moveTo(x+13,141);ctx.lineTo(x,193);ctx.stroke();}
  const bump=new THREE.CanvasTexture(canvas);bump.wrapS=THREE.RepeatWrapping;bump.anisotropy=4;
  rubber=new THREE.MeshStandardMaterial({name:'Molded racing rubber',color:'#242a30',roughness:.88,metalness:.02,bumpMap:bump,bumpScale:.007});
  return rubber;
}
function lathe(profile){
  return new THREE.LatheGeometry(profile.map(([r,x])=>new THREE.Vector2(r,x)),SEGMENTS).rotateZ(-Math.PI/2);
}
function ring(radius,tube,x){return new THREE.TorusGeometry(radius,tube,4,SEGMENTS).rotateY(Math.PI/2).translate(x,0,0);}
function cylinder(radius,width,x,segments=SEGMENTS,open=false){return new THREE.CylinderGeometry(radius,radius,width,segments,1,open).rotateZ(-Math.PI/2).translate(x,0,0);}
function combine(parts){
  const prepared=parts.map(({geometry,color})=>{
    const g=geometry.index?geometry.toNonIndexed():geometry;
    if(g!==geometry)geometry.dispose();
    const c=new THREE.Color(color),colors=new Float32Array(g.attributes.position.count*3);
    for(let i=0;i<colors.length;i+=3){colors[i]=c.r;colors[i+1]=c.g;colors[i+2]=c.b;}
    g.setAttribute('color',new THREE.BufferAttribute(colors,3));return g;
  });
  const merged=mergeGeometries(prepared);prepared.forEach(g=>g.dispose());merged.computeBoundingSphere();return merged;
}
function makeKit(index,radius,width,color){
  const r=radius,w=width,design=DESIGNS[index%DESIGNS.length];
  const profile=[
    [.59,-.46],[.68,-.51],[.80,-.51],[.92,-.46],[.985,-.35],
    [1,-.27],[1,-.16],[.975,-.145],[.975,-.12],[1,-.105],
    [1,.105],[.975,.12],[.975,.145],[1,.16],[1,.27],
    [.985,.35],[.92,.46],[.80,.51],[.68,.51],[.59,.46],[.59,-.46],
  ].map(([radial,axial])=>[radial*r,axial*w]);
  const metal=[{geometry:cylinder(r*.61,w*.89,0,64,true),color:'#485362'}],paint=[];
  for(const side of [-1,1]){
    const face=side*w*.49;
    metal.push({geometry:cylinder(r*.55,r*.027,side*w*.32,48),color:'#626b74'});
    metal.push({geometry:ring(r*.607,r*.023,face),color:'#b9c7d2'});
    metal.push({geometry:cylinder(r*.17,r*.09,face,24),color:'#647380'});
    paint.push({geometry:ring(r*.652,r*.032,face),color});
    paint.push({geometry:cylinder(r*.11,r*.03,face+side*r*.055,12),color});
    // Beveled swept spokes, inset brake rotor and five raised hex wheel nuts.
    for(let i=0;i<design.spokes;i++){
      const shape=new THREE.Shape();shape.moveTo(-r*.045,r*.13);shape.lineTo(r*.045,r*.13);
      shape.lineTo(r*(.07+design.sweep),r*.56);shape.lineTo(r*(-.045+design.sweep),r*.59);shape.closePath();
      const spoke=new THREE.ExtrudeGeometry(shape,{depth:r*.035,bevelEnabled:true,bevelSegments:1,steps:1,bevelSize:r*.013,bevelThickness:r*.012,curveSegments:1});
      spoke.rotateZ(i*Math.PI*2/design.spokes).rotateY(side*Math.PI/2).translate(face,0,0);
      metal.push({geometry:spoke,color:i%2?'#9aaaba':'#c2cdd6'});
    }
    for(let i=0;i<5;i++){
      const a=i*Math.PI*2/5;
      metal.push({geometry:cylinder(r*.033,r*.045,face+side*r*.035,6).translate(0,Math.cos(a)*r*.225,Math.sin(a)*r*.225),color:'#d9e0e4'});
    }
    // Balanced molded sidewall markers remain readable as the tire turns.
    for(let i=0;i<3;i++){
      const a=i*Math.PI*2/3;
      const mark=new THREE.BoxGeometry(r*.012,r*.07,r*.014).translate(side*w*.519,r*.805,0).rotateX(a);
      paint.push({geometry:mark,color:'#b0b6b8'});
    }
  }
  const meshes=[
    new THREE.Mesh(lathe(profile),tireMaterial()),
    new THREE.Mesh(combine(metal),new THREE.MeshStandardMaterial({name:'Machined alloy',vertexColors:true,roughness:.39,metalness:.72})),
    new THREE.Mesh(combine(paint),new THREE.MeshStandardMaterial({name:'Kart-colored rim trim',vertexColors:true,roughness:.36,metalness:.4})),
  ];
  meshes.forEach((mesh,i)=>{mesh.name=['round-tire','alloy-spokes-and-hub','rim-trim'][i];mesh.castShadow=true;mesh.receiveShadow=true;});
  return meshes;
}

export function createRoundKartWheel({kartIndex,axle,radius,width,color}){
  const key=`${kartIndex}:${axle}:${radius}:${width}:${color}`;
  if(!kits.has(key))kits.set(key,makeKit(kartIndex,radius,width,color));
  const wheel=new THREE.Group();wheel.name='precision-round-wheel';
  for(const mesh of kits.get(key))wheel.add(mesh.clone());
  Object.assign(wheel.userData,{radius,width,radialSegments:SEGMENTS,source:'Parametric racing wheel'});
  return wheel;
}

export function kartWheelFit(model,spec){
  model.updateMatrixWorld(true);
  return spec.wheels.map(wheel=>{
    const pair=spec.wheels.filter(w=>w.front===wheel.front);
    const bounds=pair.map(w=>new THREE.Box3().setFromObject(model.getObjectByName(w.name)));
    const radius=pair.reduce((sum,w)=>sum+w.radius,0)/pair.length;
    const width=THREE.MathUtils.clamp(bounds.reduce((sum,b)=>sum+b.max.x-b.min.x,0)/bounds.length,radius*.75,radius*1.4);
    const x=bounds.reduce((sum,b)=>sum+Math.abs((b.min.x+b.max.x)/2),0)/bounds.length;
    const z=pair.reduce((sum,w)=>sum+w.center[2],0)/pair.length;
    return {...wheel,radius,width,center:[Math.sign(wheel.center[0])*x,radius+.006,z]};
  });
}

// The original export separated most tire faces, but a few rubber fragments
// remain fused to the fenders. Remove only dark, neutral faces in the tire band;
// painted panels, bright trim, chassis and the source S3 assets stay intact.
export function cleanGeneratedWheelFragments(model,spec){
  const fit=kartWheelFit(model,spec),wheelNames=new Set(spec.wheels.map(w=>w.name));
  let removed=0;
  const point=new THREE.Vector3();
  model.traverse(mesh=>{
    if(!mesh.isMesh||wheelNames.has(mesh.name)||Array.isArray(mesh.material))return;
    const geometry=mesh.geometry,uv=geometry.attributes.uv,map=mesh.material.map;
    if(!geometry.index||!uv||!map?.image)return;
    const canvas=document.createElement('canvas');canvas.width=map.image.width;canvas.height=map.image.height;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(map.image,0,0);
    const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
    const position=geometry.attributes.position,index=geometry.index,kept=[];let trimmed=0;
    for(let i=0;i<index.count;i+=3){
      const ids=[index.getX(i),index.getX(i+1),index.getX(i+2)];let x=0,y=0,z=0,u=0,v=0;
      for(const id of ids){point.fromBufferAttribute(position,id).applyMatrix4(mesh.matrixWorld);x+=point.x/3;y+=point.y/3;z+=point.z/3;u+=uv.getX(id)/3;v+=uv.getY(id)/3;}
      const inTire=fit.some(w=>Math.abs(x-w.center[0])<w.width*.58&&Math.hypot(y-w.center[1],z-w.center[2])<w.radius*1.12&&Math.hypot(y-w.center[1],z-w.center[2])>w.radius*.57);
      let rubberFace=false;
      if(inTire){
        const px=Math.min(canvas.width-1,Math.max(0,Math.floor(u*canvas.width))),py=Math.min(canvas.height-1,Math.max(0,Math.floor(v*canvas.height))),offset=(py*canvas.width+px)*4;
        const high=Math.max(pixels[offset],pixels[offset+1],pixels[offset+2]),low=Math.min(pixels[offset],pixels[offset+1],pixels[offset+2]);
        rubberFace=high<132&&(high-low)/Math.max(1,high)<.28;
      }
      if(rubberFace)trimmed++;else kept.push(...ids);
    }
    if(trimmed){mesh.geometry=geometry.clone();mesh.geometry.setIndex(kept);geometry.dispose();removed+=trimmed;}
  });
  model.userData.removedWheelFragments=removed;
}
