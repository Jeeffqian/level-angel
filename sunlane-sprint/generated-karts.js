import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {KARTS,AVATARS} from './config.js';
import {createRoundKartWheel,kartWheelFit,cleanGeneratedWheelFragments} from './kart-wheels.js';

const templates=[],avatarTemplates=[];
let specifications=[],avatarSpecifications=[];
const vector=value=>Array.isArray(value)&&value.length===3&&value.every(Number.isFinite);

export async function loadGeneratedKarts(onProgress=()=>{}) {
  const response=await fetch('./assets/karts/manifest.json');
  if(!response.ok)throw new Error(`Racer manifest: HTTP ${response.status}`);
  const manifest=await response.json();
  specifications=manifest.karts;avatarSpecifications=manifest.avatars;
  for(const [specs,config] of [[specifications,KARTS],[avatarSpecifications,AVATARS]]){
    if(!Array.isArray(specs)||specs.length!==config.length||specs.some((s,i)=>s.id!==config[i].id||!s.path))throw new Error('The racer manifest does not match the garage roster');
  }
  avatarSpecifications.forEach((spec,i)=>{AVATARS[i].portrait=spec.portrait;});
  for(const spec of specifications){
    if(!Array.isArray(spec.wheels)||spec.wheels.length!==4||new Set(spec.wheels.map(w=>w.name)).size!==4||spec.wheels.filter(w=>w.front).length!==2||!spec.wheels.every(w=>vector(w.center))||!Number.isFinite(spec.wheelRadius)||spec.wheelRadius<=0)throw new Error('Invalid kart wheel configuration');
    if(!spec.driver||!vector(spec.driver.position)||!Number.isFinite(spec.driver.scale)||spec.driver.scale<=0)throw new Error('Invalid kart driver configuration');
  }
  const loader=new GLTFLoader(),total=specifications.length+avatarSpecifications.length;let done=0;
  await Promise.all([
    ...specifications.map((spec,i)=>load(spec,templates,i)),
    ...avatarSpecifications.map((spec,i)=>load(spec,avatarTemplates,i)),
  ]);
  async function load(spec,target,index){
    const gltf=await loader.loadAsync(spec.path);
    for(const wheel of spec.wheels||[])if(!gltf.scene.getObjectByName(wheel.name)?.isMesh)throw new Error(`Missing animated wheel ${wheel.name}`);
    if(spec.wheels)cleanGeneratedWheelFragments(gltf.scene,spec);
    gltf.scene.traverse(node=>{if(node.isMesh){node.castShadow=true;node.receiveShadow=true;for(const material of Array.isArray(node.material)?node.material:[node.material])if(material.map)material.map.anisotropy=4;}});
    target[index]=gltf.scene;onProgress(++done,total);
  }
}

// Geometry and materials stay shared; changing a driver never reloads a GLB.
export function setKartAvatar(root,index){
  if(!avatarTemplates[index])throw new Error('Generated avatar assets are not loaded');
  if(root.userData.avatarIndex===index)return;
  if(root.userData.avatar)root.remove(root.userData.avatar);
  const spec=specifications[root.userData.kartIndex],avatar=avatarTemplates[index].clone(true);
  avatar.name=`driver-${AVATARS[index].id}`;
  avatar.position.fromArray(spec.driver.position);avatar.scale.setScalar(spec.driver.scale);
  root.add(avatar);
  Object.assign(root.userData,{avatar,avatarIndex:index,avatarId:AVATARS[index].id,avatarGenerationId:avatarSpecifications[index].generationId});
}

export function createGeneratedKart(index,avatarIndex=index){
  if(!templates[index])throw new Error('Generated kart assets are not loaded');
  const spec=specifications[index],root=new THREE.Group(),model=templates[index].clone(true);
  root.name=KARTS[index].name;root.add(model);
  const wheels=[],frontPivots=[],fittedWheels=kartWheelFit(model,spec);
  for(const wheelSpec of fittedWheels){
    const mesh=model.getObjectByName(wheelSpec.name);
    mesh.removeFromParent();
    const pivot=new THREE.Group();pivot.position.fromArray(wheelSpec.center);root.add(pivot);
    const rolling=createRoundKartWheel({kartIndex:index,axle:wheelSpec.front?'front':'rear',radius:wheelSpec.radius,width:wheelSpec.width,color:KARTS[index].color});
    rolling.name=wheelSpec.name;pivot.add(rolling);
    wheels.push(rolling);if(wheelSpec.front)frontPivots.push(pivot);
  }
  Object.assign(root.userData,{kartIndex:index,wheels,frontPivots,wheelRadius:spec.wheelRadius,wheelSource:'Parametric racing wheels',
    assetSource:'Hyper3D Rodin Gen-2.5 High',generationId:spec.generationId,
    exhaust:[new THREE.Vector3(-.5,.6,-1.6),new THREE.Vector3(.5,.6,-1.6)]});
  setKartAvatar(root,avatarIndex);
  return root;
}
