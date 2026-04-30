<script setup>
import { ref, computed } from 'vue'
import { useCartStore } from '@/composables/useCartStore'
import { useAuthSession } from '@/composables/useAuthSession'
import { useShippingAddressApi } from '@/composables/useShippingAddressApi'
import { useGiftcardApi } from '@/composables/useGiftcardApi'
import GoogleMapPicker from '@/components/ui/GoogleMapPicker.vue'
import { useRouter } from 'vue-router'

const props = defineProps({
  open: { type: Boolean, default: false },
})
const emit = defineEmits(['close'])

const router = useRouter()
const { cart, storesInCart, storeSubtotal, totalItemCount, removeFromCart, updateQuantity, clearStoreCart, init: initCart } = useCartStore()
const { isAuthenticated, session } = useAuthSession()
const { listAddresses, createAddress } = useShippingAddressApi()
const { listMyGiftcards, validateCode } = useGiftcardApi()

const API = (import.meta.env.VITE_GATEWAY_API_BASE_URL || '').replace(/\/$/, '')
const PB  = (import.meta.env.VITE_POCKETBASE_URL || '').replace(/\/$/, '')

// ── Estado de checkout ────────────────────────────────────────────────────────
const checkoutStoreId  = ref(null)
const checkoutLoading  = ref(false)
const checkoutError    = ref('')
const checkoutSuccess  = ref('')
const notes            = ref('')
const addresses        = ref([])
const BOLIVIA_CITIES = [
  'La Paz', 'Cochabamba', 'Santa Cruz', 'Oruro', 'Potosi',
  'Chuquisaca', 'Tarija', 'Beni', 'Pando',
]
const loadingAddresses  = ref(false)
const selectedAddressId = ref('')
const useNewAddress     = ref(false)
const newAddress = ref({
  label: '', recipient_name: '', phone: '',
  address_line_1: '', address_line_2: '',
  city: '', state: '', country: 'Bolivia',
  address: null, is_default: false,
})

// ── Store info (QR + configuración de envío) ──────────────────────────────────
const storeInfo = ref(null)

// ── Modal de confirmación (centrado sobre todo) ───────────────────────────────
const confirmModal        = ref(false)
const paymentProofFile    = ref(null)
const paymentProofPreview = ref('')
const uploadingProof      = ref(false)

// ── Gift card ─────────────────────────────────────────────────────────────────
const myGiftcards       = ref([])    // gift cards activas del usuario
const gcLoading         = ref(false)
const gcCodeInput       = ref('')    // código manual que escribe el usuario
const appliedGiftcard   = ref(null)  // { code, balance, id } → aplicada
const gcValidating      = ref(false)
const gcError           = ref('')

// ── Costo de envío calculado ──────────────────────────────────────────────────
const shippingCost = computed(() => {
  if (!checkoutStoreId.value) return 30
  const sub       = storeSubtotal(checkoutStoreId.value)
  const threshold = (storeInfo.value?.free_shipping != null && storeInfo.value.free_shipping !== '')
    ? Number(storeInfo.value.free_shipping) : 200
  const cost      = (storeInfo.value?.shipping_cost != null && storeInfo.value.shipping_cost !== '')
    ? Number(storeInfo.value.shipping_cost) : 30
  return sub >= threshold ? 0 : cost
})

const gcDiscount = computed(() => {
  if (!appliedGiftcard.value) return 0
  const raw = storeSubtotal(checkoutStoreId.value) + shippingCost.value
  return Math.min(Number(appliedGiftcard.value.balance), raw)
})

const orderTotal = computed(() => {
  if (!checkoutStoreId.value) return 0
  const raw = storeSubtotal(checkoutStoreId.value) + shippingCost.value
  return Math.max(0, raw - gcDiscount.value)
})

// ── Helpers ───────────────────────────────────────────────────────────────────
function imgUrl(storeId, filename) {
  if (!filename || !storeId) return ''
  return `${PB}/api/files/products/${storeId}/${filename}?thumb=200x200`
}

function storeQrUrl() {
  if (!storeInfo.value?.payment_qr || !storeInfo.value?.id) return ''
  return `${PB}/api/files/stores/${storeInfo.value.id}/${storeInfo.value.payment_qr}`
}

function fmt(n) {
  return Number(n || 0).toLocaleString('es-CL')
}

function resetAddressForm() {
  newAddress.value = {
    label: '', recipient_name: '', phone: '',
    address_line_1: '', address_line_2: '',
    city: '', state: '', country: 'Bolivia',
    address: null, is_default: false,
  }
}

function addressLabel(addr) {
  const parts = [addr.label || 'Direccion', addr.recipient_name, addr.city]
  return parts.filter(Boolean).join(' - ')
}

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
    return { lat: toNumberOrNull(value[0]), lng: toNumberOrNull(value[1]) }
  }
  return {
    lat: toNumberOrNull(value.lat ?? value.latitude),
    lng: toNumberOrNull(value.lng ?? value.lon ?? value.longitude),
  }
}

const selectedAddress = computed(() => addresses.value.find((item) => item.id === selectedAddressId.value) || null)

async function loadBuyerAddresses() {
  if (!isAuthenticated.value) return
  loadingAddresses.value = true
  checkoutError.value    = ''
  try {
    addresses.value = await listAddresses()
    const def = addresses.value.find((item) => item.is_default)
    selectedAddressId.value = def?.id || addresses.value[0]?.id || ''
  } catch (err) {
    checkoutError.value = err.message || 'No se pudieron cargar tus direcciones.'
  } finally {
    loadingAddresses.value = false
  }
}

async function loadStoreInfo(storeId) {
  storeInfo.value = null
  try {
    const res = await fetch(
      `${PB}/api/collections/stores/records/${storeId}?fields=id,name,payment_qr,payment_instructions,shipping_cost,free_shipping`
    )
    if (res.ok) storeInfo.value = await res.json()
  } catch { /* silencioso */ }
}

// ── Gift card helpers ─────────────────────────────────────────────────────────
async function loadMyGiftcards() {
  if (!isAuthenticated.value) return
  myGiftcards.value = []
  const currentStoreId = checkoutStoreId.value
  if (!currentStoreId) return
  gcLoading.value = true
  try {
    const data = await listMyGiftcards(currentStoreId, { activeOnly: true })
    myGiftcards.value = (data.items || []).filter((g) => {
      if (g.status !== 'active') return false
      if (Number(g.balance || 0) <= 0) return false
      const gcStoreId = Array.isArray(g.store) ? g.store[0] : g.store
      return !!gcStoreId && gcStoreId === currentStoreId
    })
  } catch { /* silencioso */ } finally {
    gcLoading.value = false
  }
}

function applyGiftcard(gc) {
  const currentStoreId = checkoutStoreId.value
  const gcStoreId = Array.isArray(gc.store) ? gc.store[0] : gc.store
  if (!gcStoreId || (currentStoreId && gcStoreId !== currentStoreId)) {
    gcError.value = 'Esta gift card solo se puede usar en la tienda que la emitio.'
    return
  }
  if (gc.status !== 'active' || Number(gc.balance || 0) <= 0) {
    gcError.value = 'Esta gift card no esta disponible.'
    return
  }

  appliedGiftcard.value = { id: gc.id, code: gc.code, balance: gc.balance }
  gcCodeInput.value     = gc.code
  gcError.value         = ''
}

function removeGiftcard() {
  appliedGiftcard.value = null
  gcCodeInput.value     = ''
  gcError.value         = ''
}

async function handleValidateGcCode() {
  const code = gcCodeInput.value.trim().toUpperCase()
  if (!code) return
  gcValidating.value = true
  gcError.value      = ''
  try {
    const data = await validateCode(code, checkoutStoreId.value || '')
    appliedGiftcard.value = { id: data.id, code: data.code, balance: data.balance }
    gcError.value = ''
  } catch (err) {
    gcError.value = err.message || 'Código no válido'
    appliedGiftcard.value = null
  } finally {
    gcValidating.value = false
  }
}

function openCheckout(storeId) {
  initCart()  // Asegurar que el carrito está inicializado
  checkoutStoreId.value = storeId
  checkoutError.value   = ''
  checkoutSuccess.value = ''
  notes.value           = ''
  useNewAddress.value   = false
  resetAddressForm()
  loadBuyerAddresses()
  loadStoreInfo(storeId)
}

function closeCheckout() {
  checkoutStoreId.value     = null
  checkoutError.value       = ''
  checkoutSuccess.value     = ''
  useNewAddress.value       = false
  confirmModal.value        = false
  paymentProofFile.value    = null
  paymentProofPreview.value = ''
  appliedGiftcard.value     = null
  gcCodeInput.value         = ''
  gcError.value             = ''
}

function onProofFileChange(e) {
  const file = e.target.files?.[0]
  if (!file) return
  paymentProofFile.value    = file
  paymentProofPreview.value = URL.createObjectURL(file)
}

// ── Paso 1: validar dirección → abrir modal de confirmación ──────────────────
async function proceedToConfirm() {
  if (!isAuthenticated.value) {
    emit('close')
    router.push('/login')
    return
  }

  checkoutError.value = ''

  if (useNewAddress.value) {
    const missing = []
    if (!newAddress.value.recipient_name) missing.push('nombre')
    if (!newAddress.value.phone) missing.push('telefono')
    if (!newAddress.value.address_line_1) missing.push('linea 1')
    if (!newAddress.value.city) missing.push('ciudad')
    if (missing.length) { checkoutError.value = `Completa los campos requeridos: ${missing.join(', ')}.`; return }
    if (!BOLIVIA_CITIES.includes(newAddress.value.city)) { checkoutError.value = 'Selecciona una ciudad valida de Bolivia.'; return }
    const point = extractGeoPoint(newAddress.value.address)
    if (!isValidLatLng(point.lat, point.lng)) { checkoutError.value = 'Selecciona un punto en el mapa para la direccion.'; return }

    checkoutLoading.value = true
    try {
      const created = await createAddress({ ...newAddress.value, address: { lat: point.lat, lng: point.lng } })
      selectedAddressId.value = created.id
      await loadBuyerAddresses()
      useNewAddress.value = false
    } catch (err) {
      checkoutError.value   = err.message || 'No se pudo guardar la direccion.'
      checkoutLoading.value = false
      return
    }
    checkoutLoading.value = false
  }

  if (!selectedAddressId.value) { checkoutError.value = 'Selecciona o crea una direccion de envio.'; return }

  paymentProofFile.value    = null
  paymentProofPreview.value = ''
  appliedGiftcard.value     = null
  gcCodeInput.value         = ''
  gcError.value             = ''
  loadMyGiftcards()
  confirmModal.value        = true
}

// ── Paso 2: crear pedido + subir comprobante ──────────────────────────────────
async function submitOrder(storeId) {
  if (!paymentProofFile.value) { checkoutError.value = 'Debes subir el comprobante de pago.'; return }

  const storeCart = cart.value[storeId]
  if (!storeCart?.items?.length) return

  uploadingProof.value  = true
  checkoutError.value   = ''

  try {
    const items = storeCart.items.map(i => ({ productId: i.productId, quantity: i.quantity, unit_price: i.price }))
    const payload = {
      storeId,
      items,
      shipping_address_id: selectedAddressId.value,
      notes: notes.value,
      giftcard_code: appliedGiftcard.value?.code || '',
    }

    // 1. Crear orden (status: reserved)
    const createRes = await fetch(`${API}/orders/buyer/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': session.value?.userId || '', 'X-User-Role': session.value?.role || 'user' },
      body: JSON.stringify(payload),
    })
    const orderData = await createRes.json().catch(() => null)
    if (!createRes.ok) {
      checkoutError.value = humanizeError(orderData?.error || orderData?.details || `Error ${createRes.status}`)
      return
    }

    // 2. Subir comprobante (status → payment_uploaded)
    const formData = new FormData()
    formData.append('payment_proof', paymentProofFile.value)
    const proofRes = await fetch(`${API}/orders/buyer/order/${orderData.id}/proof`, {
      method: 'POST',
      headers: { 'X-User-Id': session.value?.userId || '', 'X-User-Role': session.value?.role || 'user' },
      body: formData,
    })
    if (!proofRes.ok) {
      const proofData = await proofRes.json().catch(() => null)
      checkoutError.value = proofData?.error || 'No se pudo subir el comprobante.'
      return
    }

    clearStoreCart(storeId)
    confirmModal.value        = false
    checkoutSuccess.value     = `¡Pedido #${orderData.id?.slice(0, 8)} creado! El vendedor lo revisará pronto.`
    checkoutStoreId.value     = null
    paymentProofFile.value    = null
    paymentProofPreview.value = ''
  } catch {
    checkoutError.value = 'No se pudo conectar al servidor.'
  } finally {
    uploadingProof.value = false
  }
}

function humanizeError(msg) {
  const text = typeof msg === 'string' ? msg : JSON.stringify(msg || '')
  if (!text) return 'Error desconocido al procesar el pedido.'
  if (text.includes('stock_insuficiente'))         return text.replace('stock_insuficiente: ', 'Sin stock suficiente para: ')
  if (text.includes('producto_no_disponible'))     return text.replace('producto_no_disponible: ', 'Producto no disponible: ')
  if (text.includes('producto_inactivo'))          return 'Un producto ya no está disponible. Actualiza tu carrito.'
  if (text.includes('producto_no_pertenece'))      return 'Hay un problema con un producto en tu carrito.'
  if (text.includes('tienda_suspendida'))          return 'Esta tienda está suspendida y no acepta pedidos.'
  if (text.includes('tienda_no_encontrada'))       return 'No se pudo encontrar la tienda.'
  if (text.includes('shipping_address_required'))  return 'Debes seleccionar una direccion de envio.'
  if (text.includes('shipping_address_invalida'))  return 'La nueva direccion no es valida.'
  if (text.includes('shipping_address_not_found')) return 'La direccion seleccionada no existe.'
  if (text.includes('shipping_address_forbidden')) return 'No puedes usar esa direccion.'
  if (text.includes('shipping_address_create_failed')) return 'No se pudo guardar la nueva direccion.'
  if (text.includes('address (geoPoint) requerido')) return 'Debes agregar coordenadas validas para el mapa.'
  if (text.includes('order_create_failed'))        return 'No se pudo crear el pedido. Intenta de nuevo.'
  if (text.includes('no_auth'))                    return 'Debes iniciar sesión para hacer un pedido.'
  if (text.includes('storeId y items'))            return 'Carrito vacío o incompleto.'
  if (text.includes('giftcard_not_found'))         return 'La gift card no se encontró o no está activa.'
  if (text.includes('giftcard_expired'))           return 'La gift card ha expirado.'
  if (text.includes('giftcard_invalid'))           return 'Código de gift card no válido.'
  if (text.includes('giftcard_store_mismatch') || text.includes('store_mismatch')) return 'Esta gift card solo se puede usar en la tienda que la emitió.'
  if (text.includes('giftcard_empty') || text.includes('empty')) return 'Esta gift card ya no tiene saldo disponible.'
  if (text.includes('giftcard_update_failed'))     return 'No se pudo actualizar la gift card después de aplicar el descuento.'
  return text
}

function goToOrders() {
  emit('close')
  router.push('/orders')
}
</script>

<template>
  <!-- Overlay del drawer -->
  <Transition name="overlay">
    <div
      v-if="open"
      class="fixed inset-0 bg-black/60 z-[60] backdrop-blur-sm"
      @click="$emit('close')"
    />
  </Transition>

  <!-- Drawer -->
  <Transition name="drawer">
    <aside
      v-if="open"
      class="fixed top-0 right-0 h-full w-full sm:w-[420px] bg-[#0a0a0a] border-l border-[#1a1a1a] z-[70] flex flex-col shadow-2xl shadow-black/60"
    >
      <!-- Header -->
      <div class="flex items-center justify-between px-5 py-4 border-b border-[#161616] shrink-0">
        <div class="flex items-center gap-3">
          <svg class="w-4 h-4 text-[#c9a96e]" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
          </svg>
          <h2 class="text-sm font-medium tracking-wide text-[#e8e5e0]">Carrito</h2>
          <span v-if="totalItemCount > 0" class="text-[10px] text-[#c9a96e] bg-[#c9a96e15] border border-[#c9a96e33] px-1.5 py-0.5 rounded-sm font-medium">
            {{ totalItemCount }}
          </span>
        </div>
        <button @click="$emit('close')" class="w-8 h-8 flex items-center justify-center text-[#555] hover:text-[#e8e5e0] transition-colors" aria-label="Cerrar carrito">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path d="M6 18L18 6M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>

      <!-- Contenido -->
      <div class="flex-1 overflow-y-auto">

        <!-- Vacío -->
        <div v-if="storesInCart.length === 0" class="flex flex-col items-center justify-center h-full gap-4 px-6">
          <svg class="w-16 h-16 text-[#1e1b16]" fill="none" stroke="currentColor" stroke-width="1" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
          </svg>
          <p class="font-display text-xl font-light text-[#2a2520]">Tu carrito está vacío</p>
          <p class="text-[10px] tracking-widest uppercase text-[#252520] text-center">Navega por las tiendas y agrega productos</p>
          <button @click="$emit('close')" class="mt-2 h-9 px-5 text-[10px] tracking-[0.15em] uppercase border border-[#1e1e1e] text-[#555] hover:border-[#c9a96e44] hover:text-[#c9a96e] transition-colors">
            Explorar tiendas
          </button>
        </div>

        <!-- Items por tienda -->
        <div v-else class="px-4 py-4 flex flex-col gap-6">

          <!-- Notificación de éxito -->
          <Transition name="fade">
            <div v-if="checkoutSuccess" class="bg-emerald-900/30 border border-emerald-700/40 px-4 py-3 flex items-start gap-3">
              <svg class="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              <div class="flex-1 min-w-0">
                <p class="text-[12px] text-emerald-300">{{ checkoutSuccess }}</p>
                <button @click="goToOrders" class="mt-1.5 text-[10px] tracking-wide text-emerald-400 underline underline-offset-2 hover:text-emerald-300 transition-colors">
                  Ver mis pedidos →
                </button>
              </div>
              <button @click="checkoutSuccess = ''" class="text-emerald-600 hover:text-emerald-400 transition-colors">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path d="M6 18L18 6M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>
            </div>
          </Transition>

          <!-- Cada tienda -->
          <div v-for="storeCart in storesInCart" :key="storeCart.storeId" class="border border-[#1a1a1a] bg-[#0c0c0c]">

            <!-- Header de tienda -->
            <div class="flex items-center justify-between px-4 py-2.5 border-b border-[#161616]">
              <div class="flex items-center gap-2 min-w-0">
                <svg class="w-3 h-3 text-[#c9a96e55] shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                <span class="text-[11px] tracking-[0.15em] uppercase text-[#c9a96e99] font-medium truncate">{{ storeCart.storeName }}</span>
              </div>
              <button @click="clearStoreCart(storeCart.storeId)" class="text-[10px] text-[#333330] hover:text-red-400 transition-colors tracking-wide shrink-0">Vaciar</button>
            </div>

            <!-- Items -->
            <div class="divide-y divide-[#121212]">
              <div v-for="item in storeCart.items" :key="item.productId" class="flex gap-3 p-3">
                <div class="w-14 h-14 shrink-0 bg-[#0f0f0f] border border-[#1e1e1e] overflow-hidden">
                  <img v-if="item.image" :src="imgUrl(item.productId, item.image)" :alt="item.name" class="w-full h-full object-cover" />
                  <div v-else class="w-full h-full flex items-center justify-center">
                    <svg class="w-5 h-5 text-[#1e1b16]" fill="none" stroke="currentColor" stroke-width="1" viewBox="0 0 24 24">
                      <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  </div>
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-[12px] text-[#d8d4ce] leading-tight truncate">{{ item.name }}</p>
                  <p class="text-[11px] text-[#c9a96e] mt-0.5 font-medium tabular-nums">${{ fmt(item.price) }}</p>
                  <div class="flex items-center gap-2 mt-2">
                    <button @click="updateQuantity(storeCart.storeId, item.productId, item.quantity - 1)" class="w-6 h-6 flex items-center justify-center border border-[#222] text-[#666] hover:border-[#c9a96e44] hover:text-[#c9a96e] transition-colors text-sm">−</button>
                    <span class="text-[12px] text-[#e8e5e0] w-6 text-center tabular-nums">{{ item.quantity }}</span>
                    <button @click="updateQuantity(storeCart.storeId, item.productId, item.quantity + 1)" :disabled="item.quantity >= item.stock" class="w-6 h-6 flex items-center justify-center border border-[#222] text-[#666] hover:border-[#c9a96e44] hover:text-[#c9a96e] transition-colors text-sm disabled:opacity-30 disabled:cursor-not-allowed">+</button>
                  </div>
                  <div class="mt-1.5">
                    <span v-if="item.stock <= 3" class="text-[10px] font-medium text-red-400">¡Solo {{ item.stock }} en stock!</span>
                    <span v-else-if="item.stock <= 10" class="text-[10px] font-medium text-amber-500">{{ item.stock }} disponibles</span>
                    <span v-else class="text-[10px] text-[#444440]">{{ item.stock }} en stock</span>
                  </div>
                </div>
                <div class="shrink-0 flex flex-col items-end gap-1">
                  <p class="text-[12px] text-[#e8e5e0] font-medium tabular-nums">${{ fmt(item.price * item.quantity) }}</p>
                  <button @click="removeFromCart(storeCart.storeId, item.productId)" class="text-[#2a2a2a] hover:text-red-500 transition-colors mt-1" aria-label="Eliminar">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                      <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            <!-- Total + Checkout -->
            <div class="px-4 py-3 border-t border-[#161616]">
              <div class="flex items-center justify-between mb-1">
                <span class="text-[11px] tracking-wide text-[#555550] uppercase">Subtotal</span>
                <span class="text-sm font-medium text-[#e8e5e0] tabular-nums">${{ fmt(storeSubtotal(storeCart.storeId)) }}</span>
              </div>

              <!-- Formulario de checkout -->
              <template v-if="checkoutStoreId === storeCart.storeId">

                <!-- Banner de envío -->
                <div class="my-3 flex items-center gap-2 px-3 py-2 border"
                  :class="shippingCost === 0
                    ? 'border-emerald-800/40 bg-emerald-900/15 text-emerald-400'
                    : 'border-[#c9a96e33] bg-[#c9a96e08] text-[#c9a96e99]'"
                >
                  <svg class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M8 17H5a2 2 0 01-2-2v-4l3-3m0 0h8m-8 0V5a2 2 0 012-2h6l4 4v8a2 2 0 01-2 2h-3m-8 0l3 3m0 0l3-3"/>
                  </svg>
                  <span class="text-[10px] tracking-wide">
                    <template v-if="shippingCost === 0">Envío gratis para este pedido</template>
                    <template v-else>
                      Envío: ${{ fmt(shippingCost) }} · Gratis en pedidos sobre ${{ fmt(storeInfo?.free_shipping ?? 200) }}
                    </template>
                  </span>
                </div>

                <div class="space-y-2 mb-3">
                  <!-- Dirección -->
                  <div class="border border-[#1e1e1e] bg-[#0f0f0f] p-2.5 space-y-2">
                    <div class="flex items-center justify-between gap-2">
                      <span class="text-[10px] tracking-[0.12em] uppercase text-[#c9a96e99]">Direccion de envio</span>
                      <button @click="useNewAddress = !useNewAddress" class="text-[10px] text-[#c9a96e] hover:text-[#dfc08a] transition-colors">
                        {{ useNewAddress ? 'Usar guardada' : 'Agregar nueva' }}
                      </button>
                    </div>

                    <template v-if="!useNewAddress">
                      <select v-model="selectedAddressId" :disabled="loadingAddresses" class="w-full bg-[#0b0b0b] border border-[#1e1e1e] text-[#d8d4ce] text-[11px] px-3 h-8 focus:outline-none focus:border-[#c9a96e44] transition-colors">
                        <option value="">Selecciona una direccion</option>
                        <option v-for="addr in addresses" :key="addr.id" :value="addr.id">{{ addressLabel(addr) }}</option>
                      </select>
                      <p v-if="!loadingAddresses && addresses.length === 0" class="text-[10px] text-[#6b665e]">No tienes direcciones guardadas. Presiona Agregar nueva.</p>
                      <div v-if="selectedAddress" class="text-[10px] text-[#9e998f] border border-[#1e1e1e] bg-[#0b0b0b] p-2 space-y-1">
                        <p>{{ selectedAddress.recipient_name }} - {{ selectedAddress.city }}</p>
                        <p>{{ selectedAddress.address_line_1 || selectedAddress.line1 }}</p>
                      </div>
                    </template>

                    <template v-else>
                      <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input v-model="newAddress.label" type="text" placeholder="Etiqueta (Casa, Oficina)" class="w-full bg-[#0b0b0b] border border-[#1e1e1e] text-[#d8d4ce] text-[11px] px-3 h-8 placeholder-[#333] focus:outline-none focus:border-[#c9a96e44]" />
                        <input v-model="newAddress.recipient_name" type="text" placeholder="Nombre del receptor *" class="w-full bg-[#0b0b0b] border border-[#1e1e1e] text-[#d8d4ce] text-[11px] px-3 h-8 placeholder-[#333] focus:outline-none focus:border-[#c9a96e44]" />
                        <input v-model="newAddress.phone" type="text" placeholder="Telefono *" class="w-full bg-[#0b0b0b] border border-[#1e1e1e] text-[#d8d4ce] text-[11px] px-3 h-8 placeholder-[#333] focus:outline-none focus:border-[#c9a96e44]" />
                        <select v-model="newAddress.city" class="w-full bg-[#0b0b0b] border border-[#1e1e1e] text-[#d8d4ce] text-[11px] px-3 h-8 focus:outline-none focus:border-[#c9a96e44]">
                          <option value="">Ciudad *</option>
                          <option v-for="city in BOLIVIA_CITIES" :key="city" :value="city">{{ city }}</option>
                        </select>
                      </div>
                      <input v-model="newAddress.address_line_1" type="text" placeholder="Linea 1 de direccion *" class="w-full bg-[#0b0b0b] border border-[#1e1e1e] text-[#d8d4ce] text-[11px] px-3 h-8 placeholder-[#333] focus:outline-none focus:border-[#c9a96e44]" />
                      <input v-model="newAddress.address_line_2" type="text" placeholder="Linea 2 de direccion (referencia)" class="w-full bg-[#0b0b0b] border border-[#1e1e1e] text-[#d8d4ce] text-[11px] px-3 h-8 placeholder-[#333] focus:outline-none focus:border-[#c9a96e44]" />
                      <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input v-model="newAddress.state" type="text" placeholder="Estado/Provincia" class="w-full bg-[#0b0b0b] border border-[#1e1e1e] text-[#d8d4ce] text-[11px] px-3 h-8 placeholder-[#333] focus:outline-none focus:border-[#c9a96e44]" />
                        <input v-model="newAddress.country" type="text" placeholder="Pais" class="w-full bg-[#0b0b0b] border border-[#1e1e1e] text-[#d8d4ce] text-[11px] px-3 h-8 placeholder-[#333] focus:outline-none focus:border-[#c9a96e44]" />
                      </div>
                      <GoogleMapPicker v-model="newAddress.address" height-class="h-56" />
                      <label class="flex items-center gap-2 text-[10px] text-[#9b968f]">
                        <input v-model="newAddress.is_default" type="checkbox" class="accent-[#c9a96e]" />
                        Guardar como direccion predeterminada
                      </label>
                    </template>
                  </div>

                  <textarea v-model="notes" placeholder="Notas para el vendedor (opcional)" rows="2" class="w-full bg-[#0f0f0f] border border-[#1e1e1e] text-[#d8d4ce] text-[11px] px-3 py-2 placeholder-[#333] focus:outline-none focus:border-[#c9a96e44] transition-colors resize-none" />

                  <div v-if="checkoutError" class="text-[11px] text-red-400 bg-red-900/20 border border-red-900/40 px-3 py-2">{{ checkoutError }}</div>
                </div>

                <div class="flex gap-2">
                  <button @click="closeCheckout" class="flex-1 h-9 text-[10px] tracking-[0.15em] uppercase border border-[#1e1e1e] text-[#555] hover:border-[#333] hover:text-[#888] transition-colors">Cancelar</button>
                  <button
                    @click="proceedToConfirm()"
                    :disabled="checkoutLoading"
                    class="flex-1 h-9 text-[10px] tracking-[0.15em] uppercase bg-[#c9a96e] text-[#0a0a0a] font-bold hover:bg-[#d4b87e] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    <svg v-if="checkoutLoading" class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                    {{ checkoutLoading ? 'Guardando...' : 'Hacer pedido' }}
                  </button>
                </div>
              </template>

              <template v-else>
                <button @click="openCheckout(storeCart.storeId)" class="w-full mt-2 h-9 text-[10px] tracking-[0.15em] uppercase bg-[#c9a96e15] border border-[#c9a96e33] text-[#c9a96e] hover:bg-[#c9a96e25] hover:border-[#c9a96e55] transition-colors">
                  Hacer pedido
                </button>
              </template>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div v-if="storesInCart.length > 0" class="px-4 py-3 border-t border-[#161616] shrink-0">
        <button @click="goToOrders" class="w-full text-center text-[10px] tracking-[0.15em] uppercase text-[#555550] hover:text-[#c9a96e] transition-colors py-1">
          Ver mis pedidos →
        </button>
      </div>
    </aside>
  </Transition>

  <!-- ════ MODAL DE CONFIRMACIÓN (centrado, z-90 sobre el drawer) ════════════ -->
  <Transition name="confirm-modal">
    <div
      v-if="confirmModal && checkoutStoreId"
      class="fixed inset-0 z-90 flex items-center justify-center bg-black/80 backdrop-blur-sm px-4 py-6 overflow-y-auto"
    >
      <div class="w-full max-w-md bg-[#0a0a0a] border border-[#1e1e1e] shadow-2xl shadow-black/80 my-auto">

        <!-- Header modal -->
        <div class="flex items-center justify-between px-5 py-4 border-b border-[#161616]">
          <div>
            <p class="text-[9px] tracking-[0.2em] uppercase text-[#555550]">Confirmar pedido</p>
            <h2 class="text-[14px] font-medium text-[#e8e5e0]">
              {{ storesInCart.find(s => s.storeId === checkoutStoreId)?.storeName }}
            </h2>
          </div>
          <button @click="confirmModal = false; checkoutError = ''" class="w-8 h-8 flex items-center justify-center text-[#555] hover:text-[#e8e5e0] transition-colors">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path d="M6 18L18 6M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>

        <div class="px-5 py-4 space-y-5">

          <!-- Productos -->
          <div>
            <p class="text-[9px] tracking-[0.18em] uppercase text-[#3a3835] mb-2">Productos</p>
            <div class="space-y-1.5">
              <div v-for="item in cart[checkoutStoreId]?.items" :key="item.productId"
                class="flex items-center justify-between px-3 py-2 bg-[#0f0f0f] border border-[#1a1a1a]">
                <div class="min-w-0">
                  <p class="text-[12px] text-[#d8d4ce] truncate">{{ item.name }}</p>
                  <p class="text-[10px] text-[#555]">× {{ item.quantity }}</p>
                </div>
                <span class="text-[12px] text-[#e8e5e0] tabular-nums shrink-0 ml-3">${{ fmt(item.price * item.quantity) }}</span>
              </div>
            </div>
          </div>

          <!-- Gift Card -->
          <div>
            <p class="text-[9px] tracking-[0.18em] uppercase text-[#3a3835] mb-2">Gift Card (opcional)</p>
            <p class="text-[10px] text-[#54766b] mb-2">
              Solo se muestran gift cards activas válidas para esta tienda.
            </p>

            <!-- Mis gift cards activas -->
            <div v-if="gcLoading" class="text-[10px] text-[#555] mb-2">Cargando gift cards…</div>
            <div v-else-if="myGiftcards.length" class="flex flex-wrap gap-1.5 mb-2">
              <button
                v-for="gc in myGiftcards"
                :key="gc.id"
                type="button"
                class="gc-chip"
                :class="appliedGiftcard?.id === gc.id ? 'gc-chip--active' : ''"
                @click="appliedGiftcard?.id === gc.id ? removeGiftcard() : applyGiftcard(gc)"
              >
                <svg class="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 8v13m0-13V6a4 4 0 00-4-4H5.45a1 1 0 00-.9 1.447L6 6m6 2l1.45-2.553A1 1 0 0114.55 2H16a4 4 0 014 4v2M4 10h16"/>
                </svg>
                <span>{{ gc.code }}</span>
                <span class="gc-chip__balance">Bs {{ fmt(gc.balance) }}</span>
              </button>
            </div>
            <p v-else-if="!gcLoading" class="text-[10px] text-[#555550] mb-2 italic">
              No tienes gift cards disponibles para esta tienda.
            </p>

            <!-- Código manual -->
            <div class="flex gap-1.5">
              <input
                v-model="gcCodeInput"
                type="text"
                placeholder="Código de gift card"
                maxlength="32"
                :disabled="!!appliedGiftcard"
                class="flex-1 min-w-0 bg-[#0b0b0b] border border-[#1e1e1e] text-[#d8d4ce] text-[11px] px-3 h-8 font-mono tracking-wide placeholder-[#333] focus:outline-none focus:border-[#8ab4a055] transition-colors disabled:opacity-40"
                @keydown.enter="handleValidateGcCode"
              />
              <button
                v-if="!appliedGiftcard"
                type="button"
                :disabled="gcValidating || !gcCodeInput.trim()"
                class="shrink-0 h-8 px-3 text-[10px] tracking-wide border border-[#20322c] bg-[#0f1714] text-[#8ab4a0] hover:bg-[#14211d] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                @click="handleValidateGcCode"
              >
                {{ gcValidating ? '…' : 'Aplicar' }}
              </button>
              <button
                v-else
                type="button"
                class="shrink-0 h-8 px-3 text-[10px] tracking-wide border border-[#3a1f1f] bg-[#1a0d0d] text-[#e07070] hover:bg-[#2a1010] transition-colors"
                @click="removeGiftcard"
              >
                Quitar
              </button>
            </div>

            <!-- Error gift card -->
            <p v-if="gcError" class="mt-1.5 text-[10px] text-red-400">{{ gcError }}</p>

            <!-- Gift card aplicada (confirmación visual) -->
            <div v-if="appliedGiftcard" class="mt-2 flex items-center gap-2 px-3 py-2 border border-[#20322c] bg-[#0d110f]">
              <svg class="w-3.5 h-3.5 text-[#8ab4a0] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
              <p class="text-[10px] text-[#8ab4a0]">
                Gift card <strong>{{ appliedGiftcard.code }}</strong> · descuento: Bs {{ fmt(gcDiscount) }}
              </p>
            </div>
          </div>

          <!-- Resumen de costos -->
          <div class="border border-[#1a1a1a] bg-[#0c0c0c] px-4 py-3 space-y-2">
            <div class="flex justify-between text-[11px]">
              <span class="text-[#666660]">Subtotal</span>
              <span class="text-[#d8d4ce] tabular-nums">${{ fmt(storeSubtotal(checkoutStoreId)) }}</span>
            </div>
            <div class="flex justify-between text-[11px]">
              <span class="text-[#666660]">Envío</span>
              <span class="tabular-nums" :class="shippingCost === 0 ? 'text-emerald-400' : 'text-[#d8d4ce]'">
                {{ shippingCost === 0 ? 'Gratis' : '$' + fmt(shippingCost) }}
              </span>
            </div>
            <div v-if="appliedGiftcard" class="flex justify-between text-[11px]">
              <span class="text-[#8ab4a0]">Gift card ({{ appliedGiftcard.code }})</span>
              <span class="text-[#8ab4a0] tabular-nums">− ${{ fmt(gcDiscount) }}</span>
            </div>
            <div class="flex justify-between pt-2 border-t border-[#161616]">
              <span class="text-[12px] font-medium text-[#e8e5e0]">Total a pagar</span>
              <span class="text-[15px] font-bold text-[#c9a96e] tabular-nums">${{ fmt(orderTotal) }}</span>
            </div>
          </div>

          <!-- QR de la tienda -->
          <div>
            <p class="text-[9px] tracking-[0.18em] uppercase text-[#3a3835] mb-3">QR de pago</p>
            <div v-if="storeQrUrl()" class="flex flex-col items-center gap-3">
              <div class="w-52 h-52 bg-white p-2.5 shadow-lg">
                <img :src="storeQrUrl()" alt="QR de pago de la tienda" class="w-full h-full object-contain" />
              </div>
              <p v-if="storeInfo?.payment_instructions" class="text-[11px] text-[#888880] text-center leading-relaxed px-2">
                {{ storeInfo.payment_instructions }}
              </p>
            </div>
            <div v-else class="flex items-center gap-3 px-3 py-3 border border-[#1a1a1a] bg-[#0f0f0f]">
              <svg class="w-5 h-5 text-[#3a3835] shrink-0" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"/>
              </svg>
              <p class="text-[11px] text-[#555550]">La tienda no tiene QR configurado. Contacta al vendedor para los datos de pago.</p>
            </div>
          </div>

          <!-- Subir comprobante (requerido) -->
          <div>
            <p class="text-[9px] tracking-[0.18em] uppercase text-[#3a3835] mb-2">
              Comprobante de pago <span class="text-red-500 normal-case tracking-normal">*requerido</span>
            </p>
            <div v-if="paymentProofPreview" class="mb-2 border border-[#1e1e1e] bg-[#0f0f0f] overflow-hidden">
              <img :src="paymentProofPreview" alt="Comprobante" class="w-full max-h-48 object-contain" />
            </div>
            <label class="flex items-center gap-3 px-3 py-3 border border-dashed cursor-pointer transition-colors"
              :class="paymentProofFile ? 'border-[#c9a96e55] bg-[#c9a96e08]' : 'border-[#2a2a2a] hover:border-[#c9a96e33] bg-[#0c0c0c]'"
            >
              <svg class="w-4 h-4 text-[#555] shrink-0" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"/>
              </svg>
              <div class="flex-1 min-w-0">
                <p class="text-[11px]" :class="paymentProofFile ? 'text-[#c9a96e]' : 'text-[#888880]'">
                  {{ paymentProofFile ? paymentProofFile.name : 'Seleccionar imagen del comprobante' }}
                </p>
                <p class="text-[10px] text-[#444440]">JPG, PNG, WEBP o PDF · máx. 6 MB</p>
              </div>
              <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" class="hidden" @change="onProofFileChange" />
            </label>
          </div>

          <!-- Error -->
          <div v-if="checkoutError" class="text-[11px] text-red-400 bg-red-900/20 border border-red-900/40 px-3 py-2">
            {{ checkoutError }}
          </div>

        </div>

        <!-- Footer del modal -->
        <div class="flex gap-3 px-5 py-4 border-t border-[#161616]">
          <button @click="confirmModal = false; checkoutError = ''" class="flex-1 h-10 text-[10px] tracking-[0.15em] uppercase border border-[#1e1e1e] text-[#555] hover:border-[#333] hover:text-[#888] transition-colors">
            Volver
          </button>
          <button
            @click="submitOrder(checkoutStoreId)"
            :disabled="uploadingProof || !paymentProofFile"
            class="flex-1 h-10 text-[10px] tracking-[0.15em] uppercase bg-[#c9a96e] text-[#0a0a0a] font-bold hover:bg-[#d4b87e] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <svg v-if="uploadingProof" class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            {{ uploadingProof ? 'Enviando...' : 'Confirmar pedido' }}
          </button>
        </div>

      </div>
    </div>
  </Transition>
</template>

<style scoped>
/* Gift card chips */
.gc-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.28rem 0.65rem;
  border: 1px solid #242424;
  border-radius: 999px;
  background: #111111;
  color: #b5b2ac;
  font-size: 0.7rem;
  font-family: monospace;
  letter-spacing: 0.06em;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}

.gc-chip:hover { border-color: #8ab4a033; color: #f0ede8; }

.gc-chip--active {
  border-color: #20322c;
  background: #0f1714;
  color: #8ab4a0;
}

.gc-chip__balance {
  font-size: 0.65rem;
  color: #54766b;
  font-family: inherit;
}

.gc-chip--active .gc-chip__balance { color: #8ab4a077; }

.overlay-enter-active { transition: opacity 0.2s ease; }
.overlay-leave-active { transition: opacity 0.15s ease; }
.overlay-enter-from,
.overlay-leave-to     { opacity: 0; }

.drawer-enter-active { transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.25s ease; }
.drawer-leave-active { transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease; }
.drawer-enter-from,
.drawer-leave-to     { transform: translateX(100%); opacity: 0; }

.confirm-modal-enter-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.confirm-modal-leave-active { transition: opacity 0.15s ease, transform 0.15s ease; }
.confirm-modal-enter-from,
.confirm-modal-leave-to     { opacity: 0; transform: scale(0.96); }

.fade-enter-active { transition: opacity 0.25s ease, transform 0.25s ease; }
.fade-leave-active { transition: opacity 0.15s ease; }
.fade-enter-from   { opacity: 0; transform: translateY(-6px); }
.fade-leave-to     { opacity: 0; }
</style>
