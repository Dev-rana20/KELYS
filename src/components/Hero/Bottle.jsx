import { useRef, useEffect, useMemo, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import gsap from 'gsap'
import * as THREE from 'three'

/**
 * Bottle.jsx — Uses perfume_bottle3.glb
 *
 * Key fixes:
 * - depthWrite: true on ALL materials so the bottle properly blocks petals
 * - Static Y-axis inner correction to face the camera (was showing as "cross")
 * - Outer group handles all animations cleanly
 */
export default function Bottle({ mousePosition }) {
  const groupRef = useRef()
  const { scene } = useGLTF('/assets/perfume_bottle3.glb')
  const [introFinished, setIntroFinished] = useState(false)

  // ── Auto-normalize + material fix ────────────────────────────────────────
  const { normalizedScale, centerOffset } = useMemo(() => {
    const box = new THREE.Box3().setFromObject(scene)
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())

    // Fit the tallest dimension to targetSize
    const maxDim = Math.max(size.x, size.y, size.z)
    const targetSize = 3.0
    const scale = targetSize / maxDim
    const offset = center.clone().multiplyScalar(-1)

    scene.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true
        child.receiveShadow = false
        if (child.material) {
          const mat = child.material

          // CRITICAL: depthWrite MUST be true so the bottle occludes petals
          // in the depth buffer — this is what makes petals disappear behind it
          mat.depthWrite = true
          mat.envMapIntensity = 1.4

          // ── Fix broken glass physics from the GLB export ──────────────
          // The source file exports one glass material with ior:0.2, which
          // is physically impossible (real glass is ~1.45–1.5) and makes
          // refraction look warped/flat instead of crisp. Also missing
          // thickness/attenuation, which is what gives glass visible depth.
          if (mat.transmission > 0) {
            mat.ior = 1.5
            mat.thickness = 0.35
            mat.attenuationDistance = 1.2
            mat.attenuationColor = new THREE.Color('#ffffff')
            mat.roughness = Math.max(mat.roughness, 0.03) // pure 0 roughness looks fake/plastic
            mat.clearcoat = 1
            mat.clearcoatRoughness = 0.05
            mat.specularIntensity = 1
          }

          // ── Fix blurry/glossy label text ───────────────────────────────
          // The label material was exported with metallicFactor 0.5,
          // roughnessFactor 0.3 and a normal map — combined with the
          // envMapIntensity boost above, the studio HDRI creates a strong
          // specular sheen + normal-map bumping across the text, reading
          // as "blurry". Give the label its own flatter, sharper treatment.
          if (mat.name === 'HH - Pack _ Label') {
            mat.envMapIntensity = 0.3   // barely reflective — no glare washing over text
            mat.metalness = 0.05
            mat.roughness = 0.55        // matte paper/print look instead of glossy foil
            if (mat.normalMap) {
              mat.normalScale = new THREE.Vector2(0.25, 0.25) // flatten bumping that distorts letters
            }
            if (mat.map) {
              mat.map.anisotropy = 16   // sharper text at grazing angles, prevents mip blur
              mat.map.needsUpdate = true
            }
          }

          mat.needsUpdate = true
        }
      }
    })

    return { normalizedScale: scale, centerOffset: offset }
  }, [scene])

  // ── GSAP Intro ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!groupRef.current) return

    groupRef.current.position.y = -4.5
    groupRef.current.scale.set(0.6, 0.6, 0.6)
    // Start rotated -180° on Y, animate to 0 for spin-in effect
    groupRef.current.rotation.set(0, -Math.PI, 0)

    const tl = gsap.timeline({ onComplete: () => setIntroFinished(true) })

    tl.to(groupRef.current.position, { y: 0, duration: 2.4, ease: 'power3.out' }, 0)
    tl.to(groupRef.current.scale, { x: 1, y: 1, z: 1, duration: 2.0, ease: 'power2.out' }, 0.2)
    tl.to(groupRef.current.rotation, { y: 0, duration: 2.2, ease: 'power2.inOut' }, 0)

    return () => tl.kill()
  }, [])

  // ── Per-frame: float + mouse rotation ────────────────────────────────────
  useFrame(({ clock }) => {
    if (!groupRef.current) return
    const elapsed = clock.elapsedTime

    if (introFinished) {
      // Gentle float
      const floatY = Math.sin(elapsed * 0.55) * 0.07
      groupRef.current.position.y = THREE.MathUtils.lerp(
        groupRef.current.position.y, floatY, 0.04
      )
      // Breathe
      const breathe = 1 + Math.sin(elapsed * 0.8) * 0.005
      groupRef.current.scale.setScalar(breathe)
    }

    // Mouse-driven rotation
    if (mousePosition && mousePosition.current) {
      const mx = mousePosition.current.x
      const my = mousePosition.current.y

      const maxRotY = Math.PI / 5   // ±36°
      const maxRotX = Math.PI / 20  // ±9°
      const lerpFactor = introFinished ? 0.05 : 0.015

      if (introFinished) {
        groupRef.current.rotation.y = THREE.MathUtils.lerp(
          groupRef.current.rotation.y, mx * maxRotY, lerpFactor
        )
      }
      groupRef.current.rotation.x = THREE.MathUtils.lerp(
        groupRef.current.rotation.x, -my * maxRotX, lerpFactor
      )
    }
  })

  // The inner group applies a static correction rotation so the bottle faces the
  // camera (along -Z) when the outer groupRef has rotation.y = 0.
  //
  // perfume_bottle3.glb appears to have its front face oriented along +X
  // (bottle was showing sideways/"cross"), so we rotate -90° around Y to
  // bring that front face toward the camera (+Z direction).
  //
  // If the bottle still looks cross/sideways, change FACING_CORRECTION to:
  //   Math.PI / 2  (try +90°)
  //   Math.PI      (try 180°)
  //   0            (no correction)
  const FACING_CORRECTION = -Math.PI / 2

  return (
    <group ref={groupRef}>
      {/* Static facing correction — does not animate */}
      <group rotation={[0, FACING_CORRECTION, 0]} scale={normalizedScale}>
        <primitive object={scene} position={centerOffset} />
      </group>
    </group>
  )
}

useGLTF.preload('/assets/perfume_bottle3.glb')