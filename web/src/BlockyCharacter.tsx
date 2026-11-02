import { useEffect, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js'
import { loadGLTF } from './sphereModels'
import type { Appearance } from './Rewards'

export const BLOCKY_CHARACTER_URL = '/models/blocky/character-b.glb'
const CHARACTER_HEIGHT = 1.85

export type CharacterMotion = {
  alt: number
  vel: THREE.Vector3
  seated?: boolean
  waving?: boolean
}

type CharacterRig = {
  root: THREE.Object3D
  mixer: THREE.AnimationMixer
  actions: Record<string, THREE.AnimationAction>
  wavingArm: THREE.Object3D | null
  armRest: THREE.Euler | null
}

/** The shared character rig used in the walkable world and inside every theatre. */
export default function BlockyCharacter({ motion, appearance }: { motion: React.MutableRefObject<CharacterMotion>; appearance?: Appearance }) {
  const [rig, setRig] = useState<CharacterRig | null>(null)
  const current = useRef('idle')
  const waveClock = useRef(0)

  useEffect(() => {
    let live = true
    loadGLTF(BLOCKY_CHARACTER_URL).then((gltf) => {
      if (!live) return
      const root = SkeletonUtils.clone(gltf.scene)
      const height = new THREE.Box3().setFromObject(gltf.scene).getSize(new THREE.Vector3()).y
      root.scale.setScalar(CHARACTER_HEIGHT / Math.max(0.01, height))
      root.rotation.y = Math.PI // face the same way as the outside-world character
      root.traverse((object) => { object.frustumCulled = false; if(object instanceof THREE.Mesh){object.geometry=object.geometry.clone();if(object.material instanceof THREE.MeshStandardMaterial)object.material=object.material.clone()} })

      const mixer = new THREE.AnimationMixer(root)
      const actions: Record<string, THREE.AnimationAction> = {}
      for (const clip of gltf.animations) actions[clip.name] = mixer.clipAction(clip)
      // The authored idle clip rocks the whole body. Leave the skeleton at its
      // bind pose until the player actually walks, sprints, or sits.
      const wavingArm = root.getObjectByName('arm-right') ?? null
      setRig({ root, mixer, actions, wavingArm, armRest: wavingArm?.rotation.clone() ?? null })
    }).catch((error) => console.warn('[character] could not load the shared avatar', error))
    return () => { live = false }
  }, [])

  useEffect(() => {
    if (!rig) return
    const look = appearance ?? { skin: '#d69b70', top: '#5c70c7', bottom: '#30334a', face: '#2a1a18', hat: 'none', chain: 'none' }
    // Cosmetics have their own authored materials. Detach them before rebuilding
    // avatar body groups so a shirt/skin change can never overwrite or erase them.
    rig.root.getObjectByName('__cosmetics')?.removeFromParent()
    rig.root.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(rig.root), height = Math.max(.001, box.max.y - box.min.y)
    const point = new THREE.Vector3()
    rig.root.traverse((object) => {
      if (!(object instanceof THREE.Mesh) || object.name.startsWith('__cosmetic') || !object.geometry.attributes.position) return
      // The model ships as a single textured mesh. Replace that shared material with
      // three independent physical materials; no vertex colours leak through a texture.
      const materials = [look.skin, look.top, look.bottom].map(color => new THREE.MeshStandardMaterial({ color, roughness: .82, metalness: .03 }))
      const pos = object.geometry.attributes.position
      const name = object.name.toLowerCase()
      const named = /head|hand/.test(name) ? 0 : /leg|foot|shoe|bottom/.test(name) ? 2 : /torso|arm|shirt|top/.test(name) ? 1 : -1
      // Segment each triangle into head/hands, clothing top, and legs/feet. Reordering
      // index data lets a Mesh use real material groups even when the GLB has one mesh.
      const triangles: number[][] = [[], [], []]
      const index = object.geometry.index
      for (let i = 0; i < (index ? index.count : pos.count); i += 3) {
        const ids = [index ? index.getX(i) : i, index ? index.getX(i + 1) : i + 1, index ? index.getX(i + 2) : i + 2]
        let y = 0
        for (const id of ids) { point.fromBufferAttribute(pos, id); object.localToWorld(point); y += (point.y - box.min.y) / height }
        const zone = named >= 0 ? named : y / 3 > .72 ? 0 : y / 3 > .30 ? 1 : 2
        triangles[zone].push(...ids)
      }
      const ordered = triangles.flat()
      object.geometry.setIndex(ordered)
      object.geometry.clearGroups()
      let start = 0
      triangles.forEach((part, materialIndex) => { if (part.length) { object.geometry.addGroup(start, part.length, materialIndex); start += part.length } })
      object.material = materials
    })
    const hatFile: Record<string,string>={crown:'/models/accessories/crown.glb',cap:'/models/accessories/top-hat.glb',cowboy:'/models/accessories/cowboy-hat.glb'}
    const chainFile: Record<string,string>={gold:'/models/accessories/teeth-necklace.glb',silver:'/models/accessories/chainmail-necklace.glb'}
    let cancelled=false
    const attach=async(file:string,kind:'hat'|'chain')=>{try{const gltf=await loadGLTF(file);if(cancelled)return;const item=SkeletonUtils.clone(gltf.scene);item.traverse(o=>o.frustumCulled=false);item.updateMatrixWorld(true);const assetBox=new THREE.Box3().setFromObject(item),size=assetBox.getSize(new THREE.Vector3()),center=assetBox.getCenter(new THREE.Vector3());const inv=1/Math.max(.0001,rig.root.scale.y),localTop=box.max.y*inv,localBottom=box.min.y*inv;const wide=kind==='hat'?size.x:Math.max(size.x,size.z);const target=(kind==='hat' ? .66 : .62)*inv;const scale=target/Math.max(.0001,wide);item.scale.setScalar(scale);item.position.set(-center.x*scale,kind==='hat'?localTop-assetBox.min.y*scale:localBottom+(box.max.y-box.min.y)*.68*inv-center.y*scale,-center.z*scale);item.name=`__cosmetic_${kind}`;let extras=rig.root.getObjectByName('__cosmetics') as THREE.Group|null;if(!extras){extras=new THREE.Group();extras.name='__cosmetics';rig.root.add(extras)}extras.add(item)}catch(error){console.warn('[character] accessory load failed',file,error)}}
    if(hatFile[look.hat])void attach(hatFile[look.hat],'hat')
    if(chainFile[look.chain])void attach(chainFile[look.chain],'chain')
    return()=>{cancelled=true}
  }, [rig, appearance])

  useFrame((_, dtRaw) => {
    if (!rig) return
    const dt = Math.min(dtRaw, 0.1)
    const state = motion.current
    const speed = state.vel.length()
    const want = state.seated ? 'sit' : state.alt > 0.15 || speed > 13 ? 'sprint' : speed > 0.6 ? 'walk' : 'idle'
    if (want !== current.current) {
      const from = rig.actions[current.current]
      if (want === 'idle') from?.stop()
      else if (rig.actions[want]) {
        const to = rig.actions[want]
        to.reset().play()
        from?.crossFadeTo(to, 0.2, false)
      }
      current.current = want
    }
    const action = rig.actions[current.current]
    if (action) action.timeScale = current.current === 'walk' ? THREE.MathUtils.clamp(speed / 5, 0.6, 1.4) : 1
    if (current.current !== 'idle') rig.mixer.update(dt)

    if (state.waving && rig.wavingArm && rig.armRest) {
      waveClock.current += dt
      rig.wavingArm.rotation.copy(rig.armRest)
      rig.wavingArm.rotation.z = rig.armRest.z + Math.PI * 0.78 + Math.sin(waveClock.current * 12) * 0.28
    } else if (!state.waving) {
      waveClock.current = 0
    }
  })

  return rig ? <primitive object={rig.root} /> : null
}
