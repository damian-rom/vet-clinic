import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import { isDeepStrictEqual } from 'node:util';

type Field<Entity> = readonly [property: keyof Entity, column: string, boolean?: 'boolean'];

/** The mappings are internal constants; all entity values use bound parameters. */
export class TableRepository<Entity extends { id: string }> {
  constructor(
    private readonly db: DatabaseSync,
    readonly table: string,
    private readonly fields: readonly Field<Entity>[],
  ) {}

  read(): Entity[] {
    return this.db
      .prepare(`SELECT * FROM ${this.table} ORDER BY rowid`)
      .all()
      .map((row) => {
        const entity: Partial<Entity> = {};
        for (const [property, column, boolean] of this.fields) {
          const value = row[column];
          // SQL NULL represents an omitted optional entity property.
          if (value !== null)
            entity[property] = (boolean ? value === 1 : value) as Entity[keyof Entity];
        }
        return entity as Entity;
      });
  }

  synchronize(before: readonly Entity[], after: readonly Entity[]): void {
    const previous = new Map(before.map((entity) => [entity.id, entity]));
    const columns = this.fields.map(([, column]) => column);
    const updates = columns.filter((column) => column !== 'id');
    const upsert = this.db.prepare(`
      INSERT INTO ${this.table} (${columns.join(', ')})
      VALUES (${columns.map(() => '?').join(', ')})
      ON CONFLICT(id) DO UPDATE SET ${updates.map((column) => `${column}=excluded.${column}`).join(', ')}
    `);
    const seen = new Set<string>();
    for (const entity of after) {
      if (seen.has(entity.id)) throw new Error(`Duplicate ID in ${this.table}`);
      seen.add(entity.id);
      if (!isDeepStrictEqual(previous.get(entity.id), entity)) {
        const values = this.fields.map(([property, , boolean]): SQLInputValue => {
          const value = entity[property];
          if (value === undefined) return null;
          if (boolean) return value ? 1 : 0;
          if (typeof value !== 'string' && typeof value !== 'number')
            throw new TypeError(`Expected a scalar value for ${this.table}.${String(property)}`);
          return value;
        });
        upsert.run(...values);
      }
      previous.delete(entity.id);
    }
    const remove = this.db.prepare(`DELETE FROM ${this.table} WHERE id=?`);
    for (const id of previous.keys()) remove.run(id);
  }
}
