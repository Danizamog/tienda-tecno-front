import { createApp } from 'vue'
import router from '@/router'
import App from './App.vue'
import '@/assets/main.css'
import { initThemeEarly } from '@/composables/useTheme'

initThemeEarly()

const app = createApp(App)

app.use(router)

app.mount('#app')
