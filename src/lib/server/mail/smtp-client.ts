import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { connect as connectTcp, type Socket } from 'node:net';
import { connect as connectTls, type TLSSocket } from 'node:tls';

/**
 * A deliberately small SMTP client for transactional mail such as password resets.
 *
 * It speaks the subset a relay needs: implicit TLS or STARTTLS, AUTH PLAIN/LOGIN,
 * one message per connection, and a base64 body that cannot be mangled by 7-bit
 * hops. Queues, pools, and DKIM signing belong to the operator's own relay.
 */

export const SMTP_DEFAULT_TIMEOUT_MS = 10_000;

export type SmtpConfig = {
	host: string;
	port: number;
	/** Implicit TLS, as used by port 465. */
	secure: boolean;
	user?: string;
	password?: string;
	from: string;
	heloName?: string;
	/** Refuse to send when the server offers no STARTTLS. Defaults to true whenever credentials are set. */
	requireTls?: boolean;
	timeoutMs?: number;
};

export type SmtpMessage = {
	to: string;
	subject: string;
	text: string;
};

export type SmtpResponse = { code: number; lines: string[] };

export type SmtpSocket = Socket | TLSSocket;

export type SmtpTransportHooks = {
	/** Test seam; production connections come from the internal dialer. */
	connect?: (options: {
		host: string;
		port: number;
		secure: boolean;
		timeoutMs: number;
	}) => Promise<SmtpSocket>;
};

export class SmtpError extends Error {
	readonly code?: number;

	constructor(message: string, code?: number) {
		super(message);
		this.name = 'SmtpError';
		this.code = code;
	}
}

/** A header value must be one line of printable text: CR, LF, and NUL enable header injection. */
function hasControlCharacter(value: string): boolean {
	for (const character of value) {
		const code = character.codePointAt(0) ?? 0;
		if (code < 0x20 || code === 0x7f) return true;
	}
	return false;
}

function assertNoLineBreak(value: string, label: string) {
	if (hasControlCharacter(value)) throw new SmtpError(`The ${label} contains a line break.`);
}

/** Splits `Display Name <user@example.com>` or a bare address, rejecting anything unsafe. */
export function parseSmtpAddress(value: string): { name: string | null; address: string } {
	assertNoLineBreak(value, 'email address');
	const trimmed = value.trim();
	const angled = /^(.*?)<([^<>]+)>$/.exec(trimmed);
	const address = (angled ? angled[2] : trimmed).trim();
	const displayName = angled
		? angled[1]
				.trim()
				.replace(/^"(.*)"$/, '$1')
				.trim()
		: '';
	if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(address))
		throw new SmtpError(`"${value}" is not a usable email address.`);
	if (displayName && hasControlCharacter(displayName))
		throw new SmtpError(`"${value}" contains control characters.`);
	return { name: displayName || null, address };
}

function encodeHeaderWord(value: string): string {
	if (/^[\x20-\x7e]*$/.test(value)) return value;
	// RFC 2047 encoded words are limited to 75 characters, so long values fold into
	// several words. Chunks stay on 4-character base64 boundaries so each decodes alone.
	const chunks =
		Buffer.from(value, 'utf8')
			.toString('base64')
			.match(/.{1,48}/g) ?? [];
	return chunks.map((chunk) => `=?UTF-8?B?${chunk}?=`).join(' ');
}

function formatAddress(parsed: { name: string | null; address: string }): string {
	if (!parsed.name) return parsed.address;
	const quoted = /[",;:<>@\\]/.test(parsed.name)
		? `"${parsed.name.replace(/([\\"])/g, '\\$1')}"`
		: parsed.name;
	return `${encodeHeaderWord(quoted)} <${parsed.address}>`;
}

/** Base64 keeps non-ASCII text, long lines, and leading dots out of trouble on the wire. */
function encodeBody(text: string): string {
	return (
		Buffer.from(text, 'utf8')
			.toString('base64')
			.match(/.{1,76}/g)
			?.join('\r\n') ?? ''
	);
}

export function buildSmtpMessage(
	message: SmtpMessage & { from: string },
	meta: { messageId?: string; date?: Date } = {}
): string {
	const from = parseSmtpAddress(message.from);
	const to = parseSmtpAddress(message.to);
	assertNoLineBreak(message.subject, 'subject');

	const messageId = meta.messageId ?? `<${randomUUID()}@${from.address.split('@')[1]}>`;
	const date = (meta.date ?? new Date()).toUTCString().replace('GMT', '+0000');

	return [
		`From: ${formatAddress(from)}`,
		`To: ${formatAddress(to)}`,
		`Subject: ${encodeHeaderWord(message.subject)}`,
		`Date: ${date}`,
		`Message-ID: ${messageId}`,
		'MIME-Version: 1.0',
		'Content-Type: text/plain; charset=utf-8',
		'Content-Transfer-Encoding: base64',
		'',
		encodeBody(message.text)
	].join('\r\n');
}

export function createResponseReader(socket: SmtpSocket, timeoutMs: number) {
	let buffer = '';
	let failure: Error | null = null;
	let pending: {
		resolve: (response: SmtpResponse) => void;
		reject: (error: Error) => void;
	} | null = null;

	const fail = (error: Error) => {
		failure ??= error;
		const current = pending;
		pending = null;
		current?.reject(failure);
	};

	/** A response ends at the first line whose status code is followed by a space. */
	const deliver = () => {
		if (!pending || failure) return;
		const lines = buffer.split(/\r?\n/);
		const tail = lines.pop() ?? '';
		for (let index = 0; index < lines.length; index += 1) {
			const line = lines[index];
			if (!/^\d{3} /.test(line)) continue;
			buffer = [...lines.slice(index + 1), tail].join('\r\n');
			const response = { code: Number(line.slice(0, 3)), lines: lines.slice(0, index + 1) };
			const current = pending;
			pending = null;
			current?.resolve(response);
			return;
		}
		buffer = [...lines, tail].join('\r\n');
	};

	const onData = (chunk: string | Buffer) => {
		buffer += chunk.toString();
		deliver();
	};

	socket.setEncoding('utf8');
	socket.on('data', onData);
	socket.on('error', (error: Error) => fail(new SmtpError(error.message)));
	socket.on('close', () => fail(new SmtpError('The SMTP connection closed early.')));
	socket.on('timeout', () => fail(new SmtpError('The SMTP server stopped responding.')));

	return {
		read(): Promise<SmtpResponse> {
			if (failure) return Promise.reject(failure);
			return new Promise<SmtpResponse>((resolve, reject) => {
				pending = { resolve, reject };
				socket.setTimeout(timeoutMs);
				deliver();
			});
		},
		stop() {
			socket.off('data', onData);
			socket.setTimeout(0);
		}
	};
}

type ResponseReader = ReturnType<typeof createResponseReader>;

function dial(options: {
	host: string;
	port: number;
	secure: boolean;
	timeoutMs: number;
}): Promise<SmtpSocket> {
	return new Promise((resolve, reject) => {
		const { host, port, secure, timeoutMs } = options;
		const socket = secure
			? connectTls({ host, port, servername: host })
			: connectTcp({ host, port });
		const onError = (error: Error) => {
			socket.destroy();
			reject(new SmtpError(`Could not reach the SMTP server at ${host}:${port}: ${error.message}`));
		};
		socket.once('error', onError);
		socket.setTimeout(timeoutMs, () =>
			onError(new SmtpError(`Connecting to ${host}:${port} timed out.`))
		);
		socket.once(secure ? 'secureConnect' : 'connect', () => {
			socket.setTimeout(0);
			socket.off('error', onError);
			resolve(socket);
		});
	});
}

function upgradeToTls(socket: SmtpSocket, host: string, timeoutMs: number): Promise<SmtpSocket> {
	return new Promise((resolve, reject) => {
		const upgraded = connectTls({ socket: socket as Socket, servername: host });
		const onError = (error: Error) => {
			upgraded.destroy();
			reject(new SmtpError(`The SMTP server rejected the TLS upgrade: ${error.message}`));
		};
		upgraded.once('error', onError);
		upgraded.setTimeout(timeoutMs, () => onError(new SmtpError('The TLS upgrade timed out.')));
		upgraded.once('secureConnect', () => {
			upgraded.setTimeout(0);
			upgraded.off('error', onError);
			resolve(upgraded);
		});
	});
}

function lastLine(response: SmtpResponse): string {
	return (response.lines[response.lines.length - 1] ?? '').replace(/^\d{3}[ -]?/, '');
}

async function write(socket: SmtpSocket, data: string) {
	if (!socket.write(data)) await once(socket, 'drain');
}

async function readExpecting(
	reader: ResponseReader,
	expected: number[],
	action: string
): Promise<SmtpResponse> {
	const response = await reader.read();
	if (!expected.includes(response.code))
		throw new SmtpError(
			`${action} failed: the server replied "${lastLine(response)}".`,
			response.code
		);
	return response;
}

type Capabilities = { greets: Set<string>; auth: string[] };

function parseEhlo(response: SmtpResponse): Capabilities {
	const greets = new Set<string>();
	const auth: string[] = [];
	for (const line of response.lines.slice(1)) {
		const text = line.replace(/^\d{3}[ -]?/, '').trim();
		if (!text) continue;
		const [keyword, ...rest] = text.split(/\s+/);
		greets.add(keyword.toUpperCase());
		if (keyword.toUpperCase() === 'AUTH') auth.push(...rest.map((item) => item.toUpperCase()));
	}
	return { greets, auth };
}

async function greet(
	socket: SmtpSocket,
	reader: ResponseReader,
	heloName: string
): Promise<Capabilities> {
	await write(socket, `EHLO ${heloName}\r\n`);
	const response = await reader.read();
	if (response.code === 250) return parseEhlo(response);
	await write(socket, `HELO ${heloName}\r\n`);
	await readExpecting(reader, [250], 'HELO');
	return { greets: new Set(), auth: [] };
}

async function authenticate(
	socket: SmtpSocket,
	reader: ResponseReader,
	capabilities: Capabilities,
	config: SmtpConfig
) {
	const user = config.user as string;
	const password = config.password ?? '';
	const mechanisms = capabilities.auth;

	if (mechanisms.length > 0 && !mechanisms.includes('PLAIN') && !mechanisms.includes('LOGIN'))
		throw new SmtpError(
			`The SMTP server only offers ${mechanisms.join(', ')}, which this client does not support.`
		);

	if (mechanisms.includes('LOGIN') && !mechanisms.includes('PLAIN')) {
		await write(socket, 'AUTH LOGIN\r\n');
		await readExpecting(reader, [334], 'AUTH LOGIN');
		await write(socket, `${Buffer.from(user).toString('base64')}\r\n`);
		await readExpecting(reader, [334], 'AUTH LOGIN');
		await write(socket, `${Buffer.from(password).toString('base64')}\r\n`);
	} else {
		const token = Buffer.from(`\u0000${user}\u0000${password}`).toString('base64');
		await write(socket, `AUTH PLAIN ${token}\r\n`);
	}

	const response = await reader.read();
	if (response.code !== 235)
		throw new SmtpError(
			`The SMTP server rejected the credentials: "${lastLine(response)}".`,
			response.code
		);
}

export async function sendSmtpMail(
	config: SmtpConfig,
	message: SmtpMessage,
	hooks: SmtpTransportHooks = {}
): Promise<void> {
	const timeoutMs = config.timeoutMs ?? SMTP_DEFAULT_TIMEOUT_MS;
	const heloName = config.heloName ?? 'localhost';
	const requireTls = config.requireTls ?? Boolean(config.user);
	const from = parseSmtpAddress(config.from);
	const to = parseSmtpAddress(message.to);
	const connect = hooks.connect ?? dial;

	let socket = await connect({
		host: config.host,
		port: config.port,
		secure: config.secure,
		timeoutMs
	});
	let reader = createResponseReader(socket, timeoutMs);

	try {
		await readExpecting(reader, [220], 'The SMTP greeting');
		let capabilities = await greet(socket, reader, heloName);

		if (!config.secure) {
			if (capabilities.greets.has('STARTTLS')) {
				await write(socket, 'STARTTLS\r\n');
				await readExpecting(reader, [220], 'STARTTLS');
				reader.stop();
				socket = await upgradeToTls(socket, config.host, timeoutMs);
				reader = createResponseReader(socket, timeoutMs);
				capabilities = await greet(socket, reader, heloName);
			} else if (requireTls) {
				throw new SmtpError(
					'The SMTP server does not offer STARTTLS, so the message was not sent. Use port 465 with SMTP_SECURE=true, or set SMTP_ALLOW_INSECURE=true to accept a plaintext relay.'
				);
			}
		}

		if (config.user) await authenticate(socket, reader, capabilities, config);

		await write(socket, `MAIL FROM:<${from.address}>\r\n`);
		await readExpecting(reader, [250], 'MAIL FROM');
		await write(socket, `RCPT TO:<${to.address}>\r\n`);
		await readExpecting(reader, [250, 251], 'RCPT TO');
		await write(socket, 'DATA\r\n');
		await readExpecting(reader, [354], 'DATA');

		const body = buildSmtpMessage({ ...message, from: config.from });
		await write(socket, `${body}\r\n.\r\n`);
		await readExpecting(reader, [250], 'Sending the message');

		await write(socket, 'QUIT\r\n');
		await reader.read().catch(() => undefined);
		reader.stop();
		socket.end();
	} catch (error) {
		reader.stop();
		socket.destroy();
		throw error instanceof SmtpError
			? error
			: new SmtpError(error instanceof Error ? error.message : 'Sending the email failed.');
	}
}
