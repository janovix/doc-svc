/**
 * UploadLinkEventBroadcaster Durable Object
 *
 * Handles real-time SSE event broadcasting for upload links.
 * Each upload link gets its own DO instance, maintaining isolated state.
 *
 * Features:
 * - Manages multiple SSE connections per upload link
 * - Broadcasts events to all connected clients
 * - Automatic cleanup when connections close
 * - Keep-alive pings to prevent connection timeout
 */

import type { SSEEvent } from "../types";

interface Connection {
	writer: WritableStreamDefaultWriter<Uint8Array>;
	keepAliveInterval: ReturnType<typeof setInterval>;
}

export class UploadLinkEventBroadcaster {
	private state: DurableObjectState;
	private connections: Map<string, Connection>;
	private encoder: TextEncoder;

	constructor(state: DurableObjectState) {
		this.state = state;
		this.connections = new Map();
		this.encoder = new TextEncoder();
	}

	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);
		const path = url.pathname;

		// Handle SSE connection request
		if (request.method === "GET" && path === "/events") {
			return this.handleSSEConnection(request);
		}

		// Handle event broadcast from workers
		if (request.method === "POST" && path === "/broadcast") {
			return this.handleBroadcast(request);
		}

		// Handle connection count request
		if (request.method === "GET" && path === "/connections") {
			return new Response(JSON.stringify({ count: this.connections.size }), {
				headers: { "Content-Type": "application/json" },
			});
		}

		return new Response("Not Found", { status: 404 });
	}

	/**
	 * Handle SSE connection request
	 */
	private async handleSSEConnection(request: Request): Promise<Response> {
		const connectionId = crypto.randomUUID();

		// Create transform stream for SSE
		const { readable, writable } = new TransformStream<
			Uint8Array,
			Uint8Array
		>();
		const writer = writable.getWriter();

		// Set up keep-alive ping every 30 seconds
		const keepAliveInterval = setInterval(async () => {
			try {
				await this.sendEvent(writer, { type: "ping" });
			} catch {
				// Connection closed, cleanup will happen via abort handler
			}
		}, 30000);

		// Store connection
		this.connections.set(connectionId, { writer, keepAliveInterval });

		// Send initial connected event
		await this.sendEvent(writer, {
			type: "connected",
			data: { timestamp: new Date().toISOString() },
		});

		// Handle connection cleanup on abort
		request.signal.addEventListener("abort", () => {
			this.cleanupConnection(connectionId);
		});

		// Return SSE response
		return new Response(readable, {
			headers: {
				"Content-Type": "text/event-stream",
				"Cache-Control": "no-cache",
				Connection: "keep-alive",
				"Access-Control-Allow-Origin": "*",
				"Access-Control-Allow-Headers": "*",
			},
		});
	}

	/**
	 * Handle broadcast request from worker
	 */
	private async handleBroadcast(request: Request): Promise<Response> {
		try {
			const event = (await request.json()) as SSEEvent;

			// Broadcast to all connected clients
			const errors: string[] = [];
			const connectionIds = Array.from(this.connections.keys());

			for (const connectionId of connectionIds) {
				const connection = this.connections.get(connectionId);
				if (connection) {
					try {
						await this.sendEvent(connection.writer, event);
					} catch {
						// Connection closed, clean it up
						this.cleanupConnection(connectionId);
						errors.push(connectionId);
					}
				}
			}

			return new Response(
				JSON.stringify({
					success: true,
					broadcasted: connectionIds.length - errors.length,
					failed: errors.length,
				}),
				{
					headers: { "Content-Type": "application/json" },
				},
			);
		} catch (error) {
			return new Response(
				JSON.stringify({
					success: false,
					error: error instanceof Error ? error.message : "Unknown error",
				}),
				{
					status: 400,
					headers: { "Content-Type": "application/json" },
				},
			);
		}
	}

	/**
	 * Send SSE event to a writer
	 */
	private async sendEvent(
		writer: WritableStreamDefaultWriter<Uint8Array>,
		event: SSEEvent,
	): Promise<void> {
		const data = `data: ${JSON.stringify(event)}\n\n`;
		await writer.write(this.encoder.encode(data));
	}

	/**
	 * Cleanup a connection
	 */
	private cleanupConnection(connectionId: string): void {
		const connection = this.connections.get(connectionId);
		if (connection) {
			clearInterval(connection.keepAliveInterval);
			try {
				connection.writer.close();
			} catch {
				// Already closed, ignore
			}
			this.connections.delete(connectionId);
		}
	}
}
