import { json } from '@sveltejs/kit';

import { getResearchJournal, parseTradingSetup } from '$lib/server/repositories/index.js';

import type { RequestHandler } from './$types.js';

const MAX_SETUPS_PER_REQUEST = 500;

export const POST: RequestHandler = async ({ request }) => {
	let payload: unknown;
	try {
		payload = await request.json();
	} catch {
		return json({ error: 'Request body must be valid JSON.' }, { status: 400 });
	}

	if (!isRecord(payload) || !Array.isArray(payload.setups)) {
		return json({ error: 'Request body must contain a setups array.' }, { status: 400 });
	}
	if (payload.setups.length > MAX_SETUPS_PER_REQUEST) {
		return json(
			{ error: `At most ${MAX_SETUPS_PER_REQUEST} setups may be stored at once.` },
			{ status: 413 }
		);
	}

	let setups: ReturnType<typeof parseTradingSetup>[];
	try {
		setups = payload.setups.map(parseTradingSetup);
	} catch (error) {
		return json(
			{ error: error instanceof Error ? error.message : 'Setup payload validation failed.' },
			{ status: 400 }
		);
	}

	try {
		getResearchJournal().upsertSetups({ setups, source: 'LIVE', recordedAt: Date.now() });
		return json({ persisted: setups.length });
	} catch {
		return json({ error: 'Setup journal persistence failed.' }, { status: 500 });
	}
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
