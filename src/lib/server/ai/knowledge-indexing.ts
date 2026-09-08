import { and, eq } from 'drizzle-orm';
import { getDb, schema } from '../db/client';
import { embedKnowledge, EMBEDDING_BATCH_SIZE } from './knowledge-embeddings';

/** Lexical chunks are committed first; an embedding outage never loses uploaded text. */
export async function indexKnowledgeEmbeddings(projectId: string, fileId: string) {
	const db = getDb();
	let indexed = 0;
	try {
		const chunks = await db
			.select({ id: schema.projectFileChunks.id, content: schema.projectFileChunks.content })
			.from(schema.projectFileChunks)
			.where(
				and(
					eq(schema.projectFileChunks.projectId, projectId),
					eq(schema.projectFileChunks.fileId, fileId)
				)
			);
		for (let start = 0; start < chunks.length; start += EMBEDDING_BATCH_SIZE) {
			const batch = chunks.slice(start, start + EMBEDDING_BATCH_SIZE);
			const result = await embedKnowledge(batch.map((chunk) => chunk.content));
			if (!result) return { status: 'disabled' as const, indexed };
			await db.transaction(async (tx) => {
				for (const [index, chunk] of batch.entries())
					await tx
						.update(schema.projectFileChunks)
						.set({ embedding: result.vectors[index], embeddingModel: result.identity })
						.where(
							and(
								eq(schema.projectFileChunks.id, chunk.id),
								eq(schema.projectFileChunks.projectId, projectId),
								eq(schema.projectFileChunks.fileId, fileId)
							)
						);
			});
			indexed += batch.length;
		}
		return { status: 'indexed' as const, indexed };
	} catch {
		console.warn('[project-knowledge] Embedding indexing unavailable; lexical chunks retained.');
		return { status: 'unavailable' as const, indexed };
	}
}
