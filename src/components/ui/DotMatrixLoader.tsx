import * as stylex from "@stylexjs/stylex";
import { useEffect, useState } from "react";
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
const DELAY_STEP = 0.04;

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
			{...stylex.props(styles.grid)}
			style={{
				gridTemplateColumns: `repeat(5, ${dotSize}px)`,
				gridTemplateRows: `repeat(5, ${dotSize}px)`,
				gap: `${gap}px`,
			}}
			{...a11yProps}
		>
			{SPIRAL_ORDER_5.map((order, i) => (
				<span
					key={i}
					{...stylex.props(styles.dot)}
					style={{
						width: `${dotSize}px`,
						height: `${dotSize}px`,
						animationDuration: `${cycleMs}ms`,
						animationDelay: `${order * DELAY_STEP * cycleMs}ms`,
					}}
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
			{...stylex.props(styles.grid)}
			style={{
				gridTemplateColumns: `repeat(5, ${dotSize}px)`,
				gridTemplateRows: `repeat(5, ${dotSize}px)`,
				gap: `${gap}px`,
			}}
			{...a11yProps}
		>
			{RIPPLE_RING_5.map((ring, i) => {
				const parity = ring % 2;
				const delayMs = (ring * 0.14 + parity * 0.03) * cycleMs;
				return (
					<span
						key={i}
						{...stylex.props(styles.rippleDot)}
						style={{
							width: `${dotSize}px`,
							height: `${dotSize}px`,
							animationDuration: `${cycleMs}ms`,
							animationDelay: `${delayMs}ms`,
						}}
					/>
				);
			})}
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
	grid: {
		display: "grid",
		flexShrink: 0,
	},
	dot: {
		backgroundColor: color.textSoft,
		borderRadius: "1px",
		display: "block",
		willChange: "opacity",
		animationName: stylex.keyframes({
			"0%, 100%": { opacity: 0.15 },
			"8%": { opacity: 1 },
			"16%": { opacity: 0.73 },
			"24%": { opacity: 0.56 },
			"32%": { opacity: 0.4 },
			"40%": { opacity: 0.22 },
		}),
		animationIterationCount: "infinite",
		animationTimingFunction: "linear",
	},
	rippleDot: {
		backgroundColor: "currentColor",
		borderRadius: "1px",
		display: "block",
		willChange: "opacity",
		animationName: stylex.keyframes({
			"0%, 100%": { opacity: 0.1 },
			"28%": { opacity: 0.98 },
			"56%": { opacity: 0.32 },
			"78%": { opacity: 0.78 },
		}),
		animationIterationCount: "infinite",
		animationTimingFunction: "ease-in-out",
	},
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
