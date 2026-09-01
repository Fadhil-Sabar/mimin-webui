<script lang="ts">
	import {
		Archive,
		ArrowUpRight,
		Bot,
		ChevronDown,
		Ellipsis,
		FileCode2,
		FileJson2,
		FileText,
		FolderKanban,
		LayoutGrid,
		MessageSquare,
		MoreHorizontal,
		Plus,
		Search,
		Settings2,
		Sparkles,
		Upload,
		Users,
		X
	} from '@lucide/svelte';

	let activeNav = $state('Projects');
	let showNewProject = $state(false);
	let search = $state('');
	let toastMessage = $state('');

	const projects = [
		{ name: 'Mimin Coding Agent', description: 'Lightweight multi-agent coding system', files: 4, updated: 'Today', selected: true },
		{ name: 'Personal knowledge', description: 'Notes and references', files: 18, updated: 'Yesterday', selected: false },
		{ name: 'Website redesign', description: 'Solace web experience', files: 7, updated: 'Aug 28', selected: false }
	];

	const conversations = [
		{ title: 'Design the agent loop', meta: 'GPT-5.6 Sol · 18 messages', date: 'Today' },
		{ title: 'Review tool permissions', meta: 'GPT-5.6 Sol · 32 messages', date: 'Yesterday' },
		{ title: 'Plan repository structure', meta: 'GPT-5.6 Sol · 11 messages', date: 'Aug 29' },
		{ title: 'Compare orchestration patterns', meta: 'GPT-5.6 Sol · 24 messages', date: 'Aug 27' }
	];

	const files = [
		{ name: 'README.md', type: 'Markdown document', size: '18 KB', date: 'Today', icon: FileText },
		{ name: 'Architecture.md', type: 'Markdown document', size: '9 KB', date: 'Yesterday', icon: FileText },
		{ name: 'requirements.pdf', type: 'PDF document', size: '1.2 MB', date: 'Aug 28', icon: FileText },
		{ name: 'api-spec.json', type: 'JSON document', size: '32 KB', date: 'Aug 25', icon: FileJson2 }
	];

	function notify(message: string) {
		toastMessage = message;
		setTimeout(() => (toastMessage = ''), 1800);
	}
</script>

<svelte:head>
	<title>Mimin WebUI | Project Overview</title>
	<meta name="description" content="A minimal workspace for AI coding agents." />
</svelte:head>

<div class="app-shell">
	<aside class="sidebar">
		<div class="brand"><span class="brand-mark"><Sparkles size={13} /></span><span>solace</span><span class="brand-muted">/ agent</span></div>
		<button class="new-chat" onclick={() => notify('New chat ready')}><Plus size={16} /> New chat <kbd>⌘ K</kbd></button>
		<div class="nav-label">Workspace</div>
		<button class:active={activeNav === 'Chat'} class="nav-item" onclick={() => (activeNav = 'Chat')}><MessageSquare size={16} /> Chat <span class="nav-count">12</span></button>
		<button class:active={activeNav === 'Projects'} class="nav-item" onclick={() => (activeNav = 'Projects')}><FolderKanban size={16} /> Projects <span class="nav-count">3</span></button>
		<div class="nav-label projects-label">Your projects</div>
		{#each projects as project}
			<button class:active-project={project.selected} class="project-item" onclick={() => notify(`${project.name} selected`)}>
				<span class="project-dot"></span>{project.name}
			</button>
		{/each}
		<div class="sidebar-bottom">
			<button class="nav-item"><Settings2 size={16} /> Settings</button>
			<div class="user-row"><span class="avatar">F</span><span><strong>Fadhil</strong><small>Personal workspace</small></span><MoreHorizontal size={16} /></div>
		</div>
	</aside>

	<main class="main-content">
		<header class="topbar"><div class="breadcrumb"><span>Projects</span><ChevronDown size={14} /><strong>Mimin Coding Agent</strong></div><div class="top-actions"><button class="icon-button" aria-label="Search" onclick={() => notify('Search opened')}><Search size={17} /></button><button class="avatar avatar-top">F</button></div></header>
		<div class="page-wrap">
			<div class="eyebrow">PROJECT OVERVIEW</div>
			<section class="hero">
				<div><div class="title-row"><div class="project-symbol"><Bot size={22} /></div><div><h1>Mimin Coding Agent</h1><p>Development workspace for designing and building a lightweight multi-agent coding system.</p></div></div></div>
				<div class="hero-actions"><button class="button secondary" onclick={() => notify('Edit project opened')}><Settings2 size={15} /> Edit project</button><button class="button primary" onclick={() => notify('Project chat started')}><MessageSquare size={15} /> Start chat <ArrowUpRight size={14} /></button></div>
			</section>
			<div class="stats"><div><strong>4</strong><span>Knowledge files</span></div><div><strong>12</strong><span>Conversations</span></div><div><strong>Today</strong><span>Last updated</span></div><div class="context"><span class="status-dot"></span><span>Project context active</span></div></div>

			<section class="section-block"><div class="section-heading"><div><h2>Knowledge</h2><p>Files available to the agent in this project.</p></div><button class="button secondary" onclick={() => notify('File picker opened')}><Upload size={15} /> Add files</button></div><button class="upload-zone" onclick={() => notify('File picker opened')}><Upload size={18} /><span><strong>Drop files here or browse</strong><small>PDF, Markdown, JSON, TXT · up to 25 MB</small></span></button><div class="file-list">{#each files as file}<div class="file-row"><div class="file-icon"><file.icon size={16} /></div><div class="file-name"><strong>{file.name}</strong><small>{file.type}</small></div><span class="muted desktop-only">{file.size}</span><span class="muted desktop-only">{file.date}</span><button class="row-menu" aria-label={`Actions for ${file.name}`} onclick={() => notify('File actions opened')}><Ellipsis size={17} /></button></div>{/each}</div></section>

			<section class="section-block conversations"><div class="section-heading"><div><h2>Conversations</h2><p>Continue work from previous project sessions.</p></div><button class="button primary" onclick={() => notify('New project chat started')}><Plus size={15} /> New chat</button></div><div class="conversation-list">{#each conversations.filter((item) => item.title.toLowerCase().includes(search.toLowerCase())) as conversation}<button class="conversation-row" onclick={() => notify(`Opening ${conversation.title}`)}><div class="conversation-icon"><MessageSquare size={16} /></div><div class="conversation-name"><strong>{conversation.title}</strong><small>{conversation.meta}</small></div><span class="muted">{conversation.date}</span><ArrowUpRight class="open-arrow" size={16} /></button>{/each}</div></section>
			<div class="context-note"><Sparkles size={16} /><span><strong>Project context is active.</strong> Sol will use these 4 files automatically in new project conversations.</span><button aria-label="Dismiss" onclick={(event) => (event.currentTarget.parentElement!.style.display = 'none')}><X size={15} /></button></div>
		</div>
	</main>
</div>

{#if showNewProject}<div class="modal-backdrop" role="presentation" onclick={(event) => event.target === event.currentTarget && (showNewProject = false)}><div class="modal"><div class="modal-head"><div><div class="eyebrow">NEW WORKSPACE</div><h2>Create a project</h2></div><button class="icon-button" onclick={() => (showNewProject = false)}><X size={17} /></button></div><label>Project name<input placeholder="e.g. Product launch" /></label><label>Description<textarea placeholder="What will you work on here?"></textarea></label><div class="modal-actions"><button class="button secondary" onclick={() => (showNewProject = false)}>Cancel</button><button class="button primary" onclick={() => { showNewProject = false; notify('Project created'); }}>Create project</button></div></div></div>{/if}
{#if toastMessage}<div class="toast">{toastMessage}</div>{/if}
