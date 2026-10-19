import { getTableConfig, type SQLiteTable } from 'drizzle-orm/sqlite-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as schema from '../src/db/schema';
import { testD1 } from './support/d1';

/** The migration is the source of truth; the Drizzle schema must match it exactly. */
describe('Drizzle schema matches the migration', () => {
  let t: Awaited<ReturnType<typeof testD1>>;
  beforeAll(async () => { t = await testD1(); });
  afterAll(() => t.dispose());

  const tables = Object.values(schema).map((x) => getTableConfig(x as SQLiteTable));

  it('has the same tables', async () => {
    const { results } = await t.db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name != 'd1_migrations'`)
      .all<{ name: string }>();
    expect(tables.map((x) => x.name).sort()).toEqual(results.map((r) => r.name).sort());
  });

  it.each(tables.map((x) => [x.name, x] as const))('%s has the same columns and nullability', async (name, config) => {
    const { results } = await t.db.prepare(`PRAGMA table_info(${name})`).all<{ name: string; notnull: number; pk: number }>();
    const fromSql = results.map((c) => `${c.name}:${c.notnull || c.pk ? 'not null' : 'null'}`).sort();
    const fromDrizzle = config.columns.map((c) => `${c.name}:${c.notNull ? 'not null' : 'null'}`).sort();
    expect(fromDrizzle).toEqual(fromSql);
  });
});
