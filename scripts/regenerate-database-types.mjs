import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const migrationDirectory = `${root}/supabase/migrations`
const outputPath = `${root}/src/integrations/supabase/types.ts`
const provenancePath = `${root}/evidence/database/types-generation.json`
const supabaseBin = `${root}/node_modules/.bin/supabase`

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function generateTypes() {
  return new Promise((resolve, reject) => {
    const child = spawn(
      supabaseBin,
      ['gen', 'types', 'typescript', '--local', '--schema', 'public'],
      {
        cwd: root,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.replaceAll('\r\n', '\n'))
        return
      }
      reject(new Error(`Supabase type generation failed with exit code ${code}: ${stderr.trim()}`))
    })
  })
}

const migrationFiles = (await readdir(migrationDirectory))
  .filter((name) => name.endsWith('.sql'))
  .sort()
const migrations = await Promise.all(
  migrationFiles.map(async (name) => {
    const path = `supabase/migrations/${name}`
    return { path, sha256: sha256(await readFile(`${root}/${path}`, 'utf8')) }
  }),
)
const generated = await generateTypes()
await writeFile(outputPath, generated, 'utf8')
await writeFile(
  provenancePath,
  `${JSON.stringify({
    migrations,
    typesSha256: sha256(generated),
    generator: 'supabase-cli',
    generatorVersion: '2.115.0',
    schemas: ['public'],
    generatedAt: new Date().toISOString(),
  }, null, 2)}\n`,
  'utf8',
)

console.log(
  `Generated public database types from ${migrationFiles.length} migrations on the reset local Supabase stack.`,
)
