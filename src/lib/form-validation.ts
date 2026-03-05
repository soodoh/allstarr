import type { z } from "zod";

type ValidationResult<T> =
  | { success: true; data: T; errors: null }
  | { success: false; data: null; errors: Record<string, string> };

export default function validateForm<T extends z.ZodTypeAny>(
  schema: T,
  data: unknown,
): ValidationResult<z.infer<T>> {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data, errors: null };
  }

  const flat = result.error.flatten();
  const errors: Record<string, string> = {};

  for (const [field, messages] of Object.entries(flat.fieldErrors)) {
    const msgs = messages as string[];
    if (msgs.length > 0) {
      errors[field] = msgs[0];
    }
  }

  if (flat.formErrors.length > 0) {
    errors._form = flat.formErrors[0];
  }

  return { success: false, data: null, errors };
}
