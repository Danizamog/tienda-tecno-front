<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import Navbar from '@/components/navbar/Navbar.vue'

const isScrolled = ref(false)

function handleScroll() {
  isScrolled.value = window.scrollY > 24
}

onMounted(() => {
  handleScroll()
  window.addEventListener('scroll', handleScroll, { passive: true })
})
onBeforeUnmount(() => {
  window.removeEventListener('scroll', handleScroll)
})
</script>

<template>
  <header
    class="app-header w-full bg-surface-base border-b border-border-subtle sticky top-0 z-50"
    :class="{ 'is-scrolled': isScrolled }"
  >
    <div class="max-w-[92rem] mx-auto px-4 sm:px-6 lg:px-8 xl:px-10 flex items-stretch w-full">
      <Navbar />
    </div>
  </header>
</template>
