import { notFound } from "../../lib/route-helpers.ts";
import { CheckpointService } from "../services/checkpoint.ts";

export function checkpointRoutes() {
	return {
		"/api/checkpoints/:paneId": {
			GET: async (req: Request & { params: { paneId: string } }) => {
				const list = CheckpointService.listCheckpoints(req.params.paneId);
				return Response.json({ checkpoints: list });
			},
		},

		"/api/checkpoints/revert/:checkpointId": {
			POST: async (req: Request & { params: { checkpointId: string } }) => {
				const result = await CheckpointService.revertToCheckpoint(
					req.params.checkpointId
				);
				return Response.json(result);
			},
		},

		"/api/checkpoints/detail/:checkpointId": {
			GET: async (req: Request & { params: { checkpointId: string } }) => {
				const meta = CheckpointService.getCheckpointMeta(
					req.params.checkpointId
				);
				if (!meta) return notFound();
				return Response.json(meta);
			},
		},
	};
}
