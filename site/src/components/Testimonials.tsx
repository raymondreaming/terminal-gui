import React from "react";

const testimonials = [
	{
		quote:
			"Finally, an AI interface that feels native to how I work. The multi-pane layout changed how I approach complex problems.",
		author: "Sarah Chen",
		role: "Staff Engineer",
		company: "Vercel",
		avatar: "SC",
		color: "#3B82F6",
	},
	{
		quote:
			"I was skeptical about another AI tool, but inferay's git integration alone saved me hours every week. The diff viewer is incredible.",
		author: "Marcus Johnson",
		role: "Tech Lead",
		company: "Stripe",
		avatar: "MJ",
		color: "#8B5CF6",
	},
	{
		quote:
			"Running Claude and GPT-4 side-by-side lets me pick the best response every time. It's like having two senior devs on call.",
		author: "Elena Rodriguez",
		role: "Senior Developer",
		company: "Shopify",
		avatar: "ER",
		color: "#EC4899",
	},
	{
		quote:
			"The keyboard shortcuts are so well thought out. I can go hours without touching my mouse. Pure flow state.",
		author: "David Kim",
		role: "Indie Hacker",
		company: "Self-employed",
		avatar: "DK",
		color: "#F59E0B",
	},
	{
		quote:
			"Switched my whole team to inferay. The context management alone makes our prompts 10x more effective.",
		author: "Priya Patel",
		role: "Engineering Manager",
		company: "Notion",
		avatar: "PP",
		color: "#10B981",
	},
	{
		quote:
			"I've tried every AI coding tool. inferay is the only one that actually understands developer workflows.",
		author: "James Wright",
		role: "Principal Engineer",
		company: "Linear",
		avatar: "JW",
		color: "#6366F1",
	},
];

export default function Testimonials() {
	return (
		<div className="max-w-6xl mx-auto">
			<div className="text-center mb-12">
				<h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4 bg-gradient-to-b from-white to-white/60 bg-clip-text text-transparent">
					Loved by developers
				</h2>
				<p className="text-white/40 max-w-lg mx-auto">
					Join thousands of engineers who've upgraded their workflow
				</p>
			</div>

			{/* Testimonial grid */}
			<div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
				{testimonials.map((testimonial, idx) => (
					<div
						key={idx}
						className="group relative p-6 rounded-2xl border border-white/[0.06] bg-white/[0.02] hover:border-white/[0.1] hover:bg-white/[0.03] transition-all duration-300"
					>
						{/* Quote */}
						<p className="text-[14px] text-white/70 leading-relaxed mb-6">
							"{testimonial.quote}"
						</p>

						{/* Author */}
						<div className="flex items-center gap-3">
							<div
								className="w-10 h-10 rounded-full flex items-center justify-center text-[12px] font-bold text-white"
								style={{ backgroundColor: testimonial.color }}
							>
								{testimonial.avatar}
							</div>
							<div>
								<p className="text-sm font-medium text-white/90">
									{testimonial.author}
								</p>
								<p className="text-xs text-white/40">
									{testimonial.role} at {testimonial.company}
								</p>
							</div>
						</div>

						{/* Decorative star rating */}
						<div className="absolute top-4 right-4 flex gap-0.5">
							{[...Array(5)].map((_, i) => (
								<svg
									key={i}
									className="w-3 h-3 text-amber-400"
									fill="currentColor"
									viewBox="0 0 20 20"
								>
									<path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
								</svg>
							))}
						</div>
					</div>
				))}
			</div>

			{/* Social proof */}
			<div className="mt-12 flex flex-col items-center">
				<div className="flex -space-x-3 mb-4">
					{[
						"#3B82F6",
						"#8B5CF6",
						"#EC4899",
						"#F59E0B",
						"#10B981",
						"#6366F1",
						"#EF4444",
						"#14B8A6",
					].map((color, i) => (
						<div
							key={i}
							className="w-10 h-10 rounded-full border-2 border-[#050505] flex items-center justify-center text-[10px] font-bold text-white"
							style={{ backgroundColor: color }}
						>
							{String.fromCharCode(65 + i)}
						</div>
					))}
					<div className="w-10 h-10 rounded-full border-2 border-[#050505] bg-white/10 flex items-center justify-center text-[10px] font-medium text-white/60">
						+2.8k
					</div>
				</div>
				<p className="text-sm text-white/40">
					<span className="text-white/70 font-medium">2,847 developers</span>{" "}
					are using inferay today
				</p>
			</div>
		</div>
	);
}
