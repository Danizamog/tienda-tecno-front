<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import AppNavbar from '@/components/layout/AppNavbar.vue'
import AppFooter from '@/components/layout/AppFooter.vue'
import MediaGallery from '@/components/ui/MediaGallery.vue'
import { useAuctions } from '@/composables/useAuctions'
import { useAuthSession } from '@/composables/useAuthSession'

const route  = useRoute()
const router = useRouter()
const {
  getAuction, listBids, placeBid, buyNow,
  auctionImageUrl, allAuctionImages, storeLogoUrl,
  minIncrement,
  subscribeToAuction, subscribeToBids,
} = useAuctions()
const { session, isAuthenticated } = useAuthSession()

// ── Estado ────────────────────────────────────────────────────────────────────
const auction  = ref(null)
const bids     = ref([])
const loading  = ref(true)
const error    = ref('')
const now      = ref(Date.now())

// ── Modal de pago ─────────────────────────────────────────────────────────────
const showPayModal   = ref(false)
const payOrder       = ref(null)
const payStoreQr     = ref('')
const payStoreInstr  = ref('')
const payProofFile   = ref(null)
const payProofPrev   = ref('')
const payUploading   = ref(false)
const payUploadErr   = ref('')
const payUploadOk    = ref(false)
const loadingPayData = ref(false)

const bidAmount    = ref('')
const bidLoading   = ref(false)
const bidError     = ref('')
const bidSuccess   = ref('')
const bidWarning   = ref('')
const highlightBid = ref(null)
const buyNowOpen      = ref(false)
const confirmBuyOpen  = ref(false)    // confirmación cuando puja >= buy_now_price
const pendingBuyAmount = ref(0)       // monto que tipeó el usuario antes de confirmar
const buyingNow    = ref(false)
const outbidNotice  = ref(false)
const endedNotice   = ref(false)

let ticker = null
let unsubAuction = null
let unsubBids    = null
let flashTimeout = null
let outbidTimeout = null
let successTimeout = null

// ── Carga inicial ─────────────────────────────────────────────────────────────
async function load() {
  loading.value = true
  error.value   = ''
  try {
    auction.value = await getAuction(route.params.id)
    const bidsData = await listBids(route.params.id, { perPage: 50 })
    bids.value = bidsData?.items || []
  } catch (e) {
    error.value = e.message || 'No se pudo cargar la subasta'
  } finally {
    loading.value = false
  }
}

// ── Mapeo de errores del backend ──────────────────────────────────────────────
function translateError(err) {
  const code = err?.details?.error || err?.code
  const map = {
    auction_not_active:       'La subasta no está activa',
    auction_not_started:      'La subasta aún no ha comenzado',
    auction_ended:            'La subasta ya finalizó',
    cannot_bid_own_auction:   'No puedes pujar en tu propia subasta',
    already_top_bidder:       'Ya tienes la puja más alta — espera a que alguien la supere',
    invalid_amount:           'Monto inválido',
    auto_bid_max_below_amount:'El tope automático debe ser mayor a la puja',
    buy_now_not_available:    'Esta subasta no tiene compra inmediata',
    unauthorized:             'Debes iniciar sesión para pujar',
    forbidden:                'No tienes permiso para esta acción',
    not_found:                'Subasta no encontrada',
    bid_failed:               'No se pudo registrar la puja',
  }
  if (code === 'amount_too_low' && err?.details?.min_required != null) {
    return `El monto mínimo es Bs ${money(err.details.min_required)}`
  }
  return map[code] || err?.message || 'Ocurrió un error'
}

// ── Realtime ──────────────────────────────────────────────────────────────────
async function refreshBids({ flashTopId = null } = {}) {
  try {
    const fresh = await listBids(route.params.id, { perPage: 50 })
    bids.value = fresh?.items || []
    const flashId = flashTopId || bids.value[0]?.id
    if (flashId) {
      highlightBid.value = flashId
      clearTimeout(flashTimeout)
      flashTimeout = setTimeout(() => { highlightBid.value = null }, 2500)
    }
  } catch (err) {
    console.error('[auction] refreshBids failed:', err)
  }
}

function onAuctionEvent(e) {
  if (!e?.record || e.record.id !== route.params.id) return
  if (e.action === 'delete') {
    error.value = 'Esta subasta fue eliminada'
    auction.value = null
    return
  }
  const prev = auction.value || {}
  const wasActive = prev.status === 'active'
  const prevBidsCount = Number(prev.bids_count || 0)
  const newBidsCount = Number(e.record.bids_count || 0)
  const prevPrice = Number(prev.current_price || 0)
  const newPrice = Number(e.record.current_price || 0)
  // Conservar expand (store, winner) porque el evento PB no lo trae
  auction.value = { ...prev, ...e.record, expand: prev.expand }

  // Refrescar pujas si llegó una nueva (defensa por si la suscripción a
  // auction_bids no entrega eventos por reglas de PB en esa colección)
  if (newBidsCount > prevBidsCount || newPrice > prevPrice) {
    const myUserId = session.value?.userId
    const wasMyTop = bids.value[0]?.bidder === myUserId
    refreshBids().then(() => {
      const top = bids.value[0]
      const isFromAnother = top && top.bidder !== myUserId
      if (wasMyTop && isFromAnother) {
        outbidNotice.value = true
        clearTimeout(outbidTimeout)
        outbidTimeout = setTimeout(() => { outbidNotice.value = false }, 5000)
      }
      const typed = Number(bidAmount.value)
      if (Number.isFinite(typed) && typed > 0 && typed < minBid.value && isFromAnother) {
        bidWarning.value = `Otra puja llegó. El mínimo ahora es Bs ${money(minBid.value)}`
      }
    })
  }

  // Si terminó por buy-now o cierre externo, notificar
  if (wasActive && e.record.status === 'ended') {
    endedNotice.value = true
    bidError.value = ''
  }
}

async function onBidEvent(e) {
  if (e.action !== 'create') return
  if (!e?.record || e.record.auction !== route.params.id) return

  // Evitar duplicados si el propio usuario ya lo añadió localmente
  if (bids.value.some((b) => b.id === e.record.id)) return

  // Re-fetch para obtener el expand del bidder (no usamos e.record como
  // fallback porque viene sin expand y mostraría "Anónimo")
  await refreshBids({ flashTopId: e.record.id })
}

onMounted(async () => {
  await load()
  ticker = setInterval(() => { now.value = Date.now() }, 1000)
  unsubAuction = subscribeToAuction(route.params.id, onAuctionEvent)
  unsubBids    = subscribeToBids(route.params.id, onBidEvent)
})

onBeforeUnmount(() => {
  clearInterval(ticker)
  clearTimeout(flashTimeout)
  clearTimeout(outbidTimeout)
  clearTimeout(successTimeout)
  if (unsubAuction) unsubAuction()
  if (unsubBids)    unsubBids()
})

watch(() => route.params.id, async (newId, oldId) => {
  if (!newId || newId === oldId) return
  if (unsubAuction) unsubAuction()
  if (unsubBids)    unsubBids()
  await load()
  unsubAuction = subscribeToAuction(newId, onAuctionEvent)
  unsubBids    = subscribeToBids(newId, onBidEvent)
})

// ── Computados ────────────────────────────────────────────────────────────────
const images = computed(() => auction.value ? allAuctionImages(auction.value) : [])
const hasImages = computed(() => images.value.length > 0)

const currentPrice = computed(() => Number(auction.value?.current_price || auction.value?.start_price || 0))
const bidCount     = computed(() => Number(auction.value?.bids_count || 0))
const increment    = computed(() => minIncrement(currentPrice.value))
const minBid       = computed(() => bidCount.value > 0 ? currentPrice.value + increment.value : currentPrice.value)

const topBidder = computed(() => bids.value[0]?.expand?.bidder || null)
const isTopBidder = computed(() => topBidder.value?.id === session.value?.userId)
const isOwner = computed(() => {
  const userId = session.value?.userId
  if (!userId) return false
  const raw = auction.value?.expand?.store?.owner
  const owners = Array.isArray(raw) ? raw : (raw ? [raw] : [])
  return owners.includes(userId)
})

const timeLeft = computed(() => {
  if (!auction.value?.end_date) return { expired: true, days: 0, hours: 0, minutes: 0, seconds: 0 }
  const end  = new Date(auction.value.end_date).getTime()
  const diff = end - now.value
  if (diff <= 0) return { expired: true, days: 0, hours: 0, minutes: 0, seconds: 0 }
  return {
    expired: false,
    days:    Math.floor(diff / 86400000),
    hours:   Math.floor((diff % 86400000) / 3600000),
    minutes: Math.floor((diff % 3600000) / 60000),
    seconds: Math.floor((diff % 60000) / 1000),
  }
})

const urgencyClass = computed(() => {
  if (timeLeft.value.expired) return 'text-text-muted'
  const diff = new Date(auction.value.end_date).getTime() - now.value
  if (diff < 3600000)  return 'text-red-400'
  if (diff < 86400000) return 'text-amber-400'
  return 'text-accent'
})

const canBid = computed(() => (
  isAuthenticated.value &&
  !isOwner.value &&
  !isTopBidder.value &&
  auction.value?.status === 'active' &&
  !timeLeft.value.expired
))

const buyNowPrice = computed(() => Number(auction.value?.buy_now_price || 0))
const hasBuyNow   = computed(() => buyNowPrice.value > 0)

function parseBidInput(raw) {
  const cleaned = String(raw ?? '')
    .replace(/\s+/g, '')
    .replace(/bs/gi, '')
    .replace(/[^\d]/g, '')

  if (!cleaned) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : NaN
}

const parsedBid = computed(() => {
  return parseBidInput(bidAmount.value)
})
const isValidAmount = computed(() => parsedBid.value != null && !Number.isNaN(parsedBid.value) && parsedBid.value > 0)
const reachesBuyNow = computed(() => (
  hasBuyNow.value && isValidAmount.value && parsedBid.value >= buyNowPrice.value
))
const meetsMinBid = computed(() => isValidAmount.value && parsedBid.value >= minBid.value)

const statusLabel = computed(() => {
  // Si el backend aún dice 'active' pero el tiempo ya expiró, mostramos 'Finalizada'
  if (auction.value?.status === 'active' && timeLeft.value?.expired) return 'Finalizada'
  return {
    draft:     'Borrador',
    active:    'Activa',
    ended:     'Finalizada',
    cancelled: 'Cancelada',
  }[auction.value?.status] || auction.value?.status
})

// ── Acciones ──────────────────────────────────────────────────────────────────
function resetFeedback() {
  bidError.value   = ''
  bidWarning.value = ''
}

function showSuccess(msg) {
  bidSuccess.value = msg
  clearTimeout(successTimeout)
  successTimeout = setTimeout(() => { bidSuccess.value = '' }, 3000)
}

function validateBeforeSubmit(amount) {
  if (!canBid.value) return 'La subasta ya no acepta pujas'
  if (parsedBid.value === null) return 'Ingresa un monto'
  if (Number.isNaN(parsedBid.value)) return 'Monto inválido: usa sólo números'
  if (amount <= 0) return 'El monto debe ser mayor a cero'
  if (amount < minBid.value) return `El monto mínimo es Bs ${money(minBid.value)}`
  return null
}

async function submitBid() {
  resetFeedback()
  const amount = parsedBid.value
  const validationError = validateBeforeSubmit(amount)
  if (validationError) { bidError.value = validationError; return }

  // Si alcanza el precio de compra inmediata, pedir confirmación antes
  if (reachesBuyNow.value) {
    pendingBuyAmount.value = amount
    confirmBuyOpen.value = true
    return
  }

  await sendBid(amount)
}

async function sendBid(amount) {
  bidLoading.value = true
  try {
    const result = await placeBid(route.params.id, { amount })
    bidAmount.value = ''
    if (result?.won_auction) {
      await openPayModal()
    } else if (result?.capped) {
      showSuccess(`Puja ajustada al precio de compra: Bs ${money(result.final_amount)}`)
    } else {
      showSuccess('¡Puja registrada!')
    }
  } catch (e) {
    bidError.value = translateError(e)
  } finally {
    bidLoading.value = false
  }
}

async function confirmReachBuyNow() {
  confirmBuyOpen.value = false
  if (!pendingBuyAmount.value) return
  await sendBid(pendingBuyAmount.value)
  pendingBuyAmount.value = 0
}

async function confirmBuyNow() {
  if (!canBid.value || !hasBuyNow.value) return
  buyingNow.value = true
  resetFeedback()
  try {
    await buyNow(route.params.id)
    buyNowOpen.value = false
    await openPayModal()
  } catch (e) {
    bidError.value = translateError(e)
  } finally {
    buyingNow.value = false
  }
}

function quickSet(delta) {
  const next = minBid.value + (delta * increment.value)
  bidAmount.value = String(hasBuyNow.value ? Math.min(next, buyNowPrice.value) : next)
  bidWarning.value = ''
}

function setMinBid() {
  bidAmount.value = String(minBid.value)
  bidWarning.value = ''
}

function setBuyNowAmount() {
  bidAmount.value = String(buyNowPrice.value)
  bidWarning.value = ''
}

function onAmountInput() {
  const normalized = String(bidAmount.value ?? '').replace(/[^\d]/g, '')
  if (normalized !== bidAmount.value) bidAmount.value = normalized

  // Limpiar warnings en cuanto el usuario ajusta el monto
  if (bidWarning.value && isValidAmount.value && parsedBid.value >= minBid.value) {
    bidWarning.value = ''
  }
  if (bidError.value) bidError.value = ''
}

// ── Modal de pago ─────────────────────────────────────────────────────────────
const API = (import.meta.env.VITE_GATEWAY_API_BASE_URL || '').replace(/\/$/, '')
const PB  = (import.meta.env.VITE_POCKETBASE_URL || '').replace(/\/$/, '')

function authHeaders() {
  return {
    'X-User-Id':   session.value?.userId || '',
    'X-User-Role': session.value?.role || 'user',
  }
}

async function openPayModal() {
  showPayModal.value  = true
  payOrder.value      = null
  payStoreQr.value    = ''
  payStoreInstr.value = ''
  payProofFile.value  = null
  payProofPrev.value  = ''
  payUploadErr.value  = ''
  payUploadOk.value   = false
  loadingPayData.value = true

  try {
    // Buscar el pedido de subasta
    const res = await fetch(`${API}/orders-bid/buyer/my`, {
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
    })
    if (res.ok) {
      const data = await res.json()
      const found = (data.items || []).find(o => {
        const bidId = Array.isArray(o.bid) ? o.bid[0] : o.bid
        return bidId === route.params.id
      })
      payOrder.value = found || null
    }

    // Cargar QR de la tienda
    const storeId = Array.isArray(auction.value?.store)
      ? auction.value.store[0]
      : auction.value?.store
    if (storeId) {
      const sr = await fetch(`${PB}/api/collections/stores/records/${storeId}?fields=id,payment_qr,payment_instructions`)
      if (sr.ok) {
        const store = await sr.json()
        payStoreQr.value    = store.payment_qr ? `${PB}/api/files/stores/${storeId}/${store.payment_qr}` : ''
        payStoreInstr.value = store.payment_instructions || ''
      }
    }
  } catch { /* silencioso */ }
  finally { loadingPayData.value = false }
}

function onPayProofChange(e) {
  const file = e.target.files?.[0]
  if (!file) return
  payProofFile.value = file
  payProofPrev.value = URL.createObjectURL(file)
}

async function uploadPayProof() {
  if (!payProofFile.value || !payOrder.value) return
  payUploading.value = true
  payUploadErr.value = ''
  payUploadOk.value  = false
  try {
    const form = new FormData()
    form.append('payment_proof', payProofFile.value)
    const res = await fetch(`${API}/orders-bid/buyer/${payOrder.value.id}/proof`, {
      method: 'POST',
      headers: authHeaders(),
      body:    form,
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Error al subir comprobante')
    payUploadOk.value  = true
    payOrder.value     = data
  } catch (e) {
    payUploadErr.value = e.message
  } finally {
    payUploading.value = false
  }
}

function payDeadline() {
  if (!payOrder.value?.payment_until) return null
  return new Date(payOrder.value.payment_until)
}

function payCanUpload() {
  if (!payOrder.value) return false
  const st = payOrder.value.status
  if (st && !['pending', ''].includes(st)) return false
  const dl = payDeadline()
  return !dl || dl > new Date()
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function money(v) {
  return new Intl.NumberFormat('es-BO', { maximumFractionDigits: 0 }).format(Number(v || 0))
}
function pad(n) { return String(n).padStart(2, '0') }
function fmtDateTime(d) {
  return d ? new Date(d).toLocaleString('es-BO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'
}
function bidderName(bid) {
  return bid.expand?.bidder?.name || bid.expand?.bidder?.email || 'Anónimo'
}
function bidderInitial(bid) {
  const name = bidderName(bid)
  return (name || '?').trim().charAt(0).toUpperCase()
}
function isMyBid(bid) {
  return bid.bidder === session.value?.userId
}
function goLogin() {
  router.push({ path: '/login', query: { redirect: route.fullPath } })
}
</script>

<template>
  <AppNavbar />

  <main class="detail-shell text-text-primary">

    <!-- Loading -->
    <section v-if="loading" class="max-w-[92rem] mx-auto px-4 sm:px-6 lg:px-8 xl:px-10 py-14">
      <div class="grid grid-cols-1 lg:grid-cols-5 gap-8">
        <div class="lg:col-span-3 space-y-3">
          <div class="skeleton h-[480px] w-full" />
          <div class="flex gap-2">
            <div v-for="i in 4" :key="i" class="skeleton w-20 h-20" />
          </div>
        </div>
        <div class="lg:col-span-2 space-y-4">
          <div class="skeleton h-6 w-3/4" />
          <div class="skeleton h-10 w-1/2" />
          <div class="skeleton h-40 w-full" />
          <div class="skeleton h-32 w-full" />
        </div>
      </div>
    </section>

    <!-- Error -->
    <section v-else-if="error" class="max-w-3xl mx-auto px-6 py-24 text-center">
      <p class="font-display text-2xl font-light text-accent mb-2">No se pudo cargar</p>
      <p class="text-text-muted text-sm mb-6">{{ error }}</p>
      <RouterLink to="/auctions" class="btn-outline text-xs">Volver a subastas</RouterLink>
    </section>

    <!-- Contenido -->
    <section v-else-if="auction" class="max-w-[92rem] mx-auto px-4 sm:px-6 lg:px-8 xl:px-10 py-10">

      <!-- Breadcrumb -->
      <nav class="flex items-center gap-2 text-[10px] tracking-[0.18em] uppercase text-text-disabled mb-6">
        <RouterLink to="/" class="hover:text-accent transition-colors">Inicio</RouterLink>
        <span>/</span>
        <RouterLink to="/auctions" class="hover:text-accent transition-colors">Subastas</RouterLink>
        <span>/</span>
        <span class="text-text-muted truncate max-w-[220px]">{{ auction.title }}</span>
      </nav>

      <div class="grid grid-cols-1 lg:grid-cols-5 gap-8">

        <!-- ═══ Galería (3 cols) ════════════════════════════════════════════ -->
        <div class="lg:col-span-3">
          <MediaGallery
            :images="images"
            :alt="auction.title"
            aspect="4/3"
          >
            <template #overlay>
              <span class="absolute top-4 left-4 status-badge z-10"
                :class="{
                  'text-emerald-400 border-emerald-900/50 bg-emerald-950/60': auction.status === 'active' && !timeLeft.expired,
                  'text-blue-400 border-blue-900/50 bg-blue-950/60': auction.status === 'ended' || (auction.status === 'active' && timeLeft.expired),
                  'text-yellow-400 border-yellow-900/50 bg-yellow-950/60': auction.status === 'draft',
                  'text-red-400 border-red-900/50 bg-red-950/60': auction.status === 'cancelled',
                }">
                {{ statusLabel }}
              </span>
            </template>
          </MediaGallery>

          <!-- Descripción -->
          <div v-if="auction.description" class="mt-8 pt-6 border-t border-border-subtle">
            <p class="text-[10px] tracking-[0.2em] uppercase text-text-disabled mb-3">Descripción</p>
            <div class="prose prose-invert max-w-none text-sm text-text-muted leading-relaxed" v-html="auction.description" />
          </div>
        </div>

        <!-- ═══ Panel de pujas (2 cols) ═════════════════════════════════════ -->
        <div class="lg:col-span-2">

          <!-- Tienda -->
          <RouterLink
            v-if="auction.expand?.store"
            :to="`/stores/${auction.expand.store.slug || auction.expand.store.id}`"
            class="inline-flex items-center gap-2 mb-4 group"
          >
            <div class="w-7 h-7 border border-border-default bg-surface-raised overflow-hidden">
              <img
                v-if="storeLogoUrl(auction.expand.store)"
                :src="storeLogoUrl(auction.expand.store)"
                :alt="auction.expand.store.name"
                class="w-full h-full object-cover"
              />
              <span v-else class="w-full h-full flex items-center justify-center text-[10px] text-text-disabled">
                {{ (auction.expand.store.name || 'T')[0] }}
              </span>
            </div>
            <span class="text-[10px] tracking-[0.18em] uppercase text-text-muted group-hover:text-accent transition-colors">
              {{ auction.expand.store.name }}
            </span>
          </RouterLink>

          <!-- Título -->
          <h1 class="font-display text-2xl md:text-3xl font-light leading-tight mb-6">
            {{ auction.title }}
          </h1>

          <!-- Countdown -->
          <div class="mb-6 p-4 border border-border-subtle bg-surface-base">
            <p class="text-[10px] tracking-[0.2em] uppercase text-text-disabled mb-2">
              {{ timeLeft.expired ? 'Subasta finalizada' : 'Termina en' }}
            </p>
            <div v-if="!timeLeft.expired" class="flex items-center gap-2 font-mono text-2xl font-semibold tabular-nums" :class="urgencyClass">
              <template v-if="timeLeft.days > 0">
                <span>{{ timeLeft.days }}d</span>
                <span>{{ pad(timeLeft.hours) }}h</span>
                <span>{{ pad(timeLeft.minutes) }}m</span>
                <span>{{ pad(timeLeft.seconds) }}s</span>
              </template>
              <template v-else>
                <span>{{ pad(timeLeft.hours) }}</span>
                <span class="text-text-disabled">:</span>
                <span>{{ pad(timeLeft.minutes) }}</span>
                <span class="text-text-disabled">:</span>
                <span>{{ pad(timeLeft.seconds) }}</span>
              </template>
            </div>
            <p v-else class="text-[13px] text-text-muted">Cerró el {{ fmtDateTime(auction.end_date) }}</p>
          </div>

          <!-- Precio actual -->
          <div class="mb-5">
            <p class="text-[10px] tracking-[0.2em] uppercase text-text-disabled mb-1">
              {{ bidCount > 0 ? 'Oferta actual' : 'Precio inicial' }}
            </p>
            <div class="flex items-baseline gap-3">
              <p class="font-display text-4xl font-light text-accent tabular-nums">
                Bs {{ money(currentPrice) }}
              </p>
              <span class="text-[11px] text-text-muted">{{ bidCount }} puja{{ bidCount !== 1 ? 's' : '' }}</span>
            </div>
            <p v-if="bidCount > 0 && auction.start_price" class="text-[10px] text-text-disabled mt-0.5 tabular-nums">
              Desde Bs {{ money(auction.start_price) }}
            </p>
          </div>

          <!-- Top bidder -->
          <div v-if="topBidder" class="mb-5 p-3 border flex items-center gap-3"
            :class="isTopBidder ? 'border-[var(--accent)44] bg-[var(--accent-soft)]' : 'border-border-subtle bg-surface-base'">
            <div class="w-8 h-8 rounded-full border border-border-default bg-surface-raised flex items-center justify-center text-xs font-medium text-accent shrink-0">
              {{ (topBidder.name || topBidder.email || '?')[0].toUpperCase() }}
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-[11px] text-text-muted truncate">
                {{ isTopBidder ? '¡Estás ganando!' : `Lidera ${topBidder.name || topBidder.email || 'un usuario'}` }}
              </p>
              <p class="text-[9px] tracking-[0.14em] uppercase text-text-disabled">Última puja</p>
            </div>
          </div>

          <!-- Bid form / Ended / Login prompt -->
          <div v-if="auction.status === 'ended' || timeLeft.expired" class="border border-border-subtle bg-surface-base overflow-hidden">
            <div class="p-5">
              <p class="text-[11px] tracking-[0.18em] uppercase text-text-muted mb-2">Subasta cerrada</p>
              <div v-if="auction.expand?.winner" class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-full border border-[var(--vendor)33] bg-surface-raised flex items-center justify-center text-[var(--vendor)] text-sm font-medium shrink-0">
                  {{ (auction.expand.winner.name || auction.expand.winner.email || '?')[0].toUpperCase() }}
                </div>
                <div>
                  <p class="text-[13px] text-text-secondary">
                    {{ auction.winner === session.value?.userId ? '¡Ganaste!' : `Ganó ${auction.expand.winner.name || 'Usuario'}` }}
                  </p>
                  <p class="text-[11px] text-accent">Bs {{ money(currentPrice) }}</p>
                </div>
              </div>
              <p v-else class="text-[12px] text-text-muted">Sin ganador</p>
            </div>
            <!-- Banner de pago para el ganador -->
            <div
              v-if="isAuthenticated && auction.winner === session.value?.userId"
              class="border-t border-[var(--accent)33] bg-[var(--accent-soft)] p-4 flex items-center justify-between gap-3"
            >
              <div>
                <p class="text-[12px] text-accent font-medium">¡Debes completar tu pago!</p>
                <p class="text-[10px] text-text-muted mt-0.5">Tienes 2 días para subir tu comprobante</p>
              </div>
              <button
                @click="openPayModal"
                class="px-4 py-2 bg-accent text-accent-on text-[10px] tracking-[0.14em] uppercase font-semibold rounded-sm hover:bg-[var(--accent-hover)] transition-colors whitespace-nowrap shrink-0"
              >
                Pagar ahora
              </button>
            </div>
          </div>

          <div v-else-if="!isAuthenticated" class="p-5 border border-border-subtle bg-surface-base text-center">
            <p class="text-[12px] text-text-muted mb-3">Inicia sesión para participar en la subasta</p>
            <button @click="goLogin" class="btn-primary w-full">Iniciar sesión</button>
          </div>

          <div v-else-if="isOwner" class="p-5 border border-border-subtle bg-surface-base text-center">
            <p class="text-[12px] text-text-muted">No puedes pujar en tu propia subasta</p>
          </div>

          <div v-else-if="isTopBidder && auction?.status === 'active' && !timeLeft.expired" class="p-5 border border-emerald-900/50 bg-emerald-950/30 text-center">
            <p class="text-[12px] text-emerald-300 font-medium mb-1">Vas ganando esta subasta</p>
            <p class="text-[11px] text-text-muted">Espera a que alguien supere tu puja para volver a pujar</p>
          </div>

          <div v-else-if="canBid">

            <!-- Aviso: te superaron -->
            <div v-if="outbidNotice" class="mb-3 px-3 py-2 border border-amber-900/50 bg-amber-950/40 text-amber-300 text-[11px] flex items-center gap-2">
              <svg class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path d="M12 8v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              ¡Te superaron! El nuevo mínimo es Bs {{ money(minBid) }}
            </div>

            <!-- Quick bid buttons -->
            <div class="flex gap-2 mb-3">
              <button type="button" @click="setMinBid" class="quick-bid-btn">
                Mín. Bs {{ money(minBid) }}
              </button>
              <button type="button" @click="quickSet(1)" class="quick-bid-btn">
                +Bs {{ money(increment) }}
              </button>
              <button
                v-if="!hasBuyNow || minBid + 5 * increment < buyNowPrice"
                type="button"
                @click="quickSet(5)"
                class="quick-bid-btn"
              >
                +Bs {{ money(5 * increment) }}
              </button>
              <button
                v-if="hasBuyNow"
                type="button"
                @click="setBuyNowAmount"
                class="quick-bid-btn quick-bid-btn--gold"
              >
                Ganar ya
              </button>
            </div>

            <!-- Bid input -->
            <div class="flex gap-2 mb-2">
              <div class="relative flex-1">
                <span class="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-sm font-medium">Bs</span>
                <input
                  v-model="bidAmount"
                  type="text"
                  :placeholder="`${money(minBid)} o más`"
                  class="bid-input pl-8"
                  :class="{ 'bid-input--error': bidAmount && !meetsMinBid, 'bid-input--winning': reachesBuyNow }"
                  inputmode="numeric"
                  pattern="[0-9]*"
                  @input="onAmountInput"
                  @keyup.enter="submitBid"
                />
              </div>
              <button
                @click="submitBid"
                :disabled="bidLoading || !meetsMinBid"
                class="btn-primary-gold"
              >
                <template v-if="bidLoading">...</template>
                <template v-else-if="reachesBuyNow">Ganar</template>
                <template v-else>Pujar</template>
              </button>
            </div>

            <!-- Hint dinámico -->
            <p v-if="reachesBuyNow" class="text-[10px] text-accent mb-3">
              Esta puja alcanza el precio de compra. Se topará a Bs {{ money(buyNowPrice) }} y ganarás la subasta.
            </p>
            <p v-else-if="isValidAmount && !meetsMinBid" class="text-[10px] text-red-400 mb-3">
              Mínimo: Bs {{ money(minBid) }} · El monto debe ser ≥ Bs {{ money(minBid) }}
            </p>
            <p v-else class="text-[10px] text-text-muted mb-3">
              Mínimo: Bs {{ money(minBid) }} · Incremento: Bs {{ money(increment) }}
            </p>

            <!-- Buy now -->
            <button
              v-if="hasBuyNow"
              @click="buyNowOpen = true"
              class="w-full p-3 border border-[var(--accent)44] bg-[var(--accent-soft)] hover:bg-[var(--accent-soft)] transition-colors text-left group"
            >
              <p class="text-[9px] tracking-[0.2em] uppercase text-accent mb-0.5">Cómpralo ya</p>
              <p class="font-display text-xl font-light text-text-primary group-hover:text-accent transition-colors tabular-nums">
                Bs {{ money(buyNowPrice) }}
              </p>
            </button>

            <!-- Feedback -->
            <p v-if="bidError"   class="mt-3 text-[11px] text-red-400">{{ bidError }}</p>
            <p v-if="bidWarning" class="mt-3 text-[11px] text-amber-300">{{ bidWarning }}</p>
            <p v-if="bidSuccess" class="mt-3 text-[11px] text-emerald-400">{{ bidSuccess }}</p>
          </div>

          <!-- Historial de pujas -->
          <div class="mt-8 pt-6 border-t border-border-subtle">
            <div class="flex items-center justify-between mb-4">
              <p class="text-[10px] tracking-[0.2em] uppercase text-text-disabled">
                Historial de pujas
              </p>
              <span class="text-[10px] text-text-muted">{{ bids.length }}</span>
            </div>
            <div v-if="!bids.length" class="text-center py-8 text-text-disabled text-[11px]">
              Sé el primero en pujar
            </div>
            <div v-else class="flex flex-col gap-1.5 max-h-96 overflow-y-auto pr-1">
              <div
                v-for="bid in bids"
                :key="bid.id"
                :class="[
                  'bid-row',
                  highlightBid === bid.id && 'bid-row--flash',
                  isMyBid(bid) && 'bid-row--mine',
                ]"
              >
                <div class="w-7 h-7 rounded-full border border-border-default bg-surface-raised flex items-center justify-center text-[10px] text-accent shrink-0">
                  {{ bidderInitial(bid) }}
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-[12px] text-text-secondary truncate">
                    {{ isMyBid(bid) ? 'Tú' : bidderName(bid) }}
                  </p>
                  <p class="text-[9px] text-text-muted">{{ fmtDateTime(bid.created) }}</p>
                </div>
                <p class="text-[13px] font-medium text-accent tabular-nums">
                  Bs {{ money(bid.amount) }}
                </p>
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>

    <!-- ══ MODAL BUY NOW ══════════════════════════════════════════ -->
    <Transition name="modal">
      <div v-if="buyNowOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm px-4">
        <div class="modal-box w-full max-w-sm">
          <h3 class="font-display text-xl font-light text-text-primary mb-2">Confirmar compra</h3>
          <p class="text-[12px] text-text-muted mb-5">
            Estás a punto de comprar esta subasta al precio de compra inmediata. Esto finalizará la subasta y la ganarás.
          </p>

          <div class="p-4 bg-surface-raised border border-border-subtle mb-5">
            <p class="text-[10px] tracking-[0.2em] uppercase text-text-disabled mb-1">Total</p>
            <p class="font-display text-3xl font-light text-accent tabular-nums">
              Bs {{ money(buyNowPrice) }}
            </p>
          </div>

          <div class="flex gap-2">
            <button @click="buyNowOpen = false" :disabled="buyingNow" class="btn-ghost flex-1">Cancelar</button>
            <button @click="confirmBuyNow" :disabled="buyingNow" class="btn-primary-gold flex-1">
              {{ buyingNow ? 'Comprando...' : 'Confirmar' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- ══ MODAL: PUJA ALCANZA BUY NOW ══════════════════════════════ -->
    <Transition name="modal">
      <div v-if="confirmBuyOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm px-4">
        <div class="modal-box w-full max-w-sm">
          <h3 class="font-display text-xl font-light text-text-primary mb-2">Ganar la subasta</h3>
          <p class="text-[12px] text-text-muted mb-4">
            Tu puja de <span class="text-accent font-medium">Bs {{ money(pendingBuyAmount) }}</span>
            alcanza o supera el precio de compra inmediata.
          </p>
          <div class="p-4 bg-surface-raised border border-[var(--accent)44] mb-5">
            <p class="text-[10px] tracking-[0.2em] uppercase text-text-disabled mb-1">Pagarás exactamente</p>
            <p class="font-display text-3xl font-light text-accent tabular-nums mb-1">
              Bs {{ money(buyNowPrice) }}
            </p>
            <p v-if="pendingBuyAmount > buyNowPrice" class="text-[10px] text-emerald-400">
              Ahorras Bs {{ money(pendingBuyAmount - buyNowPrice) }} (tope aplicado)
            </p>
          </div>
          <p class="text-[11px] text-text-muted mb-5">La subasta finalizará inmediatamente y serás el ganador.</p>
          <div class="flex gap-2">
            <button @click="confirmBuyOpen = false; pendingBuyAmount = 0" :disabled="bidLoading" class="btn-ghost flex-1">Cancelar</button>
            <button @click="confirmReachBuyNow" :disabled="bidLoading" class="btn-primary-gold flex-1">
              {{ bidLoading ? 'Confirmando...' : 'Confirmar y ganar' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- ══ TOAST: SUBASTA FINALIZADA ════════════════════════════════ -->
    <Transition name="toast">
      <div v-if="endedNotice" class="fixed bottom-6 right-6 z-40 max-w-sm p-4 border border-blue-900/50 bg-blue-950/90 backdrop-blur-sm flex items-start gap-3">
        <svg class="w-4 h-4 text-blue-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <div class="flex-1">
          <p class="text-[12px] text-blue-200 mb-1">Subasta finalizada</p>
          <p class="text-[11px] text-blue-300/70">
            {{ auction?.winner === session.value?.userId ? '¡Felicidades, ganaste!' : 'Alguien alcanzó el precio de compra o cerró la subasta.' }}
          </p>
        </div>
        <button @click="endedNotice = false" class="text-blue-300/50 hover:text-blue-300">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path d="M6 18L18 6M6 6l12 12" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
    </Transition>

  </main>

  <AppFooter />

  <!-- ── Modal de pago ────────────────────────────────────────────────────── -->
  <Transition name="modal">
    <div
      v-if="showPayModal"
      class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      @click.self="showPayModal = false"
    >
      <div class="bg-[#0e0e0e] border border-border-subtle rounded-sm w-full max-w-md max-h-[92vh] overflow-y-auto">

        <!-- Cabecera -->
        <div class="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
          <h2 class="text-[13px] tracking-[0.18em] uppercase text-text-primary">Completar pago</h2>
          <button @click="showPayModal = false" class="text-text-muted hover:text-accent transition-colors text-2xl leading-none">&times;</button>
        </div>

        <!-- Cargando -->
        <div v-if="loadingPayData" class="py-12 text-center text-text-muted text-sm">Cargando…</div>

        <div v-else class="p-6 flex flex-col gap-5">

          <!-- Monto -->
          <div class="bg-surface-overlay border border-border-subtle rounded-sm p-4 text-center">
            <p class="text-[10px] tracking-[0.2em] uppercase text-text-muted mb-1">Total a pagar</p>
            <p class="text-3xl font-light text-accent tabular-nums">
              Bs {{ money(payOrder?.total ?? auction?.current_price ?? 0) }}
            </p>
            <p class="text-[11px] text-text-muted mt-1">{{ auction?.title }}</p>
          </div>

          <!-- Plazo -->
          <div v-if="payOrder?.payment_until" class="flex items-center gap-2 text-[11px]"
            :class="payDeadline() && payDeadline() < new Date() ? 'text-red-400' : 'text-amber-400/80'"
          >
            <svg class="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Pagar antes del {{ payDeadline()?.toLocaleDateString('es-BO', { day:'2-digit', month:'long', hour:'2-digit', minute:'2-digit' }) }}
          </div>

          <!-- Sin pedido aún -->
          <div v-if="!payOrder" class="bg-amber-900/10 border border-amber-900/30 rounded-sm p-3 text-[12px] text-amber-400 leading-relaxed">
            Tu pedido aún se está procesando. Espera unos segundos y vuelve a intentarlo.
          </div>

          <!-- QR de la tienda -->
          <template v-if="payOrder && payCanUpload()">
            <div v-if="payStoreQr" class="flex flex-col items-center gap-3">
              <p class="text-[10px] tracking-[0.18em] uppercase text-text-muted">Escanea para pagar</p>
              <img :src="payStoreQr" class="w-52 h-52 object-contain bg-white p-2 rounded-sm" alt="QR pago" />
              <p v-if="payStoreInstr" class="text-[12px] text-text-muted text-center leading-relaxed">{{ payStoreInstr }}</p>
            </div>
            <div v-else class="text-[12px] text-text-muted text-center py-2">
              La tienda no tiene QR configurado. Contáctalos directamente.
            </div>

            <!-- Ya subió comprobante -->
            <div v-if="payUploadOk || payOrder.payment_proof" class="flex items-center gap-2 text-emerald-400 text-[12px] bg-emerald-900/10 border border-emerald-900/30 rounded-sm p-3">
              <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              Comprobante enviado. El vendedor lo revisará pronto.
            </div>

            <!-- Upload comprobante -->
            <div v-else>
              <p class="text-[10px] tracking-[0.18em] uppercase text-text-muted mb-3">Sube tu comprobante de pago</p>
              <label class="block cursor-pointer border border-dashed border-border-default rounded-sm p-5 text-center hover:border-[var(--accent)44] transition-colors">
                <input type="file" accept="image/*,.pdf" class="hidden" @change="onPayProofChange" />
                <div v-if="payProofPrev">
                  <img :src="payProofPrev" class="w-full max-h-36 object-contain mb-2 rounded-sm" />
                  <span class="text-[11px] text-text-muted">Cambiar imagen</span>
                </div>
                <div v-else class="flex flex-col items-center gap-2">
                  <svg class="w-8 h-8 text-text-disabled" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                  </svg>
                  <span class="text-[12px] text-text-muted">Seleccionar imagen o PDF</span>
                </div>
              </label>

              <div v-if="payUploadErr" class="mt-2 text-red-400 text-[11px]">{{ payUploadErr }}</div>

              <button
                v-if="payProofFile"
                :disabled="payUploading"
                @click="uploadPayProof"
                class="mt-3 w-full py-3 bg-accent text-accent-on text-[11px] tracking-[0.16em] uppercase font-bold rounded-sm hover:bg-[var(--accent-hover)] disabled:opacity-50 transition-colors"
              >
                {{ payUploading ? 'Enviando…' : 'Enviar comprobante' }}
              </button>
            </div>
          </template>

          <!-- Plazo vencido -->
          <div v-else-if="payOrder && !payCanUpload()" class="bg-red-900/10 border border-red-900/30 rounded-sm p-3 text-[12px] text-red-400 text-center">
            El plazo de pago ha vencido. La subasta será re-publicada.
          </div>

        </div>
      </div>
    </div>
  </Transition>

</template>

<style scoped>
.detail-shell {
  background: linear-gradient(180deg, var(--surface-base) 0%, var(--surface-base) 40%, var(--surface-base) 100%);
  flex: 1;
  width: 100%;
  min-height: 100vh;
}
.skeleton {
  background: linear-gradient(90deg, var(--surface-sunken) 0%, var(--surface-overlay) 50%, var(--surface-sunken) 100%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite;
}
@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
.status-badge {
  font-size: 0.6rem; letter-spacing: 0.18em; text-transform: uppercase;
  padding: 0.25rem 0.6rem; border-width: 1px; border-style: solid;
  backdrop-filter: blur(4px);
}
.bid-input {
  width: 100%; height: 2.75rem;
  background: var(--surface-base); border: 1px solid var(--border-default);
  color: var(--text-primary); font-size: 0.95rem; font-weight: 500;
  padding: 0 0.9rem 0 2.15rem; outline: none; transition: border-color 0.15s;
}
.bid-input:focus { border-color: var(--accent); }
.bid-input--error { border-color: var(--danger-soft); }
.bid-input--error:focus { border-color: var(--danger); }
.bid-input--winning { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent)33; }
.quick-bid-btn {
  flex: 1; padding: 0.45rem 0.5rem;
  border: 1px solid var(--border-subtle); background: var(--surface-sunken);
  color: var(--text-muted); font-size: 0.68rem; letter-spacing: 0.06em;
  transition: all 0.15s; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.quick-bid-btn:hover { border-color: var(--accent)44; color: var(--accent); }
.quick-bid-btn--gold { border-color: var(--accent)44; color: var(--accent); background: var(--accent-soft); }
.quick-bid-btn--gold:hover { border-color: var(--accent); background: var(--accent-soft); }
.btn-primary-gold {
  padding: 0 1.4rem; height: 2.75rem;
  background: var(--accent); color: var(--surface-base);
  font-weight: 500; font-size: 0.78rem; letter-spacing: 0.1em; text-transform: uppercase;
  transition: background 0.15s, transform 0.1s;
}
.btn-primary-gold:hover:not(:disabled) { background: var(--accent-hover); }
.btn-primary-gold:active:not(:disabled) { transform: translateY(1px); }
.btn-primary-gold:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-primary {
  padding: 0.6rem 1.1rem; background: var(--accent); color: var(--surface-base);
  font-size: 0.75rem; letter-spacing: 0.1em; text-transform: uppercase; font-weight: 500;
  transition: background 0.15s;
}
.btn-primary:hover { background: var(--accent-hover); }
.btn-ghost {
  padding: 0.6rem 1rem; background: transparent;
  border: 1px solid var(--border-default); color: var(--text-muted);
  font-size: 0.75rem; letter-spacing: 0.08em; text-transform: uppercase;
  transition: all 0.15s;
}
.btn-ghost:hover:not(:disabled) { border-color: var(--border-strong); color: var(--text-secondary); }
.btn-outline {
  display: inline-flex; align-items: center; justify-content: center;
  padding: 0.5rem 1rem; background: transparent;
  border: 1px solid var(--border-default); color: var(--text-muted);
  font-size: 0.72rem; letter-spacing: 0.12em; text-transform: uppercase;
  transition: all 0.15s;
}
.btn-outline:hover { border-color: var(--accent)44; color: var(--accent); }
.bid-row {
  display: flex; align-items: center; gap: 0.7rem;
  padding: 0.5rem 0.7rem;
  background: var(--surface-sunken); border: 1px solid var(--surface-overlay);
  transition: background 0.4s, border-color 0.4s;
}
.bid-row--flash {
  background: var(--accent-soft);
  border-color: var(--accent);
  animation: flash 1.5s ease-out;
}
.bid-row--mine {
  border-color: var(--vendor)33;
  background: var(--vendor-soft);
}
@keyframes flash {
  0%   { background: var(--accent-soft); border-color: var(--accent-hover); }
  100% { background: var(--accent-soft); border-color: var(--accent); }
}
.modal-box {
  background: var(--surface-base); border: 1px solid var(--border-default); padding: 1.75rem;
}
.modal-enter-active, .modal-leave-active { transition: opacity 0.2s ease; }
.modal-enter-from, .modal-leave-to { opacity: 0; }
.toast-enter-active, .toast-leave-active { transition: opacity 0.3s ease, transform 0.3s ease; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateY(1rem); }
</style>
