<script setup>
import { ref, reactive, watch, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAdminApi } from '@/composables/useAdminApi'

const route  = useRoute()
const router = useRouter()
const api    = useAdminApi()

const store   = ref(null)
const loading = ref(true)
const saving  = ref(false)
const error   = ref('')
const saved   = ref(false)

const confirmDeleteOpen = ref(false)
const deleting          = ref(false)

// ── Subida de imágenes ────────────────────────────────────────────────────────
const logoInput      = ref(null)
const bannerInput    = ref(null)
const logoFile       = ref(null)
const logoPreview    = ref(null)
const bannerFile     = ref(null)
const bannerPreview  = ref(null)
const uploadingLogo   = ref(false)
const uploadingBanner = ref(false)

function onLogoSelected(e) {
  const file = e.target.files[0]
  if (!file) return
  logoFile.value    = file
  logoPreview.value = URL.createObjectURL(file)
}
function onBannerSelected(e) {
  const file = e.target.files[0]
  if (!file) return
  bannerFile.value    = file
  bannerPreview.value = URL.createObjectURL(file)
}

async function uploadLogo() {
  if (!logoFile.value) return
  uploadingLogo.value = true
  error.value = ''
  try {
    const fd = new FormData()
    fd.append('logo', logoFile.value)
    const updated = await api.uploadImages(route.params.id, fd)
    store.value = { ...store.value, ...updated }
    logoFile.value    = null
    logoPreview.value = null
    if (logoInput.value) logoInput.value.value = ''
  } catch (e) {
    error.value = e.message
  } finally {
    uploadingLogo.value = false
  }
}

async function uploadBanner() {
  if (!bannerFile.value) return
  uploadingBanner.value = true
  error.value = ''
  try {
    const fd = new FormData()
    fd.append('banner', bannerFile.value)
    const updated = await api.uploadImages(route.params.id, fd)
    store.value = { ...store.value, ...updated }
    bannerFile.value    = null
    bannerPreview.value = null
    if (bannerInput.value) bannerInput.value.value = ''
  } catch (e) {
    error.value = e.message
  } finally {
    uploadingBanner.value = false
  }
}

const API = (import.meta.env.VITE_GATEWAY_API_BASE_URL || '').replace(/\/$/, '')

const form = reactive({
  name: '', slug: '', description: '',
  status: '', verified: false,
  location: '', whatsapp: '', instagram: '',
  payment_instructions: '',
})

function imageUrl(s, field) {
  const filename = s?.[field]
  if (!filename) return null
  return `${API}/stores/files/stores/${s.id}/${filename}`
}

function ownerInfo(s) {
  const rawOwner = s?.expand?.owner ?? s?.owner
  const owners = Array.isArray(rawOwner) ? rawOwner : rawOwner ? [rawOwner] : []

  return owners
    .map((o) => ({
      id:   o?.id   || null,
      name: o?.name || '—',
      email: o?.email || '—',
      role: o?.role || '—',
    }))
    .filter((o) => o.name !== '—' || o.email !== '—')
}

function fmtDate(d) {
  return d ? new Date(d).toLocaleString('es-CL', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'
}

function statusLabel(s) { return { active: 'Activa', suspended: 'Suspendida', pending: 'Pendiente' }[s] || s }
function statusClass(s) { return { active: 'badge-active', suspended: 'badge-suspended', pending: 'badge-pending' }[s] || '' }

function validateStoreForm() {
  const name = form.name.trim()
  const slug = form.slug.trim()
  const description = form.description.trim()
  const whatsapp = form.whatsapp.trim()
  const instagram = form.instagram.trim()

  if (!name) return 'El nombre de la tienda es obligatorio.'
  if (!slug) return 'El slug es obligatorio.'
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return 'El slug solo puede contener minúsculas, números y guiones.'
  if (description.length > 1000) return 'La descripción no puede superar 1000 caracteres.'
  if (whatsapp && !/^\+?[0-9\s()-]{7,20}$/.test(whatsapp)) return 'El WhatsApp no tiene un formato válido.'
  if (instagram && !/^@?[A-Za-z0-9._]{2,30}$/.test(instagram)) return 'El Instagram no tiene un formato válido.'
  return ''
}

async function load() {
  loading.value = true
  error.value   = ''
  try {
    const data = await api.getStore(route.params.id)
    store.value = data
    Object.assign(form, {
      name:                 data.name                 || '',
      slug:                 data.slug                 || '',
      description:          data.description          || '',
      status:               data.status               || 'pending',
      verified:             data.verified             ?? false,
      location:             data.location             || '',
      whatsapp:             data.whatsapp             || '',
      instagram:            data.instagram            || '',
      payment_instructions: data.payment_instructions || '',
    })
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

async function save() {
  saving.value = true
  error.value  = ''
  saved.value  = false
  try {
    const validationError = validateStoreForm()
    if (validationError) {
      error.value = validationError
      return
    }
    const updated = await api.updateStore(route.params.id, { ...form })
    store.value = { ...store.value, ...updated }
    saved.value = true
    setTimeout(() => { saved.value = false }, 2500)
  } catch (e) {
    error.value = e.message
  } finally {
    saving.value = false
  }
}

async function doDelete() {
  deleting.value = true
  try {
    await api.deleteStore(route.params.id)
    router.push('/admin/stores')
  } catch (e) {
    error.value = e.message
    confirmDeleteOpen.value = false
  } finally {
    deleting.value = false
  }
}

// ── Gestión de propietarios (inline) ─────────────────────────────────────────
const ownerSearch        = ref('')
const ownerResults       = ref([])
const ownerSearchLoading = ref(false)
const ownerSaving        = ref(false)
const ownerError         = ref('')

let ownerSearchTimer = null

watch(ownerSearch, (v) => {
  clearTimeout(ownerSearchTimer)
  if (v.length < 2) { ownerResults.value = []; return }
  ownerSearchLoading.value = true
  ownerSearchTimer = setTimeout(async () => {
    try {
      const data = await api.searchUsers(v, ['admin', 'vendor'])
      ownerResults.value = (data?.items || []).filter(u => !currentOwnerIds.value.includes(u.id))
    } catch { ownerResults.value = [] }
    finally { ownerSearchLoading.value = false }
  }, 350)
})

const currentOwnerIds = computed(() => {
  const raw = store.value?.expand?.owner ?? store.value?.owner
  if (!raw) return []
  const arr = Array.isArray(raw) ? raw : [raw]
  return arr.map(o => (typeof o === 'object' ? o.id : o)).filter(Boolean)
})

async function saveOwnerIds(ids) {
  ownerSaving.value = true
  ownerError.value  = ''
  try {
    const updated = await api.updateStore(route.params.id, { owner: ids })
    store.value = { ...store.value, ...updated }
    // Recargar para obtener expand actualizado
    const fresh = await api.getStore(route.params.id)
    store.value = fresh
  } catch (e) {
    ownerError.value = e.message
  } finally {
    ownerSaving.value = false
  }
}

async function addOwner(u) {
  ownerResults.value = []
  ownerSearch.value  = ''
  await saveOwnerIds([...currentOwnerIds.value, u.id])
}

async function removeOwner(id) {
  await saveOwnerIds(currentOwnerIds.value.filter(i => i !== id))
}

onMounted(load)

const owners = computed(() => ownerInfo(store.value))
const ownerTitle = computed(() => (owners.value.length > 1 ? 'Propietarios' : 'Propietario'))
const logoUrl  = computed(() => imageUrl(store.value, 'logo'))
const bannerUrl = computed(() => imageUrl(store.value, 'banner'))
</script>

<template>
  <div class="p-6 lg:p-8 min-h-screen">

    <!-- Cabecera -->
    <div class="detail-hero mb-8">
      <RouterLink to="/admin/stores" class="back-link">
        <span class="back-link__icon">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </span>
        <span class="back-link__copy">
          <span class="back-link__eyebrow">Administración / Tiendas</span>
          <strong>{{ loading ? 'Cargando…' : (store?.name || 'Tienda') }}</strong>
          <small>Regresar al listado de tiendas</small>
        </span>
      </RouterLink>
      <div v-if="store" class="hero-badges">
        <span :class="['badge', statusClass(store.status)]">{{ statusLabel(store.status) }}</span>
        <span v-if="store.verified" class="badge badge-verified">Verificada</span>
      </div>
    </div>

    <!-- Error -->
    <div v-if="error" class="mb-6 px-4 py-3 bg-red-950/40 border border-red-900/50 text-red-400 text-sm rounded-sm">
      {{ error }}
    </div>

    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center py-32">
      <div class="flex gap-1.5">
        <span class="dot-pulse"></span>
        <span class="dot-pulse delay-150"></span>
        <span class="dot-pulse delay-300"></span>
      </div>
    </div>

    <template v-else-if="store">

      <!-- Banner -->
      <div class="mb-6 relative group">
        <div
          class="w-full h-36 rounded-sm overflow-hidden border border-[#181818] bg-[#0c0c0c] flex items-center justify-center"
        >
          <img
            v-if="bannerPreview || bannerUrl"
            :src="bannerPreview || bannerUrl"
            :alt="store.name"
            class="w-full h-full object-cover"
            :class="bannerPreview ? 'opacity-90' : 'opacity-70'"
          />
          <span v-else class="text-xs text-[#333]">Sin banner</span>
        </div>

        <!-- Overlay con acciones -->
        <div class="absolute inset-0 flex items-center justify-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 rounded-sm">
          <input ref="bannerInput" type="file" accept="image/jpeg,image/png,image/webp" class="hidden" @change="onBannerSelected" />
          <button type="button" class="img-action-btn" @click="bannerInput.click()">
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Cambiar banner
          </button>
          <button v-if="bannerFile" type="button" class="img-action-btn img-action-btn-gold" :disabled="uploadingBanner" @click="uploadBanner">
            {{ uploadingBanner ? 'Subiendo…' : 'Subir' }}
          </button>
        </div>

        <!-- Indicador de archivo seleccionado -->
        <p v-if="bannerFile" class="mt-1.5 text-[10px] text-[#c9a96e77]">
          {{ bannerFile.name }} — click en "Subir" para confirmar
        </p>
      </div>

      <div class="grid grid-cols-1 xl:grid-cols-3 gap-6">

        <!-- ── Col izquierda: info del propietario + metadatos ── -->
        <div class="flex flex-col gap-4">

          <!-- Propietarios (editable) -->
          <div class="card">
            <p class="card-title">{{ ownerTitle }}</p>

            <!-- Lista actual -->
            <div class="mt-3 flex flex-col gap-2">
              <div
                v-for="(ownerItem, index) in owners"
                :key="`${ownerItem.email}-${index}`"
                class="flex items-center gap-3 group"
              >
                <div class="w-9 h-9 rounded-full bg-[#151515] border border-[#c9a96e33] flex items-center justify-center text-[#c9a96e] font-medium text-sm shrink-0">
                  {{ (ownerItem.name || ownerItem.email || '?')[0].toUpperCase() }}
                </div>
                <div class="min-w-0 flex-1">
                  <p class="text-[13px] text-[#d8d5cf] font-medium truncate">{{ ownerItem.name }}</p>
                  <p class="text-[11px] text-[#555] truncate">{{ ownerItem.email }}</p>
                  <p class="text-[10px] tracking-wide uppercase text-[#c9a96e66] mt-0.5">{{ ownerItem.role }}</p>
                </div>
                <button
                  v-if="ownerItem.id"
                  type="button"
                  class="shrink-0 opacity-0 group-hover:opacity-100 text-[10px] text-red-500/50 hover:text-red-400 border border-red-900/30 hover:border-red-700/50 px-2 py-0.5 rounded-sm transition-all"
                  :disabled="ownerSaving"
                  @click="removeOwner(ownerItem.id)"
                >
                  Quitar
                </button>
              </div>
              <p v-if="!owners.length" class="text-sm text-[#555]">No hay propietarios asociados.</p>
            </div>

            <!-- Buscador para añadir -->
            <div class="mt-4 relative">
              <p class="form-label mb-1.5">Añadir propietario</p>
              <input
                v-model="ownerSearch"
                type="text"
                class="admin-input w-full text-[0.75rem]"
                placeholder="Buscar por nombre o correo…"
                :disabled="ownerSaving"
              />
              <p v-if="ownerSearch && ownerSearchLoading" class="text-[10px] text-[#555] mt-1">Buscando…</p>

              <div v-if="ownerResults.length" class="absolute left-0 right-0 top-full mt-1 bg-[#111] border border-[#c9a96e77] rounded-sm z-10 overflow-hidden max-h-44 overflow-y-auto shadow-lg">
                <button
                  v-for="u in ownerResults"
                  :key="u.id"
                  type="button"
                  class="w-full text-left px-3 py-2.5 text-sm text-[#aaa] hover:bg-[#1a1508] hover:text-[#c9a96e] transition-colors border-b border-[#0f0f0f] last:border-b-0 flex items-center gap-3 group"
                  @click="addOwner(u)"
                >
                  <div class="w-7 h-7 rounded-full bg-[#1a1508] border border-[#c9a96e44] flex items-center justify-center text-[#c9a96e] text-xs font-medium group-hover:border-[#c9a96e] shrink-0">
                    {{ (u.name || u.email)[0].toUpperCase() }}
                  </div>
                  <div class="min-w-0 flex-1">
                    <p class="font-medium truncate text-[12px]">{{ u.name || '—' }}</p>
                    <p class="text-[11px] text-[#555] truncate">{{ u.email }}</p>
                  </div>
                  <svg class="w-3.5 h-3.5 text-[#c9a96e77] group-hover:text-[#c9a96e] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              </div>
            </div>

            <p v-if="ownerError" class="mt-2 text-red-400 text-[11px]">{{ ownerError }}</p>
            <p v-if="ownerSaving" class="mt-2 text-[#555] text-[11px]">Guardando…</p>
          </div>

          <!-- Logo -->
          <div class="card">
            <p class="card-title">Logo</p>
            <div class="mt-3 flex items-center gap-3">
              <div class="w-16 h-16 rounded-sm border border-[#1f1f1f] bg-[#111] flex items-center justify-center overflow-hidden shrink-0">
                <img
                  v-if="logoPreview || logoUrl"
                  :src="logoPreview || logoUrl"
                  :alt="store.name"
                  class="w-full h-full object-contain"
                />
                <svg v-else class="w-6 h-6 text-[#333]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <div class="flex flex-col gap-2 min-w-0">
                <p class="text-xs text-[#444] truncate">{{ store.logo || 'Sin logo' }}</p>
                <input ref="logoInput" type="file" accept="image/jpeg,image/png,image/webp,image/svg+xml" class="hidden" @change="onLogoSelected" />
                <button type="button" class="img-action-btn text-[10px]" @click="logoInput.click()">
                  <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  {{ store.logo ? 'Cambiar' : 'Subir logo' }}
                </button>
                <button v-if="logoFile" type="button" class="img-action-btn img-action-btn-gold text-[10px]" :disabled="uploadingLogo" @click="uploadLogo">
                  {{ uploadingLogo ? 'Subiendo…' : 'Confirmar' }}
                </button>
              </div>
            </div>
            <p v-if="logoFile" class="mt-2 text-[10px] text-[#c9a96e77] truncate">{{ logoFile.name }}</p>
          </div>

          <!-- Métricas -->
          <div class="card">
            <p class="card-title">Métricas</p>
            <div class="mt-3 flex flex-col gap-2">
              <div class="flex items-center justify-between">
                <span class="text-xs text-[#555]">Rating</span>
                <span class="text-sm text-[#c9a96e]">{{ (store.rating || 0).toFixed(1) }} ★</span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-xs text-[#555]">Reseñas</span>
                <span class="text-sm text-[#888]">{{ store.reviews_count || 0 }}</span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-xs text-[#555]">Creada</span>
                <span class="text-xs text-[#555]">{{ fmtDate(store.created) }}</span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-xs text-[#555]">Actualizada</span>
                <span class="text-xs text-[#555]">{{ fmtDate(store.updated) }}</span>
              </div>
            </div>
          </div>

          <!-- Zona de peligro -->
          <div class="card border-red-950/50">
            <p class="card-title text-red-500/70">Zona de peligro</p>
            <p class="text-xs text-[#444] mt-2 mb-4">Eliminar la tienda es una acción permanente e irreversible.</p>
            <button class="btn-danger w-full justify-center" @click="confirmDeleteOpen = true">
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Eliminar tienda
            </button>
          </div>
        </div>

        <!-- ── Col derecha: formulario de edición ── -->
        <div class="xl:col-span-2">
          <form class="card flex flex-col gap-5" @submit.prevent="save">
            <p class="card-title">Información de la tienda</p>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label class="form-label">Nombre</label>
                <input v-model="form.name" type="text" class="admin-input w-full" required />
              </div>
              <div>
                <label class="form-label">Slug</label>
                <input v-model="form.slug" type="text" class="admin-input w-full font-mono text-[#c9a96e]" required />
              </div>

              <div>
                <label class="form-label">Estado</label>
                <select v-model="form.status" class="admin-input w-full">
                  <option value="pending">Pendiente</option>
                  <option value="active">Activa</option>
                  <option value="suspended">Suspendida</option>
                </select>
              </div>

              <div class="flex items-end gap-3">
                <div class="flex-1">
                  <label class="form-label">Verificada</label>
                  <button
                    type="button"
                    :class="['toggle-btn w-full', form.verified ? 'toggle-on' : 'toggle-off']"
                    @click="form.verified = !form.verified"
                  >
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {{ form.verified ? 'Verificada' : 'No verificada' }}
                  </button>
                </div>
              </div>

              <div>
                <label class="form-label">Ubicación</label>
                <input v-model="form.location" type="text" class="admin-input w-full" placeholder="Ej: Cochabamba, Bolivia" />
              </div>
              <div>
                <label class="form-label">WhatsApp</label>
                <input v-model="form.whatsapp" type="text" class="admin-input w-full" placeholder="+591 7XX XXX XX" />
              </div>
              <div>
                <label class="form-label">Instagram</label>
                <input v-model="form.instagram" type="text" class="admin-input w-full" placeholder="@tienda.bolivia" />
              </div>

              <div class="sm:col-span-2">
                <label class="form-label">Descripción</label>
                <textarea v-model="form.description" class="admin-input w-full resize-none" rows="4"></textarea>
              </div>

              <div class="sm:col-span-2">
                <label class="form-label">Instrucciones de pago</label>
                <textarea v-model="form.payment_instructions" class="admin-input w-full resize-none" rows="2" placeholder="Instrucciones para el comprador al pagar…"></textarea>
              </div>
            </div>

            <!-- Feedback y botón guardar -->
            <div class="flex items-center justify-between pt-1">
              <Transition name="fade">
                <p v-if="saved" class="text-xs text-emerald-400 flex items-center gap-1.5">
                  <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  Guardado correctamente
                </p>
                <span v-else></span>
              </Transition>
              <button type="submit" class="btn-gold" :disabled="saving">
                {{ saving ? 'Guardando…' : 'Guardar cambios' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </template>
  </div>

  <!-- Modal: Confirmar borrado -->
  <Transition name="modal">
    <div v-if="confirmDeleteOpen" class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-black/70 backdrop-blur-sm" @click="confirmDeleteOpen = false"></div>
      <div class="relative w-full max-w-sm bg-[#0c0c0c] border border-[#222] rounded-sm p-6 shadow-2xl">
        <p class="text-[#e8e5e0] font-medium mb-2">¿Eliminar esta tienda?</p>
        <p class="text-sm text-[#666] mb-6">
          Se eliminará <span class="text-[#c9a96e]">{{ store?.name }}</span> de forma permanente.
        </p>
        <div class="flex justify-end gap-3">
          <button class="btn-ghost" @click="confirmDeleteOpen = false">Cancelar</button>
          <button class="btn-danger" :disabled="deleting" @click="doDelete">
            {{ deleting ? 'Eliminando…' : 'Eliminar' }}
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.detail-hero { display: flex; align-items: stretch; gap: 1rem; }

.back-link { display: flex; align-items: center; gap: 0.9rem; flex: 1; min-width: 0; padding: 0.95rem 1rem; border: 1px solid #202020; border-radius: 18px; background: linear-gradient(180deg, #111111 0%, #0d0d0d 100%); color: #d8d5cf; transition: all 0.18s ease; }
.back-link:hover { border-color: #c9a96e44; background: linear-gradient(180deg, #18130b 0%, #111111 100%); color: #f0ede8; }
.back-link__icon { display: inline-flex; align-items: center; justify-content: center; width: 2.6rem; height: 2.6rem; border-radius: 999px; border: 1px solid #2a2110; background: #1a1508; color: #c9a96e; flex-shrink: 0; }
.back-link__copy { display: flex; flex-direction: column; min-width: 0; }
.back-link__eyebrow { font-size: 0.62rem; letter-spacing: 0.2em; text-transform: uppercase; color: #6a6860; }
.back-link__copy strong { margin-top: 0.15rem; font-size: 0.98rem; font-weight: 500; color: #f0ede8; }
.back-link__copy small { margin-top: 0.15rem; font-size: 0.72rem; color: #7a7770; }
.hero-badges { display: flex; align-items: center; gap: 0.5rem; flex-shrink: 0; }

.card { background: #0c0c0c; border: 1px solid #181818; border-radius: 3px; padding: 1.25rem 1.5rem; }
.card-title { font-size: 0.65rem; letter-spacing: 0.18em; text-transform: uppercase; color: #3a3a38; }

.badge { display: inline-flex; align-items: center; padding: 0.2rem 0.55rem; border-radius: 3px; font-size: 0.68rem; letter-spacing: 0.06em; font-weight: 500; }
.badge-active    { background: #052e16; color: #4ade80; }
.badge-suspended { background: #2d0707; color: #f87171; }
.badge-pending   { background: #2d1f00; color: #fbbf24; }
.badge-verified  { background: #1a1508; color: #c9a96e; }

.form-label { display: block; font-size: 0.65rem; letter-spacing: 0.14em; text-transform: uppercase; color: #444; margin-bottom: 0.35rem; }
.admin-input { background: #0f0f0f; border: 1px solid #1f1f1f; border-radius: 3px; padding: 0.45rem 0.75rem; font-size: 0.8rem; color: #d0cdc8; outline: none; transition: border-color 0.18s; }
.admin-input:focus { border-color: #c9a96e55; }
.admin-input::placeholder { color: #3a3a38; }

.toggle-btn { display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.45rem 0.75rem; border-radius: 3px; font-size: 0.78rem; border: 1px solid; transition: all 0.2s; }
.toggle-on  { background: #1a1508; border-color: #c9a96e44; color: #c9a96e; }
.toggle-off { background: #111; border-color: #222; color: #555; }

.btn-gold   { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.45rem 1rem; background: #c9a96e; color: #0a0a0a; font-size: 0.78rem; font-weight: 600; border-radius: 3px; letter-spacing: 0.04em; transition: all 0.2s; }
.btn-gold:hover { background: #d4b87a; }
.btn-gold:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-ghost  { display: inline-flex; align-items: center; padding: 0.45rem 0.9rem; background: transparent; color: #666; font-size: 0.78rem; border: 1px solid #222; border-radius: 3px; transition: all 0.18s; }
.btn-ghost:hover { border-color: #333; color: #999; }
.btn-danger { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.45rem 0.9rem; background: #7f1d1d; color: #fca5a5; font-size: 0.78rem; border-radius: 3px; transition: all 0.18s; }
.btn-danger:hover { background: #991b1b; }
.btn-danger:disabled { opacity: 0.5; cursor: not-allowed; }

.img-action-btn { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.3rem 0.65rem; background: #111; border: 1px solid #2a2a2a; border-radius: 3px; font-size: 0.72rem; color: #888; transition: all 0.18s; white-space: nowrap; }
.img-action-btn:hover { border-color: #3a3a3a; color: #d0cdc8; }
.img-action-btn-gold { background: #1a1508; border-color: #c9a96e44; color: #c9a96e; }
.img-action-btn-gold:hover { background: #241d0a; }
.img-action-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.dot-pulse { width: 6px; height: 6px; background: #c9a96e44; border-radius: 50%; animation: pulse 1s ease-in-out infinite; }
.delay-150 { animation-delay: 0.15s; }
.delay-300 { animation-delay: 0.30s; }
@keyframes pulse { 0%, 100% { opacity: 0.3; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1.2); } }

.modal-enter-active { transition: opacity 0.2s ease; }
.modal-leave-active { transition: opacity 0.15s ease; }
.modal-enter-from, .modal-leave-to { opacity: 0; }

.fade-enter-active { transition: opacity 0.3s ease; }
.fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

@media (max-width: 767px) {
  .detail-hero { flex-direction: column; }
  .hero-badges { justify-content: flex-start; flex-wrap: wrap; }
}
</style>
