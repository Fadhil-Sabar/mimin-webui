import { and, eq, inArray, sql } from 'drizzle-orm';
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
				const embeddingCase = sql.join(
					batch.map(
						(chunk, index) =>
							sql`when ${schema.projectFileChunks.id} = ${chunk.id} then ${JSON.stringify(result.vectors[index])}::vector`
					),
					sql` `
				);
				await tx
					.update(schema.projectFileChunks)
					.set({
						embedding: sql`case ${embeddingCase} end`,
						embeddingModel: result.identity
					})
					.where(
						and(
							inArray(
								schema.projectFileChunks.id,
								batch.map((chunk) => chunk.id)
							),
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
