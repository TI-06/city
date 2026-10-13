/**
 * Serialize writes so a slow earlier IndexedDB transaction cannot overwrite a
 * newer city snapshot. Every failure is reported to its caller, but a failed
 * write never blocks later requests.
 */
export function createOrderedWriter<T>(write: (value: T) => Promise<void>): (value: T) => Promise<void> {
  let tail: Promise<void> = Promise.resolve();
  return value => {
    const work = tail.then(() => write(value));
    tail = work.catch(() => undefined);
    return work;
  };
}