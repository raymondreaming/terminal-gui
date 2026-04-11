import React from "react";
import { Icons } from "./Icons";

// File extension to icon mapping
export type FileIconType =
	| "react"
	| "typescript"
	| "javascript"
	| "css"
	| "json"
	| "test"
	| "config"
	| "default";

// Get icon type from filename
export function getFileIconType(filename: string): FileIconType {
	const ext = filename.split(".").pop()?.toLowerCase() || "";
	const name = filename.toLowerCase();

	// Test files
	if (
		name.includes(".test.") ||
		name.includes(".spec.") ||
		name.includes("__test__")
	) {
		return "test";
	}

	// Config files
	if (
		name.includes("config") ||
		name.includes(".rc") ||
		name === "package.json" ||
		name === "tsconfig.json" ||
		name === "vite.config.ts"
	) {
		return "config";
	}

	// React files
	if (ext === "tsx" || ext === "jsx") {
		return "react";
	}

	// TypeScript
	if (ext === "ts") {
		return "typescript";
	}

	// JavaScript
	if (ext === "js" || ext === "mjs" || ext === "cjs") {
		return "javascript";
	}

	// CSS
	if (ext === "css" || ext === "scss" || ext === "less" || ext === "sass") {
		return "css";
	}

	// JSON
	if (ext === "json") {
		return "json";
	}

	return "default";
}

// Icon colors by type
export const fileIconColors: Record<FileIconType, string> = {
	react: "text-cyan-400",
	typescript: "text-blue-400",
	javascript: "text-yellow-400",
	css: "text-pink-400",
	json: "text-amber-400",
	test: "text-green-400",
	config: "text-gray-400",
	default: "text-surgent-text-3",
};

// File icon component
export function FileIcon({
	filename,
	className = "",
}: {
	filename: string;
	className?: string;
}) {
	const iconType = getFileIconType(filename);
	const color = fileIconColors[iconType];

	// Use specific icons for different types
	if (iconType === "react") {
		return (
			<span className={`${color} ${className}`}>
				<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
					<circle cx="12" cy="12" r="2.5" />
					<ellipse
						cx="12"
						cy="12"
						rx="10"
						ry="4"
						fill="none"
						stroke="currentColor"
						strokeWidth="1.5"
					/>
					<ellipse
						cx="12"
						cy="12"
						rx="10"
						ry="4"
						fill="none"
						stroke="currentColor"
						strokeWidth="1.5"
						transform="rotate(60 12 12)"
					/>
					<ellipse
						cx="12"
						cy="12"
						rx="10"
						ry="4"
						fill="none"
						stroke="currentColor"
						strokeWidth="1.5"
						transform="rotate(120 12 12)"
					/>
				</svg>
			</span>
		);
	}

	if (iconType === "typescript") {
		return (
			<span className={`${color} ${className}`}>
				<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
					<rect
						x="2"
						y="2"
						width="20"
						height="20"
						rx="2"
						fill="currentColor"
						fillOpacity="0.2"
						stroke="currentColor"
						strokeWidth="1.5"
					/>
					<text
						x="12"
						y="16"
						textAnchor="middle"
						fontSize="10"
						fontWeight="bold"
						fill="currentColor"
					>
						TS
					</text>
				</svg>
			</span>
		);
	}

	if (iconType === "javascript") {
		return (
			<span className={`${color} ${className}`}>
				<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
					<rect
						x="2"
						y="2"
						width="20"
						height="20"
						rx="2"
						fill="currentColor"
						fillOpacity="0.2"
						stroke="currentColor"
						strokeWidth="1.5"
					/>
					<text
						x="12"
						y="16"
						textAnchor="middle"
						fontSize="10"
						fontWeight="bold"
						fill="currentColor"
					>
						JS
					</text>
				</svg>
			</span>
		);
	}

	if (iconType === "test") {
		return (
			<span className={`${color} ${className}`}>
				<Icons.Check />
			</span>
		);
	}

	if (iconType === "config") {
		return (
			<span className={`${color} ${className}`}>
				<Icons.Settings />
			</span>
		);
	}

	// Default file icon
	return (
		<span className={`${color} ${className}`}>
			<Icons.File />
		</span>
	);
}

// Git status colors
export const gitStatusColors = {
	added: "text-green-400",
	modified: "text-amber-400",
	deleted: "text-red-400",
};

// Node type colors (for graph view)
export const nodeTypeColors = {
	entry: "bg-purple-400",
	modified: "bg-amber-400",
	added: "bg-green-400",
	normal: "bg-white/40",
};

// Get node dot color class
export function getNodeDotColor(type: string): string {
	return (
		nodeTypeColors[type as keyof typeof nodeTypeColors] || nodeTypeColors.normal
	);
}
