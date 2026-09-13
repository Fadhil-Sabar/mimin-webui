export type Project = {
	id: string;
	name: string;
	description: string;
	instructions: string | null;
	updatedAt: string;
};

export type ProjectFile = {
	id: string;
	filename: string;
	mimeType: string;
	sizeBytes: number;
	createdAt: string;
	extractionStatus?: string | null;
	pageCount?: number | null;
	extractionError?: string | null;
	chunkCount?: number | null;
};

export type Conversation = { id: string; title: string; model: string; updatedAt: string };

export type PageInfo = { page: number; pageSize: number; total: number; hasMore: boolean };

export type ExtractionSummary = { label: string; tone: string };

export type UploadSummary = { succeeded: number; failed: string[] };
