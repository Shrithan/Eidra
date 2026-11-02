import { useEffect, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js'
import { loadGLTF } from './sphereModels'

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
export default function BlockyCharacter({ motion }: { motion: React.MutableRefObject<CharacterMotion> }) {
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
      root.traverse((object) => { object.frustumCulled = false })

      const mixer = new THREE.AnimationMixer(root)
      const actions: Record<string, THREE.AnimationAction> = {}
      for (const clip of gltf.animations) actions[clip.name] = mixer.clipAction(clip)
      actions.idle?.play()
      const wavingArm = root.getObjectByName('arm-right') ?? null
      setRig({ root, mixer, actions, wavingArm, armRest: wavingArm?.rotation.clone() ?? null })
    }).catch((error) => console.warn('[character] could not load the shared avatar', error))
    return () => { live = false }
  }, [])

  useFrame((_, dtRaw) => {
    if (!rig) return
    const dt = Math.min(dtRaw, 0.1)
    const state = motion.current
    const speed = state.vel.length()
    const want = state.seated ? 'sit' : state.alt > 0.15 || speed > 13 ? 'sprint' : speed > 0.6 ? 'walk' : 'idle'
    if (want !== current.current && rig.actions[want]) {
      const from = rig.actions[current.current]
      const to = rig.actions[want]
      to.reset().play()
      from?.crossFadeTo(to, 0.2, false)
      current.current = want
    }
    const action = rig.actions[current.current]
    if (action) action.timeScale = current.current === 'walk' ? THREE.MathUtils.clamp(speed / 5, 0.6, 1.4) : 1
    rig.mixer.update(dt)

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
