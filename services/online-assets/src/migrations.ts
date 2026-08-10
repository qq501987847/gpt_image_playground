import { readFile } from 'node:fs/promises'

interface MigrationClient {
  query: (sql: string) => Promise<unknown>
}

export async function runMigrations(client: MigrationClient) {
  const sql = await readFile(new URL('../migrations/001_temporary_assets.sql', import.meta.url), 'utf8')
  await client.query(sql)
}
