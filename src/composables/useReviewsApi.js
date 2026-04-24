import { ref } from 'vue'
import { useAuthSession } from '@/composables/useAuthSession'

const API = (import.meta.env.VITE_GATEWAY_API_BASE_URL || '').replace(/\/$/, '')

export function useReviewsApi() {
  const { session } = useAuthSession()

  function authHeaders() {
    return {
      'Content-Type': 'application/json',
      'X-User-Id':    session.value?.userId || '',
      'X-User-Role':  session.value?.role   || 'user',
    }
  }

  // ── Cargar reseñas de un producto ─────────────────────────────────────────
  async function fetchProductReviews(productId, { page = 1, perPage = 10 } = {}) {
    const params = new URLSearchParams({ page, perPage })
    const res = await fetch(`${API}/reviews/product/${productId}?${params}`)
    if (!res.ok) throw new Error(`Error ${res.status}`)
    return res.json() // { items, total, totalPages, avgRating }
  }

  // ── Cargar reseñas de una tienda ──────────────────────────────────────────
  async function fetchStoreReviews(storeId, { page = 1, perPage = 10 } = {}) {
    const params = new URLSearchParams({ page, perPage })
    const res = await fetch(`${API}/reviews/store/${storeId}?${params}`)
    if (!res.ok) throw new Error(`Error ${res.status}`)
    return res.json() // { items, total, totalPages }
  }

  // ── Verificar si ya existe reseña del usuario ─────────────────────────────
  async function checkExistingReview({ productId, storeId } = {}) {
    const params = new URLSearchParams()
    if (productId) params.set('productId', productId)
    if (storeId)   params.set('storeId',   storeId)
    const res = await fetch(`${API}/reviews/check?${params}`, { headers: authHeaders() })
    if (!res.ok) return { hasReview: false, review: null }
    return res.json() // { hasReview, review }
  }

  // ── Cargar mis reseñas ────────────────────────────────────────────────────
  async function fetchMyReviews({ page = 1, perPage = 20 } = {}) {
    const params = new URLSearchParams({ page, perPage })
    const res = await fetch(`${API}/reviews/my?${params}`, { headers: authHeaders() })
    if (!res.ok) throw new Error(`Error ${res.status}`)
    return res.json() // { items, total, totalPages }
  }

  // ── Crear reseña ──────────────────────────────────────────────────────────
  async function createReview({ productId, storeId, orderId, rating, title, comment }) {
    const res = await fetch(`${API}/reviews`, {
      method:  'POST',
      headers: authHeaders(),
      body:    JSON.stringify({ productId, storeId, orderId, rating, title, comment }),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) return { ok: false, error: data?.error || `Error ${res.status}`, message: data?.message }
    return { ok: true, id: data?.id, review: data?.review }
  }

  // ── Eliminar reseña ───────────────────────────────────────────────────────
  async function deleteReview(reviewId) {
    const res = await fetch(`${API}/reviews/${reviewId}`, {
      method:  'DELETE',
      headers: authHeaders(),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => null)
      return { ok: false, error: data?.error || `Error ${res.status}` }
    }
    return { ok: true }
  }

  return {
    fetchProductReviews,
    fetchStoreReviews,
    fetchMyReviews,
    checkExistingReview,
    createReview,
    deleteReview,
  }
}

// ── Composable para el panel de reseñas de un producto (con estado) ───────────
export function useProductReviews(productId) {
  const reviews    = ref([])
  const total      = ref(0)
  const totalPages = ref(1)
  const avgRating  = ref(null)
  const loading    = ref(false)
  const error      = ref('')
  const page       = ref(1)

  const { fetchProductReviews } = useReviewsApi()

  async function load(p = 1) {
    loading.value = true
    error.value   = ''
    page.value    = p
    try {
      const data    = await fetchProductReviews(productId, { page: p, perPage: 8 })
      reviews.value    = data.items      || []
      total.value      = data.total      || 0
      totalPages.value = data.totalPages || 1
      avgRating.value  = data.avgRating  ?? null
    } catch (e) {
      error.value = e.message || 'Error al cargar reseñas'
    } finally {
      loading.value = false
    }
  }

  return { reviews, total, totalPages, avgRating, loading, error, page, load }
}

// ── Composable para el panel de reseñas de una tienda (con estado) ────────────
export function useStoreReviews(storeId) {
  const reviews    = ref([])
  const total      = ref(0)
  const totalPages = ref(1)
  const loading    = ref(false)
  const error      = ref('')
  const page       = ref(1)

  const { fetchStoreReviews } = useReviewsApi()

  async function load(p = 1) {
    loading.value = true
    error.value   = ''
    page.value    = p
    try {
      const data    = await fetchStoreReviews(storeId, { page: p, perPage: 8 })
      reviews.value    = data.items      || []
      total.value      = data.total      || 0
      totalPages.value = data.totalPages || 1
    } catch (e) {
      error.value = e.message || 'Error al cargar reseñas'
    } finally {
      loading.value = false
    }
  }

  return { reviews, total, totalPages, loading, error, page, load }
}
