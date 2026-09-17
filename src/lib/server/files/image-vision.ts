import type { ImageContent } from '@earendil-works/pi-ai';

export const IMAGE_ATTACHMENT_MIME_TYPES = new Set([
	'image/png',
	'image/jpeg',
	'image/webp',
	'image/gif'
]);

/** One oversized file, or too many of them, must not dominate a request. */
export const IMAGE_VISION_MAX_BYTES = 16 * 1024 * 1024;
export const IMAGE_VISION_MAX_PER_IMAGE_BYTES = 8 * 1024 * 1024;

export type ImageVisionAttachment = {
	filename: string;
	mimeType: string;
	storageKey: string;
};

export type ImageVisionContent = {
	images: ImageContent[];
	notice: string | null;
};

export function isImageAttachment(attachment: { mimeType: string }) {
	return IMAGE_ATTACHMENT_MIME_TYPES.has(attachment.mimeType);
}

function startsWith(data: Uint8Array, bytes: number[]) {
	return data.length >= bytes.length && bytes.every((byte, index) => data[index] === byte);
}

/**
 * Verify the bytes match the declared image type. A file whose extension lies about
 * its content must never be handed to a provider as an image.
 */
export function hasImageMagicBytes(data: Uint8Array, mimeType: string) {
	switch (mimeType) {
		case 'image/png':
			return startsWith(data, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
		case 'image/jpeg':
			return startsWith(data, [0xff, 0xd8, 0xff]);
		case 'image/gif':
			return data.length >= 6 && new TextDecoder().decode(data.subarray(0, 6)).startsWith('GIF8');
		case 'image/webp':
			return (
				data.length >= 12 &&
				new TextDecoder().decode(data.subarray(0, 4)) === 'RIFF' &&
				new TextDecoder().decode(data.subarray(8, 12)) === 'WEBP'
			);
		default:
			return false;
	}
}

/**
 * Turns the current turn's image attachments into provider image content. A missing
 * vision capability is an explicit error, so the model never answers as if it saw an
 * image that was never sent.
 */
export async function buildImageVisionContent(
	attachments: ImageVisionAttachment[],
	readFile: (storageKey: string) => Promise<Uint8Array>,
	canAcceptImages: boolean
): Promise<ImageVisionContent> {
	const images: ImageContent[] = [];
	const notices: string[] = [];
	let remainingBytes = IMAGE_VISION_MAX_BYTES;
	let budgetExhausted = false;

	for (const attachment of attachments) {
		if (!isImageAttachment(attachment)) continue;
		if (!canAcceptImages) throw new Error('IMAGE_VISION_MODEL_UNSUPPORTED');
		const data = new Uint8Array(await readFile(attachment.storageKey));
		if (!hasImageMagicBytes(data, attachment.mimeType)) throw new Error('INVALID_IMAGE');
		if (data.byteLength > IMAGE_VISION_MAX_PER_IMAGE_BYTES)
			throw new Error('IMAGE_VISION_IMAGE_TOO_LARGE');
		if (budgetExhausted || data.byteLength > remainingBytes) {
			budgetExhausted = true;
			notices.push(
				`Image ${attachment.filename} was omitted because the image attachment budget (${IMAGE_VISION_MAX_BYTES} bytes) was reached.`
			);
			continue;
		}
		images.push({
			type: 'image',
			data: Buffer.from(data).toString('base64'),
			mimeType: attachment.mimeType
		});
		remainingBytes -= data.byteLength;
	}

	return { images, notice: notices.length ? notices.join('\n') : null };
}
