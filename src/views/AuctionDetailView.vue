<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import AppNavbar from '@/components/AppNavbar.vue'
import AppFooter from '@/components/AppFooter.vue'
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
const selectedImage = ref(0)
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
    selectedImage.value = 0
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
function onAuctionEvent(e) {
  if (!e?.record || e.record.id !== route.params.id) return
  if (e.action === 'delete') {
    error.value = 'Esta subasta fue eliminada'
    auction.value = null
    return
  }
  const prev = auction.value || {}
  const wasActive = prev.status === 'active'
  // Conservar expand (store, winner) porque el evento PB no lo trae
  auction.value = { ...prev, ...e.record, expand: prev.expand }

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

  const myUserId = session.value?.userId
  const wasMyTop = bids.value[0]?.bidder === myUserId
  const isFromAnother = e.record.bidder !== myUserId

  // Re-fetch para obtener el expand del bidder
  try {
    const fresh = await listBids(route.params.id, { perPage: 50 })
    bids.value = fresh?.items || []
  } catch {
    bids.value = [e.record, ...bids.value]
  }

  highlightBid.value = e.record.id
  clearTimeout(flashTimeout)
  flashTimeout = setTimeout(() => { highlightBid.value = null }, 2500)

  // Notificación "te superaron": sólo si yo lideraba y alguien más pujó más alto
  if (wasMyTop && isFromAnother && e.record.amount > 0) {
    outbidNotice.value = true
    clearTimeout(outbidTimeout)
    outbidTimeout = setTimeout(() => { outbidNotice.value = false }, 5000)
  }

  // Si el usuario tiene un monto tecleado que quedó obsoleto, avisar
  const typed = Number(bidAmount.value)
  if (Number.isFinite(typed) && typed > 0 && typed < minBid.value && isFromAnother) {
    bidWarning.value = `Otra puja llegó. El mínimo ahora es Bs ${money(minBid.value)}`
  }
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
  const owners = auction.value?.expand?.store?.owner
  const owner = Array.isArray(owners) ? owners[0] : owners
  return owner && owner === session.value?.userId
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
  if (timeLeft.value.expired) return 'text-[#555550]'
  const diff = new Date(auction.value.end_date).getTime() - now.value
  if (diff < 3600000)  return 'text-red-400'
  if (diff < 86400000) return 'text-amber-400'
  return 'text-[#c9a96e]'
})

const canBid = computed(() => (
  isAuthenticated.value &&
  !isOwner.value &&
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

const statusLabel = computed(() => ({
  draft: 'Borrador',
  active: 'Activa',
  ended: 'Finalizada',
  cancelled: 'Cancelada',
}[auction.value?.status] || auction.value?.status))

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
      showSuccess(`¡Ganaste la subasta por Bs ${money(result.final_amount)}!`)
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
    showSuccess('¡Compra realizada!')
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

  <main class="detail-shell text-[#f0ede8]">

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
      <p class="font-display text-2xl font-light text-[#c9a96e] mb-2">No se pudo cargar</p>
      <p class="text-[#666259] text-sm mb-6">{{ error }}</p>
      <RouterLink to="/auctions" class="btn-outline text-xs">Volver a subastas</RouterLink>
    </section>

    <!-- Contenido -->
    <section v-else-if="auction" class="max-w-[92rem] mx-auto px-4 sm:px-6 lg:px-8 xl:px-10 py-10">

      <!-- Breadcrumb -->
      <nav class="flex items-center gap-2 text-[10px] tracking-[0.18em] uppercase text-[#444440] mb-6">
        <RouterLink to="/" class="hover:text-[#c9a96e] transition-colors">Inicio</RouterLink>
        <span>/</span>
        <RouterLink to="/auctions" class="hover:text-[#c9a96e] transition-colors">Subastas</RouterLink>
        <span>/</span>
        <span class="text-[#7a7770] truncate max-w-[220px]">{{ auction.title }}</span>
      </nav>

      <div class="grid grid-cols-1 lg:grid-cols-5 gap-8">

        <!-- ═══ Galería (3 cols) ════════════════════════════════════════════ -->
        <div class="lg:col-span-3">
          <div class="bg-[#0d0d0d] border border-[#161616] aspect-[4/3] overflow-hidden relative">
            <img
              v-if="hasImages"
              :src="images[selectedImage]"
              :alt="auction.title"
              class="w-full h-full object-contain"
            />
            <div v-else class="w-full h-full flex items-center justify-center">
              <svg class="w-16 h-16 text-[#1e1b16]" fill="none" stroke="currentColor" stroke-width="1" viewBox="0 0 24 24">
                <path d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>

            <!-- Status badge -->
            <span class="absolute top-4 left-4 status-badge"
              :class="{
                'text-emerald-400 border-emerald-900/50 bg-emerald-950/60': auction.status === 'active',
                'text-blue-400 border-blue-900/50 bg-blue-950/60': auction.status === 'ended',
                'text-yellow-400 border-yellow-900/50 bg-yellow-950/60': auction.status === 'draft',
                'text-red-400 border-red-900/50 bg-red-950/60': auction.status === 'cancelled',
              }">
              {{ statusLabel }}
            </span>
          </div>

          <!-- Thumbnails -->
          <div v-if="images.length > 1" class="flex gap-2 mt-3 overflow-x-auto">
            <button
              v-for="(img, idx) in images"
              :key="img"
              @click="selectedImage = idx"
              class="shrink-0 w-20 h-20 border transition-colors"
              :class="selectedImage === idx ? 'border-[#c9a96e]' : 'border-[#161616] hover:border-[#3a3a38]'"
            >
              <img :src="img" class="w-full h-full object-cover" />
            </button>
          </div>

          <!-- Descripción -->
          <div v-if="auction.description" class="mt-8 pt-6 border-t border-[#161616]">
            <p class="text-[10px] tracking-[0.2em] uppercase text-[#3a3a38] mb-3">Descripción</p>
            <div class="prose prose-invert max-w-none text-sm text-[#a0998d] leading-relaxed" v-html="auction.description" />
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
            <div class="w-7 h-7 border border-[#222] bg-[#111] overflow-hidden">
              <img
                v-if="storeLogoUrl(auction.expand.store)"
                :src="storeLogoUrl(auction.expand.store)"
                :alt="auction.expand.store.name"
                class="w-full h-full object-cover"
              />
              <span v-else class="w-full h-full flex items-center justify-center text-[10px] text-[#2a2520]">
                {{ (auction.expand.store.name || 'T')[0] }}
              </span>
            </div>
            <span class="text-[10px] tracking-[0.18em] uppercase text-[#7a7770] group-hover:text-[#c9a96e] transition-colors">
              {{ auction.expand.store.name }}
            </span>
          </RouterLink>

          <!-- Título -->
          <h1 class="font-display text-2xl md:text-3xl font-light leading-tight mb-6">
            {{ auction.title }}
          </h1>

          <!-- Countdown -->
          <div class="mb-6 p-4 border border-[#161616] bg-[#0b0b0b]">
            <p class="text-[10px] tracking-[0.2em] uppercase text-[#3a3a38] mb-2">
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
                <span class="text-[#3a3a38]">:</span>
                <span>{{ pad(timeLeft.minutes) }}</span>
                <span class="text-[#3a3a38]">:</span>
                <span>{{ pad(timeLeft.seconds) }}</span>
              </template>
            </div>
            <p v-else class="text-[13px] text-[#555]">Cerró el {{ fmtDateTime(auction.end_date) }}</p>
          </div>

          <!-- Precio actual -->
          <div class="mb-5">
            <p class="text-[10px] tracking-[0.2em] uppercase text-[#3a3a38] mb-1">
              {{ bidCount > 0 ? 'Oferta actual' : 'Precio inicial' }}
            </p>
            <div class="flex items-baseline gap-3">
              <p class="font-display text-4xl font-light text-[#c9a96e] tabular-nums">
                Bs {{ money(currentPrice) }}
              </p>
              <span class="text-[11px] text-[#555]">{{ bidCount }} puja{{ bidCount !== 1 ? 's' : '' }}</span>
            </div>
            <p v-if="bidCount > 0 && auction.start_price" class="text-[10px] text-[#3a3a38] mt-0.5 tabular-nums">
              Desde Bs {{ money(auction.start_price) }}
            </p>
          </div>

          <!-- Top bidder -->
          <div v-if="topBidder" class="mb-5 p-3 border flex items-center gap-3"
            :class="isTopBidder ? 'border-[#c9a96e44] bg-[#14110d]' : 'border-[#1a1a1a] bg-[#0b0b0b]'">
            <div class="w-8 h-8 rounded-full border border-[#2a2a28] bg-[#111] flex items-center justify-center text-xs font-medium text-[#c9a96e] shrink-0">
              {{ (topBidder.name || topBidder.email || '?')[0].toUpperCase() }}
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-[11px] text-[#888] truncate">
                {{ isTopBidder ? '¡Estás ganando!' : `Lidera ${topBidder.name || topBidder.email || 'un usuario'}` }}
              </p>
              <p class="text-[9px] tracking-[0.14em] uppercase text-[#3a3a38]">Última puja</p>
            </div>
          </div>

          <!-- Bid form / Ended / Login prompt -->
          <div v-if="auction.status === 'ended' || timeLeft.expired" class="p-5 border border-[#1a1a1a] bg-[#0b0b0b]">
            <p class="text-[11px] tracking-[0.18em] uppercase text-[#555] mb-2">Subasta cerrada</p>
            <div v-if="auction.expand?.winner" class="flex items-center gap-3">
              <div class="w-8 h-8 rounded-full border border-[#8ab4a033] bg-[#111] flex items-center justify-center text-[#8ab4a0] text-sm font-medium shrink-0">
                {{ (auction.expand.winner.name || auction.expand.winner.email || '?')[0].toUpperCase() }}
              </div>
              <div>
                <p class="text-[13px] text-[#d8d5cf]">
                  {{ auction.winner === session.value?.userId ? '¡Ganaste!' : `Ganó ${auction.expand.winner.name || 'Usuario'}` }}
                </p>
                <p class="text-[11px] text-[#c9a96e]">Bs {{ money(currentPrice) }}</p>
              </div>
            </div>
            <p v-else class="text-[12px] text-[#666]">Sin ganador</p>
          </div>

          <div v-else-if="!isAuthenticated" class="p-5 border border-[#1a1a1a] bg-[#0b0b0b] text-center">
            <p class="text-[12px] text-[#888] mb-3">Inicia sesión para participar en la subasta</p>
            <button @click="goLogin" class="btn-primary w-full">Iniciar sesión</button>
          </div>

          <div v-else-if="isOwner" class="p-5 border border-[#1a1a1a] bg-[#0b0b0b] text-center">
            <p class="text-[12px] text-[#888]">No puedes pujar en tu propia subasta</p>
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
                <span class="absolute left-3 top-1/2 -translate-y-1/2 text-[#555] text-sm font-medium">Bs</span>
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
            <p v-if="reachesBuyNow" class="text-[10px] text-[#c9a96e] mb-3">
              Esta puja alcanza el precio de compra. Se topará a Bs {{ money(buyNowPrice) }} y ganarás la subasta.
            </p>
            <p v-else-if="isValidAmount && !meetsMinBid" class="text-[10px] text-red-400 mb-3">
              Mínimo: Bs {{ money(minBid) }} · El monto debe ser ≥ Bs {{ money(minBid) }}
            </p>
            <p v-else class="text-[10px] text-[#555] mb-3">
              Mínimo: Bs {{ money(minBid) }} · Incremento: Bs {{ money(increment) }}
            </p>

            <!-- Buy now -->
            <button
              v-if="hasBuyNow"
              @click="buyNowOpen = true"
              class="w-full p-3 border border-[#c9a96e44] bg-[#14110d] hover:bg-[#1a1510] transition-colors text-left group"
            >
              <p class="text-[9px] tracking-[0.2em] uppercase text-[#c9a96e] mb-0.5">Cómpralo ya</p>
              <p class="font-display text-xl font-light text-[#f0ede8] group-hover:text-[#c9a96e] transition-colors tabular-nums">
                Bs {{ money(buyNowPrice) }}
              </p>
            </button>

            <!-- Feedback -->
            <p v-if="bidError"   class="mt-3 text-[11px] text-red-400">{{ bidError }}</p>
            <p v-if="bidWarning" class="mt-3 text-[11px] text-amber-300">{{ bidWarning }}</p>
            <p v-if="bidSuccess" class="mt-3 text-[11px] text-emerald-400">{{ bidSuccess }}</p>
          </div>

          <!-- Historial de pujas -->
          <div class="mt-8 pt-6 border-t border-[#161616]">
            <div class="flex items-center justify-between mb-4">
              <p class="text-[10px] tracking-[0.2em] uppercase text-[#3a3a38]">
                Historial de pujas
              </p>
              <span class="text-[10px] text-[#555]">{{ bids.length }}</span>
            </div>
            <div v-if="!bids.length" class="text-center py-8 text-[#444440] text-[11px]">
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
                <div class="w-7 h-7 rounded-full border border-[#2a2a28] bg-[#0f0f0f] flex items-center justify-center text-[10px] text-[#c9a96e] shrink-0">
                  {{ bidderInitial(bid) }}
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-[12px] text-[#c4bdb0] truncate">
                    {{ isMyBid(bid) ? 'Tú' : bidderName(bid) }}
                  </p>
                  <p class="text-[9px] text-[#555]">{{ fmtDateTime(bid.created) }}</p>
                </div>
                <p class="text-[13px] font-medium text-[#c9a96e] tabular-nums">
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
          <h3 class="font-display text-xl font-light text-[#e8e4de] mb-2">Confirmar compra</h3>
          <p class="text-[12px] text-[#888] mb-5">
            Estás a punto de comprar esta subasta al precio de compra inmediata. Esto finalizará la subasta y la ganarás.
          </p>

          <div class="p-4 bg-[#0f0f0f] border border-[#1a1a1a] mb-5">
            <p class="text-[10px] tracking-[0.2em] uppercase text-[#3a3a38] mb-1">Total</p>
            <p class="font-display text-3xl font-light text-[#c9a96e] tabular-nums">
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
          <h3 class="font-display text-xl font-light text-[#e8e4de] mb-2">Ganar la subasta</h3>
          <p class="text-[12px] text-[#888] mb-4">
            Tu puja de <span class="text-[#c9a96e] font-medium">Bs {{ money(pendingBuyAmount) }}</span>
            alcanza o supera el precio de compra inmediata.
          </p>
          <div class="p-4 bg-[#0f0f0f] border border-[#c9a96e44] mb-5">
            <p class="text-[10px] tracking-[0.2em] uppercase text-[#3a3a38] mb-1">Pagarás exactamente</p>
            <p class="font-display text-3xl font-light text-[#c9a96e] tabular-nums mb-1">
              Bs {{ money(buyNowPrice) }}
            </p>
            <p v-if="pendingBuyAmount > buyNowPrice" class="text-[10px] text-emerald-400">
              Ahorras Bs {{ money(pendingBuyAmount - buyNowPrice) }} (tope aplicado)
            </p>
          </div>
          <p class="text-[11px] text-[#888] mb-5">La subasta finalizará inmediatamente y serás el ganador.</p>
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
</template>

<style scoped>
.detail-shell {
  background: linear-gradient(180deg, #0a0a0a 0%, #090909 40%, #0a0a0a 100%);
  flex: 1;
  width: 100%;
  min-height: 100vh;
}
.skeleton {
  background: linear-gradient(90deg, #0d0d0d 0%, #141414 50%, #0d0d0d 100%);
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
  background: #0a0a0a; border: 1px solid #2a2a28;
  color: #f0ede8; font-size: 0.95rem; font-weight: 500;
  padding: 0 0.9rem 0 2.15rem; outline: none; transition: border-color 0.15s;
}
.bid-input:focus { border-color: #c9a96e; }
.bid-input--error { border-color: #7f1d1d; }
.bid-input--error:focus { border-color: #dc2626; }
.bid-input--winning { border-color: #c9a96e; box-shadow: 0 0 0 1px #c9a96e33; }
.quick-bid-btn {
  flex: 1; padding: 0.45rem 0.5rem;
  border: 1px solid #1e1e1e; background: #0d0d0d;
  color: #888; font-size: 0.68rem; letter-spacing: 0.06em;
  transition: all 0.15s; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.quick-bid-btn:hover { border-color: #c9a96e44; color: #c9a96e; }
.quick-bid-btn--gold { border-color: #c9a96e44; color: #c9a96e; background: #14110d; }
.quick-bid-btn--gold:hover { border-color: #c9a96e; background: #1a1510; }
.btn-primary-gold {
  padding: 0 1.4rem; height: 2.75rem;
  background: #c9a96e; color: #0a0a0a;
  font-weight: 500; font-size: 0.78rem; letter-spacing: 0.1em; text-transform: uppercase;
  transition: background 0.15s, transform 0.1s;
}
.btn-primary-gold:hover:not(:disabled) { background: #d4b67a; }
.btn-primary-gold:active:not(:disabled) { transform: translateY(1px); }
.btn-primary-gold:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-primary {
  padding: 0.6rem 1.1rem; background: #c9a96e; color: #0a0a0a;
  font-size: 0.75rem; letter-spacing: 0.1em; text-transform: uppercase; font-weight: 500;
  transition: background 0.15s;
}
.btn-primary:hover { background: #d4b67a; }
.btn-ghost {
  padding: 0.6rem 1rem; background: transparent;
  border: 1px solid #2a2a28; color: #888;
  font-size: 0.75rem; letter-spacing: 0.08em; text-transform: uppercase;
  transition: all 0.15s;
}
.btn-ghost:hover:not(:disabled) { border-color: #3a3a38; color: #d8d5cf; }
.btn-outline {
  display: inline-flex; align-items: center; justify-content: center;
  padding: 0.5rem 1rem; background: transparent;
  border: 1px solid #2a2a28; color: #7a7770;
  font-size: 0.72rem; letter-spacing: 0.12em; text-transform: uppercase;
  transition: all 0.15s;
}
.btn-outline:hover { border-color: #c9a96e44; color: #c9a96e; }
.bid-row {
  display: flex; align-items: center; gap: 0.7rem;
  padding: 0.5rem 0.7rem;
  background: #0d0d0d; border: 1px solid #161616;
  transition: background 0.4s, border-color 0.4s;
}
.bid-row--flash {
  background: #1a1510;
  border-color: #c9a96e;
  animation: flash 1.5s ease-out;
}
.bid-row--mine {
  border-color: #8ab4a033;
  background: #0d110f;
}
@keyframes flash {
  0%   { background: #2a2010; border-color: #d4b67a; }
  100% { background: #1a1510; border-color: #c9a96e; }
}
.modal-box {
  background: #0a0a0a; border: 1px solid #2a2a28; padding: 1.75rem;
}
.modal-enter-active, .modal-leave-active { transition: opacity 0.2s ease; }
.modal-enter-from, .modal-leave-to { opacity: 0; }
.toast-enter-active, .toast-leave-active { transition: opacity 0.3s ease, transform 0.3s ease; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateY(1rem); }
</style>
