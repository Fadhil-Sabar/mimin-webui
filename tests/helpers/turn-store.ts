/**
 * In-memory stand-in for the `active_turns` table, plus drizzle condition
 * introspection, so turn-registry tests exercise the real cross-instance SQL
 * paths without a database. Stub columns are plain strings, so bound values
 * arrive as alternating name/value pairs.
 */

type TurnRow = { token: string; canceled: boolean; leaseUntil: Date };

export const activeTurnsSchema = {
	activeTurns: {
		conversationId: 'conversation_id',
		token: 'token',
		canceled: 'canceled',
		leaseUntil: 'lease_until',
		updatedAt: 'updated_at'
	}
};

function conditionValues(condition: unknown, depth = 0, out: unknown[] = []): unknown[] {
	if (depth > 12 || condition == null) return out;
	if (typeof condition === 'string') {
		out.push(condition);
		return out;
	}
	if (typeof condition !== 'object') return out;
	if (Array.isArray(condition)) {
		for (const item of condition) conditionValues(item, depth + 1, out);
		return out;
	}
	const record = condition as Record<string, unknown>;
	if ('encoder' in record && 'value' in record) {
		out.push(record.value);
		return out;
	}
	if (Array.isArray(record.queryChunks)) {
		for (const chunk of record.queryChunks) conditionValues(chunk, depth + 1, out);
	}
	return out;
}

/** Stub columns are plain strings, so bound values arrive as name/value pairs. */
function conditionMap(condition: unknown) {
	const flat = conditionValues(condition);
	const map = new Map<unknown, unknown>();
	for (let index = 0; index + 1 < flat.length; index += 2) map.set(flat[index], flat[index + 1]);
	return map;
}

export function createTurnStore() {
	const rows = new Map<string, TurnRow>();

	const insertValues = (values: { conversationId: string; token: string; leaseUntil: Date }) => {
		const conflict = rows.has(values.conversationId);
		const result = conflict ? [] : [values];
		if (!conflict)
			rows.set(values.conversationId, {
				token: values.token,
				canceled: false,
				leaseUntil: values.leaseUntil
			});
		const promise = Promise.resolve(result);
		return Object.assign(promise, {
			returning: async () => result,
			onConflictDoNothing: () => ({ returning: async () => result })
		});
	};

	const updateWhere = (set: Record<string, unknown>) => (condition: unknown) => {
		const params = conditionMap(condition);
		const cid = params.get('conversation_id');
		const tokenParam = params.get('token');
		const row = cid === undefined ? undefined : rows.get(String(cid));
		let result: unknown[] = [];
		if (row && (tokenParam === undefined || row.token === tokenParam)) {
			if (set.token !== undefined && set.canceled === false) {
				// Reclaim: only an expired lease may be taken over.
				if (row.leaseUntil.getTime() <= Date.now()) {
					const next = {
						token: String(set.token),
						canceled: false,
						leaseUntil: set.leaseUntil as Date
					};
					rows.set(String(cid), next);
					result = [next];
				}
			} else {
				const next = { ...row, ...set } as TurnRow;
				rows.set(String(cid), next);
				result = [next];
			}
		}
		const promise = Promise.resolve(undefined);
		return Object.assign(promise, { returning: async () => result });
	};

	const selectWhere = (condition: unknown) => {
		const params = conditionMap(condition);
		const cid = params.get('conversation_id');
		const row = cid === undefined ? undefined : rows.get(String(cid));
		return Promise.resolve(row ? [row] : []);
	};

	const deleteWhere = (condition: unknown) => {
		const params = conditionMap(condition);
		const cid = params.get('conversation_id');
		const tokenParam = params.get('token');
		if (cid === undefined) return Promise.resolve();
		const key = String(cid);
		const row = rows.get(key);
		if (row && (tokenParam === undefined || row.token === tokenParam)) rows.delete(key);
		return Promise.resolve();
	};

	const db = {
		select: () => ({
			from: () => ({ where: selectWhere })
		}),
		insert: () => ({ values: insertValues }),
		update: () => ({ set: (set: Record<string, unknown>) => ({ where: updateWhere(set) }) }),
		delete: () => ({ where: deleteWhere })
	};

	return { db, rows, reset: () => rows.clear() };
}
