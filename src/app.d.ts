// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { AuthSession, AuthUser } from '$lib/server/auth';

declare global {
	namespace App {
		interface Locals {
			user: AuthUser | null;
			session: AuthSession | null;
		}
		// interface Error {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
