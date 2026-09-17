import { type ClassValue, clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * The MD3 roles in `routes/layout.css` are a custom `text-*` theme scale that
 * tailwind-merge knows nothing about: unregistered, it reads `text-body-md` as a
 * text *colour* and drops it as soon as another colour class joins the same list.
 * Each role has to be listed here for the two to coexist.
 */
const twMerge = extendTailwindMerge({
	extend: {
		theme: {
			text: [
				'display-lg',
				'display-md',
				'display-sm',
				'headline-lg',
				'headline-md',
				'headline-sm',
				'title-lg',
				'title-md',
				'title-sm',
				'body-lg',
				'body-md',
				'body-sm',
				'label-lg',
				'label-md',
				'label-sm'
			]
		}
	}
});

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChild<T> = T extends { child?: any } ? Omit<T, 'child'> : T;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChildren<T> = T extends { children?: any } ? Omit<T, 'children'> : T;
export type WithoutChildrenOrChild<T> = WithoutChildren<WithoutChild<T>>;
export type WithElementRef<T, U extends HTMLElement = HTMLElement> = T & { ref?: U | null };
