import { sql } from 'drizzle-orm';
import {
	pgTable,
	text,
	timestamp,
	uuid,
	jsonb,
	integer,
	index,
	primaryKey
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
	id: uuid('id').defaultRandom().primaryKey(),
	email: text('email').notNull().unique(),
	name: text('name').notNull(),
	passwordHash: text('password_hash').notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
});

export const sessions = pgTable(
	'sessions',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		tokenHash: text('token_hash').notNull().unique(),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
		expiresAt: timestamp('expires_at', { withTimezone: true }).notNull()
	},
	(table) => ({ userIdx: index('sessions_user_idx').on(table.userId) })
);

export const projects = pgTable(
	'projects',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		description: text('description').notNull().default(''),
		instructions: text('instructions'),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
	},
	(table) => ({ userIdx: index('projects_user_idx').on(table.userId) })
);

export const projectFiles = pgTable(
	'project_files',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		projectId: uuid('project_id')
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),
		filename: text('filename').notNull(),
		mimeType: text('mime_type').notNull(),
		sizeBytes: integer('size_bytes').notNull(),
		storageKey: text('storage_key').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
	},
	(table) => ({ projectIdx: index('project_files_project_idx').on(table.projectId) })
);

export const conversations = pgTable(
	'conversations',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
		projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
		title: text('title').notNull().default('New conversation'),
		model: text('model').notNull().default('openai/gpt-4o-mini'),
		enabledTools: jsonb('enabled_tools')
			.$type<string[]>()
			.notNull()
			.default(sql`'[]'::jsonb`),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
	},
	(table) => ({
		userIdx: index('conversations_user_idx').on(table.userId),
		projectIdx: index('conversations_project_idx').on(table.projectId),
		updatedIdx: index('conversations_updated_idx').on(table.updatedAt)
	})
);

export const messages = pgTable(
	'messages',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		conversationId: uuid('conversation_id')
			.notNull()
			.references(() => conversations.id, { onDelete: 'cascade' }),
		role: text('role').notNull(),
		content: jsonb('content').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
	},
	(table) => ({ conversationIdx: index('messages_conversation_idx').on(table.conversationId) })
);

export const toolCalls = pgTable('tool_calls', {
	id: uuid('id').defaultRandom().primaryKey(),
	messageId: uuid('message_id').references(() => messages.id, { onDelete: 'cascade' }),
	toolCallId: text('tool_call_id').notNull(),
	toolName: text('tool_name').notNull(),
	input: jsonb('input'),
	output: jsonb('output'),
	status: text('status').notNull().default('pending'),
	startedAt: timestamp('started_at', { withTimezone: true }),
	completedAt: timestamp('completed_at', { withTimezone: true })
});

export const sources = pgTable('sources', {
	id: uuid('id').defaultRandom().primaryKey(),
	type: text('type').notNull(),
	title: text('title').notNull(),
	url: text('url'),
	fileId: uuid('file_id').references(() => projectFiles.id, { onDelete: 'set null' }),
	metadata: jsonb('metadata'),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
});

export const messageCitations = pgTable(
	'message_citations',
	{
		messageId: uuid('message_id')
			.notNull()
			.references(() => messages.id, { onDelete: 'cascade' }),
		sourceId: uuid('source_id')
			.notNull()
			.references(() => sources.id, { onDelete: 'cascade' }),
		label: text('label').notNull()
	},
	(table) => ({ pk: primaryKey({ columns: [table.messageId, table.sourceId] }) })
);

export const providerSettings = pgTable(
	'provider_settings',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		provider: text('provider').notNull(),
		apiKey: text('api_key'),
		baseUrl: text('base_url'),
		updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
	},
	(table) => ({
		userProviderIdx: index('provider_settings_user_provider_idx').on(table.userId, table.provider)
	})
);

export const projectFileChunks = pgTable(
	'project_file_chunks',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		projectId: uuid('project_id')
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),
		fileId: uuid('file_id')
			.notNull()
			.references(() => projectFiles.id, { onDelete: 'cascade' }),
		content: text('content').notNull(),
		page: integer('page'),
		metadata: jsonb('metadata'),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
	},
	(table) => ({ projectIdx: index('chunks_project_idx').on(table.projectId) })
);
