import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const provenance = JSON.parse(await readFile(`${root}/evidence/database/types-generation.json`, 'utf8'))
const types = await readFile(`${root}/src/integrations/supabase/types.ts`, 'utf8')
const sha256 = (value) => createHash('sha256').update(value).digest('hex')

const migrationFiles = (await readdir(`${root}/supabase/migrations`))
  .filter((name) => name.endsWith('.sql'))
  .sort()
const expectedPaths = migrationFiles.map((name) => `supabase/migrations/${name}`)
assert.deepEqual(
  provenance.migrations?.map(({ path }) => path),
  expectedPaths,
  'database migration set changed after type generation',
)
for (const migration of provenance.migrations) {
  const sql = await readFile(`${root}/${migration.path}`, 'utf8')
  assert.equal(
    migration.sha256,
    sha256(sql),
    `${migration.path} changed after type generation`,
  )
}
assert.equal(provenance.typesSha256, sha256(types), 'generated database types changed without provenance')
assert.deepEqual(provenance.schemas, ['public'], 'database types must contain only the public schema')
assert.match(types, /^  public: \{/m, 'generated types are missing the public schema')
assert.doesNotMatch(types, /^  (?:admin|audit|private): \{/m, 'generated types contain a private schema')

console.log(
  `Database type provenance matches ${expectedPaths.length} public migrations and the generated file.`,
)
