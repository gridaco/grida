import type { AgentDesignSearch } from "@grida/agent/tools/design-search";

type Pin = AgentDesignSearch.DesignSearchResult;

export type DesignSearchTicket = Readonly<{
  query: string;
  revision: number;
}>;

/**
 * The user-owned state inside one pending reference picker.
 *
 * The tool call contributes only the initial query. Refining that query creates
 * a new search revision while retaining references selected from earlier
 * searches. Tickets let asynchronous pages prove they still belong to the
 * current query before entering the gallery.
 */
export class DesignSearchExplorer {
  readonly query: string;
  readonly revision: number;
  readonly #selected: ReadonlyMap<string, Pin>;

  private constructor(
    query: string,
    revision: number,
    selected: ReadonlyMap<string, Pin>
  ) {
    this.query = query;
    this.revision = revision;
    this.#selected = selected;
  }

  static create(initialQuery: string): DesignSearchExplorer {
    return new DesignSearchExplorer(initialQuery.trim(), 0, new Map());
  }

  get selectedCount(): number {
    return this.#selected.size;
  }

  get selectedPins(): Pin[] {
    return [...this.#selected.values()];
  }

  isSelected(id: string): boolean {
    return this.#selected.has(id);
  }

  refine(query: string): DesignSearchExplorer {
    const nextQuery = query.trim();
    if (!nextQuery || nextQuery === this.query) return this;
    return new DesignSearchExplorer(
      nextQuery,
      this.revision + 1,
      this.#selected
    );
  }

  toggle(pin: Pin): DesignSearchExplorer {
    const selected = new Map(this.#selected);
    if (selected.has(pin.id)) selected.delete(pin.id);
    else selected.set(pin.id, pin);
    return new DesignSearchExplorer(this.query, this.revision, selected);
  }

  remove(id: string): DesignSearchExplorer {
    if (!this.#selected.has(id)) return this;
    const selected = new Map(this.#selected);
    selected.delete(id);
    return new DesignSearchExplorer(this.query, this.revision, selected);
  }

  ticket(): DesignSearchTicket {
    return { query: this.query, revision: this.revision };
  }

  accepts(ticket: DesignSearchTicket): boolean {
    return ticket.query === this.query && ticket.revision === this.revision;
  }
}
