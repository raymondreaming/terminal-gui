import { tryRoute } from "../../lib/route-helpers.ts";
import { ChatService } from "../services/agent-chat.ts";

export function goalRoutes() {
	return {
		"/api/goals": {
			GET: tryRoute(async () => {
				return Response.json({ goals: ChatService.listGoals() });
			}),
		},
	};
}
