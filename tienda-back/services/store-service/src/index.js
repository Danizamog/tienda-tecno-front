const express = require('express')
const cors    = require('cors')
const multer  = require('multer')

const app = express()
const PORT = Number(process.env.PORT || 9002)

const upload = multer({ storage: multer.memoryStorage() })

app.use(cors())
app.use(express.json())

const PB_URL = (process.env.POCKETBASE_URL || '').replace(/\/$/, '')
const PB_IDENTITY = process.env.POCKETBASE_AUTH_IDENTITY || ''
const PB_PASSWORD = process.env.POCKETBASE_AUTH_PASSWORD || ''

// ── Token de admin cacheado (válido 55 min) ──────────────────────────────────
let _adminToken = null
let _adminTokenExpiry = 0

async function readJsonSafe(res) {
  const text = await res.text()
  if (!text) return null
  try { return JSON.parse(text) } catch { return { raw: text } }
}

async function getAdminToken() {
  if (_adminToken && Date.now() < _adminTokenExpiry) return _adminToken

  const res = await fetch(`${PB_URL}/api/collections/_superusers/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: PB_IDENTITY, password: PB_PASSWORD }),
  })

  if (!res.ok) {
    const details = await readJsonSafe(res)
    throw new Error(`PocketBase admin auth failed: ${res.status} ${JSON.stringify(details)}`)
  }

  const { token } = await res.json()
  _adminToken = token
  _adminTokenExpiry = Date.now() + 55 * 60 * 1000
  return token
}

function pbHeaders(token) {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
}

// ── Middleware de rol ─────────────────────────────────────────────────────────
function requireRole(...roles) {
  return (req, res, next) => {
    const role = (req.headers['x-user-role'] || '').trim()
    if (!roles.includes(role)) {
      return res.status(403).json({ error: 'forbidden', required: roles })
    }
    next()
  }
}

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ service: 'store-service', ok: true, port: PORT })
})

// ── Listar tiendas ────────────────────────────────────────────────────────────
// GET /  ?page=1&perPage=20&status=active&search=texto&verified=true&sort=-created
app.get('/', async (req, res) => {
  try {
    const token = await getAdminToken()

    const page    = Math.max(1, parseInt(req.query.page)    || 1)
    const perPage = Math.min(100, parseInt(req.query.perPage) || 20)

    const filters = []
    if (req.query.status)   filters.push(`status="${req.query.status}"`)
    if (req.query.search)   filters.push(`(name~"${req.query.search.replace(/"/g, '')}" || slug~"${req.query.search.replace(/"/g, '')}")`)
    if (req.query.verified === 'true')  filters.push('verified=true')
    if (req.query.verified === 'false') filters.push('verified=false')

    const params = new URLSearchParams({
      page,
      perPage,
      expand: 'owner',
      sort: req.query.sort || '-created',
    })
    if (filters.length) params.set('filter', filters.join(' && '))

    const pbRes = await fetch(`${PB_URL}/api/collections/stores/records?${params}`, {
      headers: pbHeaders(token),
    })

    if (!pbRes.ok) {
      const details = await readJsonSafe(pbRes)
      return res.status(pbRes.status).json({ error: 'pb_error', details })
    }

    res.json(await pbRes.json())
  } catch (err) {
    console.error('list stores error', err)
    res.status(500).json({ error: err.message })
  }
})

// ── Tiendas destacadas (público) ──────────────────────────────────────────────
app.get('/featured', async (_req, res) => {
  try {
    const token = await getAdminToken()
    const params = new URLSearchParams({
      page: 1, perPage: 6,
      filter: 'status="active" && verified=true',
      sort: '-rating',
      expand: 'owner',
    })
    const pbRes = await fetch(`${PB_URL}/api/collections/stores/records?${params}`, {
      headers: pbHeaders(token),
    })
    const data = pbRes.ok ? await pbRes.json() : { items: [] }
    res.json({ items: data.items || [] })
  } catch (err) {
    console.error('featured stores error', err)
    res.json({ items: [] })
  }
})

// ── Obtener tienda por ID ─────────────────────────────────────────────────────
app.get('/:id', async (req, res) => {
  try {
    const token = await getAdminToken()
    const pbRes = await fetch(
      `${PB_URL}/api/collections/stores/records/${req.params.id}?expand=owner`,
      { headers: pbHeaders(token) }
    )
    if (pbRes.status === 404) return res.status(404).json({ error: 'not_found' })
    if (!pbRes.ok) return res.status(pbRes.status).json({ error: 'pb_error' })
    res.json(await pbRes.json())
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── Crear tienda (solo admin) ─────────────────────────────────────────────────
app.post('/', requireRole('admin'), async (req, res) => {
  try {
    const token = await getAdminToken()
    const { name, slug, description, owner, status, location, whatsapp, instagram } = req.body

    if (!name || !slug || !owner) {
      return res.status(400).json({ error: 'name, slug y owner son obligatorios' })
    }

    const pbRes = await fetch(`${PB_URL}/api/collections/stores/records`, {
      method: 'POST',
      headers: pbHeaders(token),
      body: JSON.stringify({
        name,
        slug,
        description: description || '',
        owner,
        status: status || 'pending',
        verified: false,
        location: location || '',
        whatsapp: whatsapp || '',
        instagram: instagram || '',
        rating: 0,
        reviews_count: 0,
        rating_sum: 0,
      }),
    })

    if (!pbRes.ok) {
      const details = await readJsonSafe(pbRes)
      return res.status(pbRes.status).json({ error: 'create_failed', details })
    }

    res.status(201).json(await pbRes.json())
  } catch (err) {
    console.error('create store error', err)
    res.status(500).json({ error: err.message })
  }
})

// ── Subir imágenes (logo / banner) — solo admin ───────────────────────────────
app.patch(
  '/:id/images',
  requireRole('admin'),
  upload.fields([
    { name: 'logo',   maxCount: 1 },
    { name: 'banner', maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const token = await getAdminToken()
      const formData = new FormData()

      const logoFile   = req.files?.logo?.[0]
      const bannerFile = req.files?.banner?.[0]

      if (logoFile) {
        formData.append('logo',   new Blob([logoFile.buffer],   { type: logoFile.mimetype }),   logoFile.originalname)
      }
      if (bannerFile) {
        formData.append('banner', new Blob([bannerFile.buffer], { type: bannerFile.mimetype }), bannerFile.originalname)
      }

      if (!logoFile && !bannerFile) {
        return res.status(400).json({ error: 'No se envió ningún archivo' })
      }

      const pbRes = await fetch(
        `${PB_URL}/api/collections/stores/records/${req.params.id}`,
        {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}` }, // sin Content-Type; fetch lo pone solo con FormData
          body: formData,
        }
      )

      if (pbRes.status === 404) return res.status(404).json({ error: 'not_found' })
      if (!pbRes.ok) {
        const details = await readJsonSafe(pbRes)
        return res.status(pbRes.status).json({ error: 'upload_failed', details })
      }

      res.json(await pbRes.json())
    } catch (err) {
      console.error('upload images error', err)
      res.status(500).json({ error: err.message })
    }
  }
)

// ── Actualizar tienda (solo admin) ────────────────────────────────────────────
app.patch('/:id', requireRole('admin'), async (req, res) => {
  try {
    const token = await getAdminToken()

    const ALLOWED = ['name', 'slug', 'description', 'status', 'verified',
                     'location', 'whatsapp', 'instagram', 'payment_instructions']
    const body = Object.fromEntries(
      Object.entries(req.body).filter(([k]) => ALLOWED.includes(k))
    )

    if (!Object.keys(body).length) {
      return res.status(400).json({ error: 'No hay campos válidos para actualizar' })
    }

    const pbRes = await fetch(`${PB_URL}/api/collections/stores/records/${req.params.id}`, {
      method: 'PATCH',
      headers: pbHeaders(token),
      body: JSON.stringify(body),
    })

    if (pbRes.status === 404) return res.status(404).json({ error: 'not_found' })
    if (!pbRes.ok) {
      const details = await readJsonSafe(pbRes)
      return res.status(pbRes.status).json({ error: 'update_failed', details })
    }

    res.json(await pbRes.json())
  } catch (err) {
    console.error('update store error', err)
    res.status(500).json({ error: err.message })
  }
})

// ── Eliminar tienda (solo admin) ──────────────────────────────────────────────
app.delete('/:id', requireRole('admin'), async (req, res) => {
  try {
    const token = await getAdminToken()
    const pbRes = await fetch(`${PB_URL}/api/collections/stores/records/${req.params.id}`, {
      method: 'DELETE',
      headers: pbHeaders(token),
    })

    if (pbRes.status === 404) return res.status(404).json({ error: 'not_found' })
    if (!pbRes.ok && pbRes.status !== 204) {
      return res.status(pbRes.status).json({ error: 'delete_failed' })
    }

    res.status(204).send()
  } catch (err) {
    console.error('delete store error', err)
    res.status(500).json({ error: err.message })
  }
})

// ── Buscar usuarios por email (para el selector de owner) ─────────────────────
app.get('/admin/users-search', requireRole('admin'), async (req, res) => {
  try {
    const token = await getAdminToken()
    const q = (req.query.q || '').replace(/"/g, '')
    if (!q) return res.json({ items: [] })

    const params = new URLSearchParams({
      perPage: 10,
      filter: `(email~"${q}" || name~"${q}")`,
      fields: 'id,name,email,role',
    })

    const pbRes = await fetch(`${PB_URL}/api/collections/users/records?${params}`, {
      headers: pbHeaders(token),
    })

    if (!pbRes.ok) return res.json({ items: [] })
    const data = await pbRes.json()
    res.json({ items: data.items || [] })
  } catch (err) {
    res.json({ items: [] })
  }
})

app.listen(PORT, () => {
  console.log(`store-service running on port ${PORT}`)
})
