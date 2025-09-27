import { Doc, applyUpdate, encodeStateAsUpdate } from "yjs";

export class YTransactionStorage {
	private readonly MAX_BYTES = 10 * 1024; // 10KB
	private readonly MAX_UPDATES = 500;

	constructor(private readonly storage: DurableObjectStorage) {}

	private storageKey(type: "update" | "state", name?: string | number): string {
		return `ydoc:${type}:${name ?? ""}`;
	}

	async getYDoc(): Promise<Doc> {
		const snapshot = (await this.storage.get(
			this.storageKey("state", "doc")
		)) as Uint8Array | undefined;
		const data = (await this.storage.list({
			prefix: this.storageKey("update"),
		})) as Map<string, Uint8Array>;

		const updates: Uint8Array[] = Array.from(data.values());
		const doc = new Doc();

		doc.transact(() => {
			if (snapshot) {
				applyUpdate(doc, snapshot);
			}
			for (const update of updates) {
				applyUpdate(doc, update);
			}
		});

		return doc;
	}

	async storeUpdate(update: Uint8Array): Promise<void> {
		if (update.byteLength === 0) {
			return; // Skip empty updates
		}

		try {
			return await this.storage.transaction(async (tx) => {
				const bytes =
					((await tx.get(this.storageKey("state", "bytes"))) as number) ?? 0;
				const count =
					((await tx.get(this.storageKey("state", "count"))) as number) ?? 0;

				const updateBytes = bytes + update.byteLength;
				const updateCount = count + 1;

				if (updateBytes > this.MAX_BYTES || updateCount > this.MAX_UPDATES) {
					const doc = await this.getYDoc();
					applyUpdate(doc, update);
					await this._commit(doc, tx);
				} else {
					await tx.put(this.storageKey("state", "bytes"), updateBytes);
					await tx.put(this.storageKey("state", "count"), updateCount);
					await tx.put(this.storageKey("update", updateCount), update);
				}
			});
		} catch (error) {
			console.error("Error storing update:", error);
			throw error; // Re-throw to let caller handle
		}
	}

	async commit(): Promise<void> {
		const doc = await this.getYDoc();
		return this.storage.transaction(async (tx) => {
			await this._commit(doc, tx);
		});
	}

	private async _commit(doc: Doc, tx: DurableObjectTransaction) {
		const data = (await tx.list({
			prefix: this.storageKey("update"),
		})) as Map<string, Uint8Array>;

		for (const update of data.values()) {
			applyUpdate(doc, update);
		}

		const update = encodeStateAsUpdate(doc);

		await tx.delete(Array.from(data.keys()));
		await tx.put(this.storageKey("state", "bytes"), 0);
		await tx.put(this.storageKey("state", "count"), 0);
		await tx.put(this.storageKey("state", "doc"), update);
	}
}
