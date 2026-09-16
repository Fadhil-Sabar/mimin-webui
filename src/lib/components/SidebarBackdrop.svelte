<script lang="ts">
	import { sidebar } from '$lib/client/sidebar.svelte';
</script>

<!--
	Mobile-only scrim for the off-canvas sidebar. Visibility is driven entirely by
	the global `.sidebar-backdrop` rules in layout.css (shown under 760px when
	`.app-shell.mobile-open` is set), so this replaces the identical copy that used
	to live in every route.
-->
<button
	class="sidebar-backdrop"
	onclick={() => sidebar.closeMobile()}
	aria-label="Close sidebar"
	tabindex={-1}
></button>
