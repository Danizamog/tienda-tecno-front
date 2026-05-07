<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAdminApi } from '@/composables/useAdminApi'

const route = useRoute()
const router = useRouter()
const api = useAdminApi()

const API = (import.meta.env.VITE_GATEWAY_API_BASE_URL || '').replace(/\/$/, '')

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
    <div class="detail-hero mb-8">
      <RouterLink to="/admin/users" class="back-link">
        <span class="back-link__icon">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </span>
        <span class="back-link__copy">
          <span class="back-link__eyebrow">Administración / Usuarios</span>
          <strong>Detalle de usuario</strong>
          <small>Regresar al listado y seguir administrando</small>
        </span>
      </RouterLink>

      <div v-if="user" class="hero-badges">
        <span :class="['badge', roleClass(form.role)]">{{ roleLabel(form.role) }}</span>
        <span class="badge badge-soft">{{ form.verified ? 'Verificado' : 'Pendiente' }}</span>
      </div>
    </div>

    <div v-if="error" class="mb-6 px-4 py-3 bg-red-950/40 border border-red-900/50 text-red-400 text-sm rounded-sm">
      {{ error }}
    </div>

    <div v-if="loading" class="flex items-center justify-center py-32 text-text-muted">
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
              <p class="text-lg text-text-primary truncate">{{ user.name || 'Sin nombre' }}</p>
              <p class="text-sm text-[#8a887f] truncate">{{ user.email }}</p>
              <p class="text-[10px] tracking-[0.16em] uppercase text-[var(--accent)66] mt-1">ID {{ user.id }}</p>
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
              <h2 class="text-lg text-text-primary mt-1">Permisos y rol</h2>
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
.detail-hero { display: flex; align-items: stretch; gap: 1rem; }

.back-link { display: flex; align-items: center; gap: 0.9rem; flex: 1; min-width: 0; padding: 0.95rem 1rem; border: 1px solid var(--border-default); border-radius: 18px; background: linear-gradient(180deg, var(--surface-raised) 0%, var(--surface-sunken) 100%); color: var(--text-secondary); transition: all 0.18s ease; }
.back-link:hover { border-color: var(--accent)44; background: linear-gradient(180deg, var(--accent-soft) 0%, var(--surface-raised) 100%); color: var(--text-primary); }
.back-link__icon { display: inline-flex; align-items: center; justify-content: center; width: 2.6rem; height: 2.6rem; border-radius: 999px; border: 1px solid var(--accent-soft); background: var(--accent-soft); color: var(--accent); flex-shrink: 0; }
.back-link__copy { display: flex; flex-direction: column; min-width: 0; }
.back-link__eyebrow { font-size: 0.62rem; letter-spacing: 0.2em; text-transform: uppercase; color: var(--text-muted); }
.back-link__copy strong { margin-top: 0.15rem; font-size: 0.98rem; font-weight: 500; color: var(--text-primary); }
.back-link__copy small { margin-top: 0.15rem; font-size: 0.72rem; color: var(--text-muted); }
.hero-badges { display: flex; align-items: center; gap: 0.5rem; flex-shrink: 0; }

.panel { background: var(--surface-sunken); border: 1px solid var(--surface-overlay); border-radius: 3px; padding: 1rem 1.1rem; }
.avatar-shell { width: 4.75rem; height: 4.75rem; border-radius: 999px; background: var(--surface-overlay); border: 1px solid var(--accent)33; display: flex; align-items: center; justify-content: center; color: var(--accent); font-size: 1.35rem; font-weight: 500; overflow: hidden; flex-shrink: 0; }
.section-label { font-size: 0.65rem; letter-spacing: 0.14em; text-transform: uppercase; color: var(--border-strong); }
.mini-card { padding: 0.75rem 0.85rem; background: var(--surface-raised); border: 1px solid var(--border-subtle); border-radius: 3px; }
.mini-card span { display: block; font-size: 0.62rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--text-muted); }
.mini-card strong { display: block; margin-top: 0.3rem; font-size: 0.82rem; color: var(--text-primary); font-weight: 500; }
.permission-row { display: flex; align-items: center; gap: 0.55rem; padding: 0.65rem 0.75rem; background: var(--surface-raised); border: 1px solid var(--border-subtle); border-radius: 3px; color: var(--text-secondary); font-size: 0.8rem; }
.permission-dot { width: 0.45rem; height: 0.45rem; border-radius: 999px; background: var(--accent); box-shadow: 0 0 0 4px rgba(201, 169, 110, 0.08); }
.field-label { display: block; margin-bottom: 0.4rem; font-size: 0.65rem; letter-spacing: 0.14em; text-transform: uppercase; color: var(--border-strong); }
.admin-input { background: var(--surface-raised); border: 1px solid var(--border-subtle); border-radius: 3px; padding: 0.55rem 0.75rem; font-size: 0.82rem; color: var(--text-secondary); outline: none; transition: border-color 0.18s; }
.admin-input:focus { border-color: var(--accent)55; }
.toggle-card { display: flex; gap: 0.75rem; align-items: flex-start; padding: 0.8rem 0.85rem; background: var(--surface-raised); border: 1px solid var(--border-subtle); border-radius: 3px; cursor: pointer; }
.toggle-input { margin-top: 0.15rem; accent-color: var(--accent); }
.toggle-card strong { display: block; color: var(--text-primary); font-size: 0.82rem; font-weight: 500; }
.toggle-card small { display: block; color: #6f6d66; font-size: 0.68rem; margin-top: 0.25rem; line-height: 1.35; }
.notice-box { padding: 0.85rem 0.95rem; background: var(--accent-soft); border: 1px solid #3b2f11; border-radius: 3px; color: var(--text-secondary); font-size: 0.78rem; line-height: 1.45; }
.save-btn { width: 100%; padding: 0.8rem 1rem; border-radius: 3px; background: var(--accent); color: var(--surface-base); font-size: 0.78rem; letter-spacing: 0.14em; text-transform: uppercase; font-weight: 600; transition: opacity 0.18s; }
.save-btn:hover:not(:disabled) { opacity: 0.92; }
.save-btn:disabled { opacity: 0.55; cursor: not-allowed; }
.saved-pill { padding: 0.32rem 0.55rem; border-radius: 999px; border: 1px solid var(--accent)33; background: var(--accent-soft); color: var(--accent); font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.12em; }
.badge { display: inline-flex; align-items: center; padding: 0.2rem 0.55rem; border-radius: 3px; font-size: 0.68rem; letter-spacing: 0.06em; font-weight: 500; }
.badge-admin { background: var(--accent-soft); color: var(--warning); }
.badge-vendor { background: #051f17; color: var(--success); }
.badge-user { background: var(--surface-overlay); color: var(--text-muted); }
.badge-soft { background: var(--surface-raised); color: var(--text-secondary); border: 1px solid var(--border-subtle); }

@media (max-width: 767px) {
  .detail-hero { flex-direction: column; }
  .hero-badges { justify-content: flex-start; flex-wrap: wrap; }
}
</style>