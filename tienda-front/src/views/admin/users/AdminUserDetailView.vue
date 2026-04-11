<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAdminApi } from '@/composables/useAdminApi'

const route = useRoute()
const router = useRouter()
const api = useAdminApi()

const API = (import.meta.env.VITE_GATEWAY_API_BASE_URL || '/api').replace(/\/$/, '')

const loading = ref(true)
const saving = ref(false)
const error = ref('')
const saved = ref(false)
const user = ref(null)

const form = reactive({
  name: '',
  role: 'user',
  verified: false,
  emailVisibility: false,
})

const roleMeta = {
  admin: {
    label: 'Administrador',
    badge: 'badge-admin',
    description: 'Acceso total al panel, gestión de usuarios y revisión operativa del marketplace.',
    permissions: ['Gestión de usuarios', 'Moderación de tiendas', 'Visión financiera', 'Acceso a transacciones'],
  },
  vendor: {
    label: 'Vendedor',
    badge: 'badge-vendor',
    description: 'Puede administrar su tienda, productos, pedidos y subastas.',
    permissions: ['Administrar tienda', 'Publicar productos', 'Ver pedidos', 'Gestionar subastas'],
  },
  user: {
    label: 'Usuario',
    badge: 'badge-user',
    description: 'Acceso de compra y uso de funciones básicas del marketplace.',
    permissions: ['Comprar productos', 'Pagar pedidos', 'Usar giftcards', 'Valorar compras'],
  },
}

function roleLabel(role) {
  return roleMeta[role]?.label || role || 'Sin rol'
}

function roleClass(role) {
  return roleMeta[role]?.badge || 'badge-user'
}

function fmtDate(value) {
  return value
    ? new Date(value).toLocaleString('es-BO', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—'
}

function avatarUrl(record) {
  if (!record?.avatar) return null
  return `${API}/stores/files/users/${record.id}/${record.avatar}`
}

function validateUserForm() {
  const name = form.name.trim()
  const allowedRoles = ['user', 'vendor', 'admin']

  if (!name) return 'El nombre no puede estar vacío.'
  if (!allowedRoles.includes(form.role)) return 'El rol seleccionado no es válido.'
  return ''
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const data = await api.getUser(route.params.id)
    user.value = data
    form.name = data?.name || ''
    form.role = data?.role || 'user'
    form.verified = Boolean(data?.verified)
    form.emailVisibility = Boolean(data?.emailVisibility)
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

async function save() {
  saving.value = true
  error.value = ''
  saved.value = false
  try {
    const validationError = validateUserForm()
    if (validationError) {
      error.value = validationError
      return
    }
    const updated = await api.updateUser(route.params.id, {
      name: form.name.trim(),
      role: form.role,
      verified: form.verified,
      emailVisibility: form.emailVisibility,
    })
    user.value = updated
    form.name = updated?.name || ''
    form.role = updated?.role || 'user'
    form.verified = Boolean(updated?.verified)
    form.emailVisibility = Boolean(updated?.emailVisibility)
    saved.value = true
    window.setTimeout(() => {
      saved.value = false
    }, 2400)
  } catch (e) {
    error.value = e.message
  } finally {
    saving.value = false
  }
}

onMounted(load)
watch(() => route.params.id, load)

const currentRole = computed(() => roleMeta[form.role] || roleMeta.user)
const effectivePermissions = computed(() => currentRole.value.permissions || [])
const avatar = computed(() => avatarUrl(user.value))
</script>

<template>
  <div class="p-6 lg:p-8 min-h-screen">
    <div class="flex items-start justify-between gap-4 mb-8">
      <div class="flex items-center gap-4 min-w-0">
        <button class="back-btn" @click="router.push('/admin/users')">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </button>
        <div class="min-w-0">
          <p class="text-[10px] tracking-[0.2em] uppercase text-[#3a3a38] mb-0.5">Administración / Usuarios</p>
          <h1 class="text-xl font-light tracking-wide text-[#e8e5e0] truncate">Detalle de usuario</h1>
        </div>
      </div>

      <div v-if="user" class="flex items-center gap-2 shrink-0">
        <span :class="['badge', roleClass(form.role)]">{{ roleLabel(form.role) }}</span>
        <span class="badge badge-soft">{{ form.verified ? 'Verificado' : 'Pendiente' }}</span>
      </div>
    </div>

    <div v-if="error" class="mb-6 px-4 py-3 bg-red-950/40 border border-red-900/50 text-red-400 text-sm rounded-sm">
      {{ error }}
    </div>

    <div v-if="loading" class="flex items-center justify-center py-32 text-[#666]">
      Cargando usuario...
    </div>

    <template v-else-if="user">
      <div class="grid grid-cols-1 xl:grid-cols-[0.92fr_1.08fr] gap-6">
        <section class="panel">
          <div class="flex items-center gap-4">
            <div class="avatar-shell">
              <img v-if="avatar" :src="avatar" :alt="user.name || user.email" class="w-full h-full object-cover rounded-full" />
              <span v-else>{{ (user.name || user.email || '?')[0].toUpperCase() }}</span>
            </div>
            <div class="min-w-0">
              <p class="text-lg text-[#e8e5e0] truncate">{{ user.name || 'Sin nombre' }}</p>
              <p class="text-sm text-[#8a887f] truncate">{{ user.email }}</p>
              <p class="text-[10px] tracking-[0.16em] uppercase text-[#c9a96e66] mt-1">ID {{ user.id }}</p>
            </div>
          </div>

          <div class="mt-5 grid grid-cols-2 gap-3">
            <div class="mini-card"><span>Creado</span><strong>{{ fmtDate(user.created) }}</strong></div>
            <div class="mini-card"><span>Actualizado</span><strong>{{ fmtDate(user.updated) }}</strong></div>
            <div class="mini-card"><span>Visibilidad email</span><strong>{{ form.emailVisibility ? 'Pública' : 'Oculta' }}</strong></div>
            <div class="mini-card"><span>Verificado</span><strong>{{ form.verified ? 'Sí' : 'No' }}</strong></div>
          </div>

          <div class="mt-6">
            <p class="section-label">Permisos efectivos</p>
            <p class="text-sm text-[#a3a09a] mt-2 leading-6">{{ currentRole.description }}</p>
            <div class="mt-4 flex flex-col gap-2">
              <div v-for="permission in effectivePermissions" :key="permission" class="permission-row">
                <span class="permission-dot"></span>
                <span>{{ permission }}</span>
              </div>
            </div>
          </div>
        </section>

        <section class="panel">
          <div class="flex items-center justify-between gap-3 mb-5">
            <div>
              <p class="section-label">Edición</p>
              <h2 class="text-lg text-[#e8e5e0] mt-1">Permisos y rol</h2>
            </div>
            <button v-if="saved" type="button" class="saved-pill">Guardado</button>
          </div>

          <div class="space-y-4">
            <div>
              <label class="field-label">Nombre</label>
              <input v-model="form.name" type="text" class="admin-input w-full" placeholder="Nombre visible" />
            </div>

            <div>
              <label class="field-label">Rol</label>
              <select v-model="form.role" class="admin-input w-full">
                <option value="user">Usuario</option>
                <option value="vendor">Vendedor</option>
                <option value="admin">Administrador</option>
              </select>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label class="toggle-card">
                <input v-model="form.verified" type="checkbox" class="toggle-input" />
                <span>
                  <strong>Verificado</strong>
                  <small>Habilita el estado de cuenta confirmada.</small>
                </span>
              </label>

              <label class="toggle-card">
                <input v-model="form.emailVisibility" type="checkbox" class="toggle-input" />
                <span>
                  <strong>Email visible</strong>
                  <small>Controla si el correo se muestra en perfiles públicos.</small>
                </span>
              </label>
            </div>

            <div class="notice-box">
              Cambiar el rol actualiza los permisos efectivos del usuario en todo el marketplace.
            </div>

            <button type="button" class="save-btn" :disabled="saving" @click="save">
              {{ saving ? 'Guardando...' : 'Guardar cambios' }}
            </button>
          </div>
        </section>
      </div>
    </template>
  </div>
</template>

<style scoped>
.panel { background: #0c0c0c; border: 1px solid #181818; border-radius: 3px; padding: 1rem 1.1rem; }
.avatar-shell { width: 4.75rem; height: 4.75rem; border-radius: 999px; background: #151515; border: 1px solid #c9a96e33; display: flex; align-items: center; justify-content: center; color: #c9a96e; font-size: 1.35rem; font-weight: 500; overflow: hidden; flex-shrink: 0; }
.section-label { font-size: 0.65rem; letter-spacing: 0.14em; text-transform: uppercase; color: #3a3a38; }
.mini-card { padding: 0.75rem 0.85rem; background: #0f0f0f; border: 1px solid #1a1a1a; border-radius: 3px; }
.mini-card span { display: block; font-size: 0.62rem; letter-spacing: 0.12em; text-transform: uppercase; color: #666; }
.mini-card strong { display: block; margin-top: 0.3rem; font-size: 0.82rem; color: #e8e5e0; font-weight: 500; }
.permission-row { display: flex; align-items: center; gap: 0.55rem; padding: 0.65rem 0.75rem; background: #0f0f0f; border: 1px solid #1a1a1a; border-radius: 3px; color: #d8d5cf; font-size: 0.8rem; }
.permission-dot { width: 0.45rem; height: 0.45rem; border-radius: 999px; background: #c9a96e; box-shadow: 0 0 0 4px rgba(201, 169, 110, 0.08); }
.field-label { display: block; margin-bottom: 0.4rem; font-size: 0.65rem; letter-spacing: 0.14em; text-transform: uppercase; color: #3a3a38; }
.admin-input { background: #0f0f0f; border: 1px solid #1f1f1f; border-radius: 3px; padding: 0.55rem 0.75rem; font-size: 0.82rem; color: #d0cdc8; outline: none; transition: border-color 0.18s; }
.admin-input:focus { border-color: #c9a96e55; }
.toggle-card { display: flex; gap: 0.75rem; align-items: flex-start; padding: 0.8rem 0.85rem; background: #0f0f0f; border: 1px solid #1a1a1a; border-radius: 3px; cursor: pointer; }
.toggle-input { margin-top: 0.15rem; accent-color: #c9a96e; }
.toggle-card strong { display: block; color: #e8e5e0; font-size: 0.82rem; font-weight: 500; }
.toggle-card small { display: block; color: #6f6d66; font-size: 0.68rem; margin-top: 0.25rem; line-height: 1.35; }
.notice-box { padding: 0.85rem 0.95rem; background: #1a1508; border: 1px solid #3b2f11; border-radius: 3px; color: #d8d5cf; font-size: 0.78rem; line-height: 1.45; }
.save-btn { width: 100%; padding: 0.8rem 1rem; border-radius: 3px; background: #c9a96e; color: #0a0a0a; font-size: 0.78rem; letter-spacing: 0.14em; text-transform: uppercase; font-weight: 600; transition: opacity 0.18s; }
.save-btn:hover:not(:disabled) { opacity: 0.92; }
.save-btn:disabled { opacity: 0.55; cursor: not-allowed; }
.saved-pill { padding: 0.32rem 0.55rem; border-radius: 999px; border: 1px solid #c9a96e33; background: #1a1508; color: #c9a96e; font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.12em; }
.badge { display: inline-flex; align-items: center; padding: 0.2rem 0.55rem; border-radius: 3px; font-size: 0.68rem; letter-spacing: 0.06em; font-weight: 500; }
.badge-admin { background: #1f1504; color: #facc15; }
.badge-vendor { background: #051f17; color: #34d399; }
.badge-user { background: #141414; color: #9ca3af; }
.badge-soft { background: #101010; color: #d8d5cf; border: 1px solid #1b1b1b; }
</style>