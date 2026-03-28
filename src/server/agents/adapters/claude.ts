import type { AgentAdapter } from "../types.ts";

export const claudeAdapter: AgentAdapter<undefined> = {
	kind: "claude",
	displayName: "Claude",

	createState() {
		return undefined;
	},

	spawn(prompt, ctx) {
		const claudeCmd = process.platform === "win32" ? "claude.cmd" : "claude";
		const args = [
			claudeCmd,
			"-p",
			prompt,
			"--output-format",
			"stream-json",
			"--verbose",
			"--dangerously-skip-permissions",
		];

		const sessionId = ctx.getSessionId();
		if (sessionId) {
			args.push("--resume", sessionId);
		}

		const env = { ...process.env };
		delete env.CLAUDECODE;

		return Bun.spawn(args, {
			stdout: "pipe",
			stderr: "pipe",
			cwd: ctx.cwd,
			env,
		});
	},

	handleEvent(event, ctx) {
		if (event?.session_id) {
			ctx.updateSessionId(event.session_id);
		}
		ctx.emitChatEvent(event);
	},

	async finalize({ stderrText, exitCode, ctx }) {
		if (exitCode !== 0 && stderrText) {
			ctx.emitSystemMessage(stderrText);
		}
	},

	stop(proc) {
		proc.kill("SIGINT");
		setTimeout(() => {
			try {
				proc.kill("SIGINT");
			} catch {}
		}, 150);
	},
};
