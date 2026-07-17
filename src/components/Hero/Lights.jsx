import { Environment } from '@react-three/drei'

/**
 * Lights.jsx — Neutral, high-contrast studio lighting.
 * Matches the reference "Henry Hemans" render: one dominant key light,
 * one gentle fill, no color-tinted rim/underglow washing out the glass.
 */
export default function Lights() {
  return (
    <>
      {/* Soft ambient base — keep low so shadows/highlights stay punchy */}
      <ambientLight intensity={0.25} color="#ffffff" />

      {/* Key light — the dominant light, casts the contact shadow */}
      <directionalLight
        position={[-3, 6, 6]}
        intensity={2.6}
        color="#fff6ea"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={1}
        shadow-camera-far={15}
        shadow-camera-left={-4}
        shadow-camera-right={4}
        shadow-camera-top={4}
        shadow-camera-bottom={-4}
        shadow-bias={-0.0005}
      />

      {/* Fill light — neutral, just lifts shadow side, no color cast */}
      <directionalLight
        position={[5, 2, 3]}
        intensity={0.6}
        color="#ffffff"
      />

      {/* Top specular — creates the bright rim highlight along the glass edge */}
      <directionalLight
        position={[1, 10, 2]}
        intensity={1.1}
        color="#ffffff"
      />

      {/* HDRI environment — 'studio' gives the clean, high-contrast reflections
          you see in product photography; 'city' was giving cool/flat reflections */}
      <Environment preset="studio" environmentIntensity={1} />
    </>
  )
}