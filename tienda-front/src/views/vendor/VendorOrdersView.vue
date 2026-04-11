<script setup>
import { ref, onMounted, watch, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { useVendorApi } from '@/composables/useVendorApi'
import { useVendorStore } from '@/composables/useVendorStore'

const router = useRouter()
const api    = useVendorApi()
const { selectedStoreId, hasStore } = useVendorStore()

const orders     = ref([])
const loading    = ref(true)
const error      = ref('')
const totalItems = ref(0)
const totalPages = ref(1)
const page       = ref(1)
const filterStatus = ref('')
const search       = ref('')

// Modal detalle / aprobar
const showModal    = ref(false)
const currentOrder = ref(null)
const actionMode   = ref('view') // 'view' | 'approve' | 'reject'
const processing   = ref(false)
const actionError  = ref('')

// Formulario de aprobación
const shipAddress = ref({ name: '', phone: '', address: '', city: '', notes: '' })
const approvalNote = ref('')
const rejectReason = ref('')
const mapLat = ref(null)
const mapLng = ref(null)
let mapInstance = null
let mapMarker  = null

async function loadOrders() {
  if (!hasStore.value) { router.push('/vendor/select-store'); return }
  loading.value = true
  error.value   = ''
  try {
    const data = await api.listOrders({
      storeId: selectedStoreId.value,
      status: filterStatus.value,
      search: search.value,
      page: page.value,
    })
    orders.value     = data?.items || []
    totalItems.value = data?.totalItems || 0
    totalPages.value = data?.totalPages || 1
  } catch (e) { error.value = e.message }
  finally { loading.value = false }
}

onMounted(loadOrders)
watch([filterStatus, search], () => { page.value = 1; loadOrders() })
watch(page, loadOrders)

function openOrder(order, mode = 'view') {
  currentOrder.value = order
  actionMode.value   = mode
  actionError.value  = ''
  approvalNote.value = ''
  rejectReason.value = ''

  // Pre-cargar dirección si ya existe
  try {
    const addr = typeof order.shipping_address === 'string'
      ? JSON.parse(order.shipping_address)
      : (order.shipping_address || {})
    shipAddress.value = {
      name:    addr.name    || order.expand?.buyer?.name || '',
      phone:   addr.phone   || '',
      address: addr.address || '',
      city:    addr.city    || '',
      notes:   addr.notes   || '',
    }
    mapLat.value = addr.lat || null
    mapLng.value = addr.lng || null
  } catch {
    shipAddress.value = { name: '', phone: '', address: '', city: '', notes: '' }
    mapLat.value = null
    mapLng.value = null
  }

  showModal.value = true
  if (mode === 'approve') {
    setTimeout(initMap, 300)
  }
}

// ── Leaflet map ───────────────────────────────────────────────────────────────
function loadLeaflet() {
  return new Promise((resolve) => {
    if (window.L) { resolve(window.L); return }
    const link = document.createElement('link')
    link.rel   = 'stylesheet'
    link.href  = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
    document.head.appendChild(link)
    const script = document.createElement('script')
    script.src   = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
    script.onload = () => resolve(window.L)
    document.head.appendChild(script)
  })
}

async function initMap() {
  const L = await loadLeaflet()
  const el = document.getElementById('order-map')
  if (!el) return
  if (mapInstance) { mapInstance.remove(); mapInstance = null; mapMarker = null }

  const lat = mapLat.value || -17.783
  const lng = mapLng.value || -63.182
  mapInstance = L.map(el).setView([lat, lng], mapLat.value ? 15 : 13)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
  }).addTo(mapInstance)

  if (mapLat.value) {
    mapMarker = L.marker([mapLat.value, mapLng.value]).addTo(mapInstance)
  }

  mapInstance.on('click', (e) => {
    mapLat.value = e.latlng.lat
    mapLng.value = e.latlng.lng
    if (mapMarker) mapMarker.setLatLng(e.latlng)
    else mapMarker = L.marker(e.latlng).addTo(mapInstance)
  })
}

function closeModal() {
  showModal.value = false
  if (mapInstance) { mapInstance.remove(); mapInstance = null; mapMarker = null }
}

onBeforeUnmount(() => { if (mapInstance) { mapInstance.remove() } })

async function approveOrder() {
  actionError.value = ''
  if (!shipAddress.value.address.trim()) {
    actionError.value = 'La dirección de envío es obligatoria'
    return
  }
  processing.value = true
  try {
    await api.approveOrder(currentOrder.value.id, {
      shippingAddress: {
        ...shipAddress.value,
        lat: mapLat.value,
        lng: mapLng.value,
      },
      note: approvalNote.value,
      lat: mapLat.value,
      lng: mapLng.value,
    })
    closeModal()
    await loadOrders()
  } catch (e) { actionError.value = e.message }
  finally { processing.value = false }
}

async function rejectOrder() {
  actionError.value = ''
  processing.value  = true
  try {
    await api.rejectOrder(currentOrder.value.id, rejectReason.value)
    closeModal()
    await loadOrders()
  } catch (e) { actionError.value = e.message }
  finally { processing.value = false }
}

async function shipOrder(order) {
  try {
    await api.shipOrder(order.id)
    await loadOrders()
  } catch (e) { error.value = e.message }
}

async function deliverOrder(order) {
  try {
    await api.deliverOrder(order.id)
    await loadOrders()
  } catch (e) { error.value = e.message }
}

const PB = import.meta.env.VITE_POCKETBASE_URL || ''
function proofUrl(order) {
  if (!order?.payment_proof || !order?.id) return ''
  return `${PB}/api/files/orders/${order.id}/${order.payment_proof}`
}

function money(v) { return new Intl.NumberFormat('es-BO', { maximumFractionDigits: 0 }).format(Number(v || 0)) }
function fmtDate(d) { return d ? new Date(d).toLocaleDateString('es-BO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—' }

const STATUS_LABELS = {
  reserved: 'Reservado', payment_uploaded: 'Pago enviado',
  approved: 'Aprobado', shipped: 'Enviado',
  delivered: 'Entregado', cancelled: 'Cancelado', rejected: 'Rechazado',
}
const STATUS_COLORS = {
  reserved:         'text-[#888] border-[#333] bg-[#111]',
  payment_uploaded: 'text-yellow-400 border-yellow-900/50 bg-yellow-950/40',
  approved:         'text-blue-400 border-blue-900/50 bg-blue-950/40',
  shipped:          'text-purple-400 border-purple-900/50 bg-purple-950/40',
  delivered:        'text-emerald-400 border-emerald-900/50 bg-emerald-950/40',
  cancelled:        'text-[#555] border-[#333] bg-[#111]',
  rejected:         'text-red-400 border-red-900/50 bg-red-950/40',
}
</script>

<template>
  <div class="p-5 lg:p-8 min-h-screen">

    <div class="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
      <div class="flex-1">
        <p class="text-[10px] tracking-[0.2em] uppercase text-[#3a3a38] mb-0.5">Vendedor</p>
        <h1 class="text-xl lg:text-2xl font-light tracking-wide text-[#e8e5e0]">Órdenes</h1>
      </div>
    </div>

    <!-- Filtros -->
    <div class="flex flex-col sm:flex-row gap-3 mb-5 flex-wrap">
      <input v-model="search" type="text" placeholder="Buscar por referencia..." class="input-field flex-1 max-w-xs" />
      <select v-model="filterStatus" class="input-field w-44">
        <option value="">Todas las órdenes</option>
        <option v-for="(label, val) in STATUS_LABELS" :key="val" :value="val">{{ label }}</option>
      </select>
      <span class="text-[11px] text-[#555] self-center">{{ totalItems }} órdenes</span>
    </div>

    <div v-if="error" class="mb-4 px-4 py-3 bg-red-950/40 border border-red-900/50 text-red-400 text-sm rounded-sm">{{ error }}</div>
    <div v-if="loading" class="flex items-center justify-center py-20 text-[#555] text-sm">Cargando...</div>

    <div v-else-if="!orders.length" class="panel flex items-center justify-center py-20">
      <div class="text-center">
        <svg class="w-10 h-10 text-[#2a2a2a] mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
        <p class="text-[#555] text-sm">No hay órdenes</p>
      </div>
    </div>

    <!-- Tabla de órdenes -->
    <div v-else class="overflow-x-auto rounded-sm border border-[#181818]">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-[#181818] bg-[#0c0c0c]">
            <th class="th">Comprador</th>
            <th class="th hidden sm:table-cell">Total</th>
            <th class="th">Estado</th>
            <th class="th hidden lg:table-cell">Fecha</th>
            <th class="th w-36"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="order in orders" :key="order.id" class="border-b border-[#111] bg-[#080808] hover:bg-[#0c0c0c] transition-colors">
            <!-- Comprador -->
            <td class="td">
              <p class="text-[13px] text-[#e8e5e0]">{{ order.expand?.buyer?.name || 'Comprador' }}</p>
              <p class="text-[10px] text-[#555] truncate max-w-32">{{ order.expand?.buyer?.email }}</p>
            </td>
            <!-- Total -->
            <td class="td hidden sm:table-cell text-[#c9a96e]">Bs {{ money(order.total) }}</td>
            <!-- Estado -->
            <td class="td">
              <span class="status-badge" :class="STATUS_COLORS[order.status]">{{ STATUS_LABELS[order.status] || order.status }}</span>
            </td>
            <!-- Fecha -->
            <td class="td hidden lg:table-cell text-[11px] text-[#555]">{{ fmtDate(order.created) }}</td>
            <!-- Acciones -->
            <td class="td">
              <div class="flex items-center gap-1.5 justify-end flex-wrap">
                <!-- Ver detalles -->
                <button class="action-btn" @click="openOrder(order, 'view')">Ver</button>
                <!-- Aprobar (solo si pago subido) -->
                <button
                  v-if="order.status === 'payment_uploaded'"
                  class="action-btn text-emerald-400/80 border-emerald-900/40 hover:bg-emerald-950/30"
                  @click="openOrder(order, 'approve')"
                >Aprobar</button>
                <!-- Rechazar -->
                <button
                  v-if="order.status === 'payment_uploaded'"
                  class="action-btn text-red-400/70 border-red-900/40 hover:bg-red-950/30"
                  @click="openOrder(order, 'reject')"
                >Rechazar</button>
                <!-- Enviar -->
                <button
                  v-if="order.status === 'approved'"
                  class="action-btn text-purple-400/80 border-purple-900/40 hover:bg-purple-950/30"
                  @click="shipOrder(order)"
                >Enviar</button>
                <!-- Entregado -->
                <button
                  v-if="order.status === 'shipped'"
                  class="action-btn text-blue-400/80 border-blue-900/40 hover:bg-blue-950/30"
                  @click="deliverOrder(order)"
                >Entregado</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Paginación -->
    <div v-if="totalPages > 1" class="flex items-center justify-center gap-2 mt-5">
      <button class="page-btn" :disabled="page <= 1" @click="page--">←</button>
      <span class="text-[11px] text-[#555]">{{ page }} / {{ totalPages }}</span>
      <button class="page-btn" :disabled="page >= totalPages" @click="page++">→</button>
    </div>

    <!-- ════ MODAL DETALLE / APROBAR / RECHAZAR ═══════════════════════════ -->
    <Transition name="modal">
      <div v-if="showModal && currentOrder" class="fixed inset-0 z-50 flex items-start justify-center bg-black/70 backdrop-blur-sm overflow-y-auto py-8 px-4">
        <div class="modal-box w-full max-w-2xl my-auto">

          <div class="flex items-center justify-between mb-5">
            <div>
              <p class="text-[9px] tracking-[0.2em] uppercase text-[#3a3a38]">Orden</p>
              <h2 class="text-[14px] font-medium text-[#e8e5e0]">
                {{ actionMode === 'approve' ? 'Aprobar orden' : actionMode === 'reject' ? 'Rechazar orden' : 'Detalle de orden' }}
              </h2>
            </div>
            <button class="icon-btn" @click="closeModal">
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>

          <div v-if="actionError" class="mb-4 px-3 py-2 bg-red-950/40 border border-red-900/50 text-red-400 text-xs rounded-sm">{{ actionError }}</div>

          <!-- Info del comprador + estado -->
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
            <div class="mini-stat">
              <span>Comprador</span>
              <strong class="truncate">{{ currentOrder.expand?.buyer?.name || 'N/A' }}</strong>
            </div>
            <div class="mini-stat">
              <span>Total</span>
              <strong class="text-[#c9a96e]">Bs {{ money(currentOrder.total) }}</strong>
            </div>
            <div class="mini-stat">
              <span>Estado</span>
              <strong><span class="status-badge" :class="STATUS_COLORS[currentOrder.status]">{{ STATUS_LABELS[currentOrder.status] }}</span></strong>
            </div>
            <div class="mini-stat">
              <span>Fecha</span>
              <strong>{{ fmtDate(currentOrder.created) }}</strong>
            </div>
          </div>

          <!-- Items de la orden -->
          <div v-if="currentOrder.items?.length" class="mb-5">
            <p class="text-[9px] tracking-[0.2em] uppercase text-[#3a3a38] mb-2">Productos</p>
            <div class="flex flex-col gap-1.5">
              <div v-for="item in currentOrder.items" :key="item.id"
                class="flex items-center justify-between px-3 py-2 bg-[#0f0f0f] border border-[#1a1a1a] rounded-sm">
                <div>
                  <p class="text-[12px] text-[#d8d5cf]">{{ item.expand?.product?.name || 'Producto' }}</p>
                  <p class="text-[10px] text-[#555]">Cant: {{ item.quantity }}</p>
                </div>
                <span class="text-[12px] text-[#c9a96e]">Bs {{ money(item.total) }}</span>
              </div>
            </div>
          </div>

          <!-- Comprobante de pago -->
          <div v-if="currentOrder.payment_proof" class="mb-5">
            <p class="text-[9px] tracking-[0.2em] uppercase text-[#3a3a38] mb-2">Comprobante de pago</p>
            <a :href="proofUrl(currentOrder)" target="_blank" rel="noopener"
              class="inline-flex items-center gap-2 px-3 py-2 bg-[#0f0f0f] border border-[#1e2e28] rounded-sm text-[#8ab4a0] text-xs hover:bg-[#0d110f] transition-colors">
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              Ver comprobante
            </a>
          </div>

          <!-- Notas del comprador -->
          <div v-if="currentOrder.notes" class="mb-5 px-3 py-2 bg-[#0f0f0f] border border-[#1a1a1a] rounded-sm">
            <p class="text-[9px] tracking-[0.16em] uppercase text-[#3a3a38] mb-1">Notas del comprador</p>
            <p class="text-[12px] text-[#888]">{{ currentOrder.notes }}</p>
          </div>

          <!-- FORMULARIO DE APROBACIÓN -->
          <template v-if="actionMode === 'approve'">
            <div class="border-t border-[#181818] pt-5 mt-2">
              <p class="text-[10px] tracking-[0.2em] uppercase text-[#3a3a38] mb-4">Dirección de envío</p>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                <div>
                  <label class="form-label">Nombre destinatario</label>
                  <input v-model="shipAddress.name" type="text" class="input-field w-full" placeholder="Nombre completo" />
                </div>
                <div>
                  <label class="form-label">Teléfono</label>
                  <input v-model="shipAddress.phone" type="text" class="input-field w-full" placeholder="+591 ..." />
                </div>
                <div class="sm:col-span-2">
                  <label class="form-label">Dirección *</label>
                  <input v-model="shipAddress.address" type="text" class="input-field w-full" placeholder="Calle, número, barrio..." />
                </div>
                <div>
                  <label class="form-label">Ciudad</label>
                  <input v-model="shipAddress.city" type="text" class="input-field w-full" placeholder="Ciudad" />
                </div>
                <div>
                  <label class="form-label">Nota interna</label>
                  <input v-model="approvalNote" type="text" class="input-field w-full" placeholder="Opcional" />
                </div>
                <div class="sm:col-span-2">
                  <label class="form-label">Notas adicionales</label>
                  <input v-model="shipAddress.notes" type="text" class="input-field w-full" placeholder="Instrucciones de entrega..." />
                </div>
              </div>

              <!-- Mapa -->
              <div>
                <label class="form-label">
                  Ubicación en mapa
                  <span class="text-[#555] normal-case">(clic para marcar)</span>
                </label>
                <div id="order-map" class="w-full h-56 rounded-sm border border-[#1e1e1e] overflow-hidden z-0"></div>
                <p v-if="mapLat" class="text-[10px] text-[#555] mt-1">
                  Lat: {{ mapLat?.toFixed(5) }} · Lng: {{ mapLng?.toFixed(5) }}
                </p>
              </div>
            </div>
          </template>

          <!-- FORMULARIO DE RECHAZO -->
          <template v-if="actionMode === 'reject'">
            <div class="border-t border-[#181818] pt-5 mt-2">
              <label class="form-label">Motivo del rechazo</label>
              <textarea v-model="rejectReason" class="input-field w-full h-20 resize-none" placeholder="Explica el motivo al comprador..."></textarea>
            </div>
          </template>

          <!-- Acciones del modal -->
          <div class="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-[#181818] flex-wrap">
            <button class="btn-ghost" :disabled="processing" @click="closeModal">
              {{ actionMode === 'view' ? 'Cerrar' : 'Cancelar' }}
            </button>
            <button v-if="actionMode === 'approve'" class="btn-approve" :disabled="processing" @click="approveOrder">
              {{ processing ? 'Aprobando...' : 'Aprobar orden' }}
            </button>
            <button v-if="actionMode === 'reject'" class="btn-danger" :disabled="processing" @click="rejectOrder">
              {{ processing ? 'Rechazando...' : 'Rechazar orden' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>

  </div>
</template>

<style scoped>
.panel { background: #0c0c0c; border: 1px solid #181818; border-radius: 3px; padding: 1rem; }
.th { padding: 0.65rem 0.9rem; font-size: 0.62rem; letter-spacing: 0.16em; text-transform: uppercase; color: #3a3a38; text-align: left; }
.td { padding: 0.7rem 0.9rem; }
.status-badge { font-size: 0.58rem; letter-spacing: 0.14em; text-transform: uppercase; padding: 0.18rem 0.45rem; border-radius: 2px; border-width: 1px; border-style: solid; }
.icon-btn { padding: 0.3rem; border-radius: 2px; color: #555; transition: color 0.15s, background 0.15s; }
.icon-btn:hover { color: #d8d5cf; background: #111; }
.action-btn { padding: 0.25rem 0.6rem; font-size: 0.68rem; letter-spacing: 0.08em; border-radius: 2px; border: 1px solid #222; color: #666; background: transparent; transition: all 0.15s; white-space: nowrap; }
.action-btn:hover { border-color: #333; color: #aaa; background: #111; }
.input-field { background: #0f0f0f; border: 1px solid #1e1e1e; border-radius: 2px; padding: 0.45rem 0.65rem; font-size: 0.8rem; color: #d8d5cf; outline: none; transition: border-color 0.15s; }
.input-field:focus { border-color: #8ab4a044; }
.form-label { display: block; font-size: 0.62rem; letter-spacing: 0.14em; text-transform: uppercase; color: #555; margin-bottom: 0.4rem; }
.mini-stat { display: flex; flex-direction: column; gap: 0.25rem; padding: 0.5rem 0.65rem; background: #0f0f0f; border: 1px solid #1a1a1a; border-radius: 3px; font-size: 0.62rem; }
.mini-stat span { color: #555; text-transform: uppercase; letter-spacing: 0.1em; }
.mini-stat strong { color: #d8d5cf; font-weight: 500; font-size: 0.8rem; }
.btn-approve { padding: 0.5rem 1rem; background: #064e3b33; border: 1px solid #065f4655; border-radius: 2px; color: #6ee7b7; font-size: 0.75rem; transition: all 0.15s; }
.btn-approve:hover:not(:disabled) { background: #064e3b55; }
.btn-approve:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-ghost { padding: 0.5rem 1rem; background: transparent; border: 1px solid #222; border-radius: 2px; color: #666; font-size: 0.75rem; transition: all 0.15s; }
.btn-ghost:hover:not(:disabled) { border-color: #333; color: #aaa; }
.btn-ghost:disabled { opacity: 0.5; }
.btn-danger { padding: 0.5rem 1rem; background: #7f1d1d33; border: 1px solid #991b1b55; border-radius: 2px; color: #f87171; font-size: 0.75rem; transition: all 0.15s; }
.btn-danger:hover:not(:disabled) { background: #7f1d1d55; }
.btn-danger:disabled { opacity: 0.5; }
.page-btn { padding: 0.3rem 0.7rem; background: #0f0f0f; border: 1px solid #1e1e1e; border-radius: 2px; color: #666; font-size: 0.75rem; transition: all 0.15s; }
.page-btn:hover:not(:disabled) { color: #aaa; border-color: #333; }
.page-btn:disabled { opacity: 0.3; cursor: not-allowed; }
.modal-box { background: #0a0a0a; border: 1px solid #1e1e1e; border-radius: 4px; padding: 1.5rem; }
.modal-enter-active, .modal-leave-active { transition: opacity 0.2s ease; }
.modal-enter-from, .modal-leave-to { opacity: 0; }
</style>
