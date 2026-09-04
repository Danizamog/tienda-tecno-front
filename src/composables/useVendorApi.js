import { useAuthSession } from '@/composables/useAuthSession'

const API = (import.meta.env.VITE_GATEWAY_API_BASE_URL || '').replace(/\/$/, '')
const PB  = (import.meta.env.VITE_POCKETBASE_URL || '').replace(/\/$/, '')

export function useVendorApi() {
  const { session } = useAuthSession()

  function authHeaders() {
    return {
      'Content-Type': 'application/json',
      'X-User-Id':   session.value?.userId || '',
      'X-User-Role': session.value?.role   || '',
    }
  }
  function authHeadersMultipart() {
    return {
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

  async function safeFetch(url, options = {}) {
    try {
      return await fetch(url, options)
    } catch {
      throw new Error('No se pudo conectar al backend.')
    }
  }

  // ── Tiendas ──────────────────────────────────────────────────────────────────

  async function getMyStores({ page = 1, perPage = 12 } = {}) {
    const params = new URLSearchParams({ page, perPage })
    const res = await safeFetch(`${API}/stores/vendor/my-stores?${params}`, { headers: authHeaders() })
    return handleResponse(res)
  }

  async function getVendorDashboard(storeId) {
    const res = await safeFetch(`${API}/stores/vendor/dashboard/${storeId}`, { headers: authHeaders() })
    return handleResponse(res)
  }

  async function getStoreDashboardMetrics(storeId, { days = 30 } = {}) {
    const params = new URLSearchParams({ days })
    const res = await safeFetch(`${API}/dashboard/vendor/${storeId}?${params}`, { headers: authHeaders() })
    return handleResponse(res)
  }

  async function getVendorForecast(storeId, { historyDays = 365, horizonDays = 30 } = {}) {
    const params = new URLSearchParams({ historyDays, horizonDays })
    const res = await safeFetch(`${API}/predictions/vendor/${storeId}?${params}`, { headers: authHeaders() })
    return handleResponse(res)
  }

  async function listFinanceTransactions({ storeId } = {}) {
    const params = new URLSearchParams()
    if (storeId) params.set('storeId', storeId)
    const query = params.toString()
    const res = await safeFetch(`${API}/finance/transactions${query ? `?${query}` : ''}`, { headers: authHeaders() })
    return handleResponse(res)
  }

  async function getFinanceSummary({ storeId } = {}) {
    const params = new URLSearchParams()
    if (storeId) params.set('storeId', storeId)
    const query = params.toString()
    const res = await safeFetch(`${API}/finance/dashboard/summary${query ? `?${query}` : ''}`, { headers: authHeaders() })
    return handleResponse(res)
  }

  async function updateStoreInfo(storeId, data) {
    const res = await safeFetch(`${API}/stores/vendor/${storeId}`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify(data),
    })
    return handleResponse(res)
  }

  async function uploadStoreQr(storeId, file, instructions = '') {
    const formData = new FormData()
    formData.append('payment_qr', file)
    if (instructions) formData.append('payment_instructions', instructions)
    const res = await safeFetch(`${API}/stores/vendor/${storeId}/qr`, {
      method: 'PATCH',
      headers: authHeadersMultipart(),
      body: formData,
    })
    return handleResponse(res)
  }

  // ── Productos ────────────────────────────────────────────────────────────────

  async function listProducts({ storeId, status = '', search = '', page = 1, perPage = 12, sort = '-created' } = {}) {
    const params = new URLSearchParams({ page, perPage, sort })
    if (storeId) params.set('storeId', storeId)
    if (status)  params.set('status', status)
    if (search)  params.set('search', search)
    const res = await safeFetch(`${API}/products?${params}`, { headers: authHeaders() })
    return handleResponse(res)
  }

  async function getProduct(id) {
    const res = await safeFetch(`${API}/products/${id}`, { headers: authHeaders() })
    return handleResponse(res)
  }

  async function createProduct(formData) {
    const res = await safeFetch(`${API}/products`, {
      method: 'POST',
      headers: authHeadersMultipart(),
      body: formData,
    })
    return handleResponse(res)
  }

  async function updateProduct(id, formData) {
    const res = await safeFetch(`${API}/products/${id}`, {
      method: 'PATCH',
      headers: authHeadersMultipart(),
      body: formData,
    })
    return handleResponse(res)
  }

  async function updateProductStatus(id, payload) {
    const res = await safeFetch(`${API}/products/${id}/status`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify(payload),
    })
    return handleResponse(res)
  }

  async function deleteProduct(id) {
    const res = await safeFetch(`${API}/products/${id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    })
    return handleResponse(res)
  }

  async function getCategories() {
    const res = await safeFetch(`${API}/products/categories`, { headers: authHeaders() })
    return handleResponse(res)
  }

  // ── Subastas ─────────────────────────────────────────────────────────────────

  async function listAuctions({ storeId, status = '', page = 1, perPage = 20, sort = '-created' } = {}) {
    const params = new URLSearchParams({ page, perPage, sort })
    if (storeId) params.set('storeId', storeId)
    if (status)  params.set('status', status)
    const res = await safeFetch(`${API}/auctions?${params}`, { headers: authHeaders() })
    return handleResponse(res)
  }

  async function getAuction(id) {
    const res = await safeFetch(`${API}/auctions/${id}`, { headers: authHeaders() })
    return handleResponse(res)
  }

  async function createAuction(formData) {
    const res = await safeFetch(`${API}/auctions`, {
      method: 'POST',
      headers: authHeadersMultipart(),
      body: formData,
    })
    return handleResponse(res)
  }

  async function updateAuction(id, formData) {
    const res = await safeFetch(`${API}/auctions/${id}`, {
      method: 'PATCH',
      headers: authHeadersMultipart(),
      body: formData,
    })
    return handleResponse(res)
  }

  async function deleteAuction(id) {
    const res = await safeFetch(`${API}/auctions/${id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    })
    return handleResponse(res)
  }

  // ── Órdenes ──────────────────────────────────────────────────────────────────

  async function listOrders({ storeId, status = '', search = '', page = 1, perPage = 20 } = {}) {
    const params = new URLSearchParams({ page, perPage })
    if (storeId) params.set('storeId', storeId)
    if (status)  params.set('status', status)
    if (search)  params.set('search', search)
    const res = await safeFetch(`${API}/orders?${params}`, { headers: authHeaders() })
    return handleResponse(res)
  }

  async function getOrder(id) {
    const res = await safeFetch(`${API}/orders/${id}`, { headers: authHeaders() })
    return handleResponse(res)
  }

  async function approveOrder(id, { shippingAddress, note, lat, lng } = {}) {
    const res = await safeFetch(`${API}/orders/${id}/approve`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ shipping_address: shippingAddress, approval_note: note, lat, lng }),
    })
    return handleResponse(res)
  }

  async function rejectOrder(id, reason = '') {
    const res = await safeFetch(`${API}/orders/${id}/reject`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ reason }),
    })
    return handleResponse(res)
  }

  async function shipOrder(id) {
    const res = await safeFetch(`${API}/orders/${id}/ship`, {
      method: 'PATCH',
      headers: authHeaders(),
    })
    return handleResponse(res)
  }

  async function deliverOrder(id) {
    const res = await safeFetch(`${API}/orders/${id}/deliver`, {
      method: 'PATCH',
      headers: authHeaders(),
    })
    return handleResponse(res)
  }

  async function getOrderProofBlob(orderId, filename) {
    const safeName = Array.isArray(filename) ? filename[0] : filename
    if (!orderId || !safeName) throw new Error('Comprobante inválido')
    const safeFilename = encodeURIComponent(String(safeName))
    const res = await safeFetch(`${API}/orders/files/orders/${orderId}/${safeFilename}`, {
      headers: authHeadersMultipart(),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => null)
      const msg = data?.error || `Error ${res.status}`
      throw new Error(msg)
    }
    return res.blob()
  }

  // ── Helpers de archivos ──────────────────────────────────────────────────────

  function fileUrl(collection, recordId, filename) {
    if (!filename || !recordId) return ''
    return `${PB}/api/files/${collection}/${recordId}/${filename}`
  }

  function storeFileUrl(storeId, filename) {
    return fileUrl('stores', storeId, filename)
  }

  function productFileUrl(productId, filename) {
    return fileUrl('products', productId, filename)
  }

  function orderFileUrl(orderId, filename) {
    return fileUrl('orders', orderId, filename)
  }

  return {
    getMyStores,
    getVendorDashboard,
    getStoreDashboardMetrics,
    getVendorForecast,
    listFinanceTransactions,
    getFinanceSummary,
    updateStoreInfo,
    uploadStoreQr,
    listProducts,
    getProduct,
    createProduct,
    updateProduct,
    updateProductStatus,
    deleteProduct,
    getCategories,
    listAuctions,
    getAuction,
    createAuction,
    updateAuction,
    deleteAuction,
    listOrders,
    getOrder,
    approveOrder,
    rejectOrder,
    shipOrder,
    deliverOrder,
    getOrderProofBlob,
    fileUrl,
    storeFileUrl,
    productFileUrl,
    orderFileUrl,
  }
}
