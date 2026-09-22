import http from 'node:http';

const args = process.argv.slice(2);
const portIndex = args.indexOf('--port');
const port = Number(
	portIndex >= 0 ? args[portIndex + 1] : (process.env.PLAYWRIGHT_PROVIDER_PORT ?? 4317)
);
const modelId = 'mimin-e2e';
const failures = new Map();

function json(res, status, payload) {
	res.writeHead(status, {
		'content-type': 'application/json; charset=utf-8',
		'cache-control': 'no-store'
	});
	res.end(JSON.stringify(payload));
}

function readBody(req) {
	return new Promise((resolve, reject) => {
		const chunks = [];
		req.on('data', (chunk) => chunks.push(chunk));
		req.on('end', () => {
			try {
				resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
			} catch (error) {
				reject(error);
			}
		});
		req.on('error', reject);
	});
}

function messageText(body) {
	const messages = Array.isArray(body?.messages) ? body.messages : [];
	const latest = messages.at(-1);
	if (!latest) return '';
	if (typeof latest.content === 'string') return latest.content;
	if (Array.isArray(latest.content)) {
		return latest.content
			.filter((part) => part && part.type === 'text')
			.map((part) => part.text ?? '')
			.join(' ');
	}
	return '';
}

function sse(res, payload) {
	res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function wait(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function streamCompletion(req, res, body) {
	const prompt = messageText(body);
	const failureKey = prompt.trim();
	if (prompt.includes('[provider-error]')) {
		const count = failures.get(failureKey) ?? 0;
		failures.set(failureKey, count + 1);
		if (count === 0) {
			json(res, 503, { error: { message: 'Intentional Playwright provider failure' } });
			return;
		}
	}

	res.writeHead(200, {
		'content-type': 'text/event-stream; charset=utf-8',
		'cache-control': 'no-cache, no-transform',
		connection: 'keep-alive'
	});

	let closed = false;
	const close = () => {
		closed = true;
	};
	req.on('aborted', close);
	res.on('close', close);

	const response = `Fake answer: ${prompt.replace(/\[(slow|reconnect|provider-error)\]/g, '').trim()}`;
	const chunks = response.match(/.{1,18}(?:\s|$)|.{1,18}/g) ?? [response];
	for (const chunk of chunks) {
		if (closed) return;
		sse(res, {
			id: `mimin-${Date.now()}`,
			object: 'chat.completion.chunk',
			choices: [{ index: 0, delta: { content: chunk }, finish_reason: null }]
		});
		if (prompt.includes('[slow]') || prompt.includes('[reconnect]')) await wait(120);
	}
	if (closed) return;
	sse(res, {
		id: `mimin-${Date.now()}`,
		object: 'chat.completion.chunk',
		choices: [{ index: 0, delta: {}, finish_reason: 'stop' }]
	});
	res.write('data: [DONE]\n\n');
	res.end();
}

const server = http.createServer(async (req, res) => {
	const url = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`);
	if (req.method === 'GET' && url.pathname === '/health') {
		json(res, 200, { ok: true });
		return;
	}
	if (req.method === 'GET' && (url.pathname === '/models' || url.pathname === '/v1/models')) {
		json(res, 200, { object: 'list', data: [{ id: modelId, object: 'model', owned_by: 'mimin' }] });
		return;
	}
	if (
		req.method === 'POST' &&
		(url.pathname === '/chat/completions' || url.pathname === '/v1/chat/completions')
	) {
		try {
			await streamCompletion(req, res, await readBody(req));
		} catch (error) {
			if (!res.headersSent) json(res, 400, { error: { message: String(error) } });
			else res.destroy(error);
		}
		return;
	}
	json(res, 404, { error: { message: 'Not found' } });
});

server.listen(port, '127.0.0.1', () => {
	console.log(`Playwright fake provider listening on http://127.0.0.1:${port}`);
});

function shutdown() {
	server.close(() => process.exit(0));
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
