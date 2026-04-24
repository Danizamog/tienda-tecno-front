import { useAuthSession } from '@/composables/useAuthSession'

const API = (import.meta.env.VITE_GATEWAY_API_BASE_URL || '').replace(/\/$/, '')

export function useGiftcardApi() {
  const { session } = useAuthSession()

  function authHeaders() {
    const userId = session.value?.userId || null
    const role   = session.value?.role   || null
    if (!userId) return { 'Content-Type': 'application/json' }
    return {
      'Content-Type': 'application/json',
      'x-user-id':   userId,
      'x-user-role': role || '',
    }
  }

  // ── Usuario: listar sus gift cards ──────────────────────────────────────────
  async function listMyGiftcards(storeId = '') {
    const params = new URLSearchParams()
    if (storeId) params.set('storeId', storeId)
    const suffix = params.toString() ? `?${params}` : ''

    const res = await fetch(`${API}/giftcards${suffix}`, { headers: authHeaders() })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.message || `Error ${res.status}`)
    }
    return res.json()
  }

  // ── Usuario: canjear un código → obtener gift card ──────────────────────────
  async function redeemCode(code) {
    const res = await fetch(`${API}/giftcards/redeem`, {
      method:  'POST',
      headers: authHeaders(),
      body:    JSON.stringify({ code: code.trim().toUpperCase() }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.message || data.error || `Error ${res.status}`)
    return data
  }

  // ── Usuario: validar gift card antes de pagar ───────────────────────────────
  async function validateCode(code, storeId = '') {
    const res = await fetch(`${API}/giftcards/validate`, {
      method:  'POST',
      headers: authHeaders(),
      body:    JSON.stringify({ code: code.trim().toUpperCase(), storeId }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.message || data.error || `Error ${res.status}`)
    return data
  }

  // ── Vendor/Admin: listar códigos del pool ───────────────────────────────────
  async function listCodes({ storeId, status, page = 1, perPage = 20 } = {}) {
    const params = new URLSearchParams({ page, perPage })
    if (storeId) params.set('storeId', storeId)
    if (status)  params.set('status', status)

    const res = await fetch(`${API}/giftcards/codes?${params}`, { headers: authHeaders() })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.message || `Error ${res.status}`)
    }
    return res.json()
  }

  // ── Vendor/Admin: crear código ──────────────────────────────────────────────
  async function createCode(payload) {
    const res = await fetch(`${API}/giftcards/codes`, {
      method:  'POST',
      headers: authHeaders(),
      body:    JSON.stringify(payload),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.message || data.error || `Error ${res.status}`)
    return data
  }

  // ── Vendor/Admin: actualizar estado/expiración de código ────────────────────
  async function updateCode(id, patch) {
    const res = await fetch(`${API}/giftcards/codes/${id}`, {
      method:  'PATCH',
      headers: authHeaders(),
      body:    JSON.stringify(patch),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.message || data.error || `Error ${res.status}`)
    return data
  }

  // ── Admin: eliminar código ──────────────────────────────────────────────────
  async function deleteCode(id) {
    const res = await fetch(`${API}/giftcards/codes/${id}`, {
      method:  'DELETE',
      headers: authHeaders(),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.message || data.error || `Error ${res.status}`)
    }
    return { ok: true }
  }

  return {
    listMyGiftcards,
    redeemCode,
    validateCode,
    listCodes,
    createCode,
    updateCode,
    deleteCode,
  }
}
