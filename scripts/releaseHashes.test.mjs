import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { writeHashes } from './releaseHashes.mjs'

describe('release artifact hashes', () => {
  it('writes stable relative SHA-256 entries and excludes the manifest itself', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'awai-release-hashes-'))
    try {
      await mkdir(path.join(dir, 'web'))
      await writeFile(path.join(dir, 'web', 'awai.txt'), 'AWAI')
      const lines = await writeHashes(dir)
      expect(lines).toEqual([expect.stringMatching(/^[a-f0-9]{64}  web\/awai\.txt$/)])
      expect(await readFile(path.join(dir, 'SHA256SUMS'), 'utf8')).toBe(`${lines[0]}\n`)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
