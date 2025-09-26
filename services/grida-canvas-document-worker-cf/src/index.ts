import { type Context, Hono } from "hono";
import { cors } from "hono/cors";
import { G1DO } from "./do";

const app = new Hono();
app.use("*", cors());

const route = app.route(
	"/editor",
	app.get("/:id", async (c: Context) => {
		try {
			if (c.req.header("Upgrade") !== "websocket") {
				return c.body("Expected websocket", {
					status: 426,
					statusText: "Upgrade Required",
				});
			}

			const roomId = c.req.param("id");
			if (!roomId || roomId.length === 0) {
				return c.body("Invalid room ID", {
					status: 400,
					statusText: "Bad Request",
				});
			}

			// Basic room ID validation for security
			if (!/^[a-zA-Z0-9_-]+$/.test(roomId) || roomId.length > 100) {
				return c.body("Invalid room ID format", {
					status: 400,
					statusText: "Bad Request",
				});
			}

			const obj = c.env.G1;
			const stub = obj.get(obj.idFromName(roomId));

			// Create websocket connection directly
			const client = (stub as any).createRoom(roomId);

			return new Response(null, {
				webSocket: client,
				status: 101,
				statusText: "Switching Protocols",
			});
		} catch (error) {
			console.error("WebSocket connection error:", error);
			return c.body("Internal Server Error", {
				status: 500,
				statusText: "Internal Server Error",
			});
		}
	})
);

export default route;
export { G1DO };
