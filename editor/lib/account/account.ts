// GRIDA-SEC-010 / GRIDA-SEC-012 — account reads use an already authorized data source.
/** Account projections. The source carries the caller's database authority. */
export namespace account {
  export const pageSize = 100;

  export type Organization = Readonly<{
    id: number;
    name: string;
    display_name: string;
  }>;
  export type OrganizationsPage = Readonly<{
    organizations: readonly Organization[];
    next_cursor: number | null;
  }>;
  export type Source = Readonly<{
    organizations(after?: number): Promise<{
      rows: unknown;
      /** RLS-visible row count after the cursor, before the page limit. */
      total: number;
    }>;
  }>;

  export class Unavailable extends Error {
    constructor() {
      super("Account data is unavailable.");
      this.name = "AccountUnavailable";
    }
  }

  export function validCursor(value: unknown): value is number {
    return Number.isSafeInteger(value) && (value as number) > 0;
  }

  /** An empty page is a successful RLS read, never a substitute for a failure. */
  export async function organizations(
    source: Source,
    after?: number
  ): Promise<OrganizationsPage> {
    if (after !== undefined && !validCursor(after)) throw new Unavailable();
    const { rows, total } = await source.organizations(after);
    if (
      !Array.isArray(rows) ||
      rows.length > pageSize ||
      !Number.isSafeInteger(total) ||
      total < rows.length ||
      (total > 0 && rows.length === 0)
    ) {
      throw new Unavailable();
    }
    let previous = after ?? 0;
    const organizations = rows.map((row): Organization => {
      if (
        !row ||
        typeof row !== "object" ||
        !validCursor(row.id) ||
        row.id <= previous ||
        typeof row.name !== "string" ||
        !/^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/.test(row.name) ||
        typeof row.display_name !== "string"
      ) {
        throw new Unavailable();
      }
      previous = row.id;
      return { id: row.id, name: row.name, display_name: row.display_name };
    });
    return {
      organizations,
      next_cursor: total > rows.length ? previous : null,
    };
  }
}
