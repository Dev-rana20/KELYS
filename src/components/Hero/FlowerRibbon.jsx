import { useRef, useMemo, useEffect, useCallback } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

/**
 * FlowerRibbon.jsx — Dense mouse-cursor petal emitter
 *
 * Key fixes vs previous version:
 * - renderOrder={2} ensures petals render AFTER the bottle depth pass,
 *   so the depth buffer already has bottle data → petals are correctly
 *   occluded (hidden) behind the bottle surface.
 * - Darker purple/violet palette to match reference image.
 * - depthTest: true (explicitly) so petals respect bottle geometry.
 */

const MAX_PETALS = 8000
const EMIT_PER_FRAME = 90
const LIFE_MIN = 0.55
const LIFE_MAX = 1.1
const SPEED_MIN = 0.5
const SPEED_MAX = 2.2

// ── Deep violet → pale lilac / near-white — matches reference image range ──
const PALETTE_DARK = [
  new THREE.Color('#4c1d95'), // violet-900
  new THREE.Color('#5b21b6'), // violet-800
  new THREE.Color('#6d28d9'), // violet-700
  new THREE.Color('#7e22ce'), // purple-700
  new THREE.Color('#8b5cf6'), // violet-500
]

const PALETTE_LIGHT = [
  new THREE.Color('#a855f7'), // purple-500
  new THREE.Color('#c084fc'), // purple-400
  new THREE.Color('#d8b4fe'), // purple-300
  new THREE.Color('#e9d5ff'), // purple-200 — pale lilac
  new THREE.Color('#f5edff'), // near-white lilac highlight, matches image's light petals
]

// ── Sparse near-white highlight flecks — the bright glints scattered
//    through the petal cloud in the reference image ────────────────────────
const PALETTE_HIGHLIGHT = [
  new THREE.Color('#ffffff'),
  new THREE.Color('#f5edff'),
  new THREE.Color('#ece2ff'),
]

// ── Petal shape ────────────────────────────────────────────────────────────
function buildPetalGeo(size = 1) {
  const w = 0.034 * size
  const h = 0.10 * size
  const shape = new THREE.Shape()
  shape.moveTo(0, 0)
  shape.quadraticCurveTo(w, h * 0.45, 0, h)
  shape.quadraticCurveTo(-w, h * 0.45, 0, 0)
  return new THREE.ShapeGeometry(shape)
}

// ── Material factory ────────────────────────────────────────────────────────
function buildMaterial(color) {
  return new THREE.MeshStandardMaterial({
    color,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.90,
    roughness: 0.25,
    metalness: 0.05,
    depthWrite: false,   // petals don't block each other
    depthTest: true,     // but they ARE blocked by the bottle (depthWrite: true)
  })
}

// ── Single-batch petal system ──────────────────────────────────────────────
function PetalBatch({ palette, mousePosition, geoScale = 1.0, emitRate = EMIT_PER_FRAME }) {
  const meshRef = useRef()
  const dummy = useMemo(() => new THREE.Object3D(), [])

  const geo = useMemo(() => buildPetalGeo(geoScale), [geoScale])
  const mat = useMemo(
    () => buildMaterial(palette[Math.floor(Math.random() * palette.length)]),
    [palette]
  )

  // Particle pool
  const pool = useMemo(() => {
    const arr = new Array(MAX_PETALS)
    for (let i = 0; i < MAX_PETALS; i++) {
      arr[i] = {
        alive: false,
        age: 0, life: 0,
        x: 0, y: 0, z: 0,
        vx: 0, vy: 0, vz: 0,
        rx: 0, ry: 0, rz: 0,
        drx: 0, dry: 0, drz: 0,
        scale: 1,
      }
    }
    return arr
  }, [])

  const nextSlot = useRef(0)

  // Initialize all instances off-screen
  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    const id = new THREE.Object3D()
    id.position.set(0, -500, 0)
    id.scale.set(0.001, 0.001, 0.001)
    id.updateMatrix()
    for (let i = 0; i < MAX_PETALS; i++) mesh.setMatrixAt(i, id.matrix)
    mesh.instanceMatrix.needsUpdate = true
  }, [])

  const spawnPetal = useCallback((worldX, worldY) => {
    const slot = nextSlot.current % MAX_PETALS
    nextSlot.current++

    const p = pool[slot]
    p.alive = true
    p.life = LIFE_MIN + Math.random() * (LIFE_MAX - LIFE_MIN)
    p.age = 0

    // Tight burst spawn at cursor
    p.x = worldX + (Math.random() - 0.5) * 0.12
    p.y = worldY + (Math.random() - 0.5) * 0.12
    // Spawn BEHIND the bottle plane so they don't appear on top
    // z < 0 means behind camera center; keep z slightly negative
    p.z = -0.3 - Math.random() * 0.8

    // 360° radial burst — petals explode outward from cursor
    const angle = Math.random() * Math.PI * 2
    const speed = SPEED_MIN + Math.random() * (SPEED_MAX - SPEED_MIN)
    p.vx = Math.cos(angle) * speed * 0.9
    p.vy = Math.sin(angle) * speed * 0.7 + 0.12
    p.vz = -(Math.random() * speed * 0.15) // slight depth spread, pushed back

    p.rx = Math.random() * Math.PI * 2
    p.ry = Math.random() * Math.PI * 2
    p.rz = Math.random() * Math.PI * 2
    p.drx = (Math.random() - 0.5) * 6
    p.dry = (Math.random() - 0.5) * 6
    p.drz = (Math.random() - 0.5) * 4

    p.scale = 0.4 + Math.random() * 1.8
  }, [pool])

  useFrame(({ clock }, delta) => {
    const mesh = meshRef.current
    if (!mesh) return

    const dt = Math.min(delta, 0.05)
    const elapsed = clock.elapsedTime

    // Emit from cursor
    if (mousePosition && mousePosition.current) {
      const camZ = 5.5
      const halfH = Math.tan(((45 * Math.PI) / 180) / 2) * camZ
      const halfW = halfH * (window.innerWidth / window.innerHeight)
      const worldX = mousePosition.current.x * halfW
      const worldY = mousePosition.current.y * halfH

      const batchEmit = Math.ceil(emitRate / 2)
      for (let e = 0; e < batchEmit; e++) spawnPetal(worldX, worldY)
    }

    // Update pool
    for (let i = 0; i < MAX_PETALS; i++) {
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

      // Physics
      p.vx *= 0.982
      p.vy *= 0.982
      p.vz *= 0.982
      p.vy -= 0.002

      p.vx += Math.sin(elapsed * 1.1 + i * 0.31) * 0.001

      p.x += p.vx * dt
      p.y += p.vy * dt
      p.z += p.vz * dt

      // Scale fade (pop-in / pop-out)
      const t = p.age / p.life
      let scaleT = 1.0
      if (t < 0.08)      scaleT = t / 0.08
      else if (t > 0.78) scaleT = 1.0 - (t - 0.78) / 0.22

      const s = p.scale * scaleT

      dummy.rotation.set(
        p.rx + p.drx * elapsed,
        p.ry + p.dry * elapsed,
        p.rz + p.drz * elapsed
      )
      dummy.position.set(p.x, p.y, p.z)
      dummy.scale.set(s, s, s)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }

    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh
      ref={meshRef}
      args={[geo, mat, MAX_PETALS]}
      frustumCulled={false}
      renderOrder={2}   // ← renders AFTER bottle (renderOrder 0) — depth buffer
                        //   already has bottle data, so petals are occluded by it
    />
  )
}

// ── Export: three color-band batches ────────────────────────────────────────
export default function FlowerRibbon({ mousePosition }) {
  return (
    <>
      {/* Deep violet batch — larger petals */}
      <PetalBatch palette={PALETTE_DARK} mousePosition={mousePosition} geoScale={1.2} />
      {/* Medium purple/lilac batch — slightly smaller, layered on top */}
      <PetalBatch palette={PALETTE_LIGHT} mousePosition={mousePosition} geoScale={0.85} />
      {/* Sparse near-white highlight flecks — smallest, adds the glint you see in the reference */}
      <PetalBatch palette={PALETTE_HIGHLIGHT} mousePosition={mousePosition} geoScale={0.6} emitRate={20} />
    </>
  )
}