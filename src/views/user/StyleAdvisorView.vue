<script setup>
import { computed, onBeforeUnmount, ref, shallowRef } from 'vue'
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'
import AppNavbar from '@/components/layout/AppNavbar.vue'
import AppFooter from '@/components/layout/AppFooter.vue'

const video = ref(null)
const canvas = ref(null)
const stream = ref(null)
// shallowRef, NO ref: el objeto FaceLandmarker tiene estado interno de
// WASM/WebGL. Si Vue lo envuelve en un Proxy reactivo profundo (lo que
// hace ref() con objetos), los métodos internos de MediaPipe leen sus
// propios campos a través del Proxy y se rompen con errores como
// "Cannot read properties of undefined (reading 'A')".
const landmarker = shallowRef(null)
const photoUrl = ref('')
const facingMode = ref('user')
const status = ref('idle')
const error = ref('')
const result = ref(null)
const isCameraOn = computed(() => Boolean(stream.value))
const cameraLabel = computed(() => facingMode.value === 'user' ? 'frontal' : 'trasera')
const TONE_RECOMMENDATIONS = {
  cálida: ['terracota', 'oliva', 'marfil', 'camel'],
  fría: ['azul marino', 'esmeralda', 'lavanda', 'gris'],
  neutra: ['negro', 'blanco', 'azul petróleo', 'rosa viejo'],
}
const COLOR_SWATCHES = {
  terracota: '#b65f4b', oliva: '#71805b', marfil: '#e8dfc9', camel: '#b68c5c',
  'azul marino': '#263b59', esmeralda: '#28765e', lavanda: '#9e91b8', gris: '#8b8d8b',
  negro: '#171717', blanco: '#f4f1eb', 'azul petróleo': '#23606a', 'rosa viejo': '#b78383',
}
const TONE_STYLE_GUIDE = {
  cálida: {
    summary: 'Los tonos tierra y dorados suelen armonizar con esta temperatura.',
    tops: 'Poleras en marfil, terracota u oliva; mejor lisas o con estampados cálidos.',
    bottoms: 'Pantalones camel, beige, denim azul medio o verde oliva.',
    layers: 'Chaquetas de mezclilla, cuero café o sobrecamisas en tonos arena.',
  },
  fría: {
    summary: 'Los tonos nítidos y azulados suelen dar más contraste y equilibrio.',
    tops: 'Poleras en azul marino, esmeralda, gris frío o lavanda.',
    bottoms: 'Pantalones negros, gris carbón, denim oscuro o azul marino.',
    layers: 'Blazers y chaquetas en azul noche, gris piedra o negro.',
  },
  neutra: {
    summary: 'Tienes una base flexible: los neutros y contrastes moderados son buenos aliados.',
    tops: 'Poleras blancas, negras, azul petróleo o rosa viejo.',
    bottoms: 'Pantalones rectos en negro, gris, denim clásico o beige suave.',
    layers: 'Chaquetas minimalistas en negro, azul petróleo o gris medio.',
  },
}
const SHAPE_STYLE_GUIDE = {
  redonda: {
    summary: 'Busca líneas que alarguen visualmente y aporten estructura.',
    pieces: 'Cuellos en V, poleras de caída limpia, pantalones rectos o ligeramente tapered.',
    avoid: 'Evita concentrar volumen en el cuello y los estampados muy grandes en el pecho.',
  },
  alargada: {
    summary: 'El volumen equilibrado ayuda a compensar la longitud del rostro.',
    pieces: 'Cuellos altos o redondos, poleras con textura, pantalones straight y chaquetas con hombro definido.',
    avoid: 'Evita looks completamente monocromáticos y líneas verticales muy marcadas.',
  },
  ovalada: {
    summary: 'Las proporciones equilibradas permiten experimentar con distintas siluetas.',
    pieces: 'Poleras de cuello redondo o V, pantalones rectos y chaquetas ajustadas sin exceso de volumen.',
    avoid: 'Evita ocultar el rostro con cuellos demasiado altos o accesorios excesivamente grandes.',
  },
}

let landmarkerLoading = null

async function loadLandmarker() {
  if (landmarker.value) return landmarker.value
  // Evita crear el modelo dos veces si el usuario dispara startCamera/capturePhoto
  // antes de que termine la primera carga.
  if (landmarkerLoading) return landmarkerLoading

  landmarkerLoading = (async () => {
    const vision = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm')
    const created = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: '/models/face_landmarker.task', delegate: 'CPU' },
      runningMode: 'IMAGE',
      numFaces: 1,
      outputFaceBlendshapes: false,
    })

    if (!created || typeof created.detect !== 'function') {
      throw new Error('landmarker-init-failed')
    }

    landmarker.value = created
    return created
  })()

  try {
    return await landmarkerLoading
  } finally {
    landmarkerLoading = null
  }
}

async function startCamera() {
  error.value = ''
  status.value = 'loading'
  stopCamera()
  if (!navigator.mediaDevices?.getUserMedia) {
    error.value = 'Tu navegador no permite acceder a la cámara. Usa HTTPS o localhost.'
    status.value = 'error'
    return
  }
  try {
    await loadLandmarker()
    stream.value = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: facingMode.value, width: { ideal: 1280 }, height: { ideal: 960 } } })
    video.value.srcObject = stream.value
    await video.value.play()
    status.value = 'camera'
  } catch (cameraError) {
    console.error('Style advisor camera/model init failed', cameraError)
    error.value = cameraError.message === 'landmarker-init-failed'
      ? 'No se pudo inicializar el modelo de detección facial. Verificá que /models/face_landmarker.task exista y se sirva correctamente.'
      : cameraError.name === 'NotAllowedError'
        ? 'Necesitamos permiso para usar la cámara.'
        : 'No se pudo iniciar la cámara. Comprueba que esté disponible.'
    status.value = 'error'
  }
}

function stopCamera() {
  stream.value?.getTracks().forEach((track) => track.stop())
  stream.value = null
  if (video.value) video.value.srcObject = null
}

async function flipCamera() {
  facingMode.value = facingMode.value === 'user' ? 'environment' : 'user'
  if (isCameraOn.value) await startCamera()
}

function sampleColor(context, point, width, height) {
  if (!point) return { red: 0, green: 0, blue: 0 }
  const x = Math.max(0, Math.min(width - 8, Math.round(point.x * width) - 4))
  const y = Math.max(0, Math.min(height - 8, Math.round(point.y * height) - 4))
  const pixels = context.getImageData(x, y, 8, 8).data
  const total = pixels.length / 4
  return pixels.reduce((color, value, index) => {
    if (index % 4 === 0) color.red += value / total
    if (index % 4 === 1) color.green += value / total
    if (index % 4 === 2) color.blue += value / total
    return color
  }, { red: 0, green: 0, blue: 0 })
}

function toneFrom(color) {
  const warmth = color.red - color.blue
  const name = warmth > 26 ? 'cálida' : warmth < 8 ? 'fría' : 'neutra'
  return { name, colors: TONE_RECOMMENDATIONS[name], guide: TONE_STYLE_GUIDE[name] }
}

function shapeFrom(landmarks) {
  const x = landmarks.map((point) => point.x)
  const y = landmarks.map((point) => point.y)
  const ratio = (Math.max(...x) - Math.min(...x)) / (Math.max(...y) - Math.min(...y))
  if (ratio > 0.82) return { name: 'redonda', advice: 'prendas estructuradas y cuellos en V', guide: SHAPE_STYLE_GUIDE.redonda }
  if (ratio < 0.68) return { name: 'alargada', advice: 'cuellos altos y volumen lateral', guide: SHAPE_STYLE_GUIDE.alargada }
  return { name: 'ovalada', advice: 'la mayoría de cortes y escotes equilibrados', guide: SHAPE_STYLE_GUIDE.ovalada }
}

async function capturePhoto() {
  if (!video.value || video.value.readyState < 2) return
  status.value = 'analysing'
  error.value = ''
  canvas.value.width = video.value.videoWidth
  canvas.value.height = video.value.videoHeight

  // Si el video todavía no tiene dimensiones reales, cortamos acá con un
  // mensaje claro en vez de dejar que createImageBitmap/detect fallen solos.
  if (!canvas.value.width || !canvas.value.height) {
    error.value = 'La cámara todavía no está lista. Esperá un instante y volvé a intentar.'
    status.value = 'error'
    return
  }

  const context = canvas.value.getContext('2d', { willReadFrequently: true })
  context.drawImage(video.value, 0, 0, canvas.value.width, canvas.value.height)
  photoUrl.value = canvas.value.toDataURL('image/jpeg', 0.9)
  try {
    const model = await loadLandmarker()
    const detected = model.detect(canvas.value)
    const landmarks = detected.faceLandmarks?.[0]
    if (!landmarks) throw new Error('no-face')
    const cheeks = [landmarks[234], landmarks[454]].map((point) => sampleColor(context, point, canvas.value.width, canvas.value.height))
    const skin = cheeks.reduce((total, color) => ({ red: total.red + color.red / cheeks.length, green: total.green + color.green / cheeks.length, blue: total.blue + color.blue / cheeks.length }), { red: 0, green: 0, blue: 0 })
    const tone = toneFrom(skin)
    const shape = shapeFrom(landmarks)
    shape.advice = [
      shape.advice,
      tone.guide.summary,
      `Poleras: ${tone.guide.tops}`,
      `Pantalones: ${tone.guide.bottoms}`,
      `Capas: ${tone.guide.layers}`,
      `Según tu rostro: ${shape.guide.pieces}`,
      shape.guide.avoid,
    ].join('\n')
    result.value = { tone, shape }
    status.value = 'result'
    stopCamera()
  } catch (analysisError) {
    console.error('Style advisor analysis failed', analysisError)
    stopCamera()
    error.value = analysisError.message === 'no-face'
      ? 'No encontramos un rostro. Busca luz frontal y mira hacia la cámara.'
      : analysisError.message === 'landmarker-init-failed'
        ? 'No se pudo inicializar el modelo de detección. Verificá que /models/face_landmarker.task exista.'
        : 'No se pudo analizar la fotografía. Inténtalo de nuevo.'
    status.value = 'error'
  }
}

function resetAnalysis() {
  result.value = null
  photoUrl.value = ''
  error.value = ''
  status.value = 'idle'
}

onBeforeUnmount(stopCamera)
</script>

<template>
  <AppNavbar />
  <main class="style-advisor-shell min-h-[calc(100vh-8rem)] text-text-primary">
    <div class="max-w-[92rem] mx-auto px-4 sm:px-6 lg:px-8 xl:px-10 py-10 lg:py-16">
      <div class="max-w-3xl mb-10"><p class="text-[10px] tracking-[0.24em] uppercase text-accent mb-3">Mi cuenta / asesoría</p><h1 class="font-display text-4xl md:text-6xl font-light leading-tight">Tu color. Tu forma. Tu estilo.</h1><p class="text-sm text-text-muted mt-4 max-w-xl">Usa una foto para recibir orientación sobre colores y cortes que podrían favorecerte.</p></div>
      <div class="grid lg:grid-cols-[minmax(0,1.2fr)_minmax(20rem,0.8fr)] gap-6 items-start">
        <section class="border border-border-default bg-surface-raised overflow-hidden"><div class="relative aspect-[4/3] bg-black"><video ref="video" v-show="isCameraOn" class="w-full h-full object-cover" autoplay muted playsinline /><img v-if="photoUrl" v-show="!isCameraOn" :src="photoUrl" alt="Foto analizada" class="w-full h-full object-cover" /><div v-if="!isCameraOn && !photoUrl" class="absolute inset-0 flex flex-col items-center justify-center text-center px-6"><svg class="w-14 h-14 text-accent mb-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1"><path stroke-linecap="round" stroke-linejoin="round" d="M3 9a2 2 0 0 1 2-2h1.5l1.2-2h8.6l1.2 2H19a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Z" /><circle cx="12" cy="13" r="3.5" /></svg><p class="font-display text-2xl text-text-secondary">Prepara tu retrato</p><p class="text-xs text-text-muted mt-2">Busca luz natural y evita filtros.</p></div><div v-if="isCameraOn" class="absolute inset-[12%] border border-accent/60 pointer-events-none" /></div><canvas ref="canvas" class="hidden" /><div class="flex flex-wrap items-center gap-3 p-4 border-t border-border-subtle"><button v-if="!isCameraOn && status !== 'result'" type="button" class="action-button action-primary" @click="startCamera">Abrir cámara</button><button v-if="isCameraOn" type="button" class="action-button action-primary" @click="capturePhoto">Tomar foto</button><button v-if="isCameraOn" type="button" class="action-button" @click="flipCamera">Girar cámara</button><button v-if="status === 'result' || photoUrl" type="button" class="action-button" @click="resetAnalysis">Nueva foto</button><span v-if="isCameraOn" class="text-[10px] uppercase tracking-[0.15em] text-text-muted ml-auto">Cámara {{ cameraLabel }}</span></div></section>
        <section class="result-card border border-border-default bg-surface-raised p-6 min-h-[20rem]"><div v-if="status === 'loading' || status === 'analysing'" class="flex min-h-[18rem] items-center justify-center text-center"><div><div class="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-4" /><p class="text-sm text-text-secondary">{{ status === 'loading' ? 'Preparando la cámara...' : 'Analizando tu foto...' }}</p><p class="text-xs text-text-muted mt-2">Esto puede tardar unos segundos.</p></div></div><div v-else-if="error" class="min-h-[18rem] flex flex-col justify-center"><p class="text-xs uppercase tracking-[0.18em] text-red-400 mb-3">No pudimos continuar</p><p class="text-sm text-text-secondary leading-relaxed">{{ error }}</p><button type="button" class="action-button action-primary mt-6 self-start" @click="startCamera">Intentar de nuevo</button></div><div v-else-if="result" class="result-panel"><div class="result-heading"><div><p class="eyebrow">Lectura visual</p><h2 class="font-display text-3xl font-light mt-2">Una base versátil</h2></div><span class="confidence-mark">A partir de tu foto</span></div><div class="insight-grid"><div class="insight-block"><span class="insight-label">Colorimetría</span><strong class="insight-value">{{ result.tone.name }}</strong><span class="insight-note">temperatura predominante</span></div><div class="insight-block"><span class="insight-label">Forma del rostro</span><strong class="insight-value">{{ result.shape.name }}</strong><span class="insight-note">proporción general</span></div></div><div class="palette-block"><div class="flex items-center justify-between gap-3 mb-3"><p class="insight-label">Paleta para explorar</p><span class="text-[10px] text-text-disabled">{{ result.tone.colors.length }} tonos</span></div><div class="palette-list"><span v-for="color in result.tone.colors" :key="color" class="color-chip"><i :style="{ backgroundColor: COLOR_SWATCHES[color] }" />{{ color }}</span></div></div><div class="style-callout"><span class="callout-kicker">Sugerencia de corte</span><p>{{ result.shape.advice }}.</p></div><p class="result-disclaimer">Lectura orientativa. La iluminación y la cámara pueden cambiar la percepción del color.</p></div><div v-else class="min-h-[18rem] flex flex-col justify-center"><p class="text-[10px] uppercase tracking-[0.2em] text-text-muted mb-3">Resultado</p><h2 class="font-display text-3xl font-light">Tu recomendación aparecerá aquí</h2><p class="text-sm text-text-muted mt-3 leading-relaxed">No guardamos ni enviamos tu foto. El análisis ocurre en este dispositivo.</p></div></section>
      </div>
    </div>
  </main>
  <AppFooter />
</template>

<style scoped>
.style-advisor-shell { background: radial-gradient(circle at 12% 8%, var(--accent-soft), transparent 34rem), var(--surface-base); }
.result-card { position: relative; }
.result-panel { display: flex; flex-direction: column; gap: 1.5rem; }
.result-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; padding-bottom: 1.25rem; border-bottom: 1px solid var(--border-subtle); }
.eyebrow, .insight-label, .callout-kicker { color: var(--text-muted); font-size: .62rem; letter-spacing: .16em; text-transform: uppercase; }
.confidence-mark { border: 1px solid var(--border-default); color: var(--text-muted); padding: .35rem .5rem; font-size: .58rem; letter-spacing: .08em; text-transform: uppercase; white-space: nowrap; }
.insight-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .75rem; }
.insight-block { display: flex; flex-direction: column; gap: .3rem; padding: .9rem; background: var(--surface-overlay); border-left: 2px solid var(--accent); }
.insight-value { color: var(--text-primary); font-family: 'Cormorant Garamond', Georgia, serif; font-size: 1.6rem; font-weight: 400; line-height: 1; text-transform: capitalize; }
.insight-note { color: var(--text-disabled); font-size: .65rem; }
.palette-block { padding-top: .1rem; }
.palette-list { display: flex; flex-wrap: wrap; gap: .5rem; }
.color-chip { display: inline-flex; align-items: center; gap: .45rem; border: 1px solid var(--border-default); color: var(--text-secondary); padding: .42rem .6rem; font-size: .68rem; text-transform: capitalize; }
.color-chip i { width: .7rem; height: .7rem; border: 1px solid rgba(255,255,255,.22); border-radius: 50%; }
.style-callout { border-top: 1px solid var(--border-subtle); padding-top: 1rem; }
.style-callout p { color: var(--text-secondary); font-size: .82rem; line-height: 1.55; margin-top: .45rem; white-space: pre-line; }
.result-disclaimer { color: var(--text-disabled); font-size: .62rem; line-height: 1.5; }
@media (max-width: 480px) { .result-heading { flex-direction: column; } .confidence-mark { align-self: flex-start; } .insight-grid { grid-template-columns: 1fr; } }
.action-button { min-height: 2.5rem; padding: .65rem 1rem; border: 1px solid var(--border-default); color: var(--text-secondary); font-size: .68rem; letter-spacing: .12em; text-transform: uppercase; transition: border-color .2s, color .2s, background-color .2s; }
.action-button:hover { border-color: var(--accent); color: var(--accent); }
.action-primary { background: var(--accent); border-color: var(--accent); color: var(--accent-on); }
.action-primary:hover { background: var(--accent-hover); color: var(--accent-on); }
</style>