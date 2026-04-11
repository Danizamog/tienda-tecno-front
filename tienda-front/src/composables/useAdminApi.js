import { useAuthSession } from '@/composables/useAuthSession'

const API = (import.meta.env.VITE_GATEWAY_API_BASE_URL || 'http://localhost:9000').replace(/\/$/, '')

export function useAdminApi() {
  const { session } = useAuthSession()

  function authHeaders() {
    return {
      'Content-Type': 'application/json',
      'X-User-Id':   session.value?.userId || '',
      'X-User-Role': session.value?.role   || '',
    }
  }

  async function handleResponse(res) {
    if (res.status === 204) return null
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      const msg = data?.error || data?.message || `Error ${res.status}`
      throw new Error(msg)
    }
    return data
  }

  // ── Tiendas ─────────────────────────────────────────────────────────────────

  async function listStores({ page = 1, perPage = 20, status = '', search = '', verified = '', sort = '-created' } = {}) {
    const params = new URLSearchParams({ page, perPage, sort })
    if (status)             params.set('status', status)
    if (search)             params.set('search', search)
    if (verified !== '')    params.set('verified', verified)
    const res = await fetch(`${API}/stores?${params}`, { headers: authHeaders() })
    return handleResponse(res)
  }

  async function getStore(id) {
    const res = await fetch(`${API}/stores/${id}`, { headers: authHeaders() })
    return handleResponse(res)
  }

  async function createStore(data) {
    const res = await fetch(`${API}/stores`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(data),
    })
    return handleResponse(res)
  }

  async function updateStore(id, data) {
    const res = await fetch(`${API}/stores/${id}`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify(data),
    })
    return handleResponse(res)
  }

  async function deleteStore(id) {
    const res = await fetch(`${API}/stores/${id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    })
    return handleResponse(res)
  }

  async function searchUsers(q) {
    const params = new URLSearchParams({ q })
    const res = await fetch(`${API}/stores/admin/users-search?${params}`, { headers: authHeaders() })
    return handleResponse(res)
  }

  async function uploadImages(id, formData) {
    // No incluir Content-Type; el navegador lo establece automáticamente con el boundary
    const res = await fetch(`${API}/stores/${id}/images`, {
      method: 'PATCH',
      headers: {
        'X-User-Id':   session.value?.userId || '',
        'X-User-Role': session.value?.role   || '',
      },
      body: formData,
    })
    return handleResponse(res)
  }

  return {
    listStores,
    getStore,
    createStore,
    updateStore,
    deleteStore,
    searchUsers,
    uploadImages,
  }
}
