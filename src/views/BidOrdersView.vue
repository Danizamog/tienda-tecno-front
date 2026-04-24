<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import AppNavbar from '@/components/AppNavbar.vue'
import AppFooter from '@/components/AppFooter.vue'
import { useAuthSession } from '@/composables/useAuthSession'

const router = useRouter()
const { session, isAuthenticated } = useAuthSession()

const API = import.meta.env.VITE_API_URL || 'http://localhost:9000'
const PB  = import.meta.env.VITE_POCKETBASE_URL || ''

const tab = ref('orders') // 'orders' | 'bids'

// ── Pedidos ganados ────────────────────────────────────────────────────────────
const orders      = ref([])
const ordersLoad  = ref(false)
const ordersErr   = ref('')

// ── Mis pujas ─────────────────────────────────────────────────────────────────
const bids       = ref([])
const bidsLoad   = ref(false)
const bidsErr    = ref('')

// ── Modal QR / comprobante ────────────────────────────────────────────────────
const showModal     = ref(false)
const modalOrder    = ref(null)
const storeQrUrl    = ref('')
const storeInstr    = ref('')
const proofFile     = ref(null)
const proofPreview  = ref('')
const uploading     = ref(false)
const uploadErr     = ref('')
const uploadOk      = ref(false)

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    'X-User-Id':    session.value?.userId || '',
    'X-User-Role':  session.value?.role || 'user',
  }
}

// ── Carga pedidos ──────────────────────────────────────────────────────────────
async function loadOrders() {
  if (!isAuthenticated.value) { router.push('/login'); return }
  ordersLoad.value = true
  ordersErr.value  = ''
  try {
    const res = await fetch(`${API}/orders-bid/buyer/my`, {
      headers: authHeaders(),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Error al cargar pedidos')
    orders.value = data.items || []
  } catch (e) {
    ordersErr.value = e.message
  } finally {
    ordersLoad.value = false
  }
}

// ── Carga pujas ────────────────────────────────────────────────────────────────
async function loadBids() {
  if (!isAuthenticated.value) return
  bidsLoad.value = true
  bidsErr.value  = ''
  try {
    const res = await fetch(`${API}/orders-bid/buyer/my/bids`, {
      headers: authHeaders(),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Error al cargar pujas')
    bids.value = data.items || []
  } catch (e) {
    bidsErr.value = e.message
  } finally {
    bidsLoad.value = false
  }
}

// ── Abrir modal de pago ────────────────────────────────────────────────────────
async function openPayModal(order) {
  modalOrder.value  = order
  proofFile.value   = null
  proofPreview.value = ''
  uploadErr.value   = ''
  uploadOk.value    = false
  storeQrUrl.value  = ''
  storeInstr.value  = ''

  const storeId = order.store || order.expand?.store?.id
  if (storeId) {
    try {
      const r = await fetch(`${PB}/api/collections/stores/records/${storeId}?fields=id,payment_qr,payment_instructions`)
      if (r.ok) {
        const store = await r.json()
        storeQrUrl.value = store.payment_qr ? `${PB}/api/files/stores/${storeId}/${store.payment_qr}` : ''
        storeInstr.value = store.payment_instructions || ''
      }
    } catch { /* silencioso */ }
  }

  showModal.value = true
}

function onProofChange(e) {
  const file = e.target.files?.[0]
  if (!file) return
  proofFile.value = file
  proofPreview.value = URL.createObjectURL(file)
}

async function uploadProof() {
  if (!proofFile.value || !modalOrder.value) return
  uploading.value = true
  uploadErr.value = ''
  uploadOk.value  = false
  try {
    const form = new FormData()
    form.append('payment_proof', proofFile.value)

    const res = await fetch(`${API}/orders-bid/buyer/${modalOrder.value.id}/proof`, {
      method: 'POST',
      headers: {
        'X-User-Id':   session.value?.userId || '',
        'X-User-Role': session.value?.role || 'user',
      },
      body: form,
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Error al subir comprobante')
    uploadOk.value = true
    await loadOrders()
    const updated = orders.value.find(o => o.id === modalOrder.value.id)
    if (updated) modalOrder.value = updated
  } catch (e) {
    uploadErr.value = e.message
  } finally {
    uploading.value = false
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function money(n) {
  return Number(n || 0).toLocaleString('es-BO', { minimumFractionDigits: 2 })
}

function auctionImage(auction) {
  if (!auction) return ''
  const imgs = Array.isArray(auction.images) ? auction.images : []
  if (!imgs.length) return ''
  return `${PB}/api/files/auctions/${auction.id}/${imgs[0]}?thumb=200x150`
}

function storeLogoUrl(store) {
  if (!store?.logo) return ''
  return `${PB}/api/files/stores/${store.id}/${store.logo}?thumb=64x64`
}

const statusLabel = {
  pending:     'Pendiente de pago',
  '':          'Pendiente de pago',
  approved:    'Aprobado',
  shipped:     'Enviado',
  delivered:   'Entregado',
  rejected:    'Rechazado',
  calcelled:   'Cancelado',
  cancelled:   'Cancelado',
}

const statusColor = {
  pending:     'text-amber-400',
  '':          'text-amber-400',
  approved:    'text-emerald-400',
  shipped:     'text-blue-400',
  delivered:   'text-emerald-400',
  rejected:    'text-red-400',
  calcelled:   'text-[#555]',
  cancelled:   'text-[#555]',
}

function paymentDeadline(order) {
  if (!order.payment_until) return null
  return new Date(order.payment_until)
}

function isPending(order) {
  return order.status === 'pending' || order.status === '' || order.status == null
}

function canPay(order) {
  const deadline = paymentDeadline(order)
  if (!deadline) return false
  if (!isPending(order)) return false
  return deadline > new Date()
}

function hasProof(order) {
  return !!order.payment_proof
}

function proofUploaded(order) {
  return isPending(order) && hasProof(order)
}

// ── Estado de puja ─────────────────────────────────────────────────────────────
function bidStatus(bidEntry) {
  const auction = bidEntry.expand?.auction
  if (!auction) return { label: 'Desconocido', cls: 'text-[#555]' }
  if (auction.status === 'active') {
    if (auction.winner === session.value?.userId) return { label: '¡Ganando!', cls: 'text-emerald-400' }
    if (auction.current_price === bidEntry.amount) return { label: 'Oferta más alta', cls: 'text-[#c9a96e]' }
    return { label: 'Superado', cls: 'text-red-400' }
  }
  if (auction.status === 'ended') {
    if (auction.winner === session.value?.userId) return { label: 'Ganaste', cls: 'text-emerald-400' }
    return { label: 'No ganaste', cls: 'text-[#555]' }
  }
  return { label: auction.status, cls: 'text-[#555]' }
}

onMounted(() => {
  if (!isAuthenticated.value) { router.push('/login'); return }
  loadOrders()
  loadBids()
})
</script>

<template>
  <div class="min-h-screen flex flex-col bg-[#080808] text-[#e8e5e0]">
    <AppNavbar />

    <main class="flex-1 max-w-5xl mx-auto w-full px-4 py-10">
      <h1 class="text-2xl font-light tracking-[0.12em] uppercase text-[#f0ede8] mb-8">
        Mis Subastas
      </h1>

      <!-- Tabs -->
      <div class="flex gap-1 mb-8 border-b border-[#1a1a1a]">
        <button
          class="px-5 py-2.5 text-[11px] tracking-[0.18em] uppercase transition-all duration-200"
          :class="tab === 'orders' ? 'text-[#c9a96e] border-b-2 border-[#c9a96e]' : 'text-[#666] hover:text-[#999]'"
          @click="tab = 'orders'"
        >Pedidos Ganados</button>
        <button
          class="px-5 py-2.5 text-[11px] tracking-[0.18em] uppercase transition-all duration-200"
          :class="tab === 'bids' ? 'text-[#c9a96e] border-b-2 border-[#c9a96e]' : 'text-[#666] hover:text-[#999]'"
          @click="tab = 'bids'"
        >Mis Pujas</button>
      </div>

      <!-- ── Tab: Pedidos Ganados ──────────────────────────────────────────── -->
      <div v-if="tab === 'orders'">
        <div v-if="ordersLoad" class="text-center py-20 text-[#555]">Cargando…</div>
        <div v-else-if="ordersErr" class="text-red-400 text-sm text-center py-10">{{ ordersErr }}</div>
        <div v-else-if="!orders.length" class="text-center py-20">
          <p class="text-[#555] text-sm">No tienes pedidos de subastas aún.</p>
          <router-link to="/auctions" class="mt-4 inline-block text-[#c9a96e] text-sm hover:underline">Ver subastas activas</router-link>
        </div>

        <div v-else class="flex flex-col gap-4">
          <div
            v-for="order in orders"
            :key="order.id"
            class="bg-[#0e0e0e] border border-[#1a1a1a] rounded-sm p-5 hover:border-[#c9a96e22] transition-colors"
          >
            <!-- Cabecera -->
            <div class="flex flex-wrap items-start justify-between gap-3 mb-4">
              <div>
                <div class="text-[10px] tracking-[0.2em] uppercase text-[#555] mb-1">
                  {{ order.expand?.store?.name || 'Tienda' }}
                </div>
                <div class="text-[#c9a96e] font-medium text-lg">
                  Bs {{ money(order.total) }}
                </div>
                <div class="text-[11px] text-[#555] mt-0.5">
                  {{ new Date(order.created).toLocaleDateString('es-BO', { day:'2-digit', month:'short', year:'numeric' }) }}
                </div>
              </div>
              <div class="flex flex-col items-end gap-1.5">
                <span :class="['text-[11px] tracking-[0.14em] uppercase font-medium', statusColor[order.status ?? '']]">
                  {{ statusLabel[order.status ?? ''] || order.status }}
                </span>
                <!-- Badge: comprobante subido -->
                <span v-if="proofUploaded(order)" class="text-[10px] text-blue-400 tracking-wide">
                  Comprobante enviado — esperando aprobación
                </span>
                <!-- Nota de rechazo -->
                <span v-if="order.status === 'rejected' && order.approval_note" class="text-[10px] text-red-400 max-w-50 text-right">
                  {{ order.approval_note }}
                </span>
              </div>
            </div>

            <!-- Info de pago pendiente -->
            <div v-if="!order.status && !hasProof(order)" class="bg-[#0a0a0a] border border-[#2a2a2a] rounded-sm p-3 mb-4">
              <div class="flex items-center gap-2 mb-1">
                <svg class="w-4 h-4 text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
                <span class="text-amber-400 text-[11px] tracking-wide uppercase font-medium">Pendiente de pago</span>
              </div>
              <p class="text-[12px] text-[#888] leading-relaxed">
                Debes pagar y subir tu comprobante antes del
                <strong class="text-[#c9a96e]">
                  {{ paymentDeadline(order) ? paymentDeadline(order).toLocaleDateString('es-BO', { day:'2-digit', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—' }}
                </strong>
              </p>
            </div>

            <!-- Subasta info -->
            <div v-if="order.expand?.bid" class="flex items-center gap-3 mb-4">
              <img
                v-if="auctionImage(order.expand.bid)"
                :src="auctionImage(order.expand.bid)"
                class="w-14 h-10 object-cover rounded-sm border border-[#1a1a1a] shrink-0"
              />
              <div>
                <p class="text-sm text-[#e8e5e0]">{{ order.expand.bid.title }}</p>
                <p class="text-[11px] text-[#555]">Precio final: Bs {{ money(order.expand.bid.current_price) }}</p>
              </div>
            </div>

            <!-- Acciones -->
            <div class="flex flex-wrap gap-2">
              <button
                v-if="canPay(order)"
                @click="openPayModal(order)"
                class="px-4 py-2 bg-[#c9a96e] text-[#0a0a0a] text-[11px] tracking-[0.14em] uppercase font-semibold rounded-sm hover:bg-[#d4b97e] transition-colors"
              >
                Pagar ahora
              </button>
              <button
                v-else-if="proofUploaded(order)"
                @click="openPayModal(order)"
                class="px-4 py-2 border border-[#c9a96e44] text-[#c9a96e] text-[11px] tracking-[0.14em] uppercase rounded-sm hover:border-[#c9a96e88] transition-colors"
              >
                Ver QR
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- ── Tab: Mis Pujas ────────────────────────────────────────────────── -->
      <div v-if="tab === 'bids'">
        <div v-if="bidsLoad" class="text-center py-20 text-[#555]">Cargando…</div>
        <div v-else-if="bidsErr" class="text-red-400 text-sm text-center py-10">{{ bidsErr }}</div>
        <div v-else-if="!bids.length" class="text-center py-20">
          <p class="text-[#555] text-sm">Aún no has pujado en ninguna subasta.</p>
          <router-link to="/auctions" class="mt-4 inline-block text-[#c9a96e] text-sm hover:underline">Ver subastas</router-link>
        </div>

        <div v-else class="flex flex-col gap-4">
          <div
            v-for="bid in bids"
            :key="bid.id"
            class="bg-[#0e0e0e] border border-[#1a1a1a] rounded-sm p-5 hover:border-[#c9a96e22] transition-colors"
          >
            <div class="flex flex-wrap items-start justify-between gap-3">
              <!-- Info subasta -->
              <div class="flex items-start gap-3">
                <img
                  v-if="bid.expand?.auction && auctionImage(bid.expand.auction)"
                  :src="auctionImage(bid.expand.auction)"
                  class="w-16 h-12 object-cover rounded-sm border border-[#1a1a1a] shrink-0"
                />
                <div>
                  <router-link
                    :to="`/auctions/${bid.auction}`"
                    class="text-[#e8e5e0] hover:text-[#c9a96e] transition-colors text-sm font-medium"
                  >
                    {{ bid.expand?.auction?.title || bid.auction }}
                  </router-link>
                  <p class="text-[11px] text-[#555] mt-0.5">
                    Tu puja: <span class="text-[#c9a96e]">Bs {{ money(bid.amount) }}</span>
                  </p>
                  <p class="text-[11px] text-[#555]">
                    Precio actual: Bs {{ money(bid.expand?.auction?.current_price) }}
                  </p>
                </div>
              </div>

              <!-- Estado -->
              <div class="flex flex-col items-end gap-2">
                <span :class="['text-[11px] tracking-[0.14em] uppercase font-medium', bidStatus(bid).cls]">
                  {{ bidStatus(bid).label }}
                </span>

                <!-- Si ganó y tiene pedido -->
                <router-link
                  v-if="bid.bid_order && bid.expand?.auction?.status === 'ended'"
                  @click="tab = 'orders'"
                  to="/bid-orders"
                  class="text-[11px] text-[#c9a96e] hover:underline"
                >
                  Ver pedido →
                </router-link>

                <!-- Si ganó pero no tiene pedido aún -->
                <span
                  v-else-if="bid.expand?.auction?.winner === session?.userId && !bid.bid_order"
                  class="text-[11px] text-amber-400"
                >
                  Procesando pedido…
                </span>

                <!-- Botón ver subasta activa -->
                <router-link
                  v-if="bid.expand?.auction?.status === 'active'"
                  :to="`/auctions/${bid.auction}`"
                  class="text-[10px] text-[#555] hover:text-[#c9a96e] transition-colors"
                >
                  Ver subasta
                </router-link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>

    <!-- ── Modal QR + comprobante ──────────────────────────────────────────── -->
    <Transition name="fade">
      <div
        v-if="showModal"
        class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
        @click.self="showModal = false"
      >
        <div class="bg-[#0e0e0e] border border-[#1f1f1f] rounded-sm w-full max-w-md max-h-[90vh] overflow-y-auto">
          <div class="flex items-center justify-between px-6 py-4 border-b border-[#1a1a1a]">
            <h2 class="text-[13px] tracking-[0.18em] uppercase text-[#e8e5e0]">Pagar subasta</h2>
            <button @click="showModal = false" class="text-[#555] hover:text-[#c9a96e] transition-colors text-xl leading-none">&times;</button>
          </div>

          <div class="p-6 flex flex-col gap-5">
            <!-- Monto -->
            <div class="bg-[#141414] rounded-sm p-4 text-center">
              <div class="text-[10px] tracking-[0.2em] uppercase text-[#555] mb-1">Total a pagar</div>
              <div class="text-2xl font-light text-[#c9a96e]">Bs {{ money(modalOrder?.total) }}</div>
              <div class="text-[11px] text-[#555] mt-1">{{ modalOrder?.expand?.store?.name }}</div>
            </div>

            <!-- QR de la tienda -->
            <div v-if="storeQrUrl" class="flex flex-col items-center gap-3">
              <p class="text-[11px] tracking-[0.15em] uppercase text-[#888]">Escanea el QR para pagar</p>
              <img :src="storeQrUrl" class="w-48 h-48 object-contain bg-white p-2 rounded-sm" alt="QR de pago" />
              <p v-if="storeInstr" class="text-[12px] text-[#888] text-center leading-relaxed">{{ storeInstr }}</p>
            </div>
            <div v-else class="text-[12px] text-[#555] text-center py-4">
              La tienda no tiene QR de pago configurado. Contáctalos directamente.
            </div>

            <!-- Upload comprobante -->
            <div v-if="canPay(modalOrder) || proofUploaded(modalOrder)">
              <p class="text-[11px] tracking-[0.15em] uppercase text-[#888] mb-3">
                {{ proofUploaded(modalOrder) ? 'Comprobante enviado' : 'Sube tu comprobante de pago' }}
              </p>

              <div v-if="!proofUploaded(modalOrder)">
                <label class="block cursor-pointer border border-dashed border-[#333] rounded-sm p-4 text-center hover:border-[#c9a96e44] transition-colors">
                  <input type="file" accept="image/*,.pdf" class="hidden" @change="onProofChange" />
                  <div v-if="proofPreview">
                    <img :src="proofPreview" class="w-full max-h-40 object-contain mb-2" />
                    <span class="text-[11px] text-[#888]">Cambiar imagen</span>
                  </div>
                  <div v-else>
                    <svg class="w-8 h-8 text-[#333] mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                    </svg>
                    <span class="text-[12px] text-[#555]">Seleccionar imagen o PDF</span>
                  </div>
                </label>

                <div v-if="uploadErr" class="mt-2 text-red-400 text-[11px]">{{ uploadErr }}</div>
                <div v-if="uploadOk" class="mt-2 text-emerald-400 text-[11px]">Comprobante enviado correctamente.</div>

                <button
                  v-if="proofFile"
                  :disabled="uploading"
                  @click="uploadProof"
                  class="mt-3 w-full py-2.5 bg-[#c9a96e] text-[#0a0a0a] text-[11px] tracking-[0.14em] uppercase font-semibold rounded-sm hover:bg-[#d4b97e] disabled:opacity-50 transition-colors"
                >
                  {{ uploading ? 'Enviando…' : 'Enviar comprobante' }}
                </button>
              </div>

              <div v-else class="flex items-center gap-2 text-emerald-400 text-[12px]">
                <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                Comprobante enviado. El vendedor lo revisará pronto.
              </div>
            </div>

            <!-- Vencido -->
            <div v-else-if="!canPay(modalOrder) && !hasProof(modalOrder) && modalOrder?.payment_until" class="text-amber-400 text-[12px] text-center">
              El plazo de pago ha vencido.
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <AppFooter />
  </div>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
