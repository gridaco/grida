import { createDecoder, readVarUint, readVarUint8Array } from "lib0/decoding";
import {
	createEncoder,
	length,
	toUint8Array,
	writeVarUint,
	writeVarUint8Array,
} from "lib0/encoding";
import {
	applyAwarenessUpdate,
	Awareness,
	encodeAwarenessUpdate,
} from "y-protocols/awareness";
import { readSyncMessage, writeSyncStep1, writeUpdate } from "y-protocols/sync";
import { Doc } from "yjs";

// Message types
const MESSAGE_TYPES = {
	sync: 0,
	awareness: 1,
} as const;

type MessageType = keyof typeof MESSAGE_TYPES;

function createTypedEncoder(type: MessageType) {
	const encoder = createEncoder();
	writeVarUint(encoder, MESSAGE_TYPES[type]);
	return encoder;
}

export class WSSharedDoc extends Doc {
	private listeners = new Set<(message: Uint8Array) => void>();
	readonly awareness = new Awareness(this);

	constructor(gc = true) {
		super({ gc });
		this.awareness.setLocalState(null);

		// Awareness updates
		this.awareness.on(
			"update",
			(changes: { added: number[]; updated: number[]; removed: number[] }) => {
				this.awarenessChangeHandler(changes);
			}
		);

		// Document updates
		this.on("update", (update: Uint8Array) => {
			this.syncMessageHandler(update);
		});
	}

	update(message: Uint8Array) {
		const encoder = createEncoder();
		const decoder = createDecoder(message);
		const type = readVarUint(decoder);

		switch (type) {
			case MESSAGE_TYPES.sync: {
				writeVarUint(encoder, MESSAGE_TYPES.sync);
				readSyncMessage(decoder, encoder, this, null);

				if (length(encoder) > 1) {
					this._notify(toUint8Array(encoder));
				}
				break;
			}
			case MESSAGE_TYPES.awareness: {
				applyAwarenessUpdate(this.awareness, readVarUint8Array(decoder), null);
				break;
			}
		}
	}

	notify(listener: (message: Uint8Array) => void) {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	private syncMessageHandler(update: Uint8Array) {
		const encoder = createTypedEncoder("sync");
		writeUpdate(encoder, update);
		this._notify(toUint8Array(encoder));
	}

	private awarenessChangeHandler({
		added,
		updated,
		removed,
	}: {
		added: number[];
		updated: number[];
		removed: number[];
	}) {
		const changed = [...added, ...updated, ...removed];
		const encoder = createTypedEncoder("awareness");
		const update = encodeAwarenessUpdate(
			this.awareness,
			changed,
			this.awareness.states
		);
		writeVarUint8Array(encoder, update);
		this._notify(toUint8Array(encoder));
	}

	private _notify(message: Uint8Array) {
		// Use for...of for better performance with large listener sets
		for (const subscriber of this.listeners) {
			try {
				subscriber(message);
			} catch (error) {
				console.error("Error notifying subscriber:", error);
				// Remove faulty subscriber to prevent future errors
				this.listeners.delete(subscriber);
			}
		}
	}
}

export function setupWSConnection(ws: WebSocket, doc: WSSharedDoc) {
	// Send initial sync
	{
		const encoder = createTypedEncoder("sync");
		writeSyncStep1(encoder, doc);
		ws.send(toUint8Array(encoder));
	}

	// Send awareness states
	{
		const states = doc.awareness.getStates();
		if (states.size > 0) {
			const encoder = createTypedEncoder("awareness");
			const update = encodeAwarenessUpdate(
				doc.awareness,
				Array.from(states.keys())
			);
			writeVarUint8Array(encoder, update);
			ws.send(toUint8Array(encoder));
		}
	}
}
