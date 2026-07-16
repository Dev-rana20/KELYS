import { useRef, useCallback } from 'react'
import HeroCanvas from './HeroCanvas'
import HeroOverlay from './HeroOverlay'

/**
 * Hero.jsx
 * The main exported Hero component.
 * Acts as a standard React section, manages mouse/touch state for interactions,
 * and encapsulates the entire 3D scene and overlay.
 * Requires zero global CSS and won't hijack scrolling.
 */
export default function Hero() {
  const mousePosition = useRef({ x: 0, y: 0 })

  const handleMouseMove = useCallback((e) => {
    // Normalize mouse coordinates from -1 to 1
    const { clientX, clientY } = e
    const { innerWidth, innerHeight } = window
    mousePosition.current.x = (clientX / innerWidth) * 2 - 1
    mousePosition.current.y = -(clientY / innerHeight) * 2 + 1
  }, [])

  const handleTouchMove = useCallback((e) => {
    if (e.touches && e.touches.length > 0) {
      const touch = e.touches[0]
      const { innerWidth, innerHeight } = window
      mousePosition.current.x = (touch.clientX / innerWidth) * 2 - 1
      mousePosition.current.y = -(touch.clientY / innerHeight) * 2 + 1
    }
  }, [])

  return (
    <section
      id="hero"
      className="relative w-full h-screen overflow-hidden bg-[#ede4f3]"
      onMouseMove={handleMouseMove}
      onTouchMove={handleTouchMove}
    >
      <HeroCanvas mousePosition={mousePosition} />
      <HeroOverlay />
    </section>
  )
}
