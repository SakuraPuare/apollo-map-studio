import { zodResolver } from '@hookform/resolvers/zod';
import type { FieldValues, Resolver } from 'react-hook-form';
import type { ZodType } from 'zod';

type ZodResolverFactory = <T extends FieldValues>(schema: ZodType<T, T>) => Resolver<T>;

const resolveZod = zodResolver as ZodResolverFactory;

export function zodResolverZ4<T extends FieldValues>(schema: ZodType<T, T>): Resolver<T> {
  return resolveZod(schema);
}
