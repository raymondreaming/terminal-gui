import * as stylex from "@stylexjs/stylex";
import { type CSSProperties, useEffect, useState } from "react";
import { color, controlSize, font } from "../../tokens.stylex.ts";

const SPIRAL_ORDER_5 = [
	0, 1, 2, 3, 4, 15, 16, 17, 18, 5, 14, 23, 24, 19, 6, 13, 22, 21, 20, 7, 12,
	11, 10, 9, 8,
] as const;

const RIPPLE_RING_5 = [
	4, 3, 2, 3, 4, 3, 2, 1, 2, 3, 2, 1, 0, 1, 2, 3, 2, 1, 2, 3, 4, 3, 2, 3, 4,
] as const;

const BASE_CYCLE_MS = 2400;
const RIPPLE_CYCLE_MS = 1500;

interface DotMatrixLoaderProps {
	dotSize?: number;
	gap?: number;
	speed?: number;
	ariaLabel?: string;
}

function DotMatrixLoader({
	dotSize = 2,
	gap = 1,
	speed = 1,
	ariaLabel,
}: DotMatrixLoaderProps = {}) {
	const cycleMs = BASE_CYCLE_MS / Math.max(speed, 0.1);
	const a11yProps = ariaLabel
		? { role: "status", "aria-label": ariaLabel }
		: { role: "presentation", "aria-hidden": true as const };
	return (
		<div
			style={
				{
					display: "grid",
					flexShrink: 0,
					gridTemplateColumns: `repeat(5, ${dotSize}px)`,
					gridTemplateRows: `repeat(5, ${dotSize}px)`,
					gap: `${gap}px`,
				} as CSSProperties
			}
			{...a11yProps}
		>
			{SPIRAL_ORDER_5.map((order, i) => (
				<span
					key={i}
					className="dmx-spiral-dot"
					style={
						{
							width: `${dotSize}px`,
							height: `${dotSize}px`,
							"--dmx-cycle": `${cycleMs}ms`,
							"--dmx-spiral-order": order,
						} as CSSProperties
					}
				/>
			))}
		</div>
	);
}

export function DotMatrixRipple({
	dotSize = 2,
	gap = 1,
	speed = 1,
	ariaLabel,
}: DotMatrixLoaderProps = {}) {
	const cycleMs = RIPPLE_CYCLE_MS / Math.max(speed, 0.1);
	const a11yProps = ariaLabel
		? { role: "status", "aria-label": ariaLabel }
		: { role: "presentation", "aria-hidden": true as const };
	return (
		<div
			style={
				{
					display: "grid",
					flexShrink: 0,
					gridTemplateColumns: `repeat(5, ${dotSize}px)`,
					gridTemplateRows: `repeat(5, ${dotSize}px)`,
					gap: `${gap}px`,
				} as CSSProperties
			}
			{...a11yProps}
		>
			{RIPPLE_RING_5.map((ring, i) => (
				<span
					key={i}
					className="dmx-ripple-dot"
					style={
						{
							width: `${dotSize}px`,
							height: `${dotSize}px`,
							"--dmx-cycle": `${cycleMs}ms`,
							"--dmx-ripple-ring": ring,
							"--dmx-ripple-parity": ring % 2,
						} as CSSProperties
					}
				/>
			))}
		</div>
	);
}

function formatElapsed(ms: number): string {
	const totalSeconds = Math.max(0, Math.floor(ms / 1000));
	if (totalSeconds < 60) return `${totalSeconds}s`;
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	if (minutes < 60) return `${minutes}m ${seconds}s`;
	const hours = Math.floor(minutes / 60);
	const remMinutes = minutes % 60;
	return `${hours}h ${remMinutes}m`;
}

export function ThinkingIndicator({ startTime }: { startTime: number }) {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		const id = window.setInterval(() => setNow(Date.now()), 1000);
		return () => window.clearInterval(id);
	}, []);
	const elapsed = formatElapsed(now - startTime);
	return (
		<div
			{...stylex.props(styles.thinkingRow)}
			aria-live="polite"
			aria-label={`Working, ${elapsed} elapsed`}
		>
			<DotMatrixRipple />
			<span {...stylex.props(styles.thinkingTime)}>{elapsed}</span>
		</div>
	);
}

const styles = stylex.create({
	thinkingRow: {
		alignItems: "center",
		display: "flex",
		gap: controlSize._1_5,
		marginTop: `calc(${controlSize._1} * -1)`,
		paddingBlock: controlSize._0_5,
	},
	thinkingTime: {
		color: color.textMuted,
		fontFamily: font.familyMono,
		fontSize: font.size_2,
		fontVariantNumeric: "tabular-nums",
	},
});

void DotMatrixLoader;
