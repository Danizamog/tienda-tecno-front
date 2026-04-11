<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useAdminApi } from '@/composables/useAdminApi'

const api = useAdminApi()

const users = ref([])
const loading = ref(false)
const error = ref('')
const totalItems = ref(0)
const totalPages = ref(1)

const filters = reactive({
  q: '',
  role: 'admin',
  sort: '-id',
  page: 1,
  perPage: 20,
})

function roleLabel(role) {
  return { admin: 'Administrador', vendor: 'Vendedor', user: 'Usuario' }[role] || role || 'Sin rol'
}

function roleClass(role) {
  return {
    admin: 'badge-admin',
    vendor: 'badge-vendor',
    user: 'badge-user',
  }[role] || 'badge-user'
}

function fmtDate(d) {
  return d
    ? new Date(d).toLocaleDateString('es-BO', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—'
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const data = await api.listUsers({
      page: filters.page,
      perPage: filters.perPage,
      q: filters.q,
      role: filters.role,
      sort: filters.sort,
    })
    users.value = data?.items || []
    totalItems.value = data?.totalItems || 0
    totalPages.value = data?.totalPages || 1
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

watch([() => filters.q, () => filters.sort, () => filters.role], () => {
  filters.page = 1
  load()
})

onMounted(load)

const pages = computed(() => {
  const arr = []
  for (let i = 1; i <= totalPages.value; i += 1) arr.push(i)
  return arr
})
</script>

<template>
  <div class="p-6 lg:p-8 min-h-screen">
    <div class="flex items-center justify-between mb-8">
      <div>
        <p class="text-[10px] tracking-[0.2em] uppercase text-[#3a3a38] mb-1">Administración</p>
        <h1 class="text-2xl font-light tracking-wide text-[#e8e5e0]">Usuarios</h1>
      </div>
      <p class="text-xs text-[#666]">{{ totalItems }} registros</p>
    </div>

    <div class="flex flex-wrap gap-3 mb-6">
      <div class="relative flex-1" style="min-width: 220px;">
        <svg class="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#444]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          v-model="filters.q"
          type="text"
          placeholder="Buscar por nombre o correo"
          class="admin-input pr-9 w-full"
        />
      </div>

      <select v-model="filters.sort" class="admin-input" style="min-width: 180px;">
        <option value="-id">Más recientes</option>
        <option value="id">Más antiguos</option>
        <option value="name">Nombre A-Z</option>
        <option value="-name">Nombre Z-A</option>
        <option value="email">Correo A-Z</option>
      </select>
    </div>

    <div class="flex flex-wrap gap-2 mb-6">
      <button class="filter-chip" :class="filters.role === '' ? 'filter-chip-active' : ''" @click="filters.role = ''">Todos</button>
      <button class="filter-chip" :class="filters.role === 'admin' ? 'filter-chip-active filter-chip-admin' : ''" @click="filters.role = 'admin'">Admin</button>
      <button class="filter-chip" :class="filters.role === 'vendor' ? 'filter-chip-active filter-chip-vendor' : ''" @click="filters.role = 'vendor'">Vendedores</button>
      <button class="filter-chip" :class="filters.role === 'user' ? 'filter-chip-active filter-chip-user' : ''" @click="filters.role = 'user'">Usuarios</button>
    </div>

    <div v-if="error" class="mb-4 px-4 py-3 bg-red-950/40 border border-red-900/50 text-red-400 text-sm rounded-sm">
      {{ error }}
    </div>

    <div class="border border-[#181818] rounded-sm overflow-hidden">
      <div v-if="loading" class="px-4 py-10 text-center text-[#666] text-sm">Cargando usuarios...</div>

      <template v-else>
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-[#181818] bg-[#0c0c0c]">
              <th class="th">Nombre</th>
              <th class="th">Correo</th>
              <th class="th">Rol</th>
              <th class="th">Verificado</th>
              <th class="th">Creado</th>
              <th class="th text-right">Detalle</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="users.length === 0">
              <td colspan="6" class="px-4 py-12 text-center text-[#444] text-sm">No se encontraron usuarios.</td>
            </tr>
            <tr v-for="u in users" :key="u.id" class="border-b border-[#111] hover:bg-[#0d0d0d] transition-colors">
              <td class="td">
                <p class="text-[#d8d5cf] font-medium">{{ u.name || 'Sin nombre' }}</p>
                <p class="text-[10px] text-[#444] mt-0.5">{{ u.id }}</p>
              </td>
              <td class="td text-[#b5b2ac]">{{ u.email }}</td>
              <td class="td">
                <span :class="['badge', roleClass(u.role)]">{{ roleLabel(u.role) }}</span>
              </td>
              <td class="td text-[#aaa]">{{ u.verified ? 'Sí' : 'No' }}</td>
              <td class="td text-[#777]">{{ fmtDate(u.created) }}</td>
              <td class="td text-right">
                <RouterLink
                  :to="`/admin/users/${u.id}`"
                  class="inline-flex items-center gap-2 px-3 py-1.5 rounded-sm border border-[#1d1d1d] bg-[#0f0f0f] text-[#d8d5cf] text-[11px] tracking-[0.12em] uppercase hover:border-[#c9a96e44] hover:text-[#c9a96e] transition-colors"
                >
                  Ver detalle
                </RouterLink>
              </td>
            </tr>
          </tbody>
        </table>

        <div v-if="totalPages > 1" class="flex items-center justify-between px-4 py-3 border-t border-[#181818] bg-[#0c0c0c]">
          <p class="text-xs text-[#444]">Página {{ filters.page }} de {{ totalPages }}</p>
          <div class="flex gap-1">
            <button class="page-btn" :disabled="filters.page <= 1" @click="filters.page -= 1; load()">‹</button>
            <button
              v-for="p in pages"
              :key="p"
              class="page-btn"
              :class="p === filters.page ? 'page-btn-active' : ''"
              @click="filters.page = p; load()"
            >{{ p }}</button>
            <button class="page-btn" :disabled="filters.page >= totalPages" @click="filters.page += 1; load()">›</button>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.th { padding: 0.65rem 1rem; text-align: left; font-size: 0.65rem; letter-spacing: 0.14em; text-transform: uppercase; color: #3a3a38; font-weight: 500; }
.td { padding: 0.75rem 1rem; vertical-align: middle; }

.admin-input { background: #0f0f0f; border: 1px solid #1f1f1f; border-radius: 3px; padding: 0.45rem 0.75rem; font-size: 0.8rem; color: #d0cdc8; outline: none; transition: border-color 0.18s; }
.admin-input:focus { border-color: #c9a96e55; }
.admin-input::placeholder { color: #3a3a38; }

.badge { display: inline-flex; align-items: center; padding: 0.2rem 0.55rem; border-radius: 3px; font-size: 0.68rem; letter-spacing: 0.06em; font-weight: 500; }
.badge-admin { background: #1f1504; color: #facc15; }
.badge-vendor { background: #051f17; color: #34d399; }
.badge-user { background: #141414; color: #9ca3af; }

.page-btn { min-width: 2rem; height: 2rem; padding: 0 0.4rem; border: 1px solid #1a1a1a; background: #0f0f0f; color: #555; font-size: 0.75rem; border-radius: 3px; transition: all 0.18s; }
.page-btn:hover:not(:disabled) { border-color: #c9a96e44; color: #c9a96e; }
.page-btn:disabled { opacity: 0.3; cursor: not-allowed; }
.page-btn-active { background: #1a1508; border-color: #c9a96e44; color: #c9a96e; }

.filter-chip { padding: 0.38rem 0.75rem; border: 1px solid #1a1a1a; background: #0f0f0f; color: #6a6860; border-radius: 999px; font-size: 0.72rem; letter-spacing: 0.04em; transition: all 0.18s; }
.filter-chip:hover { border-color: #c9a96e44; color: #d8d5cf; }
.filter-chip-active { color: #0a0a0a; background: #c9a96e; border-color: #c9a96e; }
.filter-chip-admin { background: #facc15; }
.filter-chip-vendor { background: #34d399; }
.filter-chip-user { background: #9ca3af; }
</style>
