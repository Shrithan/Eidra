import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
const planets=[{r:3,size:.64,color:'#8ed7c0',phase:.3},{r:4.5,size:.88,color:'#b3a0f5',phase:2.2},{r:6,size:.7,color:'#f3ae88',phase:4.4},{r:7.5,size:1.05,color:'#94b5e8',phase:5.5}]
function City({size,color}:{size:number;color:string}){return <group><mesh><icosahedronGeometry args={[size,2]}/><meshStandardMaterial color={color} flatShading roughness={.85}/></mesh>{Array.from({length:8},(_,i)=>{const angle=i*2.4,x=Math.cos(angle)*size*.58,z=Math.sin(angle)*size*.58,h=.16+(i%3)*.12;return <mesh key={i} position={[x,Math.sqrt(Math.max(.1,size*size-x*x-z*z))+h/2-.02,z]} rotation={[0,angle,0]}><boxGeometry args={[.13,h,.16]}/><meshStandardMaterial color={i%2?'#e3daf9':'#69528f'} roughness={.7}/></mesh>})}</group>}
function System({still,progress}:{still:boolean;progress:RefObject<number>}){
 const group=useRef<THREE.Group>(null),time=useRef(0)
 const stars=useMemo(()=>{const data=new Float32Array(360*3);for(let i=0;i<360;i++){const a=i*2.39996;data[i*3]=Math.cos(a)*(10+(i%17));data[i*3+1]=(Math.sin(i*12.7))*13;data[i*3+2]=Math.sin(a)*(10+(i%17))-8}return data},[])
 useFrame((state,dt)=>{if(!group.current)return;if(!still){time.current+=Math.min(dt,.04);const p=progress.current;group.current.rotation.y=time.current*.045+p*2.3;group.current.rotation.z=.08+Math.sin(p*5)*.16;group.current.position.x=THREE.MathUtils.lerp(group.current.position.x,p>.2?-1.5:1,.025);const scale=p>.5?1.05:1;group.current.scale.lerp(new THREE.Vector3(scale,scale,scale),.02);state.camera.position.x=THREE.MathUtils.lerp(state.camera.position.x,state.pointer.x*.6,.02)}})
 return <><points><bufferGeometry><bufferAttribute attach="attributes-position" args={[stars,3]}/></bufferGeometry><pointsMaterial size={.027} color="#b8a8d8" transparent opacity={.65}/></points><group rotation={[.25,0,0]}><group ref={group} position={[1,0,0]}>
 {planets.map(p=><group key={p.r}><mesh rotation={[-Math.PI/2,0,0]}><ringGeometry args={[p.r-.008,p.r+.008,160]}/><meshBasicMaterial color="#7b629a" transparent opacity={.55} side={THREE.DoubleSide}/></mesh><group position={[Math.cos(p.phase)*p.r,0,Math.sin(p.phase)*p.r]}><City size={p.size} color={p.color}/>{p.r===7.5&&<mesh rotation={[.65,0,.15]}><ringGeometry args={[1.3,1.65,64]}/><meshStandardMaterial color="#bcade2" side={THREE.DoubleSide} roughness={.8}/></mesh>}</group></group>)}
 <group><City size={1.35} color="#a377d8"/><mesh rotation={[-Math.PI/2,0,.3]}><torusGeometry args={[1.9,.025,8,100]}/><meshBasicMaterial color="#dfb5ff"/></mesh><mesh rotation={[-Math.PI/2+.45,.2,0]}><torusGeometry args={[2.05,.018,8,100]}/><meshBasicMaterial color="#9873cf"/></mesh></group>
 </group></group></>
}
export default function WelcomeOrbit({progress}:{progress:RefObject<number>}){
 const [still,setStill]=useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches),[visible,setVisible]=useState(()=>!document.hidden)
 useEffect(()=>{const media=matchMedia('(prefers-reduced-motion: reduce)');const change=()=>setStill(media.matches),visibility=()=>setVisible(!document.hidden);media.addEventListener('change',change);document.addEventListener('visibilitychange',visibility);return()=>{media.removeEventListener('change',change);document.removeEventListener('visibilitychange',visibility)}},[])
 return <Canvas camera={{position:[0,10,14],fov:48}} dpr={[1,1.5]} frameloop={still||!visible?'demand':'always'} aria-hidden="true"><ambientLight intensity={1.3}/><directionalLight position={[2,9,5]} intensity={2.7}/><pointLight position={[-8,3,0]} color="#a97aff" intensity={25}/><System still={still} progress={progress}/></Canvas>
}
