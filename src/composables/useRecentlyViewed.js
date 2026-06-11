import { ref, computed } from 'vue'

const PB = (import.meta.env.VITE_POCKETBASE_URL || '').replace(/\/$/, '')

const STORAGE_KEY = 'recently_viewed'
const MAX_RECENT  = 12

// ── Estado singleton (compartido entre todas las instancias del composable) ───
const recentItems = ref(loadFromStorage())

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.slice(0, MAX_RECENT) : []
  } catch {
    return []
  }
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(recentItems.value))
  } catch { /* noop */ }
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function productImageUrl(product) {
  const imgs = Array.isArray(product.images) ? product.images : (product.images ? [product.images] : [])
  if (!imgs[0] || !product.id) return ''
  return `${PB}/api/files/products/${product.id}/${imgs[0]}?thumb=300x300`
}

function computePricing(product) {
  const base = Number(product.price || 0)
  const pct  = Number(product.discount_percent || 0)
  const amt  = Number(product.discount_amount  || 0)
  let final = base
  let label = ''
  if (pct > 0)      { final = base * (1 - pct / 100); label = `-${pct}%` }
  else if (amt > 0) { final = Math.max(0, base - amt); label = `-$${amt.toLocaleString('es-CL')}` }
  return { final: Math.round(final * 100) / 100, label: final < base ? label : '' }
}

function toSnapshot(product) {
  const pricing = computePricing(product)
  return {
    id:            product.id,
    name:          product.name || '',
    image:         product._imageUrl || productImageUrl(product),
    price:         Number(product.price || 0),
    finalPrice:    pricing.final,
    discountLabel: pricing.label,
    storeName:     product.expand?.store?.name || product.storeName || '',
    categoryName:  product.expand?.category?.name || product.categoryName || '',
    viewedAt:      Date.now(),
  }
}

// ── Composable ───────────────────────────────────────────────────────────────
export function useRecentlyViewed() {
  function recordView(product) {
    if (!product?.id) return
    const rest = recentItems.value.filter(p => p.id !== product.id)
    recentItems.value = [toSnapshot(product), ...rest].slice(0, MAX_RECENT)
    persist()
  }

  function recentProducts(excludeId = null) {
    if (!excludeId) return recentItems.value
    return recentItems.value.filter(p => p.id !== excludeId)
  }

  function clearRecent() {
    recentItems.value = []
    persist()
  }

  const totalRecentCount = computed(() => recentItems.value.length)

  return {
    recentItems,
    totalRecentCount,
    recordView,
    recentProducts,
    clearRecent,
  }
}
