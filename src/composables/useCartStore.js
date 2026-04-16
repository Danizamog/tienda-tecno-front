import { ref, computed } from 'vue'
import { useAuthSession } from '@/composables/useAuthSession'

// ── Constantes ────────────────────────────────────────────────────────────────
const CART_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 días

// ── Estado global (reactivo compartido entre todas las instancias) ─────────────
const cart = ref({})         // { [storeId]: { storeId, storeName, storeSlug, items: [...] } }
const _initialized = ref(false)

// ── Helpers de persistencia ────────────────────────────────────────────────────
function storageKey(userId) {
  return userId ? `cart_${userId}` : 'cart_guest'
}

function loadCart(userId) {
  try {
    // Usar sessionStorage en lugar de localStorage para evitar datos corruptos persistentes
    const raw = sessionStorage.getItem(storageKey(userId))
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    const { _savedAt: _, ...stores } = parsed
    return stores
  } catch {
    return {}
  }
}

function saveCart(userId, data) {
  try {
    // Usar sessionStorage en lugar de localStorage
    sessionStorage.setItem(storageKey(userId), JSON.stringify({ ...data, _savedAt: Date.now() }))
  } catch {
    // Silently ignore storage errors
  }
}

// ── Composable ────────────────────────────────────────────────────────────────
export function useCartStore() {
  const { session, isAuthenticated } = useAuthSession()

  function getUserId() {
    return session.value?.userId || null
  }

  function init() {
    if (_initialized.value) return
    cart.value = loadCart(getUserId())
    _initialized.value = true
  }

  // Re-inicializar cuando cambia el usuario
  function reInit() {
    cart.value = loadCart(getUserId())
  }

  function persist() {
    saveCart(getUserId(), cart.value)
  }

  // ── Getters ────────────────────────────────────────────────────────────────

  /** Total de items (sumando cantidades) en todo el carrito */
  const totalItemCount = computed(() => {
    let count = 0
    for (const store of Object.values(cart.value)) {
      for (const item of (store.items || [])) {
        count += item.quantity
      }
    }
    return count
  })

  /** Lista de tiendas que tienen items en el carrito */
  const storesInCart = computed(() => Object.values(cart.value))

  /** Subtotal de una tienda */
  function storeSubtotal(storeId) {
    const store = cart.value[storeId]
    if (!store) return 0
    return store.items.reduce((sum, i) => sum + i.price * i.quantity, 0)
  }

  /** ¿Cuántos de este producto hay en el carrito? */
  function itemQuantity(productId) {
    for (const store of Object.values(cart.value)) {
      const found = (store.items || []).find(i => i.productId === productId)
      if (found) return found.quantity
    }
    return 0
  }

  // ── Mutaciones ─────────────────────────────────────────────────────────────

  /**
   * Agregar un producto al carrito.
   * @param {Object} product  - { id, name, price, images, store (id), expand.store: { name, slug } }
   * @param {number} quantity - cantidad a agregar (default 1)
   */
  function addToCart(product, quantity = 1) {
    init()
    const storeId   = product.store
    
    // Validar que storeId sea válido (no "bad" ni vacío)
    if (!storeId || storeId === 'bad' || typeof storeId !== 'string' || storeId.length < 10) {
      return false
    }
    
    const storeName = product.expand?.store?.name || product.storeName || ''
    const storeSlug = product.expand?.store?.slug || product.storeSlug || storeId

    // Precio final con descuento
    const base  = Number(product.price || 0)
    const pct   = Number(product.discount_percent || 0)
    const amt   = Number(product.discount_amount  || 0)
    let   price = base
    if (pct > 0)      price = base * (1 - pct / 100)
    else if (amt > 0) price = Math.max(0, base - amt)
    price = Math.round(price * 100) / 100

    const images = Array.isArray(product.images) ? product.images : (product.images ? [product.images] : [])

    if (!cart.value[storeId]) {
      cart.value[storeId] = { storeId, storeName, storeSlug, items: [] }
    }

    const existing = cart.value[storeId].items.find(i => i.productId === product.id)
    if (existing) {
      existing.quantity = Math.min(existing.quantity + quantity, Number(product.stock || 99))
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

    persist()
    return true
  }

  function removeFromCart(storeId, productId) {
    init()
    if (!cart.value[storeId]) return
    cart.value[storeId].items = cart.value[storeId].items.filter(i => i.productId !== productId)
    if (cart.value[storeId].items.length === 0) {
      delete cart.value[storeId]
    }
    persist()
  }

  function updateQuantity(storeId, productId, quantity) {
    init()
    if (!cart.value[storeId]) return
    const item = cart.value[storeId].items.find(i => i.productId === productId)
    if (!item) return
    if (quantity <= 0) {
      removeFromCart(storeId, productId)
      return
    }
    item.quantity = Math.min(quantity, item.stock || 99)
    persist()
  }

  function clearStoreCart(storeId) {
    init()
    delete cart.value[storeId]
    persist()
  }

  function clearAllCart() {
    cart.value = {}
    persist()
  }

  // Limpiar carrito de usuario anterior cuando se cambia la sesión
  function onSessionChange() {
    reInit()
  }

  init()

  return {
    cart,
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
  }
}
