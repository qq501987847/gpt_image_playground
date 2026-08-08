import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readdir, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import path from 'node:path'

async function filesIn(root, output) {
  const entries = await readdir(root, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const file = path.join(root, entry.name)
    if (entry.isDirectory()) files.push(...await filesIn(file, output))
    if (entry.isFile() && path.resolve(file) !== path.resolve(output)) files.push(file)
  }
  return files
}

function sha256(file) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    createReadStream(file).on('error', reject).on('data', (chunk) => hash.update(chunk)).on('end', () => resolve(hash.digest('hex')))
  })
}

export async function writeHashes(root, output = path.join(root, 'SHA256SUMS')) {
  const files = (await filesIn(root, output)).sort()
  const lines = []
  for (const file of files) lines.push(`${await sha256(file)}  ${path.relative(root, file).split(path.sep).join('/')}`)
  await writeFile(output, `${lines.join('\n')}\n`)
  return lines
}

async function main() {
  const root = process.argv[2] ?? 'release-out'
  const output = process.argv[3] ?? path.join(root, 'SHA256SUMS')
  const lines = await writeHashes(root, output)
  console.log(`已写入 ${output}（${lines.length} 个产物）`)
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
