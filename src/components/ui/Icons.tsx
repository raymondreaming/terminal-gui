import type React from "react";

// Props for icon components
type IconProps = React.SVGProps<SVGSVGElement> & { size?: number };

// Create a single-path icon component
function icon(d: string, viewBox = "0 0 24 24") {
	return function Icon({ size = 16, ...props }: IconProps) {
		return (
			<svg
				aria-hidden="true"
				xmlns="http://www.w3.org/2000/svg"
				width={size}
				height={size}
				viewBox={viewBox}
				fill="none"
				stroke="currentColor"
				strokeWidth={1.75}
				strokeLinecap="round"
				strokeLinejoin="round"
				{...props}
			>
				<path d={d} />
			</svg>
		);
	};
}

// Create a multi-path icon component
function iconMulti(paths: string[], viewBox = "0 0 24 24") {
	return function Icon({ size = 16, ...props }: IconProps) {
		return (
			<svg
				aria-hidden="true"
				xmlns="http://www.w3.org/2000/svg"
				width={size}
				height={size}
				viewBox={viewBox}
				fill="none"
				stroke="currentColor"
				strokeWidth={1.75}
				strokeLinecap="round"
				strokeLinejoin="round"
				{...props}
			>
				{paths.map((d) => (
					<path key={d} d={d} />
				))}
			</svg>
		);
	};
}

export const IconSparkles = iconMulti([
	"M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z",
	"M18 14l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3z",
]);

export const IconTerminal = iconMulti(["M4 17l6-6-6-6", "M12 19h8"]);

export const IconX = icon("M18 6L6 18M6 6l12 12");

export const IconPlus = icon("M12 5v14M5 12h14");

export const IconCheck = icon("M20 6L9 17l-5-5");

export const IconChevronRight = icon("M9 18l6-6-6-6");
export const IconChevronDown = icon("M6 9l6 6 6-6");

export const IconTrash = iconMulti([
	"M3 6h18",
	"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2",
]);

export const IconPlay = icon("M5 3l14 9-14 9V3z");

export const IconPause = iconMulti(["M6 4h4v16H6z", "M14 4h4v16H14z"]);

export const IconHammer = iconMulti([
	"M15.12 7.88c1.17-1.17 1.17-3.07 0-4.24L13 5.76",
	"M8.88 15.12l-4.24 4.24a1.5 1.5 0 0 0 2.12 2.12l4.24-4.24",
	"M17.5 10.5L10.5 17.5",
	"M14 7l3 3",
]);

export const IconTarget = iconMulti([
	"M12 22c5.52 0 10-4.48 10-10S17.52 2 12 2 2 6.48 2 12s4.48 10 10 10z",
	"M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 6z",
	"M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
]);

export const IconPalette = iconMulti([
	"M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.5-.75 1.5-1.5 0-.39-.15-.74-.38-1.02-.22-.27-.35-.62-.35-1 0-.83.67-1.5 1.5-1.5H16c3.31 0 6-2.69 6-6 0-5.52-4.48-9.5-10-9.5z",
]);

export const IconLayout = iconMulti(["M3 3h18v18H3z", "M3 9h18", "M9 21V9"]);
export const IconLayoutGrid = iconMulti([
	"M3 3h7v7H3z",
	"M14 3h7v7h-7z",
	"M3 14h7v7H3z",
	"M14 14h7v7h-7z",
]);

export const IconLayoutRows = iconMulti([
	"M3 3h18v5H3z",
	"M3 10h18v5H3z",
	"M3 17h18v5H3z",
]);

export const IconFolder = icon(
	"M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
);

export const IconFolderOpen = iconMulti([
	"M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2v1",
	"M5 21l3-9h16l-3 9",
]);

export const IconGitBranch = iconMulti([
	"M6 3v12",
	"M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
	"M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
	"M15 6a9 9 0 0 0-9 9",
]);

export const IconCamera = iconMulti([
	"M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z",
	"M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
]);

export const IconPencil = iconMulti([
	"M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z",
]);

export const IconGlobe = iconMulti([
	"M12 22c5.52 0 10-4.48 10-10S17.52 2 12 2 2 6.48 2 12s4.48 10 10 10z",
	"M2 12h20",
	"M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z",
]);

export const IconWrench = iconMulti([
	"M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z",
]);

export const IconAlertTriangle = iconMulti([
	"M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z",
	"M12 9v4",
	"M12 17h.01",
]);

export const IconCode = iconMulti(["M16 18l6-6-6-6", "M8 6l-6 6 6 6"]);

export const IconRobot = iconMulti([
	"M12 2a2 2 0 0 1 2 2v1h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-1v4a2 2 0 0 1-2 2v2h-1v-2h-2v2h-1v-2H8a2 2 0 0 1-2-2v-4H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h3V4a2 2 0 0 1 2-2z",
	"M9 10h.01",
	"M15 10h.01",
]);

export function IconAnthropic({ size = 16, ...props }: IconProps) {
	return (
		<svg
			aria-hidden="true"
			xmlns="http://www.w3.org/2000/svg"
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={1.8}
			strokeLinecap="round"
			strokeLinejoin="round"
			{...props}
		>
			<path d="M12 3v4" />
			<path d="M12 17v4" />
			<path d="M3 12h4" />
			<path d="M17 12h4" />
			<path d="M5.8 5.8l2.8 2.8" />
			<path d="M15.4 15.4l2.8 2.8" />
			<path d="M18.2 5.8l-2.8 2.8" />
			<path d="M8.6 15.4l-2.8 2.8" />
			<circle cx="12" cy="12" r="2.2" />
		</svg>
	);
}

export function IconOpenAI({ size = 16, ...props }: IconProps) {
	return (
		<svg
			aria-hidden="true"
			xmlns="http://www.w3.org/2000/svg"
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={1.7}
			strokeLinecap="round"
			strokeLinejoin="round"
			{...props}
		>
			<path d="M12 4.2c1.7 0 3.1 1.4 3.1 3.1v1.1l1-.6a3.1 3.1 0 1 1 3.1 5.4l-.9.5.9.5a3.1 3.1 0 0 1-3.1 5.4l-1-.6v1.1a3.1 3.1 0 1 1-6.2 0v-1.1l-1 .6a3.1 3.1 0 0 1-3.1-5.4l.9-.5-.9-.5a3.1 3.1 0 0 1 3.1-5.4l1 .6V7.3c0-1.7 1.4-3.1 3.1-3.1z" />
			<path d="M12 9.2c1.5 0 2.8 1.3 2.8 2.8s-1.3 2.8-2.8 2.8-2.8-1.3-2.8-2.8 1.3-2.8 2.8-2.8z" />
		</svg>
	);
}

export const IconPanelLeft = iconMulti([
	"M3 3h18a0 0 0 0 1 0 0v18a0 0 0 0 1 0 0H3a0 0 0 0 1 0 0V3z",
	"M9 3v18",
]);

// Panel right icon for collapsing right sidebar
export const IconPanelRight = iconMulti(["M3 3h18v18H3V3z", "M15 3v18"]);

export const IconExternalLink = iconMulti([
	"M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6",
	"M15 3h6v6",
	"M10 14L21 3",
]);

export const IconArrowLeft = icon("M19 12H5M12 19l-7-7 7-7");

export const IconMessageCircle = iconMulti([
	"M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z",
]);

export const IconCircle = icon(
	"M12 22c5.52 0 10-4.48 10-10S17.52 2 12 2 2 6.48 2 12s4.48 10 10 10z"
);
export const IconLoader = iconMulti([
	"M12 2v4",
	"M12 18v4",
	"M4.93 4.93l2.83 2.83",
	"M16.24 16.24l2.83 2.83",
	"M2 12h4",
	"M18 12h4",
	"M4.93 19.07l2.83-2.83",
	"M16.24 7.76l2.83-2.83",
]);

// Zen mode icon - auto-follow file changes (eye with sparkle)
export const IconZen = iconMulti([
	"M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z",
	"M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z",
	"M17 2l1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2",
]);

export type { IconProps };
