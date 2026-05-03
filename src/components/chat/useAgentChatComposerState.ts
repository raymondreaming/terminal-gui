import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { wsClient } from "../../lib/websocket.ts";

interface QueuedMessage {
	id: string;
	text: string;
	displayText: string;
	images?: string[];
}

interface AttachedImageState {
	name: string;
	path: string;
	previewUrl: string;
}

interface MarkdownPreviewState {
	show: boolean;
	path: string;
	content: string | null;
	loading: boolean;
	error: string | null;
}

let queueIdCounter = 0;

export function useAgentChatComposerState() {
	const [isDragOver, setIsDragOver] = useState(false);
	const [attachedImages, setAttachedImages] = useState<AttachedImageState[]>(
		[]
	);
	const attachedImagesRef = useRef(attachedImages);
	attachedImagesRef.current = attachedImages;
	const queueRef = useRef<QueuedMessage[]>([]);
	const [queuedMessages, setQueuedMessages] = useState<QueuedMessage[]>([]);
	const [editingQueueId, setEditingQueueId] = useState<string | null>(null);
	const [editingQueueText, setEditingQueueText] = useState("");
	const [mdPreview, setMdPreview] = useState<MarkdownPreviewState>({
		show: false,
		path: "",
		content: null,
		loading: false,
		error: null,
	});

	const handleMdFileClick = useCallback((filePath: string) => {
		setMdPreview({
			show: true,
			path: filePath,
			content: null,
			loading: true,
			error: null,
		});
		wsClient.send({ type: "file:read", path: filePath });
	}, []);

	useEffect(() => {
		const handleMessage = (msg: Record<string, unknown>) => {
			if (msg.type === "file:content" && mdPreview.loading) {
				setMdPreview((prev) => ({
					...prev,
					content: msg.content as string,
					loading: false,
				}));
			} else if (msg.type === "file:error" && mdPreview.loading) {
				setMdPreview((prev) => ({
					...prev,
					error: (msg.error as string) || "Failed to read file",
					loading: false,
				}));
			}
		};
		return wsClient.onMessage(handleMessage);
	}, [mdPreview.loading]);

	const queueMessage = useCallback(
		(text: string, displayText: string, images?: string[]) => {
			queueRef.current.push({
				id: String(++queueIdCounter),
				text,
				displayText,
				images: images?.length ? images : undefined,
			});
			setQueuedMessages([...queueRef.current]);
		},
		[]
	);

	const shiftQueuedMessage = useCallback(() => {
		const next = queueRef.current.shift() ?? null;
		setQueuedMessages([...queueRef.current]);
		return next;
	}, []);

	const removeQueuedMessage = useCallback((id: string) => {
		queueRef.current = queueRef.current.filter((q) => q.id !== id);
		setQueuedMessages([...queueRef.current]);
	}, []);

	const updateQueuedMessage = useCallback((id: string, text: string) => {
		const item = queueRef.current.find((q) => q.id === id);
		if (!item) return;
		item.text = text;
		item.displayText = text;
		setQueuedMessages([...queueRef.current]);
	}, []);

	const attachImage = useCallback(async (file: File) => {
		try {
			const fd = new FormData();
			fd.append("file", file);
			const res = await fetch("/api/upload-temp", {
				method: "POST",
				body: fd,
			});
			const data = await res.json();
			if (data.path) {
				const previewUrl = URL.createObjectURL(file);
				setAttachedImages((prev) => [
					...prev,
					{ name: file.name, path: data.path, previewUrl },
				]);
			}
		} catch {}
	}, []);

	const removeAttachedImage = useCallback((path: string) => {
		setAttachedImages((prev) => {
			const target = prev.find((img) => img.path === path);
			if (target) URL.revokeObjectURL(target.previewUrl);
			return prev.filter((img) => img.path !== path);
		});
	}, []);

	const clearAttachedImages = useCallback(() => {
		setAttachedImages((prev) => {
			for (const img of prev) URL.revokeObjectURL(img.previewUrl);
			return [];
		});
	}, []);

	const handleDrop = useCallback(
		async (e: React.DragEvent) => {
			e.preventDefault();
			setIsDragOver(false);
			for (const file of Array.from(e.dataTransfer.files)) {
				if (file.type.startsWith("image/")) await attachImage(file);
			}
		},
		[attachImage]
	);

	const handlePaste = useCallback(
		async (e: React.ClipboardEvent) => {
			for (const item of Array.from(e.clipboardData.items)) {
				if (item.type.startsWith("image/")) {
					e.preventDefault();
					const file = item.getAsFile();
					if (file) await attachImage(file);
					return;
				}
			}
		},
		[attachImage]
	);

	useEffect(
		() => () => {
			for (const img of attachedImagesRef.current) {
				URL.revokeObjectURL(img.previewUrl);
			}
		},
		[]
	);

	return {
		isDragOver,
		setIsDragOver,
		attachedImages,
		queueRef,
		queuedMessages,
		setQueuedMessages,
		queueMessage,
		shiftQueuedMessage,
		removeQueuedMessage,
		updateQueuedMessage,
		editingQueueId,
		setEditingQueueId,
		editingQueueText,
		setEditingQueueText,
		mdPreview,
		setMdPreview,
		handleMdFileClick,
		attachImage,
		removeAttachedImage,
		clearAttachedImages,
		handleDrop,
		handlePaste,
	};
}
