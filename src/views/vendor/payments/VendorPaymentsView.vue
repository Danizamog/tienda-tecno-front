<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useVendorApi } from '@/composables/useVendorApi'
import { useVendorStore } from '@/composables/useVendorStore'

const router = useRouter()
const api    = useVendorApi()
const { selectedStore, selectedStoreId, hasStore, setStore } = useVendorStore()

const orders     = ref([])
const loading    = ref(true)
const error      = ref('')
const totalItems = ref(0)
const totalPages = ref(1)
const page       = ref(1)

// QR upload
const qrFile         = ref(null)
const qrPreview      = ref('')
const instructions   = ref('')
const uploadingQr    = ref(false)
const qrError        = ref('')
const qrSuccess      = ref(false)
const currentQrUrl   = ref('')

// Modal comprobante
const showProof    = ref(false)
const proofOrder   = ref(null)
const proofBlobUrl = ref('')

// Configuración de envíos
const shippingCostInput   = ref('')
const freeShippingInput   = ref('')
const savingShipping      = ref(false)
const shippingError       = ref('')
const shippingSuccess     = ref(false)

async function loadOrders() {
  if (!hasStore.value) { router.push('/vendor/select-store'); return }
  loading.value = true
  error.value   = ''
  try {
    const data = await api.listOrders({
      storeId: selectedStoreId.value,
      status: 'approved',      // solo aprobadas
      page: page.value,
    })
    // También traer las enviadas y entregadas
    const data2 = await api.listOrders({
      storeId: selectedStoreId.value,
      status: 'shipped',
      page: 1,
      perPage: 50,
    })
    const data3 = await api.listOrders({
      storeId: selectedStoreId.value,
      status: 'delivered',
      page: 1,
      perPage: 50,
    })
    const all = [
      ...(data?.items || []),
      ...(data2?.items || []),
      ...(data3?.items || []),
    ]
    // Dedup por id
    const seen = new Set()
    orders.value = all.filter(o => { if (seen.has(o.id)) return false; seen.add(o.id); return true })
    totalItems.value = orders.value.length
    totalPages.value = data?.totalPages || 1
  } catch (e) { error.value = e.message }
  finally { loading.value = false }
}

async function loadStoreDetails() {
  const store = selectedStore.value
  if (!store?.id) return null
  const pb = import.meta.env.VITE_POCKETBASE_URL || ''
  const res = await fetch(`${pb}/api/collections/stores/records/${store.id}?fields=id,name,payment_qr,payment_instructions,shipping_cost,free_shipping`)
  if (!res.ok) return null
  return res.json()
}

async function loadCurrentQr() {
  const store = selectedStore.value
  if (!store?.id) {
    currentQrUrl.value = ''
    instructions.value = ''
    return
  }

  let source = store
  if (!source.payment_qr) {
    const freshStore = await loadStoreDetails()
    if (freshStore) source = freshStore
  }

  const pb = import.meta.env.VITE_POCKETBASE_URL || ''
  currentQrUrl.value = source?.payment_qr ? `${pb}/api/files/stores/${source.id}/${source.payment_qr}` : ''
  instructions.value = source?.payment_instructions || ''

  if (source && (source.payment_qr !== store.payment_qr || source.payment_instructions !== store.payment_instructions)) {
    setStore({ ...store, ...source })
  }
}

function loadShippingConfig() {
  const store = selectedStore.value
  if (!store) return
  shippingCostInput.value  = store.shipping_cost  != null ? String(store.shipping_cost)  : '30'
  freeShippingInput.value  = store.free_shipping   != null ? String(store.free_shipping)  : '200'
}

async function saveShippingConfig() {
  shippingError.value   = ''
  shippingSuccess.value = false
  const cost      = parseFloat(shippingCostInput.value)
  const threshold = parseFloat(freeShippingInput.value)
  if (isNaN(cost) || cost < 0)      { shippingError.value = 'El costo de envío debe ser un número positivo.'; return }
  if (isNaN(threshold) || threshold < 0) { shippingError.value = 'El monto mínimo para envío gratis debe ser un número positivo.'; return }
  savingShipping.value = true
  try {
    const updated = await api.updateStoreInfo(selectedStoreId.value, { shipping_cost: cost, free_shipping: threshold })
    if (updated) setStore({ ...selectedStore.value, ...updated })
    shippingSuccess.value = true
  } catch (e) { shippingError.value = e.message }
  finally { savingShipping.value = false }
}

onMounted(() => { loadOrders(); loadCurrentQr(); loadShippingConfig() })
watch(selectedStoreId, () => { loadOrders(); loadCurrentQr(); loadShippingConfig() })
watch(page, loadOrders)

function onQrFileChange(e) {
  const file = e.target.files?.[0]
  if (!file) return
  qrFile.value    = file
  qrPreview.value = URL.createObjectURL(file)
  qrSuccess.value = false
  qrError.value   = ''
}

async function uploadQr() {
  if (!qrFile.value) { qrError.value = 'Selecciona un archivo primero'; return }
  uploadingQr.value = true
  qrError.value     = ''
  qrSuccess.value   = false
  try {
    const updated = await api.uploadStoreQr(selectedStoreId.value, qrFile.value, instructions.value)
    // Actualizar estado de la tienda seleccionada
    if (updated) {
      setStore({ ...selectedStore.value, ...updated })
      currentQrUrl.value = updated.payment_qr
        ? `${import.meta.env.VITE_POCKETBASE_URL || ''}/api/files/stores/${selectedStoreId.value}/${updated.payment_qr}`
        : qrPreview.value
    }
    qrSuccess.value = true
    qrFile.value    = null
    qrPreview.value = ''
  } catch (e) { qrError.value = e.message }
  finally { uploadingQr.value = false }
}

async function openProof(order) {
  proofOrder.value   = order
  showProof.value    = true
  proofBlobUrl.value = ''
  if (order?.payment_proof && order?.id) {
    try {
      const blob = await api.getOrderProofBlob(order.id, order.payment_proof)
      proofBlobUrl.value = URL.createObjectURL(blob)
    } catch {
      proofBlobUrl.value = ''
    }
  }
}

function closeProof() {
  showProof.value = false
  if (proofBlobUrl.value) {
    URL.revokeObjectURL(proofBlobUrl.value)
    proofBlobUrl.value = ''
  }
}

onBeforeUnmount(() => {
  if (proofBlobUrl.value) URL.revokeObjectURL(proofBlobUrl.value)
})

function money(v) { return new Intl.NumberFormat('es-BO', { maximumFractionDigits: 0 }).format(Number(v || 0)) }
function fmtDate(d) { return d ? new Date(d).toLocaleDateString('es-BO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—' }

const STATUS_LABELS = { approved: 'Aprobada', shipped: 'Enviada', delivered: 'Entregada' }
const STATUS_COLORS = {
  approved:  'text-blue-400 border-blue-900/50 bg-blue-950/40',
  shipped:   'text-purple-400 border-purple-900/50 bg-purple-950/40',
  delivered: 'text-emerald-400 border-emerald-900/50 bg-emerald-950/40',
}
</script>

<template>
  <div class="p-5 lg:p-8 min-h-screen">

    <div class="mb-6">
      <p class="text-[10px] tracking-[0.2em] uppercase text-text-disabled mb-0.5">Vendedor</p>
      <h1 class="text-xl lg:text-2xl font-light tracking-wide text-text-primary">Pagos QR</h1>
    </div>

    <!-- ══ Sección QR de la tienda ══════════════════════════════════════════ -->
    <div class="panel mb-6">
      <p class="text-[10px] tracking-[0.2em] uppercase text-text-disabled mb-4">QR de tu tienda</p>

      <div class="flex flex-col lg:flex-row gap-6">
        <!-- QR actual -->
        <div class="flex flex-col items-center gap-3 shrink-0">
          <p class="text-[10px] uppercase tracking-[0.16em] text-text-muted">QR actual</p>
          <div class="w-36 h-36 border border-border-default bg-surface-raised rounded-sm overflow-hidden flex items-center justify-center">
            <img v-if="currentQrUrl" :src="currentQrUrl" alt="QR de pago" class="w-full h-full object-contain p-2" />
            <div v-else class="text-center px-3">
              <svg class="w-8 h-8 text-text-disabled mx-auto mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
              </svg>
              <p class="text-[10px] text-text-disabled">Sin QR</p>
            </div>
          </div>
        </div>

        <!-- Subir nuevo QR -->
        <div class="flex-1">
          <p class="text-[10px] uppercase tracking-[0.16em] text-text-muted mb-3">Actualizar QR de pago</p>

          <!-- Preview del nuevo -->
          <div v-if="qrPreview" class="mb-3 w-28 h-28 border border-[var(--vendor)33] bg-surface-raised rounded-sm overflow-hidden">
            <img :src="qrPreview" class="w-full h-full object-contain p-2" />
          </div>

          <div class="flex flex-col gap-3">
            <div>
              <label class="form-label">Imagen QR (PNG/JPG)</label>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                class="input-field w-full text-text-muted file:mr-3 file:py-1 file:px-3 file:rounded-sm file:border-0 file:bg-surface-overlay file:text-text-muted file:text-xs"
                @change="onQrFileChange"
              />
            </div>
            <div>
              <label class="form-label">Instrucciones de pago</label>
              <textarea
                v-model="instructions"
                rows="3"
                class="input-field w-full resize-none"
                placeholder="Ej: Transferir al número 70000000 a nombre de ..."
              ></textarea>
            </div>

            <div v-if="qrError" class="text-red-400 text-xs px-2 py-1.5 bg-red-950/30 border border-red-900/40 rounded-sm">{{ qrError }}</div>
            <div v-if="qrSuccess" class="text-emerald-400 text-xs px-2 py-1.5 bg-emerald-950/30 border border-emerald-900/40 rounded-sm">✓ QR actualizado correctamente</div>

            <button class="btn-primary self-start" :disabled="uploadingQr || !qrFile" @click="uploadQr">
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              {{ uploadingQr ? 'Subiendo...' : 'Guardar QR' }}
            </button>
          </div>
        </div>

        <!-- Instrucciones actuales -->
        <div v-if="selectedStore?.payment_instructions && !instructions" class="lg:w-56 p-3 bg-surface-raised border border-border-subtle rounded-sm">
          <p class="text-[9px] tracking-[0.16em] uppercase text-text-disabled mb-1.5">Instrucciones actuales</p>
          <p class="text-[11px] text-text-muted leading-relaxed">{{ selectedStore.payment_instructions }}</p>
        </div>
      </div>
    </div>

    <!-- ══ Configuración de envíos ═══════════════════════════════════════════ -->
    <div class="panel mb-6">
      <p class="text-[10px] tracking-[0.2em] uppercase text-text-disabled mb-4">Configuración de envíos</p>
      <div class="flex flex-col sm:flex-row gap-4">
        <div class="flex-1">
          <label class="form-label">Costo de envío (Bs)</label>
          <input
            v-model="shippingCostInput"
            type="number"
            min="0"
            step="0.5"
            placeholder="Ej: 30"
            class="input-field w-full"
          />
          <p class="text-[10px] text-text-disabled mt-1">Monto cobrado cuando el pedido no aplica envío gratis.</p>
        </div>
        <div class="flex-1">
          <label class="form-label">Envío gratis desde (Bs)</label>
          <input
            v-model="freeShippingInput"
            type="number"
            min="0"
            step="1"
            placeholder="Ej: 200"
            class="input-field w-full"
          />
          <p class="text-[10px] text-text-disabled mt-1">Pedidos con subtotal igual o mayor a este monto tendrán envío gratis.</p>
        </div>
      </div>

      <!-- Preview de la lógica -->
      <div class="mt-3 px-3 py-2 bg-surface-raised border border-border-subtle text-[11px] text-[#666660]">
        Pedidos menores a
        <span class="text-accent">Bs {{ freeShippingInput || 200 }}</span>
        pagan
        <span class="text-accent">Bs {{ shippingCostInput || 30 }}</span>
        de envío · Pedidos iguales o mayores tienen envío
        <span class="text-emerald-400">gratis</span>
      </div>

      <div v-if="shippingError" class="mt-3 text-red-400 text-xs px-2 py-1.5 bg-red-950/30 border border-red-900/40 rounded-sm">{{ shippingError }}</div>
      <div v-if="shippingSuccess" class="mt-3 text-emerald-400 text-xs px-2 py-1.5 bg-emerald-950/30 border border-emerald-900/40 rounded-sm">✓ Configuración de envíos guardada</div>

      <button class="btn-primary mt-4 self-start" :disabled="savingShipping" @click="saveShippingConfig">
        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
        </svg>
        {{ savingShipping ? 'Guardando...' : 'Guardar configuración' }}
      </button>
    </div>

    <!-- ══ Órdenes aceptadas con comprobantes ═══════════════════════════════ -->
    <div>
      <div class="flex items-center justify-between mb-4">
        <p class="text-[10px] tracking-[0.2em] uppercase text-text-disabled">
          Órdenes aceptadas
          <span class="ml-2 text-text-muted normal-case">{{ totalItems }} órdenes</span>
        </p>
      </div>

      <div v-if="error" class="mb-4 px-4 py-3 bg-red-950/40 border border-red-900/50 text-red-400 text-sm rounded-sm">{{ error }}</div>
      <div v-if="loading" class="flex items-center justify-center py-12 text-text-muted text-sm">Cargando...</div>

      <div v-else-if="!orders.length" class="panel flex items-center justify-center py-16 text-center">
        <div>
          <p class="text-text-muted text-sm">No hay órdenes aceptadas aún</p>
          <p class="text-text-disabled text-xs mt-1">Aquí aparecerán las órdenes aprobadas con sus comprobantes</p>
        </div>
      </div>

      <div v-else class="overflow-x-auto rounded-sm border border-[var(--surface-overlay)]">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-[var(--surface-overlay)] bg-surface-sunken">
              <th class="th">Comprador</th>
              <th class="th hidden sm:table-cell">Total</th>
              <th class="th hidden md:table-cell">Referencia</th>
              <th class="th">Estado</th>
              <th class="th hidden lg:table-cell">Fecha</th>
              <th class="th w-28">Comprobante</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="order in orders"
              :key="order.id"
              class="border-b border-border-subtle bg-surface-base hover:bg-surface-sunken transition-colors"
              :class="order.payment_proof ? 'cursor-pointer' : ''"
              @click="order.payment_proof && openProof(order)"
            >
              <td class="td">
                <p class="text-[13px] text-text-primary">{{ order.expand?.buyer?.name || 'Comprador' }}</p>
                <p class="text-[10px] text-text-muted truncate max-w-32">{{ order.expand?.buyer?.email }}</p>
              </td>
              <td class="td hidden sm:table-cell">
                <p class="text-accent">Bs {{ money(order.total) }}</p>
                <p v-if="order.shipping_cost > 0" class="text-[10px] text-text-muted">Envío: Bs {{ money(order.shipping_cost) }}</p>
                <p v-else class="text-[10px] text-emerald-600">Envío gratis</p>
              </td>
              <td class="td hidden md:table-cell text-[11px] text-text-muted">{{ order.payment_reference || '—' }}</td>
              <td class="td">
                <span class="status-badge" :class="STATUS_COLORS[order.status]">{{ STATUS_LABELS[order.status] || order.status }}</span>
              </td>
              <td class="td hidden lg:table-cell text-[11px] text-text-muted">{{ fmtDate(order.approved_at || order.created) }}</td>
              <td class="td" @click.stop>
                <button
                  v-if="order.payment_proof"
                  class="action-btn text-vendor border-vendor-border hover:bg-vendor-soft"
                  @click.stop="openProof(order)"
                >
                  Ver
                </button>
                <span v-else class="text-[10px] text-text-disabled">Sin comprobante</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Paginación -->
    <div v-if="totalPages > 1" class="flex items-center justify-center gap-2 mt-5">
      <button class="page-btn" :disabled="page <= 1" @click="page--">←</button>
      <span class="text-[11px] text-text-muted">{{ page }} / {{ totalPages }}</span>
      <button class="page-btn" :disabled="page >= totalPages" @click="page++">→</button>
    </div>

    <!-- ════ MODAL COMPROBANTE ═══════════════════════════════════════════ -->
    <Transition name="modal">
      <div v-if="showProof && proofOrder" class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm px-4" @click.self="closeProof">
        <div class="modal-box w-full max-w-sm text-center">
          <div class="flex items-center justify-between mb-4">
            <p class="text-[13px] font-medium text-text-primary">Comprobante de pago</p>
            <button class="icon-btn" @click="closeProof">
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <p class="text-[11px] text-text-muted mb-3">{{ proofOrder.expand?.buyer?.name }} · Bs {{ money(proofOrder.total) }}</p>
          <div v-if="!proofBlobUrl" class="w-full h-40 flex items-center justify-center border border-border-default rounded-sm mb-4 text-text-muted text-xs">Cargando comprobante...</div>
          <img v-else :src="proofBlobUrl" alt="Comprobante" class="w-full rounded-sm border border-border-default mb-4 object-contain max-h-80" />
          <a
            v-if="proofBlobUrl"
            :href="proofBlobUrl"
            :download="`comprobante-${proofOrder.id}.jpg`"
            class="inline-flex items-center gap-2 px-4 py-2 bg-surface-raised border border-vendor-border rounded-sm text-vendor text-xs hover:bg-vendor-soft transition-colors"
          >
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            Abrir en nueva pestaña
          </a>
        </div>
      </div>
    </Transition>

  </div>
</template>

<style scoped>
.panel { background: var(--surface-sunken); border: 1px solid var(--surface-overlay); border-radius: 3px; padding: 1.1rem; }
.th { padding: 0.65rem 0.9rem; font-size: 0.62rem; letter-spacing: 0.16em; text-transform: uppercase; color: var(--border-strong); text-align: left; }
.td { padding: 0.7rem 0.9rem; }
.status-badge { font-size: 0.58rem; letter-spacing: 0.14em; text-transform: uppercase; padding: 0.18rem 0.45rem; border-radius: 2px; border-width: 1px; border-style: solid; }
.icon-btn { padding: 0.3rem; border-radius: 2px; color: var(--text-muted); transition: color 0.15s, background 0.15s; }
.icon-btn:hover { color: var(--text-secondary); background: var(--surface-raised); }
.action-btn { padding: 0.25rem 0.6rem; font-size: 0.68rem; border-radius: 2px; border: 1px solid var(--border-default); color: var(--text-muted); background: transparent; transition: all 0.15s; }
.action-btn:hover { border-color: var(--text-disabled); color: var(--text-secondary); background: var(--surface-raised); }
.input-field { background: var(--surface-raised); border: 1px solid var(--border-subtle); border-radius: 2px; padding: 0.45rem 0.65rem; font-size: 0.8rem; color: var(--text-secondary); outline: none; transition: border-color 0.15s; }
.input-field:focus { border-color: var(--vendor)44; }
.form-label { display: block; font-size: 0.62rem; letter-spacing: 0.14em; text-transform: uppercase; color: var(--text-muted); margin-bottom: 0.4rem; }
.btn-primary { display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.5rem 1rem; background: var(--vendor)22; border: 1px solid var(--vendor)44; border-radius: 2px; color: var(--vendor); font-size: 0.75rem; transition: all 0.15s; }
.btn-primary:hover:not(:disabled) { background: var(--vendor)33; border-color: var(--vendor)66; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.page-btn { padding: 0.3rem 0.7rem; background: var(--surface-raised); border: 1px solid var(--border-subtle); border-radius: 2px; color: var(--text-muted); font-size: 0.75rem; transition: all 0.15s; }
.page-btn:hover:not(:disabled) { color: var(--text-secondary); border-color: var(--text-disabled); }
.page-btn:disabled { opacity: 0.3; cursor: not-allowed; }
.modal-box { background: var(--surface-base); border: 1px solid var(--border-subtle); border-radius: 4px; padding: 1.5rem; }
.modal-enter-active, .modal-leave-active { transition: opacity 0.2s ease; }
.modal-enter-from, .modal-leave-to { opacity: 0; }
</style>
