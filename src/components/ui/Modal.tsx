import type React from "react";
import { useEffect, useRef } from "react";
import { IconX } from "./Icons.tsx";

interface ModalProps {
	open: boolean;
	onClose: () => void;
	title?: string;
	width?: number;
	height?: number;
	children: React.ReactNode;
}

export function Modal({
	open,
	onClose,
	title,
	width = 560,
	height,
	children,
}: ModalProps) {
	const overlayRef = useRef<HTMLDivElement>(null);
	useEffect(() => {
		if (!open) return;
		const handleKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		window.addEventListener("keydown", handleKey);
		return () => window.removeEventListener("keydown", handleKey);
	}, [open, onClose]);
	if (!open) return null;
	return (
		<div
			ref={overlayRef}
			className="fixed inset-0 z-50 flex items-center justify-center bg-surgent-bg/40 backdrop-blur-md animate-fade-in"
			onClick={(e) => {
				if (e.target === overlayRef.current) onClose();
			}}
		>
			<div
				className="flex flex-col rounded-2xl border border-surgent-border bg-surgent-surface/95 backdrop-blur-xl shadow-2xl overflow-hidden animate-scale-in"
				style={{ width, maxWidth: "90vw", height, maxHeight: "85vh" }}
			>
				{title && (
					<div className="flex items-center justify-between border-b border-surgent-border px-5 py-3">
						<h2 className="text-sm font-semibold text-surgent-text">{title}</h2>
						<button
							type="button"
							onClick={onClose}
							className="p-1 text-surgent-text-3 hover:text-surgent-text-2 rounded-md hover:bg-surgent-text/[0.06]"
						>
							<IconX size={14} />
						</button>
					</div>
				)}
				<div className="flex-1 min-h-0 overflow-y-auto">{children}</div>
			</div>
		</div>
	);
}
