import { ref, computed, watch } from 'vue'
import { useAuthSession } from '@/composables/useAuthSession'

const API = (import.meta.env.VITE_GATEWAY_API_BASE_URL || '').replace(/\/$/, '')
const GUEST_KEY = 'cart_guest'

// ── Estado global compartido ─────────────────────────────────────────────────
const cart = ref({})              // { [storeId]: { storeId, storeName, storeSlug, items: [...] } }
const _initialized = ref(false)
const _loading = ref(false)
let _watchersAttached = false

// ── Persistencia de invitado (sessionStorage) ────────────────────────────────
function loadGuestCart() {
  try {
    const raw = sessionStorage.getItem(GUEST_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) || {}
    const { _savedAt: _, ...stores } = parsed
    return stores
  } catch {
    return {}
  }
}

function saveGuestCart(data) {
  try {
    sessionStorage.setItem(GUEST_KEY, JSON.stringify({ ...data, _savedAt: Date.now() }))
  } catch { /* noop */ }
}

function clearGuestCart() {
  try { sessionStorage.removeItem(GUEST_KEY) } catch { /* noop */ }
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function computeDiscountedPrice(product) {
  const base = Number(product.price || 0)
  const pct  = Number(product.discount_percent || 0)
  const amt  = Number(product.discount_amount  || 0)
  let price = base
  const now = Date.now()
  const startsAt = product.discount_starts_at ? Date.parse(product.discount_starts_at) : null
  const endsAt   = product.discount_ends_at   ? Date.parse(product.discount_ends_at)   : null
  const startsOk = !startsAt || now >= startsAt
  const endsOk   = !endsAt   || now <= endsAt
  if (startsOk && endsOk) {
    if (pct > 0)      price = base * (1 - pct / 100)
    else if (amt > 0) price = Math.max(0, base - amt)
  }
  return Math.round(price * 100) / 100
}

// Convierte la respuesta del backend a la forma agrupada por tienda que usa la UI
function transformBackendItems(items) {
  const grouped = {}
  for (const rec of items || []) {
    const product = rec.expand?.product
    if (!product) continue
    const store = product.expand?.store
    const storeId   = store?.id || (Array.isArray(product.store) ? product.store[0] : product.store)
    if (!storeId) continue
    const storeName = store?.name || ''
    const storeSlug = store?.slug || storeId
    const images = Array.isArray(product.images) ? product.images : (product.images ? [product.images] : [])

    if (!grouped[storeId]) {
      grouped[storeId] = { storeId, storeName, storeSlug, items: [] }
    }

    grouped[storeId].items.push({
      cartItemId: rec.id,
      productId:  product.id,
      name:       product.name,
      price:      Number(rec.price_snapshot ?? product.price ?? 0),
      image:      images[0] || '',
      quantity:   Number(rec.quantity || 0),
      stock:      Number(product.stock || 0),
      storeId,
      storeName,
      storeSlug,
    })
  }
  return grouped
}

// ── Composable ───────────────────────────────────────────────────────────────
export function useCartStore() {
  const { session, isAuthenticated } = useAuthSession()

  function getUserId() {
    return session.value?.userId || null
  }

  function authHeaders() {
    const userId = getUserId()
    if (!userId) return {}
    return { 'x-user-id': userId }
  }

  // ── Hidratación ──────────────────────────────────────────────────────────
  async function hydrateFromBackend() {
    if (!API || !isAuthenticated.value) return
    _loading.value = true
    try {
      const res = await fetch(`${API}/cart`, { headers: authHeaders() })
      if (!res.ok) return
      const data = await res.json()
      cart.value = transformBackendItems(data.items || [])
    } catch (err) {
      console.warn('[cart] hydrate failed:', err.message)
    } finally {
      _loading.value = false
    }
  }

  async function mergeGuestIntoBackend() {
    const guest = loadGuestCart()
    const itemsFlat = []
    for (const store of Object.values(guest)) {
      for (const it of (store.items || [])) {
        if (it.productId && it.quantity > 0) {
          itemsFlat.push({ productId: it.productId, quantity: it.quantity })
        }
      }
    }
    if (!itemsFlat.length) return

    try {
      await fetch(`${API}/cart/merge`, {
        method:  'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body:    JSON.stringify({ items: itemsFlat }),
      })
    } catch (err) {
      console.warn('[cart] merge failed:', err.message)
      return
    }
    clearGuestCart()
  }

  async function init() {
    if (_initialized.value) return
    if (isAuthenticated.value) {
      await mergeGuestIntoBackend()
      await hydrateFromBackend()
    } else {
      cart.value = loadGuestCart()
    }
    _initialized.value = true
  }

  function persistGuest() {
    if (!isAuthenticated.value) saveGuestCart(cart.value)
  }

  // ── Reactividad ante cambio de sesión ────────────────────────────────────
  if (!_watchersAttached) {
    watch(() => session.value?.userId, async (newId, oldId) => {
      if (newId === oldId) return
      _initialized.value = false
      if (newId) {
        await mergeGuestIntoBackend()
        await hydrateFromBackend()
      } else {
        cart.value = loadGuestCart()
      }
      _initialized.value = true
    })
    _watchersAttached = true
  }

  // ── Getters ──────────────────────────────────────────────────────────────
  const totalItemCount = computed(() => {
    let count = 0
    for (const store of Object.values(cart.value)) {
      for (const item of (store.items || [])) count += item.quantity
    }
    return count
  })

  const storesInCart = computed(() => Object.values(cart.value))

  function storeSubtotal(storeId) {
    const store = cart.value[storeId]
    if (!store) return 0
    return store.items.reduce((sum, i) => sum + i.price * i.quantity, 0)
  }

  function itemQuantity(productId) {
    for (const store of Object.values(cart.value)) {
      const found = (store.items || []).find(i => i.productId === productId)
      if (found) return found.quantity
    }
    return 0
  }

  // ── Mutaciones (compartidas) ─────────────────────────────────────────────
  function localUpsert(product, quantity) {
    const storeId   = product.store
    const storeName = product.expand?.store?.name || product.storeName || ''
    const storeSlug = product.expand?.store?.slug || product.storeSlug || storeId
    const price     = computeDiscountedPrice(product)
    const images    = Array.isArray(product.images) ? product.images : (product.images ? [product.images] : [])

    if (!cart.value[storeId]) {
      cart.value[storeId] = { storeId, storeName, storeSlug, items: [] }
    }
    const existing = cart.value[storeId].items.find(i => i.productId === product.id)
    if (existing) {
      existing.quantity = Math.min(existing.quantity + quantity, Number(product.stock || 99))
      existing.price    = price
      existing.stock    = Number(product.stock || existing.stock)
    } else {
      cart.value[storeId].items.push({
        productId: product.id,
        name:      product.name,
        price,
        image:     images[0] || '',
        quantity:  Math.min(quantity, Number(product.stock || 99)),
        stock:     Number(product.stock || 0),
        storeId,
        storeName,
        storeSlug,
      })
    }
  }

  async function addToCart(product, quantity = 1) {
    await init()

    const storeId = product.store
    if (!storeId || typeof storeId !== 'string' || storeId.length < 10) return false
    if (!product.id) return false

    if (isAuthenticated.value) {
      try {
        const res = await fetch(`${API}/cart`, {
          method:  'POST',
          headers: { ...authHeaders(), 'Content-Type': 'application/json' },
          body:    JSON.stringify({ productId: product.id, quantity }),
        })
        if (!res.ok) return false
        await hydrateFromBackend()
        return true
      } catch {
        return false
      }
    }

    // Modo invitado
    localUpsert(product, quantity)
    persistGuest()
    return true
  }

  async function removeFromCart(storeId, productId) {
    await init()

    if (isAuthenticated.value) {
      try {
        await fetch(`${API}/cart/by-product/${productId}`, {
          method:  'DELETE',
          headers: authHeaders(),
        })
      } catch { /* ignorar */ }
      await hydrateFromBackend()
      return
    }

    if (!cart.value[storeId]) return
    cart.value[storeId].items = cart.value[storeId].items.filter(i => i.productId !== productId)
    if (cart.value[storeId].items.length === 0) delete cart.value[storeId]
    persistGuest()
  }

  async function updateQuantity(storeId, productId, quantity) {
    await init()

    if (quantity <= 0) {
      return removeFromCart(storeId, productId)
    }

    if (isAuthenticated.value) {
      // Optimistic update
      const item = cart.value[storeId]?.items.find(i => i.productId === productId)
      if (item) item.quantity = Math.min(quantity, item.stock || 99)

      try {
        await fetch(`${API}/cart/by-product/${productId}`, {
          method:  'PATCH',
          headers: { ...authHeaders(), 'Content-Type': 'application/json' },
          body:    JSON.stringify({ quantity }),
        })
      } catch { /* ignorar */ }
      await hydrateFromBackend()
      return
    }

    if (!cart.value[storeId]) return
    const item = cart.value[storeId].items.find(i => i.productId === productId)
    if (!item) return
    item.quantity = Math.min(quantity, item.stock || 99)
    persistGuest()
  }

  async function clearStoreCart(storeId) {
    await init()

    if (isAuthenticated.value) {
      try {
        await fetch(`${API}/cart/store/${storeId}`, {
          method:  'DELETE',
          headers: authHeaders(),
        })
      } catch { /* ignorar */ }
      await hydrateFromBackend()
      return
    }

    delete cart.value[storeId]
    persistGuest()
  }

  async function clearAllCart() {
    if (isAuthenticated.value) {
      try {
        await fetch(`${API}/cart`, { method: 'DELETE', headers: authHeaders() })
      } catch { /* ignorar */ }
      cart.value = {}
      return
    }
    cart.value = {}
    persistGuest()
  }

  // Compatibilidad con la API previa
  function onSessionChange() {
    _initialized.value = false
    return init()
  }

  // Auto-init (no bloquea; los componentes que necesiten datos pueden await init())
  init()

  return {
    cart,
    loading: _loading,
    totalItemCount,
    storesInCart,
    storeSubtotal,
    itemQuantity,
    init,
    addToCart,
    removeFromCart,
    updateQuantity,
    clearStoreCart,
    clearAllCart,
    onSessionChange,
    refresh: hydrateFromBackend,
  }
}
