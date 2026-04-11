import React, { useState, useEffect } from "react";

const models = [
	{
		id: "claude",
		name: "Claude 3.5",
		icon: "C",
		color: "#D97706",
		speed: 45,
		response: `Here's a clean implementation using React hooks:

\`\`\`tsx
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
}
\`\`\`

This hook delays updating the value until after the specified delay has passed since the last change.`,
	},
	{
		id: "gpt4",
		name: "GPT-4",
		icon: "G",
		color: "#10B981",
		speed: 38,
		response: `I'll create a debounce hook for you:

\`\`\`typescript
import { useState, useEffect } from 'react';

export function useDebounce<T>(
  value: T,
  delay: number = 500
): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(
      () => setDebounced(value),
      delay
    );
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
\`\`\`

Usage: \`const debouncedSearch = useDebounce(searchTerm, 300);\``,
	},
	{
		id: "codex",
		name: "Codex",
		icon: "X",
		color: "#6366F1",
		speed: 52,
		response: `\`\`\`typescript
// useDebounce.ts
import { useState, useEffect } from 'react';

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
}

export default useDebounce;
\`\`\``,
	},
];

function TypewriterText({
	text,
	speed = 20,
	onComplete,
}: {
	text: string;
	speed?: number;
	onComplete?: () => void;
}) {
	const [displayText, setDisplayText] = useState("");
	const [isComplete, setIsComplete] = useState(false);

	useEffect(() => {
		setDisplayText("");
		setIsComplete(false);
		let i = 0;
		const timer = setInterval(() => {
			if (i < text.length) {
				setDisplayText(text.slice(0, i + 1));
				i++;
			} else {
				clearInterval(timer);
				setIsComplete(true);
				onComplete?.();
			}
		}, speed);
		return () => clearInterval(timer);
	}, [text, speed]);

	return (
		<span>
			{displayText}
			{!isComplete && <span className="animate-pulse">|</span>}
		</span>
	);
}

export default function ModelComparison() {
	const [activeModels, setActiveModels] = useState<string[]>([
		"claude",
		"gpt4",
	]);
	const [isTyping, setIsTyping] = useState(false);
	const [prompt, setPrompt] = useState(
		"Write a useDebounce hook in TypeScript"
	);

	const toggleModel = (id: string) => {
		setActiveModels((prev) =>
			prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]
		);
	};

	return (
		<div className="max-w-6xl mx-auto">
			<div className="text-center mb-12">
				<h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4 bg-gradient-to-b from-white to-white/60 bg-clip-text text-transparent">
					Compare models side by side
				</h2>
				<p className="text-white/40 max-w-lg mx-auto">
					Same prompt, different models. See how they compare in real-time.
				</p>
			</div>

			{/* Model selector */}
			<div className="flex items-center justify-center gap-3 mb-8">
				{models.map((model) => (
					<button
						key={model.id}
						onClick={() => toggleModel(model.id)}
						className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
							activeModels.includes(model.id)
								? "bg-white/10 text-white border border-white/20"
								: "bg-white/[0.03] text-white/40 border border-white/[0.06] hover:border-white/10"
						}`}
					>
						<span
							className="w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold text-white"
							style={{ backgroundColor: model.color }}
						>
							{model.icon}
						</span>
						{model.name}
					</button>
				))}
			</div>

			{/* Prompt display */}
			<div className="max-w-3xl mx-auto mb-8">
				<div className="p-4 rounded-2xl border border-white/[0.06] bg-white/[0.02]">
					<div className="flex items-center gap-2 mb-2">
						<span className="text-[10px] font-medium text-white/30 uppercase tracking-wider">
							Prompt
						</span>
					</div>
					<p className="text-white/80 font-mono text-sm">{prompt}</p>
				</div>
			</div>

			{/* Comparison grid */}
			<div
				className={`grid gap-4 ${activeModels.length === 3 ? "md:grid-cols-3" : activeModels.length === 2 ? "md:grid-cols-2" : "md:grid-cols-1"}`}
			>
				{models
					.filter((m) => activeModels.includes(m.id))
					.map((model, idx) => (
						<div
							key={model.id}
							className="relative flex flex-col rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden"
						>
							{/* Header */}
							<div
								className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]"
								style={{ backgroundColor: `${model.color}10` }}
							>
								<div className="flex items-center gap-2">
									<span
										className="w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-bold text-white"
										style={{ backgroundColor: model.color }}
									>
										{model.icon}
									</span>
									<span className="font-medium text-sm">{model.name}</span>
								</div>
								<div className="flex items-center gap-2">
									<span className="text-[10px] text-white/40">
										{model.speed} tok/s
									</span>
									<span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
								</div>
							</div>

							{/* Response */}
							<div className="flex-1 p-4 font-mono text-xs text-white/70 leading-relaxed overflow-auto max-h-[400px]">
								<TypewriterText
									text={model.response}
									speed={Math.floor(1000 / model.speed)}
								/>
							</div>

							{/* Stats */}
							<div className="flex items-center justify-between px-4 py-2 border-t border-white/[0.06] bg-white/[0.01]">
								<span className="text-[10px] text-white/30">
									{model.response.length} characters
								</span>
								<span className="text-[10px] text-white/30">
									~{Math.ceil(model.response.length / 4)} tokens
								</span>
							</div>
						</div>
					))}
			</div>
		</div>
	);
}
