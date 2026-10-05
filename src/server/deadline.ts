// Waits for `work` at most `ms`, then answers `fallback` instead. The work
// itself isn't cancelled; use this only where its result is optional (after
// Land, GitHub's mergeability and the record update must not hold the answer
// past the function's time limit).
export async function withDeadline<T>(work: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  try {
    return await Promise.race([work, late]);
  } finally {
    clearTimeout(timer);
  }
}
