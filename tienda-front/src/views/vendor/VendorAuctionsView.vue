<script setup>
import { ref, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useVendorApi } from '@/composables/useVendorApi'
import { useVendorStore } from '@/composables/useVendorStore'

const router = useRouter()
const api    = useVendorApi()
const { selectedStoreId, hasStore } = useVendorStore()

const auctions   = ref([])
const loading    = ref(true)
const error      = ref('')
const totalItems = ref(0)
const totalPages = ref(1)
const page       = ref(1)
const filterStatus = ref('')

const showModal  = ref(false)
const modalMode  = ref('create')
const saving     = ref(false)
const saveError  = ref('')
const editingId  = ref(null)
const confirmId  = ref(null)
const deleting   = ref(false)

// Vista de detalle de subasta cerrada
const showDetail = ref(false)
const detailData = ref(null)
const loadingDetail = ref(false)

const newImages       = ref([])
const newImagePreviews = ref([])
const existingImages  = ref([])
const updatingStatusId = ref(null)
const createDiscountOpen = ref(false)

function emptyForm() {
  return {
    title: '', description: '', start_price: '', reserve_price: '',
    buy_now_price: '', start_date: '', end_date: '',
    status: 'draft', discount_percent: '', discount_amount: '',
  }
}
const form = ref(emptyForm())

async function loadAuctions() {
  if (!hasStore.value) { router.push('/vendor/select-store'); return }
  loading.value = true
  error.value   = ''
  try {
    const data = await api.listAuctions({
      storeId: selectedStoreId.value,
      status: filterStatus.value,
      page: page.value,
    })
    auctions.value   = data?.items || []
    totalItems.value = data?.totalItems || 0
    totalPages.value = data?.totalPages || 1
  } catch (e) { error.value = e.message }
  finally { loading.value = false }
}

onMounted(loadAuctions)
watch([filterStatus], () => { page.value = 1; loadAuctions() })
watch(page, loadAuctions)

function openCreate() {
  modalMode.value = 'create'
  editingId.value = null
  form.value      = emptyForm()
  createDiscountOpen.value = false
  newImages.value = []
  newImagePreviews.value = []
  existingImages.value   = []
  saveError.value = ''
  showModal.value = true
}

function openEdit(auction) {
  modalMode.value = 'edit'
  editingId.value = auction.id
  form.value = {
    title: auction.title || '',
    description: auction.description || '',
    start_price: String(auction.start_price || ''),
    reserve_price: String(auction.reserve_price || ''),
    buy_now_price: String(auction.buy_now_price || ''),
    start_date: (auction.start_date || '').slice(0, 16),
    end_date: (auction.end_date || '').slice(0, 16),
    status: auction.status || 'draft',
    discount_percent: String(auction.discount_percent || ''),
    discount_amount: String(auction.discount_amount || ''),
  }
  existingImages.value   = Array.isArray(auction.images) ? [...auction.images] : (auction.images ? [auction.images] : [])
  newImages.value        = []
  newImagePreviews.value = []
  saveError.value = ''
  showModal.value = true
}

async function openDetail(auction) {
  showDetail.value    = true
  loadingDetail.value = true
  detailData.value    = null
  try {
    detailData.value = await api.getAuction(auction.id)
  } catch (e) {
    detailData.value = auction
  } finally {
    loadingDetail.value = false
  }
}

function onFileChange(e) {
  const files     = Array.from(e.target.files || [])
  const remaining = Math.max(0, 5 - existingImages.value.length - newImages.value.length)
  const toAdd     = files.slice(0, remaining)
  newImages.value       = [...newImages.value, ...toAdd]
  newImagePreviews.value = [...newImagePreviews.value, ...toAdd.map(f => URL.createObjectURL(f))]
  e.target.value = ''
}
function removeExistingImage(f) { existingImages.value = existingImages.value.filter(x => x !== f) }
function removeNewImage(idx) {
  newImages.value.splice(idx, 1)
  newImagePreviews.value.splice(idx, 1)
}

watch(
  () => [form.value.discount_percent, form.value.discount_amount],
  () => {
    if (hasCreateDiscountValues()) createDiscountOpen.value = true
  }
)

function toIsoDateTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString()
}

async function save() {
  saveError.value = ''
  const validationError = validateAuctionForm()
  if (validationError) { saveError.value = validationError; return }

  saving.value = true
  try {
    const fd = new FormData()
    fd.append('title', form.value.title.trim())
    fd.append('description', form.value.description || '')
    fd.append('start_price', form.value.start_price)
    const startIso = toIsoDateTime(form.value.start_date)
    const endIso = toIsoDateTime(form.value.end_date)
    if (!startIso || !endIso) {
      saveError.value = 'Formato de fecha inválido'
      saving.value = false
      return
    }
    fd.append('start_date', startIso)
    fd.append('end_date', endIso)
    fd.append('status', form.value.status)
    if (form.value.reserve_price)   fd.append('reserve_price',   form.value.reserve_price)
    if (form.value.buy_now_price)   fd.append('buy_now_price',   form.value.buy_now_price)
    if (modalMode.value === 'edit' || modalMode.value === 'create') {
      if (form.value.discount_percent) fd.append('discount_percent', form.value.discount_percent)
      if (form.value.discount_amount)  fd.append('discount_amount',  form.value.discount_amount)
    }
    for (const img of newImages.value) fd.append('images', img)

    if (modalMode.value === 'create') {
      fd.append('store', selectedStoreId.value)
      await api.createAuction(fd)
    } else {
      const original = auctions.value.find(a => a.id === editingId.value)
      const origImgs = Array.isArray(original?.images) ? original.images : (original?.images ? [original.images] : [])
      const removed  = origImgs.filter(f => !existingImages.value.includes(f))
      if (removed.length) fd.append('remove_images', removed.join(','))
      await api.updateAuction(editingId.value, fd)
    }
    showModal.value = false
    await loadAuctions()
  } catch (e) { saveError.value = e.message }
  finally { saving.value = false }
}

async function doDelete() {
  if (!confirmId.value) return
  deleting.value = true
  try { await api.deleteAuction(confirmId.value); confirmId.value = null; await loadAuctions() }
  catch (e) { error.value = e.message }
  finally { deleting.value = false }
}

function nextAuctionStatus(status) {
  if (status === 'active') return 'draft'
  return 'active'
}

function statusActionLabel(status) {
  if (status === 'active') return 'Pausar'
  return 'Activar'
}

async function quickSetAuctionStatus(auction) {
  updatingStatusId.value = auction.id
  try {
    const fd = new FormData()
    fd.append('status', nextAuctionStatus(auction.status))
    await api.updateAuction(auction.id, fd)
    await loadAuctions()
  } catch (e) {
    error.value = e.message
  } finally {
    updatingStatusId.value = null
  }
}

function hasCreateDiscountValues() {
  return [form.value.discount_percent, form.value.discount_amount].some((value) => String(value || '').trim() !== '')
}

function toggleCreateDiscountPanel() {
  if (hasCreateDiscountValues()) {
    createDiscountOpen.value = true
    return
  }
  createDiscountOpen.value = !createDiscountOpen.value
}

function validateAuctionForm() {
  const title = form.value.title.trim()
  const startPrice = Number(form.value.start_price)
  const reservePriceRaw = String(form.value.reserve_price || '').trim()
  const buyNowPriceRaw = String(form.value.buy_now_price || '').trim()
  const discountPercentRaw = String(form.value.discount_percent || '').trim()
  const discountAmountRaw = String(form.value.discount_amount || '').trim()
  const startDate = String(form.value.start_date || '').trim()
  const endDate = String(form.value.end_date || '').trim()

  if (!title) return 'El título es obligatorio'
  if (!Number.isFinite(startPrice) || startPrice < 0) return 'El precio inicial debe ser un número válido mayor o igual a 0'
  if (!startDate || !endDate) return 'Las fechas son obligatorias'
  if (new Date(startDate) >= new Date(endDate)) return 'La fecha de inicio debe ser anterior a la fecha de cierre'

  if (reservePriceRaw !== '') {
    const reservePrice = Number(reservePriceRaw)
    if (!Number.isFinite(reservePrice) || reservePrice < 0) return 'El precio de reserva debe ser mayor o igual a 0'
    if (reservePrice < startPrice) return 'El precio de reserva no puede ser menor al precio inicial'
  }

  if (buyNowPriceRaw !== '') {
    const buyNowPrice = Number(buyNowPriceRaw)
    if (!Number.isFinite(buyNowPrice) || buyNowPrice < 0) return 'El precio de compra inmediata debe ser mayor o igual a 0'
    if (buyNowPrice < startPrice) return 'El precio de compra inmediata no puede ser menor al precio inicial'
    if (reservePriceRaw !== '' && buyNowPrice < Number(reservePriceRaw)) return 'El precio de compra inmediata no puede ser menor al precio de reserva'
  }

  if (discountPercentRaw !== '') {
    const discountPercent = Number(discountPercentRaw)
    if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100) return 'El descuento porcentual debe estar entre 0 y 100'
  }
  if (discountAmountRaw !== '') {
    const discountAmount = Number(discountAmountRaw)
    if (!Number.isFinite(discountAmount) || discountAmount < 0) return 'El descuento en Bs debe ser mayor o igual a 0'
  }

  return ''
}

const PB = import.meta.env.VITE_POCKETBASE_URL || ''
function imgUrl(id, filename) { return filename ? `${PB}/api/files/auctions/${id}/${filename}` : '' }
function firstImg(a) {
  const imgs = Array.isArray(a.images) ? a.images : (a.images ? [a.images] : [])
  return imgs[0] || ''
}
function money(v) { return new Intl.NumberFormat('es-BO', { maximumFractionDigits: 0 }).format(Number(v || 0)) }
function fmtDate(d) { return d ? new Date(d).toLocaleDateString('es-BO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—' }
function fmtDateTime(d) { return d ? new Date(d).toLocaleString('es-BO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—' }

const STATUS_LABELS = { draft: 'Borrador', active: 'Activa', ended: 'Cerrada', cancelled: 'Cancelada' }
const STATUS_COLORS = {
  draft:     'text-yellow-400 border-yellow-900/50 bg-yellow-950/40',
  active:    'text-emerald-400 border-emerald-900/50 bg-emerald-950/40',
  ended:     'text-blue-400 border-blue-900/50 bg-blue-950/40',
  cancelled: 'text-[#555] border-[#333] bg-[#111]',
}
</script>

<template>
  <div class="p-5 lg:p-8 min-h-screen">

    <div class="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
      <div class="flex-1">
        <p class="text-[10px] tracking-[0.2em] uppercase text-[#3a3a38] mb-0.5">Vendedor</p>
        <h1 class="text-xl lg:text-2xl font-light tracking-wide text-[#e8e5e0]">Subastas</h1>
      </div>
      <button class="btn-primary shrink-0" @click="openCreate">
        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
        </svg>
        Nueva subasta
      </button>
    </div>

    <!-- Filtros -->
    <div class="flex gap-3 mb-5 flex-wrap">
      <select v-model="filterStatus" class="input-field">
        <option value="">Todas</option>
        <option v-for="(label, val) in STATUS_LABELS" :key="val" :value="val">{{ label }}</option>
      </select>
      <span class="text-[11px] text-[#555] self-center">{{ totalItems }} subastas</span>
    </div>

    <div v-if="error" class="mb-4 px-4 py-3 bg-red-950/40 border border-red-900/50 text-red-400 text-sm rounded-sm">{{ error }}</div>
    <div v-if="loading" class="flex items-center justify-center py-20 text-[#555] text-sm">Cargando...</div>

    <div v-else-if="!auctions.length" class="panel flex items-center justify-center py-20">
      <div class="text-center">
        <svg class="w-10 h-10 text-[#2a2a2a] mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p class="text-[#555] text-sm">No hay subastas. ¡Crea la primera!</p>
      </div>
    </div>

    <!-- Grid de subastas -->
    <div v-else class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
      <div v-for="auction in auctions" :key="auction.id" class="auction-card">
        <!-- Imagen -->
        <div class="h-36 bg-[#0f0f0f] border-b border-[#161616] overflow-hidden relative">
          <img
            v-if="firstImg(auction)"
            :src="imgUrl(auction.id, firstImg(auction))"
            :alt="auction.title"
            class="w-full h-full object-cover"
          />
          <div v-else class="w-full h-full flex items-center justify-center">
            <svg class="w-8 h-8 text-[#222]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <span class="absolute top-2 right-2 status-badge" :class="STATUS_COLORS[auction.status]">
            {{ STATUS_LABELS[auction.status] || auction.status }}
          </span>
        </div>

        <!-- Info -->
        <div class="p-3.5">
          <p class="text-[13px] font-medium text-[#e8e5e0] mb-1 truncate">{{ auction.title }}</p>
          <div class="flex items-center justify-between mb-3">
            <div>
              <p class="text-[10px] text-[#555] uppercase tracking-wide">Precio inicial</p>
              <p class="text-[13px] text-[#c9a96e]">Bs {{ money(auction.start_price) }}</p>
            </div>
            <div class="text-right">
              <p class="text-[10px] text-[#555] uppercase tracking-wide">Actual</p>
              <p class="text-[13px] text-[#8ab4a0]">Bs {{ money(auction.current_price || auction.start_price) }}</p>
            </div>
          </div>
          <div class="flex gap-2 text-[10px] text-[#555] mb-3">
            <span>Inicio: {{ fmtDate(auction.start_date) }}</span>
            <span>·</span>
            <span>Cierre: {{ fmtDate(auction.end_date) }}</span>
          </div>
          <div class="flex items-center gap-1.5">
            <button
              v-if="auction.status === 'ended'"
              class="btn-outline flex-1 text-[10px]"
              @click="openDetail(auction)"
            >Ver resultado</button>
            <button
              v-if="auction.status !== 'ended'"
              class="btn-outline flex-1 text-[10px]"
              :disabled="updatingStatusId === auction.id"
              @click="quickSetAuctionStatus(auction)"
            >{{ updatingStatusId === auction.id ? '...' : statusActionLabel(auction.status) }}</button>
            <button class="icon-btn" title="Editar" @click="openEdit(auction)">
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
            <button
              v-if="['draft','cancelled'].includes(auction.status)"
              class="icon-btn text-red-500/60 hover:text-red-400"
              title="Eliminar"
              @click="confirmId = auction.id"
            >
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Paginación -->
    <div v-if="totalPages > 1" class="flex items-center justify-center gap-2 mt-5">
      <button class="page-btn" :disabled="page <= 1" @click="page--">←</button>
      <span class="text-[11px] text-[#555]">{{ page }} / {{ totalPages }}</span>
      <button class="page-btn" :disabled="page >= totalPages" @click="page++">→</button>
    </div>

    <!-- ════ MODAL CREAR/EDITAR ════════════════════════════════════════════ -->
    <Transition name="modal">
      <div v-if="showModal" class="fixed inset-0 z-50 flex items-start justify-center bg-black/70 backdrop-blur-sm overflow-y-auto py-8 px-4">
        <div class="modal-box w-full max-w-xl my-auto">
          <div class="flex items-center justify-between mb-5">
            <h2 class="text-[15px] font-medium text-[#e8e5e0]">{{ modalMode === 'create' ? 'Nueva subasta' : 'Editar subasta' }}</h2>
            <button class="icon-btn" @click="showModal = false">
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>

          <div v-if="saveError" class="mb-4 px-3 py-2 bg-red-950/40 border border-red-900/50 text-red-400 text-xs rounded-sm">{{ saveError }}</div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="sm:col-span-2">
              <label class="form-label">Título *</label>
              <input v-model="form.title" type="text" class="input-field w-full" placeholder="Título de la subasta" />
            </div>
            <div class="sm:col-span-2">
              <label class="form-label">Descripción</label>
              <textarea v-model="form.description" class="input-field w-full h-20 resize-none" placeholder="Descripción..."></textarea>
            </div>
            <div>
              <label class="form-label">Precio inicial (Bs) *</label>
              <input v-model="form.start_price" type="number" min="0" class="input-field w-full" />
            </div>
            <div>
              <label class="form-label">Precio reserva (Bs)</label>
              <input v-model="form.reserve_price" type="number" min="0" class="input-field w-full" placeholder="Opcional" />
            </div>
            <div>
              <label class="form-label">Comprar ahora (Bs)</label>
              <input v-model="form.buy_now_price" type="number" min="0" class="input-field w-full" placeholder="Opcional" />
            </div>
            <div>
              <label class="form-label">Estado</label>
              <select v-model="form.status" class="input-field w-full">
                <option value="draft">Borrador</option>
                <option value="active">Activa</option>
                <option value="cancelled">Cancelada</option>
              </select>
            </div>
            <div>
              <label class="form-label">Fecha inicio *</label>
              <input v-model="form.start_date" type="datetime-local" class="input-field w-full" />
            </div>
            <div>
              <label class="form-label">Fecha cierre *</label>
              <input v-model="form.end_date" type="datetime-local" class="input-field w-full" />
            </div>
            <template v-if="modalMode === 'edit'">
              <div class="sm:col-span-2 discount-panel">
                <div class="flex items-center justify-between mb-3">
                  <p class="text-[10px] tracking-[0.2em] uppercase text-[#3a3a38]">Descuento de subasta</p>
                  <div class="flex items-center gap-1.5">
                    <button type="button" class="mini-chip" @click="form.discount_percent = '5'">5%</button>
                    <button type="button" class="mini-chip" @click="form.discount_percent = '10'">10%</button>
                    <button type="button" class="mini-chip" @click="form.discount_percent = '15'">15%</button>
                  </div>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label class="form-label">Descuento %</label>
                    <input v-model="form.discount_percent" type="number" min="0" max="100" class="input-field w-full" placeholder="0" />
                  </div>
                  <div>
                    <label class="form-label">Descuento Bs</label>
                    <input v-model="form.discount_amount" type="number" min="0" class="input-field w-full" placeholder="0" />
                  </div>
                </div>
              </div>
            </template>

            <template v-else>
              <div class="sm:col-span-2">
                <button
                  v-if="!createDiscountOpen && !hasCreateDiscountValues()"
                  type="button"
                  class="discount-show-btn"
                  @click="toggleCreateDiscountPanel"
                >
                  Agregar descuento opcional
                </button>
                <div v-else class="discount-panel discount-panel--create">
                  <button type="button" class="discount-panel-head" @click="toggleCreateDiscountPanel">
                    <div>
                      <p class="text-[10px] tracking-[0.2em] uppercase text-[#3a3a38]">Descuento</p>
                      <p class="text-[11px] text-[#666] mt-1">Opcional al crear</p>
                    </div>
                    <span class="discount-panel-pill">
                      {{ hasCreateDiscountValues() ? 'Bloqueado' : (createDiscountOpen ? 'Ocultar' : 'Mostrar') }}
                    </span>
                  </button>
                  <div v-show="createDiscountOpen || hasCreateDiscountValues()" class="discount-panel-body">
                    <div class="flex flex-wrap items-center gap-1.5 mb-3">
                      <button type="button" class="mini-chip" @click="form.discount_percent = '5'">5%</button>
                      <button type="button" class="mini-chip" @click="form.discount_percent = '10'">10%</button>
                      <button type="button" class="mini-chip" @click="form.discount_percent = '15'">15%</button>
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label class="form-label">Descuento %</label>
                        <input v-model="form.discount_percent" type="number" min="0" max="100" class="input-field w-full" placeholder="0" />
                      </div>
                      <div>
                        <label class="form-label">Descuento Bs</label>
                        <input v-model="form.discount_amount" type="number" min="0" class="input-field w-full" placeholder="0" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </template>
            <!-- Imágenes existentes -->
            <div v-if="existingImages.length" class="sm:col-span-2">
              <label class="form-label">Imágenes actuales</label>
              <div class="flex flex-wrap gap-2">
                <div v-for="img in existingImages" :key="img" class="relative w-16 h-16 rounded-sm border border-[#222] overflow-hidden group">
                  <img :src="imgUrl(editingId, img)" class="w-full h-full object-cover" />
                  <button class="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity" @click="removeExistingImage(img)">
                    <svg class="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              </div>
            </div>
            <div class="sm:col-span-2">
              <label class="form-label">Imágenes <span class="text-[#555]">(máx. {{ Math.max(0, 5 - existingImages.length - newImages.length) }})</span></label>
              <input type="file" multiple accept="image/jpeg,image/png,image/webp"
                class="input-field w-full text-[#888] file:mr-3 file:py-1 file:px-3 file:rounded-sm file:border-0 file:bg-[#161616] file:text-[#999] file:text-xs"
                @change="onFileChange" />
              <div v-if="newImagePreviews.length" class="flex flex-wrap gap-2 mt-2">
                <div
                  v-for="(url, idx) in newImagePreviews"
                  :key="url"
                  class="relative w-24 h-24 rounded-sm border border-[#222] overflow-hidden group"
                >
                  <img :src="url" class="w-full h-full object-cover" />
                  <button
                    type="button"
                    class="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity"
                    @click="removeNewImage(idx)"
                  >
                    <svg class="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div class="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-[#181818]">
            <button class="btn-ghost" :disabled="saving" @click="showModal = false">Cancelar</button>
            <button class="btn-primary" :disabled="saving" @click="save">
              {{ saving ? 'Guardando...' : (modalMode === 'create' ? 'Crear subasta' : 'Guardar') }}
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- ════ MODAL RESULTADO SUBASTA CERRADA ══════════════════════════════ -->
    <Transition name="modal">
      <div v-if="showDetail" class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
        <div class="modal-box w-full max-w-md">
          <div class="flex items-center justify-between mb-5">
            <h2 class="text-[15px] font-medium text-[#e8e5e0]">Resultado de la subasta</h2>
            <button class="icon-btn" @click="showDetail = false">
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>

          <div v-if="loadingDetail" class="py-10 text-center text-[#555] text-sm">Cargando...</div>

          <template v-else-if="detailData">
            <p class="text-[14px] font-medium text-[#e8e5e0] mb-4 truncate">{{ detailData.title }}</p>

            <!-- Ganador -->
            <div v-if="detailData.winner || detailData.expand?.winner" class="p-3.5 rounded-sm border border-[#1e2e28] bg-[#0d110f] mb-4">
              <p class="text-[9px] tracking-[0.2em] uppercase text-[#3a3a38] mb-1.5">Ganador</p>
              <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-full border border-[#8ab4a033] bg-[#111] flex items-center justify-center text-[#8ab4a0] text-sm font-medium shrink-0">
                  {{ (detailData.expand?.winner?.name || detailData.expand?.winner?.email || '?')[0].toUpperCase() }}
                </div>
                <div>
                  <p class="text-[13px] text-[#d8d5cf]">{{ detailData.expand?.winner?.name || 'Usuario' }}</p>
                  <p class="text-[11px] text-[#555]">{{ detailData.expand?.winner?.email }}</p>
                </div>
              </div>
            </div>
            <div v-else class="p-3.5 rounded-sm border border-[#222] bg-[#0f0f0f] mb-4 text-center">
              <p class="text-[#555] text-sm">Sin ganador</p>
            </div>

            <!-- Precios -->
            <div class="grid grid-cols-3 gap-2 mb-4">
              <div class="mini-stat">
                <span>Inicial</span>
                <strong>Bs {{ money(detailData.start_price) }}</strong>
              </div>
              <div class="mini-stat">
                <span>Final</span>
                <strong class="text-[#8ab4a0]">Bs {{ money(detailData.current_price || detailData.start_price) }}</strong>
              </div>
              <div class="mini-stat">
                <span>Pujas</span>
                <strong>{{ detailData.bids_count || 0 }}</strong>
              </div>
            </div>

            <!-- Últimas pujas -->
            <div v-if="detailData.bids?.length" class="mb-2">
              <p class="text-[9px] tracking-[0.2em] uppercase text-[#3a3a38] mb-2">Últimas pujas</p>
              <div class="flex flex-col gap-1 max-h-40 overflow-y-auto">
                <div
                  v-for="bid in detailData.bids"
                  :key="bid.id"
                  class="flex items-center justify-between px-3 py-1.5 bg-[#0f0f0f] border border-[#1a1a1a] rounded-sm"
                >
                  <span class="text-[11px] text-[#888]">{{ bid.expand?.bidder?.name || 'Anónimo' }}</span>
                  <span class="text-[12px] text-[#c9a96e]">Bs {{ money(bid.amount) }}</span>
                </div>
              </div>
            </div>

            <div class="text-[10px] text-[#555] mt-3">
              Cerrada: {{ fmtDateTime(detailData.end_date) }}
            </div>
          </template>
        </div>
      </div>
    </Transition>

    <!-- ════ CONFIRMAR ELIMINAR ══════════════════════════════════════════ -->
    <Transition name="modal">
      <div v-if="confirmId" class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
        <div class="modal-box w-full max-w-sm text-center">
          <p class="text-[#e8e5e0] text-[14px] mb-2">¿Eliminar esta subasta?</p>
          <p class="text-[#666] text-xs mb-6">Esta acción no se puede deshacer.</p>
          <div class="flex gap-3 justify-center">
            <button class="btn-ghost" :disabled="deleting" @click="confirmId = null">Cancelar</button>
            <button class="btn-danger" :disabled="deleting" @click="doDelete">{{ deleting ? 'Eliminando...' : 'Eliminar' }}</button>
          </div>
        </div>
      </div>
    </Transition>

  </div>
</template>

<style scoped>
.panel { background: #0c0c0c; border: 1px solid #181818; border-radius: 3px; padding: 1rem; }
.auction-card { background: #0c0c0c; border: 1px solid #181818; border-radius: 3px; overflow: hidden; }
.status-badge { font-size: 0.58rem; letter-spacing: 0.14em; text-transform: uppercase; padding: 0.18rem 0.45rem; border-radius: 2px; border-width: 1px; border-style: solid; }
.icon-btn { padding: 0.3rem; border-radius: 2px; color: #555; transition: color 0.15s, background 0.15s; }
.icon-btn:hover { color: #d8d5cf; background: #111; }
.input-field { background: #0f0f0f; border: 1px solid #1e1e1e; border-radius: 2px; padding: 0.45rem 0.65rem; font-size: 0.8rem; color: #d8d5cf; outline: none; transition: border-color 0.15s; }
.input-field:focus { border-color: #8ab4a044; }
.form-label { display: block; font-size: 0.62rem; letter-spacing: 0.14em; text-transform: uppercase; color: #555; margin-bottom: 0.4rem; }
.btn-primary { display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.5rem 1rem; background: #8ab4a022; border: 1px solid #8ab4a044; border-radius: 2px; color: #8ab4a0; font-size: 0.75rem; transition: all 0.15s; }
.btn-primary:hover:not(:disabled) { background: #8ab4a033; border-color: #8ab4a066; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-outline { display: inline-flex; align-items: center; justify-content: center; padding: 0.35rem 0.75rem; background: transparent; border: 1px solid #222; border-radius: 2px; color: #666; font-size: 0.7rem; transition: all 0.15s; }
.btn-outline:hover { border-color: #8ab4a044; color: #8ab4a0; }
.btn-ghost { padding: 0.5rem 1rem; background: transparent; border: 1px solid #222; border-radius: 2px; color: #666; font-size: 0.75rem; transition: all 0.15s; }
.btn-ghost:hover:not(:disabled) { border-color: #333; color: #aaa; }
.btn-ghost:disabled { opacity: 0.5; }
.btn-danger { padding: 0.5rem 1rem; background: #7f1d1d33; border: 1px solid #991b1b55; border-radius: 2px; color: #f87171; font-size: 0.75rem; transition: all 0.15s; }
.btn-danger:hover:not(:disabled) { background: #7f1d1d55; }
.btn-danger:disabled { opacity: 0.5; }
.page-btn { padding: 0.3rem 0.7rem; background: #0f0f0f; border: 1px solid #1e1e1e; border-radius: 2px; color: #666; font-size: 0.75rem; transition: all 0.15s; }
.page-btn:hover:not(:disabled) { color: #aaa; border-color: #333; }
.page-btn:disabled { opacity: 0.3; cursor: not-allowed; }
.discount-panel { border: 1px solid #1e2e28; background: #0d110f; border-radius: 3px; overflow: hidden; }
.discount-panel--create { padding: 0; }
.discount-panel-head { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 0.8rem; text-align: left; }
.discount-panel-body { padding: 0.8rem; border-top: 1px solid #1e2e28; }
.discount-panel-pill { font-size: 0.62rem; letter-spacing: 0.14em; text-transform: uppercase; color: #8ab4a0; border: 1px solid #1e2e28; background: #0a0f0c; border-radius: 999px; padding: 0.22rem 0.55rem; white-space: nowrap; }
.discount-show-btn { width: 100%; padding: 0.85rem 1rem; border: 1px dashed #1e2e28; border-radius: 3px; background: #0d110f; color: #8ab4a0; text-align: left; font-size: 0.72rem; letter-spacing: 0.1em; text-transform: uppercase; }
.mini-chip { border: 1px solid #2a2a2a; background: #111; color: #777; font-size: 0.62rem; letter-spacing: 0.08em; text-transform: uppercase; border-radius: 999px; padding: 0.18rem 0.5rem; transition: all 0.15s; }
.mini-chip:hover { border-color: #8ab4a044; color: #8ab4a0; }
.mini-stat { display: flex; flex-direction: column; gap: 0.25rem; padding: 0.5rem 0.65rem; background: #0f0f0f; border: 1px solid #1a1a1a; border-radius: 3px; font-size: 0.62rem; }
.mini-stat span { color: #555; text-transform: uppercase; letter-spacing: 0.1em; }
.mini-stat strong { color: #d8d5cf; font-weight: 500; font-size: 0.8rem; }
.modal-box { background: #0a0a0a; border: 1px solid #1e1e1e; border-radius: 4px; padding: 1.5rem; }
.modal-enter-active, .modal-leave-active { transition: opacity 0.2s ease; }
.modal-enter-from, .modal-leave-to { opacity: 0; }
</style>
