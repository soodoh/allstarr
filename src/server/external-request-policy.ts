export type RetryDelayInput = {
	attempt: number;
	baseDelayMs: number;
	retryAfterMs?: number;
	maxDelayMs?: number;
};

export type ExternalRequestRetryOptions = {
	maxRetries: number;
	baseDelayMs: number;
	maxDelayMs?: number;
	retryStatuses?: number[];
};

export type ExternalRequestAttemptInfo = {
	attempt: number;
	status?: number;
	delayMs?: number;
	response?: Response;
};

export type ExternalRequestPolicyOptions = {
	timeoutMs: number;
	timeoutMessage: string;
	retry?: ExternalRequestRetryOptions;
	onRetry?: (info: ExternalRequestAttemptInfo) => void;
	onSuccess?: (info: ExternalRequestAttemptInfo) => void;
};

export function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

export function parseRetryAfterHeader(response: Response): number | undefined {
	const header = response.headers.get("Retry-After");
	if (!header) {
		return undefined;
	}

	const seconds = Number(header);
	if (Number.isFinite(seconds) && seconds >= 0) {
		return seconds * 1000;
	}

	const dateMs = Date.parse(header);
	if (!Number.isNaN(dateMs)) {
		return Math.max(0, dateMs - Date.now());
	}

	return undefined;
}

export function resolveRetryDelayMs(input: RetryDelayInput): number {
	const delay = input.retryAfterMs ?? input.baseDelayMs * 2 ** input.attempt;
	return Math.min(delay, input.maxDelayMs ?? delay);
}

export function createAbortTimeoutError(
	message: string,
	cause: unknown,
): Error {
	return new Error(message, { cause });
}

function shouldRetryResponse(
	response: Response,
	attempt: number,
	retry?: ExternalRequestRetryOptions,
): boolean {
	if (!retry || attempt >= retry.maxRetries) {
		return false;
	}

	return (retry.retryStatuses ?? [429, 502, 503, 504]).includes(
		response.status,
	);
}

function getAbortReason(signal: AbortSignal): unknown {
	return (
		signal.reason ??
		new DOMException("The operation was aborted.", "AbortError")
	);
}

export async function fetchWithExternalTimeout(
	url: string,
	options: RequestInit,
	timeoutMs: number,
	timeoutMessage: string,
): Promise<Response> {
	const timeoutController = new AbortController();
	const callerSignal = options.signal;
	let timeoutTriggered = false;
	let fetchSignal = timeoutController.signal;
	let cleanupCallerAbort: (() => void) | undefined;
	let cleanupTimeoutAbort: (() => void) | undefined;

	if (callerSignal) {
		if (callerSignal.aborted) {
			throw getAbortReason(callerSignal);
		}

		const compositeController = new AbortController();
		const abortFromCaller = () => {
			compositeController.abort(getAbortReason(callerSignal));
		};
		const abortFromTimeout = () => {
			compositeController.abort(getAbortReason(timeoutController.signal));
		};

		callerSignal.addEventListener("abort", abortFromCaller, { once: true });
		timeoutController.signal.addEventListener("abort", abortFromTimeout, {
			once: true,
		});
		cleanupCallerAbort = () => {
			callerSignal.removeEventListener("abort", abortFromCaller);
		};
		cleanupTimeoutAbort = () => {
			timeoutController.signal.removeEventListener("abort", abortFromTimeout);
		};
		fetchSignal = compositeController.signal;
	}

	const timeoutId = setTimeout(() => {
		timeoutTriggered = true;
		timeoutController.abort();
	}, timeoutMs);
	try {
		return await fetch(url, {
			...options,
			signal: fetchSignal,
		});
	} catch (error) {
		if (
			timeoutTriggered &&
			error instanceof Error &&
			error.name === "AbortError"
		) {
			throw createAbortTimeoutError(timeoutMessage, error);
		}
		throw error;
	} finally {
		clearTimeout(timeoutId);
		cleanupCallerAbort?.();
		cleanupTimeoutAbort?.();
	}
}

export async function fetchWithExternalPolicy(
	url: string,
	options: RequestInit,
	policy: ExternalRequestPolicyOptions,
): Promise<Response> {
	for (let attempt = 0; ; attempt += 1) {
		const response = await fetchWithExternalTimeout(
			url,
			options,
			policy.timeoutMs,
			policy.timeoutMessage,
		);

		if (!shouldRetryResponse(response, attempt, policy.retry)) {
			if (response.ok) {
				policy.onSuccess?.({
					attempt,
					status: response.status,
					response,
				});
			}
			return response;
		}

		const retryAfterMs = parseRetryAfterHeader(response);
		const delayMs = resolveRetryDelayMs({
			attempt,
			baseDelayMs: policy.retry?.baseDelayMs ?? 0,
			retryAfterMs,
			maxDelayMs: policy.retry?.maxDelayMs,
		});
		policy.onRetry?.({
			attempt,
			status: response.status,
			delayMs,
			response,
		});
		await sleep(delayMs);
	}
}
