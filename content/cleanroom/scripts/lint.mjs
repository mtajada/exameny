import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const packRoot = path.resolve(scriptDir, '..')
const ignoredDirectories = new Set(['.git', 'node_modules'])

function walk(directory) {
  const files = []
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (ignoredDirectories.has(entry.name)) continue
    const fullPath = path.join(directory, entry.name)
    if (entry.isSymbolicLink()) throw new Error(`Symbolic links are not allowed: ${path.relative(packRoot, fullPath)}`)
    if (entry.isDirectory()) files.push(...walk(fullPath))
    else files.push(fullPath)
  }
  return files
}

const textFiles = walk(packRoot).filter((file) => /\.(json|md|mjs)$/.test(file))
const findings = []
const checks = [
  {
    name: 'email address',
    pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  },
  {
    name: 'absolute macOS user path',
    pattern: /\/Users\/[A-Za-z0-9._-]+\//g,
  },
  {
    name: 'API-key-shaped token',
    pattern: /\b(?:sk|rk|pk)-[A-Za-z0-9_-]{16,}\b/g,
  },
  {
    name: 'JWT-shaped token',
    pattern: /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
  },
  {
    name: 'private key header',
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
  },
]

const extraTerms = process.argv
  .slice(2)
  .filter((argument) => argument.startsWith('--term='))
  .map((argument) => argument.slice('--term='.length).trim())
  .filter(Boolean)

for (const file of textFiles) {
  const relativePath = path.relative(packRoot, file)
  const content = fs.readFileSync(file, 'utf8')
  for (const check of checks) {
    check.pattern.lastIndex = 0
    if (check.pattern.test(content)) findings.push(`${relativePath}: ${check.name}`)
  }
  const lowerContent = content.toLocaleLowerCase('en')
  for (const term of extraTerms) {
    if (lowerContent.includes(term.toLocaleLowerCase('en'))) findings.push(`${relativePath}: excluded term supplied at runtime`)
  }
}

if (findings.length > 0) {
  console.error(`Content lint failed with ${findings.length} finding(s):`)
  for (const finding of findings) console.error(`- ${finding}`)
  process.exitCode = 1
} else {
  console.log(`Content lint passed across ${textFiles.length} files; no personal address, local path, credential shape, private-key header, or supplied excluded term found.`)
}
