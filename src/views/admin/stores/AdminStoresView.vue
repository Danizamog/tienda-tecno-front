<script setup>
import { ref, reactive, watch, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAdminApi } from '@/composables/useAdminApi'

const router  = useRouter()
const api     = useAdminApi()

// ── Estado de lista ───────────────────────────────────────────────────────────
const stores      = ref([])
const totalItems  = ref(0)
const totalPages  = ref(1)
const loading     = ref(false)
const error       = ref('')

const filters = reactive({
  search:   '',
  status:   '',
  verified: '',
  sort:     '-id',
  page:     1,
  perPage:  12,
})

// ── Estado modal "Crear tienda" ───────────────────────────────────────────────
const showCreate  = ref(false)
const creating    = ref(false)
const createError = ref('')
const userResults = ref([])
const userSearch  = ref('')
const userSearchLoading = ref(false)
const selectedOwners = ref([]) // [{ id, name, email }]

const form = reactive({
  name: '', slug: '', description: '',
  status: 'active', location: '', whatsapp: '', instagram: '',
})

// ── Estado modal "Gestionar propietarios" ─────────────────────────────────────
const showOwners      = ref(false)
const ownersStore     = ref(null)   // { id, name, expand.owner }
const ownersLoading   = ref(false)
const ownersError     = ref('')
const ownersSearch    = ref('')
const ownersResults   = ref([])
const ownersSearchLoading = ref(false)
const currentOwners   = ref([])     // [{ id, name, email }]

let ownersSearchTimer = null

watch(ownersSearch, (v) => {
  clearTimeout(ownersSearchTimer)
  if (v.length < 2) { ownersResults.value = []; return }
  ownersSearchLoading.value = true
  ownersSearchTimer = setTimeout(async () => {
    try {
      const data = await api.searchUsers(v, ['admin', 'vendor'])
      ownersResults.value = (data?.items || []).filter(u => !currentOwners.value.find(o => o.id === u.id))
    } catch { ownersResults.value = [] }
    finally { ownersSearchLoading.value = false }
  }, 350)
})

async function openOwnersModal(store) {
  ownersStore.value   = store
  ownersSearch.value  = ''
  ownersResults.value = []
  ownersError.value   = ''
  showOwners.value    = true

  const owners = store.expand?.owner
  if (Array.isArray(owners)) {
    currentOwners.value = owners.map(o => ({ id: o.id, name: o.name || '', email: o.email }))
  } else if (owners) {
    currentOwners.value = [{ id: owners.id, name: owners.name || '', email: owners.email }]
  } else {
    currentOwners.value = []
  }
}

async function addOwnerToStore(u) {
  if (currentOwners.value.find(o => o.id === u.id)) return
  const updated = [...currentOwners.value, { id: u.id, name: u.name || '', email: u.email }]
  await saveOwners(updated)
  ownersSearch.value  = ''
  ownersResults.value = []
}

async function removeOwnerFromStore(ownerId) {
  const updated = currentOwners.value.filter(o => o.id !== ownerId)
  await saveOwners(updated)
}

async function saveOwners(owners) {
  ownersLoading.value = true
  ownersError.value   = ''
  try {
    const ids = owners.map(o => o.id)
    await api.updateStore(ownersStore.value.id, { owner: ids })
    currentOwners.value = owners
    // Actualizar el store en la lista local
    const s = stores.value.find(s => s.id === ownersStore.value.id)
    if (s) {
      s.owner = ids
      if (!s.expand) s.expand = {}
      s.expand.owner = owners.map(o => ({ id: o.id, name: o.name, email: o.email }))
    }
  } catch (e) {
    ownersError.value = e.message
  } finally {
    ownersLoading.value = false
  }
}

const createLogoInput = ref(null)
const createBannerInput = ref(null)
const createLogoFile = ref(null)
const createBannerFile = ref(null)
const createLogoPreview = ref(null)
const createBannerPreview = ref(null)

function createStoreValidationError() {
  const name = form.name.trim()
  const slug = form.slug.trim()
  const description = form.description.trim()
  const whatsapp = form.whatsapp.trim()
  const instagram = form.instagram.trim()

  if (!name) return 'El nombre de la tienda es obligatorio.'
  if (!slug) return 'El slug es obligatorio. Ej: mi-tienda'
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return 'El slug solo puede contener minúsculas, números y guiones.'
  if (description.length > 1000) return 'La descripción no puede superar 1000 caracteres.'
  if (whatsapp && !/^\+?[0-9\s()-]{7,20}$/.test(whatsapp)) return 'El WhatsApp no tiene un formato válido.'
  if (instagram && !/^@?[A-Za-z0-9._]{2,30}$/.test(instagram)) return 'El Instagram no tiene un formato válido.'
  if (selectedOwners.value.length === 0) return 'Debes seleccionar al menos un propietario.'
  return ''
}

function onCreateLogoSelected(e) {
  const file = e.target.files?.[0]
  createLogoFile.value = file || null
  if (file) {
    createLogoPreview.value = URL.createObjectURL(file)
  } else {
    createLogoPreview.value = null
  }
}

function onCreateBannerSelected(e) {
  const file = e.target.files?.[0]
  createBannerFile.value = file || null
  if (file) {
    createBannerPreview.value = URL.createObjectURL(file)
  } else {
    createBannerPreview.value = null
  }
}

// ── Modal de confirmación de borrado ──────────────────────────────────────────
const confirmDelete = ref(null) // { id, name }
const deleting      = ref(false)

// ── Helpers ───────────────────────────────────────────────────────────────────
function toSlug(str) {
  return str.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').trim()
}

function statusLabel(s)  { return { active: 'Activa', suspended: 'Suspendida', pending: 'Pendiente' }[s] || s }
function statusClass(s)  { return { active: 'badge-active', suspended: 'badge-suspended', pending: 'badge-pending' }[s] || '' }
function fmtDate(d)      { return d ? new Date(d).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' }) : '—' }
function ownerName(item) {
  // Si es múltiple (array de owners)
  if (Array.isArray(item?.expand?.owner)) {
    const names = item.expand.owner.map(o => o.name || o.email).filter(Boolean)
    return names.length > 0 ? names.join(', ') : '—'
  }
  // Si es uno a uno
  return item?.expand?.owner?.name || item?.expand?.owner?.email || item?.owner || '—'
}
function stars(r)        { return Math.round(r || 0) }

// ── Cargar tiendas ────────────────────────────────────────────────────────────
async function load() {
  loading.value = true
  error.value   = ''
  try {
    const data = await api.listStores({
      page:     filters.page,
      perPage:  filters.perPage,
      status:   filters.status,
      search:   filters.search,
      verified: filters.verified,
      sort:     filters.sort,
    })
    stores.value     = data?.items     || []
    totalItems.value = data?.totalItems || 0
    totalPages.value = data?.totalPages || 1
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

// Reset página cuando cambian filtros
watch([() => filters.search, () => filters.status, () => filters.verified, () => filters.sort], () => {
  filters.page = 1
  load()
})

onMounted(load)

// ── Búsqueda de usuario al crear ──────────────────────────────────────────────
let userSearchTimer = null

watch(userSearch, (v) => {
  clearTimeout(userSearchTimer)
  if (v.length < 2) {
    userResults.value = []
    return
  }
  userSearchLoading.value = true
  userSearchTimer = setTimeout(async () => {
    try {
      const data = await api.searchUsers(v, ['admin', 'vendor'])
      userResults.value = (data?.items || []).filter(u => !selectedOwners.value.find(o => o.id === u.id))
    } catch (_e) {
      userResults.value = []
    } finally {
      userSearchLoading.value = false
    }
  }, 350)
})

function selectUser(u) {
  if (selectedOwners.value.find(o => o.id === u.id)) return
  selectedOwners.value.push({ id: u.id, name: u.name || '', email: u.email })
  userSearch.value  = ''
  userResults.value = []
}

function removeSelectedOwner(id) {
  selectedOwners.value = selectedOwners.value.filter(o => o.id !== id)
}

watch(() => form.name, (v) => {
  if (!form.slug || form.slug === toSlug(form.name.slice(0, -1))) {
    form.slug = toSlug(v)
  }
})

// ── Crear tienda ──────────────────────────────────────────────────────────────
async function submitCreate() {
  createError.value = ''
  const validationError = createStoreValidationError()
  if (validationError) {
    createError.value = validationError
    return
  }
  creating.value = true
  try {
    const fd = new FormData()
    fd.append('name', form.name.trim())
    fd.append('slug', form.slug.trim())
    fd.append('description', form.description.trim())
    selectedOwners.value.forEach(o => fd.append('owner', o.id))
    fd.append('status', form.status)
    fd.append('location', form.location.trim())
    fd.append('whatsapp', form.whatsapp.trim())
    fd.append('instagram', form.instagram.trim())

    if (createLogoFile.value) fd.append('logo', createLogoFile.value)
    if (createBannerFile.value) fd.append('banner', createBannerFile.value)

    await api.createStore(fd)

    showCreate.value = false
    Object.assign(form, { name: '', slug: '', description: '', status: 'active', location: '', whatsapp: '', instagram: '' })
    selectedOwners.value = []
    createLogoFile.value = null
    createBannerFile.value = null
    createLogoPreview.value = null
    createBannerPreview.value = null
    if (createLogoInput.value) createLogoInput.value.value = ''
    if (createBannerInput.value) createBannerInput.value.value = ''
    userSearch.value = ''
    load()
  } catch (e) {
    createError.value = e.message
  } finally {
    creating.value = false
  }
}

// ── Cambio rápido de estado ───────────────────────────────────────────────────
async function toggleStatus(store) {
  const next = store.status === 'active' ? 'suspended' : 'active'
  try {
    await api.updateStore(store.id, { status: next })
    store.status = next
  } catch (e) {
    alert('Error al cambiar estado: ' + e.message)
  }
}

async function toggleVerified(store) {
  try {
    await api.updateStore(store.id, { verified: !store.verified })
    store.verified = !store.verified
  } catch (e) {
    alert('Error al cambiar verificación: ' + e.message)
  }
}

// ── Eliminar ──────────────────────────────────────────────────────────────────
async function doDelete() {
  if (!confirmDelete.value) return
  deleting.value = true
  try {
    await api.deleteStore(confirmDelete.value.id)
    confirmDelete.value = null
    load()
  } catch (e) {
    alert('Error al eliminar: ' + e.message)
  } finally {
    deleting.value = false
  }
}

const pages = computed(() => {
  const arr = []
  for (let i = 1; i <= totalPages.value; i++) arr.push(i)
  return arr
})
</script>

<template>
  <div class="p-6 lg:p-8 min-h-screen">

    <!-- Encabezado -->
    <div class="flex items-center justify-between mb-8">
      <div>
        <p class="text-[10px] tracking-[0.2em] uppercase text-[#3a3a38] mb-1">Administración</p>
        <h1 class="text-2xl font-light tracking-wide text-[#e8e5e0]">Tiendas</h1>
      </div>
      <button class="btn-gold" @click="showCreate = true">
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
        </svg>
        Nueva tienda
      </button>
    </div>

    <!-- Filtros -->
    <div class="flex flex-wrap gap-3 mb-6">
      <div class="relative flex-1" style="min-width: 200px;">
        <svg class="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#444]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          v-model="filters.search"
          type="text"
          placeholder="Buscar por nombre o slug…"
          class="admin-input pr-9 w-full"
        />
      </div>

      <select v-model="filters.status" class="admin-input" style="min-width: 140px;">
        <option value="">Todos los estados</option>
        <option value="active">Activa</option>
        <option value="pending">Pendiente</option>
        <option value="suspended">Suspendida</option>
      </select>

      <select v-model="filters.verified" class="admin-input" style="min-width: 140px;">
        <option value="">Verificación: todas</option>
        <option value="true">Verificadas</option>
        <option value="false">No verificadas</option>
      </select>

      <select v-model="filters.sort" class="admin-input" style="min-width: 160px;">
        <option value="-id">Más recientes</option>
        <option value="id">Más antiguas</option>
        <option value="name">Nombre A-Z</option>
        <option value="-name">Nombre Z-A</option>
        <option value="-rating">Mayor rating</option>
      </select>
    </div>

    <!-- Stats rápidas -->
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
      <div class="stat-card">
        <p class="stat-label">Total</p>
        <p class="stat-value">{{ totalItems }}</p>
      </div>
      <div class="stat-card">
        <p class="stat-label">Activas</p>
        <p class="stat-value text-emerald-500">{{ stores.filter(s => s.status === 'active').length }}</p>
      </div>
      <div class="stat-card">
        <p class="stat-label">Pendientes</p>
        <p class="stat-value text-amber-400">{{ stores.filter(s => s.status === 'pending').length }}</p>
      </div>
      <div class="stat-card">
        <p class="stat-label">Suspendidas</p>
        <p class="stat-value text-red-400">{{ stores.filter(s => s.status === 'suspended').length }}</p>
      </div>
    </div>

    <!-- Error -->
    <div v-if="error" class="mb-4 px-4 py-3 bg-red-950/40 border border-red-900/50 text-red-400 text-sm rounded-sm">
      {{ error }}
    </div>

    <!-- Tabla -->
    <div class="border border-[#181818] rounded-sm overflow-x-auto">
      <!-- Loading skeleton -->
      <div v-if="loading" class="flex items-center justify-center py-20 bg-[#0a0a0a]">
        <div class="flex gap-1.5">
          <span class="dot-pulse"></span>
          <span class="dot-pulse delay-150"></span>
          <span class="dot-pulse delay-300"></span>
        </div>
      </div>

      <template v-else>
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-[#181818] bg-[#0c0c0c]">
              <th class="th">Tienda</th>
              <th class="th hidden md:table-cell">Propietario</th>
              <th class="th">Estado</th>
              <th class="th hidden sm:table-cell">Verificada</th>
              <th class="th hidden lg:table-cell">Rating</th>
              <th class="th hidden xl:table-cell">Creada</th>
              <th class="th text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="stores.length === 0">
              <td colspan="7" class="px-4 py-12 text-center text-[#444] text-sm">
                No se encontraron tiendas con los filtros actuales.
              </td>
            </tr>
            <tr
              v-for="store in stores"
              :key="store.id"
              class="border-b border-[#111] hover:bg-[#0d0d0d] transition-colors"
            >
              <!-- Nombre + slug -->
              <td class="td">
                <p class="text-[#d8d5cf] font-medium leading-tight">{{ store.name }}</p>
                <p class="text-[10px] text-[#444] mt-0.5">{{ store.slug }}</p>
              </td>

              <!-- Propietario -->
              <td class="td hidden md:table-cell text-[#888880]">
                {{ ownerName(store) }}
              </td>

              <!-- Estado -->
              <td class="td">
                <span :class="['badge', statusClass(store.status)]">
                  {{ statusLabel(store.status) }}
                </span>
              </td>

              <!-- Verificada -->
              <td class="td hidden sm:table-cell">
                <button
                  :class="['verify-btn', store.verified ? 'verify-btn-on' : 'verify-btn-off']"
                  :title="store.verified ? 'Quitar verificación' : 'Verificar tienda'"
                  @click="toggleVerified(store)"
                >
                  <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {{ store.verified ? 'Sí' : 'No' }}
                </button>
              </td>

              <!-- Rating -->
              <td class="td hidden lg:table-cell">
                <div class="flex items-center gap-1 text-[#c9a96e]">
                  <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                  </svg>
                  <span class="text-[#888] text-xs">{{ (store.rating || 0).toFixed(1) }}</span>
                </div>
              </td>

              <!-- Fecha -->
              <td class="td hidden xl:table-cell text-[#555550] text-xs">
                {{ fmtDate(store.created) }}
              </td>

              <!-- Acciones -->
              <td class="td text-right">
                <div class="flex items-center justify-end gap-1.5">
                  <!-- Ver/editar -->
                  <button class="action-btn" title="Ver detalle" @click="router.push(`/admin/stores/${store.id}`)">
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  </button>
                  <!-- Gestionar propietarios -->
                  <button class="action-btn" title="Gestionar propietarios" @click="openOwnersModal(store)">
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </button>
                  <!-- Activar / Suspender -->
                  <button
                    class="action-btn"
                    :title="store.status === 'active' ? 'Suspender' : 'Activar'"
                    @click="toggleStatus(store)"
                  >
                    <svg v-if="store.status === 'active'" class="w-3.5 h-3.5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <svg v-else class="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      <path stroke-linecap="round" stroke-linejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </button>
                  <!-- Eliminar -->
                  <button class="action-btn text-red-500/60 hover:text-red-400" title="Eliminar" @click="confirmDelete = { id: store.id, name: store.name }">
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        <!-- Paginación -->
        <div v-if="totalPages > 1" class="flex items-center justify-between px-4 py-3 border-t border-[#181818] bg-[#0c0c0c]">
          <p class="text-xs text-[#444]">
            Página {{ filters.page }} de {{ totalPages }} · {{ totalItems }} tiendas
          </p>
          <div class="flex gap-1">
            <button class="page-btn" :disabled="filters.page <= 1" @click="filters.page--; load()">‹</button>
            <button
              v-for="p in pages"
              :key="p"
              class="page-btn"
              :class="p === filters.page ? 'page-btn-active' : ''"
              @click="filters.page = p; load()"
            >{{ p }}</button>
            <button class="page-btn" :disabled="filters.page >= totalPages" @click="filters.page++; load()">›</button>
          </div>
        </div>
      </template>
    </div>
  </div>

  <!-- ── Modal: Crear tienda ──────────────────────────────────────────────── -->
  <Transition name="modal">
    <div v-if="showCreate" class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-black/70 backdrop-blur-sm" @click="showCreate = false"></div>
      <div class="relative w-full max-w-lg bg-[#0c0c0c] border border-[#222] rounded-sm shadow-2xl overflow-hidden">

        <div class="px-6 py-4 border-b border-[#181818] flex items-center justify-between">
          <h2 class="text-[15px] font-medium text-[#e8e5e0]">Nueva tienda</h2>
          <button class="text-[#555] hover:text-[#999] transition-colors" @click="showCreate = false">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form class="px-6 py-5 flex flex-col gap-4" @submit.prevent="submitCreate">
          <div class="grid grid-cols-2 gap-4">
            <div class="col-span-2">
              <label class="form-label">Nombre *</label>
              <input v-model="form.name" type="text" class="admin-input w-full" placeholder="Ej: Atelier Norte" required />
            </div>
            <div class="col-span-2">
              <label class="form-label">Slug *</label>
              <input v-model="form.slug" type="text" class="admin-input w-full font-mono text-[#c9a96e]" placeholder="atelier-norte" required />
              <p class="mt-1 text-[10px] text-[#555]">URL amigable sin espacios ni caracteres especiales.</p>
            </div>

            <!-- Propietarios (búsqueda múltiple) -->
            <div class="col-span-2 relative">
              <label class="form-label">Propietarios *</label>

              <!-- Chips de propietarios seleccionados -->
              <div v-if="selectedOwners.length > 0" class="flex flex-wrap gap-1.5 mb-2">
                <div
                  v-for="o in selectedOwners"
                  :key="o.id"
                  class="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#1a1508] border border-[#c9a96e55] rounded-full"
                >
                  <span class="text-[11px] text-[#c9a96e] font-medium">{{ o.name || o.email }}</span>
                  <span class="text-[10px] text-[#c9a96e55]">{{ o.name ? o.email : '' }}</span>
                  <button type="button" class="text-[#c9a96e55] hover:text-[#c9a96e] text-xs leading-none ml-0.5 transition-colors" @click="removeSelectedOwner(o.id)">✕</button>
                </div>
              </div>

              <!-- Búsqueda -->
              <input
                v-model="userSearch"
                type="text"
                class="admin-input w-full"
                placeholder="Buscar por nombre o correo y añadir…"
              />

              <!-- Mensaje de ayuda -->
              <p v-if="userSearch" class="text-[10px] text-[#fbbf24] mt-1">
                {{ userSearchLoading ? 'Buscando...' : 'Selecciona de la lista para añadir' }}
              </p>

              <!-- Resultados -->
              <div v-if="userResults.length" class="absolute left-0 right-0 top-full mt-1 bg-[#111] border border-[#c9a96e77] rounded-sm z-10 overflow-hidden max-h-48 overflow-y-auto shadow-lg">
                <button
                  v-for="u in userResults"
                  :key="u.id"
                  type="button"
                  class="w-full text-left px-3 py-2.5 text-sm text-[#aaa] hover:bg-[#1a1508] hover:text-[#c9a96e] transition-colors border-b border-[#0f0f0f] last:border-b-0 flex items-center gap-3 group"
                  @click="selectUser(u)"
                >
                  <div class="w-7 h-7 rounded-full bg-[#1a1508] border border-[#c9a96e44] flex items-center justify-center text-[#c9a96e] text-xs font-medium group-hover:border-[#c9a96e]">
                    {{ (u.name || u.email)[0].toUpperCase() }}
                  </div>
                  <div class="min-w-0 flex-1">
                    <p class="font-medium truncate">{{ u.name || '—' }}</p>
                    <p class="text-[11px] text-[#555] truncate">{{ u.email }}</p>
                  </div>
                  <svg class="w-4 h-4 text-[#c9a96e77] group-hover:text-[#c9a96e]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              </div>
            </div>

            <div>
              <label class="form-label">Estado</label>
              <div class="admin-input w-full flex items-center gap-2 text-emerald-400">
                <svg class="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Activa
              </div>
            </div>
            <div>
              <label class="form-label">Ubicación (opcional)</label>
              <input v-model="form.location" type="text" class="admin-input w-full" placeholder="Ej: La Paz, Bolivia" />
            </div>
            <div>
              <label class="form-label">WhatsApp (opcional)</label>
              <input v-model="form.whatsapp" type="text" class="admin-input w-full" placeholder="+591 7XX XXX XX" />
            </div>
            <div>
              <label class="form-label">Instagram (opcional)</label>
              <input v-model="form.instagram" type="text" class="admin-input w-full" placeholder="@tienda.bolivia" />
            </div>
            <div class="col-span-2">
              <label class="form-label">Descripción (opcional)</label>
              <textarea v-model="form.description" class="admin-input w-full resize-none" rows="3" placeholder="Descripción breve de la tienda…"></textarea>
            </div>

            <div class="col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label class="form-label">Logo (opcional) · Recomendado 300x300 px</label>
                <div v-if="createLogoPreview" class="mb-2 w-full h-32 bg-black rounded-sm border border-[#222] flex items-center justify-center overflow-hidden">
                  <img :src="createLogoPreview" :alt="createLogoFile?.name" class="max-w-full max-h-full object-contain" />
                </div>
                <input ref="createLogoInput" type="file" accept="image/jpeg,image/png,image/webp,image/svg+xml" class="admin-input w-full" @change="onCreateLogoSelected" />
                <p v-if="createLogoFile" class="text-[10px] text-[#c9a96e77] mt-2 truncate">✓ {{ createLogoFile.name }}</p>
              </div>
              <div>
                <label class="form-label">Banner (opcional) · Recomendado 1200x400 px</label>
                <div v-if="createBannerPreview" class="mb-2 w-full h-32 bg-black rounded-sm border border-[#222] flex items-center justify-center overflow-hidden">
                  <img :src="createBannerPreview" :alt="createBannerFile?.name" class="max-w-full max-h-full object-cover" />
                </div>
                <input ref="createBannerInput" type="file" accept="image/jpeg,image/png,image/webp" class="admin-input w-full" @change="onCreateBannerSelected" />
                <p v-if="createBannerFile" class="text-[10px] text-[#c9a96e77] mt-2 truncate">✓ {{ createBannerFile.name }}</p>
              </div>
            </div>
          </div>

          <p v-if="createError" class="text-red-400 text-xs">{{ createError }}</p>

          <div class="flex justify-end gap-3 pt-1">
            <button type="button" class="btn-ghost" @click="showCreate = false">Cancelar</button>
            <button type="submit" class="btn-gold" :disabled="creating">
              {{ creating ? 'Creando…' : 'Crear tienda' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </Transition>

  <!-- ── Modal: Gestionar propietarios ─────────────────────────────────────── -->
  <Transition name="modal">
    <div v-if="showOwners" class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-black/70 backdrop-blur-sm" @click="showOwners = false"></div>
      <div class="relative w-full max-w-md bg-[#0c0c0c] border border-[#222] rounded-sm shadow-2xl overflow-hidden">

        <div class="px-6 py-4 border-b border-[#181818] flex items-center justify-between">
          <div>
            <h2 class="text-[15px] font-medium text-[#e8e5e0]">Propietarios</h2>
            <p class="text-[11px] text-[#555] mt-0.5">{{ ownersStore?.name }}</p>
          </div>
          <button class="text-[#555] hover:text-[#999] transition-colors" @click="showOwners = false">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div class="px-6 py-5 flex flex-col gap-4">

          <!-- Lista de propietarios actuales -->
          <div>
            <p class="form-label mb-2">Propietarios actuales</p>
            <div v-if="currentOwners.length === 0" class="text-[#444] text-xs italic py-2">Sin propietarios asignados.</div>
            <div v-else class="flex flex-col gap-1.5">
              <div
                v-for="o in currentOwners"
                :key="o.id"
                class="flex items-center justify-between px-3 py-2 bg-[#111] border border-[#1e1e1e] rounded-sm"
              >
                <div class="flex items-center gap-2.5 min-w-0">
                  <div class="w-7 h-7 rounded-full bg-[#1a1508] border border-[#c9a96e44] flex items-center justify-center text-[#c9a96e] text-xs font-medium shrink-0">
                    {{ (o.name || o.email)[0].toUpperCase() }}
                  </div>
                  <div class="min-w-0">
                    <p class="text-[12px] text-[#d0cdc8] font-medium truncate">{{ o.name || '—' }}</p>
                    <p class="text-[10px] text-[#555] truncate">{{ o.email }}</p>
                  </div>
                </div>
                <button
                  type="button"
                  class="ml-2 shrink-0 text-[10px] text-red-500/50 hover:text-red-400 border border-red-900/30 hover:border-red-700/50 px-2 py-0.5 rounded-sm transition-colors"
                  :disabled="ownersLoading"
                  @click="removeOwnerFromStore(o.id)"
                >
                  Quitar
                </button>
              </div>
            </div>
          </div>

          <!-- Añadir propietario -->
          <div class="relative">
            <p class="form-label mb-2">Añadir propietario</p>
            <input
              v-model="ownersSearch"
              type="text"
              class="admin-input w-full"
              placeholder="Buscar por nombre o correo…"
            />
            <p v-if="ownersSearch && ownersSearchLoading" class="text-[10px] text-[#555] mt-1">Buscando...</p>

            <div v-if="ownersResults.length" class="absolute left-0 right-0 top-full mt-1 bg-[#111] border border-[#c9a96e77] rounded-sm z-10 overflow-hidden max-h-44 overflow-y-auto shadow-lg">
              <button
                v-for="u in ownersResults"
                :key="u.id"
                type="button"
                class="w-full text-left px-3 py-2.5 text-sm text-[#aaa] hover:bg-[#1a1508] hover:text-[#c9a96e] transition-colors border-b border-[#0f0f0f] last:border-b-0 flex items-center gap-3 group"
                @click="addOwnerToStore(u)"
              >
                <div class="w-7 h-7 rounded-full bg-[#1a1508] border border-[#c9a96e44] flex items-center justify-center text-[#c9a96e] text-xs font-medium group-hover:border-[#c9a96e]">
                  {{ (u.name || u.email)[0].toUpperCase() }}
                </div>
                <div class="min-w-0 flex-1">
                  <p class="font-medium truncate">{{ u.name || '—' }}</p>
                  <p class="text-[11px] text-[#555] truncate">{{ u.email }}</p>
                </div>
                <svg class="w-4 h-4 text-[#c9a96e77] group-hover:text-[#c9a96e]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                </svg>
              </button>
            </div>
          </div>

          <p v-if="ownersError" class="text-red-400 text-xs">{{ ownersError }}</p>

          <div class="flex justify-end pt-1">
            <button class="btn-ghost" @click="showOwners = false">Cerrar</button>
          </div>
        </div>
      </div>
    </div>
  </Transition>

  <!-- ── Modal: Confirmar borrado ─────────────────────────────────────────── -->
  <Transition name="modal">
    <div v-if="confirmDelete" class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-black/70 backdrop-blur-sm" @click="confirmDelete = null"></div>
      <div class="relative w-full max-w-sm bg-[#0c0c0c] border border-[#222] rounded-sm p-6 shadow-2xl">
        <p class="text-[#e8e5e0] font-medium mb-2">¿Eliminar tienda?</p>
        <p class="text-sm text-[#666] mb-6">
          Se eliminará <span class="text-[#c9a96e]">{{ confirmDelete.name }}</span> de forma permanente.
        </p>
        <div class="flex justify-end gap-3">
          <button class="btn-ghost" @click="confirmDelete = null">Cancelar</button>
          <button class="btn-danger" :disabled="deleting" @click="doDelete">
            {{ deleting ? 'Eliminando…' : 'Eliminar' }}
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
/* Tabla */
.th { padding: 0.65rem 1rem; text-align: left; font-size: 0.65rem; letter-spacing: 0.14em; text-transform: uppercase; color: #3a3a38; font-weight: 500; }
.td { padding: 0.75rem 1rem; vertical-align: middle; }

/* Badges de estado */
.badge { display: inline-flex; align-items: center; padding: 0.2rem 0.55rem; border-radius: 3px; font-size: 0.68rem; letter-spacing: 0.06em; font-weight: 500; }
.badge-active    { background: #052e16; color: #4ade80; }
.badge-suspended { background: #2d0707; color: #f87171; }
.badge-pending   { background: #2d1f00; color: #fbbf24; }

/* Botón verificar */
.verify-btn { display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.2rem 0.5rem; border-radius: 3px; font-size: 0.7rem; transition: all 0.18s; border: 1px solid transparent; }
.verify-btn-on  { color: #c9a96e; border-color: #c9a96e33; background: #1a1508; }
.verify-btn-off { color: #444; border-color: #222; }
.verify-btn:hover { opacity: 0.8; }

/* Botones de acción en fila */
.action-btn { display: inline-flex; align-items: center; justify-content: center; width: 1.75rem; height: 1.75rem; border-radius: 3px; color: #555550; border: 1px solid #1a1a1a; transition: all 0.18s; }
.action-btn:hover { background: #151515; color: #c9a96e; border-color: #2a2a2a; }

/* Stats */
.stat-card  { background: #0c0c0c; border: 1px solid #181818; border-radius: 3px; padding: 0.85rem 1rem; }
.stat-label { font-size: 0.65rem; letter-spacing: 0.14em; text-transform: uppercase; color: #3a3a38; margin-bottom: 0.3rem; }
.stat-value { font-size: 1.4rem; font-weight: 300; color: #e8e5e0; line-height: 1; }

/* Inputs */
.admin-input { background: #0f0f0f; border: 1px solid #1f1f1f; border-radius: 3px; padding: 0.45rem 0.75rem; font-size: 0.8rem; color: #d0cdc8; outline: none; transition: border-color 0.18s; }
.admin-input:focus { border-color: #c9a96e55; }
.admin-input::placeholder { color: #3a3a38; }

/* Form labels */
.form-label { display: block; font-size: 0.65rem; letter-spacing: 0.14em; text-transform: uppercase; color: #444; margin-bottom: 0.35rem; }

/* Botones */
.btn-gold   { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.45rem 1rem; background: #c9a96e; color: #0a0a0a; font-size: 0.78rem; font-weight: 600; border-radius: 3px; letter-spacing: 0.04em; transition: all 0.2s; }
.btn-gold:hover { background: #d4b87a; }
.btn-gold:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-ghost  { display: inline-flex; align-items: center; padding: 0.45rem 0.9rem; background: transparent; color: #666; font-size: 0.78rem; border: 1px solid #222; border-radius: 3px; transition: all 0.18s; }
.btn-ghost:hover { border-color: #333; color: #999; }
.btn-danger { display: inline-flex; align-items: center; padding: 0.45rem 0.9rem; background: #7f1d1d; color: #fca5a5; font-size: 0.78rem; border-radius: 3px; transition: all 0.18s; }
.btn-danger:hover { background: #991b1b; }
.btn-danger:disabled { opacity: 0.5; cursor: not-allowed; }

/* Paginación */
.page-btn { min-width: 2rem; height: 2rem; padding: 0 0.4rem; border: 1px solid #1a1a1a; background: #0f0f0f; color: #555; font-size: 0.75rem; border-radius: 3px; transition: all 0.18s; }
.page-btn:hover:not(:disabled) { border-color: #c9a96e44; color: #c9a96e; }
.page-btn:disabled { opacity: 0.3; cursor: not-allowed; }
.page-btn-active { background: #1a1508; border-color: #c9a96e44; color: #c9a96e; }

/* Loading dots */
.dot-pulse { width: 6px; height: 6px; background: #c9a96e44; border-radius: 50%; animation: pulse 1s ease-in-out infinite; }
.delay-150 { animation-delay: 0.15s; }
.delay-300 { animation-delay: 0.30s; }
@keyframes pulse { 0%, 100% { opacity: 0.3; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1.2); } }

/* Modal */
.modal-enter-active { transition: opacity 0.2s ease; }
.modal-leave-active { transition: opacity 0.15s ease; }
.modal-enter-from, .modal-leave-to { opacity: 0; }
</style>
