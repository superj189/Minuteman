// set_boundary.mjs
// Loads the HD-100 district outline into campaigns.boundary so the database can
// clip drawn turf to it (migration 0012). Run once after 0012.
//
//   node scripts/set_boundary.mjs

import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import pg from 'pg'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CAMPAIGN_ID = 'e4673209-c3ea-46d0-b3b4-4e1aabd734fa'

function loadEnv() {
  const out = {}
  for (const line of readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue
    const i = line.indexOf('=')
    if (i !== -1) out[line.slice(0, i).trim()] = line.slice(i + 1).trim()
  }
  return out
}

const boundary = JSON.parse(
  readFileSync(path.join(__dirname, '..', 'web', 'src', 'data', 'hd100_boundary.json'), 'utf8'),
)
const geometry = JSON.stringify(boundary.geometry)

const env = loadEnv()
const client = new pg.Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } })

await client.connect()
await client.query(
  `update campaigns
     set boundary = ST_SetSRID(ST_GeomFromGeoJSON($1), 4326)::geography
   where id = $2`,
  [geometry, CAMPAIGN_ID],
)
const r = await client.query(
  `select ST_GeometryType(boundary::geometry) as type,
          ST_NPoints(boundary::geometry) as points
   from campaigns where id = $1`,
  [CAMPAIGN_ID],
)
console.log('Boundary set:', r.rows[0])
await client.end()
