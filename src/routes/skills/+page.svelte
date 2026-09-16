<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { toast } from 'svelte-sonner';
	import {
		FileText,
		FolderKanban,
		Globe,
		LogOut,
		MessageSquare,
		PanelLeft,
		Plus,
		Puzzle,
		Settings,
		Sparkles,
		User,
		WandSparkles
	} from '@lucide/svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import RecentChats from '$lib/components/RecentChats.svelte';
	import SidebarBackdrop from '$lib/components/SidebarBackdrop.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { authClient } from '$lib/client/auth';
	import { sidebar } from '$lib/client/sidebar.svelte';
	import ConfirmDeleteDialog from './ConfirmDeleteDialog.svelte';
	import SkillEditorModal from './SkillEditorModal.svelte';
	import SkillGrid from './SkillGrid.svelte';
	import SkillsEmptyState from './SkillsEmptyState.svelte';
	import SkillsToolbar from './SkillsToolbar.svelte';
	import { MAX_NAME, MAX_TRIGGER_LENGTH, MAX_TRIGGERS } from './skills-constants';
	import type { Project, ScopeFilter, Skill, SkillDraft, Tool } from './skills-types';

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
	let editorOpen = $state(false);
	let editingSkill = $state<Skill | null>(null);
	let deletingSkill = $state<Skill | null>(null);
	let saving = $state(false);
	let deleting = $state(false);
	let triggerDraft = $state('');
	let formError = $state('');
	let loadSequence = 0;
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
				fetch('/api/tools?includeProjectTools=true')
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

	function restoreFocus() {
		const target = restoreFocusTarget;
		restoreFocusTarget = null;
		if (target && document.contains(target)) target.focus();
	}

	function openDelete(skill: Skill) {
		captureFocus();
		deletingSkill = skill;
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
			toast(editingSkill ? 'Skill updated' : 'Skill created');
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
			toast('Skill deleted');
			deletingSkill = null;
			restoreFocus();
		} catch (error) {
			toast(error instanceof Error ? error.message : 'Could not delete skill');
		} finally {
			deleting = false;
		}
	}

	function scopeLabel(skill: Skill) {
		return skill.projectId
			? (projectNames.get(skill.projectId) ?? 'Project skill')
			: 'Personal skill';
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
	<SidebarBackdrop />
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
				<Button variant="default" class="page-heading-action" onclick={() => openCreate(null)}
					><Plus size={16} /> New skill</Button
				>
			</div>

			<SkillsToolbar
				{scopeFilter}
				allCount={skills.length}
				personalCount={personalSkills.length}
				projectCount={projectSkills.length}
				{projects}
				bind:selectedProjectId
				bind:query
				onselectscope={(filter) => (scopeFilter = filter)}
			/>

			<SkillsEmptyState
				{loading}
				error={loadingError}
				{query}
				skillCount={skills.length}
				visibleCount={visibleSkills.length}
				onretry={() => void loadData()}
			/>

			{#if !loading && !loadingError}
				<SkillGrid
					skills={visibleSkills}
					{scopeLabel}
					showCreateCard={!query.trim()}
					oncreate={() =>
						openCreate(scopeFilter === 'project' && selectedProjectId ? selectedProjectId : null)}
					onedit={openEdit}
					onduplicate={openDuplicate}
					ondelete={openDelete}
				/>
			{/if}
		</div>
	</main>
</div>

{#if editorOpen}
	<SkillEditorModal
		skill={editingSkill}
		bind:name={draft.name}
		bind:description={draft.description}
		bind:instructions={draft.instructions}
		triggerPhrases={draft.triggerPhrases}
		bind:triggerDraft
		projectId={draft.projectId}
		{projects}
		{tools}
		enabledTools={draft.enabledTools}
		{saving}
		{formError}
		onsave={saveSkill}
		onclose={closeEditor}
		ontoggletool={toggleTool}
		onchooseproject={chooseProject}
		onaddtrigger={addTrigger}
		onremovetrigger={removeTrigger}
	/>
{/if}

{#if deletingSkill}
	<ConfirmDeleteDialog
		skill={deletingSkill}
		{deleting}
		onclose={closeDelete}
		onconfirm={() => void confirmDelete()}
	/>
{/if}

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
	@media (max-width: 720px) {
		.skills-wrap {
			padding: 28px 18px 60px;
		}
		.page-heading {
			align-items: flex-start;
			flex-direction: column;
			gap: 20px;
		}
		.page-heading > :global(.page-heading-action) {
			width: 100%;
		}
	}
</style>
