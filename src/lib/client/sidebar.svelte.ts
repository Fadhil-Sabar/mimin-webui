class SidebarState {
	collapsed = $state(false);

	constructor() {
		if (typeof window !== 'undefined') {
			const saved = localStorage.getItem('mimin_sidebar_collapsed');
			if (saved !== null) {
				this.collapsed = saved === 'true';
			}
		}
	}

	toggle() {
		this.collapsed = !this.collapsed;
		if (typeof window !== 'undefined') {
			localStorage.setItem('mimin_sidebar_collapsed', String(this.collapsed));
		}
	}

	setCollapsed(value: boolean) {
		this.collapsed = value;
		if (typeof window !== 'undefined') {
			localStorage.setItem('mimin_sidebar_collapsed', String(value));
		}
	}
}

export const sidebar = new SidebarState();
