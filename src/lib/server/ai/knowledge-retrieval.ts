import { and, asc, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { getDb, schema } from '../db/client';
import { embedKnowledge } from './knowledge-embeddings';

export type KnowledgeRow = {
	id: string;
	content: string;
	filename: string;
	fileId: string;
	page: number | null;
};
export const KNOWLEDGE_LIMIT = 8;
const CANDIDATE_LIMIT = 40;

/** Reciprocal-rank fusion combines incomparable lexical and cosine scores. */
export function hybridRank(
	keyword: KnowledgeRow[],
	semantic: KnowledgeRow[],
	limit = KNOWLEDGE_LIMIT
) {
	const ranked = new Map<string, { row: KnowledgeRow; score: number }>();
	for (const list of [keyword, semantic]) {
		const seen = new Set<string>();
		list.forEach((row, index) => {
			if (seen.has(row.id)) return;
			seen.add(row.id);
			const entry = ranked.get(row.id) ?? { row, score: 0 };
			entry.score += 1 / (60 + index + 1);
			ranked.set(row.id, entry);
		});
	}
	return [...ranked.values()]
		.sort((a, b) => b.score - a.score || a.row.id.localeCompare(b.row.id))
		.slice(0, limit)
		.map(({ row }) => row);
}

export function escapeLike(value: string) {
	return value.replace(/[\\%_]/g, '\\$&');
}

export async function retrieveProjectKnowledge(
	projectId: string,
	userId: string,
	query: string,
	terms: string[],
	signal?: AbortSignal
) {
	if (!userId) throw new Error('PROJECT_NOT_FOUND');
	if (signal?.aborted) throw new Error('Tool cancelled');
	const db = getDb();
	const columns = {
		id: schema.projectFileChunks.id,
		content: schema.projectFileChunks.content,
		filename: schema.projectFiles.filename,
		fileId: schema.projectFiles.id,
		page: schema.projectFileChunks.page
	};

	const [project] = await db
		.select({ id: schema.projects.id })
		.from(schema.projects)
		.where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)));
	if (!project) throw new Error('PROJECT_NOT_FOUND');
	const files = await db
		.select({
			filename: schema.projectFiles.filename,
			mimeType: schema.projectFiles.mimeType,
			extractionStatus: schema.projectFiles.extractionStatus,
			chunkCount: schema.projectFiles.chunkCount
		})
		.from(schema.projectFiles)
		.where(eq(schema.projectFiles.projectId, projectId))
		.orderBy(desc(schema.projectFiles.createdAt))
		.limit(50);
	// Scope both sides of the join, plus current ownership, even if a corrupt chunk has a foreign file_id.
	const scope = and(
		eq(schema.projectFileChunks.projectId, projectId),
		eq(schema.projectFiles.projectId, projectId),
		eq(schema.projects.userId, userId)
	);
	const patterns = [...new Set([query.trim(), ...terms].filter(Boolean))].map(
		(term) => `%${escapeLike(term)}%`
	);
	const matches = patterns.flatMap((pattern) => [
		ilike(schema.projectFileChunks.content, pattern),
		ilike(schema.projectFiles.filename, pattern)
	]);
	const score = sql<number>`(${sql.join(
		matches.map((match) => sql`case when ${match} then 1 else 0 end`),
		sql` + `
	)})`;
	const base = () =>
		db
			.select(columns)
			.from(schema.projectFileChunks)
			.innerJoin(schema.projectFiles, eq(schema.projectFileChunks.fileId, schema.projectFiles.id))
			.innerJoin(schema.projects, eq(schema.projectFiles.projectId, schema.projects.id));
	const keyword = matches.length
		? await base()
				.where(and(scope, or(...matches)))
				.orderBy(desc(score), desc(schema.projectFiles.createdAt), asc(schema.projectFileChunks.id))
				.limit(CANDIDATE_LIMIT)
		: [];
	let semantic: KnowledgeRow[] = [];
	let semanticStatus: 'disabled' | 'available' | 'unavailable' = 'disabled';
	try {
		const embedded = await embedKnowledge([query], signal);
		if (embedded) {
			const distance = sql<number>`${schema.projectFileChunks.embedding} <=> ${JSON.stringify(embedded.vectors[0])}::vector`;
			semantic = await base()
				.where(
					and(
						scope,
						eq(schema.projectFileChunks.embeddingModel, embedded.identity),
						sql`${distance} <= 0.8`
					)
				)
				.orderBy(asc(distance), asc(schema.projectFileChunks.id))
				.limit(CANDIDATE_LIMIT);
			semanticStatus = 'available';
		}
	} catch {
		if (signal?.aborted) throw new Error('Tool cancelled');
		semanticStatus = 'unavailable';
		console.warn('[project-knowledge] Semantic retrieval unavailable; using keyword search.');
	}
	let rows = hybridRank(keyword, semantic);
	const usedOverviewFallback = rows.length === 0;
	if (usedOverviewFallback)
		rows = await base()
			.where(scope)
			.orderBy(
				desc(schema.projectFiles.createdAt),
				asc(schema.projectFileChunks.createdAt),
				asc(schema.projectFileChunks.id)
			)
			.limit(KNOWLEDGE_LIMIT);
	return {
		files,
		rows,
		usedOverviewFallback: usedOverviewFallback && rows.length > 0,
		semanticStatus
	};
}
