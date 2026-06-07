// run_migrations.mjs
// Runs one or more .sql migration files against the Supabase Postgres database.
// Each file is executed inside a transaction (rolled back on any error).
//
// Setup (one time): add a line to hd100-platform/.env with the database
// connection string from Supabase → Project Settings → Database →
// "Connection string" → Session pooler (URI), with the password filled in:
//
//   SUPABASE_DB_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
//
// Usage:
//   node scripts/run_migrations.mjs supabase/migrations/0007_security_hardening.sql ...

import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import pg from 'pg'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Minimal .env parser (avoids an extra dependency).
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env')
  const out = {}
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue
    const i = line.indexOf('=')
    if (i === -1) continue
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim()
  }
  return out
}

const env = loadEnv()
const connectionString = env.SUPABASE_DB_URL
if (!connectionString) {
  console.error(
    'Missing SUPABASE_DB_URL in hd100-platform/.env\n' +
      'Add the Session-pooler connection string from Supabase (Settings → Database).',
  )
  process.exit(1)
}

const files = process.argv.slice(2)
if (files.length === 0) {
  console.error('Pass one or more .sql files to run.')
  process.exit(1)
}

const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false }, // Supabase requires TLS
})

try {
  await client.connect()
  console.log('Connected.\n')
  for (const f of files) {
    const sql = readFileSync(path.resolve(f), 'utf8')
    process.stdout.write(`Running ${f} … `)
    try {
      await client.query('begin')
      await client.query(sql)
      await client.query('commit')
      console.log('OK')
    } catch (e) {
      await client.query('rollback')
      console.log('FAILED (rolled back)')
      console.error(`  ${e.message}`)
      process.exitCode = 1
      break
    }
  }
} finally {
  await client.end()
}
console.log('\nDone.')
