import { onMounted, onBeforeUnmount } from 'vue'

/**
 * useScrollReveal — activa la animación de entrada al hacer scroll.
 *
 * Aplica la clase `is-visible` a todos los elementos con la clase `.reveal`
 * dentro del DOM cuando entran en el viewport. Funciona una sola vez por
 * elemento (no re-anima al salir y volver a entrar).
 *
 * Uso: importar y llamar useScrollReveal() en el setup de la view.
 * Marcar elementos con class="reveal" (opcionalmente con reveal-delay-1..6).
 */
export function useScrollReveal(options = {}) {
  const { rootMargin = '0px 0px -10% 0px', threshold = 0.1 } = options
  let observer = null

  function onIntersect(entries) {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible')
        observer.unobserve(entry.target)
      }
    }
  }

  function observeAll() {
    if (!observer) return
    document.querySelectorAll('.reveal:not(.is-visible)').forEach((el) => {
      observer.observe(el)
    })
  }

  onMounted(() => {
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) {
      document.querySelectorAll('.reveal').forEach((el) => el.classList.add('is-visible'))
      return
    }

    observer = new IntersectionObserver(onIntersect, { rootMargin, threshold })

    requestAnimationFrame(() => {
      observeAll()
    })

    // Observar también nuevos elementos `.reveal` añadidos al DOM
    // (útil cuando los datos llegan async de la API)
    const mutationObserver = new MutationObserver(observeAll)
    mutationObserver.observe(document.body, { childList: true, subtree: true })

    onBeforeUnmount(() => {
      mutationObserver.disconnect()
    })
  })

  onBeforeUnmount(() => {
    if (observer) {
      observer.disconnect()
      observer = null
    }
  })
}
