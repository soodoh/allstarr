import { renderHook } from "src/test/render";

type MutationHook<TVars, TResult> = () => {
	mutateAsync: (variables: TVars) => Promise<TResult>;
};

export async function runMutation<TVars, TResult>(
	useHook: MutationHook<TVars, TResult>,
	variables: TVars,
	swallowError = false,
): Promise<TResult | undefined> {
	const { result } = await renderHook(() => useHook());

	const promise = result.current.mutateAsync(variables);
	if (swallowError) {
		return promise.catch(() => undefined);
	}
	return promise;
}
