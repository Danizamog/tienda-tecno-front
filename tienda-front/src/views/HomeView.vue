<script setup>
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import AppNavbar from '@/components/AppNavbar.vue'
import AppFooter from '@/components/AppFooter.vue'

const stores = ref([
  { id: 's1', name: 'Atelier Norte', slug: 'atelier-norte', location: 'Santiago', banner: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=1200&q=80' },
  { id: 's2', name: 'Luna Closet', slug: 'luna-closet', location: 'Valparaiso', banner: 'https://images.unsplash.com/photo-1441984904996-e0b6ba687e04?auto=format&fit=crop&w=1200&q=80' },
  { id: 's3', name: 'Distrito Denim', slug: 'distrito-denim', location: 'Concepcion', banner: 'https://images.unsplash.com/photo-1463100099107-aa0980c362e6?auto=format&fit=crop&w=1200&q=80' },
])
const products = ref([
  { id: 'p1', name: 'Chaqueta bomber oversize', price: 39990, slug: 'chaqueta-bomber-oversize', store: { name: 'Atelier Norte' }, images: ['https://images.unsplash.com/photo-1551232864-3f0890e580d9?auto=format&fit=crop&w=900&q=80'] },
  { id: 'p2', name: 'Vestido satinado midi', price: 28990, slug: 'vestido-satinado-midi', store: { name: 'Luna Closet' }, images: ['https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=900&q=80'] },
  { id: 'p3', name: 'Jeans straight fit', price: 24990, slug: 'jeans-straight-fit', store: { name: 'Distrito Denim' }, images: ['https://images.unsplash.com/photo-1542272604-787c3835535d?auto=format&fit=crop&w=900&q=80'] },
  { id: 'p4', name: 'Blazer cropped', price: 35990, slug: 'blazer-cropped', store: { name: 'Atelier Norte' }, images: ['https://images.unsplash.com/photo-1617137968427-85924c800a22?auto=format&fit=crop&w=900&q=80'] },
])
const auctions = ref([
  { id: 'a1', title: 'Lote streetwear premium', end_date: new Date(Date.now() + 1000 * 60 * 60 * 18).toISOString(), current_price: 65000, start_price: 50000, images: ['https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=1200&q=80'] },
  { id: 'a2', title: 'Coleccion denim limitada', end_date: new Date(Date.now() + 1000 * 60 * 90).toISOString(), current_price: 82000, start_price: 60000, images: ['https://images.unsplash.com/photo-1495121605193-b116b5b9c5fe?auto=format&fit=crop&w=1200&q=80'] },
])
const categories = ref([])

const loadingStores = ref(false)
const loadingProducts = ref(false)
const loadingAuctions = ref(false)
const loadingCategories = ref(false)

const defaultCategories = [
  { slug: 'vestidos', name: 'Vestidos', label: 'VS' },
  { slug: 'camisetas', name: 'Camisetas', label: 'CM' },
  { slug: 'pantalones', name: 'Pantalones', label: 'PN' },
  { slug: 'calzado', name: 'Calzado', label: 'CZ' },
  { slug: 'denim', name: 'Denim', label: 'DN' },
  { slug: 'chaquetas', name: 'Chaquetas', label: 'CH' },
  { slug: 'accesorios', name: 'Accesorios', label: 'AC' },
]

const vendorFeatures = [
  { title: 'Tienda propia', desc: 'Tu catalogo y marca en una pagina dedicada' },
  { title: 'Subastas activas', desc: 'Publica prendas con pujas en tiempo real' },
  { title: 'Panel de control', desc: 'Gestiona pedidos, stock y resultados en minutos' },
  { title: 'Mayor alcance', desc: 'Conecta con compradores de todo el pais' },
]


function useCountdown(endDate) {
  const now = Date.now()
  const end = new Date(endDate).getTime()
  const diff = Math.max(0, end - now)

  const d = Math.floor(diff / 86400000)
  const h = Math.floor((diff % 86400000) / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  const s = Math.floor((diff % 60000) / 1000)

  if (d > 0) return `${d}d ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m ${s}s`
  return `${m}m ${s}s`
}

function formatPrice(n) {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(n)
}

</script>

<template>
  <AppNavbar />

  <main class="home-shell text-[#f0ede8]">

    <!-- ══ HERO ══ full-width section ═════════════════════════ -->
    <section class="relative overflow-hidden border-b border-[#202020]">
      <div class="absolute inset-0 opacity-80 pointer-events-none bg-[radial-gradient(circle_at_top,#2f2718_0%,#0a0a0a_45%)]" />
      <div class="absolute inset-0 opacity-[0.08] pointer-events-none" style="background-image: linear-gradient(#c9a96e 1px, transparent 1px), linear-gradient(90deg, #c9a96e 1px, transparent 1px); background-size: 72px 72px;" />
      <div class="relative max-w-[92rem] mx-auto px-3 sm:px-4 lg:px-6 xl:px-8 py-20 md:py-28">
        <div class="max-w-4xl mx-auto text-center">
          <p class="section-label mb-6">Marketplace de moda</p>
          <h1 class="font-display text-5xl md:text-7xl leading-[0.95] mb-7">
            Moda y estilo urbano
            <span class="block text-[#c9a96e]">en una sola vitrina</span>
          </h1>
          <p class="text-[#8f8b82] text-base md:text-lg leading-relaxed max-w-2xl mx-auto mb-10">
            Descubre tiendas, prendas y subastas de ropa. Compra con confianza
            o vende con tu propia tienda verificada.
          </p>
          <div class="flex flex-wrap justify-center gap-4">
            <RouterLink to="/stores" class="btn-gold">Explorar tiendas</RouterLink>
            <RouterLink to="/auctions" class="btn-outline">Ver subastas</RouterLink>
          </div>
        </div>
      </div>
    </section>

    <!-- ══ MÉTRICAS ══ full-width section ════════════════════ -->
    <section class="w-full border-b border-[#1a1a1a]">
      <div class="max-w-[92rem] mx-auto px-3 sm:px-4 lg:px-6 xl:px-8 py-8">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          <div class="metric-card">
            <p class="metric-value">+420</p>
            <p class="metric-label">tiendas registradas</p>
          </div>
          <div class="metric-card">
            <p class="metric-value">+9.8k</p>
            <p class="metric-label">prendas activas</p>
          </div>
          <div class="metric-card">
            <p class="metric-value">24/7</p>
            <p class="metric-label">subastas en vivo</p>
          </div>
          <div class="metric-card">
            <p class="metric-value">4.9</p>
            <p class="metric-label">satisfacción media</p>
          </div>
        </div>
      </div>
    </section>

    <!-- ══ CATEGORÍAS ══ full-width section ══════════════════ -->
    <section class="w-full border-b border-[#1a1a1a]">
      <div class="max-w-[92rem] mx-auto px-3 sm:px-4 lg:px-6 xl:px-8 py-14">
        <div class="flex items-end justify-between mb-6 gap-4">
          <div>
            <p class="section-label mb-2">Categorías</p>
            <h2 class="font-display text-3xl font-light">Explora por sección</h2>
          </div>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <template v-if="loadingCategories">
            <div v-for="i in 7" :key="i" class="skeleton h-20" />
          </template>
          <template v-else-if="!categories.length">
            <RouterLink
              v-for="cat in defaultCategories"
              :key="cat.slug"
              :to="`/categories/${cat.slug}`"
              class="category-tile"
            >
              <span class="category-label">{{ cat.label }}</span>
              <span class="category-name">{{ cat.name }}</span>
            </RouterLink>
          </template>
          <template v-else>
            <RouterLink
              v-for="cat in categories"
              :key="cat.id"
              :to="`/categories/${cat.slug}`"
              class="category-tile"
            >
              <span class="category-label">{{ (cat.name || 'TT').slice(0, 2).toUpperCase() }}</span>
              <span class="category-name">{{ cat.name }}</span>
            </RouterLink>
          </template>
        </div>
      </div>
    </section>

    <!-- ══ TIENDAS ══ full-width section ═════════════════════ -->
    <section class="w-full border-b border-[#1a1a1a]">
      <div class="max-w-[92rem] mx-auto px-3 sm:px-4 lg:px-6 xl:px-8 py-16">
        <div class="flex items-end justify-between mb-8 gap-4">
          <div>
            <p class="section-label mb-2">Directorio</p>
            <h2 class="font-display text-3xl font-light">Tiendas destacadas</h2>
          </div>
          <RouterLink to="/stores" class="text-[10px] tracking-[0.2em] uppercase text-[#555550] hover:text-[#c9a96e] transition-colors hidden md:block">
            Ver todas
          </RouterLink>
        </div>

        <div v-if="loadingStores" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          <div v-for="i in 3" :key="i" class="card-dark p-6 space-y-4">
            <div class="skeleton h-32 w-full" />
            <div class="skeleton h-3 w-2/3" />
            <div class="skeleton h-2 w-1/2" />
          </div>
        </div>

        <div v-else-if="!stores.length" class="text-center py-14 border border-[#1a1a1a]">
          <p class="font-display text-2xl font-light text-[#666259] mb-2">Aún no hay tiendas destacadas</p>
          <RouterLink to="/vendor" class="btn-gold inline-flex mt-5">Abrir mi tienda</RouterLink>
        </div>

        <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          <RouterLink
            v-for="store in stores"
            :key="store.id"
            :to="`/stores/${store.slug}`"
            class="card-dark group overflow-hidden"
          >
            <div class="h-36 bg-[#0f0f0f] overflow-hidden">
              <img v-if="store.banner" :src="store.banner" :alt="store.name" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
              <div v-else class="w-full h-full flex items-center justify-center text-[10px] tracking-[0.2em] uppercase text-[#2a2a2a]">Sin banner</div>
            </div>
            <div class="p-5">
              <h3 class="text-base text-[#f0ede8] mb-1 group-hover:text-[#c9a96e] transition-colors">{{ store.name }}</h3>
              <p class="text-[11px] text-[#666259]">{{ store.location || 'Chile' }}</p>
            </div>
          </RouterLink>
        </div>
      </div>
    </section>

    <!-- ══ PRODUCTOS ══ full-width, fondo alterno ═════════════ -->
    <section class="w-full bg-[#080808] border-b border-[#1a1a1a]">
      <div class="max-w-[92rem] mx-auto px-3 sm:px-4 lg:px-6 xl:px-8 py-16">
        <div class="flex items-end justify-between mb-8 gap-4">
          <div>
            <p class="section-label mb-2">Selección</p>
            <h2 class="font-display text-3xl font-light">Productos destacados</h2>
          </div>
          <RouterLink to="/products" class="text-[10px] tracking-[0.2em] uppercase text-[#555550] hover:text-[#c9a96e] transition-colors hidden md:block">
            Ver todos
          </RouterLink>
        </div>

        <div v-if="loadingProducts" class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          <div v-for="i in 4" :key="i" class="card-dark">
            <div class="skeleton aspect-square w-full" />
            <div class="p-4 space-y-2">
              <div class="skeleton h-2 w-3/4" />
              <div class="skeleton h-3 w-1/2" />
            </div>
          </div>
        </div>

        <div v-else-if="!products.length" class="text-center py-14 border border-[#1a1a1a]">
          <p class="font-display text-2xl font-light text-[#666259]">Aún no hay productos</p>
        </div>

        <div v-else class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          <RouterLink
            v-for="product in products"
            :key="product.id"
            :to="`/products/${product.slug || product.id}`"
            class="card-dark group flex flex-col overflow-hidden"
          >
            <div class="aspect-square overflow-hidden bg-[#0f0f0f]">
              <img v-if="product.images?.length" :src="Array.isArray(product.images) ? product.images[0] : product.images" :alt="product.name" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
              <div v-else class="w-full h-full flex items-center justify-center text-[10px] tracking-[0.2em] uppercase text-[#2a2a2a]">Sin imagen</div>
            </div>
            <div class="p-4 flex flex-col gap-2 flex-1">
              <p class="text-[10px] text-[#666259] truncate">{{ product.store?.name || 'Tienda' }}</p>
              <h3 class="text-sm text-[#f0ede8] leading-snug line-clamp-2 group-hover:text-[#c9a96e] transition-colors">{{ product.name }}</h3>
              <p class="text-[#c9a96e] font-medium mt-auto">{{ formatPrice(product.price) }}</p>
            </div>
          </RouterLink>
        </div>
      </div>
    </section>

    <!-- ══ SUBASTAS ══ full-width section ════════════════════ -->
    <section class="w-full border-b border-[#1a1a1a]">
      <div class="max-w-[92rem] mx-auto px-3 sm:px-4 lg:px-6 xl:px-8 py-16">
        <div class="flex items-end justify-between mb-8 gap-4">
          <div>
            <p class="section-label mb-2">En vivo</p>
            <h2 class="font-display text-3xl font-light">Subastas activas</h2>
          </div>
          <RouterLink to="/auctions" class="text-[10px] tracking-[0.2em] uppercase text-[#555550] hover:text-[#c9a96e] transition-colors hidden md:block">
            Ver todas
          </RouterLink>
        </div>

        <div v-if="loadingAuctions" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          <div v-for="i in 3" :key="i" class="card-dark">
            <div class="skeleton h-44 w-full" />
            <div class="p-5 space-y-3">
              <div class="skeleton h-2 w-3/4" />
              <div class="skeleton h-4 w-1/2" />
            </div>
          </div>
        </div>

        <div v-else-if="!auctions.length" class="text-center py-14 border border-[#1a1a1a]">
          <p class="font-display text-2xl font-light text-[#666259] mb-2">No hay subastas activas</p>
        </div>

        <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          <RouterLink
            v-for="auction in auctions"
            :key="auction.id"
            :to="`/auctions/${auction.id}`"
            class="card-dark group flex flex-col overflow-hidden"
          >
            <div class="h-44 bg-[#0f0f0f] overflow-hidden relative">
              <img v-if="auction.images?.length" :src="Array.isArray(auction.images) ? auction.images[0] : auction.images" :alt="auction.title" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
              <div v-else class="w-full h-full flex items-center justify-center text-[10px] tracking-[0.2em] uppercase text-[#2a2a2a]">Sin imagen</div>
              <div class="absolute bottom-0 left-0 right-0 bg-linear-to-t from-black/80 to-transparent p-4">
                <div class="flex items-center gap-2">
                  <span class="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                  <span class="text-[10px] tracking-[0.14em] uppercase text-red-400">{{ useCountdown(auction.end_date) }}</span>
                </div>
              </div>
            </div>
            <div class="p-5 flex flex-col gap-3 flex-1">
              <h3 class="text-sm text-[#f0ede8] leading-snug line-clamp-2 group-hover:text-[#c9a96e] transition-colors">{{ auction.title }}</h3>
              <div class="mt-auto pt-3 border-t border-[#1a1a1a] flex items-center justify-between">
                <span class="text-[#666259] text-[10px] tracking-wide">Oferta actual</span>
                <span class="text-[#c9a96e] font-medium">{{ formatPrice(auction.current_price || auction.start_price) }}</span>
              </div>
            </div>
          </RouterLink>
        </div>
      </div>
    </section>

    <!-- ══ CTA VENDEDORES ══ full-width section ══════════════ -->
    <section class="w-full border-b border-[#1a1a1a]">
      <div class="max-w-[92rem] mx-auto px-3 sm:px-4 lg:px-6 xl:px-8 py-20">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
          <div>
            <p class="section-label mb-3">Para vendedores</p>
            <h2 class="font-display text-4xl md:text-5xl font-light leading-tight mb-5">
              Crea una vitrina profesional para tu negocio
            </h2>
            <p class="text-[#8f8b82] max-w-xl mb-7">
              Publica prendas, activa subastas y gestiona pedidos desde un panel
              diseñado para vender con presencia visual de alto nivel.
            </p>
            <RouterLink to="/vendor" class="btn-gold">Vender en TuVentaConfiada</RouterLink>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div v-for="feat in vendorFeatures" :key="feat.title" class="card-dark p-5">
              <h3 class="text-sm text-[#c9a96e] mb-2 uppercase tracking-[0.14em]">{{ feat.title }}</h3>
              <p class="text-[12px] text-[#7f7a70] leading-relaxed">{{ feat.desc }}</p>
            </div>
          </div>
        </div>
      </div>
    </section>

  </main>

  <AppFooter />
</template>

<style scoped>
.home-shell {
  background: linear-gradient(180deg, #0a0a0a 0%, #090909 38%, #0a0a0a 100%);
  width: 100%;
  overflow-x: hidden;
}

.metric-card {
  border: 1px solid #1f1f1f;
  background-color: #101010;
  padding: 1rem;
  text-align: center;
}

.metric-value {
  color: #d2b278;
  font-size: 1.35rem;
  letter-spacing: 0.05em;
  font-weight: 500;
  line-height: 1;
}

.metric-label {
  color: #6f6a61;
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.16em;
  margin-top: 0.45rem;
}

.category-tile {
  border: 1px solid #1f1f1f;
  background-color: #101010;
  min-height: 5.2rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.2rem;
  transition: border-color 0.25s, transform 0.25s;
}

.category-tile:hover {
  border-color: #c9a96e66;
  transform: translateY(-2px);
}

.category-label {
  font-size: 0.7rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: #c9a96e;
}

.category-name {
  font-size: 0.67rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #8f8b82;
  text-align: center;
}
</style>
