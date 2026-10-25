import type { UseQueryResult } from "@tanstack/react-query";

type DataOf<R> = { [K in keyof R]: R[K] extends UseQueryResult<infer D> ? D : never };

export interface CombinedQuery<T> {
  data: T | undefined;
  isError: boolean;
  retry: () => void;
}

/** Several queries as one: the widget shows its content once all of them have answered. */
export function combine<const R extends readonly UseQueryResult[]>(
  results: R,
): CombinedQuery<DataOf<R>> {
  const isError = results.some((result) => result.isError);
  const ready = results.every((result) => result.data !== undefined);
  return {
    data: ready ? (results.map((result) => result.data) as DataOf<R>) : undefined,
    isError,
    retry: () => {
      for (const result of results) {
        if (result.isError) {
          void result.refetch();
        }
      }
    },
  };
}
