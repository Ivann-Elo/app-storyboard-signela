import 'dotenv/config'
import express from 'express'
import OpenAI from 'openai'
import path from 'path'
import { fileURLToPath } from 'url'

const app = express()
const port = Number(process.env.PORT) || 8787

app.use(express.json({ limit: '4mb' }))

const apiKey = process.env.OPENAI_API_KEY
const client = apiKey ? new OpenAI({ apiKey }) : null
const clientOrigin = process.env.CLIENT_ORIGIN || '*'
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const distPath = path.resolve(__dirname, '..', 'dist')

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', clientOrigin)
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') {
    res.sendStatus(204)
    return
  }
  next()
})

const resolveSize = (format) => {
  const width = Number(format?.width) || 1
  const height = Number(format?.height) || 1
  const ratio = width / height
  if (ratio >= 1.2) return '1536x1024'
  if (ratio <= 0.8) return '1024x1536'
  return '1024x1024'
}

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', openaiConfigured: Boolean(apiKey) })
})

app.post('/api/images', async (req, res) => {
  if (!client) {
    res.status(500).json({ error: 'OPENAI_API_KEY manquante.' })
    return
  }

  const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : ''
  if (!prompt) {
    res.status(400).json({ error: 'Prompt manquant.' })
    return
  }

  const size = resolveSize(req.body?.format)

  try {
    const response = await client.images.generate({
      model: 'gpt-image-1',
      prompt,
      size,
      output_format: 'png',
    })

    const image = response.data?.[0]?.b64_json
    if (!image) {
      res.status(500).json({ error: 'Image indisponible.' })
      return
    }

    res.json({ url: `data:image/png;base64,${image}` })
  } catch (error) {
    const message =
      (error && typeof error === 'object' && 'message' in error && String(error.message)) ||
      'Echec generation image.'
    console.error('OpenAI image error:', error)
    res.status(500).json({ error: message })
  }
})

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(distPath))
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'))
  })
}

app.listen(port, '0.0.0.0', () => {
  console.log(`Image proxy listening on http://localhost:${port}`)
})
