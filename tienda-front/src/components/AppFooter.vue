<script setup>
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { useAuthSession } from '@/composables/useAuthSession'

const { isAuthenticated, canViewVendor } = useAuthSession()

const year = new Date().getFullYear()

// Columna "Explorar" — siempre visible
const exploreLinks = [
  { label: 'Tiendas',   to: '/stores'   },
  { label: 'Productos', to: '/products' },
  { label: 'Subastas',  to: '/auctions' },
]

// Columna "Vendedores" — solo si es vendor o admin
const vendorLinks = computed(() =>
  canViewVendor.value
    ? [
        { label: 'Mi panel',            to: '/vendor'           },
        { label: 'Gestionar productos', to: '/vendor/products'  },
        { label: 'Crear subasta',       to: '/vendor/auctions'  },
        { label: 'Mis pedidos',         to: '/vendor/orders'    },
      ]
    : [
        { label: 'Vender aquí', to: '/login' },
      ]
)

// Columna "Mi cuenta" — varía según sesión
const accountLinks = computed(() =>
  isAuthenticated.value
    ? [
        { label: 'Perfil',  to: '/account' },
        { label: 'Pedidos', to: '/orders'  },
      ]
    : [
        { label: 'Iniciar sesión', to: '/login'   },
        { label: 'Registrarse',   to: '/register' },
      ]
)
</script>

<template>
  <footer class="bg-[#080808] border-t border-[#161616] mt-auto">
    <div class="max-w-368 mx-auto px-4 sm:px-6 lg:px-8 xl:px-10">

      <!-- ── Cuerpo principal ──────────────────────────────────── -->
      <div class="py-14 grid grid-cols-1 md:grid-cols-[1.6fr_1fr_1fr_1fr] gap-10">

        <!-- Marca -->
        <div>
          <RouterLink to="/" class="inline-block mb-5 group">
            <span class="font-display text-xl font-light tracking-[0.18em] uppercase leading-none">
              <span class="text-[#f0ede8] group-hover:text-[#e8e3dc] transition-colors">Tu</span><span class="text-[#c9a96e]">Venta</span><span class="text-[#f0ede8] group-hover:text-[#e8e3dc] transition-colors">Confiada</span>
            </span>
          </RouterLink>

          <p class="text-[11px] text-[#46443f] leading-relaxed max-w-[22ch]">
            El marketplace de ropa donde tiendas y compradores se conectan con confianza.
          </p>

          <div class="flex items-center gap-2 mt-6">
            <span class="w-4 h-px bg-[#c9a96e] opacity-50" />
            <span class="text-[9px] tracking-[0.3em] uppercase text-[#3a3835]">Marketplace de moda</span>
          </div>
        </div>

        <!-- Explorar -->
        <div>
          <p class="text-[9px] tracking-[0.28em] uppercase text-[#c9a96e] mb-5">Explorar</p>
          <ul class="space-y-3">
            <li v-for="link in exploreLinks" :key="link.label">
              <RouterLink :to="link.to" class="footer-link">{{ link.label }}</RouterLink>
            </li>
          </ul>
        </div>

        <!-- Vendedores -->
        <div>
          <p class="text-[9px] tracking-[0.28em] uppercase text-[#c9a96e] mb-5">Vendedores</p>
          <ul class="space-y-3">
            <li v-for="link in vendorLinks" :key="link.label">
              <RouterLink :to="link.to" class="footer-link">{{ link.label }}</RouterLink>
            </li>
          </ul>
        </div>

        <!-- Mi cuenta -->
        <div>
          <p class="text-[9px] tracking-[0.28em] uppercase text-[#c9a96e] mb-5">Mi cuenta</p>
          <ul class="space-y-3">
            <li v-for="link in accountLinks" :key="link.label">
              <RouterLink :to="link.to" class="footer-link">{{ link.label }}</RouterLink>
            </li>
          </ul>
        </div>

      </div>

      <!-- ── Barra inferior ────────────────────────────────────── -->
      <div class="py-5 border-t border-[#101010] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <p class="text-[10px] tracking-[0.18em] uppercase text-[#3a3835]">
          &copy; {{ year }} TuVentaConfiada — Todos los derechos reservados
        </p>
        <div class="flex items-center gap-3">
          <span class="w-1 h-1 rounded-full bg-[#c9a96e] opacity-40" />
          <p class="text-[10px] tracking-[0.18em] uppercase text-[#3a3835]">Hecho con calidad</p>
        </div>
      </div>

    </div>
  </footer>
</template>

<style scoped>
.footer-link {
  font-size: 0.6875rem;
  color: #46443f;
  letter-spacing: 0.05em;
  line-height: 1;
  transition: color 0.2s;
}
.footer-link:hover {
  color: #c9a96e;
}
</style>
