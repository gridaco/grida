import { DurableObject } from "cloudflare:workers";
import { removeAwarenessStates } from "y-protocols/awareness";
import { applyUpdate, encodeStateAsUpdate } from "yjs";
import { WSSharedDoc, setupWSConnection } from "./lib/websocket";
import { YTransactionStorage } from "./lib/storage";
import type { Env } from "hono";
import { Hono } from "hono";

const createApp = (createRoom: (roomId: string) => WebSocket) => {
	const app = new Hono();

	return app.get("/rooms/:roomId", async (c) => {
		const roomId = c.req.param("roomId");
		const client = createRoom(roomId);

		return new Response(null, {
			webSocket: client,
			status: 101,
			statusText: "Switching Protocols",
		});
	});
};

export class G1DO<T extends Env> extends DurableObject<T["Bindings"]> {
	protected app = createApp(this.createRoom.bind(this));
	protected doc = new WSSharedDoc();
	protected storage = new YTransactionStorage(this.state.storage);
	protected sessions = new Map<WebSocket, () => void>();
	private awarenessClients = new Set<number>();

	constructor(
		public state: DurableObjectState,
		public env: T["Bindings"]
	) {
		super(state, env);

		void this.state.blockConcurrencyWhile(this.onStart.bind(this));
	}

	protected async onStart(): Promise<void> {
		const doc = await this.storage.getYDoc();
		applyUpdate(this.doc, encodeStateAsUpdate(doc));

		for (const ws of this.state.getWebSockets()) {
			this.registerWebSocket(ws);
		}

		this.doc.on("update", async (update) => {
			await this.storage.storeUpdate(update);
		});
		this.doc.awareness.on(
			"update",
			async ({
				added,
				removed,
				updated,
			}: {
				added: number[];
				removed: number[];
				updated: number[];
			}) => {
				for (const client of [...added, ...updated]) {
					this.awarenessClients.add(client);
				}
				for (const client of removed) {
					this.awarenessClients.delete(client);
				}
			}
		);
	}

	protected createRoom(roomId: string) {
		const pair = new WebSocketPair();
		const client = pair[0];
		const server = pair[1];
		server.serializeAttachment({
			roomId,
			connectedAt: new Date(),
		});

		this.state.acceptWebSocket(server);
		this.registerWebSocket(server);

		return client;
	}

	fetch(request: Request): Response | Promise<Response> {
		return this.app.request(request, undefined, this.env);
	}

	async updateYDoc(update: Uint8Array): Promise<void> {
		this.doc.update(update);
		await this.cleanup();
	}
	async getYDoc(): Promise<Uint8Array> {
		return encodeStateAsUpdate(this.doc);
	}

	async webSocketMessage(
		ws: WebSocket,
		message: string | ArrayBuffer
	): Promise<void> {
		if (!(message instanceof ArrayBuffer)) return;

		// Basic message size validation for security
		if (message.byteLength > 1024 * 1024) {
			// 1MB limit
			console.warn("Message too large, ignoring");
			return;
		}

		const update = new Uint8Array(message);
		await this.updateYDoc(update);
	}

	async webSocketError(ws: WebSocket): Promise<void> {
		await this.unregisterWebSocket(ws);
		await this.cleanup();
	}

	async webSocketClose(ws: WebSocket): Promise<void> {
		await this.unregisterWebSocket(ws);
		await this.cleanup();
	}

	protected registerWebSocket(ws: WebSocket) {
		setupWSConnection(ws, this.doc);
		const s = this.doc.notify((message) => {
			ws.send(message);
		});
		this.sessions.set(ws, s);
	}

	protected async unregisterWebSocket(ws: WebSocket) {
		try {
			const dispose = this.sessions.get(ws);
			dispose?.();
			this.sessions.delete(ws);
			const clientIds = this.awarenessClients;

			removeAwarenessStates(this.doc.awareness, Array.from(clientIds), null);
		} catch (e) {
			console.error("Error unregistering WebSocket:", e);
			// Continue cleanup even if awareness removal fails
		}
	}

	protected async cleanup() {
		if (this.sessions.size < 1) {
			try {
				await this.storage.commit();
			} catch (error) {
				console.error("Error during cleanup commit:", error);
			}
		}
	}
}
