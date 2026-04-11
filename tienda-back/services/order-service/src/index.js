const express = require('express')
const cors    = require('cors')
const multer  = require('multer')

const app    = express()
const PORT   = Number(process.env.PORT || 9005)
const upload = multer({ storage: multer.memoryStorage() })

app.use(cors())
app.use(express.json())

const PB_URL      = (process.env.POCKETBASE_URL || '').replace(/\/$/, '')
const PB_IDENTITY = process.env.POCKETBASE_AUTH_IDENTITY || ''
const PB_PASSWORD = process.env.POCKETBASE_AUTH_PASSWORD || ''

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
  if (!res.ok) throw new Error(`PB admin auth failed: ${res.status}`)
  const { token } = await res.json()
  _adminToken = token
  _adminTokenExpiry = Date.now() + 55 * 60 * 1000
  return token
}

function pbHeaders(token) {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
}

function requireAuth(req, res, next) {
  const userId = (req.headers['x-user-id'] || '').trim()
  const role   = (req.headers['x-user-role'] || '').trim()
  if (!userId || !['vendor', 'admin'].includes(role)) {
    return res.status(403).json({ error: 'forbidden' })
  }
  next()
}

function userOwnsStore(store, userId) {
  const owners = Array.isArray(store?.owner)
    ? store.owner
    : (store?.owner ? [store.owner] : [])
  return owners.includes(userId)
}

async function checkOrderOwnership(token, orderId, userId) {
  // Vendedor puede gestionar si es owner de la tienda del pedido
  const res = await fetch(
    `${PB_URL}/api/collections/orders/records/${orderId}?expand=store`,
    { headers: pbHeaders(token) }
  )
  if (!res.ok) return null
  const order = await res.json()
  const isOwner = userOwnsStore(order?.expand?.store, userId)
  return { order, isOwner }
}

// ── Health ─────────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ service: 'order-service', ok: true, port: PORT }))

// ── Listar órdenes ─────────────────────────────────────────────────────────────
// GET /?storeId=X&status=&page=1&perPage=20
app.get('/', requireAuth, async (req, res) => {
  try {
    const token   = await getAdminToken()
    const userId  = req.headers['x-user-id']
    const role    = req.headers['x-user-role']
    const page    = Math.max(1, parseInt(req.query.page) || 1)
    const perPage = Math.min(100, parseInt(req.query.perPage) || 20)

    const filters = []
    if (req.query.storeId) {
      filters.push(`store="${req.query.storeId.replace(/"/g, '')}"`)
    } else if (role === 'vendor') {
      // Si no se especifica tienda, traer órdenes de TODAS las tiendas del vendor
      // Primero obtener las tiendas del vendor
      const storesRes = await fetch(
        `${PB_URL}/api/collections/stores/records?fields=id,owner&perPage=200`,
        { headers: pbHeaders(token) }
      )
      const storesData = storesRes.ok ? await readJsonSafe(storesRes) : null
      const storeIds = (storesData?.items || [])
        .filter((store) => userOwnsStore(store, userId))
        .map((store) => store.id)
      if (!storeIds.length) return res.json({ items: [], totalItems: 0, totalPages: 0 })
      filters.push(`(${storeIds.map(id => `store="${id}"`).join(' || ')})`)
    }

    if (req.query.status) filters.push(`status="${req.query.status.replace(/"/g, '')}"`)
    if (req.query.search) filters.push(`payment_reference~"${req.query.search.replace(/"/g, '')}"`)

    const params = new URLSearchParams({
      page, perPage,
      sort: req.query.sort || '-created',
      expand: 'buyer,store',
    })
    if (filters.length) params.set('filter', filters.join(' && '))

    const pbRes = await fetch(
      `${PB_URL}/api/collections/orders/records?${params}`,
      { headers: pbHeaders(token) }
    )
    const data = await readJsonSafe(pbRes)
    if (!pbRes.ok) return res.status(pbRes.status).json(data)

    // Enriquecer con items de cada orden
    if (data?.items?.length) {
      const orderIds = data.items.map(o => `order="${o.id}"`).join(' || ')
      const itemsRes = await fetch(
        `${PB_URL}/api/collections/order_items/records?filter=${encodeURIComponent(orderIds)}&perPage=200&expand=product`,
        { headers: pbHeaders(token) }
      )
      if (itemsRes.ok) {
        const itemsData = await readJsonSafe(itemsRes)
        const itemsByOrder = {}
        for (const item of (itemsData?.items || [])) {
          if (!itemsByOrder[item.order]) itemsByOrder[item.order] = []
          itemsByOrder[item.order].push(item)
        }
        for (const order of data.items) {
          order.items = itemsByOrder[order.id] || []
        }
      }
    }

    res.json(data)
  } catch (err) {
    console.error('list orders error', err)
    res.status(500).json({ error: err.message })
  }
})

// ── Obtener orden ──────────────────────────────────────────────────────────────
app.get('/:id', requireAuth, async (req, res) => {
  try {
    const token  = await getAdminToken()
    const userId = req.headers['x-user-id']
    const role   = req.headers['x-user-role']

    const pbRes = await fetch(
      `${PB_URL}/api/collections/orders/records/${req.params.id}?expand=buyer,store,approved_by`,
      { headers: pbHeaders(token) }
    )
    if (pbRes.status === 404) return res.status(404).json({ error: 'not_found' })
    const order = await readJsonSafe(pbRes)
    if (!pbRes.ok) return res.status(pbRes.status).json(order)

    if (role === 'vendor' && !userOwnsStore(order?.expand?.store, userId)) {
      return res.status(403).json({ error: 'forbidden' })
    }

    // Items de la orden
    const itemsRes = await fetch(
      `${PB_URL}/api/collections/order_items/records?filter=order%3D%22${req.params.id}%22&perPage=50&expand=product`,
      { headers: pbHeaders(token) }
    )
    if (itemsRes.ok) {
      const itemsData = await readJsonSafe(itemsRes)
      order.items = itemsData?.items || []
    }

    res.json(order)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── Aprobar orden ──────────────────────────────────────────────────────────────
// PATCH /:id/approve  body: { shipping_address, approval_note, lat?, lng? }
app.patch('/:id/approve', requireAuth, async (req, res) => {
  try {
    const token  = await getAdminToken()
    const userId = req.headers['x-user-id']
    const role   = req.headers['x-user-role']

    const result = await checkOrderOwnership(token, req.params.id, userId)
    if (!result) return res.status(404).json({ error: 'not_found' })
    if (role === 'vendor' && !result.isOwner) return res.status(403).json({ error: 'forbidden' })

    const { shipping_address, approval_note, lat, lng } = req.body

    const payload = {
      status: 'approved',
      approved_by: userId,
      approved_at: new Date().toISOString(),
    }
    if (approval_note)     payload.approval_note = approval_note
    if (shipping_address)  payload.shipping_address = typeof shipping_address === 'string'
                              ? shipping_address
                              : JSON.stringify(shipping_address)
    // Campo geoPoint de PocketBase (nombre "address" según schema)
    if (lat != null && lng != null) {
      payload['address'] = { lon: parseFloat(lng), lat: parseFloat(lat) }
    }

    const pbRes = await fetch(
      `${PB_URL}/api/collections/orders/records/${req.params.id}`,
      { method: 'PATCH', headers: pbHeaders(token), body: JSON.stringify(payload) }
    )
    const data = await readJsonSafe(pbRes)
    if (!pbRes.ok) return res.status(pbRes.status).json({ error: 'approve_failed', details: data })
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── Rechazar orden ─────────────────────────────────────────────────────────────
app.patch('/:id/reject', requireAuth, async (req, res) => {
  try {
    const token  = await getAdminToken()
    const userId = req.headers['x-user-id']
    const role   = req.headers['x-user-role']

    const result = await checkOrderOwnership(token, req.params.id, userId)
    if (!result) return res.status(404).json({ error: 'not_found' })
    if (role === 'vendor' && !result.isOwner) return res.status(403).json({ error: 'forbidden' })

    const pbRes = await fetch(
      `${PB_URL}/api/collections/orders/records/${req.params.id}`,
      {
        method: 'PATCH',
        headers: pbHeaders(token),
        body: JSON.stringify({
          status: 'rejected',
          approved_by: userId,
          approved_at: new Date().toISOString(),
          approval_note: req.body.reason || '',
        }),
      }
    )
    const data = await readJsonSafe(pbRes)
    if (!pbRes.ok) return res.status(pbRes.status).json({ error: 'reject_failed', details: data })
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── Marcar como enviado ────────────────────────────────────────────────────────
app.patch('/:id/ship', requireAuth, async (req, res) => {
  try {
    const token  = await getAdminToken()
    const userId = req.headers['x-user-id']
    const role   = req.headers['x-user-role']

    const result = await checkOrderOwnership(token, req.params.id, userId)
    if (!result) return res.status(404).json({ error: 'not_found' })
    if (role === 'vendor' && !result.isOwner) return res.status(403).json({ error: 'forbidden' })

    const pbRes = await fetch(
      `${PB_URL}/api/collections/orders/records/${req.params.id}`,
      {
        method: 'PATCH',
        headers: pbHeaders(token),
        body: JSON.stringify({ status: 'shipped' }),
      }
    )
    const data = await readJsonSafe(pbRes)
    if (!pbRes.ok) return res.status(pbRes.status).json({ error: 'ship_failed', details: data })
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── Marcar como entregado ──────────────────────────────────────────────────────
app.patch('/:id/deliver', requireAuth, async (req, res) => {
  try {
    const token  = await getAdminToken()
    const userId = req.headers['x-user-id']
    const role   = req.headers['x-user-role']

    const result = await checkOrderOwnership(token, req.params.id, userId)
    if (!result) return res.status(404).json({ error: 'not_found' })
    if (role === 'vendor' && !result.isOwner) return res.status(403).json({ error: 'forbidden' })

    const pbRes = await fetch(
      `${PB_URL}/api/collections/orders/records/${req.params.id}`,
      { method: 'PATCH', headers: pbHeaders(token), body: JSON.stringify({ status: 'delivered' }) }
    )
    const data = await readJsonSafe(pbRes)
    if (!pbRes.ok) return res.status(pbRes.status).json({ error: 'deliver_failed', details: data })
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── Stats de órdenes por tienda ────────────────────────────────────────────────
app.get('/vendor/stats/:storeId', requireAuth, async (req, res) => {
  try {
    const token = await getAdminToken()
    const sid   = req.params.storeId.replace(/"/g, '')
    const enc   = encodeURIComponent

    const countStatus = async (status) => {
      const r = await fetch(
        `${PB_URL}/api/collections/orders/records?page=1&perPage=1&fields=id&filter=${enc(`store="${sid}" && status="${status}"`)}`,
        { headers: pbHeaders(token) }
      )
      const d = await readJsonSafe(r)
      return Number(d?.totalItems || 0)
    }

    const [pending, approved, shipped, delivered, rejected, cancelled] = await Promise.all([
      countStatus('payment_uploaded'),
      countStatus('approved'),
      countStatus('shipped'),
      countStatus('delivered'),
      countStatus('rejected'),
      countStatus('cancelled'),
    ])

    res.json({ pending, approved, shipped, delivered, rejected, cancelled,
               total: pending + approved + shipped + delivered + rejected + cancelled })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.listen(PORT, () => console.log(`order-service running on port ${PORT}`))
