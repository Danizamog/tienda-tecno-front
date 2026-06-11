import { ref, computed } from 'vue'

const PB = (import.meta.env.VITE_POCKETBASE_URL || '').replace(/\/$/, '')

const STORAGE_KEY = 'compare_products'
const MAX_COMPARE = 4

// ── Estado singleton (compartido entre todas las instancias del composable) ───
const compareItems = ref(loadFromStorage())

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.slice(0, MAX_COMPARE) : []
  } catch {
    return []
  }
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(compareItems.value))
  } catch { /* noop */ }
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function productImageUrl(product) {
  const imgs = Array.isArray(product.images) ? product.images : (product.images ? [product.images] : [])
  if (!imgs[0] || !product.id) return ''
  return `${PB}/api/files/products/${product.id}/${imgs[0]}?thumb=300x300`
}

function computeFinalPrice(product) {
  const base = Number(product.price || 0)
  const pct  = Number(product.discount_percent || 0)
  const amt  = Number(product.discount_amount  || 0)
  let final = base
  if (pct > 0)      final = base * (1 - pct / 100)
  else if (amt > 0) final = Math.max(0, base - amt)
  return Math.round(final * 100) / 100
}

// Snapshot ligero: suficiente para la barra flotante sin refetch
function toSnapshot(product) {
  return {
    id:         product.id,
    name:       product.name || '',
    image:      product._imageUrl || productImageUrl(product),
    price:      Number(product.price || 0),
    finalPrice: computeFinalPrice(product),
    storeName:  product.expand?.store?.name || product.storeName || '',
  }
}

// ── Composable ───────────────────────────────────────────────────────────────
export function useCompareStore() {
  function isInCompare(productId) {
    return compareItems.value.some(p => p.id === productId)
  }

  function addToCompare(product) {
    if (!product?.id) return { ok: false, error: 'invalid_product' }
    if (isInCompare(product.id)) return { ok: false, error: 'already_in_compare' }
    if (compareItems.value.length >= MAX_COMPARE) {
      return { ok: false, error: 'limit_reached' }
    }
    compareItems.value = [...compareItems.value, toSnapshot(product)]
    persist()
    return { ok: true }
  }

  function removeFromCompare(productId) {
    compareItems.value = compareItems.value.filter(p => p.id !== productId)
    persist()
  }

  function toggleCompare(product) {
    if (!product?.id) return { ok: false, error: 'invalid_product' }
    if (isInCompare(product.id)) {
      removeFromCompare(product.id)
      return { ok: true, removed: true }
    }
    return addToCompare(product)
  }

  function clearCompare() {
    compareItems.value = []
    persist()
  }

  const totalCompareCount = computed(() => compareItems.value.length)
  const canAddMore        = computed(() => compareItems.value.length < MAX_COMPARE)

  return {
    compareItems,
    totalCompareCount,
    canAddMore,
    maxCompare: MAX_COMPARE,
    isInCompare,
    addToCompare,
    removeFromCompare,
    toggleCompare,
    clearCompare,
  }
}
