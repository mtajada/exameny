import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))

function inspectPackage() {
  return new Promise((resolve, reject) => {
    const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
    const child = spawn(npmCommand, ['pack', '--dry-run', '--json', '--ignore-scripts'], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`npm pack dry-run failed (${code}): ${stderr.trim()}`))
        return
      }
      try {
        resolve(JSON.parse(stdout))
      } catch (error) {
        reject(new Error(`npm pack returned invalid JSON: ${error.message}`))
      }
    })
  })
}

const result = await inspectPackage()
assert.ok(Array.isArray(result) && result.length === 1, 'expected one package result')

const files = result[0].files.map(({ path }) => path)
const fileSet = new Set(files)
const required = [
  '.env.example',
  'LICENSE',
  'README.md',
  'SECURITY.md',
  'package.json',
  'supabase/config.toml',
  'supabase/seed.sql',
]
for (const path of required) {
  assert.ok(fileSet.has(path), `package is missing required file: ${path}`)
}

const forbidden = files.filter((path) =>
  path === '.env' ||
  (path.startsWith('.env.') && path !== '.env.example') ||
  path.includes('/.env') ||
  path.startsWith('.git/') ||
  path.startsWith('node_modules/') ||
  path.startsWith('dist/') ||
  path.startsWith('test-results/') ||
  path.startsWith('playwright-report/') ||
  (path.startsWith('output/implementation-assurance/') || path.includes('/output/implementation-assurance/')) ||
  path.startsWith('.vercel/') ||
  path.startsWith('.codex/') ||
  path.startsWith('.agents/') ||
  path.startsWith('.playwright-cli/') ||
  /(^|\/)[^/]+ 2\.[^/]+$/.test(path)
)
assert.deepEqual(forbidden, [], `package contains forbidden paths: ${forbidden.join(', ')}`)

const textExtensions = new Set([
  '.css', '.example', '.html', '.js', '.json', '.jsx', '.md', '.mjs', '.sh',
  '.sql', '.svg', '.toml', '.ts', '.tsx', '.txt', '.yaml', '.yml',
])
const privatePathPatterns = [
  { label: 'absolute macOS home path', pattern: /\/Users\/[A-Za-z0-9._-]+\// },
  { label: 'absolute Linux home path', pattern: /\/home\/[A-Za-z0-9._-]+\// },
  { label: 'absolute Windows home path', pattern: /[A-Za-z]:\\Users\\[^\\\s]+\\/ },
]
const privatePathFindings = []

for (const path of files) {
  if (!textExtensions.has(extname(path).toLowerCase())) continue
  const content = await readFile(join(root, path), 'utf8')
  for (const { label, pattern } of privatePathPatterns) {
    if (pattern.test(content)) privatePathFindings.push(`${path} (${label})`)
  }
}

assert.deepEqual(
  privatePathFindings,
  [],
  `package contains private absolute paths: ${privatePathFindings.join(', ')}`,
)

console.log(
  `Package dry-run passed (${files.length} files, ${result[0].size} packed bytes, ${result[0].unpackedSize} unpacked bytes).`,
)
