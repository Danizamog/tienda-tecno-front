/**
 * v-tilt — directiva Vue 3 que añade efecto 3D al hover.
 * El elemento se inclina sutilmente hacia el cursor como si lo estuvieras
 * sosteniendo. Respeta prefers-reduced-motion.
 *
 * Uso:
 *   import { vTilt } from '@/composables/useTilt3D'
 *   <div v-tilt class="card">…</div>
 *   <div v-tilt="{ max: 10, scale: 1.03 }">…</div>
 */
export const vTilt = {
  mounted(el, binding) {
    if (typeof window === 'undefined') return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    if (window.matchMedia?.('(hover: none)').matches) return // saltar en móvil táctil

    const options = binding.value || {}
    const maxTilt = options.max ?? 7
    const scale   = options.scale ?? 1.015
    const speed   = options.speed ?? 350

    el.style.transformStyle = 'preserve-3d'
    el.style.transition = `transform ${speed}ms cubic-bezier(0.22, 1, 0.36, 1)`
    el.style.willChange = 'transform'

    function handleMove(e) {
      const rect = el.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      const cx = rect.width / 2
      const cy = rect.height / 2

      const rotateY = ((x - cx) / cx) * maxTilt
      const rotateX = -((y - cy) / cy) * maxTilt

      el.style.transform =
        `perspective(900px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) scale(${scale})`
    }

    function handleLeave() {
      el.style.transform = 'perspective(900px) rotateX(0) rotateY(0) scale(1)'
    }

    function handleEnter() {
      el.style.transition = `transform ${speed}ms cubic-bezier(0.22, 1, 0.36, 1)`
    }

    el.__tiltMove = handleMove
    el.__tiltLeave = handleLeave
    el.__tiltEnter = handleEnter

    el.addEventListener('mouseenter', handleEnter)
    el.addEventListener('mousemove', handleMove)
    el.addEventListener('mouseleave', handleLeave)
  },
  beforeUnmount(el) {
    if (el.__tiltMove)  el.removeEventListener('mousemove',  el.__tiltMove)
    if (el.__tiltLeave) el.removeEventListener('mouseleave', el.__tiltLeave)
    if (el.__tiltEnter) el.removeEventListener('mouseenter', el.__tiltEnter)
  },
}
