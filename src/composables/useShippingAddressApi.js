import { useAuthSession } from '@/composables/useAuthSession'

const API = (import.meta.env.VITE_GATEWAY_API_BASE_URL || '/api').replace(/\/$/, '')

function authHeaders(session) {
  return {
    'Content-Type': 'application/json',
    'X-User-Id': session?.userId || '',
    'X-User-Role': session?.role || 'user',
  }
}

async function parseResponse(res) {
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const message = data?.error || data?.message || `Error ${res.status}`
    throw new Error(message)
  }
  return data
}

export function useShippingAddressApi() {
  const { session } = useAuthSession()

  async function listAddresses() {
    const res = await fetch(`${API}/orders/buyer/addresses`, {
      headers: authHeaders(session.value),
    })
    const data = await parseResponse(res)
    return data?.items || []
  }

  async function createAddress(payload) {
    const res = await fetch(`${API}/orders/buyer/addresses`, {
      method: 'POST',
      headers: authHeaders(session.value),
      body: JSON.stringify(payload),
    })
    return parseResponse(res)
  }

  async function updateAddress(addressId, payload) {
    const res = await fetch(`${API}/orders/buyer/addresses/${addressId}`, {
      method: 'PATCH',
      headers: authHeaders(session.value),
      body: JSON.stringify(payload),
    })
    return parseResponse(res)
  }

  async function deleteAddress(addressId) {
    const res = await fetch(`${API}/orders/buyer/addresses/${addressId}`, {
      method: 'DELETE',
      headers: authHeaders(session.value),
    })
    if (res.status === 204) return true
    await parseResponse(res)
    return true
  }

  return {
    listAddresses,
    createAddress,
    updateAddress,
    deleteAddress,
  }
}
