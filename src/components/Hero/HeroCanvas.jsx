import { Suspense, useEffect, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { ContactShadows } from '@react-three/drei'
import * as THREE from 'three'
import gsap from 'gsap'

import Background from './Background'
import Lights from './Lights'
import Bottle from './Bottle'
import FlowerRibbon from './FlowerRibbon'

/**
 * CameraAnimation
 * Internal component to handle intro camera push and 
 * continuous idle breathing / parallax based on mouse.
 */
function CameraAnimation({ mousePosition }) {
  // We'll use a manual lerp for the intro camera Z to combine it cleanly with breathing
  const introZ = useRef(7)
  
  useEffect(() => {
    gsap.to(introZ, {
      current: 5.5,
      duration: 2.5,
      ease: 'power2.inOut'
    })
  }, [])

  useFrame(({ camera, clock }) => {
    const elapsed = clock.elapsedTime

    // Base position (intro Z + breathing Y)
    const baseY = 0.5 + Math.sin(elapsed * 0.3) * 0.03
    const baseZ = introZ.current

    // Mouse parallax target
    let targetX = 0
    let targetY = baseY

    if (mousePosition && mousePosition.current) {
      targetX = mousePosition.current.x * 0.3
      targetY = baseY + mousePosition.current.y * 0.2
    }

    // Lerp camera position
    camera.position.x = THREE.MathUtils.lerp(camera.position.x, targetX, 0.02)
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, targetY, 0.02)
    camera.position.z = baseZ // Z is driven purely by GSAP intro, so we apply it directly

    camera.lookAt(0, 0, 0)
  })

  return null
}

/**
 * HeroCanvas.jsx
 * The main R3F Canvas wrapper setting up the renderer, camera, and suspense boundary.
 */
export default function HeroCanvas({ mousePosition }) {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [0, 0.5, 7], fov: 45 }}
      gl={{
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.1
      }}
      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
    >
      <Suspense fallback={null}>
        <Background />
        <Lights />
        <Bottle mousePosition={mousePosition} />
        <FlowerRibbon mousePosition={mousePosition} />

        {/* Soft grounding shadow — this is what makes the bottle read as
            "sitting on a surface" instead of floating/pasted onto the bg */}
        <ContactShadows
          position={[0, -1.55, 0]}
          opacity={0.55}
          scale={8}
          blur={2.4}
          far={3}
          resolution={1024}
          color="#3a2e4d"
        />
        <CameraAnimation mousePosition={mousePosition} />
      </Suspense>
    </Canvas>
  )
}