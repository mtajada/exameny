import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const migrationDirectory = join(root, 'supabase/migrations')
const migrationPaths = (await readdir(migrationDirectory))
  .filter((name) => name.endsWith('.sql'))
  .sort()
  .map((name) => join(migrationDirectory, name))
const configPath = join(root, 'supabase/config.toml')
const seedPath = join(root, 'supabase/seed.sql')
const paths = [configPath, ...migrationPaths, seedPath]

const checks = [
  { name: 'hosted database URL', pattern: /https?:\/\/[a-z0-9-]+\.supabase\.co/gi },
  { name: 'hosted project reference', pattern: /\b[a-z]{20}\b/gi },
  { name: 'cloud project identifier', pattern: /\b(?:proj_|prj_)[A-Za-z0-9_-]{8,}\b/g },
  { name: 'secret-key prefix', pattern: /\b(?:sb_secret_|sk-proj-|sk-live-|sk_test_)[A-Za-z0-9_-]+\b/g },
  { name: 'JWT-shaped token', pattern: /\beyJ[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{8,}\b/g },
]
const forbiddenThirdPartyTerms = ['cam' + 'bridge', 'to' + 'les', 'ie' + 'lts']
const failures = []

for (const path of paths) {
  const text = await readFile(path, 'utf8')
  const normalized = text.toLowerCase()
  for (const check of checks) {
    check.pattern.lastIndex = 0
    if (check.pattern.test(text)) failures.push(`${relative(root, path)}: ${check.name}`)
  }
  for (const term of forbiddenThirdPartyTerms) {
    if (normalized.includes(term)) failures.push(`${relative(root, path)}: third-party exam reference`)
  }
}

for (const migrationPath of migrationPaths) {
  const migration = await readFile(migrationPath, 'utf8')
  const migrationLabel = relative(root, migrationPath)
  if (/\bdrop\s+(?:table|schema)\b/i.test(migration)) {
    failures.push(`${migrationLabel}: destructive table or schema drop`)
  }
  if (/\bcreate\s+schema\s+(?:if\s+not\s+exists\s+)?(?:admin|audit)\b/i.test(migration)) {
    failures.push(`${migrationLabel}: exposed legacy admin or audit schema recreated`)
  }
  if (!/^begin;/i.test(migration.trim()) || !/commit;\s*$/i.test(migration.trim())) {
    failures.push(`${migrationLabel}: transaction boundary missing`)
  }
}

const config = await readFile(configPath, 'utf8')
if (/schemas\s*=\s*\[[^\]]*["']private["']/i.test(config)) {
  failures.push('supabase/config.toml: private schema must not be exposed through the Data API')
}

const seed = await readFile(seedPath, 'utf8')
const emails = [...seed.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)].map((match) => match[0])
const nonSyntheticEmails = emails.filter((email) => !email.toLowerCase().endsWith('@example.com'))
if (nonSyntheticEmails.length > 0) failures.push(`seed: non-synthetic email domain (${nonSyntheticEmails.length})`)
if (new Set(emails.map((email) => email.toLowerCase())).size < 3) {
  failures.push('seed: expected at least three distinct synthetic identities')
}

if (failures.length > 0) {
  console.error(failures.join('\n'))
  process.exitCode = 1
} else {
  console.log(`Database static checks passed (${emails.length} synthetic email occurrences).`)
}
