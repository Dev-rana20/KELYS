import { useMemo } from 'react'
import * as THREE from 'three'

/**
 * Background.jsx
 * Full-screen lavender gradient background with vignette effect.
 * Renders as a plane inside the R3F canvas behind all other objects.
 */
export default function Background() {
  const { geometry, material } = useMemo(() => {
    const geo = new THREE.PlaneGeometry(30, 30)

    const mat = new THREE.ShaderMaterial({
      uniforms: {},
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vec2 center = vUv - 0.5;
          float dist = length(center);

          // Soft lavender radial gradient
          // vec3 innerColor = vec3(0.914, 0.882, 0.925); // #E9E1EC
          // vec3 midColor   = vec3(0.851, 0.792, 0.882); // Slightly darker
          // vec3 outerColor = vec3(0.784, 0.682, 0.847); // Edge color
          vec3 innerColor = vec3(0.79, 0.69, 0.84);   // #C9B0D6
          vec3 midColor   = vec3(0.57, 0.44, 0.68);   // #9170AD
          vec3 outerColor = vec3(0.22, 0.14, 0.30);   // #38244D
          vec3 color = mix(innerColor, midColor, smoothstep(0.0, 0.35, dist));
          color = mix(color, outerColor, smoothstep(0.25, 0.65, dist));

          // Subtle vignette — darkens edges with a deep purple tone
          // vec3 vignetteColor = vec3(0.451, 0.337, 0.557); // #735a8e
          vec3 vignetteColor = vec3(0.10, 0.07, 0.14); // #1A1223
          float vignette = smoothstep(0.35, 0.95, dist);
          color = mix(color, vignetteColor, vignette * 0.25);

          gl_FragColor = vec4(color, 1.0);
        }
      `,
      depthWrite: false,
      side: THREE.FrontSide,
    })

    return { geometry: geo, material: mat }
  }, [])

  return (
    <mesh position={[0, 0, -8]} geometry={geometry} material={material} />
  )
}
