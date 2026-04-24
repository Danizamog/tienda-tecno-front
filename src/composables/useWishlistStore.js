import { ref, computed } from 'vue'
import { useAuthSession } from '@/composables/useAuthSession'

const API = (import.meta.env.VITE_GATEWAY_API_BASE_URL || '').replace(/\/$/, '')

// ── Estado singleton (compartido entre todas las instancias del composable) ───
const wishlistItems = ref([])   // Array de registros de wishlist con expand de producto
const wishlistIds   = ref(new Set()) // Set de productIds para lookup O(1)
const loading       = ref(false)
const initialized   = ref(false)

export function useWishlistStore() {
  const { session, isAuthenticated } = useAuthSession()

  function getUserId() {
    return session.value?.userId || null
  }

  function authHeaders() {
    const userId = getUserId()
    if (!userId) return {}
    return { 'x-user-id': userId }
  }

  // ── Cargar wishlist desde el backend ────────────────────────────────────────
  async function loadWishlist() {
    if (!isAuthenticated.value || !getUserId()) {
      wishlistItems.value = []
      wishlistIds.value   = new Set()
      initialized.value   = false
      return
    }

    loading.value = true
    try {
      const res = await fetch(`${API}/wishlist`, {
        headers: authHeaders(),
      })

      if (!res.ok) {
        console.warn('[wishlist] load failed:', res.status)
        return
      }

      const data = await res.json()
      wishlistItems.value = data.items || []
      wishlistIds.value   = new Set(wishlistItems.value.map(w => w.product))
      initialized.value   = true
    } catch (err) {
      console.error('[wishlist] load error:', err.message)
    } finally {
      loading.value = false
    }
  }

  // ── Verificar si un producto está en wishlist ────────────────────────────────
  function isInWishlist(productId) {
    return wishlistIds.value.has(productId)
  }

  // ── Obtener registro de wishlist por productId ───────────────────────────────
  function getWishlistItem(productId) {
    return wishlistItems.value.find(w => w.product === productId) || null
  }

  // ── Añadir producto a wishlist ───────────────────────────────────────────────
  async function addToWishlist(productId) {
    if (!isAuthenticated.value || !getUserId()) {
      return { ok: false, error: 'not_authenticated' }
    }
    if (isInWishlist(productId)) {
      return { ok: false, error: 'already_in_wishlist' }
    }

    // Optimistic update
    wishlistIds.value.add(productId)

    try {
      const res = await fetch(`${API}/wishlist`, {
        method:  'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body:    JSON.stringify({ productId }),
      })

      if (res.status === 409) {
        // Ya existe — sincronizar estado real
        await loadWishlist()
        return { ok: false, error: 'already_in_wishlist' }
      }

      if (!res.ok) {
        wishlistIds.value.delete(productId)
        const data = await res.json().catch(() => ({}))
        return { ok: false, error: data.error || 'unknown' }
      }

      const data = await res.json()
      // Recargar para obtener el expand completo del producto
      await loadWishlist()
      return { ok: true, id: data.id }
    } catch (err) {
      wishlistIds.value.delete(productId)
      return { ok: false, error: err.message }
    }
  }

  // ── Eliminar de wishlist por ID de registro ──────────────────────────────────
  async function removeFromWishlist(wishlistId, productId) {
    if (!isAuthenticated.value) return { ok: false, error: 'not_authenticated' }

    // Optimistic update
    wishlistItems.value = wishlistItems.value.filter(w => w.id !== wishlistId)
    if (productId) wishlistIds.value.delete(productId)

    try {
      const res = await fetch(`${API}/wishlist/${wishlistId}`, {
        method:  'DELETE',
        headers: authHeaders(),
      })

      if (!res.ok && res.status !== 404) {
        // Revertir en caso de error
        await loadWishlist()
        return { ok: false, error: 'delete_failed' }
      }

      return { ok: true }
    } catch (err) {
      await loadWishlist()
      return { ok: false, error: err.message }
    }
  }

  // ── Toggle wishlist (añadir o quitar) ────────────────────────────────────────
  async function toggleWishlist(productId) {
    if (!isAuthenticated.value) {
      return { ok: false, error: 'not_authenticated' }
    }

    if (isInWishlist(productId)) {
      const item = getWishlistItem(productId)
      if (!item) {
        await loadWishlist()
        return { ok: false, error: 'sync_error' }
      }
      return removeFromWishlist(item.id, productId)
    } else {
      return addToWishlist(productId)
    }
  }

  // ── Limpiar al cerrar sesión ─────────────────────────────────────────────────
  function clearWishlist() {
    wishlistItems.value = []
    wishlistIds.value   = new Set()
    initialized.value   = false
  }

  const totalWishlistCount = computed(() => wishlistItems.value.length)

  return {
    wishlistItems,
    wishlistIds,
    loading,
    initialized,
    totalWishlistCount,
    loadWishlist,
    isInWishlist,
    getWishlistItem,
    addToWishlist,
    removeFromWishlist,
    toggleWishlist,
    clearWishlist,
  }
}
