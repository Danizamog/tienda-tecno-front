<script setup>
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { useVendorStore } from '@/composables/useVendorStore'

const route  = useRoute()
const router = useRouter()
const { selectedStore, clearStore } = useVendorStore()

const HEADER_H    = 76
const sidebarOpen = ref(false)

const pageLabel = computed(() => {
  switch (route.name) {
    case 'vendor-dashboard':
      return 'Dashboard'
    case 'vendor-products':
      return 'Productos'
    case 'vendor-auctions':
      return 'Subastas'
    case 'vendor-orders':
      return 'Órdenes'
    case 'vendor-payments':
      return 'Pagos QR'
    case 'vendor-giftcards':
      return 'Gift Cards'
    default:
      return 'Vista general'
  }
})

const storeLabel = computed(() => selectedStore.value?.name || 'Sin tienda seleccionada')

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
      { to: '/vendor/payments',  label: 'Pagos QR',   icon: 'M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z' },
      { to: '/vendor/giftcards', label: 'Gift Cards', icon: 'M12 8v13m0-13V6a4 4 0 00-4-4H5.45a1 1 0 00-.9 1.447L6 6m6 2l1.45-2.553A1 1 0 0114.55 2H16a4 4 0 014 4v2M4 10h16M4 10a2 2 0 00-2 2v6a2 2 0 002 2h16a2 2 0 002-2v-6a2 2 0 00-2-2M4 10h16' },
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
  <div class="panel-shell">
    <header class="panel-topbar">
      <div class="panel-topbar__brand min-w-0">
        <div class="panel-topbar__badge">Vendedor</div>
        <div class="min-w-0">
          <p class="panel-topbar__title">Panel interno</p>
          <p class="panel-topbar__subtitle truncate">{{ pageLabel }}</p>
        </div>
      </div>

      <div class="panel-topbar__actions">
        <RouterLink to="/vendor/select-store" class="panel-topbar__action hidden md:inline-flex">
          Cambiar tienda
        </RouterLink>
        <button
          id="vendor-hamburger"
          type="button"
          class="panel-topbar__menu"
          @click="sidebarOpen = !sidebarOpen"
        >
          <svg class="w-4 h-4 text-[#d8d5cf]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path v-if="!sidebarOpen" stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            <path v-else stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </header>

    <div class="panel-body">
      <Transition name="overlay">
        <div
          v-if="sidebarOpen"
          class="lg:hidden fixed inset-0 bg-black/70 z-20 backdrop-blur-sm"
          @click="closeSidebar"
        />
      </Transition>

      <aside
        id="vendor-sidebar"
        class="panel-sidebar"
        :class="sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'"
        :style="`top: ${HEADER_H}px`"
      >
        <RouterLink to="/" class="back-link" @click="closeSidebar">
          <span class="back-link__icon">
            <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </span>
          <span class="back-link__copy">
            <strong>Volver al sitio</strong>
            <small>Salir al catálogo público</small>
          </span>
        </RouterLink>


        <div class="store-card">
          <p class="store-card__label">Tienda activa</p>
          <p class="store-card__name">{{ storeLabel }}</p>
          <button class="store-card__action" @click="changeStore">Cambiar tienda</button>
        </div>

        <nav class="sidebar-nav">
          <div v-for="group in navItems" :key="group.label" class="nav-group">
            <p class="nav-group__label">{{ group.label }}</p>
            <div class="flex flex-col gap-1">
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

      <div class="panel-content lg:pl-72">
        <main class="panel-view">
          <RouterView />
        </main>
      </div>
    </div>
  </div>
</template>

<style scoped>
.panel-shell {
  min-height: 100vh;
  background:
    radial-gradient(circle at top left, rgba(138, 180, 160, 0.08), transparent 28%),
    radial-gradient(circle at top right, rgba(138, 180, 160, 0.05), transparent 22%),
    linear-gradient(180deg, #090909 0%, #080808 48%, #0a0a0a 100%);
  color: #e8e5e0;
}

.panel-topbar {
  position: sticky;
  top: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  height: 76px;
  padding: 0 1rem;
  border-bottom: 1px solid #171717;
  background: rgba(8, 8, 8, 0.92);
  backdrop-filter: blur(18px);
}

.panel-topbar__brand {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  min-width: 0;
}

.panel-topbar__badge {
  display: inline-flex;
  align-items: center;
  padding: 0.3rem 0.6rem;
  border-radius: 999px;
  border: 1px solid #20322c;
  background: #0d110f;
  color: #8ab4a0;
  font-size: 0.64rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  white-space: nowrap;
}

.panel-topbar__title {
  font-size: 0.68rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #66645c;
}

.panel-topbar__subtitle {
  margin-top: 0.12rem;
  font-size: 1rem;
  font-weight: 500;
  color: #f0ede8;
}

.panel-topbar__actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.panel-topbar__action,
.panel-topbar__menu {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  transition: all 0.18s ease;
}

.panel-topbar__action {
  padding: 0.58rem 0.95rem;
  border: 1px solid #242424;
  background: #0f0f0f;
  color: #d8d5cf;
  font-size: 0.74rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.panel-topbar__action:hover {
  border-color: #8ab4a044;
  background: #0f1714;
  color: #f0ede8;
}

.panel-topbar__menu {
  width: 2.6rem;
  height: 2.6rem;
  border: 1px solid #242424;
  background: #111111;
}

.panel-topbar__menu:hover {
  border-color: #8ab4a044;
  background: #0f1714;
}

@media (min-width: 640px) {
  .panel-topbar__menu {
    display: none;
  }
}

.panel-body {
  position: relative;
  min-height: calc(100vh - 76px);
}

.panel-sidebar {
  position: fixed;
  left: 0;
  bottom: 0;
  width: 18rem;
  z-index: 30;
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  padding: 1rem;
  overflow-y: auto;
  border-right: 1px solid #171717;
  background: linear-gradient(180deg, rgba(10, 10, 10, 0.98) 0%, rgba(8, 8, 8, 0.99) 100%);
  box-shadow: 18px 0 40px rgba(0, 0, 0, 0.18);
  transition: transform 0.25s ease-in-out;
}

.sidebar-brand {
  padding: 0.85rem 0.9rem 0.95rem;
  border: 1px solid #1a1a1a;
  border-radius: 18px;
  background: linear-gradient(180deg, #0f0f0f 0%, #0a0a0a 100%);
}

.sidebar-brand__eyebrow {
  font-size: 0.64rem;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: #55524d;
}

.sidebar-brand__title {
  margin-top: 0.2rem;
  font-size: 1.15rem;
  font-weight: 600;
  color: #f0ede8;
}

.sidebar-brand__text {
  margin-top: 0.35rem;
  font-size: 0.76rem;
  line-height: 1.45;
  color: #7a7770;
}

.store-card {
  padding: 0.95rem;
  border: 1px solid #20322c;
  border-radius: 18px;
  background: linear-gradient(180deg, #0d110f 0%, #0a0d0c 100%);
}

.store-card__label {
  font-size: 0.62rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: #54766b;
}

.store-card__name {
  margin-top: 0.35rem;
  font-size: 0.95rem;
  font-weight: 500;
  color: #f0ede8;
  line-height: 1.35;
}

.store-card__action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  margin-top: 0.75rem;
  padding: 0.62rem 0.85rem;
  border: 1px solid #264037;
  border-radius: 999px;
  background: #0f1714;
  color: #8ab4a0;
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  transition: all 0.18s ease;
}

.store-card__action:hover {
  border-color: #8ab4a044;
  background: #14211d;
  color: #d6efe5;
}

.back-link {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  width: 100%;
  padding: 0.95rem;
  border: 1px solid #20322c;
  border-radius: 18px;
  background: linear-gradient(180deg, #111111 0%, #0d0d0d 100%);
  color: #d8d5cf;
  transition: all 0.18s ease;
}

.back-link:hover {
  border-color: #8ab4a044;
  background: linear-gradient(180deg, #0f1714 0%, #111111 100%);
  color: #f0ede8;
}

.back-link__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 999px;
  background: #0d110f;
  border: 1px solid #20322c;
  color: #8ab4a0;
  flex-shrink: 0;
}

.back-link__copy {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.back-link__copy strong {
  font-size: 0.82rem;
  font-weight: 500;
}

.back-link__copy small {
  margin-top: 0.15rem;
  font-size: 0.7rem;
  color: #7a7770;
}

.sidebar-nav {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 1rem;
}

.nav-group {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.nav-group__label {
  padding: 0 0.15rem;
  font-size: 0.62rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: #4c4b45;
}

.sidebar-link {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.72rem 0.8rem;
  border: 1px solid transparent;
  border-radius: 14px;
  font-size: 0.82rem;
  letter-spacing: 0.03em;
  color: #7f7d76;
  transition: color 0.18s ease, background 0.18s ease, border-color 0.18s ease, transform 0.18s ease;
}

.sidebar-link:hover {
  color: #f0ede8;
  background: #111111;
  border-color: #222222;
  transform: translateX(2px);
}

.sidebar-link-active {
  color: #8ab4a0 !important;
  background: #0f1714 !important;
  border-color: #20322c !important;
}

.sidebar-footer {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  padding: 0.85rem 0.9rem;
  border: 1px solid #1a1a1a;
  border-radius: 16px;
  background: #0d0d0d;
  color: #6f6d66;
  font-size: 0.72rem;
}

.sidebar-footer--vendor {
  border-color: #20322c;
}

.sidebar-footer__dot {
  width: 0.45rem;
  height: 0.45rem;
  border-radius: 999px;
  background: #8ab4a0;
  box-shadow: 0 0 0 5px rgba(138, 180, 160, 0.08);
}

.panel-content {
  min-height: calc(100vh - 76px);
}

.panel-view {
  min-height: calc(100vh - 76px);
}

/* Overlay transition */
.overlay-enter-active, .overlay-leave-active { transition: opacity 0.2s ease; }
.overlay-enter-from, .overlay-leave-to { opacity: 0; }

@media (max-width: 1023px) {
  .panel-sidebar {
    width: min(18rem, calc(100vw - 1rem));
    top: 76px;
    left: 0.5rem;
    bottom: 0.5rem;
    border: 1px solid #1a1a1a;
    border-radius: 22px;
  }

  .panel-content {
    padding-left: 0;
  }

  .panel-view {
    min-height: calc(100vh - 76px);
  }
}
</style>
