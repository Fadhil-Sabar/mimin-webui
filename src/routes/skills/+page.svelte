<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import {
		Check,
		ChevronDown,
		FileText,
		FolderKanban,
		Globe,
		Info,
		LogOut,
		MessageSquare,
		PanelLeft,
		Plus,
		Puzzle,
		Search,
		Settings,
		Sparkles,
		Trash2,
		User,
		WandSparkles,
		X
	} from '@lucide/svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import RecentChats from '$lib/components/RecentChats.svelte';
	import { authClient } from '$lib/client/auth';
	import { sidebar } from '$lib/client/sidebar.svelte';

	type ScopeFilter = 'all' | 'personal' | 'project';
	type Skill = {
		id: string;
		name: string;
		description: string;
		instructions: string;
		projectId: string | null;
		enabledTools: string[];
		triggerPhrases: string[];
		createdAt: string;
		updatedAt: string;
	};
	type Project = { id: string; name: string };
	type Tool = {
		name: string;
		label: string;
		description: string;
		category: string;
		enabled: boolean;
		projectOnly?: boolean;
		readOnly?: boolean;
		settingHint?: string;
		settingHref?: string;
	};
	type SkillDraft = {
		name: string;
		description: string;
		instructions: string;
		projectId: string | null;
		enabledTools: string[];
		triggerPhrases: string[];
	};

	const MAX_NAME = 120;
	const MAX_DESCRIPTION = 2000;
	const MAX_INSTRUCTIONS = 20000;
	const MAX_TRIGGER_LENGTH = 160;
	const MAX_TRIGGERS = 12;
	const initialProjectId = page.url.searchParams.get('projectId') ?? '';

	let { data } = $props();
	let user = $derived(data.user);
	let skills = $state<Skill[]>([]);
	let projects = $state<Project[]>([]);
	let tools = $state<Tool[]>([]);
	let loading = $state(true);
	let loadingError = $state('');
	let query = $state('');
	let scopeFilter = $state<ScopeFilter>(initialProjectId ? 'project' : 'all');
	let selectedProjectId = $state(initialProjectId);
	let toast = $state('');
	let editorOpen = $state(false);
	let editingSkill = $state<Skill | null>(null);
	let deletingSkill = $state<Skill | null>(null);
	let saving = $state(false);
	let deleting = $state(false);
	let triggerDraft = $state('');
	let formError = $state('');
	let loadSequence = 0;
	let editorModal = $state<HTMLFormElement | undefined>();
	let confirmModal = $state<HTMLDivElement | undefined>();
	let restoreFocusTarget = $state<HTMLElement | null>(null);
	let draft = $state<SkillDraft>({
		name: '',
		description: '',
		instructions: '',
		projectId: initialProjectId || null,
		enabledTools: [],
		triggerPhrases: []
	});

	let projectNames = $derived(new Map(projects.map((project) => [project.id, project.name])));
	let projectSkills = $derived(skills.filter((skill) => Boolean(skill.projectId)));
	let personalSkills = $derived(skills.filter((skill) => !skill.projectId));
	let visibleSkills = $derived.by(() => {
		const normalized = query.trim().toLowerCase();
		return skills.filter((skill) => {
			const matchesScope =
				scopeFilter === 'all' ||
				(scopeFilter === 'personal' && !skill.projectId) ||
				(scopeFilter === 'project' && Boolean(skill.projectId));
			const matchesProject =
				scopeFilter !== 'project' || !selectedProjectId || skill.projectId === selectedProjectId;
			const matchesQuery =
				!normalized ||
				`${skill.name} ${skill.description} ${skill.triggerPhrases.join(' ')}`
					.toLowerCase()
					.includes(normalized);
			return matchesScope && matchesProject && matchesQuery;
		});
	});

	function notify(message: string) {
		toast = message;
		setTimeout(() => {
			if (toast === message) toast = '';
		}, 2200);
	}

	async function responseMessage(response: Response, fallback: string) {
		const payload = await response.json().catch(() => null);
		return payload?.error?.message ?? fallback;
	}

	async function loadData() {
		const sequence = ++loadSequence;
		loading = true;
		loadingError = '';
		try {
			const [skillsResponse, projectsResponse, toolsResponse] = await Promise.all([
				fetch('/api/skills'),
				fetch('/api/projects'),
				fetch('/api/tools?projectId=skill-editor')
			]);
			if (!skillsResponse.ok)
				throw new Error(await responseMessage(skillsResponse, 'Could not load skills'));
			if (!projectsResponse.ok)
				throw new Error(await responseMessage(projectsResponse, 'Could not load projects'));
			if (!toolsResponse.ok)
				throw new Error(await responseMessage(toolsResponse, 'Could not load available tools'));
			const [skillsPayload, projectsPayload, toolsPayload] = await Promise.all([
				skillsResponse.json(),
				projectsResponse.json(),
				toolsResponse.json()
			]);
			if (sequence !== loadSequence) return;
			skills = Array.isArray(skillsPayload.skills) ? skillsPayload.skills : [];
			projects = Array.isArray(projectsPayload.projects) ? projectsPayload.projects : [];
			tools = Array.isArray(toolsPayload.tools) ? toolsPayload.tools : [];
		} catch (error) {
			if (sequence === loadSequence)
				loadingError = error instanceof Error ? error.message : 'Could not load skills';
		} finally {
			if (sequence === loadSequence) loading = false;
		}
	}

	function blankDraft(projectId: string | null = null): SkillDraft {
		return {
			name: '',
			description: '',
			instructions: '',
			projectId,
			enabledTools: projectId ? ['project_knowledge_search'] : [],
			triggerPhrases: []
		};
	}

	function openCreate(projectId: string | null = null) {
		captureFocus();
		editingSkill = null;
		draft = blankDraft(projectId);
		triggerDraft = '';
		formError = '';
		editorOpen = true;
		void focusModal('editor');
	}

	function openEdit(skill: Skill) {
		captureFocus();
		editingSkill = skill;
		draft = {
			name: skill.name,
			description: skill.description,
			instructions: skill.instructions,
			projectId: skill.projectId,
			enabledTools: [...skill.enabledTools],
			triggerPhrases: [...skill.triggerPhrases]
		};
		triggerDraft = '';
		formError = '';
		editorOpen = true;
		void focusModal('editor');
	}

	function openDuplicate(skill: Skill) {
		captureFocus();
		editingSkill = null;
		draft = {
			name: `${skill.name} copy`.slice(0, MAX_NAME),
			description: skill.description,
			instructions: skill.instructions,
			projectId: skill.projectId,
			enabledTools: [...skill.enabledTools],
			triggerPhrases: [...skill.triggerPhrases]
		};
		triggerDraft = '';
		formError = '';
		editorOpen = true;
		void focusModal('editor');
	}

	function closeEditor() {
		if (!saving && editorOpen) {
			editorOpen = false;
			restoreFocus();
		}
	}

	function captureFocus() {
		if (typeof document === 'undefined') return;
		restoreFocusTarget =
			document.activeElement instanceof HTMLElement ? document.activeElement : null;
	}

	function focusableElements(container: HTMLElement | undefined) {
		if (!container) return [];
		return Array.from(
			container.querySelectorAll<HTMLElement>(
				'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
			)
		);
	}

	async function focusModal(kind: 'editor' | 'confirm') {
		await tick();
		const modal = kind === 'editor' ? editorModal : confirmModal;
		const first =
			modal?.querySelector<HTMLElement>('[data-modal-primary]') ?? focusableElements(modal)[0];
		first?.focus();
	}

	function restoreFocus() {
		const target = restoreFocusTarget;
		restoreFocusTarget = null;
		if (target && document.contains(target)) target.focus();
	}

	function trapModalFocus(event: KeyboardEvent, kind: 'editor' | 'confirm') {
		if (event.key !== 'Tab') return;
		const modal = kind === 'editor' ? editorModal : confirmModal;
		const focusable = focusableElements(modal);
		if (focusable.length === 0) {
			event.preventDefault();
			return;
		}
		const first = focusable[0];
		const last = focusable[focusable.length - 1];
		if (event.shiftKey && document.activeElement === first) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault();
			first.focus();
		}
	}

	function openDelete(skill: Skill) {
		captureFocus();
		deletingSkill = skill;
		void focusModal('confirm');
	}

	function closeDelete() {
		if (!deleting) {
			deletingSkill = null;
			restoreFocus();
		}
	}

	function addTrigger() {
		const value = triggerDraft.trim().replace(/\s+/g, ' ');
		if (!value) return;
		if (value.length > MAX_TRIGGER_LENGTH) {
			formError = `Trigger phrases must be ${MAX_TRIGGER_LENGTH} characters or fewer.`;
			return;
		}
		if (draft.triggerPhrases.some((phrase) => phrase.toLowerCase() === value.toLowerCase())) {
			formError = 'Each trigger phrase must be unique.';
			return;
		}
		if (draft.triggerPhrases.length >= MAX_TRIGGERS) {
			formError = `Add up to ${MAX_TRIGGERS} trigger phrases.`;
			return;
		}
		draft.triggerPhrases = [...draft.triggerPhrases, value];
		triggerDraft = '';
		formError = '';
	}

	function removeTrigger(index: number) {
		draft.triggerPhrases = draft.triggerPhrases.filter((_, itemIndex) => itemIndex !== index);
		formError = '';
	}

	function toggleTool(name: string) {
		const tool = tools.find((item) => item.name === name);
		if (!tool || tool.readOnly || (tool.projectOnly && !draft.projectId)) return;
		if (draft.enabledTools.includes(name)) {
			draft.enabledTools = draft.enabledTools.filter((tool) => tool !== name);
		} else {
			draft.enabledTools = [...draft.enabledTools, name];
		}
	}

	function chooseProject(value: string) {
		draft.projectId = value || null;
		if (!draft.projectId) {
			draft.enabledTools = draft.enabledTools.filter(
				(name) => !tools.find((tool) => tool.name === name)?.projectOnly
			);
		}
	}

	async function saveSkill() {
		formError = '';
		const name = draft.name.trim();
		const description = draft.description.trim();
		const instructions = draft.instructions.trim();
		if (!name) {
			formError = 'Give this skill a name.';
			return;
		}
		if (!instructions) {
			formError = 'Add instructions so the skill knows how to help.';
			return;
		}
		if (triggerDraft.trim()) addTrigger();
		if (formError) return;
		saving = true;
		formError = '';
		const payload = {
			name,
			description,
			instructions,
			projectId: draft.projectId,
			enabledTools: draft.enabledTools,
			triggerPhrases: draft.triggerPhrases
		};
		try {
			const response = await fetch(
				editingSkill ? `/api/skills/${editingSkill.id}` : '/api/skills',
				{
					method: editingSkill ? 'PATCH' : 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify(payload)
				}
			);
			if (!response.ok) throw new Error(await responseMessage(response, 'Could not save skill'));
			const result = await response.json();
			const saved = result.skill as Skill | undefined;
			if (saved) {
				if (editingSkill) skills = skills.map((skill) => (skill.id === saved.id ? saved : skill));
				else skills = [saved, ...skills];
			}
			editorOpen = false;
			restoreFocus();
			notify(editingSkill ? 'Skill updated' : 'Skill created');
		} catch (error) {
			formError = error instanceof Error ? error.message : 'Could not save skill';
		} finally {
			saving = false;
		}
	}

	async function confirmDelete() {
		if (!deletingSkill) return;
		const target = deletingSkill;
		const targetId = target.id;
		deleting = true;
		try {
			const response = await fetch(`/api/skills/${targetId}`, { method: 'DELETE' });
			if (!response.ok) throw new Error(await responseMessage(response, 'Could not delete skill'));
			skills = skills.filter((skill) => skill.id !== targetId);
			notify('Skill deleted');
			deletingSkill = null;
			restoreFocus();
		} catch (error) {
			notify(error instanceof Error ? error.message : 'Could not delete skill');
		} finally {
			deleting = false;
		}
	}

	function scopeLabel(skill: Skill) {
		return skill.projectId
			? (projectNames.get(skill.projectId) ?? 'Project skill')
			: 'Personal skill';
	}

	function formatDate(iso: string) {
		if (!iso) return '';
		return new Date(iso).toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	async function logout() {
		await authClient.signOut();
		window.location.href = resolve('/login');
	}

	onMount(async () => {
		await loadData();
		if (page.url.searchParams.get('create') === '1') openCreate(initialProjectId || null);
	});
</script>

<svelte:head>
	<title>Skills · Mimin</title>
</svelte:head>

<div
	class="app-shell"
	class:sidebar-collapsed={sidebar.collapsed}
	class:mobile-open={sidebar.mobileOpen}
>
	<button
		class="sidebar-backdrop"
		onclick={() => sidebar.closeMobile()}
		aria-label="Close sidebar"
		tabindex="-1"
	></button>
	<aside class="sidebar">
		<div class="sidebar-top-row">
			<div class="brand">
				<span class="brand-mark"><Sparkles size={13} /></span><span>mimin</span><span
					class="brand-muted">/ workbench</span
				>
			</div>
			<button
				class="sidebar-toggle"
				onclick={() => sidebar.toggle()}
				title="Collapse sidebar"
				aria-label="Collapse sidebar"
			>
				<PanelLeft size={16} />
			</button>
		</div>
		<a class="new-chat" href={resolve('/chat?new=1')}><Plus size={16} /> New chat <kbd>⌘ K</kbd></a>
		<div class="sidebar-scroll">
			<div class="nav-label">Workspace</div>
			<a class="nav-item" href={resolve('/chat')}><MessageSquare size={16} /> Chat</a>
			<a class="nav-item" href={resolve('/projects')}><FolderKanban size={16} /> Projects</a>
			{#if user?.role === 'admin'}<a class="nav-item" href={resolve('/admin/users')}
					><User size={16} /> Users</a
				>{/if}
			<div class="nav-label projects-label">Preferences</div>
			<a class="nav-item" href={resolve('/settings')}><Settings size={16} /> Models</a>
			<a class="nav-item" href={resolve('/settings/instructions')}
				><FileText size={16} /> Instructions</a
			>
			<a class="nav-item active" href={resolve('/skills')}><WandSparkles size={16} /> Skills</a>
			<a class="nav-item" href={resolve('/settings/web-search')}><Globe size={16} /> Web Search</a>
			<a class="nav-item" href={resolve('/settings/browser-extension')}
				><Puzzle size={16} /> Browser Extension</a
			>
			<RecentChats />
		</div>
		<div class="sidebar-bottom">
			<div class="user-row">
				<span class="avatar">{user?.name?.[0]?.toUpperCase() ?? 'U'}</span>
				<div class="user-meta">
					<strong>{user?.name ?? 'User'}</strong><small>Personal workspace</small>
				</div>
				<button class="logout-btn" onclick={logout} title="Log out" aria-label="Log out"
					><LogOut size={15} /></button
				>
			</div>
		</div>
	</aside>

	<main class="main-content">
		<header class="topbar">
			<div class="topbar-left">
				<button
					class="sidebar-toggle topbar-toggle"
					onclick={() => sidebar.toggle()}
					title="Toggle sidebar"
					aria-label="Toggle sidebar"><PanelLeft size={16} /></button
				>
				<div class="breadcrumb"><strong>Skills</strong></div>
			</div>
			<div class="top-actions">
				<ThemeToggle /><span class="avatar avatar-top">{user?.name?.[0]?.toUpperCase() ?? 'U'}</span
				>
			</div>
		</header>

		<div class="skills-wrap">
			<div class="page-heading">
				<div>
					<h1>Skills</h1>
					<p>Specialized instructions and workflows for your assistant.</p>
				</div>
				<button class="button primary" onclick={() => openCreate(null)}
					><Plus size={16} /> New skill</button
				>
			</div>

			<div class="toolbar">
				<div class="scope-tabs" role="group" aria-label="Filter skills by scope">
					<button class:chosen={scopeFilter === 'all'} onclick={() => (scopeFilter = 'all')}
						>All <span>{skills.length}</span></button
					>
					<button
						class:chosen={scopeFilter === 'personal'}
						onclick={() => (scopeFilter = 'personal')}
						>Personal <span>{personalSkills.length}</span></button
					>
					<button class:chosen={scopeFilter === 'project'} onclick={() => (scopeFilter = 'project')}
						>Project <span>{projectSkills.length}</span></button
					>
				</div>
				<div class="toolbar-tools">
					{#if scopeFilter === 'project'}
						<label class="project-filter">
							<span class="sr-only">Filter by project</span>
							<select bind:value={selectedProjectId} aria-label="Filter by project">
								<option value="">All projects</option>
								{#each projects as project (project.id)}<option value={project.id}
										>{project.name}</option
									>{/each}
							</select><ChevronDown size={14} aria-hidden="true" />
						</label>
					{/if}
					<label class="search-field"
						><Search size={15} aria-hidden="true" /><span class="sr-only">Search skills</span><input
							bind:value={query}
							placeholder="Search skills..."
						/></label
					>
				</div>
			</div>

			{#if loading}
				<div class="empty-state" role="status">Loading skills...</div>
			{:else if loadingError}
				<div class="empty-state error-state" role="alert">
					<strong>Couldn’t load skills</strong><span>{loadingError}</span><button
						class="button"
						onclick={() => void loadData()}>Try again</button
					>
				</div>
			{:else if skills.length === 0}
				<div class="empty-state">
					No skills yet. Create your first skill to give your assistant reusable workflows.
				</div>
			{:else if visibleSkills.length === 0}
				<div class="empty-state">
					No skills match{query.trim() ? ` “${query}”` : ' this filter'}.
				</div>
			{/if}

			{#if !loading && !loadingError}
				<div class="skill-grid">
					{#each visibleSkills as skill (skill.id)}
						<article class="skill-card">
							<div class="card-top">
								<span class="card-icon"><WandSparkles size={18} /></span>
								<span class="scope-badge" class:project={Boolean(skill.projectId)}
									>{#if skill.projectId}<FolderKanban size={12} />{:else}<Sparkles
											size={12}
										/>{/if}{scopeLabel(skill)}</span
								>
							</div>
							<h2>{skill.name}</h2>
							<p class="skill-description">{skill.description || 'No description yet.'}</p>
							<div class="card-footer">
								<div class="card-meta">
									<span
										>{skill.enabledTools.length}
										{skill.enabledTools.length === 1 ? 'tool' : 'tools'}</span
									>
									<span>·</span>
									<span
										>{skill.triggerPhrases.length} trigger {skill.triggerPhrases.length === 1
											? 'phrase'
											: 'phrases'}</span
									>
								</div>
								{#if skill.triggerPhrases.length > 0}<div class="trigger-preview">
										“{skill.triggerPhrases[0]}”{#if skill.triggerPhrases.length > 1}<span
												>+{skill.triggerPhrases.length - 1}</span
											>{/if}
									</div>{/if}
								<span class="updated">Updated {formatDate(skill.updatedAt)}</span>
							</div>
							<div class="card-actions">
								<button class="button" onclick={() => openEdit(skill)}
									><FileText size={14} /> Edit</button
								><button
									class="icon-action"
									onclick={() => openDuplicate(skill)}
									aria-label={`Duplicate ${skill.name}`}
									title="Duplicate"><Plus size={16} /></button
								><button
									class="icon-action danger"
									onclick={() => openDelete(skill)}
									aria-label={`Delete ${skill.name}`}
									title="Delete"><Trash2 size={15} /></button
								>
							</div>
						</article>
					{/each}
					{#if !query.trim()}
						<button
							class="empty-card"
							onclick={() =>
								openCreate(
									scopeFilter === 'project' && selectedProjectId ? selectedProjectId : null
								)}
						>
							<Plus size={19} />
							<strong>Create a new skill</strong>
							<span>Save instructions and tools to reuse in chat</span>
						</button>
					{/if}
				</div>
			{/if}
		</div>
	</main>
</div>

{#if editorOpen}
	<div
		class="modal-backdrop"
		role="dialog"
		aria-modal="true"
		aria-labelledby="skill-editor-title"
		tabindex="-1"
		onclick={(event) => event.target === event.currentTarget && closeEditor()}
		onkeydown={(event) => {
			if (event.key === 'Escape') closeEditor();
			trapModalFocus(event, 'editor');
		}}
	>
		<form
			class="modal editor-modal"
			bind:this={editorModal}
			onsubmit={(event) => {
				event.preventDefault();
				void saveSkill();
			}}
		>
			<div class="modal-head">
				<div>
					<h2 id="skill-editor-title">{editingSkill ? 'Edit skill' : 'Create a skill'}</h2>
				</div>
				<button type="button" class="icon-button" onclick={closeEditor} aria-label="Close dialog"
					><X size={18} /></button
				>
			</div>
			<div class="editor-grid">
				<label class="field full"
					>Name <span class="field-count">{draft.name.length}/{MAX_NAME}</span><input
						bind:value={draft.name}
						data-modal-primary
						maxlength={MAX_NAME}
						required
						placeholder="e.g. Product strategist"
					/></label
				>
				<label class="field full"
					>Description <span class="field-count">{draft.description.length}/{MAX_DESCRIPTION}</span
					><input
						bind:value={draft.description}
						maxlength={MAX_DESCRIPTION}
						placeholder="A short note about when to use this skill"
					/></label
				>
				<label class="field full"
					>Scope<select
						value={draft.projectId ?? ''}
						onchange={(event) => chooseProject(event.currentTarget.value)}
						><option value="">Personal · available in every chat</option
						>{#each projects as project (project.id)}<option value={project.id}
								>Project · {project.name}</option
							>{/each}</select
					><small>Project skills are only available inside their project conversations.</small
					></label
				>
				<label class="field full"
					>Instructions <span class="field-count"
						>{draft.instructions.length.toLocaleString()}/{MAX_INSTRUCTIONS.toLocaleString()}</span
					><textarea
						bind:value={draft.instructions}
						maxlength={MAX_INSTRUCTIONS}
						rows="8"
						required
						placeholder="Describe the approach, tone, constraints, and output format this skill should use."
					></textarea></label
				>
			</div>
			<section class="tool-section">
				<div class="section-label-row">
					<div>
						<h3>Tools to make available</h3>
						<p>
							These tools replace the conversation’s configurable selection when the skill is
							activated.
						</p>
					</div>
					<span>{draft.enabledTools.length} selected</span>
				</div>
				<div class="tool-grid">
					{#each tools as tool (tool.name)}<label
							class="tool-option"
							class:disabled={tool.readOnly || (tool.projectOnly && !draft.projectId)}
							><input
								type="checkbox"
								checked={draft.enabledTools.includes(tool.name)}
								disabled={tool.readOnly || (tool.projectOnly && !draft.projectId)}
								onchange={() => toggleTool(tool.name)}
							/><span class="tool-copy"
								><strong>{tool.label}</strong><small>{tool.description}</small
								>{#if tool.readOnly}<em>{tool.settingHint ?? 'Configure this tool in settings.'}</em
									>{:else if tool.projectOnly && !draft.projectId}<em
										>Available for project skills.</em
									>{/if}</span
							></label
						>{/each}
				</div>
			</section>
			<section class="trigger-section">
				<div class="section-label-row">
					<div>
						<h3>Trigger phrases</h3>
						<p>Suggest this skill when a draft contains one of these phrases.</p>
					</div>
					<span>{draft.triggerPhrases.length}/{MAX_TRIGGERS}</span>
				</div>
				<div class="trigger-input">
					<input
						bind:value={triggerDraft}
						maxlength={MAX_TRIGGER_LENGTH}
						aria-label="Add a trigger phrase"
						placeholder="e.g. Plan this launch"
						onkeydown={(event) => {
							if (event.key === 'Enter') {
								event.preventDefault();
								addTrigger();
							}
						}}
					/><button
						type="button"
						class="button"
						onclick={addTrigger}
						disabled={draft.triggerPhrases.length >= MAX_TRIGGERS}><Plus size={14} /> Add</button
					>
				</div>
				{#if draft.triggerPhrases.length > 0}<div class="trigger-list">
						{#each draft.triggerPhrases as phrase, index (phrase)}<span class="trigger-chip"
								>{phrase}<button
									type="button"
									aria-label={`Remove ${phrase}`}
									onclick={() => removeTrigger(index)}><X size={12} /></button
								></span
							>{/each}
					</div>{/if}
			</section>
			{#if formError}<div class="form-error" role="alert"><Info size={15} /> {formError}</div>{/if}
			<div class="modal-actions">
				<button type="button" class="button" onclick={closeEditor} disabled={saving}>Cancel</button
				><button type="submit" class="button primary" disabled={saving}
					>{#if saving}Saving...{:else}<Check size={15} />
						{editingSkill ? 'Save changes' : 'Create skill'}{/if}</button
				>
			</div>
		</form>
	</div>
{/if}

{#if deletingSkill}
	<div
		class="modal-backdrop"
		role="presentation"
		tabindex="-1"
		onclick={(event) => !deleting && event.target === event.currentTarget && closeDelete()}
		onkeydown={(event) => {
			if (event.key === 'Escape' && !deleting) closeDelete();
		}}
	>
		<div
			class="modal confirm-modal"
			role="dialog"
			aria-modal="true"
			aria-labelledby="delete-skill-title"
			tabindex="-1"
			onkeydown={(event) => trapModalFocus(event, 'confirm')}
		>
			<div class="modal-head">
				<div>
					<h2 id="delete-skill-title">Delete skill?</h2>
				</div>
				<button
					class="icon-button"
					onclick={closeDelete}
					disabled={deleting}
					aria-label="Close dialog"><X size={18} /></button
				>
			</div>
			<p class="modal-text">
				Delete <strong>“{deletingSkill.name}”</strong>? Existing conversation turns keep their saved
				instructions, while future activations will no longer find this skill.
			</p>
			<div class="modal-actions">
				<button class="button" onclick={closeDelete} disabled={deleting} data-modal-primary
					>Keep skill</button
				><button class="button danger" onclick={() => void confirmDelete()} disabled={deleting}
					>{deleting ? 'Deleting...' : 'Delete skill'}</button
				>
			</div>
		</div>
	</div>
{/if}

{#if toast}<div class="toast" role="status" aria-live="polite">{toast}</div>{/if}

<svelte:window
	onkeydown={(event) => {
		if (event.key === 'Escape') {
			if (editorOpen) closeEditor();
			else if (deletingSkill && !deleting) closeDelete();
		}
	}}
/>

<style>
	.skills-wrap {
		max-width: 1050px;
		margin: auto;
		padding: clamp(32px, 6vh, 56px) 35px 75px;
	}
	.page-heading {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		border-bottom: 1px solid var(--border);
		padding-bottom: 30px;
	}
	.page-heading h1 {
		margin: 0 0 6px;
		font-family: var(--font-body);
		font-size: var(--text-2xl);
		font-weight: 600;
		line-height: 1.2;
		letter-spacing: -0.025em;
		color: var(--text-strong);
	}
	.page-heading p {
		margin: 0;
		color: var(--text-muted);
		font-size: var(--text-sm);
		line-height: 1.5;
	}
	.button {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		min-height: 38px;
		padding: 8px 13px;
		border-radius: 6px;
		border: 1px solid var(--border-strong);
		background: var(--surface);
		color: var(--text-body);
		font-family: var(--font-body);
		font-size: var(--text-sm);
		font-weight: 500;
		transition: 0.18s ease;
	}
	.button:hover:not(:disabled) {
		color: var(--text-strong);
		background: var(--surface-hover);
		border-color: var(--text-dim);
	}
	.button.primary {
		color: var(--accent-fg);
		background: var(--accent-bg);
		border-color: var(--accent-bg);
	}
	.button.primary:hover:not(:disabled) {
		background: var(--accent-bg-hover);
		border-color: var(--accent-bg-hover);
	}
	.button.danger {
		color: var(--danger-text);
		border-color: color-mix(in srgb, var(--danger-text) 30%, transparent);
		background: transparent;
	}
	.button.danger:hover:not(:disabled) {
		color: var(--danger-text);
		border-color: var(--danger-text);
		background: color-mix(in srgb, var(--danger-text) 10%, transparent);
	}
	.button:disabled {
		opacity: 0.6;
		cursor: wait;
	}
	.toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 20px 0;
		color: var(--text-dim);
		font-size: var(--text-sm);
	}
	.scope-tabs {
		display: flex;
		align-items: center;
		gap: 3px;
		padding: 3px;
		background: var(--surface-2);
		border: 1px solid var(--border);
		border-radius: 7px;
	}
	.scope-tabs button {
		min-height: 30px;
		padding: 5px 10px;
		color: var(--text-muted);
		background: transparent;
		border: 0;
		border-radius: 5px;
		font-size: var(--text-xs);
		font-weight: 500;
		transition: 0.15s ease;
	}
	.scope-tabs button:hover {
		color: var(--text-strong);
	}
	.scope-tabs button.chosen {
		color: var(--text-strong);
		background: var(--surface);
		box-shadow: 0 1px 3px var(--shadow-soft);
	}
	.scope-tabs span {
		margin-left: 4px;
		color: var(--text-faint);
		font-size: 10px;
		font-variant-numeric: tabular-nums;
	}
	.toolbar-tools {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.search-field,
	.project-filter {
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 38px;
		color: var(--text-dim);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 6px;
	}
	.search-field {
		width: 220px;
		padding: 7px 10px;
	}
	.search-field input,
	.project-filter select {
		min-width: 0;
		color: var(--text-strong);
		font-family: var(--font-body);
		background: transparent;
		border: 0;
		outline: 0;
		font-size: var(--text-sm);
	}
	.search-field input {
		width: 100%;
	}
	.project-filter {
		position: relative;
		padding: 0 9px;
	}
	.project-filter select {
		appearance: none;
		padding: 8px 22px 8px 2px;
		cursor: pointer;
	}
	:global(.project-filter svg) {
		position: absolute;
		right: 8px;
		pointer-events: none;
	}
	.search-field:focus-within,
	.project-filter:focus-within {
		border-color: var(--focus);
	}
	.skill-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 13px;
	}
	.skill-card,
	.empty-card {
		min-height: 220px;
		padding: 18px;
		text-align: left;
		border: 1px solid var(--border);
		border-radius: 10px;
		background: var(--surface);
		transition: 0.18s ease;
		text-decoration: none;
		color: inherit;
	}
	.skill-card {
		display: flex;
		flex-direction: column;
	}
	.skill-card:hover {
		border-color: var(--text-dim);
		box-shadow: 0 8px 22px var(--shadow-soft);
		transform: translateY(-2px);
	}
	.card-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}
	.card-icon {
		display: grid;
		place-items: center;
		width: 36px;
		height: 36px;
		border-radius: 8px;
		background: var(--surface-2);
		border: 1px solid var(--border);
		color: var(--text-strong);
	}
	.scope-badge {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 3px 8px;
		border-radius: 4px;
		background: var(--surface-2);
		border: 1px solid var(--border);
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-weight: 500;
		white-space: nowrap;
	}
	.scope-badge.project {
		color: var(--status-working-text);
		border-color: color-mix(in srgb, var(--status-working-text) 25%, var(--border));
	}
	.skill-card h2 {
		margin: 14px 0 6px;
		font-family: var(--font-body);
		font-size: var(--text-base);
		font-weight: 600;
		color: var(--text-strong);
	}
	.skill-description {
		margin: 0 0 14px;
		font-size: var(--text-sm);
		color: var(--text-muted);
		line-height: 1.5;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.card-footer {
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-size: var(--text-xs);
		color: var(--text-dim);
	}
	.card-meta {
		display: flex;
		align-items: center;
		gap: 6px;
		color: var(--text-dim);
		font-size: var(--text-xs);
	}
	.trigger-preview {
		display: flex;
		align-items: center;
		gap: 7px;
		min-width: 0;
		overflow: hidden;
		color: var(--text-body);
		font-size: var(--text-xs);
		font-style: italic;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
	.trigger-preview span {
		flex: 0 0 auto;
		color: var(--text-faint);
		font-style: normal;
	}
	.updated {
		color: var(--text-dim);
		font-size: var(--text-xs);
	}
	.card-actions {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-top: auto;
		padding-top: 14px;
		border-top: 1px solid var(--border);
	}
	.card-actions .button {
		min-height: 32px;
		padding: 6px 10px;
		font-size: var(--text-xs);
	}
	.icon-action,
	.icon-button {
		display: grid;
		place-items: center;
		width: 32px;
		height: 32px;
		padding: 0;
		color: var(--text-muted);
		background: transparent;
		border: 0;
		border-radius: 5px;
		transition: 0.15s ease;
	}
	.icon-action {
		border: 1px solid var(--border);
	}
	.icon-action + .icon-action {
		margin-left: 0;
	}
	.icon-action:hover {
		color: var(--text-strong);
		background: var(--surface-hover);
	}
	.icon-action.danger:hover {
		color: var(--danger-text);
		background: color-mix(in srgb, var(--danger-text) 10%, transparent);
	}
	.empty-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 8px;
		color: var(--text-muted);
		border-style: dashed;
		background: transparent;
		cursor: pointer;
	}
	.empty-card:hover {
		border-color: var(--text-dim);
		background: var(--surface-hover);
	}
	.empty-card strong {
		color: var(--text-strong);
		font-size: var(--text-sm);
		font-weight: 500;
	}
	.empty-card span {
		font-size: var(--text-xs);
		color: var(--text-dim);
	}
	.empty-state {
		text-align: center;
		color: var(--text-dim);
		font-size: var(--text-sm);
		padding: 40px 0;
		line-height: 1.5;
	}
	.error-state strong,
	.error-state span,
	.error-state .button {
		display: block;
		margin: 0 auto;
	}
	.error-state strong {
		color: var(--text-strong);
		font-weight: 600;
	}
	.error-state span {
		margin-top: 5px;
	}
	.error-state .button {
		margin-top: 15px;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
	.modal-backdrop {
		position: fixed;
		inset: 0;
		z-index: 40;
		display: grid;
		place-items: center;
		padding: 20px;
		background: var(--overlay);
	}
	.modal {
		width: min(660px, 100%);
		max-height: min(850px, calc(100dvh - 40px));
		overflow: auto;
		padding: 24px;
		color: var(--text);
		background: var(--surface);
		border: 1px solid var(--border-strong);
		border-radius: 12px;
		box-shadow: 0 20px 50px var(--shadow);
	}
	.confirm-modal {
		width: min(470px, 100%);
	}
	.modal-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 16px;
	}
	.modal h2 {
		margin: 0;
		color: var(--text-strong);
		font-family: var(--font-body);
		font-size: var(--text-lg);
		font-weight: 600;
		line-height: 1.3;
		letter-spacing: -0.015em;
	}
	.editor-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 15px;
		margin-top: 20px;
	}
	.field {
		display: block;
		min-width: 0;
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-weight: 550;
	}
	.field.full {
		grid-column: 1 / -1;
	}
	.field-count {
		float: right;
		color: var(--text-faint);
		font-size: 10px;
		font-variant-numeric: tabular-nums;
		font-weight: 450;
	}
	.field input,
	.field textarea,
	.field select {
		display: block;
		width: 100%;
		margin-top: 6px;
		padding: 9px 11px;
		color: var(--text-strong);
		background: var(--surface-subtle);
		border: 1px solid var(--input-border);
		border-radius: 6px;
		outline: 0;
		font-size: var(--text-sm);
		line-height: 1.45;
	}
	.field textarea {
		min-height: 150px;
		resize: vertical;
		line-height: 1.6;
	}
	.field select {
		appearance: auto;
	}
	.field input:focus,
	.field textarea:focus,
	.field select:focus {
		border-color: var(--focus);
		box-shadow: 0 0 0 2px color-mix(in srgb, var(--focus) 17%, transparent);
	}
	.field small {
		display: block;
		margin-top: 5px;
		color: var(--text-dim);
		font-size: 10px;
		font-weight: 450;
	}
	.tool-section,
	.trigger-section {
		margin-top: 22px;
		padding-top: 18px;
		border-top: 1px solid var(--border);
	}
	.section-label-row {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 15px;
	}
	.section-label-row h3 {
		margin: 0 0 3px;
		color: var(--text-strong);
		font-size: var(--text-sm);
		font-weight: 650;
	}
	.section-label-row p {
		margin: 0;
		color: var(--text-muted);
		font-size: var(--text-xs);
		line-height: 1.4;
	}
	.section-label-row > span {
		flex: 0 0 auto;
		color: var(--text-faint);
		font-size: 10px;
	}
	.tool-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
		margin-top: 12px;
	}
	.tool-option {
		display: flex;
		align-items: flex-start;
		gap: 9px;
		min-height: 66px;
		padding: 10px;
		background: var(--surface-subtle);
		border: 1px solid var(--border);
		border-radius: 7px;
		cursor: pointer;
		transition: 0.15s ease;
	}
	.tool-option:hover:not(.disabled) {
		border-color: var(--border-strong);
		background: var(--surface-2);
	}
	.tool-option.disabled {
		cursor: not-allowed;
		opacity: 0.55;
	}
	.tool-option input {
		flex: 0 0 auto;
		width: 15px;
		height: 15px;
		margin: 2px 0 0;
		accent-color: var(--accent-bg);
	}
	.tool-copy {
		min-width: 0;
	}
	.tool-copy strong,
	.tool-copy small,
	.tool-copy em {
		display: block;
	}
	.tool-copy strong {
		color: var(--text-body);
		font-size: var(--text-xs);
		font-weight: 600;
	}
	.tool-copy small {
		margin-top: 2px;
		color: var(--text-dim);
		font-size: 10px;
		line-height: 1.35;
	}
	.tool-copy em {
		margin-top: 3px;
		color: var(--status-working-text);
		font-size: 10px;
		font-style: normal;
		line-height: 1.3;
	}
	.trigger-input {
		display: flex;
		gap: 8px;
		margin-top: 12px;
	}
	.trigger-input input {
		min-width: 0;
		flex: 1;
		padding: 9px 11px;
		color: var(--text-strong);
		background: var(--surface-subtle);
		border: 1px solid var(--input-border);
		border-radius: 6px;
		outline: 0;
		font-size: var(--text-sm);
	}
	.trigger-input input:focus {
		border-color: var(--focus);
	}
	.trigger-list {
		display: flex;
		flex-wrap: wrap;
		gap: 7px;
		margin-top: 10px;
	}
	.trigger-chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		max-width: 100%;
		padding: 5px 7px 5px 9px;
		color: var(--text-body);
		background: var(--surface-2);
		border: 1px solid var(--border);
		border-radius: 5px;
		font-size: var(--text-xs);
	}
	.trigger-chip button {
		display: grid;
		place-items: center;
		width: 17px;
		height: 17px;
		padding: 0;
		color: var(--text-dim);
		background: transparent;
		border: 0;
		border-radius: 3px;
	}
	.trigger-chip button:hover {
		color: var(--danger-text);
		background: var(--surface-hover);
	}
	.form-error {
		display: flex;
		align-items: flex-start;
		gap: 7px;
		margin-top: 16px;
		padding: 10px 12px;
		color: var(--danger-text);
		background: color-mix(in srgb, var(--danger-text) 8%, var(--surface));
		border: 1px solid color-mix(in srgb, var(--danger-text) 25%, var(--border));
		border-radius: 6px;
		font-size: var(--text-xs);
		line-height: 1.45;
	}
	.modal-text {
		margin: 18px 0 0;
		color: var(--text-body);
		font-size: var(--text-sm);
		line-height: 1.6;
	}
	.modal-actions {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		margin-top: 22px;
	}
	.toast {
		position: fixed;
		right: 24px;
		bottom: 24px;
		z-index: 70;
		padding: 10px 14px;
		color: var(--accent-fg);
		background: var(--accent-bg);
		border-radius: 6px;
		box-shadow: 0 8px 24px var(--shadow);
		font-size: var(--text-sm);
		font-weight: 550;
	}
	@media (max-width: 850px) {
		.skill-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	@media (max-width: 720px) {
		.skills-wrap {
			padding: 28px 18px 60px;
		}
		.page-heading {
			align-items: flex-start;
			flex-direction: column;
			gap: 20px;
		}
		.page-heading > .button {
			width: 100%;
		}
		.toolbar {
			align-items: stretch;
			flex-direction: column;
		}
		.toolbar-tools {
			align-items: stretch;
			flex-direction: column;
		}
		.search-field {
			width: 100%;
		}
		.project-filter {
			width: 100%;
		}
		.project-filter select {
			width: 100%;
		}
	}
	@media (max-width: 560px) {
		.skill-grid {
			grid-template-columns: 1fr;
		}
		.scope-tabs {
			width: 100%;
		}
		.scope-tabs button {
			flex: 1;
		}
		.editor-grid,
		.tool-grid {
			grid-template-columns: 1fr;
		}
		.field.full {
			grid-column: auto;
		}
		.modal {
			padding: 19px;
		}
	}
</style>
