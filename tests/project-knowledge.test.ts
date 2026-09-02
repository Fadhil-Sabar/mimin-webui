import { describe, expect, it } from 'vitest';
import {
	formatProjectKnowledgeResults,
	projectKnowledgeSearchTerms
} from '../src/lib/server/ai/tools/project-knowledge.tool';

describe('project knowledge retrieval', () => {
	it('turns natural questions into useful lexical terms', () => {
		expect(projectKnowledgeSearchTerms('What can you see in this project overview?')).toEqual([
			'you',
			'overview'
		]);
		expect(projectKnowledgeSearchTerms('batas tanah batas pemilik')).toEqual([
			'batas',
			'tanah',
			'pemilik'
		]);
	});

	it('returns attached file metadata and overview content when direct search misses', () => {
		const text = formatProjectKnowledgeResults(
			'project overview',
			[
				{
					filename: 'boundary.pdf',
					mimeType: 'application/pdf',
					extractionStatus: 'extracted',
					chunkCount: 1
				}
			],
			[
				{
					content: 'SURAT PERNYATAAN PERSETUJUAN BATAS',
					filename: 'boundary.pdf',
					fileId: 'file-1',
					page: null
				}
			],
			true
		);

		expect(text).toContain('Attached project files (1)');
		expect(text).toContain('Showing an overview');
		expect(text).toContain('SURAT PERNYATAAN PERSETUJUAN BATAS');
	});
});
