export function requireValue<T>(
	value: T | null | undefined,
	message = "Expected value to be defined",
): NonNullable<T> {
	if (value == null) {
		throw new Error(message);
	}

	return value;
}
