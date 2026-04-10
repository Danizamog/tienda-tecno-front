const express = require('express')
const cors = require('cors')

const app = express()
const PORT = Number(process.env.PORT || 9003)

app.use(cors())
app.use(express.json())

const products = [
  { id: 'p1', name: 'Chaqueta bomber oversize', price: 39990, discount_percent: 15, discount_amount: 6000 },
  { id: 'p2', name: 'Vestido satinado midi', price: 28990, discount_percent: 10, discount_amount: 2899 },
]

app.get('/health', (_req, res) => {
  res.json({ service: 'product-service', ok: true, port: PORT })
})

app.get('/', (_req, res) => {
  res.json({ items: products })
})

app.get('/featured', (_req, res) => {
  res.json({ items: products })
})

app.listen(PORT, () => {
  console.log(`product-service running on port ${PORT}`)
})
