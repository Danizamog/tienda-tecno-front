<script setup>
import { ref, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useVendorApi } from '@/composables/useVendorApi'
import { useVendorStore } from '@/composables/useVendorStore'
import { useAuthSession } from '@/composables/useAuthSession'

const router   = useRouter()
const api      = useVendorApi()
const { session }             = useAuthSession()
const { selectedStore, selectedStoreId, hasStore } = useVendorStore()

const API = (import.meta.env.VITE_GATEWAY_API_BASE_URL || '').replace(/\/$/, '')
const PB  = (import.meta.env.VITE_POCKETBASE_URL || '').replace(/\/$/, '')

const orders      = ref([])
const loading     = ref(true)
const error       = ref('')
const statusFilter = ref('')

// Modal comprobante
const showProof    = ref(false)
const proofOrder   = ref(null)
const proofBlobUrl = ref('')

// Modal acción
const showAction   = ref(false)
const actionOrder  = ref(null)
const actionType   = ref('') // 'approve' | 'reject' | 'ship' | 'deliver'
const actionNote   = ref('')
const actionLoad   = ref(false)
const actionErr    = ref('')

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    'X-User-Id':    session.value?.userId || '',
    'X-User-Role':  session.value?.role || 'user',
  }
}

async function loadOrders() {
  if (!hasStore.value) { router.push('/vendor/select-store'); return }
  loading.value = true
  error.value   = ''
  try {
    const params = new URLSearchParams({
      storeId: selectedStoreId.value,
      perPage: '50',
      sort:    '-created',
    })
    if (statusFilter.value) params.set('status', statusFilter.value)

    const res = await fetch(`${API}/orders-bid?${params}`, { headers: authHeaders() })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Error al cargar pedidos')
    orders.value = data.items || []
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

// ── Ver comprobante ────────────────────────────────────────────────────────────
async function viewProof(order) {
  proofOrder.value  = order
  proofBlobUrl.value = ''
  showProof.value   = true

  if (!order.payment_proof) return

  try {
    const res = await fetch(
      `${API}/orders-bid/files/orders-bid/${order.id}/${order.payment_proof}`,
      { headers: authHeaders() }
    )
    if (res.ok) {
      const blob = await res.blob()
      proofBlobUrl.value = URL.createObjectURL(blob)
    }
  } catch { /* silencioso */ }
}

// ── Abrir modal de acción ──────────────────────────────────────────────────────
function openAction(order, type) {
  actionOrder.value = order
  actionType.value  = type
  actionNote.value  = ''
  actionErr.value   = ''
  showAction.value  = true
}

const actionLabels = {
  approve: 'Aprobar pedido',
  reject:  'Rechazar pedido',
  ship:    'Marcar como enviado',
  deliver: 'Marcar como entregado',
}

async function confirmAction() {
  if (!actionOrder.value) return
  actionLoad.value = true
  actionErr.value  = ''
  try {
    const url = `${API}/orders-bid/${actionOrder.value.id}/${actionType.value}`
    const body = {}
    if (actionType.value === 'approve') body.approval_note = actionNote.value
    if (actionType.value === 'reject')  body.reason        = actionNote.value

    const res = await fetch(url, {
      method:  'PATCH',
      headers: authHeaders(),
      body:    JSON.stringify(body),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Error al procesar acción')

    showAction.value = false
    await loadOrders()
  } catch (e) {
    actionErr.value = e.message
  } finally {
    actionLoad.value = false
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
  return `${PB}/api/files/auctions/${auction.id}/${imgs[0]}?thumb=100x80`
}

const statusLabel = {
  pending:   'Pendiente de pago',
  '':        'Pendiente de pago',
  approved:  'Aprobado',
  shipped:   'Enviado',
  delivered: 'Entregado',
  rejected:  'Rechazado',
  calcelled: 'Cancelado',
  cancelled: 'Cancelado',
}

const statusColor = {
  pending:   'bg-amber-900/20 text-amber-400 border-amber-900/40',
  '':        'bg-amber-900/20 text-amber-400 border-amber-900/40',
  approved:  'bg-emerald-900/20 text-emerald-400 border-emerald-900/40',
  shipped:   'bg-blue-900/20 text-blue-400 border-blue-900/40',
  delivered: 'bg-emerald-900/30 text-emerald-300 border-emerald-900/40',
  rejected:  'bg-red-900/20 text-red-400 border-red-900/40',
  calcelled: 'bg-[#111] text-[#555] border-[#222]',
  cancelled: 'bg-[#111] text-[#555] border-[#222]',
}

function isPending(order) {
  return order.status === 'pending' || order.status === '' || order.status == null
}

function hasProof(order) { return !!order.payment_proof }

function canApprove(order)  { return isPending(order) && hasProof(order) }
function canReject(order)   { return isPending(order) || order.status === 'approved' }
function canShip(order)     { return order.status === 'approved' }
function canDeliver(order)  { return order.status === 'shipped' }

watch(statusFilter, loadOrders)

onMounted(loadOrders)
</script>

<template>
  <div>
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
      <h1 class="text-xl font-light tracking-widest uppercase text-[#f0ede8]">Pedidos de Subastas</h1>
      <select
        v-model="statusFilter"
        class="bg-[#0f0f0f] border border-[#222] text-[#aaa] text-[12px] tracking-wide rounded-sm px-3 py-2 focus:outline-none focus:border-[#c9a96e44]"
      >
        <option value="">Todos los estados</option>
        <option value="">Pendientes de pago</option>
        <option value="approved">Aprobados</option>
        <option value="shipped">Enviados</option>
        <option value="delivered">Entregados</option>
        <option value="rejected">Rechazados</option>
        <option value="calcelled">Cancelados</option>
      </select>
    </div>

    <div v-if="loading" class="text-center py-16 text-[#555]">Cargando…</div>
    <div v-else-if="error" class="text-red-400 text-sm text-center py-10">{{ error }}</div>
    <div v-else-if="!orders.length" class="text-center py-16 text-[#555] text-sm">
      No hay pedidos de subastas para este filtro.
    </div>

    <div v-else class="flex flex-col gap-4">
      <div
        v-for="order in orders"
        :key="order.id"
        class="bg-[#0c0c0c] border border-[#1a1a1a] rounded-sm p-5 hover:border-[#c9a96e22] transition-colors"
      >
        <div class="flex flex-wrap items-start justify-between gap-3 mb-4">
          <!-- Info comprador + monto -->
          <div>
            <div class="text-[10px] tracking-[0.2em] uppercase text-[#555] mb-1">
              {{ order.expand?.buyer?.name || order.expand?.buyer?.email || 'Comprador' }}
            </div>
            <div class="text-[#c9a96e] font-medium text-lg">
              Bs {{ money(order.total) }}
            </div>
            <div class="text-[11px] text-[#555] mt-0.5">
              {{ new Date(order.created).toLocaleDateString('es-BO', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) }}
            </div>
            <div v-if="order.payment_until" class="text-[11px] text-amber-400/70 mt-0.5">
              Pagar hasta: {{ new Date(order.payment_until).toLocaleDateString('es-BO', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }) }}
            </div>
          </div>

          <!-- Estado -->
          <div class="flex flex-col items-end gap-2">
            <span :class="['text-[10px] tracking-[0.14em] uppercase px-2.5 py-1 rounded-sm border', statusColor[order.status ?? '']]">
              {{ statusLabel[order.status ?? ''] || order.status }}
            </span>
            <span v-if="hasProof(order) && !order.status" class="text-[10px] text-blue-400">
              Comprobante recibido
            </span>
          </div>
        </div>

        <!-- Info subasta -->
        <div v-if="order.expand?.bid" class="flex items-center gap-3 mb-4 p-3 bg-[#090909] rounded-sm border border-[#151515]">
          <img
            v-if="auctionImage(order.expand.bid)"
            :src="auctionImage(order.expand.bid)"
            class="w-12 h-9 object-cover rounded-sm border border-[#1a1a1a] shrink-0"
          />
          <div>
            <p class="text-sm text-[#e8e5e0]">{{ order.expand.bid.title }}</p>
            <p class="text-[11px] text-[#555]">Precio final: Bs {{ money(order.expand.bid.current_price) }}</p>
          </div>
        </div>

        <!-- Nota de aprobación -->
        <div v-if="order.approval_note" class="text-[11px] text-[#888] mb-3">
          Nota: {{ order.approval_note }}
        </div>

        <!-- Acciones -->
        <div class="flex flex-wrap gap-2">
          <!-- Ver comprobante -->
          <button
            v-if="hasProof(order)"
            @click="viewProof(order)"
            class="px-3 py-1.5 border border-[#2a2a2a] text-[#aaa] text-[10px] tracking-[0.14em] uppercase rounded-sm hover:border-[#c9a96e44] hover:text-[#c9a96e] transition-colors"
          >
            Ver comprobante
          </button>

          <!-- Aprobar -->
          <button
            v-if="canApprove(order)"
            @click="openAction(order, 'approve')"
            class="px-3 py-1.5 bg-emerald-900/30 border border-emerald-900/50 text-emerald-400 text-[10px] tracking-[0.14em] uppercase rounded-sm hover:bg-emerald-900/50 transition-colors"
          >
            Aprobar
          </button>

          <!-- Rechazar -->
          <button
            v-if="canReject(order)"
            @click="openAction(order, 'reject')"
            class="px-3 py-1.5 bg-red-900/20 border border-red-900/40 text-red-400 text-[10px] tracking-[0.14em] uppercase rounded-sm hover:bg-red-900/40 transition-colors"
          >
            Rechazar
          </button>

          <!-- Enviar -->
          <button
            v-if="canShip(order)"
            @click="openAction(order, 'ship')"
            class="px-3 py-1.5 bg-blue-900/20 border border-blue-900/40 text-blue-400 text-[10px] tracking-[0.14em] uppercase rounded-sm hover:bg-blue-900/40 transition-colors"
          >
            Marcar enviado
          </button>

          <!-- Entregar -->
          <button
            v-if="canDeliver(order)"
            @click="openAction(order, 'deliver')"
            class="px-3 py-1.5 bg-emerald-900/20 border border-emerald-900/40 text-emerald-400 text-[10px] tracking-[0.14em] uppercase rounded-sm hover:bg-emerald-900/40 transition-colors"
          >
            Marcar entregado
          </button>
        </div>
      </div>
    </div>

    <!-- ── Modal: Ver comprobante ──────────────────────────────────────────── -->
    <Transition name="fade">
      <div
        v-if="showProof"
        class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
        @click.self="showProof = false"
      >
        <div class="bg-[#0e0e0e] border border-[#1f1f1f] rounded-sm w-full max-w-md">
          <div class="flex items-center justify-between px-5 py-3.5 border-b border-[#1a1a1a]">
            <h2 class="text-[12px] tracking-[0.18em] uppercase text-[#e8e5e0]">Comprobante de pago</h2>
            <button @click="showProof = false" class="text-[#555] hover:text-[#c9a96e] text-xl leading-none">&times;</button>
          </div>
          <div class="p-5">
            <div v-if="proofBlobUrl">
              <img :src="proofBlobUrl" class="w-full max-h-80 object-contain rounded-sm" alt="Comprobante" />
            </div>
            <div v-else class="text-center py-10 text-[#555] text-sm">
              Cargando comprobante…
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <!-- ── Modal: Confirmar acción ─────────────────────────────────────────── -->
    <Transition name="fade">
      <div
        v-if="showAction"
        class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
        @click.self="showAction = false"
      >
        <div class="bg-[#0e0e0e] border border-[#1f1f1f] rounded-sm w-full max-w-sm">
          <div class="flex items-center justify-between px-5 py-3.5 border-b border-[#1a1a1a]">
            <h2 class="text-[12px] tracking-[0.18em] uppercase text-[#e8e5e0]">{{ actionLabels[actionType] }}</h2>
            <button @click="showAction = false" class="text-[#555] hover:text-[#c9a96e] text-xl leading-none">&times;</button>
          </div>
          <div class="p-5 flex flex-col gap-4">
            <!-- Información de la orden -->
            <div class="bg-[#141414] rounded-sm p-3 text-sm text-[#888]">
              Comprador: <span class="text-[#e8e5e0]">{{ actionOrder?.expand?.buyer?.name || actionOrder?.expand?.buyer?.email }}</span><br />
              Total: <span class="text-[#c9a96e]">Bs {{ money(actionOrder?.total) }}</span>
            </div>

            <!-- Nota (aprobar o rechazar) -->
            <div v-if="actionType === 'approve' || actionType === 'reject'">
              <label class="block text-[10px] tracking-[0.15em] uppercase text-[#666] mb-1.5">
                {{ actionType === 'approve' ? 'Nota (opcional)' : 'Motivo del rechazo' }}
              </label>
              <textarea
                v-model="actionNote"
                rows="3"
                :placeholder="actionType === 'reject' ? 'Ej: Comprobante no válido...' : 'Instrucciones adicionales...'"
                class="w-full bg-[#0a0a0a] border border-[#222] text-[#e8e5e0] text-sm rounded-sm px-3 py-2 focus:outline-none focus:border-[#c9a96e44] resize-none"
              />
            </div>

            <!-- Advertencia rechazar -->
            <div v-if="actionType === 'reject'" class="bg-amber-900/10 border border-amber-900/30 rounded-sm p-3 text-[11px] text-amber-400 leading-relaxed">
              Al rechazar, la subasta se reactivará automáticamente para nuevas pujas.
            </div>

            <div v-if="actionErr" class="text-red-400 text-[11px]">{{ actionErr }}</div>

            <div class="flex gap-2">
              <button
                @click="showAction = false"
                class="flex-1 py-2 border border-[#222] text-[#888] text-[11px] tracking-[0.14em] uppercase rounded-sm hover:border-[#333] transition-colors"
              >
                Cancelar
              </button>
              <button
                :disabled="actionLoad"
                @click="confirmAction"
                :class="[
                  'flex-1 py-2 text-[11px] tracking-[0.14em] uppercase font-semibold rounded-sm transition-colors disabled:opacity-50',
                  actionType === 'reject'
                    ? 'bg-red-900/40 border border-red-900/60 text-red-400 hover:bg-red-900/60'
                    : 'bg-[#c9a96e] text-[#0a0a0a] hover:bg-[#d4b97e]'
                ]"
              >
                {{ actionLoad ? 'Procesando…' : 'Confirmar' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
