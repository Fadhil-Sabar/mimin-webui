export function chatGptPlanErrorMessage(message: string): string {
	if (message.includes('subscription_sharing_usage_limit_exceeded'))
		return 'ChatGPT plan usage limit reached. Use Manage usage to review your limits in ChatGPT Settings.';
	if (message.includes('subscription_sharing_usage_unavailable'))
		return 'ChatGPT plan usage is unavailable. Review Manage usage in ChatGPT Settings, or reconnect in Mimin Settings → Models.';
	return message;
}

/** Adapt the Responses request to the documented SIWC preview contract. */
export function chatGptPlanPayload(payload: unknown): unknown {
	if (!payload || typeof payload !== 'object' || Array.isArray(payload))
		throw new Error('Invalid ChatGPT request payload');
	const result = { ...(payload as Record<string, unknown>), store: false, stream: true };
	for (const key of [
		'background',
		'conversation',
		'max_output_tokens',
		'max_tool_calls',
		'metadata',
		'moderation',
		'multi_agent',
		'prompt',
		'prompt_cache_retention',
		'prompt_cache_options',
		'safety_identifier',
		'temperature',
		'top_logprobs',
		'top_p',
		'truncation',
		'user',
		'previous_response_id'
	])
		delete (result as Record<string, unknown>)[key];
	const request = result as Record<string, unknown>;
	if (!Array.isArray(request.input)) throw new Error('ChatGPT requires an input array');
	request.input = request.input.map((item: unknown) => {
		if (!item || typeof item !== 'object') return item;
		const message = item as Record<string, unknown>;
		// Preserve Mimin's policies, user/project instructions and context.
		if (message.role === 'system') return { ...message, role: 'developer' };
		if (message.type === 'function_call' || message.type === 'custom_tool_call')
			return { ...message, namespace: 'mimin' };
		return item;
	});
	if (Array.isArray(request.tools) && request.tools.length) {
		const tools = request.tools as Record<string, unknown>[];
		if (tools.some((tool) => tool.type !== 'function' && tool.type !== 'custom'))
			throw new Error('Unsupported ChatGPT plan tool');
		request.tools = [
			{
				type: 'namespace',
				name: 'mimin',
				description: 'Tools provided by Mimin WebUI.',
				tools
			}
		];
	}
	return result;
}
