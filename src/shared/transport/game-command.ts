export type GameCommand<TType extends string, TPayload> = Readonly<{
  commandId: string;
  baseRevision: number;
  type: TType;
  payload: TPayload;
}>;

export type MutationResponse<TDelta, TEvent = never> = Readonly<{
  commandId: string;
  revision: number;
  delta: TDelta;
  events: readonly TEvent[];
}>;

export type RevisionConflict = Readonly<{
  kind: 'REVISION_CONFLICT';
  expectedRevision: number;
  actualRevision: number;
}>;
