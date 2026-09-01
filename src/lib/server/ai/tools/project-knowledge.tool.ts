import { eq, ilike, and } from 'drizzle-orm';
import { Type } from 'typebox';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import { getDb, schema } from '../../db/client';

const knowledgeParameters = Type.Object({ query: Type.String({ minLength: 1, maxLength: 500 }) });

export function createProjectKnowledgeTool(projectId: string): AgentTool<typeof knowledgeParameters> {
	return {
		name: 'project_knowledge_search',
		label: 'Project Knowledge',
		description: 'Search relevant text chunks from the active project knowledge files.',
		parameters: knowledgeParameters,
		execute: async (_toolCallId, params, signal) => {
			if (signal?.aborted) throw new Error('Tool cancelled');
			const db = getDb();
			const rows = await db.select({ content: schema.projectFileChunks.content, filename: schema.projectFiles.filename, fileId: schema.projectFiles.id, page: schema.projectFileChunks.page }).from(schema.projectFileChunks).innerJoin(schema.projectFiles, eq(schema.projectFileChunks.fileId, schema.projectFiles.id)).where(and(eq(schema.projectFileChunks.projectId, projectId), ilike(schema.projectFileChunks.content, `%${params.query}%`))).limit(8);
			return { content: [{ type: 'text', text: rows.length ? rows.map((row, index) => `[${index + 1}] ${row.filename}${row.page ? ` p.${row.page}` : ''}\n${row.content}`).join('\n\n') : 'No matching project knowledge found.' }], details: { sources: rows.map((row) => ({ type: 'project_file', title: row.filename, fileId: row.fileId, page: row.page })) } };
		}
	};
}
