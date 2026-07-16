import { Environment } from '@react-three/drei'

/**
 * Lights.jsx — Luxury product photography lighting.
 * Tuned for glass/crystal perfume bottle with warm key light
 * and soft purple rim for the lavender aesthetic.
 */
export default function Lights() {
  return (
    <>
      {/* Soft ambient base */}
      <ambientLight intensity={0.35} color="#f8f4ff" />

      {/* Key light — warm white from upper-left front */}
      <directionalLight
        position={[-3, 6, 6]}
        intensity={2.2}
        color="#fff8f0"
        castShadow={false}
      />

      {/* Fill light — cool from right, softens shadows */}
      <directionalLight
        position={[5, 2, 3]}
        intensity={1.0}
        color="#e8eeff"
      />

      {/* Rim light — purple backlight for glass glow edge */}
      <pointLight
        position={[0, 4, -6]}
        intensity={3.0}
        color="#9333ea"
        distance={18}
        decay={2}
      />

      {/* Under glow — subtle warm lift */}
      <pointLight
        position={[0, -3, 3]}
        intensity={0.6}
        color="#fde8ff"
        distance={10}
        decay={2}
      />

      {/* Top specular — creates nice glass highlight */}
      <directionalLight
        position={[1, 10, 2]}
        intensity={0.9}
        color="#ffffff"
      />

      {/* HDRI environment — 'city' gives clean glass reflections on product bottles */}
      <Environment preset="city" />
    </>
  )
}
