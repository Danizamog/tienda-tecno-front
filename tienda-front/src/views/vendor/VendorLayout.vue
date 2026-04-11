<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { useVendorStore } from '@/composables/useVendorStore'

const route  = useRoute()
const router = useRouter()
const { selectedStore, clearStore } = useVendorStore()

const HEADER_H    = 108
const sidebarOpen = ref(false)

const navItems = [
  {
    label: 'General',
    links: [
      { to: '/vendor', label: 'Dashboard', exact: true, icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
    ],
  },
  {
    label: 'Mi Tienda',
    links: [
      { to: '/vendor/products', label: 'Productos',  icon: 'M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z' },
      { to: '/vendor/auctions', label: 'Subastas',   icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
      { to: '/vendor/orders',   label: 'Órdenes',    icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01' },
      { to: '/vendor/payments', label: 'Pagos QR',   icon: 'M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z' },
    ],
  },
]

function isActive(link) {
  if (link.exact) return route.path === link.to
  return route.path.startsWith(link.to)
}

function closeSidebar() { sidebarOpen.value = false }

function handleClickOutside(e) {
  if (sidebarOpen.value) {
    const aside = document.getElementById('vendor-sidebar')
    const btn   = document.getElementById('vendor-hamburger')
    if (aside && !aside.contains(e.target) && btn && !btn.contains(e.target)) {
      sidebarOpen.value = false
    }
  }
}

function changeStore() {
  clearStore()
  router.push('/vendor/select-store')
}

onMounted(() => document.addEventListener('click', handleClickOutside))
onBeforeUnmount(() => document.removeEventListener('click', handleClickOutside))
</script>

<template>
  <div class="flex min-h-screen bg-[#080808]">

    <!-- ── Overlay móvil ───────────────────────────────────────────────────── -->
    <Transition name="overlay">
      <div
        v-if="sidebarOpen"
        class="lg:hidden fixed inset-0 bg-black/60 z-20 backdrop-blur-sm"
        @click="closeSidebar"
      />
    </Transition>

    <!-- ── Sidebar ─────────────────────────────────────────────────────────── -->
    <aside
      id="vendor-sidebar"
      class="flex flex-col fixed left-0 bottom-0 w-52 border-r border-[#161616] bg-[#080808] z-30 overflow-y-auto transition-transform duration-250 ease-in-out"
      :class="sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'"
      :style="`top: ${HEADER_H}px`"
    >
      <!-- Título del panel -->
      <div class="px-4 pt-5 pb-4 border-b border-[#161616] text-right">
        <p class="text-[16px] tracking-[0.22em] uppercase text-[#3a3a38]">Panel de</p>
        <p class="text-[19px] font-medium tracking-wide" style="color:#8ab4a0">Vendedor</p>
      </div>

      <!-- Tienda seleccionada -->
      <div v-if="selectedStore" class="px-4 py-3 border-b border-[#161616]">
        <p class="text-[9px] tracking-[0.2em] uppercase text-[#303030] mb-1">Tienda activa</p>
        <p class="text-[13px] text-[#d8d5cf] truncate font-medium">{{ selectedStore.name }}</p>
        <button
          class="mt-1.5 text-[9px] tracking-[0.16em] uppercase text-[#444] hover:text-[#8ab4a0] transition-colors"
          @click="changeStore"
        >
          Cambiar tienda →
        </button>
      </div>

      <!-- Volver al sitio -->
      <RouterLink
        to="/"
        class="flex items-center gap-2.5 px-4 py-3 border-b border-[#161616] text-[#555] hover:text-[#8ab4a0] hover:bg-[#0f0f0d] transition-colors group"
        @click="closeSidebar"
      >
        <svg class="w-3.5 h-3.5 shrink-0 transition-transform group-hover:-translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        <span class="text-[11px] tracking-wide">Volver al sitio</span>
      </RouterLink>

      <!-- Navegación -->
      <nav class="flex-1 px-3 py-4 flex flex-col gap-5">
        <div v-for="group in navItems" :key="group.label">
          <p class="text-[9px] tracking-[0.2em] uppercase text-[#303030] px-2 mb-1.5">{{ group.label }}</p>
          <div class="flex flex-col gap-0.5">
            <RouterLink
              v-for="link in group.links"
              :key="link.to"
              :to="link.to"
              class="sidebar-link"
              :class="isActive(link) ? 'sidebar-link-active' : ''"
              @click="closeSidebar"
            >
              <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" :d="link.icon" />
              </svg>
              <span>{{ link.label }}</span>
            </RouterLink>
          </div>
        </div>
      </nav>
    </aside>

    <!-- ── Contenido principal ──────────────────────────────────────────────── -->
    <div class="flex-1 lg:ml-52 min-h-screen flex flex-col">

      <!-- Barra superior móvil con hamburger -->
      <div class="lg:hidden sticky top-0 z-10 flex items-center gap-3 px-4 h-12 border-b border-[#161616] bg-[#080808]">
        <button
          id="vendor-hamburger"
          type="button"
          class="flex items-center justify-center w-8 h-8 border border-[#222] bg-[#0f0f0f] rounded-sm transition-colors hover:border-[#8ab4a044]"
          @click="sidebarOpen = !sidebarOpen"
        >
          <svg class="w-4 h-4 text-[#888]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path v-if="!sidebarOpen" stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            <path v-else stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <span class="text-[11px] tracking-[0.16em] uppercase text-[#555]">
          {{ selectedStore?.name || 'Panel Vendedor' }}
        </span>
      </div>

      <main class="flex-1">
        <RouterView />
      </main>
    </div>
  </div>
</template>

<style scoped>
.sidebar-link {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.45rem 0.6rem;
  border-radius: 3px;
  font-size: 0.78rem;
  letter-spacing: 0.03em;
  color: #6a6860;
  transition: color 0.18s ease, background 0.18s ease;
}
.sidebar-link:hover { color: #d8d5cf; background: #111; }
.sidebar-link-active { color: #8ab4a0 !important; background: #0d110f !important; }

/* Overlay transition */
.overlay-enter-active, .overlay-leave-active { transition: opacity 0.2s ease; }
.overlay-enter-from, .overlay-leave-to { opacity: 0; }
</style>
