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
  sort:     '-created',
  page:     1,
  perPage:  20,
})

// ── Estado modal "Crear tienda" ───────────────────────────────────────────────
const showCreate  = ref(false)
const creating    = ref(false)
const createError = ref('')
const userResults = ref([])
const userSearch  = ref('')
const userSearchLoading = ref(false)

const form = reactive({
  name: '', slug: '', description: '',
  ownerEmail: '', ownerId: '',
  status: 'active', location: '', whatsapp: '', instagram: '',
})

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
function ownerName(item) { return item?.expand?.owner?.name || item?.expand?.owner?.email || item?.owner || '—' }
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
  form.ownerEmail = v
  form.ownerId    = ''
  clearTimeout(userSearchTimer)
  if (v.length < 2) { userResults.value = []; return }
  userSearchLoading.value = true
  userSearchTimer = setTimeout(async () => {
    try {
      const data = await api.searchUsers(v)
      userResults.value = data?.items || []
    } finally {
      userSearchLoading.value = false
    }
  }, 350)
})

function selectUser(u) {
  form.ownerId    = u.id
  form.ownerEmail = u.email
  userSearch.value = `${u.name || u.email} (${u.email})`
  userResults.value = []
}

watch(() => form.name, (v) => {
  if (!form.slug || form.slug === toSlug(form.name.slice(0, -1))) {
    form.slug = toSlug(v)
  }
})

// ── Crear tienda ──────────────────────────────────────────────────────────────
async function submitCreate() {
  createError.value = ''
  if (!form.name || !form.slug || !form.ownerId) {
    createError.value = 'Nombre, slug y propietario son obligatorios.'
    return
  }
  creating.value = true
  try {
    await api.createStore({
      name: form.name, slug: form.slug, description: form.description,
      owner: form.ownerId, status: form.status,
      location: form.location, whatsapp: form.whatsapp, instagram: form.instagram,
    })
    showCreate.value = false
    Object.assign(form, { name: '', slug: '', description: '', ownerEmail: '', ownerId: '', status: 'active', location: '', whatsapp: '', instagram: '' })
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
      <div class="relative flex-1 min-w-[200px]">
        <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#444]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          v-model="filters.search"
          type="text"
          placeholder="Buscar por nombre o slug…"
          class="admin-input pl-9 w-full"
        />
      </div>

      <select v-model="filters.status" class="admin-input min-w-[140px]">
        <option value="">Todos los estados</option>
        <option value="active">Activa</option>
        <option value="pending">Pendiente</option>
        <option value="suspended">Suspendida</option>
      </select>

      <select v-model="filters.verified" class="admin-input min-w-[140px]">
        <option value="">Verificación: todas</option>
        <option value="true">Verificadas</option>
        <option value="false">No verificadas</option>
      </select>

      <select v-model="filters.sort" class="admin-input min-w-[160px]">
        <option value="-created">Más recientes</option>
        <option value="created">Más antiguas</option>
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
    <div class="border border-[#181818] rounded-sm overflow-hidden">
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
            </div>

            <!-- Propietario (búsqueda) -->
            <div class="col-span-2 relative">
              <label class="form-label">Propietario (email) *</label>
              <input
                v-model="userSearch"
                type="text"
                class="admin-input w-full"
                :class="form.ownerId ? 'border-[#c9a96e44]' : ''"
                placeholder="Buscar por email o nombre…"
              />
              <p v-if="form.ownerId" class="text-[10px] text-[#c9a96e77] mt-1">ID: {{ form.ownerId }}</p>
              <!-- Resultados -->
              <div v-if="userResults.length" class="absolute left-0 right-0 top-full mt-1 bg-[#111] border border-[#222] rounded-sm z-10 overflow-hidden">
                <button
                  v-for="u in userResults"
                  :key="u.id"
                  type="button"
                  class="w-full text-left px-3 py-2 text-xs text-[#aaa] hover:bg-[#1a1a1a] hover:text-[#c9a96e] transition-colors"
                  @click="selectUser(u)"
                >
                  <span class="font-medium">{{ u.name || '—' }}</span>
                  <span class="text-[#555] ml-2">{{ u.email }}</span>
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
              <label class="form-label">Ubicación</label>
              <input v-model="form.location" type="text" class="admin-input w-full" placeholder="Ej: Santiago" />
            </div>
            <div>
              <label class="form-label">WhatsApp</label>
              <input v-model="form.whatsapp" type="text" class="admin-input w-full" placeholder="+56 9 1234 5678" />
            </div>
            <div>
              <label class="form-label">Instagram</label>
              <input v-model="form.instagram" type="text" class="admin-input w-full" placeholder="@usuario" />
            </div>
            <div class="col-span-2">
              <label class="form-label">Descripción</label>
              <textarea v-model="form.description" class="admin-input w-full resize-none" rows="3" placeholder="Descripción breve de la tienda…"></textarea>
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
