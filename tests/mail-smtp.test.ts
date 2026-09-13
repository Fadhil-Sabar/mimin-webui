import { createServer, type Server } from 'node:net';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import {
	buildSmtpMessage,
	parseSmtpAddress,
	sendSmtpMail,
	SmtpError,
	type SmtpConfig
} from '../src/lib/server/mail/smtp-client';

type FakeSmtpOptions = {
	capabilities?: string[];
	authFailure?: boolean;
	rejectRecipient?: boolean;
};

type FakeSmtp = {
	port: number;
	received: string[];
	messages: string[];
	close: () => Promise<void>;
};

const servers: Server[] = [];

/** A scripted plaintext SMTP server: enough of the protocol to exercise the client. */
function startFakeSmtp(options: FakeSmtpOptions = {}): Promise<FakeSmtp> {
	const received: string[] = [];
	const messages: string[] = [];

	const server = createServer((socket) => {
		socket.setEncoding('utf8');
		socket.write('220 fake.example.com ESMTP ready\r\n');
		let buffer = '';
		let body: string[] | null = null;
		let loginStage = 0;

		socket.on('data', (chunk: string) => {
			buffer += chunk;
			let index = buffer.indexOf('\r\n');
			while (index !== -1) {
				const line = buffer.slice(0, index);
				buffer = buffer.slice(index + 2);
				index = buffer.indexOf('\r\n');

				if (body) {
					if (line === '.') {
						messages.push(body.join('\n'));
						body = null;
						socket.write('250 2.0.0 queued\r\n');
					} else {
						body.push(line);
					}
					continue;
				}

				received.push(line);
				const upper = line.toUpperCase();
				if (upper.startsWith('EHLO')) {
					const caps = options.capabilities ?? [];
					socket.write(
						[`250-fake.example.com`, ...caps.map((cap) => `250-${cap}`), '250 SIZE 10240000'].join(
							'\r\n'
						) + '\r\n'
					);
				} else if (upper.startsWith('HELO')) {
					socket.write('250 fake.example.com\r\n');
				} else if (upper === 'STARTTLS') {
					socket.write('454 TLS not available\r\n');
				} else if (upper === 'AUTH LOGIN') {
					loginStage = 1;
					socket.write('334 VXNlcm5hbWU6\r\n');
				} else if (loginStage === 1) {
					loginStage = 2;
					socket.write('334 UGFzc3dvcmQ6\r\n');
				} else if (loginStage === 2) {
					loginStage = 0;
					socket.write(
						options.authFailure ? '535 5.7.8 bad credentials\r\n' : '235 2.7.0 accepted\r\n'
					);
				} else if (upper.startsWith('AUTH PLAIN')) {
					socket.write(
						options.authFailure ? '535 5.7.8 bad credentials\r\n' : '235 2.7.0 accepted\r\n'
					);
				} else if (upper.startsWith('MAIL FROM')) {
					socket.write('250 2.1.0 ok\r\n');
				} else if (upper.startsWith('RCPT TO')) {
					socket.write(options.rejectRecipient ? '550 5.1.1 no such user\r\n' : '250 2.1.5 ok\r\n');
				} else if (upper === 'DATA') {
					body = [];
					socket.write('354 End data with <CR><LF>.<CR><LF>\r\n');
				} else if (upper === 'QUIT') {
					socket.write('221 2.0.0 bye\r\n');
					socket.end();
				} else {
					socket.write('502 5.5.2 command not implemented\r\n');
				}
			}
		});
	});

	servers.push(server);
	return new Promise((resolve) => {
		server.listen(0, '127.0.0.1', () => {
			const { port } = server.address() as AddressInfo;
			resolve({
				port,
				received,
				messages,
				close: () => new Promise<void>((done) => server.close(() => done()))
			});
		});
	});
}

function decodeBody(message: string): string {
	const [, encoded = ''] = message.split(/\r?\n\r?\n/);
	return Buffer.from(encoded.split(/\r?\n/).join(''), 'base64').toString('utf8');
}

afterEach(async () => {
	await Promise.all(servers.splice(0).map((server) => new Promise((done) => server.close(done))));
});

describe('SMTP message building', () => {
	it('formats a display name, encodes a non-ASCII subject, and base64 encodes the body', () => {
		const subject = 'Reset kata sandi — Mimin WebUI, dengan tautan sekali pakai yang panjang';
		const message = buildSmtpMessage(
			{
				from: 'Mimin WebUI <no-reply@example.com>',
				to: 'User <user@example.com>',
				subject,
				text: 'Open this link.\nSecond line.'
			},
			{ messageId: '<fixed@example.com>', date: new Date('2026-01-02T03:04:05Z') }
		);

		expect(message).toContain('From: Mimin WebUI <no-reply@example.com>');
		expect(message).toContain('To: User <user@example.com>');
		expect(message).toContain('Subject: =?UTF-8?B?');
		expect(message).toContain('Message-ID: <fixed@example.com>');
		expect(message).toContain('Date: Fri, 02 Jan 2026 03:04:05 +0000');
		expect(decodeBody(message)).toBe('Open this link.\nSecond line.');

		const subjectLine = message
			.split('\r\n')
			.find((line) => line.startsWith('Subject: ')) as string;
		const decoded = subjectLine
			.replace('Subject: ', '')
			.split(' ')
			.map((word) =>
				Buffer.from(word.replace(/^=\?UTF-8\?B\?/, '').replace(/\?=$/, ''), 'base64').toString(
					'utf8'
				)
			)
			.join('');
		expect(decoded).toBe(subject);
		expect(subjectLine.length).toBeLessThan(200);
	});

	it('refuses header injection through an address or subject', () => {
		expect(() => parseSmtpAddress('user@example.com\r\nBcc: leak@example.com')).toThrow(SmtpError);
		expect(() => parseSmtpAddress('not-an-address')).toThrow(SmtpError);
		expect(() =>
			buildSmtpMessage({
				from: 'no-reply@example.com',
				to: 'user@example.com',
				subject: 'Hello\nBcc: leak@example.com',
				text: 'body'
			})
		).toThrow(/line break/);
	});
});

describe('sendSmtpMail', () => {
	const base: SmtpConfig = {
		host: '127.0.0.1',
		port: 0,
		secure: false,
		from: 'Mimin WebUI <no-reply@example.com>',
		requireTls: false,
		timeoutMs: 3000
	};

	it('delivers a message to a plaintext relay', async () => {
		const server = await startFakeSmtp();
		await sendSmtpMail(
			{ ...base, port: server.port },
			{ to: 'user@example.com', subject: 'Reset', text: 'Hello there' }
		);

		expect(server.received).toContain('MAIL FROM:<no-reply@example.com>');
		expect(server.received).toContain('RCPT TO:<user@example.com>');
		expect(server.messages).toHaveLength(1);
		expect(decodeBody(server.messages[0])).toBe('Hello there');
	});

	it('refuses to continue without STARTTLS when TLS is required', async () => {
		const server = await startFakeSmtp();
		await expect(
			sendSmtpMail(
				{
					...base,
					port: server.port,
					user: 'smtp-user',
					password: 'secret',
					requireTls: undefined
				},
				{ to: 'user@example.com', subject: 'Reset', text: 'Hello' }
			)
		).rejects.toThrow(/STARTTLS/);
		expect(server.received.some((line) => line.startsWith('AUTH'))).toBe(false);
	});

	it('authenticates with AUTH PLAIN when the server advertises it', async () => {
		const server = await startFakeSmtp({ capabilities: ['AUTH PLAIN LOGIN'] });
		await sendSmtpMail(
			{ ...base, port: server.port, user: 'smtp-user', password: 'secret' },
			{ to: 'user@example.com', subject: 'Reset', text: 'Hello' }
		);

		const authLine = server.received.find((line) => line.startsWith('AUTH PLAIN '));
		expect(authLine).toBeDefined();
		const token = Buffer.from((authLine as string).replace('AUTH PLAIN ', ''), 'base64').toString();
		expect(token).toBe('\u0000smtp-user\u0000secret');
	});

	it('falls back to AUTH LOGIN when PLAIN is not offered', async () => {
		const server = await startFakeSmtp({ capabilities: ['AUTH LOGIN'] });
		await sendSmtpMail(
			{ ...base, port: server.port, user: 'smtp-user', password: 'secret' },
			{ to: 'user@example.com', subject: 'Reset', text: 'Hello' }
		);

		expect(server.received).toContain('AUTH LOGIN');
		const start = server.received.indexOf('AUTH LOGIN');
		expect(Buffer.from(server.received[start + 1], 'base64').toString()).toBe('smtp-user');
		expect(Buffer.from(server.received[start + 2], 'base64').toString()).toBe('secret');
	});

	it('reports rejected credentials', async () => {
		const server = await startFakeSmtp({ capabilities: ['AUTH PLAIN'], authFailure: true });
		await expect(
			sendSmtpMail(
				{ ...base, port: server.port, user: 'smtp-user', password: 'wrong' },
				{ to: 'user@example.com', subject: 'Reset', text: 'Hello' }
			)
		).rejects.toThrow(/rejected the credentials/);
	});

	it('reports a rejected recipient', async () => {
		const server = await startFakeSmtp({ rejectRecipient: true });
		await expect(
			sendSmtpMail(
				{ ...base, port: server.port },
				{ to: 'missing@example.com', subject: 'Reset', text: 'Hello' }
			)
		).rejects.toThrow(/RCPT TO failed/);
	});

	it('reports an unreachable server', async () => {
		await expect(
			sendSmtpMail(
				{ ...base, host: '127.0.0.1', port: 9, timeoutMs: 1500 },
				{ to: 'user@example.com', subject: 'Reset', text: 'Hello' }
			)
		).rejects.toThrow(SmtpError);
	});
});
