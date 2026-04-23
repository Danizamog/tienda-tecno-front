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
const highlightBid = ref(null)
const buyNowOpen   = ref(false)
const buyingNow    = ref(false)
const selectedImage = ref(0)

let ticker = null
let unsubAuction = null
let unsubBids    = null
let flashTimeout = null

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

// ── Realtime ──────────────────────────────────────────────────────────────────
function onAuctionEvent(e) {
  if (!e?.record || e.record.id !== route.params.id) return
  if (e.action === 'delete') {
    error.value = 'Esta subasta fue eliminada'
    auction.value = null
    return
  }
  const prev = auction.value || {}
  // Conservar expand (store, winner) porque el evento PB no lo trae
  auction.value = { ...prev, ...e.record, expand: prev.expand }
}

async function onBidEvent(e) {
  if (e.action !== 'create') return
  if (!e?.record || e.record.auction !== route.params.id) return

  // Evitar duplicados si el propio usuario ya lo añadió localmente
  if (bids.value.some((b) => b.id === e.record.id)) return

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

const statusLabel = computed(() => ({
  draft: 'Borrador',
  active: 'Activa',
  ended: 'Finalizada',
  cancelled: 'Cancelada',
}[auction.value?.status] || auction.value?.status))

// ── Acciones ──────────────────────────────────────────────────────────────────
async function submitBid() {
  if (!canBid.value) return
  bidError.value = ''
  bidSuccess.value = ''
  const amount = Number(bidAmount.value)
  if (!Number.isFinite(amount) || amount < minBid.value) {
    bidError.value = `El monto mínimo es Bs ${money(minBid.value)}`
    return
  }
  bidLoading.value = true
  try {
    await placeBid(route.params.id, { amount })
    bidSuccess.value = '¡Puja registrada!'
    bidAmount.value  = ''
    setTimeout(() => { bidSuccess.value = '' }, 2500)
  } catch (e) {
    if (e.status === 400 && e.details?.error === 'amount_too_low') {
      bidError.value = `El monto mínimo es Bs ${money(e.details.min_required)}`
    } else if (e.details?.error === 'auction_ended') {
      bidError.value = 'La subasta ya finalizó'
    } else if (e.details?.error === 'cannot_bid_own_auction') {
      bidError.value = 'No puedes pujar en tu propia subasta'
    } else {
      bidError.value = e.message
    }
  } finally {
    bidLoading.value = false
  }
}

async function confirmBuyNow() {
  if (!canBid.value || !auction.value?.buy_now_price) return
  buyingNow.value = true
  bidError.value  = ''
  try {
    await buyNow(route.params.id)
    buyNowOpen.value = false
    bidSuccess.value = '¡Compra realizada!'
  } catch (e) {
    bidError.value = e.message
  } finally {
    buyingNow.value = false
  }
}

function quickSet(delta) {
  bidAmount.value = String(minBid.value + (delta * increment.value))
}

function setMinBid() {
  bidAmount.value = String(minBid.value)
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
            <!-- Quick bid buttons -->
            <div class="flex gap-2 mb-3">
              <button type="button" @click="setMinBid" class="quick-bid-btn">
                Mín. Bs {{ money(minBid) }}
              </button>
              <button type="button" @click="quickSet(1)" class="quick-bid-btn">
                +Bs {{ money(increment) }}
              </button>
              <button type="button" @click="quickSet(5)" class="quick-bid-btn">
                +Bs {{ money(5 * increment) }}
              </button>
            </div>

            <!-- Bid input -->
            <div class="flex gap-2 mb-2">
              <div class="relative flex-1">
                <span class="absolute left-3 top-1/2 -translate-y-1/2 text-[#555] text-sm font-medium">Bs</span>
                <input
                  v-model="bidAmount"
                  type="number"
                  :min="minBid"
                  :step="increment"
                  :placeholder="`${money(minBid)} o más`"
                  class="bid-input pl-8"
                  @keyup.enter="submitBid"
                />
              </div>
              <button
                @click="submitBid"
                :disabled="bidLoading"
                class="btn-primary-gold"
              >
                {{ bidLoading ? '...' : 'Pujar' }}
              </button>
            </div>
            <p class="text-[10px] text-[#555] mb-3">
              Mínimo: Bs {{ money(minBid) }} · Incremento: Bs {{ money(increment) }}
            </p>

            <!-- Buy now -->
            <button
              v-if="auction.buy_now_price"
              @click="buyNowOpen = true"
              class="w-full p-3 border border-[#c9a96e44] bg-[#14110d] hover:bg-[#1a1510] transition-colors text-left group"
            >
              <p class="text-[9px] tracking-[0.2em] uppercase text-[#c9a96e] mb-0.5">Cómpralo ya</p>
              <p class="font-display text-xl font-light text-[#f0ede8] group-hover:text-[#c9a96e] transition-colors tabular-nums">
                Bs {{ money(auction.buy_now_price) }}
              </p>
            </button>

            <!-- Errors / Success -->
            <p v-if="bidError" class="mt-3 text-[11px] text-red-400">{{ bidError }}</p>
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
              Bs {{ money(auction?.buy_now_price) }}
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
  padding: 0 0.9rem; outline: none; transition: border-color 0.15s;
}
.bid-input:focus { border-color: #c9a96e; }
.quick-bid-btn {
  flex: 1; padding: 0.45rem 0.5rem;
  border: 1px solid #1e1e1e; background: #0d0d0d;
  color: #888; font-size: 0.68rem; letter-spacing: 0.06em;
  transition: all 0.15s; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.quick-bid-btn:hover { border-color: #c9a96e44; color: #c9a96e; }
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
</style>
