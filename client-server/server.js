import compression from 'compression'
import dotenv from 'dotenv'
import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const nodeEnv = process.env.NODE_ENV ?? 'development'
const envFiles =
  nodeEnv === 'production'
    ? ['.env.production', '.env']
    : ['.env.developement', '.env.development', '.env']

for (const envFile of envFiles) {
  const result = dotenv.config({ path: envFile, override: false })
  if (!result.error) {
    break
  }
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const distDir = path.join(__dirname, 'dist')
const indexFile = path.join(distDir, 'index.html')
const port = Number(process.env.PORT ?? 4173)

const app = express()

app.disable('x-powered-by')
app.use(compression())

app.use(
  express.static(distDir, {
    etag: true,
    fallthrough: true,
    maxAge: '1y',
    index: false,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache')
      }
    },
  }),
)

app.get('/health', (_req, res) => {
  res.json({ ok: true })
})

// SPA fallback
app.get(/.*/, (_req, res) => {
  res.sendFile(indexFile)
})

app.listen(port, () => {
  console.log(`Static server listening on ${process.env.INV_HOST}:${port}`)
})
