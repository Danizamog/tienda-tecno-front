<script setup>
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'

const route = useRoute()

const HEADER_H    = 76
const sidebarOpen = ref(false)

const pageLabel = computed(() => {
  switch (route.name) {
    case 'admin-dashboard':
      return 'Dashboard'
    case 'admin-stores':
      return 'Tiendas'
    case 'admin-store-detail':
      return 'Detalle de tienda'
    case 'admin-users':
      return 'Usuarios'
    case 'admin-user-detail':
      return 'Detalle de usuario'
    case 'admin-transactions':
      return 'Transacciones'
    default:
      return 'Vista general'
  }
})

const navItems = [
  {
    label: 'General',
    links: [
      { to: '/admin', label: 'Dashboard', exact: true, icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
    ],
  },
  {
    label: 'Marketplace',
    links: [
      { to: '/admin/stores',       label: 'Tiendas',        icon: 'M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0' },
      { to: '/admin/users',        label: 'Usuarios',       icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z' },
      { to: '/admin/transactions', label: 'Transacciones',  icon: 'M3 3v18h18M7 14l3-3 3 3 5-5' },
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
    const aside = document.getElementById('admin-sidebar')
    const btn   = document.getElementById('admin-hamburger')
    if (aside && !aside.contains(e.target) && btn && !btn.contains(e.target)) {
      sidebarOpen.value = false
    }
  }
}

onMounted(() => document.addEventListener('click', handleClickOutside))
onBeforeUnmount(() => document.removeEventListener('click', handleClickOutside))
</script>

<template>
  <div class="panel-shell">
    <header class="panel-topbar">
      <div class="panel-topbar__brand min-w-0">
        <div class="panel-topbar__badge">Administración</div>
        <div class="min-w-0">
          <p class="panel-topbar__title">Panel interno</p>
          <p class="panel-topbar__subtitle truncate">{{ pageLabel }}</p>
        </div>
      </div>

      <div class="panel-topbar__actions">
        <RouterLink to="/" class="panel-topbar__action hidden md:inline-flex">
          Volver al sitio
        </RouterLink>
        <RouterLink
          to="/"
          class="panel-topbar__menu md:hidden"
          title="Volver al sitio"
        >
          <svg class="w-4 h-4 text-[var(--text-secondary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
        </RouterLink>
        <button
          id="admin-hamburger"
          type="button"
          class="panel-topbar__menu"
          @click="sidebarOpen = !sidebarOpen"
        >
          <svg class="w-4 h-4 text-[var(--text-secondary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
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
        id="admin-sidebar"
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
            <small>Regresar a la tienda pública</small>
          </span>
        </RouterLink>

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
    radial-gradient(circle at top left, rgba(201, 169, 110, 0.08), transparent 28%),
    radial-gradient(circle at top right, rgba(201, 169, 110, 0.05), transparent 22%),
    linear-gradient(180deg, var(--surface-base) 0%, var(--surface-base) 48%, var(--surface-base) 100%);
  color: var(--text-primary);
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
  border-bottom: 1px solid var(--border-subtle);
  background: color-mix(in srgb, var(--surface-base) 92%, transparent);
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
  border: 1px solid var(--accent-soft);
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 0.64rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  white-space: nowrap;
}

.panel-topbar__title {
  font-size: 0.68rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.panel-topbar__subtitle {
  margin-top: 0.12rem;
  font-size: 1rem;
  font-weight: 500;
  color: var(--text-primary);
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
  border: 1px solid var(--border-default);
  background: var(--surface-raised);
  color: var(--text-secondary);
  font-size: 0.74rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.panel-topbar__action:hover {
  border-color: var(--accent)44;
  background: var(--accent-soft);
  color: var(--text-primary);
}

.panel-topbar__menu {
  width: 2.6rem;
  height: 2.6rem;
  border: 1px solid var(--border-default);
  background: var(--surface-raised);
}

.panel-topbar__menu:hover {
  border-color: var(--accent)44;
  background: var(--accent-soft);
}

@media (min-width: 1024px) {
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
  border-right: 1px solid var(--border-subtle);
  background: linear-gradient(180deg, var(--surface-raised) 0%, var(--surface-base) 100%);
  box-shadow: 18px 0 40px color-mix(in srgb, var(--surface-base) 60%, transparent);
  transition: transform 0.25s ease-in-out;
}

.sidebar-brand {
  padding: 0.85rem 0.9rem 0.95rem;
  border: 1px solid var(--border-subtle);
  border-radius: 18px;
  background: linear-gradient(180deg, var(--surface-raised) 0%, var(--surface-base) 100%);
}

.sidebar-brand__eyebrow {
  font-size: 0.64rem;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--text-disabled);
}

.sidebar-brand__title {
  margin-top: 0.2rem;
  font-size: 1.15rem;
  font-weight: 600;
  color: var(--text-primary);
}

.sidebar-brand__text {
  margin-top: 0.35rem;
  font-size: 0.76rem;
  line-height: 1.45;
  color: var(--text-muted);
}

.back-link {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  width: 100%;
  padding: 0.95rem;
  border: 1px solid var(--border-default);
  border-radius: 18px;
  background: linear-gradient(180deg, var(--surface-raised) 0%, var(--surface-sunken) 100%);
  color: var(--text-secondary);
  transition: all 0.18s ease;
}

.back-link:hover {
  border-color: var(--accent)44;
  background: linear-gradient(180deg, var(--accent-soft) 0%, var(--surface-raised) 100%);
  color: var(--text-primary);
}

.back-link__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 999px;
  background: var(--accent-soft);
  border: 1px solid var(--accent-soft);
  color: var(--accent);
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
  color: var(--text-muted);
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
  color: var(--text-disabled);
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
  color: var(--text-muted);
  transition: color 0.18s ease, background 0.18s ease, border-color 0.18s ease, transform 0.18s ease;
}

.sidebar-link:hover {
  color: var(--text-primary);
  background: var(--surface-raised);
  border-color: var(--border-default);
  transform: translateX(2px);
}

.sidebar-link-active {
  color: var(--accent) !important;
  background: var(--accent-soft) !important;
  border-color: var(--accent-soft) !important;
}

.sidebar-footer {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  padding: 0.85rem 0.9rem;
  border: 1px solid var(--border-subtle);
  border-radius: 16px;
  background: var(--surface-sunken);
  color: var(--text-muted);
  font-size: 0.72rem;
}

.sidebar-footer__dot {
  width: 0.45rem;
  height: 0.45rem;
  border-radius: 999px;
  background: var(--accent);
  box-shadow: 0 0 0 5px rgba(201, 169, 110, 0.08);
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
    border: 1px solid var(--border-subtle);
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
