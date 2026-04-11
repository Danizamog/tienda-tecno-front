<script setup>
import { computed } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import { useAuthSession } from '@/composables/useAuthSession'

const { isAdmin } = useAuthSession()
const route = useRoute()

// Header height: row1 (h-16=64px) + row2 auth (h-11=44px) = 108px
const HEADER_H = 108

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
      { to: '/admin/stores',  label: 'Tiendas',   icon: 'M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0' },
      { to: '/admin/users',   label: 'Usuarios',  icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z' },
      { to: '/admin/transactions', label: 'Transacciones', icon: 'M3 3v18h18M7 14l3-3 3 3 5-5' },
    ],
  },
]

function isActive(link) {
  if (link.exact) return route.path === link.to
  return route.path.startsWith(link.to)
}
</script>

<template>
  <div class="flex min-h-screen bg-[#080808]">

    <!-- ── Sidebar ────────────────────────────────────────────────────────── -->
    <aside
      class="hidden lg:flex flex-col fixed left-0 bottom-0 w-52 border-r border-[#161616] bg-[#080808] z-30 overflow-y-auto"
      :style="`top: ${HEADER_H}px`"
    >
      <div class="px-4 pt-5 pb-4 border-b border-[#161616] text-right">
        <p class="text-[9px] tracking-[0.22em] uppercase text-[#3a3a38]">Panel de</p>
        <p class="text-[13px] font-medium text-[#c9a96e] tracking-wide">Administración</p>
      </div>

      <!-- Volver al sitio -->
      <RouterLink
        to="/"
        class="flex items-center gap-2.5 px-4 py-3 border-b border-[#161616] text-[#555] hover:text-[#c9a96e] hover:bg-[#0f0f0d] transition-colors group"
      >
        <svg class="w-3.5 h-3.5 shrink-0 transition-transform group-hover:-translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        <span class="text-[11px] tracking-wide">Volver al sitio</span>
      </RouterLink>

      <!-- Grupos de navegación -->
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

    <!-- ── Contenido principal ───────────────────────────────────────────── -->
    <main class="flex-1 lg:ml-52 min-h-screen">
      <RouterView />
    </main>
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
.sidebar-link:hover {
  color: #d8d5cf;
  background: #111;
}
.sidebar-link-active {
  color: #c9a96e !important;
  background: #0f0f0d !important;
}
</style>
