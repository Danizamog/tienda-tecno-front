import { useAuthSession } from '@/composables/useAuthSession'

const API = (import.meta.env.VITE_GATEWAY_API_BASE_URL || '/api').replace(/\/$/, '')

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

  async function safeFetch(url, options) {
    try {
      return await fetch(url, options)
    } catch (_err) {
      throw new Error('No se pudo conectar al backend. Verifica que el gateway este activo en puerto 9000.')
    }
  }

  // ── Tiendas ─────────────────────────────────────────────────────────────────

  async function listStores({ page = 1, perPage = 12, status = '', search = '', verified = '', sort = '-id' } = {}) {
    const params = new URLSearchParams({ page, perPage, sort })
    if (status)             params.set('status', status)
    if (search)             params.set('search', search)
    if (verified !== '')    params.set('verified', verified)
    const res = await safeFetch(`${API}/stores?${params}`, { headers: authHeaders() })
    return handleResponse(res)
  }

  async function getStore(id) {
    const res = await safeFetch(`${API}/stores/${id}`, { headers: authHeaders() })
    return handleResponse(res)
  }

  async function createStore(data) {
    const isFormData = typeof FormData !== 'undefined' && data instanceof FormData
    const res = await safeFetch(`${API}/stores`, {
      method: 'POST',
      headers: isFormData
        ? {
            'X-User-Id':   session.value?.userId || '',
            'X-User-Role': session.value?.role   || '',
          }
        : authHeaders(),
      body: isFormData ? data : JSON.stringify(data),
    })
    return handleResponse(res)
  }

  async function updateStore(id, data) {
    const res = await safeFetch(`${API}/stores/${id}`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify(data),
    })
    return handleResponse(res)
  }

  async function deleteStore(id) {
    const res = await safeFetch(`${API}/stores/${id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    })
    return handleResponse(res)
  }

  async function searchUsers(q, roles = []) {
    const params = new URLSearchParams({ q })
    if (roles.length > 0) {
      roles.forEach(role => params.append('role', role))
    }
    const res = await safeFetch(`${API}/stores/admin/users-search?${params}`, { headers: authHeaders() })
    return handleResponse(res)
  }

  async function listUsers({ page = 1, perPage = 12, q = '', role = '', sort = '-id' } = {}) {
    const params = new URLSearchParams({ page, perPage, sort })
    if (q) params.set('q', q)
    if (role) params.set('role', role)
    const res = await safeFetch(`${API}/stores/admin/users?${params}`, { headers: authHeaders() })
    return handleResponse(res)
  }

  async function getUser(id) {
    const res = await safeFetch(`${API}/stores/admin/users/${id}`, { headers: authHeaders() })
    return handleResponse(res)
  }

  async function updateUser(id, data) {
    const res = await safeFetch(`${API}/stores/admin/users/${id}`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify(data),
    })
    return handleResponse(res)
  }

  async function listTransactions() {
    const res = await safeFetch(`${API}/finance/transactions`, { headers: authHeaders() })
    return handleResponse(res)
  }

  async function listTransactionsByStore() {
    const res = await safeFetch(`${API}/finance/transactions/by-store`, { headers: authHeaders() })
    return handleResponse(res)
  }

  async function getFinanceSummary() {
    const res = await safeFetch(`${API}/finance/dashboard/summary`, { headers: authHeaders() })
    return handleResponse(res)
  }

  async function getMarketplaceOverview() {
    const res = await safeFetch(`${API}/stores/admin/overview`, { headers: authHeaders() })
    return handleResponse(res)
  }

  async function getDashboardOverview({ days = 30 } = {}) {
    const params = new URLSearchParams({ days })
    const res = await safeFetch(`${API}/dashboard/admin/overview?${params}`, { headers: authHeaders() })
    return handleResponse(res)
  }

  async function getDashboardByStore({ days = 30 } = {}) {
    const params = new URLSearchParams({ days })
    const res = await safeFetch(`${API}/dashboard/admin/stores?${params}`, { headers: authHeaders() })
    return handleResponse(res)
  }

  async function syncDashboardMetrics({ date } = {}) {
    const res = await safeFetch(`${API}/dashboard/sync`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(date ? { date } : {}),
    })
    return handleResponse(res)
  }

  async function uploadImages(id, formData) {
    // No incluir Content-Type; el navegador lo establece automáticamente con el boundary
    const res = await safeFetch(`${API}/stores/${id}/images`, {
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
    listUsers,
    getUser,
    updateUser,
    listTransactions,
    listTransactionsByStore,
    getFinanceSummary,
    getMarketplaceOverview,
    getDashboardOverview,
    getDashboardByStore,
    syncDashboardMetrics,
    uploadImages,
  }
}
