<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { toast } from 'svelte-sonner';
	import { Plus } from '@lucide/svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import Topbar from '$lib/components/Topbar.svelte';
	import Page from '$lib/components/Page.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import SkillEditorModal from './SkillEditorModal.svelte';
	import SkillGrid from './SkillGrid.svelte';
	import SkillsEmptyState from './SkillsEmptyState.svelte';
	import SkillsToolbar from './SkillsToolbar.svelte';
	import { MAX_NAME, MAX_TRIGGER_LENGTH, MAX_TRIGGERS } from './skills-constants';
	import type { Project, ScopeFilter, Skill, SkillDraft, Tool } from './skills-types';

	const initialProjectId = page.url.searchParams.get('projectId') ?? '';

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
	let discardOpen = $state(false);
	let editorBaseline = $state('');
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

	/** Serialised draft, so "did the user change anything?" is one comparison. */
	function snapshotDraft() {
		return JSON.stringify({
			name: draft.name,
			description: draft.description,
			instructions: draft.instructions,
			projectId: draft.projectId,
			enabledTools: [...draft.enabledTools].sort(),
			triggerPhrases: draft.triggerPhrases,
			triggerDraft
		});
	}

	let editorDirty = $derived(editorOpen && snapshotDraft() !== editorBaseline);

	function openCreate(projectId: string | null = null) {
		captureFocus();
		editingSkill = null;
		draft = blankDraft(projectId);
		triggerDraft = '';
		formError = '';
		discardOpen = false;
		editorBaseline = snapshotDraft();
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
		discardOpen = false;
		editorBaseline = snapshotDraft();
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
		discardOpen = false;
		editorBaseline = snapshotDraft();
		editorOpen = true;
	}

	function closeEditor() {
		if (!saving && editorOpen) {
			editorOpen = false;
			discardOpen = false;
			restoreFocus();
		}
	}

	/** X, Cancel, Escape and outside clicks all land here, so the discard warning
	 * is asked once instead of at every exit. */
	function requestCloseEditor() {
		if (saving || !editorOpen) return;
		// A second close request while the prompt is up (Escape can reach both
		// dialogs) must not throw the edits away on its way out.
		if (discardOpen) return;
		if (editorDirty) {
			discardOpen = true;
			return;
		}
		closeEditor();
	}

	function confirmDiscard() {
		discardOpen = false;
		closeEditor();
	}

	function cancelDiscard() {
		discardOpen = false;
	}

	/** The grid's create card used the active project scope; keep that convenience
	 * on the empty state now that the card is gone. */
	function openCreateFromContext() {
		openCreate(scopeFilter === 'project' && selectedProjectId ? selectedProjectId : null);
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

	onMount(async () => {
		await loadData();
		if (page.url.searchParams.get('create') === '1') openCreate(initialProjectId || null);
	});
</script>

<svelte:head>
	<title>Skills · Mimin</title>
</svelte:head>

<Topbar />

<Page width="wide">
	<header
		class="flex flex-col gap-4 min-[760px]:flex-row min-[760px]:items-end min-[760px]:justify-between"
	>
		<div class="min-w-0">
			<h1 class="md-headline-lg m-0 text-[var(--text-strong)]">Skills</h1>
			<p class="md-body-lg mt-1.5 mb-0 text-[var(--text-muted)]">
				Reusable instructions for the way you work.
			</p>
		</div>
		<Button variant="default" class="shrink-0" onclick={() => openCreate(null)}
			><Plus size={16} /> New skill</Button
		>
	</header>

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
		oncreate={openCreateFromContext}
	/>

	{#if !loading && !loadingError}
		<SkillGrid
			skills={visibleSkills}
			{scopeLabel}
			onedit={openEdit}
			onduplicate={openDuplicate}
			ondelete={openDelete}
		/>
	{/if}
</Page>

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
		onclose={requestCloseEditor}
		ontoggletool={toggleTool}
		onchooseproject={chooseProject}
		onaddtrigger={addTrigger}
		onremovetrigger={removeTrigger}
	/>
{/if}

{#if discardOpen}
	<ConfirmDialog
		open={true}
		title="Discard changes?"
		confirmLabel="Discard changes"
		cancelLabel="Keep editing"
		onconfirm={confirmDiscard}
		oncancel={cancelDiscard}
	>
		{#snippet description()}
			Your unsaved edits to this skill will be lost.
		{/snippet}
	</ConfirmDialog>
{/if}

{#if deletingSkill}
	<ConfirmDialog
		open={true}
		title="Delete skill?"
		confirmLabel="Delete skill"
		cancelLabel="Keep skill"
		loading={deleting}
		onconfirm={confirmDelete}
		oncancel={closeDelete}
	>
		{#snippet description()}
			Delete <strong>&ldquo;{deletingSkill?.name}&rdquo;</strong>? Existing conversation turns keep
			their saved instructions, while future activations will no longer find this skill.
		{/snippet}
	</ConfirmDialog>
{/if}

<svelte:window
	onkeydown={(event) => {
		// The dialog primitives own Escape for their own layer stack, so the editor
		// and the discard prompt are deliberately left out of this handler: a second
		// Escape here would re-open the prompt it just closed.
		if (event.key !== 'Escape' || editorOpen) return;
		if (deletingSkill && !deleting) closeDelete();
	}}
/>
