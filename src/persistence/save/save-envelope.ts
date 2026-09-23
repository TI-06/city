export type SaveEnvelope<TState> = Readonly<{
  saveVersion: number;
  revision: number;
  savedAtIso: string;
  state: TState;
}>;
