<script setup>
import { onMounted, ref } from 'vue'
import AppNavbar from '@/components/AppNavbar.vue'
import AppFooter from '@/components/AppFooter.vue'
import GoogleMapPicker from '@/components/GoogleMapPicker.vue'
import { useShippingAddressApi } from '@/composables/useShippingAddressApi'
import { useReviewsApi } from '@/composables/useReviewsApi'
import { useAuthSession } from '@/composables/useAuthSession'

const { listAddresses, createAddress, deleteAddress, updateAddress } = useShippingAddressApi()
const { fetchMyReviews, createReview, deleteReview, checkExistingReview } = useReviewsApi()
const { session } = useAuthSession()

const API = (import.meta.env.VITE_GATEWAY_API_BASE_URL || '/api').replace(/\/$/, '')
const PB  = (import.meta.env.VITE_POCKETBASE_URL || '').replace(/\/$/, '')

// ── Tabs ──────────────────────────────────────────────────────────────────────
const activeTab = ref('addresses') // 'addresses' | 'reviews'

// ── Addresses ─────────────────────────────────────────────────────────────────
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const success = ref('')
const addresses = ref([])
const editingId = ref('')
const editSaving = ref(false)
const BOLIVIA_CITIES = [
  'La Paz',
  'Cochabamba',
  'Santa Cruz',
  'Oruro',
  'Potosi',
  'Chuquisaca',
  'Tarija',
  'Beni',
  'Pando',
]

const form = ref({
  label: '',
  recipient_name: '',
  phone: '',
  address_line_1: '',
  address_line_2: '',
  city: '',
  state: '',
  country: 'Bolivia',
  address: null,
  is_default: false,
})

const editForm = ref({
  label: '',
  recipient_name: '',
  phone: '',
  address_line_1: '',
  address_line_2: '',
  city: '',
  state: '',
  country: 'Bolivia',
  address: null,
  is_default: false,
})

function toNumberOrNull(value) {
  if (value === '' || value === null || value === undefined) return null
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

function isValidLatLng(lat, lng) {
  return lat != null && lng != null && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
}

function extractGeoPoint(value) {
  if (!value) return { lat: null, lng: null }
  if (Array.isArray(value)) {
    const lat = toNumberOrNull(value[0])
    const lng = toNumberOrNull(value[1])
    return { lat, lng }
  }
  const lat = toNumberOrNull(value.lat ?? value.latitude)
  const lng = toNumberOrNull(value.lng ?? value.lon ?? value.longitude)
  return { lat, lng }
}

function resetForm() {
  form.value = {
    label: '',
    recipient_name: '',
    phone: '',
    address_line_1: '',
    address_line_2: '',
    city: '',
    state: '',
    country: 'Bolivia',
    address: null,
    is_default: false,
  }
}

function beginEdit(address) {
  editingId.value = address.id
  editForm.value = {
    label: address.label || '',
    recipient_name: address.recipient_name || '',
    phone: address.phone || '',
    address_line_1: address.address_line_1 || address.line1 || '',
    address_line_2: address.address_line_2 || address.line2 || '',
    city: address.city || '',
    state: address.state || '',
    country: address.country || 'Bolivia',
    address: extractGeoPoint(address.address),
    is_default: Boolean(address.is_default),
  }
}

function cancelEdit() {
  editingId.value = ''
}

async function loadAddresses() {
  loading.value = true
  error.value = ''
  try {
    addresses.value = await listAddresses()
  } catch (err) {
    error.value = err.message || 'No se pudieron cargar tus direcciones.'
  } finally {
    loading.value = false
  }
}

async function saveAddress() {
  const missing = []
  if (!form.value.recipient_name) missing.push('nombre')
  if (!form.value.phone) missing.push('telefono')
  if (!form.value.address_line_1) missing.push('linea 1')
  if (!form.value.city) missing.push('ciudad')
  if (missing.length) {
    error.value = `Completa los campos requeridos: ${missing.join(', ')}.`
    return
  }

  if (!BOLIVIA_CITIES.includes(form.value.city)) {
    error.value = 'Selecciona una ciudad valida de Bolivia.'
    return
  }

  const point = extractGeoPoint(form.value.address)
  if (!isValidLatLng(point.lat, point.lng)) {
    error.value = 'Selecciona un punto en el mapa.'
    return
  }

  saving.value = true
  error.value = ''
  success.value = ''
  try {
    await createAddress({
      ...form.value,
      address: { lat: point.lat, lng: point.lng },
    })
    success.value = 'Direccion guardada correctamente.'
    resetForm()
    await loadAddresses()
  } catch (err) {
    error.value = err.message || 'No se pudo guardar la direccion.'
  } finally {
    saving.value = false
  }
}

async function setAsDefault(address) {
  if (!address?.id) return
  try {
    await updateAddress(address.id, { is_default: true })
    await loadAddresses()
  } catch (err) {
    error.value = err.message || 'No se pudo actualizar la direccion.'
  }
}

async function removeAddress(address) {
  if (!address?.id) return
  try {
    await deleteAddress(address.id)
    await loadAddresses()
  } catch (err) {
    error.value = err.message || 'No se pudo eliminar la direccion.'
  }
}

async function saveEditedAddress(addressId) {
  const missing = []
  if (!editForm.value.recipient_name) missing.push('nombre')
  if (!editForm.value.phone) missing.push('telefono')
  if (!editForm.value.address_line_1) missing.push('linea 1')
  if (!editForm.value.city) missing.push('ciudad')
  if (missing.length) {
    error.value = `Completa los campos requeridos: ${missing.join(', ')}.`
    return
  }

  if (!BOLIVIA_CITIES.includes(editForm.value.city)) {
    error.value = 'Selecciona una ciudad valida de Bolivia.'
    return
  }

  const point = extractGeoPoint(editForm.value.address)
  if (!isValidLatLng(point.lat, point.lng)) {
    error.value = 'Selecciona un punto en el mapa.'
    return
  }

  editSaving.value = true
  error.value = ''
  success.value = ''
  try {
    await updateAddress(addressId, {
      ...editForm.value,
      address: { lat: point.lat, lng: point.lng },
    })
    success.value = 'Direccion actualizada correctamente.'
    editingId.value = ''
    await loadAddresses()
  } catch (err) {
    error.value = err.message || 'No se pudo actualizar la direccion.'
  } finally {
    editSaving.value = false
  }
}

// ── Reviews ───────────────────────────────────────────────────────────────────
const reviewsLoading     = ref(false)
const reviewsError       = ref('')
const myReviews          = ref([])
const myReviewsTotal     = ref(0)

const pendingLoading     = ref(false)
const pendingError       = ref('')
// Items de pedidos entregados sin reseña: [{ order, item, productId }]
const pendingItems       = ref([])

// Mapa productId → true si ya fue reseñado en esta sesión
const reviewedMap        = ref({})

const reviewSection      = ref('pending') // 'pending' | 'written'

function fmt(n) { return Number(n || 0).toLocaleString('es-CL') }
function fmtDate(d) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function productImgUrl(productId, filename) {
  if (!filename || !productId) return ''
  return `${PB}/api/files/products/${productId}/${filename}?thumb=100x100`
}

function starLabel(r) {
  return ['', 'Muy malo', 'Malo', 'Regular', 'Bueno', 'Excelente'][r] || ''
}

async function loadMyReviews() {
  reviewsLoading.value = true
  reviewsError.value   = ''
  try {
    const data       = await fetchMyReviews({ perPage: 50 })
    myReviews.value  = data.items || []
    myReviewsTotal.value = data.total || 0
  } catch (e) {
    reviewsError.value = e.message || 'Error al cargar tus reseñas'
  } finally {
    reviewsLoading.value = false
  }
}

async function loadPendingReviews() {
  pendingLoading.value = true
  pendingError.value   = ''
  try {
    const res = await fetch(`${API}/orders/buyer/my?status=delivered&perPage=50&page=1`, {
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id':   session.value?.userId || '',
        'X-User-Role': session.value?.role   || 'user',
      },
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) { pendingError.value = data?.error || `Error ${res.status}`; return }

    const deliveredOrders = data?.items || []
    const candidates = []

    for (const order of deliveredOrders) {
      for (const item of (order.items || [])) {
        const productId = item.product || item.expand?.product?.id
        if (!productId) continue
        const key = `${order.id}:${productId}`
        // Verificar contra mapa local primero
        if (reviewedMap.value[key]) continue
        // Verificar en la API
        try {
          const result = await checkExistingReview({ productId })
          reviewedMap.value[key] = result.hasReview
          if (!result.hasReview) {
            candidates.push({ order, item, productId, key })
          }
        } catch {
          candidates.push({ order, item, productId, key })
        }
      }
    }

    pendingItems.value = candidates
  } catch (e) {
    pendingError.value = e.message || 'No se pudo cargar los pedidos entregados.'
  } finally {
    pendingLoading.value = false
  }
}

async function loadReviewsTab() {
  await Promise.all([loadMyReviews(), loadPendingReviews()])
}

async function handleDeleteReview(reviewId) {
  const result = await deleteReview(reviewId)
  if (result.ok) {
    myReviews.value = myReviews.value.filter(r => r.id !== reviewId)
    myReviewsTotal.value = Math.max(0, myReviewsTotal.value - 1)
    // Recalcular pendientes
    await loadPendingReviews()
  }
}

// ── Modal de reseña ───────────────────────────────────────────────────────────
const reviewModal = ref({
  open:      false,
  orderId:   '',
  productId: '',
  storeId:   '',
  productName: '',
  key:         '',
  rating:    0,
  title:     '',
  comment:   '',
  loading:   false,
  error:     '',
  success:   false,
})

function openReviewModal(order, item, productId, key) {
  const storeId = order.store || order.expand?.store?.id
  reviewModal.value = {
    open:        true,
    orderId:     order.id,
    productId,
    storeId:     storeId || '',
    productName: item.expand?.product?.name || 'Producto',
    key,
    rating:      0,
    title:       '',
    comment:     '',
    loading:     false,
    error:       '',
    success:     false,
  }
}

function closeReviewModal() {
  reviewModal.value.open = false
}

function setRating(r) {
  reviewModal.value.rating = r
}

async function submitReview() {
  const m = reviewModal.value
  if (!m.rating) { m.error = 'Selecciona una puntuacion'; return }

  m.loading = true
  m.error   = ''
  try {
    const result = await createReview({
      productId: m.productId,
      storeId:   m.storeId,
      orderId:   m.orderId,
      rating:    m.rating,
      title:     m.title,
      comment:   m.comment,
    })

    if (!result.ok) {
      m.error = result.message || result.error || 'Error al enviar resena'
      return
    }

    m.success = true
    reviewedMap.value[m.key] = true
    pendingItems.value = pendingItems.value.filter(p => p.key !== m.key)
    setTimeout(async () => {
      closeReviewModal()
      await loadMyReviews()
    }, 1600)
  } catch (e) {
    m.error = e.message || 'Error al enviar resena'
  } finally {
    m.loading = false
  }
}

onMounted(loadAddresses)
</script>

<template>
  <AppNavbar />

  <main class="min-h-screen bg-[#0b0b0b] text-[#ebe7df] pt-8 pb-16">
    <section class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">

      <!-- Header -->
      <header class="mb-6 border-b border-[#1a1a1a] pb-4">
        <p class="text-[10px] tracking-[0.25em] uppercase text-[#c9a96e]">Perfil</p>
        <h1 class="text-2xl sm:text-3xl font-light mt-2">Mi cuenta</h1>
      </header>

      <!-- Tabs -->
      <div class="flex gap-1 mb-8 border-b border-[#1a1a1a]">
        <button
          @click="activeTab = 'addresses'"
          :class="['px-5 py-2.5 text-[11px] tracking-[0.15em] uppercase transition-colors border-b-2 -mb-px', activeTab === 'addresses' ? 'border-[#c9a96e] text-[#c9a96e]' : 'border-transparent text-[#6b6660] hover:text-[#a09a92]']"
        >
          Direcciones
        </button>
        <button
          @click="activeTab = 'reviews'; loadReviewsTab()"
          :class="['px-5 py-2.5 text-[11px] tracking-[0.15em] uppercase transition-colors border-b-2 -mb-px', activeTab === 'reviews' ? 'border-[#c9a96e] text-[#c9a96e]' : 'border-transparent text-[#6b6660] hover:text-[#a09a92]']"
        >
          Resenas
        </button>
      </div>

      <!-- ── TAB: DIRECCIONES ─────────────────────────────────────────────────── -->
      <template v-if="activeTab === 'addresses'">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <article class="border border-[#1c1c1c] bg-[#0f0f0f] p-4 sm:p-5">
            <h2 class="text-sm tracking-[0.16em] uppercase text-[#c9a96e] mb-4">Agregar direccion</h2>

            <div class="space-y-3">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input v-model="form.label" type="text" placeholder="Etiqueta (Casa, Oficina)" class="field" />
                <input v-model="form.recipient_name" type="text" placeholder="Nombre del receptor *" class="field" />
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input v-model="form.phone" type="text" placeholder="Telefono *" class="field" />
                <select v-model="form.city" class="field">
                  <option value="">Ciudad *</option>
                  <option v-for="city in BOLIVIA_CITIES" :key="city" :value="city">{{ city }}</option>
                </select>
              </div>
              <input v-model="form.address_line_1" type="text" placeholder="Linea 1 de direccion *" class="field" />
              <input v-model="form.address_line_2" type="text" placeholder="Linea 2 de direccion (referencia)" class="field" />
              <input v-model="form.state" type="text" placeholder="Estado/Provincia" class="field" />
              <input v-model="form.country" type="text" placeholder="Pais" class="field" />
              <GoogleMapPicker v-model="form.address" height-class="h-72" />
              <p class="text-[11px] text-[#8f8a82]">Selecciona el punto de entrega directamente en el mapa.</p>
              <label class="inline-flex items-center gap-2 text-xs text-[#a8a39b]">
                <input v-model="form.is_default" type="checkbox" class="accent-[#c9a96e]" />
                Guardar como direccion predeterminada
              </label>
              <button :disabled="saving" class="btn" @click="saveAddress">
                {{ saving ? 'Guardando...' : 'Guardar direccion' }}
              </button>
            </div>
          </article>

          <article class="border border-[#1c1c1c] bg-[#0f0f0f] p-4 sm:p-5">
            <h2 class="text-sm tracking-[0.16em] uppercase text-[#c9a96e] mb-4">Mis direcciones</h2>

            <p v-if="loading" class="text-sm text-[#8f8a82]">Cargando...</p>

            <div v-else-if="addresses.length === 0" class="text-sm text-[#8f8a82]">
              Aun no tienes direcciones guardadas.
            </div>

            <div v-else class="space-y-3">
              <div v-for="address in addresses" :key="address.id" class="border border-[#232323] p-3 bg-[#0b0b0b]">
                <template v-if="editingId === address.id">
                  <div class="space-y-2">
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input v-model="editForm.label" type="text" placeholder="Etiqueta" class="field" />
                      <input v-model="editForm.recipient_name" type="text" placeholder="Nombre del receptor *" class="field" />
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input v-model="editForm.phone" type="text" placeholder="Telefono *" class="field" />
                      <select v-model="editForm.city" class="field">
                        <option value="">Ciudad *</option>
                        <option v-for="city in BOLIVIA_CITIES" :key="city" :value="city">{{ city }}</option>
                      </select>
                    </div>
                    <input v-model="editForm.address_line_1" type="text" placeholder="Linea 1 de direccion *" class="field" />
                    <input v-model="editForm.address_line_2" type="text" placeholder="Linea 2 de direccion (referencia)" class="field" />
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input v-model="editForm.state" type="text" placeholder="Estado/Provincia" class="field" />
                      <input v-model="editForm.country" type="text" placeholder="Pais" class="field" />
                    </div>
                    <GoogleMapPicker v-model="editForm.address" height-class="h-56" />
                    <div class="flex gap-2">
                      <button class="mini-btn" :disabled="editSaving" @click="saveEditedAddress(address.id)">
                        {{ editSaving ? 'Guardando...' : 'Guardar cambios' }}
                      </button>
                      <button class="mini-btn" @click="cancelEdit">Cancelar</button>
                    </div>
                  </div>
                </template>
                <div v-else class="flex items-start justify-between gap-3">
                  <div>
                    <p class="text-sm text-[#efe9dc]">
                      {{ address.label || 'Direccion' }}
                      <span v-if="address.is_default" class="ml-2 text-[10px] text-[#c9a96e]">Predeterminada</span>
                    </p>
                    <p class="text-xs text-[#b9b3a9] mt-1">{{ address.recipient_name }}</p>
                    <p class="text-xs text-[#9a958d] mt-1">
                      {{ address.address_line_1 || address.line1 }}
                      <span v-if="address.address_line_2 || address.line2">, {{ address.address_line_2 || address.line2 }}</span>
                      , {{ address.city }}
                    </p>
                    <p v-if="address.phone" class="text-xs text-[#88837b] mt-1">Tel: {{ address.phone }}</p>
                  </div>
                  <div class="flex flex-col gap-2">
                    <button v-if="!address.is_default" class="mini-btn" @click="setAsDefault(address)">Predeterminada</button>
                    <button class="mini-btn" @click="beginEdit(address)">Editar</button>
                    <button class="mini-btn mini-btn-danger" @click="removeAddress(address)">Eliminar</button>
                  </div>
                </div>
              </div>
            </div>
          </article>
        </div>

        <div v-if="error" class="mt-4 border border-red-900/40 bg-red-900/20 px-3 py-2 text-sm text-red-300">{{ error }}</div>
        <div v-if="success" class="mt-4 border border-emerald-900/40 bg-emerald-900/20 px-3 py-2 text-sm text-emerald-300">{{ success }}</div>
      </template>

      <!-- ── TAB: RESENAS ────────────────────────────────────────────────────── -->
      <template v-if="activeTab === 'reviews'">

        <!-- Sub-tabs -->
        <div class="flex gap-6 mb-6">
          <button
            @click="reviewSection = 'pending'"
            :class="['text-[11px] tracking-[0.15em] uppercase pb-1 border-b transition-colors', reviewSection === 'pending' ? 'border-[#c9a96e] text-[#c9a96e]' : 'border-transparent text-[#555550] hover:text-[#888]']"
          >
            Pendientes de resenar
            <span v-if="pendingItems.length" class="ml-1.5 text-[9px] bg-[#c9a96e20] border border-[#c9a96e44] text-[#c9a96e] px-1.5 py-0.5">
              {{ pendingItems.length }}
            </span>
          </button>
          <button
            @click="reviewSection = 'written'"
            :class="['text-[11px] tracking-[0.15em] uppercase pb-1 border-b transition-colors', reviewSection === 'written' ? 'border-[#c9a96e] text-[#c9a96e]' : 'border-transparent text-[#555550] hover:text-[#888]']"
          >
            Mis resenas
            <span v-if="myReviewsTotal" class="ml-1.5 text-[9px] bg-[#1a1a1a] border border-[#222] text-[#888] px-1.5 py-0.5">
              {{ myReviewsTotal }}
            </span>
          </button>
        </div>

        <!-- ── Pendientes ─────────────────────────────────────────────────── -->
        <div v-if="reviewSection === 'pending'">
          <p v-if="pendingLoading" class="text-sm text-[#555550]">Cargando pedidos entregados...</p>

          <p v-else-if="pendingError" class="text-sm text-red-400">{{ pendingError }}</p>

          <div v-else-if="pendingItems.length === 0" class="flex flex-col items-center py-16 gap-3 text-center">
            <svg class="w-12 h-12 text-[#1e1b16]" fill="none" stroke="currentColor" stroke-width="1" viewBox="0 0 24 24">
              <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <p class="text-[#3a3835] text-sm">Sin productos pendientes de resenar</p>
            <p class="text-[10px] tracking-widest uppercase text-[#252520]">Todos tus productos entregados ya tienen resena</p>
          </div>

          <div v-else class="flex flex-col gap-3">
            <div
              v-for="pending in pendingItems"
              :key="pending.key"
              class="flex items-center gap-4 border border-[#1a1a1a] bg-[#0c0c0c] p-4"
            >
              <!-- Imagen -->
              <div class="w-14 h-14 shrink-0 bg-[#0f0f0f] border border-[#1a1a1a] overflow-hidden">
                <img
                  v-if="pending.item.expand?.product?.images?.length"
                  :src="productImgUrl(pending.productId, Array.isArray(pending.item.expand.product.images) ? pending.item.expand.product.images[0] : pending.item.expand.product.images)"
                  :alt="pending.item.expand?.product?.name"
                  class="w-full h-full object-cover"
                />
                <div v-else class="w-full h-full flex items-center justify-center">
                  <svg class="w-5 h-5 text-[#1e1b16]" fill="none" stroke="currentColor" stroke-width="1" viewBox="0 0 24 24">
                    <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </div>
              </div>

              <!-- Info -->
              <div class="flex-1 min-w-0">
                <p class="text-sm text-[#d8d4ce] truncate">{{ pending.item.expand?.product?.name || 'Producto' }}</p>
                <p class="text-[10px] text-[#555550] mt-0.5">
                  Pedido #{{ pending.order.id?.slice(0, 8) }} · {{ fmtDate(pending.order.created) }}
                </p>
                <p class="text-[10px] text-[#3a3835] mt-0.5">
                  {{ pending.order.expand?.store?.name || pending.order.store }}
                </p>
              </div>

              <!-- Accion -->
              <button
                @click="openReviewModal(pending.order, pending.item, pending.productId, pending.key)"
                class="shrink-0 inline-flex items-center gap-1.5 px-3 h-8 text-[10px] tracking-[0.12em] uppercase border border-[#c9a96e44] text-[#c9a96e] hover:bg-[#c9a96e15] transition-colors"
              >
                <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                Resenar
              </button>
            </div>
          </div>
        </div>

        <!-- ── Mis resenas ─────────────────────────────────────────────────── -->
        <div v-if="reviewSection === 'written'">
          <p v-if="reviewsLoading" class="text-sm text-[#555550]">Cargando tus resenas...</p>

          <p v-else-if="reviewsError" class="text-sm text-red-400">{{ reviewsError }}</p>

          <div v-else-if="myReviews.length === 0" class="flex flex-col items-center py-16 gap-3 text-center">
            <svg class="w-12 h-12 text-[#1e1b16]" fill="none" stroke="currentColor" stroke-width="1" viewBox="0 0 24 24">
              <path d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <p class="text-[#3a3835] text-sm">Aun no has escrito ninguna resena</p>
          </div>

          <div v-else class="flex flex-col gap-3">
            <div
              v-for="review in myReviews"
              :key="review.id"
              class="border border-[#1a1a1a] bg-[#0c0c0c] p-4"
            >
              <div class="flex items-start gap-4">
                <!-- Imagen producto -->
                <div class="w-12 h-12 shrink-0 bg-[#0f0f0f] border border-[#1a1a1a] overflow-hidden">
                  <img
                    v-if="review.expand?.product?.images?.length"
                    :src="productImgUrl(review.product, Array.isArray(review.expand.product.images) ? review.expand.product.images[0] : review.expand.product.images)"
                    :alt="review.expand?.product?.name"
                    class="w-full h-full object-cover"
                  />
                  <div v-else class="w-full h-full flex items-center justify-center">
                    <svg class="w-4 h-4 text-[#1e1b16]" fill="none" stroke="currentColor" stroke-width="1" viewBox="0 0 24 24">
                      <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  </div>
                </div>

                <!-- Contenido -->
                <div class="flex-1 min-w-0">
                  <div class="flex items-center justify-between gap-3 flex-wrap">
                    <p class="text-sm text-[#d8d4ce] truncate">{{ review.expand?.product?.name || 'Producto' }}</p>
                    <span class="text-[10px] text-[#3a3835]">{{ fmtDate(review.created) }}</span>
                  </div>

                  <!-- Estrellas -->
                  <div class="flex items-center gap-0.5 mt-1.5">
                    <svg
                      v-for="s in 5"
                      :key="s"
                      class="w-3.5 h-3.5"
                      :class="s <= review.rating ? 'text-[#c9a96e]' : 'text-[#1e1b16]'"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"/>
                    </svg>
                    <span class="ml-1.5 text-[10px] text-[#888880]">{{ starLabel(review.rating) }}</span>
                    <span v-if="review.verified_purchase" class="ml-2 text-[9px] text-teal-500/60 border border-teal-800/20 bg-teal-900/10 px-1.5 py-0.5">
                      Compra verificada
                    </span>
                  </div>

                  <p v-if="review.title" class="text-xs text-[#c8c4be] font-medium mt-2">{{ review.title }}</p>
                  <p v-if="review.comment" class="text-[11px] text-[#888880] mt-1 leading-relaxed">{{ review.comment }}</p>

                  <p v-if="review.expand?.store?.name" class="text-[10px] text-[#3a3835] mt-2">
                    Tienda: {{ review.expand.store.name }}
                  </p>
                </div>

                <!-- Eliminar -->
                <button
                  @click="handleDeleteReview(review.id)"
                  class="shrink-0 p-1.5 text-[#333330] hover:text-red-400 transition-colors"
                  title="Eliminar resena"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
                    <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>

      </template>
    </section>
  </main>

  <!-- ── Modal de resena ────────────────────────────────────────────────────── -->
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="reviewModal.open"
        class="fixed inset-0 z-50 flex items-center justify-center p-4"
        @click.self="closeReviewModal"
      >
        <div class="absolute inset-0 bg-black/80 backdrop-blur-sm" @click="closeReviewModal" />

        <div class="relative w-full max-w-md bg-[#0d0d0d] border border-[#1e1e1e] overflow-hidden">
          <!-- Header modal -->
          <div class="flex items-center justify-between px-6 py-4 border-b border-[#141414]">
            <div>
              <h2 class="text-sm font-medium text-[#d8d4ce]">Escribir resena</h2>
              <p class="text-[10px] text-[#555550] mt-0.5 truncate max-w-70">{{ reviewModal.productName }}</p>
            </div>
            <button @click="closeReviewModal" class="text-[#333330] hover:text-[#c9a96e] transition-colors p-1">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path d="M6 18L18 6M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </div>

          <!-- Exito -->
          <div v-if="reviewModal.success" class="px-6 py-12 flex flex-col items-center gap-3">
            <div class="w-12 h-12 rounded-full bg-teal-900/30 border border-teal-700/40 flex items-center justify-center">
              <svg class="w-6 h-6 text-teal-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
            <p class="text-sm text-[#d8d4ce] font-medium">Resena enviada!</p>
            <p class="text-[11px] text-[#555550]">Gracias por tu opinion</p>
          </div>

          <!-- Formulario -->
          <div v-else class="px-6 py-5 flex flex-col gap-5">
            <!-- Estrellas -->
            <div>
              <p class="text-[10px] tracking-[0.15em] uppercase text-[#555550] mb-2">Puntuacion</p>
              <div class="flex items-center gap-1">
                <button
                  v-for="star in 5"
                  :key="star"
                  @click="setRating(star)"
                  class="transition-transform hover:scale-110"
                >
                  <svg
                    class="w-7 h-7 transition-colors"
                    :class="star <= reviewModal.rating ? 'text-[#c9a96e]' : 'text-[#2a2520]'"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"/>
                  </svg>
                </button>
                <span class="ml-2 text-[11px] text-[#555550]">
                  {{ starLabel(reviewModal.rating) }}
                </span>
              </div>
            </div>

            <!-- Titulo -->
            <div>
              <label class="block text-[10px] tracking-[0.15em] uppercase text-[#555550] mb-1.5">
                Titulo <span class="text-[#333330]">(opcional)</span>
              </label>
              <input
                v-model="reviewModal.title"
                type="text"
                maxlength="100"
                placeholder="Resume tu experiencia"
                class="w-full h-9 px-3 bg-[#0a0a0a] border border-[#1e1e1e] text-[13px] text-[#c8c4be] placeholder-[#2a2520] focus:outline-none focus:border-[#c9a96e44] transition-colors"
              />
            </div>

            <!-- Comentario -->
            <div>
              <label class="block text-[10px] tracking-[0.15em] uppercase text-[#555550] mb-1.5">
                Comentario <span class="text-[#333330]">(opcional)</span>
              </label>
              <textarea
                v-model="reviewModal.comment"
                rows="4"
                placeholder="Comparte los detalles de tu experiencia con este producto..."
                class="w-full px-3 py-2.5 bg-[#0a0a0a] border border-[#1e1e1e] text-[13px] text-[#c8c4be] placeholder-[#2a2520] focus:outline-none focus:border-[#c9a96e44] transition-colors resize-none"
              />
            </div>

            <!-- Error -->
            <p v-if="reviewModal.error" class="text-[11px] text-red-400">{{ reviewModal.error }}</p>

            <!-- Acciones -->
            <div class="flex gap-3 pt-1">
              <button
                @click="closeReviewModal"
                class="flex-1 h-10 text-[10px] tracking-[0.15em] uppercase border border-[#1e1e1e] text-[#555] hover:border-[#333] hover:text-[#888] transition-colors"
              >
                Cancelar
              </button>
              <button
                @click="submitReview"
                :disabled="reviewModal.loading || !reviewModal.rating"
                class="flex-1 h-10 text-[10px] tracking-[0.15em] uppercase bg-[#c9a96e15] border border-[#c9a96e44] text-[#c9a96e] hover:bg-[#c9a96e25] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {{ reviewModal.loading ? 'Enviando...' : 'Publicar resena' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

  <AppFooter />
</template>

<style scoped>
.field {
  width: 100%;
  background: #0b0b0b;
  border: 1px solid #1f1f1f;
  color: #d8d4ce;
  font-size: 12px;
  padding: 0 10px;
  height: 34px;
}

.field:focus {
  outline: none;
  border-color: #c9a96e66;
}

.btn {
  width: 100%;
  height: 36px;
  border: 1px solid #c9a96e66;
  background: #c9a96e1f;
  color: #d8be8c;
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.mini-btn {
  border: 1px solid #2b2b2b;
  background: #111;
  color: #c4bcae;
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  padding: 6px 8px;
}

.mini-btn-danger {
  border-color: #492323;
  color: #e69f9f;
}

.modal-enter-active,
.modal-leave-active { transition: opacity 0.2s ease; }
.modal-enter-from,
.modal-leave-to    { opacity: 0; }
</style>
