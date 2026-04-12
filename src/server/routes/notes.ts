import { resolve } from "node:path";
import { PROJECT_ROOT } from "../lib/path-utils.ts";
import { atomicWriteJson } from "../lib/atomic-write.ts";

const NOTES_FILE = resolve(PROJECT_ROOT, "data/notes.json");

type NotesMap = Record<string, string>;

async function loadNotes(): Promise<NotesMap> {
	try {
		const file = Bun.file(NOTES_FILE);
		if (await file.exists()) {
			return (await file.json()) as NotesMap;
		}
	} catch {}
	return {};
}

async function saveNotes(notes: NotesMap): Promise<void> {
	await atomicWriteJson(NOTES_FILE, notes, 2);
}

export function notesRoutes() {
	return {
		"/api/notes": {
			GET: async () => {
				const notes = await loadNotes();
				return Response.json(notes);
			},
			PUT: async (req: Request) => {
				const body = (await req.json()) as {
					groupId: string;
					text: string;
				};
				if (!body.groupId) {
					return Response.json({ error: "groupId required" }, { status: 400 });
				}
				const notes = await loadNotes();
				if (body.text) {
					notes[body.groupId] = body.text;
				} else {
					delete notes[body.groupId];
				}
				await saveNotes(notes);
				return Response.json({ ok: true });
			},
		},
	};
}
