import { zodResolver } from '@hookform/resolvers/zod';
import type { FieldValues, Resolver } from 'react-hook-form';

// Zod 4 + @hookform/resolvers@5 overload-resolution shim: runtime is
// version-aware, but TS only sees the Zod 3 overload for bare ZodObject inputs.
export function zodResolverZ4<T extends FieldValues>(schema: unknown): Resolver<T> {
  return zodResolver(schema as never) as unknown as Resolver<T>;
}
