import * as THREE from 'three';
import {mergeGeometries} from './vendor/addons/utils/BufferGeometryUtils.js';
import {nearestTrack} from './track.js';

// A shared, material-batched coastal kit. It owns every resource it creates.
export function createCoastProps(parent) {
  const root=new THREE.Group();root.name='high-coast-props';parent.add(root);
  const bins=new Map(),owned=new Set(),textures=[],materials=[];
  const material=(name,color,extra={})=>{const m=new THREE.MeshStandardMaterial({color,roughness:.82,...extra});m.name=name;materials.push(m);return m;};
  const grain=new Uint8Array(64*64*4);let seed=9317;
  for(let i=0;i<grain.length;i+=4){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const v=130+(seed>>>25);grain[i]=grain[i+1]=grain[i+2]=v;grain[i+3]=255;}
  const surface=new THREE.DataTexture(grain,64,64);surface.wrapS=surface.wrapT=THREE.RepeatWrapping;surface.repeat.set(5,5);surface.magFilter=THREE.LinearFilter;surface.minFilter=THREE.LinearMipmapLinearFilter;surface.generateMipmaps=true;surface.needsUpdate=true;textures.push(surface);
  const paint=material('weathered-painted-clapboard','#ffffff',{vertexColors:true,bumpMap:surface,bumpScale:.022});
  const stucco=material('warm-stucco','#fff0d2',{bumpMap:surface,bumpScale:.045});
  const stone=material('cut-limestone','#c6bd9d',{bumpMap:surface,bumpScale:.055});
  const wood=material('oiled-timber','#a77950',{bumpMap:surface,bumpScale:.028});
  const roof=material('terracotta-roof','#bd604b',{bumpMap:surface,bumpScale:.045});
  const trim=material('ivory-trim','#fff8e8',{roughness:.62});
  const dark=material('recesses-and-soil','#304d50');
  const metal=material('marine-metal','#35585d',{metalness:.45,roughness:.42});
  const glass=material('lantern-glazing','#9ee2d7',{transparent:true,opacity:.42,roughness:.16,metalness:.08,depthWrite:false});
  const windows=material('window-glass','#397f86',{roughness:.22,metalness:.3});
  const green=material('planter-leaves','#518c62',{vertexColors:true});
  const bulb=material('lantern-lens','#ffe3a0',{emissive:'#ffd26b',emissiveIntensity:.32,roughness:.24});
  const box=new THREE.BoxGeometry(1,1,1),cylinder=new THREE.CylinderGeometry(1,1,1,12),sphere=new THREE.IcosahedronGeometry(1,1);owned.add(box);owned.add(cylinder);owned.add(sphere);
  const object=new THREE.Object3D(),placement=new THREE.Matrix4();
  function origin(x=0,z=0,angle=0){placement.makeRotationY(angle);placement.setPosition(x,0,z);}
  function add(g,m,x,y,z,sx=1,sy=1,sz=1,rx=0,ry=0,rz=0,color=null){
    object.position.set(x,y,z);object.scale.set(sx,sy,sz);object.rotation.set(rx,ry,rz);object.updateMatrix();
    const clone=g.index?g.toNonIndexed():g.clone();clone.applyMatrix4(new THREE.Matrix4().multiplyMatrices(placement,object.matrix));
    if(m.vertexColors){const c=new THREE.Color(color||'#ffffff'),a=new Float32Array(clone.attributes.position.count*3);for(let i=0;i<a.length;i+=3){a[i]=c.r;a[i+1]=c.g;a[i+2]=c.b;}clone.setAttribute('color',new THREE.BufferAttribute(a,3));}
    const list=bins.get(m)||[];list.push(clone);bins.set(m,list);
  }
  const block=(m,x,y,z,w,h,d,rx=0,ry=0,rz=0,color=null)=>add(box,m,x,y,z,w,h,d,rx,ry,rz,color);
  const unique=(g,m,...args)=>{add(g,m,...args);g.dispose();};
  const pole=(m,x,y,z,r,h)=>add(cylinder,m,x,y,z,r,h,r);
  function beam(m,a,b,r=.045){const direction=new THREE.Vector3().subVectors(b,a),q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),direction.clone().normalize()),e=new THREE.Euler().setFromQuaternion(q),p=a.clone().add(b).multiplyScalar(.5);add(cylinder,m,p.x,p.y,p.z,r,direction.length(),r,e.x,e.y,e.z);}
  function planter(x,z){
    block(wood,x,.35,z,1.8,.7,.8);block(dark,x,.71,z,1.54,.035,.59);
    for(const dx of [-.9,.9])block(trim,x+dx,.39,z,.075,.76,.88);
    for(let i=0;i<5;i++){const xx=x-.65+i*.32;add(sphere,green,xx,.98+(i%2)*.1,z,.33,.4,.25,0,i,0,i%2?'#c0d699':'#ffffff');pole(wood,xx,.98,z,.018,.75);add(sphere,paint,xx,1.24+(i%2)*.1,z,.13,.11,.13,0,0,0,i%2?'#fff0aa':'#ee927c');}
  }
  function windowFront(x,y,z){
    block(dark,x,y,z,1.7,1.64,.14);block(windows,x,y,z+.085,1.3,1.3,.025);
    for(const dx of [-.73,.73])block(trim,x+dx,y,z+.13,.14,1.64,.13);
    for(const dy of [-.76,0,.76])block(trim,x,y+dy,z+.14,1.55,.11,.14);
    block(trim,x,y,z+.15,.08,1.42,.12);block(stone,x,y-.84,z+.22,1.96,.17,.43);
    for(const side of [-1,1])for(let row=0;row<5;row++)block(wood,x+side*1.12,y-.6+row*.3,z+.075,.42,.25,.1);
  }
  function hut(x,z,color,angle){
    origin(x,z,angle);
    block(stone,0,.18,.4,7.3,.36,8.2);block(wood,0,.48,.65,6.8,.25,7.7);
    block(dark,0,2.47,0,5.97,3.8,4.95);
    for(let row=0;row<12;row++){
      const y=.74+row*.3,tint=new THREE.Color(color).multiplyScalar(row%3===0?.94:1);
      for(const side of [-1,1]){block(paint,0,y,side*2.5,6.1,.32,.12,0,0,0,tint);block(paint,side*3,y,0,.12,.32,5,0,0,0,tint);}
    }
    for(const xx of [-3,3])for(const zz of [-2.5,2.5])block(trim,xx,2.38,zz,.16,3.9,.16);
    block(trim,0,4.28,0,6.6,.22,5.7);
    // Gabled roof with an actual triangular infill, overlapping courses and ridge cap.
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([-3,4.35,2.52,3,4.35,2.52,0,5.91,2.52,3,4.35,-2.52,-3,4.35,-2.52,0,5.91,-2.52],3));g.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,.5,1,0,0,1,0,.5,1],2));g.computeVertexNormals();unique(g,paint,0,0,0,1,1,1,0,0,0,color);
    for(const side of [-1,1]){
      block(roof,side*1.68,5.09,0,3.9,.16,6.05,0,0,-side*.46);
      for(let course=0;course<9;course++){const xx=side*(.2+course*.38),yy=6.02-Math.abs(xx)*.493;block(roof,xx,yy,.02,.46,.11,6.18,0,0,-side*.46);block(wood,xx,yy+.09,.02,.055,.045,6.19,0,0,-side*.46);}
      for(const zz of [-3.08,3.08])block(trim,side*1.72,5.1,zz,3.92,.16,.13,0,0,-side*.46);
      block(wood,side*3.4,4.36,0,.15,.27,6.16);
    }
    unique(new THREE.CylinderGeometry(.14,.14,6.3,8),roof,0,5.99,0,1,1,1,Math.PI/2);
    windowFront(-1.5,2.42,2.57);
    block(dark,1.28,1.99,2.59,1.54,2.85,.16);block(wood,1.28,1.96,2.69,1.25,2.62,.07);
    for(let i=0;i<5;i++)block(trim,.82+i*.23,2.02,2.745,.024,2.36,.022);
    for(const xx of [.55,2.01])block(trim,xx,2.03,2.73,.12,2.98,.18);block(trim,1.28,3.48,2.73,1.65,.14,.2);add(sphere,metal,.87,1.97,2.81,.065,.065,.065);
    for(let i=0;i<10;i++)block(wood,-2.95+i*.65,.64,3.65,.59,.09,2);
    for(const xx of [-2.9,2.9])pole(trim,xx,2.3,4.54,.095,3.55);
    // Striped sloping canvas is solid geometry, with a scalloped-looking valance.
    for(let i=0;i<12;i++){const xx=-3.03+i*.55;block(i%2?trim:paint,xx,3.99,3.68,.55,.09,2.38,.14,0,0,color);block(i%2?trim:paint,xx,3.72,4.84,.55,.33,.07,0,0,0,color);}
    for(const side of [-1,1]){
      block(trim,side*2.92,1.42,3.67,.1,.13,1.84);
      for(let j=0;j<5;j++)pole(trim,side*2.92,1.03,2.9+j*.36,.035,.74);
      block(trim,side*2.05,1.42,4.52,1.72,.13,.1);
      for(let j=0;j<5;j++)pole(trim,side*(1.28+j*.38),1.03,4.52,.035,.74);
    }
    block(stone,.1,.17,5.39,2.4,.34,.88);block(wood,.1,.36,4.98,2.4,.38,.55);
    planter(-4.15,2.5);planter(4.15,2.5);
    // Side windows read from road-facing oblique views.
    for(const side of [-1,1]){block(dark,side*3.09,2.5,-.6,.1,1.48,1.55);block(windows,side*3.15,2.5,-.6,.04,1.2,1.26);for(const dz of [-.74,0,.74])block(trim,side*3.19,2.5,-.6+dz,.15,1.52,.1);for(const dy of [-.73,.73])block(trim,side*3.19,2.5+dy,-.6,.2,.12,1.65);}
  }
  const landmarks=[{x:-46,z:-26,angle:-.2,color:'#269f9d'},{x:-58,z:-29,angle:.1,color:'#ed8069'},{x:-70,z:-28,angle:.25,color:'#eacb69'},{x:66,z:57,angle:Math.PI,color:'#269f9d'},{x:77,z:58,angle:Math.PI,color:'#eacb69'}];
  for(const p of landmarks)hut(p.x,p.z,p.color,p.angle);
  origin(138,65);
  for(let i=0;i<3;i++)unique(new THREE.CylinderGeometry(6.5-i*.5,6.5-i*.5,.22,40),stone,0,.11+i*.22,0);
  for(let i=0;i<8;i++){
    const bottom=2.5-i*.09,top=bottom-.09;
    unique(new THREE.CylinderGeometry(top,bottom,1.8,32),i%2?paint:stucco,0,1.55+i*1.8,0,1,1,1,0,0,0,'#e8755b');
    unique(new THREE.TorusGeometry(bottom-.03,.035,4,32),stone,0,.66+i*1.8,0,1,1,1,Math.PI/2);
  }
  // Recessed window wells with a projecting pale frame on the sunny face.
  for(let i=0;i<4;i++){const z=2.53-i*.17,y=2.3+i*3.1;block(dark,0,y,z,.82,1.4,.15);block(windows,0,y,z+.08,.57,1.12,.025);for(const dx of [-.43,.43])block(trim,dx,y,z+.1,.12,1.55,.22);for(const dy of [-.73,.73])block(trim,0,y+dy,z+.1,.98,.12,.23);block(trim,0,y,z+.11,.055,1.3,.1);}
  unique(new THREE.CylinderGeometry(3.1,2.75,.3,32),stone,0,15.15,0);
  unique(new THREE.CylinderGeometry(3.25,3.25,.16,32),trim,0,15.39,0);
  for(let i=0;i<24;i++){const a=i/24*Math.PI*2;pole(metal,Math.sin(a)*3.02,15.99,Math.cos(a)*3.02,.038,1.1);}
  for(const y of [15.66,16.51])unique(new THREE.TorusGeometry(3.02,.055,5,48),metal,0,y,0,1,1,1,Math.PI/2);
  unique(new THREE.CylinderGeometry(1.83,1.83,2.25,12,1,true),glass,0,16.64,0);
  for(let i=0;i<12;i++){const a=i/12*Math.PI*2;pole(metal,Math.sin(a)*1.84,16.66,Math.cos(a)*1.84,.055,2.4);}
  for(const y of [15.51,17.78])unique(new THREE.CylinderGeometry(2,2,.14,24),metal,0,y,0);
  pole(metal,0,16.18,0,.18,1.2);add(sphere,bulb,0,16.87,0,.61,.82,.61);
  unique(new THREE.ConeGeometry(2.67,1.45,24),roof,0,18.5,0);pole(metal,0,19.44,0,.065,.57);add(sphere,bulb,0,19.79,0,.15,.19,.15);
  // A handful of clear-of-track beach vignettes, rather than random clutter.
  const beachPlacements=[];
  for(const [x,z,angle] of [[-100,-50,.4],[-148,20,1.2],[-35,-113,.2],[70,109,2],[20,108,-.2],[-80,108,.5],[145,-25,1]]){
    const radius=5;if(nearestTrack(x,z).distance<14+radius||((Math.abs(x)+radius)/171)**2+((Math.abs(z)+radius)/138)**2>.98)continue;
    beachPlacements.push({x,z,radius,trackClearance:nearestTrack(x,z).distance-radius});origin(x,z,angle);
    pole(wood,0,1.7,0,.055,3.4);
    for(let i=0;i<12;i++)unique(new THREE.ConeGeometry(2.25,.65,1,1,true,i*Math.PI/6,Math.PI/6),i%2?trim:paint,0,3.43,0,1,1,1,0,0,0,'#eacb69');
    add(sphere,wood,0,3.84,0,.09,.12,.09);
    for(const x0 of [-1.65,1.65]){
      for(const side of [-1,1]){block(wood,x0+side*.49,.49,1.65,.07,.07,2.3);block(wood,x0+side*.49,.81,.53,.07,.84,.07,-.38);for(const zz of [.7,2.55])block(wood,x0+side*.49,.25,zz,.07,.5,.07);}
      for(let stripe=0;stripe<6;stripe++){const xx=x0-.42+stripe*.168;block(stripe%2?trim:paint,xx,.54,1.65,.166,.035,2.2,0,0,0,'#269f9d');block(stripe%2?trim:paint,xx,.86,.52,.166,.84,.035,-.38,0,0,'#269f9d');}
    }
    add(sphere,paint,3.2,1.42,-.5,.43,1.58,.1,0,.2,-.15,'#ed8069');block(trim,3.2,1.42,-.37,.11,2.68,.045,0,.2,-.15);
  }
  for(const [m,list] of bins){const geometry=mergeGeometries(list,false);list.forEach(g=>g.dispose());geometry.computeBoundingBox();geometry.computeBoundingSphere();owned.add(geometry);const mesh=new THREE.Mesh(geometry,m);mesh.name=m.name;mesh.castShadow=m!==glass;mesh.receiveShadow=true;root.add(mesh);}
  bins.clear();for(const g of [box,cylinder,sphere]){g.dispose();owned.delete(g);}
  root.updateMatrixWorld(true);
  const diagnostics={meshes:root.children.length,materials:materials.length,geometries:owned.size,textures:textures.length,triangles:root.children.reduce((sum,m)=>sum+(m.geometry.index?.count??m.geometry.attributes.position.count)/3,0),landmarks:landmarks.map(({x,z,angle})=>({x,z,angle})),beachPlacements};
  let disposed=false;
  return {root,diagnostics,update(_time){},dispose(){if(disposed)return;disposed=true;root.removeFromParent();for(const g of owned)g.dispose();for(const m of materials)m.dispose();for(const t of textures)t.dispose();root.clear();owned.clear();}};
}
