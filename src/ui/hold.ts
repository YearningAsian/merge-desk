// The timing behind hold-to-confirm: confirm only after the press has lasted
// `ms` without a release, a pointer leaving, or focus moving away. Pure apart
// from the timer functions, so it is tested with a fake clock.

export const HOLD_MS = 800;

export function createHold(
  onConfirm: () => void,
  ms = HOLD_MS,
  timers: {
    set: (run: () => void, ms: number) => unknown;
    clear: (handle: unknown) => void;
  } = {
    set: (run, delay) => setTimeout(run, delay),
    clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  },
) {
  let handle: unknown = null;
  return {
    start() {
      if (handle !== null) return;
      handle = timers.set(() => {
        handle = null;
        onConfirm();
      }, ms);
    },
    cancel() {
      if (handle === null) return;
      timers.clear(handle);
      handle = null;
    },
    get holding() {
      return handle !== null;
    },
  };
}
