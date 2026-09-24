import {
  createCompanyState,
  type Company,
  type CompanyKind,
  type CompanyState,
} from '../../simulation/economy/company-state';

export const COMPANY_CODEC_VERSION = 1;

type CompanyKindCode = 1 | 2;

export type EncodedCompanyState = Readonly<{
  codecVersion: typeof COMPANY_CODEC_VERSION;
  version: number;
  nextCompanyId: number;
  companies: readonly (readonly [
    id: number,
    buildingId: number,
    kindCode: CompanyKindCode,
    jobCapacity: number,
  ])[];
}>;

function encodeCompanyKind(kind: CompanyKind): CompanyKindCode {
  switch (kind) {
    case 'commercial':
      return 1;
    case 'industrial':
      return 2;
  }
}

function decodeCompanyKind(value: unknown): CompanyKind {
  switch (value) {
    case 1:
      return 'commercial';
    case 2:
      return 'industrial';
    default:
      throw new RangeError('Company kind code must be 1 or 2');
  }
}

function decodeCompanyTuple(tuple: unknown, index: number): Company {
  if (!Array.isArray(tuple) || tuple.length !== 4) {
    throw new RangeError(`Company tuple at index ${index} must contain exactly 4 values`);
  }

  const values = tuple as readonly unknown[];
  const id = values[0];
  const buildingId = values[1];
  const kindCode = values[2];
  const jobCapacity = values[3];

  if (
    typeof id !== 'number' ||
    typeof buildingId !== 'number' ||
    typeof jobCapacity !== 'number'
  ) {
    throw new RangeError(`Company tuple at index ${index} requires numeric id, buildingId, and jobCapacity`);
  }

  return {
    id,
    buildingId,
    kind: decodeCompanyKind(kindCode),
    jobCapacity,
  };
}

export function encodeCompanyState(state: CompanyState): EncodedCompanyState {
  const validated = createCompanyState(state);

  return {
    codecVersion: COMPANY_CODEC_VERSION,
    version: validated.version,
    nextCompanyId: validated.nextCompanyId,
    companies: validated.companies.map(
      (company) =>
        [
          company.id,
          company.buildingId,
          encodeCompanyKind(company.kind),
          company.jobCapacity,
        ] as const,
    ),
  };
}

export function decodeCompanyState(saved: EncodedCompanyState): CompanyState {
  if (saved.codecVersion !== COMPANY_CODEC_VERSION) {
    throw new RangeError('Unsupported company codec version; expected 1');
  }

  return createCompanyState({
    version: saved.version,
    nextCompanyId: saved.nextCompanyId,
    companies: saved.companies.map((tuple, index) => decodeCompanyTuple(tuple, index)),
  });
}
