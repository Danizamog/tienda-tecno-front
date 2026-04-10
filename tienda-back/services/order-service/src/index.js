const express = require('express')
const cors = require('cors')

const app = express()
const PORT = Number(process.env.PORT || 9005)

app.use(cors())
app.use(express.json())

const orders = [
  { id: 'o1', status: 'pending', total: 79980, discount_total: 15000, giftcard_code: 'LOOK-2026-10' },
  { id: 'o2', status: 'delivered', total: 28990, discount_total: 0, giftcard_code: null },
]

app.get('/health', (_req, res) => {
  res.json({ service: 'order-service', ok: true, port: PORT })
})

app.get('/', (_req, res) => {
  res.json({ items: orders })
})

app.listen(PORT, () => {
  console.log(`order-service running on port ${PORT}`)
})
