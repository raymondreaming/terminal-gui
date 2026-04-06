import { useCallback, useEffect, useRef, useState } from "react";
import { wsClient } from "../../lib/websocket.ts";

export type ActivityType =
	| "thinking"
	| "responding"
	| "tool_start"
	| "tool_end"
	| "file_changed"
	| "checkpoint"
	| "error";

export interface ActivityEvent {
	id: string;
	type: ActivityType;
	timestamp: number;
	toolName?: string;
	fileName?: string;
	message?: string;
	checkpointId?: string;
	fileCount?: number;
}

interface UseActivityFeedOptions {
	paneId: string | undefined;
	cwd: string | undefined;
	maxEvents?: number;
}

let eventIdCounter = 0;
function nextEventId() {
	return `evt-${++eventIdCounter}-${Date.now().toString(36)}`;
}

export function useActivityFeed({
	paneId,
	cwd,
	maxEvents = 50,
}: UseActivityFeedOptions) {
	const [events, setEvents] = useState<ActivityEvent[]>([]);
	const currentToolRef = useRef<string | null>(null);
	const lastStatusRef = useRef<string>("idle");
	const maxEventsRef = useRef(maxEvents);
	maxEventsRef.current = maxEvents;

	// Use ref for paneId and cwd so the effect doesn't re-run
	const paneIdRef = useRef(paneId);
	const cwdRef = useRef(cwd);
	paneIdRef.current = paneId;
	cwdRef.current = cwd;

	const addEvent = useCallback(
		(event: Omit<ActivityEvent, "id" | "timestamp">) => {
			const newEvent: ActivityEvent = {
				...event,
				id: nextEventId(),
				timestamp: Date.now(),
			};
			setEvents((prev) => {
				const updated = [...prev, newEvent];
				return updated.length > maxEventsRef.current
					? updated.slice(-maxEventsRef.current)
					: updated;
			});
		},
		[]
	);

	const clearEvents = useCallback(() => {
		setEvents([]);
		currentToolRef.current = null;
		lastStatusRef.current = "idle";
	}, []);

	useEffect(() => {
		const handleMessage = (msg: {
			type: string;
			paneId?: string;
			event?: {
				type: string;
				content_block?: { type: string; name?: string };
				delta?: { type: string };
			};
			status?: string;
			cwd?: string;
			file?: string;
			id?: string;
			changedFileCount?: number;
		}) => {
			// Early exit for message types we don't care about
			const msgType = msg.type;
			if (
				msgType !== "chat:event" &&
				msgType !== "chat:status" &&
				msgType !== "chat:done" &&
				msgType !== "chat:error" &&
				msgType !== "file:changed" &&
				msgType !== "checkpoint:finalized"
			) {
				return;
			}

			const currentPaneId = paneIdRef.current;
			const currentCwd = cwdRef.current;

			// Skip if no paneId configured
			if (!currentPaneId) return;

			// Only handle messages for our pane (if paneId is present in message)
			if (msg.paneId && msg.paneId !== currentPaneId) return;

			// Handle chat events - only content_block_start and content_block_stop
			if (msgType === "chat:event" && msg.event) {
				const eventType = msg.event.type;

				// Skip delta events entirely - they're too frequent
				if (eventType === "content_block_delta") return;

				if (eventType === "content_block_start") {
					const block = msg.event.content_block;
					if (block?.type === "text") {
						if (lastStatusRef.current !== "responding") {
							lastStatusRef.current = "responding";
							addEvent({ type: "responding", message: "Generating response" });
						}
					} else if (block?.type === "tool_use" && block.name) {
						currentToolRef.current = block.name;
						addEvent({
							type: "tool_start",
							toolName: block.name,
							message: `Running ${block.name}`,
						});
					}
				} else if (eventType === "content_block_stop") {
					if (currentToolRef.current) {
						addEvent({
							type: "tool_end",
							toolName: currentToolRef.current,
							message: `Completed ${currentToolRef.current}`,
						});
						currentToolRef.current = null;
					}
				}
				return;
			}

			// Handle status changes
			if (msgType === "chat:status" && msg.status) {
				const status = msg.status;
				if (status === "thinking" && lastStatusRef.current !== "thinking") {
					lastStatusRef.current = "thinking";
					addEvent({ type: "thinking", message: "Thinking..." });
				} else if (status === "idle" && lastStatusRef.current !== "idle") {
					lastStatusRef.current = "idle";
				}
				return;
			}

			// Handle completion - just reset state, no need to add event (toolbar shows this)
			if (msgType === "chat:done") {
				lastStatusRef.current = "idle";
				currentToolRef.current = null;
				return;
			}

			// Handle errors
			if (msgType === "chat:error") {
				addEvent({ type: "error", message: "An error occurred" });
				return;
			}

			// Handle file changes (from file watcher)
			if (msgType === "file:changed" && msg.cwd === currentCwd && msg.file) {
				addEvent({
					type: "file_changed",
					fileName: msg.file,
					message: `File changed: ${msg.file}`,
				});
				return;
			}

			// Handle checkpoints
			if (msgType === "checkpoint:finalized" && msg.id) {
				addEvent({
					type: "checkpoint",
					checkpointId: msg.id,
					fileCount: msg.changedFileCount ?? 0,
					message: `Checkpoint created (${msg.changedFileCount ?? 0} files)`,
				});
			}
		};

		return wsClient.onMessage(handleMessage as (msg: unknown) => void);
	}, [addEvent]);

	return {
		events,
		addEvent,
		clearEvents,
	};
}
