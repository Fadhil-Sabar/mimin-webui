import { sql } from 'drizzle-orm';
import {
	pgTable,
	text,
	timestamp,
	uuid,
	jsonb,
	integer,
	index,
	boolean,
	primaryKey,
	uniqueIndex
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
	id: uuid('id').defaultRandom().primaryKey(),
	email: text('email').notNull().unique(),
	name: text('name').notNull(),
	emailVerified: boolean('email_verified').default(false).notNull(),
	image: text('image'),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
	role: text('role').default('user').notNull(),
	banned: boolean('banned').default(false).notNull(),
	banReason: text('ban_reason'),
	banExpires: timestamp('ban_expires', { withTimezone: true })
});

export const sessions = pgTable(
	'sessions',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		token: text('token').notNull().unique(),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
		expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
		ipAddress: text('ip_address'),
		userAgent: text('user_agent'),
		impersonatedBy: text('impersonated_by')
	},
	(table) => ({ userIdx: index('sessions_user_idx').on(table.userId) })
);

export const accounts = pgTable(
	'accounts',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
		providerId: text('provider_id').notNull(),
		issuer: text('issuer').notNull(),
		accountId: text('account_id').notNull(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		accessToken: text('access_token'),
		refreshToken: text('refresh_token'),
		idToken: text('id_token'),
		accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
		refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
		scope: text('scope'),
		password: text('password')
	},
	(table) => ({
		issuerAccountIdx: uniqueIndex('accounts_issuer_account_idx').on(table.issuer, table.accountId),
		userIdx: index('accounts_user_idx').on(table.userId)
	})
);

export const verifications = pgTable(
	'verifications',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
		value: text('value').notNull(),
		expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
		identifier: text('identifier').notNull()
	},
	(table) => ({ identifierIdx: index('verifications_identifier_idx').on(table.identifier) })
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
			.default(sql`'["web_search"]'::jsonb`),
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

export const messageAttachments = pgTable(
	'message_attachments',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		messageId: uuid('message_id')
			.notNull()
			.references(() => messages.id, { onDelete: 'cascade' }),
		filename: text('filename').notNull(),
		mimeType: text('mime_type').notNull(),
		sizeBytes: integer('size_bytes').notNull(),
		storageKey: text('storage_key').notNull(),
		extractedText: text('extracted_text'),
		extractionStatus: text('extraction_status').notNull().default('not_started'),
		pageCount: integer('page_count'),
		extractionError: text('extraction_error'),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
	},
	(table) => ({ messageIdx: index('message_attachments_message_idx').on(table.messageId) })
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
		customConfig: jsonb('custom_config').$type<{
			name: string;
			protocol: string;
			models: Array<{
				id: string;
				name?: string;
				contextWindow?: number;
				maxTokens?: number;
				reasoning?: boolean;
				vision?: boolean;
			}>;
		}>(),
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
