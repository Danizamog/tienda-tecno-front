import { ref, onMounted, onBeforeUnmount } from 'vue'

/**
 * useCountUp — anima un número desde 0 hasta `target` cuando el elemento
 * entra en el viewport. Ideal para stats / KPIs en el hero.
 *
 * Uso:
 *   const { value, elRef } = useCountUp(500, { duration: 1800, suffix: '+' })
 *   <span :ref="elRef">{{ value }}</span>
 */
export function useCountUp(target, options = {}) {
  const {
    duration = 1600,
    suffix = '',
    prefix = '',
    decimals = 0,
    // Si target es un string como "+24h" o "∞", lo mostramos tal cual sin contar
    raw = null,
  } = options

  const value = ref(raw !== null ? raw : `${prefix}0${suffix}`)
  const elRef = ref(null)
  let observer = null
  let rafId = null
  let started = false

  function easeOutQuart(t) {
    return 1 - Math.pow(1 - t, 4)
  }

  function start() {
    if (started) return
    started = true

    // Caso especial: target no numérico (∞, "+24h", "100%")
    const numericTarget = Number(target)
    if (raw !== null || isNaN(numericTarget)) {
      value.value = raw !== null ? raw : target
      return
    }

    const startTime = performance.now()
    const startValue = 0

    function step(currentTime) {
      const elapsed = currentTime - startTime
      const progress = Math.min(elapsed / duration, 1)
      const eased = easeOutQuart(progress)
      const current = startValue + (numericTarget - startValue) * eased

      value.value = `${prefix}${current.toFixed(decimals)}${suffix}`

      if (progress < 1) {
        rafId = requestAnimationFrame(step)
      } else {
        value.value = `${prefix}${numericTarget}${suffix}`
        rafId = null
      }
    }

    rafId = requestAnimationFrame(step)
  }

  onMounted(() => {
    if (typeof window === 'undefined' || !('IntersectionObserver' in window) || !elRef.value) {
      start()
      return
    }
    observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        start()
        observer.disconnect()
      }
    }, { threshold: 0.3 })
    observer.observe(elRef.value)
  })

  onBeforeUnmount(() => {
    if (observer) observer.disconnect()
    if (rafId) cancelAnimationFrame(rafId)
  })

  return { value, elRef }
}
