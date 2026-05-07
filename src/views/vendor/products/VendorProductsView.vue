<script setup>
import { ref, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useVendorApi } from '@/composables/useVendorApi'
import { useVendorStore } from '@/composables/useVendorStore'

const router = useRouter()
const api    = useVendorApi()
const { selectedStoreId, hasStore } = useVendorStore()

// ── Estado de lista ──────────────────────────────────────────────────────────
const products    = ref([])
const categories  = ref([])
const loading     = ref(true)
const error       = ref('')
const totalItems  = ref(0)
const totalPages  = ref(1)
const page        = ref(1)
const perPage     = 12
const filterStatus = ref('')
const search       = ref('')

// ── Modal ────────────────────────────────────────────────────────────────────
const showModal    = ref(false)
const modalMode    = ref('create') // 'create' | 'edit'
const saving       = ref(false)
const saveError    = ref('')
const editingId    = ref(null)

const form = ref(emptyForm())
const newImages      = ref([])
const newImagePreviews = ref([])
const existingImages = ref([])  // filenames existentes del producto
const updatingStatusId = ref(null)
const createDiscountOpen = ref(false)
const showRestockModal = ref(false)
const restockProduct = ref(null)
const restockQuantity = ref('')
const restockSaving = ref(false)
const restockError = ref('')

function emptyForm() {
  return {
    name: '', description: '', price: '', stock: '1',
    category: '', status: 'active', condition: 'new',
    featured: false, discount_percent: '', discount_amount: '',
    discount_starts_at: '', discount_ends_at: '',
  }
}

// ── Confirm delete ───────────────────────────────────────────────────────────
const confirmId   = ref(null)
const deleting    = ref(false)

// ── Carga ────────────────────────────────────────────────────────────────────
async function loadProducts() {
  if (!hasStore.value) { router.push('/vendor/select-store'); return }
  loading.value = true
  error.value   = ''
  try {
    const data = await api.listProducts({
      storeId: selectedStoreId.value,
      status: filterStatus.value,
      search: search.value,
      page: page.value,
      perPage,
    })
    products.value   = (data?.items || []).map((item) => {
      if (item.status === 'out_of_stock') {
        return { ...item, stock: 0 }
      }
      return item
    })
    totalItems.value = data?.totalItems || 0
    totalPages.value = data?.totalPages || 1
  } catch (e) { error.value = e.message }
  finally { loading.value = false }
}

async function loadCategories() {
  try {
    const data = await api.getCategories()
    categories.value = data?.items || []
  } catch { /* silencioso */ }
}

onMounted(() => { loadProducts(); loadCategories() })
watch([filterStatus, search], () => { page.value = 1; loadProducts() })
watch(page, loadProducts)
watch(
  () => form.value.stock,
  (value) => {
    const stock = Number(value)
    if (Number.isNaN(stock)) return
    if (stock === 0) form.value.status = 'out_of_stock'
    else if (stock > 0 && form.value.status === 'out_of_stock') form.value.status = 'draft'
  }
)
watch(
  () => [
    form.value.discount_percent,
    form.value.discount_amount,
    form.value.discount_starts_at,
    form.value.discount_ends_at,
  ],
  () => {
    if (hasCreateDiscountValues()) createDiscountOpen.value = true
  }
)

// ── Abrir modal ───────────────────────────────────────────────────────────────
function openCreate() {
  modalMode.value    = 'create'
  editingId.value    = null
  form.value         = emptyForm()
  createDiscountOpen.value = false
  newImages.value    = []
  newImagePreviews.value = []
  existingImages.value   = []
  saveError.value    = ''
  showModal.value    = true
}

function openEdit(product) {
  modalMode.value  = 'edit'
  editingId.value  = product.id
  form.value = {
    name: product.name || '',
    description: product.description || '',
    price: String(product.price || ''),
    stock: String(product.stock ?? 1),
    category: product.category || '',
    status: product.status || 'active',
    condition: product.condition || 'new',
    featured: product.featured || false,
    discount_percent: String(product.discount_percent || ''),
    discount_amount: String(product.discount_amount || ''),
    discount_starts_at: (product.discount_starts_at || '').slice(0, 10),
    discount_ends_at: (product.discount_ends_at || '').slice(0, 10),
  }
  existingImages.value   = Array.isArray(product.images) ? [...product.images] : (product.images ? [product.images] : [])
  newImages.value        = []
  newImagePreviews.value = []
  saveError.value = ''
  showModal.value = true
}

// ── Imágenes nuevas ───────────────────────────────────────────────────────────
function onFileChange(e) {
  const files = Array.from(e.target.files || [])
  const remaining = Math.max(0, 8 - existingImages.value.length - newImages.value.length)
  const toAdd = files.slice(0, remaining)
  newImages.value = [...newImages.value, ...toAdd]
  newImagePreviews.value = [...newImagePreviews.value, ...toAdd.map(f => URL.createObjectURL(f))]
  e.target.value = ''
}

function removeExistingImage(filename) {
  existingImages.value = existingImages.value.filter(f => f !== filename)
}

function removeNewImage(idx) {
  newImages.value.splice(idx, 1)
  newImagePreviews.value.splice(idx, 1)
}

// ── Guardar ───────────────────────────────────────────────────────────────────
async function save() {
  saveError.value = ''
  const validationError = validateProductForm()
  if (validationError) { saveError.value = validationError; return }

  saving.value = true
  try {
    const fd = new FormData()
    fd.append('name',        form.value.name.trim())
    fd.append('description', form.value.description || '')
    fd.append('price',       form.value.price)
    const numericStock = Number(form.value.stock || 0)
    // Compatibilidad: algunos esquemas PB no aceptan stock=0 aunque UI lo permita.
    const stockToSend = numericStock === 0 ? 1 : numericStock
    fd.append('stock', String(stockToSend))
    fd.append('status',      form.value.status)
    fd.append('condition',   form.value.condition)
    fd.append('featured',    form.value.featured ? 'true' : 'false')
    if (form.value.category)         fd.append('category',         form.value.category)
    if (modalMode.value === 'edit' || modalMode.value === 'create') {
      if (form.value.discount_percent) fd.append('discount_percent', form.value.discount_percent)
      if (form.value.discount_amount)  fd.append('discount_amount',  form.value.discount_amount)
      if (form.value.discount_starts_at) fd.append('discount_starts_at', form.value.discount_starts_at)
      if (form.value.discount_ends_at)   fd.append('discount_ends_at',   form.value.discount_ends_at)
    }

    for (const img of newImages.value) fd.append('images', img)

    if (modalMode.value === 'create') {
      fd.append('store', selectedStoreId.value)
      await api.createProduct(fd)
    } else {
      // Imágenes eliminadas
      const originalProduct = products.value.find(p => p.id === editingId.value)
      const originalImages  = Array.isArray(originalProduct?.images) ? originalProduct.images : (originalProduct?.images ? [originalProduct.images] : [])
      const removedImages   = originalImages.filter(f => !existingImages.value.includes(f))
      if (removedImages.length) fd.append('remove_images', removedImages.join(','))
      await api.updateProduct(editingId.value, fd)
    }

    showModal.value = false
    await loadProducts()
  } catch (e) {
    saveError.value = e.message
  } finally {
    saving.value = false
  }
}

// ── Eliminar ──────────────────────────────────────────────────────────────────
async function confirmDelete(id) { confirmId.value = id }

async function doDelete() {
  if (!confirmId.value) return
  deleting.value = true
  try {
    await api.deleteProduct(confirmId.value)
    confirmId.value = null
    await loadProducts()
  } catch (e) { error.value = e.message }
  finally { deleting.value = false }
}

async function quickSetProductStatus(product, status, extra = {}) {
  updatingStatusId.value = product.id
  try {
    await api.updateProductStatus(product.id, {
      status,
      ...(extra.stock !== undefined ? { stock: Number(extra.stock) } : {}),
    })
    await loadProducts()
  } catch (e) {
    error.value = e.message
  } finally {
    updatingStatusId.value = null
  }
}

async function handleProductStatusAction(product) {
  if (product.status === 'out_of_stock') {
    openRestockModal(product)
    return
  }

  await quickSetProductStatus(product, nextProductStatus(product.status))
}

function openRestockModal(product) {
  restockProduct.value = product
  restockQuantity.value = String(Math.max(1, Number(product.stock || 0) || 1))
  restockError.value = ''
  showRestockModal.value = true
}

function closeRestockModal() {
  if (restockSaving.value) return
  resetRestockModal()
}

function resetRestockModal() {
  showRestockModal.value = false
  restockProduct.value = null
  restockQuantity.value = ''
  restockError.value = ''
}

async function confirmRestock() {
  if (!restockProduct.value) return
  const stock = Number(restockQuantity.value)
  if (!Number.isInteger(stock) || stock <= 0) {
    restockError.value = 'La cantidad debe ser un número entero mayor que 0'
    return
  }

  restockSaving.value = true
  restockError.value = ''
  try {
    await quickSetProductStatus(restockProduct.value, 'draft', { stock })
    restockSaving.value = false
    resetRestockModal()
    return
  } catch (e) {
    restockError.value = e.message
  } finally {
    restockSaving.value = false
  }
}

function hasCreateDiscountValues() {
  return [
    form.value.discount_percent,
    form.value.discount_amount,
    form.value.discount_starts_at,
    form.value.discount_ends_at,
  ].some((value) => String(value || '').trim() !== '')
}

function toggleCreateDiscountPanel() {
  if (hasCreateDiscountValues()) {
    createDiscountOpen.value = true
    return
  }
  createDiscountOpen.value = !createDiscountOpen.value
}

function validateProductForm() {
  const name = form.value.name.trim()
  const price = Number(form.value.price)
  const stock = Number(form.value.stock)
  const discountPercentRaw = String(form.value.discount_percent || '').trim()
  const discountAmountRaw = String(form.value.discount_amount || '').trim()
  const discountStart = String(form.value.discount_starts_at || '').trim()
  const discountEnd = String(form.value.discount_ends_at || '').trim()

  if (!name) return 'El nombre es obligatorio'
  if (!Number.isFinite(price) || price < 0) return 'El precio debe ser un número válido mayor o igual a 0'
  if (!Number.isInteger(stock) || stock < 0) return 'El stock debe ser un número entero mayor o igual a 0'
  if (discountPercentRaw !== '') {
    const discountPercent = Number(discountPercentRaw)
    if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100) return 'El descuento porcentual debe estar entre 0 y 100'
  }
  if (discountAmountRaw !== '') {
    const discountAmount = Number(discountAmountRaw)
    if (!Number.isFinite(discountAmount) || discountAmount < 0) return 'El descuento en Bs debe ser mayor o igual a 0'
  }
  if ((discountStart && !discountEnd) || (!discountStart && discountEnd)) return 'Debes indicar inicio y fin del descuento'
  if (discountStart && discountEnd && new Date(discountStart) > new Date(discountEnd)) return 'La fecha de inicio del descuento no puede ser mayor que la fecha final'
  return ''
}

function nextProductStatus(status) {
  if (status === 'out_of_stock') return 'draft'
  if (status === 'active') return 'draft'
  return 'active'
}

function statusActionLabel(status) {
  if (status === 'out_of_stock') return 'Reponer'
  if (status === 'active') return 'Pausar'
  return 'Activar'
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const PB = import.meta.env.VITE_POCKETBASE_URL || ''
function imgUrl(product, filename) {
  if (!filename) return ''
  return `${PB}/api/files/products/${product.id}/${filename}`
}

function firstImage(product) {
  const imgs = Array.isArray(product.images) ? product.images : (product.images ? [product.images] : [])
  return imgs[0] || ''
}

const STATUS_LABELS = {
  active: 'Activo', draft: 'Borrador', sold: 'Vendido',
  out_of_stock: 'Sin stock', reserved: 'Reservado', archived: 'Archivado',
}
const STATUS_COLORS = {
  active:      'text-emerald-400 border-emerald-900/50 bg-emerald-950/40',
  draft:       'text-yellow-400 border-yellow-900/50 bg-yellow-950/40',
  sold:        'text-blue-400 border-blue-900/50 bg-blue-950/40',
  out_of_stock:'text-orange-400 border-orange-900/50 bg-orange-950/40',
  reserved:    'text-purple-400 border-purple-900/50 bg-purple-950/40',
  archived:    'text-text-muted border-border-default bg-surface-raised',
}

function money(v) {
  return new Intl.NumberFormat('es-BO', { maximumFractionDigits: 0 }).format(Number(v || 0))
}
</script>

<template>
  <div class="p-5 lg:p-8 min-h-screen">

    <!-- Encabezado -->
    <div class="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
      <div class="flex-1">
        <p class="text-[10px] tracking-[0.2em] uppercase text-text-disabled mb-0.5">Vendedor</p>
        <h1 class="text-xl lg:text-2xl font-light tracking-wide text-text-primary">Productos</h1>
      </div>
      <button class="btn-primary shrink-0" @click="openCreate">
        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
        </svg>
        Nuevo producto
      </button>
    </div>

    <!-- Filtros -->
    <div class="flex flex-col sm:flex-row gap-3 mb-5">
      <input
        v-model="search"
        type="text"
        placeholder="Buscar por nombre..."
        class="input-field flex-1 max-w-xs"
      />
      <select v-model="filterStatus" class="input-field w-40">
        <option value="">Todos los estados</option>
        <option v-for="(label, val) in STATUS_LABELS" :key="val" :value="val">{{ label }}</option>
      </select>
      <span class="text-[11px] text-text-muted self-center">{{ totalItems }} productos</span>
    </div>

    <!-- Error -->
    <div v-if="error" class="mb-4 px-4 py-3 bg-red-950/40 border border-red-900/50 text-red-400 text-sm rounded-sm">{{ error }}</div>

    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center py-20 text-text-muted text-sm">Cargando...</div>

    <!-- Vacío -->
    <div v-else-if="!products.length" class="panel flex items-center justify-center py-20">
      <div class="text-center">
        <svg class="w-10 h-10 text-text-disabled mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1">
          <path stroke-linecap="round" stroke-linejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
        </svg>
        <p class="text-text-muted text-sm">No hay productos. ¡Crea el primero!</p>
      </div>
    </div>

    <!-- Tabla/Grid de productos -->
    <div v-else class="overflow-x-auto rounded-sm border border-[var(--surface-overlay)]">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-[var(--surface-overlay)] bg-surface-sunken">
            <th class="th">Producto</th>
            <th class="th hidden sm:table-cell">Precio</th>
            <th class="th hidden md:table-cell">Stock</th>
            <th class="th hidden sm:table-cell">Estado</th>
            <th class="th hidden lg:table-cell">Condición</th>
            <th class="th w-24"></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="product in products"
            :key="product.id"
            class="border-b border-border-subtle bg-surface-base hover:bg-surface-sunken transition-colors cursor-pointer"
            @click="openEdit(product)"
          >
            <!-- Nombre + imagen -->
            <td class="td">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-sm border border-border-subtle bg-surface-raised overflow-hidden shrink-0">
                  <img
                    v-if="firstImage(product)"
                    :src="imgUrl(product, firstImage(product))"
                    :alt="product.name"
                    class="w-full h-full object-cover"
                  />
                  <div v-else class="w-full h-full flex items-center justify-center">
                    <svg class="w-4 h-4 text-text-disabled" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                </div>
                <div class="min-w-0">
                  <p class="text-text-primary text-[13px] truncate max-w-40">{{ product.name }}</p>
                  <p v-if="product.discount_percent" class="text-[10px] text-vendor">-{{ product.discount_percent }}%</p>
                </div>
              </div>
            </td>
            <!-- Precio -->
            <td class="td hidden sm:table-cell text-accent">Bs {{ money(product.price) }}</td>
            <!-- Stock -->
            <td class="td hidden md:table-cell">
              <span :class="product.stock === 0 ? 'text-red-400' : 'text-text-secondary'">{{ product.stock }}</span>
            </td>
            <!-- Estado -->
            <td class="td hidden sm:table-cell">
              <span class="status-badge" :class="STATUS_COLORS[product.status]">
                {{ STATUS_LABELS[product.status] || product.status }}
              </span>
            </td>
            <!-- Condición -->
            <td class="td hidden lg:table-cell text-text-muted capitalize">{{ product.condition }}</td>
            <!-- Acciones -->
            <td class="td text-right" @click.stop>
              <div class="flex items-center justify-end gap-1 flex-wrap">
                <button
                  class="action-btn action-btn-fixed"
                  :disabled="updatingStatusId === product.id"
                  @click.stop="handleProductStatusAction(product)"
                >{{ updatingStatusId === product.id ? '...' : statusActionLabel(product.status) }}</button>
                <button
                  v-if="product.status !== 'out_of_stock' || Number(product.stock) > 0"
                  class="action-btn action-btn-fixed text-orange-400/80 border-orange-900/40 hover:bg-orange-950/30"
                  :disabled="updatingStatusId === product.id"
                  @click.stop="quickSetProductStatus(product, 'out_of_stock', { stock: 0 })"
                >Sin stock</button>
                <button class="icon-btn text-red-500/60 hover:text-red-400" title="Eliminar" @click.stop="confirmDelete(product.id)">
                  <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Paginación -->
    <div v-if="totalPages > 1" class="flex items-center justify-center gap-2 mt-5">
      <button class="page-btn" :disabled="page <= 1" @click="page--">←</button>
      <span class="text-[11px] text-text-muted">{{ page }} / {{ totalPages }}</span>
      <button class="page-btn" :disabled="page >= totalPages" @click="page++">→</button>
    </div>

    <!-- ════ MODAL CREAR/EDITAR ════════════════════════════════════════════ -->
    <Transition name="modal">
      <div v-if="showModal" class="fixed inset-0 z-50 flex items-start justify-center bg-black/70 backdrop-blur-sm overflow-y-auto py-8 px-4">
        <div class="modal-box w-full max-w-2xl my-auto">

          <div class="flex items-center justify-between mb-5">
            <h2 class="text-[15px] font-medium text-text-primary">
              {{ modalMode === 'create' ? 'Nuevo producto' : 'Editar producto' }}
            </h2>
            <button class="icon-btn" @click="showModal = false">
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div v-if="saveError" class="mb-4 px-3 py-2 bg-red-950/40 border border-red-900/50 text-red-400 text-xs rounded-sm">{{ saveError }}</div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">

            <!-- Nombre -->
            <div class="sm:col-span-2">
              <label class="form-label">Nombre *</label>
              <input v-model="form.name" type="text" class="input-field w-full" placeholder="Nombre del producto" />
            </div>

            <!-- Descripción -->
            <div class="sm:col-span-2">
              <label class="form-label">Descripción</label>
              <textarea v-model="form.description" class="input-field w-full h-20 resize-none" placeholder="Descripción del producto..."></textarea>
            </div>

            <!-- Precio -->
            <div>
              <label class="form-label">Precio (Bs) *</label>
              <input v-model="form.price" type="number" min="0" step="0.01" class="input-field w-full" placeholder="0.00" />
            </div>

            <!-- Stock -->
            <div>
              <label class="form-label">Stock</label>
              <input v-model="form.stock" type="number" min="0" class="input-field w-full" placeholder="1" />
            </div>

            <!-- Categoría -->
            <div>
              <label class="form-label">Categoría</label>
              <select v-model="form.category" class="input-field w-full">
                <option value="">Sin categoría</option>
                <option v-for="cat in categories" :key="cat.id" :value="cat.id">{{ cat.name }}</option>
              </select>
            </div>

            <!-- Estado -->
            <div>
              <label class="form-label">Estado</label>
              <select v-model="form.status" class="input-field w-full">
                <option value="active">Activo</option>
                <option value="draft">Borrador</option>
                <option value="out_of_stock">Sin stock</option>
                <option value="archived">Archivado</option>
              </select>
            </div>

            <!-- Condición -->
            <div>
              <label class="form-label">Condición</label>
              <select v-model="form.condition" class="input-field w-full">
                <option value="new">Nuevo</option>
                <option value="used">Usado</option>
                <option value="refurbished">Reacondicionado</option>
              </select>
            </div>

            <!-- Destacado -->
            <div class="flex items-center gap-3">
              <input id="featured" v-model="form.featured" type="checkbox" class="w-4 h-4 accent-[var(--vendor)]" />
              <label for="featured" class="form-label mb-0 cursor-pointer">Producto destacado</label>
            </div>

            <template v-if="modalMode === 'edit'">
              <div class="sm:col-span-2 discount-panel">
                <div class="flex items-center justify-between mb-3">
                  <p class="text-[10px] tracking-[0.2em] uppercase text-text-disabled">Descuento</p>
                  <div class="flex items-center gap-1.5">
                    <button type="button" class="mini-chip" @click="form.discount_percent = '10'">10%</button>
                    <button type="button" class="mini-chip" @click="form.discount_percent = '15'">15%</button>
                    <button type="button" class="mini-chip" @click="form.discount_percent = '20'">20%</button>
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
                  <div>
                    <label class="form-label">Inicio descuento</label>
                    <input v-model="form.discount_starts_at" type="date" class="input-field w-full" />
                  </div>
                  <div>
                    <label class="form-label">Fin descuento</label>
                    <input v-model="form.discount_ends_at" type="date" class="input-field w-full" />
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
                      <p class="text-[10px] tracking-[0.2em] uppercase text-text-disabled">Descuento</p>
                      <p class="text-[11px] text-text-muted mt-1">Opcional al crear</p>
                    </div>
                    <span class="discount-panel-pill">
                      {{ hasCreateDiscountValues() ? 'Bloqueado' : (createDiscountOpen ? 'Ocultar' : 'Mostrar') }}
                    </span>
                  </button>
                  <div v-show="createDiscountOpen || hasCreateDiscountValues()" class="discount-panel-body">
                    <div class="flex flex-wrap items-center gap-1.5 mb-3">
                      <button type="button" class="mini-chip" @click="form.discount_percent = '10'">10%</button>
                      <button type="button" class="mini-chip" @click="form.discount_percent = '15'">15%</button>
                      <button type="button" class="mini-chip" @click="form.discount_percent = '20'">20%</button>
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
                      <div>
                        <label class="form-label">Inicio descuento</label>
                        <input v-model="form.discount_starts_at" type="date" class="input-field w-full" />
                      </div>
                      <div>
                        <label class="form-label">Fin descuento</label>
                        <input v-model="form.discount_ends_at" type="date" class="input-field w-full" />
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
                <div
                  v-for="(img, idx) in existingImages"
                  :key="img"
                  class="relative w-16 h-16 rounded-sm border border-border-default overflow-hidden group"
                >
                  <img :src="imgUrl({ id: editingId }, img)" class="w-full h-full object-cover" />
                  <button
                    class="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity"
                    @click="removeExistingImage(img)"
                    title="Eliminar imagen"
                  >
                    <svg class="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            <!-- Nuevas imágenes -->
            <div class="sm:col-span-2">
              <label class="form-label">
                {{ modalMode === 'edit' ? 'Añadir imágenes' : 'Imágenes' }}
                <span class="text-text-muted"> (máx. {{ Math.max(0, 8 - existingImages.length - newImages.length) }} más)</span>
              </label>
              <input
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp"
                class="input-field w-full text-text-muted file:mr-3 file:py-1 file:px-3 file:rounded-sm file:border-0 file:bg-surface-overlay file:text-text-muted file:text-xs"
                @change="onFileChange"
              />
              <div v-if="newImagePreviews.length" class="flex flex-wrap gap-2 mt-2">
                <div
                  v-for="(url, idx) in newImagePreviews"
                  :key="url"
                  class="relative w-24 h-24 rounded-sm border border-border-default overflow-hidden group"
                >
                  <img :src="url" class="w-full h-full object-cover" />
                  <button
                    class="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity"
                    @click="removeNewImage(idx)"
                  >
                    <svg class="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Botones -->
          <div class="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-[var(--surface-overlay)]">
            <button class="btn-ghost" :disabled="saving" @click="showModal = false">Cancelar</button>
            <button class="btn-primary" :disabled="saving" @click="save">
              {{ saving ? 'Guardando...' : (modalMode === 'create' ? 'Crear producto' : 'Guardar cambios') }}
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- ════ MODAL REPOSICIÓN ════════════════════════════════════════════ -->
    <Transition name="modal">
      <div v-if="showRestockModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
        <div class="modal-box w-full max-w-sm">
          <div class="flex items-center justify-between mb-5">
            <h2 class="text-[15px] font-medium text-text-primary">Reponer stock</h2>
            <button class="icon-btn" :disabled="restockSaving" @click="closeRestockModal">
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <p class="text-[13px] text-text-secondary mb-1 truncate">{{ restockProduct?.name }}</p>
          <p class="text-[11px] text-text-muted mb-4">Ingresa la nueva cantidad disponible para volver a activarlo.</p>

          <div v-if="restockError" class="mb-4 px-3 py-2 bg-red-950/40 border border-red-900/50 text-red-400 text-xs rounded-sm">{{ restockError }}</div>

          <div>
            <label class="form-label">Nuevo stock</label>
            <input v-model="restockQuantity" type="number" min="1" step="1" class="input-field w-full" placeholder="1" />
          </div>

          <div class="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-[var(--surface-overlay)]">
            <button class="btn-ghost" :disabled="restockSaving" @click="closeRestockModal">Cancelar</button>
            <button class="btn-primary" :disabled="restockSaving" @click="confirmRestock">
              {{ restockSaving ? 'Reponiendo...' : 'Confirmar' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- ════ MODAL CONFIRMAR ELIMINAR ══════════════════════════════════════ -->
    <Transition name="modal">
      <div v-if="confirmId" class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
        <div class="modal-box w-full max-w-sm text-center">
          <p class="text-text-primary text-[14px] mb-2">¿Eliminar este producto?</p>
          <p class="text-text-muted text-xs mb-6">Esta acción no se puede deshacer.</p>
          <div class="flex gap-3 justify-center">
            <button class="btn-ghost" :disabled="deleting" @click="confirmId = null">Cancelar</button>
            <button class="btn-danger" :disabled="deleting" @click="doDelete">
              {{ deleting ? 'Eliminando...' : 'Eliminar' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>

  </div>
</template>

<style scoped>
.panel { background: var(--surface-sunken); border: 1px solid var(--surface-overlay); border-radius: 3px; padding: 1rem; }
.th { padding: 0.65rem 0.9rem; font-size: 0.62rem; letter-spacing: 0.16em; text-transform: uppercase; color: var(--border-strong); text-align: left; }
.td { padding: 0.7rem 0.9rem; }
.status-badge { font-size: 0.625rem; letter-spacing: 0.14em; text-transform: uppercase; padding: 0.2rem 0.5rem; border-radius: 2px; border-width: 1px; border-style: solid; }
.icon-btn { padding: 0.3rem; border-radius: 2px; color: var(--text-muted); transition: color 0.15s, background 0.15s; }
.icon-btn:hover { color: var(--text-secondary); background: var(--surface-raised); }
.action-btn { padding: 0.25rem 0.6rem; font-size: 0.68rem; letter-spacing: 0.08em; border-radius: 2px; border: 1px solid var(--border-default); color: var(--text-muted); background: transparent; transition: all 0.15s; white-space: nowrap; }
.action-btn:hover:not(:disabled) { border-color: var(--text-disabled); color: var(--text-secondary); background: var(--surface-raised); }
.action-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.action-btn-fixed { width: 78px; text-align: center; }
.discount-panel { border: 1px solid var(--vendor-soft); background: var(--vendor-soft); border-radius: 3px; overflow: hidden; }
.discount-panel--create { padding: 0; }
.discount-panel-head { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 0.8rem; text-align: left; }
.discount-panel-body { padding: 0.8rem; border-top: 1px solid var(--vendor-soft); }
.discount-panel-pill { font-size: 0.62rem; letter-spacing: 0.14em; text-transform: uppercase; color: var(--vendor); border: 1px solid var(--vendor-soft); background: var(--vendor-soft); border-radius: 999px; padding: 0.22rem 0.55rem; white-space: nowrap; }
.discount-show-btn { width: 100%; padding: 0.85rem 1rem; border: 1px dashed var(--vendor-soft); border-radius: 3px; background: var(--vendor-soft); color: var(--vendor); text-align: left; font-size: 0.72rem; letter-spacing: 0.1em; text-transform: uppercase; }
.mini-chip { border: 1px solid var(--border-default); background: var(--surface-raised); color: var(--text-muted); font-size: 0.62rem; letter-spacing: 0.08em; text-transform: uppercase; border-radius: 999px; padding: 0.18rem 0.5rem; transition: all 0.15s; }
.mini-chip:hover { border-color: var(--vendor)44; color: var(--vendor); }
.input-field { background: var(--surface-raised); border: 1px solid var(--border-subtle); border-radius: 2px; padding: 0.45rem 0.65rem; font-size: 0.8rem; color: var(--text-secondary); outline: none; transition: border-color 0.15s; }
.input-field:focus { border-color: var(--vendor)44; }
.form-label { display: block; font-size: 0.62rem; letter-spacing: 0.14em; text-transform: uppercase; color: var(--text-muted); margin-bottom: 0.4rem; }
.btn-primary { display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.5rem 1rem; background: var(--vendor)22; border: 1px solid var(--vendor)44; border-radius: 2px; color: var(--vendor); font-size: 0.75rem; letter-spacing: 0.08em; transition: all 0.15s; }
.btn-primary:hover:not(:disabled) { background: var(--vendor)33; border-color: var(--vendor)66; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-ghost { padding: 0.5rem 1rem; background: transparent; border: 1px solid var(--border-default); border-radius: 2px; color: var(--text-muted); font-size: 0.75rem; transition: all 0.15s; }
.btn-ghost:hover:not(:disabled) { border-color: var(--text-disabled); color: var(--text-secondary); }
.btn-ghost:disabled { opacity: 0.5; }
.btn-danger { padding: 0.5rem 1rem; background: var(--danger-soft)33; border: 1px solid var(--danger)55; border-radius: 2px; color: var(--danger); font-size: 0.75rem; transition: all 0.15s; }
.btn-danger:hover:not(:disabled) { background: var(--danger-soft)55; }
.btn-danger:disabled { opacity: 0.5; }
.page-btn { padding: 0.3rem 0.7rem; background: var(--surface-raised); border: 1px solid var(--border-subtle); border-radius: 2px; color: var(--text-muted); font-size: 0.75rem; transition: all 0.15s; }
.page-btn:hover:not(:disabled) { color: var(--text-secondary); border-color: var(--text-disabled); }
.page-btn:disabled { opacity: 0.3; cursor: not-allowed; }
.modal-box { background: var(--surface-base); border: 1px solid var(--border-subtle); border-radius: 4px; padding: 1.5rem; }
.modal-enter-active, .modal-leave-active { transition: opacity 0.2s ease; }
.modal-enter-from, .modal-leave-to { opacity: 0; }
</style>
