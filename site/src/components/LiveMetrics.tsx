import React, { useState, useEffect } from "react";

// Animated counter component
function AnimatedNumber({
	value,
	suffix = "",
	prefix = "",
}: {
	value: number;
	suffix?: string;
	prefix?: string;
}) {
	const [displayValue, setDisplayValue] = useState(0);

	useEffect(() => {
		const duration = 2000;
		const steps = 60;
		const increment = value / steps;
		let current = 0;
		const timer = setInterval(() => {
			current += increment;
			if (current >= value) {
				setDisplayValue(value);
				clearInterval(timer);
			} else {
				setDisplayValue(Math.floor(current));
			}
		}, duration / steps);
		return () => clearInterval(timer);
	}, [value]);

	return (
		<span className="tabular-nums">
			{prefix}
			{displayValue.toLocaleString()}
			{suffix}
		</span>
	);
}

// Sparkline chart
function Sparkline({ data, color }: { data: number[]; color: string }) {
	const max = Math.max(...data);
	const min = Math.min(...data);
	const range = max - min || 1;
	const width = 120;
	const height = 32;
	const points = data
		.map((d, i) => {
			const x = (i / (data.length - 1)) * width;
			const y = height - ((d - min) / range) * height;
			return `${x},${y}`;
		})
		.join(" ");

	return (
		<svg width={width} height={height} className="opacity-60">
			<polyline
				points={points}
				fill="none"
				stroke={color}
				strokeWidth="1.5"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			{/* Glow effect */}
			<polyline
				points={points}
				fill="none"
				stroke={color}
				strokeWidth="4"
				strokeLinecap="round"
				strokeLinejoin="round"
				opacity="0.2"
			/>
		</svg>
	);
}

export default function LiveMetrics() {
	const [metrics, setMetrics] = useState({
		requests: 1847293,
		avgLatency: 142,
		uptime: 99.98,
		models: 12,
	});

	// Simulate live updates
	useEffect(() => {
		const interval = setInterval(() => {
			setMetrics((m) => ({
				...m,
				requests: m.requests + Math.floor(Math.random() * 50),
				avgLatency: 140 + Math.floor(Math.random() * 20),
			}));
		}, 3000);
		return () => clearInterval(interval);
	}, []);

	const requestsData = [45, 52, 48, 61, 55, 67, 72, 68, 75, 82, 78, 85];
	const latencyData = [
		150, 142, 138, 155, 145, 140, 135, 148, 142, 138, 145, 142,
	];

	return (
		<div className="max-w-6xl mx-auto">
			<div className="text-center mb-12">
				<h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4 bg-gradient-to-b from-white to-white/60 bg-clip-text text-transparent">
					Built for scale
				</h2>
				<p className="text-white/40 max-w-lg mx-auto">
					Real-time metrics from inferay users worldwide
				</p>
			</div>

			<div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
				{/* Requests */}
				<div className="relative group p-6 rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm hover:border-white/[0.1] transition-all duration-300">
					<div className="absolute top-4 right-4">
						<span className="flex h-2 w-2">
							<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
							<span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
						</span>
					</div>
					<p className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">
						API Requests
					</p>
					<p className="text-2xl md:text-3xl font-bold mb-3">
						<AnimatedNumber value={metrics.requests} />
					</p>
					<Sparkline data={requestsData} color="#10b981" />
					<p className="text-[10px] text-white/30 mt-2">
						+12.4% from last week
					</p>
				</div>

				{/* Latency */}
				<div className="relative group p-6 rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm hover:border-white/[0.1] transition-all duration-300">
					<p className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">
						Avg Latency
					</p>
					<p className="text-2xl md:text-3xl font-bold mb-3">
						<AnimatedNumber value={metrics.avgLatency} suffix="ms" />
					</p>
					<Sparkline data={latencyData} color="#6366f1" />
					<p className="text-[10px] text-white/30 mt-2">P99: 245ms</p>
				</div>

				{/* Uptime */}
				<div className="relative group p-6 rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm hover:border-white/[0.1] transition-all duration-300">
					<p className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">
						Uptime
					</p>
					<p className="text-2xl md:text-3xl font-bold mb-3 text-emerald-400">
						{metrics.uptime}%
					</p>
					<div className="flex gap-0.5 mt-2">
						{Array.from({ length: 30 }).map((_, i) => (
							<div
								key={i}
								className={`flex-1 h-6 rounded-sm ${i === 12 ? "bg-amber-500/60" : "bg-emerald-500/40"}`}
							/>
						))}
					</div>
					<p className="text-[10px] text-white/30 mt-2">Last 30 days</p>
				</div>

				{/* Models */}
				<div className="relative group p-6 rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm hover:border-white/[0.1] transition-all duration-300">
					<p className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">
						AI Models
					</p>
					<p className="text-2xl md:text-3xl font-bold mb-3">
						<AnimatedNumber value={metrics.models} />
					</p>
					<div className="flex flex-wrap gap-1.5 mt-2">
						{["Claude", "GPT-4", "Codex", "Gemini", "Llama"].map((model) => (
							<span
								key={model}
								className="px-2 py-0.5 rounded-full text-[9px] font-medium bg-white/[0.06] text-white/50"
							>
								{model}
							</span>
						))}
						<span className="px-2 py-0.5 rounded-full text-[9px] font-medium bg-white/[0.06] text-white/30">
							+7 more
						</span>
					</div>
				</div>
			</div>
		</div>
	);
}
