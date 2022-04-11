export const booleanFilter = Boolean as any as <T>(
  x: T | false | undefined | "" | 0
) => x is T;

function defaultSort(a: [string, any], b: [string, any]) {
  return a[0].localeCompare(b[0]);
}

export function sortEntries<T extends Record<string, any>>(
  report: T,
  callback = defaultSort as (
    a: [string, T[string]],
    b: [string, T[string]]
  ) => number
): T {
  return Object.fromEntries(
    Object.entries(report).sort((a, b) => {
      const res = callback(a, b);
      return res === 0 ? a[0].localeCompare(b[0]) : res;
    })
  ) as T;
}
