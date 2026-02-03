import 'dotenv/config'
import express from 'express'
import OpenAI from 'openai'
import path from 'path'
import { fileURLToPath } from 'url'
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'crypto'
import jwt from 'jsonwebtoken'
import pg from 'pg'

const app = express()
const port = Number(process.env.PORT) || 8787

app.use(express.json({ limit: '12mb' }))

const apiKey = process.env.OPENAI_API_KEY
const client = apiKey ? new OpenAI({ apiKey }) : null
const clientOrigin = process.env.CLIENT_ORIGIN || '*'
const jwtSecret = process.env.JWT_SECRET || ''
const databaseUrl = process.env.DATABASE_URL || ''
const pool = databaseUrl
  ? new pg.Pool({
      connectionString: databaseUrl,
      ssl: databaseUrl.includes('localhost') ? false : { rejectUnauthorized: false },
    })
  : null
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const distPath = path.resolve(__dirname, '..', 'dist')

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', clientOrigin)
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') {
    res.sendStatus(204)
    return
  }
  next()
})

const ensureDatabase = async () => {
  if (!pool) return
  await pool.query(`
    create table if not exists users (
      id uuid primary key,
      email text unique not null,
      password_hash text not null,
      created_at timestamptz not null default now()
    );
  `)
  await pool.query(`
    create table if not exists projects (
      id uuid primary key,
      user_id uuid not null references users(id) on delete cascade,
      name text not null,
      project_frame_format jsonb not null,
      grid_mode text not null,
      created_at timestamptz not null,
      updated_at timestamptz not null
    );
  `)
  await pool.query(`
    create table if not exists scenes (
      id uuid primary key,
      project_id uuid not null references projects(id) on delete cascade,
      order_index int not null,
      title text not null,
      duration int not null,
      focal text not null,
      description text not null,
      notes text not null,
      audio_types jsonb not null,
      use_project_format boolean not null,
      scene_frame_format jsonb not null,
      image_prompt text not null,
      image jsonb,
      location text,
      moment text,
      characters text,
      scene_references text,
      camera_movement text not null default 'fixed',
      status text not null,
      created_at timestamptz not null,
      updated_at timestamptz not null
    );
  `)
  await pool.query(
    "alter table scenes add column if not exists camera_movement text not null default 'fixed';"
  )
}

ensureDatabase().catch((error) => {
  console.error('Database init error:', error)
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
  res.json({ status: 'ok', openaiConfigured: Boolean(apiKey), dbConfigured: Boolean(pool) })
})

const hashPassword = (password) => {
  const salt = randomBytes(16)
  const hash = scryptSync(password, salt, 64)
  return `${salt.toString('hex')}:${hash.toString('hex')}`
}

const verifyPassword = (password, storedHash) => {
  const [saltHex, hashHex] = storedHash.split(':')
  if (!saltHex || !hashHex) return false
  const salt = Buffer.from(saltHex, 'hex')
  const hash = Buffer.from(hashHex, 'hex')
  const candidate = scryptSync(password, salt, 64)
  if (candidate.length !== hash.length) return false
  return timingSafeEqual(candidate, hash)
}

const signToken = (user) =>
  jwt.sign({ sub: user.id, email: user.email }, jwtSecret, { expiresIn: '30d' })

const requireAuth = (req, res, next) => {
  if (!jwtSecret) {
    res.status(500).json({ error: 'JWT_SECRET manquant.' })
    return
  }
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) {
    res.status(401).json({ error: 'Non autorise.' })
    return
  }
  try {
    const payload = jwt.verify(token, jwtSecret)
    req.user = payload
    next()
  } catch {
    res.status(401).json({ error: 'Token invalide.' })
  }
}

app.post('/api/auth/register', async (req, res) => {
  if (!pool) {
    res.status(500).json({ error: 'DATABASE_URL manquante.' })
    return
  }
  if (!jwtSecret) {
    res.status(500).json({ error: 'JWT_SECRET manquant.' })
    return
  }
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : ''
  const password = typeof req.body?.password === 'string' ? req.body.password : ''
  if (!email || !password) {
    res.status(400).json({ error: 'Email et mot de passe requis.' })
    return
  }
  const id = randomUUID()
  const passwordHash = hashPassword(password)
  try {
    await pool.query('insert into users (id, email, password_hash) values ($1, $2, $3)', [
      id,
      email,
      passwordHash,
    ])
    const token = signToken({ id, email })
    res.json({ token, user: { id, email } })
  } catch (error) {
    const message = error?.code === '23505' ? 'Email deja utilise.' : 'Erreur serveur.'
    res.status(500).json({ error: message })
  }
})

app.post('/api/auth/login', async (req, res) => {
  if (!pool) {
    res.status(500).json({ error: 'DATABASE_URL manquante.' })
    return
  }
  if (!jwtSecret) {
    res.status(500).json({ error: 'JWT_SECRET manquant.' })
    return
  }
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : ''
  const password = typeof req.body?.password === 'string' ? req.body.password : ''
  if (!email || !password) {
    res.status(400).json({ error: 'Email et mot de passe requis.' })
    return
  }
  try {
    const result = await pool.query('select id, email, password_hash from users where email = $1', [
      email,
    ])
    const user = result.rows[0]
    if (!user || !verifyPassword(password, user.password_hash)) {
      res.status(401).json({ error: 'Identifiants invalides.' })
      return
    }
    const token = signToken(user)
    res.json({ token, user: { id: user.id, email: user.email } })
  } catch {
    res.status(500).json({ error: 'Erreur serveur.' })
  }
})

app.get('/api/projects', requireAuth, async (req, res) => {
  if (!pool) {
    res.status(500).json({ error: 'DATABASE_URL manquante.' })
    return
  }
  try {
    const projects = await pool.query(
      'select * from projects where user_id = $1 order by created_at asc',
      [req.user.sub]
    )
    const scenes = await pool.query(
      `select scenes.*
       from scenes
       join projects on scenes.project_id = projects.id
       where projects.user_id = $1
       order by scenes.project_id asc, scenes.order_index asc`,
      [req.user.sub]
    )
    const scenesByProject = scenes.rows.reduce((acc, row) => {
      acc[row.project_id] = acc[row.project_id] || []
      acc[row.project_id].push(row)
      return acc
    }, {})
    const payload = projects.rows.map((project) => ({
      id: project.id,
      name: project.name,
      projectFrameFormat: project.project_frame_format,
      gridMode: project.grid_mode,
      createdAt: project.created_at,
      updatedAt: project.updated_at,
      scenes: (scenesByProject[project.id] || []).map((scene) => ({
        id: scene.id,
        order: scene.order_index,
        title: scene.title,
        duration: scene.duration,
        focal: scene.focal,
        description: scene.description,
        notes: scene.notes,
        audioTypes: scene.audio_types,
        useProjectFormat: scene.use_project_format,
        sceneFrameFormat: scene.scene_frame_format,
        imagePrompt: scene.image_prompt,
        image: scene.image,
        location: scene.location || '',
        moment: scene.moment || '',
        characters: scene.characters || '',
        references: scene.scene_references || '',
        cameraMovement: scene.camera_movement || 'fixed',
        status: scene.status,
      })),
    }))
    res.json(payload)
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Erreur serveur.' })
  }
})

app.post('/api/projects', requireAuth, async (req, res) => {
  if (!pool) {
    res.status(500).json({ error: 'DATABASE_URL manquante.' })
    return
  }
  const project = req.body
  if (!project?.id) {
    res.status(400).json({ error: 'Projet invalide.' })
    return
  }
  try {
    await pool.query(
      `insert into projects (id, user_id, name, project_frame_format, grid_mode, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (id) do update set
         name = excluded.name,
         project_frame_format = excluded.project_frame_format,
         grid_mode = excluded.grid_mode,
         updated_at = excluded.updated_at`,
      [
        project.id,
        req.user.sub,
        project.name,
        project.projectFrameFormat,
        project.gridMode,
        project.createdAt,
        project.updatedAt,
      ]
    )
    res.json({ ok: true })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Erreur serveur.' })
  }
})

app.post('/api/projects/:id/sync', requireAuth, async (req, res) => {
  if (!pool) {
    res.status(500).json({ error: 'DATABASE_URL manquante.' })
    return
  }
  const project = req.body
  const projectId = req.params.id
  if (!project || project.id !== projectId) {
    res.status(400).json({ error: 'Projet invalide.' })
    return
  }
  const clientDb = await pool.connect()
  try {
    await clientDb.query('begin')
    await clientDb.query(
      `insert into projects (id, user_id, name, project_frame_format, grid_mode, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (id) do update set
         name = excluded.name,
         project_frame_format = excluded.project_frame_format,
         grid_mode = excluded.grid_mode,
         updated_at = excluded.updated_at`,
      [
        project.id,
        req.user.sub,
        project.name,
        project.projectFrameFormat,
        project.gridMode,
        project.createdAt,
        project.updatedAt,
      ]
    )
    await clientDb.query('delete from scenes where project_id = $1', [projectId])
    const insertScene =
      'insert into scenes (id, project_id, order_index, title, duration, focal, description, notes, audio_types, use_project_format, scene_frame_format, image_prompt, image, location, moment, characters, scene_references, camera_movement, status, created_at, updated_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)'
    for (const scene of project.scenes || []) {
      await clientDb.query(insertScene, [
        scene.id,
        projectId,
        scene.order,
        scene.title,
        scene.duration,
        scene.focal,
        scene.description || '',
        scene.notes || '',
        scene.audioTypes || [],
        scene.useProjectFormat ?? true,
        scene.sceneFrameFormat,
        scene.imagePrompt || '',
        scene.image || null,
        scene.location || '',
        scene.moment || '',
        scene.characters || '',
        scene.references || '',
        scene.cameraMovement || 'fixed',
        scene.status || 'to-shoot',
        project.createdAt,
        project.updatedAt,
      ])
    }
    await clientDb.query('commit')
    res.json({ ok: true })
  } catch (error) {
    await clientDb.query('rollback')
    console.error(error)
    res.status(500).json({ error: 'Erreur serveur.' })
  } finally {
    clientDb.release()
  }
})

app.delete('/api/projects/:id', requireAuth, async (req, res) => {
  if (!pool) {
    res.status(500).json({ error: 'DATABASE_URL manquante.' })
    return
  }
  const projectId = req.params.id
  try {
    await pool.query('delete from projects where id = $1 and user_id = $2', [
      projectId,
      req.user.sub,
    ])
    res.json({ ok: true })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Erreur serveur.' })
  }
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
