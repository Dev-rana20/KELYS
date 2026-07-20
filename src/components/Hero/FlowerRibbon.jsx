// import { useRef, useMemo, useEffect, useCallback } from 'react'
// import { useFrame } from '@react-three/fiber'
// import { useGLTF } from '@react-three/drei'
// import * as THREE from 'three'

// /**
//  * FlowerRibbon.jsx — Dense mouse-cursor petal emitter, now using the real
//  * 3D petal model (petal.glb) instead of a flat 2D triangle shape.
//  *
//  * petal.glb ships 8 unique petal meshes (petal1..petal8), all originally
//  * scattered at fixed positions/at the same scale inside the source scene.
//  * We pull out each mesh's LOCAL geometry (ignoring its scattered position),
//  * re-center it on its own origin, and normalize it to a unit bounding
//  * sphere. That gives us 8 distinct petal *shapes* we can re-scale freely
//  * per-instance — which is how we get the "many small + a few big" size
//  * variety seen in the reference screenshot, instead of the model's
//  * originally-uniform sizing.
//  *
//  * Because real geometry is far more expensive per-instance than a 2-tri
//  * shape, each shape "tier" gets its own (much smaller) instance pool sized
//  * roughly in proportion to its vertex cost, so total per-frame vertex
//  * throughput stays cheap regardless of how many petals are alive at once.
//  *
//  * renderOrder={2} + depthWrite:false/depthTest:true keeps the same
//  * occlusion behavior as before: petals render after the bottle's depth
//  * pass so the bottle correctly hides petals behind it.
//  */

// const LIFE_MIN = 1.0
// const LIFE_MAX = 2.0
// const SPEED_MIN = 0.5
// const SPEED_MAX = 2.2

// // ── Color palette — corrected ───────────────────────────────────────────────
// // My earlier sample was contaminated by the plain white page background
// // around the reference video, which made near-white look like the dominant
// // petal color when it wasn't. Re-measured against only the petal cluster
// // itself (plus the scene's bright studio lighting also lifts pale tones
// // toward white) — the real dominant color is a dusty plum/orchid purple,
// // with paler lilac and white kept as true rare accents/highlights.
// const COLOR_TIERS = [
//   { weight: 42, colors: ['#6b3f7a', '#7c4f8a', '#5c3568', '#8a5e94'] }, // dominant dusty-plum purple
//   { weight: 24, colors: ['#4c2c75', '#5f2e7d', '#43265e', '#492a6e'] }, // deeper saturated violet accents
//   { weight: 18, colors: ['#a97fb0', '#c299c9', '#b48ec0'] },           // lighter orchid-lilac mid-tone
//   { weight: 10, colors: ['#e7d8e7', '#d7c8d4'] },                      // pale lilac highlight — kept rare
//   { weight: 4,  colors: ['#ffffff', '#f7f2f7'] },                      // near-white sparkle — sparse, not dominant
//   { weight: 2,  colors: ['#1c1420', '#110e1c'] },                      // near-black shadow accent — rare
// ]

// const TOTAL_WEIGHT = COLOR_TIERS.reduce((sum, tier) => sum + tier.weight, 0)

// function pickColor() {
//   let r = Math.random() * TOTAL_WEIGHT
//   for (const tier of COLOR_TIERS) {
//     if (r < tier.weight) {
//       return new THREE.Color(tier.colors[Math.floor(Math.random() * tier.colors.length)])
//     }
//     r -= tier.weight
//   }
//   const lastTier = COLOR_TIERS[COLOR_TIERS.length - 1].colors
//   return new THREE.Color(lastTier[0])
// }

// // ── Extract + normalize the 8 petal shapes from petal.glb ──────────────────
// function usePetalGeometries() {
//   const { nodes } = useGLTF('/assets/petal.glb')

//   return useMemo(() => {
//     const list = []
//     Object.values(nodes).forEach((node) => {
//       if (!node.isMesh || !node.geometry) return

//       const geo = node.geometry.clone()
//       geo.computeBoundingBox()
//       const center = new THREE.Vector3()
//       geo.boundingBox.getCenter(center)
//       // Re-center on its own local origin — discard the scattered
//       // scene-placement offset baked into the source file.
//       geo.translate(-center.x, -center.y, -center.z)

//       geo.computeBoundingSphere()
//       const radius = geo.boundingSphere?.radius || 1
//       // Normalize so every shape occupies roughly the same unit size —
//       // per-instance `scale` is what actually varies petal size afterward.
//       geo.scale(1 / radius, 1 / radius, 1 / radius)

//       if (!geo.attributes.normal) geo.computeVertexNormals()

//       list.push({ geometry: geo, vertexCount: geo.attributes.position.count })
//     })

//     // Sort cheapest → most detailed so we can assign perf-appropriate
//     // instance-pool sizes by tier below.
//     list.sort((a, b) => a.vertexCount - b.vertexCount)
//     return list
//   }, [nodes])
// }

// // ── Material factory ────────────────────────────────────────────────────────
// function buildMaterial() {
//   return new THREE.MeshStandardMaterial({
//     color: '#ffffff', // stays white so per-instance colors show true hue
//     side: THREE.DoubleSide,
//     transparent: true,
//     opacity: 0.94,
//     roughness: 0.65,        // more matte — sharp specular was blowing pale
//                             // colors out to near-white under the key light
//     metalness: 0.02,
//     envMapIntensity: 0.35,  // scene's studio HDRI is tuned bright for the
//                             // glass bottle; petals need much less of it or
//                             // their base color reads as white regardless
//                             // of the instance color assigned
//     depthWrite: false, // petals don't block each other
//     depthTest: true,   // but they ARE blocked by the bottle (depthWrite: true)
//   })
// }

// // ── Single shape-tier petal system ─────────────────────────────────────────
// function PetalBatch({ geometry, mousePosition, maxInstances, sizeMin, sizeMax }) {
//   const meshRef = useRef()
//   const dummy = useMemo(() => new THREE.Object3D(), [])
//   const color = useMemo(() => new THREE.Color(), [])
//   const mat = useMemo(() => buildMaterial(), [])

//   // Particle pool — sized per-tier, not one giant shared pool, since each
//   // instance costs (poolSize × geometry vertex count) in the vertex shader
//   // every frame regardless of "alive" state.
//   const pool = useMemo(() => {
//     const arr = new Array(maxInstances)
//     for (let i = 0; i < maxInstances; i++) {
//       arr[i] = {
//         alive: false,
//         age: 0, life: 0,
//         x: 0, y: 0, z: 0,
//         vx: 0, vy: 0, vz: 0,
//         rx: 0, ry: 0, rz: 0,
//         drx: 0, dry: 0, drz: 0,
//         scale: 1,
//       }
//     }
//     return arr
//   }, [maxInstances])

//   const nextSlot = useRef(0)
//   const spawnAccum = useRef(0)

//   // Steady-state spawn rate: enough per second to keep the pool near full
//   // when the cursor is moving continuously.
//   const avgLife = (LIFE_MIN + LIFE_MAX) / 2
//   const spawnRatePerSecond = maxInstances / avgLife

//   // Initialize all instances off-screen + give every instance a color so
//   // the instanceColor buffer exists from frame one.
//   useEffect(() => {
//     const mesh = meshRef.current
//     if (!mesh) return
//     const id = new THREE.Object3D()
//     id.position.set(0, -500, 0)
//     id.scale.set(0.001, 0.001, 0.001)
//     id.updateMatrix()
//     for (let i = 0; i < maxInstances; i++) {
//       mesh.setMatrixAt(i, id.matrix)
//       mesh.setColorAt(i, pickColor())
//     }
//     mesh.instanceMatrix.needsUpdate = true
//     if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
//   }, [maxInstances])

//   const spawnPetal = useCallback((worldX, worldY) => {
//     const mesh = meshRef.current
//     const slot = nextSlot.current % maxInstances
//     nextSlot.current++

//     const p = pool[slot]
//     p.alive = true
//     p.life = LIFE_MIN + Math.random() * (LIFE_MAX - LIFE_MIN)
//     p.age = 0

//     // Tight burst spawn at cursor
//     p.x = worldX + (Math.random() - 0.5) * 0.12
//     p.y = worldY + (Math.random() - 0.5) * 0.12
//     // Spawn BEHIND the bottle plane so petals don't appear on top of it
//     p.z = -0.3 - Math.random() * 0.8

//     // 360° radial burst — petals explode outward from cursor
//     const angle = Math.random() * Math.PI * 2
//     const speed = SPEED_MIN + Math.random() * (SPEED_MAX - SPEED_MIN)
//     p.vx = Math.cos(angle) * speed * 0.9
//     p.vy = Math.sin(angle) * speed * 0.7 + 0.12
//     p.vz = -(Math.random() * speed * 0.15)

//     p.rx = Math.random() * Math.PI * 2
//     p.ry = Math.random() * Math.PI * 2
//     p.rz = Math.random() * Math.PI * 2
//     p.drx = (Math.random() - 0.5) * 6
//     p.dry = (Math.random() - 0.5) * 6
//     p.drz = (Math.random() - 0.5) * 4

//     // Real per-instance size variety (this is what actually replaces the
//     // model's originally-uniform petal sizing).
//     p.scale = sizeMin + Math.random() * (sizeMax - sizeMin)

//     if (mesh) {
//       mesh.setColorAt(slot, color.copy(pickColor()))
//       if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
//     }
//   }, [pool, maxInstances, color, sizeMin, sizeMax])

//   useFrame(({ clock }, delta) => {
//     const mesh = meshRef.current
//     if (!mesh) return

//     const dt = Math.min(delta, 0.05)
//     const elapsed = clock.elapsedTime

//     // Emit from cursor, framerate-independent via accumulator
//     if (mousePosition && mousePosition.current) {
//       const camZ = 5.5
//       const halfH = Math.tan(((45 * Math.PI) / 180) / 2) * camZ
//       const halfW = halfH * (window.innerWidth / window.innerHeight)
//       const worldX = mousePosition.current.x * halfW
//       const worldY = mousePosition.current.y * halfH

//       spawnAccum.current += spawnRatePerSecond * dt
//       while (spawnAccum.current >= 1) {
//         spawnPetal(worldX, worldY)
//         spawnAccum.current -= 1
//       }
//     }

//     // Update pool
//     for (let i = 0; i < maxInstances; i++) {
//       const p = pool[i]

//       if (!p.alive) {
//         dummy.position.set(0, -500, 0)
//         dummy.scale.set(0.001, 0.001, 0.001)
//         dummy.updateMatrix()
//         mesh.setMatrixAt(i, dummy.matrix)
//         continue
//       }

//       p.age += dt
//       if (p.age >= p.life) {
//         p.alive = false
//         dummy.position.set(0, -500, 0)
//         dummy.scale.set(0.001, 0.001, 0.001)
//         dummy.updateMatrix()
//         mesh.setMatrixAt(i, dummy.matrix)
//         continue
//       }

//       // Physics
//       p.vx *= 0.982
//       p.vy *= 0.982
//       p.vz *= 0.982
//       p.vy -= 0.002

//       p.vx += Math.sin(elapsed * 1.1 + i * 0.31) * 0.001

//       p.x += p.vx * dt
//       p.y += p.vy * dt
//       p.z += p.vz * dt

//       // Scale fade (pop-in / pop-out)
//       const t = p.age / p.life
//       let scaleT = 1.0
//       if (t < 0.08) scaleT = t / 0.08
//       else if (t > 0.88) scaleT = 1.0 - (t - 0.88) / 0.12

//       const s = p.scale * scaleT

//       dummy.rotation.set(
//         p.rx + p.drx * elapsed,
//         p.ry + p.dry * elapsed,
//         p.rz + p.drz * elapsed
//       )
//       dummy.position.set(p.x, p.y, p.z)
//       dummy.scale.set(s, s, s)
//       dummy.updateMatrix()
//       mesh.setMatrixAt(i, dummy.matrix)
//     }

//     mesh.instanceMatrix.needsUpdate = true
//   })

//   return (
//     <instancedMesh
//       ref={meshRef}
//       args={[geometry, mat, maxInstances]}
//       frustumCulled={false}
//       renderOrder={2} // ← renders AFTER bottle (renderOrder 0) — depth buffer
//                       //   already has bottle data — petals are occluded by it
//     />
//   )
// }

// // ── Export: real 3D petal shapes, tiered by detail/size ────────────────────
// export default function FlowerRibbon({ mousePosition }) {
//   const geometries = usePetalGeometries()

//   if (geometries.length === 0) return null

//   // geometries is sorted cheapest → most detailed. We only need a handful
//   // of distinct shapes on screen at once, so we pick representative tiers
//   // rather than instancing all 8 at full pool sizes (that would be far too
//   // expensive for a mouse-following swarm).
//   const g = geometries
//   const tiny = g[0]
//   const smallA = g[1] ?? g[0]
//   const smallB = g[2] ?? g[0]
//   const medium = g[3] ?? g[g.length - 1]
//   const hero = g[Math.min(6, g.length - 1)]

//   return (
//     <>
//       {/* Lots of tiny confetti-like petals — cheapest geometry */}
//       <PetalBatch
//         geometry={tiny.geometry}
//         mousePosition={mousePosition}
//         maxInstances={550}
//         sizeMin={0.025}
//         sizeMax={0.05}
//       />
//       {/* Small petals, shape variant A */}
//       <PetalBatch
//         geometry={smallA.geometry}
//         mousePosition={mousePosition}
//         maxInstances={420}
//         sizeMin={0.035}
//         sizeMax={0.065}
//       />
//       {/* Small petals, shape variant B — different silhouette for variety */}
//       <PetalBatch
//         geometry={smallB.geometry}
//         mousePosition={mousePosition}
//         maxInstances={320}
//         sizeMin={0.045}
//         sizeMax={0.08}
//       />
//       {/* Medium, more detailed petals — still modest, just the biggest of the small ones */}
//       <PetalBatch
//         geometry={medium.geometry}
//         mousePosition={mousePosition}
//         maxInstances={130}
//         sizeMin={0.07}
//         sizeMax={0.11}
//       />
//       {/* Rare, slightly larger "hero" petals — most detailed shape */}
//       <PetalBatch
//         geometry={hero.geometry}
//         mousePosition={mousePosition}
//         maxInstances={40}
//         sizeMin={0.1}
//         sizeMax={0.16}
//       />
//     </>
//   )
// }

// useGLTF.preload('/assets/petal.glb')

import { useRef, useMemo, useEffect, useCallback } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'

/**
 * FlowerRibbon.jsx — Dense mouse-cursor petal emitter, now using the real
 * 3D petal model (petal.glb) instead of a flat 2D triangle shape.
 *
 * petal.glb ships 8 unique petal meshes (petal1..petal8), all originally
 * scattered at fixed positions/at the same scale inside the source scene.
 * We pull out each mesh's LOCAL geometry (ignoring its scattered position),
 * re-center it on its own origin, and normalize it to a unit bounding
 * sphere. That gives us 8 distinct petal *shapes* we can re-scale freely
 * per-instance — which is how we get the "many small + a few big" size
 * variety seen in the reference screenshot, instead of the model's
 * originally-uniform sizing.
 *
 * Because real geometry is far more expensive per-instance than a 2-tri
 * shape, each shape "tier" gets its own (much smaller) instance pool sized
 * roughly in proportion to its vertex cost, so total per-frame vertex
 * throughput stays cheap regardless of how many petals are alive at once.
 *
 * renderOrder={2} + depthWrite:false/depthTest:true keeps the same
 * occlusion behavior as before: petals render after the bottle's depth
 * pass so the bottle correctly hides petals behind it.
 *
 * MOTION MODEL — cyclone/vortex, not a radial burst:
 * Each petal is born at a point near the cursor and orbits *around* that
 * point rather than flying away from it on a straight decaying velocity.
 * Orbit radius follows a bloom-and-collapse curve (0 → max → 0 across its
 * life) so it swirls outward, then spirals back in and vanishes at its own
 * center — giving a tight, circular "cyclone" motion instead of scattering
 * across the screen. All petals share one spin direction (CYCLONE_SPIN) so
 * the whole cluster reads as one coherent vortex rather than random noise.
 */

const LIFE_MIN = 1.0
const LIFE_MAX = 3.0

// ── Cyclone motion tuning ───────────────────────────────────────────────────
// Every petal spins the same way — this is what makes the whole cluster
// read as one vortex instead of a chaotic scatter. Flip the sign to reverse
// the whole system's spin direction.
const CYCLONE_SPIN = 1

// Angular speed is derived per-petal from its own orbit radius (tighter
// orbit = spins faster, like debris pulled close to a vortex core), then
// clamped into this range (radians/sec).
const ANGULAR_SPEED_BASE = 0.5
const ANGULAR_SPEED_MIN = 0.5
const ANGULAR_SPEED_MAX = 2.0

// How far the vortex center itself is allowed to drift over a petal's life
// (keeps things from looking perfectly static/mechanical) — small and
// heavily damped so it reads as "gentle sway", not travel.
const CENTER_DRIFT = 0.35
const CENTER_DRIFT_DAMPING = 0.98

// How quickly the emission point catches up to the actual cursor position,
// per frame (0–1). New petals spawn at this lagged point instead of the
// raw cursor, so the whole trail visibly trails behind fast mouse movement
// instead of snapping straight to it every frame. Lower = more lag.
const CURSOR_SMOOTHING = 0.05

// ── Spawn / fade smoothing ──────────────────────────────────────────────
// The old version popped a petal to full size in ~8% of its life and
// shrank it in ~12%, both linearly — fast enough to read as an abrupt
// "appear/vanish" rather than something deliberate. This stretches both
// ends out, eases them, and blends in a soft pale tint at birth and death
// so petals visibly *bloom into* color and *dissolve into* light instead
// of just popping and shrinking.
const SPAWN_FRACTION = 0.22   // fraction of life spent growing in
const FADE_FRACTION = 0.32    // fraction of life spent fading out
const SPARK_COLOR = new THREE.Color('#B58FC1') // pale glow tint at birth/death

function easeOutCubic(x) {
  return 1 - Math.pow(1 - x, 3)
}
function easeInCubic(x) {
  return x * x * x
}
function easeOutBack(x) {
  // Slight overshoot past 1 before settling — reads as a soft "bloom" pop
  // rather than a mechanical grow-to-size.
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2)
}

// ── Color palette — corrected ───────────────────────────────────────────────
// My earlier sample was contaminated by the plain white page background
// around the reference video, which made near-white look like the dominant
// petal color when it wasn't. Re-measured against only the petal cluster
// itself (plus the scene's bright studio lighting also lifts pale tones
// toward white) — the real dominant color is a dusty plum/orchid purple,
// with paler lilac and white kept as true rare accents/highlights.
const COLOR_TIERS = [
  {
    weight: 42,
    colors: [
      '#5E396B',
      '#714D82',
      '#432352',
      '#8A6399',
    ],
  },

  {
    weight: 24,
    colors: [
      '#432352',
      '#5E396B',
      '#714D82',
      '#8A6399',
    ],
  },

  {
    weight: 18,
    colors: [
      '#8A6399',
      '#A37FB2',
      '#BB9CC9',
    ],
  },

  {
    weight: 10,
    colors: [
      '#BB9CC9',
      '#D2B2D8', // replaced bright highlight
    ],
  },

  {
    weight: 4,
    colors: [
      '#5E396B', // instead of near-white
      '#5E396B', // instead of white
    ],
  },

  {
    weight: 2,
    colors: [
      '#2E1838',
      '#1B1123',
    ],
  },
];

const TOTAL_WEIGHT = COLOR_TIERS.reduce((sum, tier) => sum + tier.weight, 0)

function pickColor() {
  let r = Math.random() * TOTAL_WEIGHT
  for (const tier of COLOR_TIERS) {
    if (r < tier.weight) {
      return new THREE.Color(tier.colors[Math.floor(Math.random() * tier.colors.length)])
    }
    r -= tier.weight
  }
  const lastTier = COLOR_TIERS[COLOR_TIERS.length - 1].colors
  return new THREE.Color(lastTier[0])
}

// ── Extract + normalize the 8 petal shapes from petal.glb ──────────────────
function usePetalGeometries() {
  const { nodes } = useGLTF('/assets/petal.glb')

  return useMemo(() => {
    const list = []
    Object.values(nodes).forEach((node) => {
      if (!node.isMesh || !node.geometry) return

      const geo = node.geometry.clone()
      geo.computeBoundingBox()
      const center = new THREE.Vector3()
      geo.boundingBox.getCenter(center)
      // Re-center on its own local origin — discard the scattered
      // scene-placement offset baked into the source file.
      geo.translate(-center.x, -center.y, -center.z)

      geo.computeBoundingSphere()
      const radius = geo.boundingSphere?.radius || 1
      // Normalize so every shape occupies roughly the same unit size —
      // per-instance `scale` is what actually varies petal size afterward.
      geo.scale(1 / radius, 1 / radius, 1 / radius)

      if (!geo.attributes.normal) geo.computeVertexNormals()

      list.push({ geometry: geo, vertexCount: geo.attributes.position.count })
    })

    // Sort cheapest → most detailed so we can assign perf-appropriate
    // instance-pool sizes by tier below.
    list.sort((a, b) => a.vertexCount - b.vertexCount)
    return list
  }, [nodes])
}

// ── Material factory ────────────────────────────────────────────────────────
function buildMaterial() {
  return new THREE.MeshStandardMaterial({
    color: '#ffffff', // stays white so per-instance colors show true hue
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.94,
    roughness: 0.65,        // more matte — sharp specular was blowing pale
                            // colors out to near-white under the key light
    metalness: 0.02,
    envMapIntensity: 0.35,  // scene's studio HDRI is tuned bright for the
                            // glass bottle; petals need much less of it or
                            // their base color reads as white regardless
                            // of the instance color assigned
    depthWrite: false, // petals don't block each other
    depthTest: true,   // but they ARE blocked by the bottle (depthWrite: true)
  })
}

// ── Smoothed cursor tracking ────────────────────────────────────────────────
// Petals used to spawn exactly at the raw mousePosition.current every
// frame — zero lag, so fast mouse movement produced an instant jump in
// where new petals appeared. This lerps a shared point toward the cursor
// each frame instead, so the emission point itself trails the cursor with
// a gentle delay. All tiers spawn from this same smoothed point so the
// whole cluster stays cohesive rather than each tier lagging differently.
function useSmoothedCursor(mousePosition, smoothing = CURSOR_SMOOTHING) {
  const smoothed = useRef({ x: 0, y: 0 })
  const initialized = useRef(false)

  useFrame(() => {
    if (!mousePosition || !mousePosition.current) return
    const target = mousePosition.current

    if (!initialized.current) {
      smoothed.current.x = target.x
      smoothed.current.y = target.y
      initialized.current = true
      return
    }

    smoothed.current.x += (target.x - smoothed.current.x) * smoothing
    smoothed.current.y += (target.y - smoothed.current.y) * smoothing
  })

  return smoothed
}

// ── Single shape-tier petal system ─────────────────────────────────────────
function PetalBatch({ geometry, mousePosition, maxInstances, sizeMin, sizeMax, orbitMin, orbitMax }) {
  const meshRef = useRef()
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const color = useMemo(() => new THREE.Color(), [])
  const mat = useMemo(() => buildMaterial(), [])

  // Particle pool — sized per-tier, not one giant shared pool, since each
  // instance costs (poolSize × geometry vertex count) in the vertex shader
  // every frame regardless of "alive" state.
  const pool = useMemo(() => {
    const arr = new Array(maxInstances)
    for (let i = 0; i < maxInstances; i++) {
      arr[i] = {
        alive: false,
        age: 0, life: 0,
        // Vortex center this petal orbits — NOT its own moving position.
        ox: 0, oy: 0, oz: 0,
        driftX: 0, driftY: 0,
        angle: 0, angularSpeed: 0, orbitRadiusMax: 0,
        rx: 0, ry: 0, rz: 0,
        drx: 0, dry: 0, drz: 0,
        scale: 1,
        color: new THREE.Color(),
      }
    }
    return arr
  }, [maxInstances])

  const nextSlot = useRef(0)
  const spawnAccum = useRef(0)

  // Steady-state spawn rate: enough per second to keep the pool near full
  // when the cursor is moving continuously.
  const avgLife = (LIFE_MIN + LIFE_MAX) / 2
  const spawnRatePerSecond = maxInstances / avgLife

  // Initialize all instances off-screen + give every instance a color so
  // the instanceColor buffer exists from frame one.
  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    const id = new THREE.Object3D()
    id.position.set(0, -500, 0)
    id.scale.set(0.001, 0.001, 0.001)
    id.updateMatrix()
    for (let i = 0; i < maxInstances; i++) {
      mesh.setMatrixAt(i, id.matrix)
      mesh.setColorAt(i, pickColor())
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [maxInstances])

  const spawnPetal = useCallback((worldX, worldY) => {
    const slot = nextSlot.current % maxInstances
    nextSlot.current++

    const p = pool[slot]
    p.alive = true
    p.life = LIFE_MIN + Math.random() * (LIFE_MAX - LIFE_MIN)
    p.age = 0

    // Vortex center — tight burst spawn at cursor. This point is what the
    // petal orbits around for its whole life, not a place it flies away
    // from.
    p.ox = worldX + (Math.random() - 0.5) * 0.12
    p.oy = worldY + (Math.random() - 0.5) * 0.12
    // Spawn BEHIND the bottle plane so petals don't appear on top of it
    p.oz = -0.3 - Math.random() * 0.8

    // Gentle, heavily-damped drift of the vortex center itself so the
    // swirl doesn't look perfectly mechanical/static.
    const driftAngle = Math.random() * Math.PI * 2
    p.driftX = Math.cos(driftAngle) * CENTER_DRIFT
    p.driftY = Math.sin(driftAngle) * CENTER_DRIFT * 0.6 + 0.05

    // Orbit setup — random starting angle around the vortex, radius caps
    // vary per instance (within this tier's range) so the swirl has depth
    // rather than every petal tracing the exact same ring.
    p.angle = Math.random() * Math.PI * 2
    p.orbitRadiusMax = orbitMin + Math.random() * (orbitMax - orbitMin)
    // Tighter orbits spin faster (like matter pulled closer to a vortex
    // core) — makes the smaller/closer petals feel more energetic.
    const rawSpeed = ANGULAR_SPEED_BASE / p.orbitRadiusMax
    p.angularSpeed = CYCLONE_SPIN * THREE.MathUtils.clamp(rawSpeed, ANGULAR_SPEED_MIN, ANGULAR_SPEED_MAX)

    p.rx = Math.random() * Math.PI * 2
    p.ry = Math.random() * Math.PI * 2
    p.rz = Math.random() * Math.PI * 2
    p.drx = (Math.random() - 0.5) * 6
    p.dry = (Math.random() - 0.5) * 6
    p.drz = (Math.random() - 0.5) * 4

    // Real per-instance size variety (this is what actually replaces the
    // model's originally-uniform petal sizing).
    p.scale = sizeMin + Math.random() * (sizeMax - sizeMin)

    // Store this petal's own color — the per-frame update loop tints it
    // toward SPARK_COLOR at birth and death, so it needs to remember its
    // "true" color to tint from/back to.
    p.color.copy(pickColor())
  }, [pool, maxInstances, sizeMin, sizeMax, orbitMin, orbitMax])

  useFrame(({ clock }, delta) => {
    const mesh = meshRef.current
    if (!mesh) return

    const dt = Math.min(delta, 0.05)
    const elapsed = clock.elapsedTime

    // Emit from cursor, framerate-independent via accumulator
    if (mousePosition && mousePosition.current) {
      const camZ = 5.5
      const halfH = Math.tan(((45 * Math.PI) / 180) / 2) * camZ
      const halfW = halfH * (window.innerWidth / window.innerHeight)
      const worldX = mousePosition.current.x * halfW
      const worldY = mousePosition.current.y * halfH

      spawnAccum.current += spawnRatePerSecond * dt
      while (spawnAccum.current >= 1) {
        spawnPetal(worldX, worldY)
        spawnAccum.current -= 1
      }
    }

    // Update pool
    for (let i = 0; i < maxInstances; i++) {
      const p = pool[i]

      if (!p.alive) {
        dummy.position.set(0, -500, 0)
        dummy.scale.set(0.001, 0.001, 0.001)
        dummy.updateMatrix()
        mesh.setMatrixAt(i, dummy.matrix)
        continue
      }

      p.age += dt
      if (p.age >= p.life) {
        p.alive = false
        dummy.position.set(0, -500, 0)
        dummy.scale.set(0.001, 0.001, 0.001)
        dummy.updateMatrix()
        mesh.setMatrixAt(i, dummy.matrix)
        continue
      }

      const t = p.age / p.life

      // Vortex center drifts gently, residual motion decaying over time.
      p.ox += p.driftX * dt
      p.oy += p.driftY * dt
      p.driftX *= CENTER_DRIFT_DAMPING
      p.driftY *= CENTER_DRIFT_DAMPING

      // Spin around the center.
      p.angle += p.angularSpeed * dt

      // Bloom-and-collapse radius: 0 → max at mid-life → 0 at death, so
      // the petal swirls outward then spirals back in and vanishes right
      // at its own vortex center — a self-contained cyclone, not a
      // scatter.
      const radius = p.orbitRadiusMax * Math.sin(Math.PI * t)

      const x = p.ox + Math.cos(p.angle) * radius
      const y = p.oy + Math.sin(p.angle) * radius * 0.85 // slightly squashed = more natural swirl, less perfectly circular

      // Scale + color envelope — eased bloom-in, eased dissolve-out, with a
      // soft "materialize into color" / "fade into light" tint so both
      // ends read as a deliberate, smooth transition rather than a hard
      // pop or snap.
      let scaleT = 1
      let sparkBlend = 0
      if (t < SPAWN_FRACTION) {
        const st = t / SPAWN_FRACTION
        scaleT = Math.max(0, easeOutBack(st))   // soft overshoot "bloom"
        sparkBlend = (1 - easeOutCubic(st)) * 0.35     // starts pale, settles to true color
      } else if (t > 1 - FADE_FRACTION) {
        const ft = (t - (1 - FADE_FRACTION)) / FADE_FRACTION
        scaleT = Math.max(0, 1 - easeInCubic(ft)) // accelerating shrink
        sparkBlend = easeInCubic(ft)              // dissolves toward pale light
      }

      const s = p.scale * scaleT

      color.copy(p.color)
      if (sparkBlend > 0) color.lerp(SPARK_COLOR, sparkBlend)
      mesh.setColorAt(i, color)

      dummy.rotation.set(
        p.rx + p.drx * elapsed,
        p.ry + p.dry * elapsed,
        p.rz + p.drz * elapsed
      )
      dummy.position.set(x, y, p.oz)
      dummy.scale.set(s, s, s)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }

    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  })

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, mat, maxInstances]}
      frustumCulled={false}
      renderOrder={2} // ← renders AFTER bottle (renderOrder 0) — depth buffer
                      //   already has bottle data — petals are occluded by it
    />
  )
}

// ── Export: real 3D petal shapes, tiered by detail/size ────────────────────
export default function FlowerRibbon({ mousePosition }) {
  const geometries = usePetalGeometries()
  // Shared, lagged emission point — every tier spawns from this same
  // smoothed position so the whole trail visibly follows the cursor with
  // a gentle delay instead of snapping straight to it.
  const smoothedMouse = useSmoothedCursor(mousePosition)

  if (geometries.length === 0) return null

  // geometries is sorted cheapest → most detailed. We only need a handful
  // of distinct shapes on screen at once, so we pick representative tiers
  // rather than instancing all 8 at full pool sizes (that would be far too
  // expensive for a mouse-following swarm).
  const g = geometries
  const tiny = g[0]
  const smallA = g[1] ?? g[0]
  const smallB = g[2] ?? g[0]
  const medium = g[3] ?? g[g.length - 1]
  const hero = g[Math.min(6, g.length - 1)]

  return (
    <>
      {/* Lots of tiny confetti-like petals — cheapest geometry, tightest/fastest inner orbit ring */}
      <PetalBatch
        geometry={tiny.geometry}
        mousePosition={smoothedMouse}
        maxInstances={3050}
        sizeMin={0.025}
        sizeMax={0.05}
        orbitMin={0.12}
        orbitMax={0.28}
      />
      {/* Small petals, shape variant A */}
      <PetalBatch
        geometry={smallA.geometry}
        mousePosition={smoothedMouse}
        maxInstances={820}
        sizeMin={0.035}
        sizeMax={0.065}
        orbitMin={0.15}
        orbitMax={0.32}
      />
      {/* Small petals, shape variant B — different silhouette for variety */}
      <PetalBatch
        geometry={smallB.geometry}
        mousePosition={smoothedMouse}
        maxInstances={720}
        sizeMin={0.045}
        sizeMax={0.08}
        orbitMin={0.18}
        orbitMax={0.36}
      />
      {/* Medium, more detailed petals — still modest, just the biggest of the small ones */}
      <PetalBatch
        geometry={medium.geometry}
        mousePosition={smoothedMouse}
        maxInstances={530}
        sizeMin={0.07}
        sizeMax={0.11}
        orbitMin={0.22}
        orbitMax={0.42}
      />
      {/* Rare, slightly larger "hero" petals — most detailed shape, widest/slowest outer ring */}
      <PetalBatch
        geometry={hero.geometry}
        mousePosition={smoothedMouse}
        maxInstances={40}
        sizeMin={0.1}
        sizeMax={0.16}
        orbitMin={0.28}
        orbitMax={0.5}
      />
    </>
  )
}

useGLTF.preload('/assets/petal.glb')
