import { renderHook } from "src/test/render";

export async function runMutation(
	useHook: () => { mutateAsync: (variables: never) => Promise<unknown> },
	variables: unknown,
	swallowError = false,
): Promise<unknown> {
	const { result } = await renderHook(() => useHook());

	const promise = result.current.mutateAsync(variables as never);
	if (swallowError) {
		return promise.catch(() => undefined);
	}
	return promise;
}
