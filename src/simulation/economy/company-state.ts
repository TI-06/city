export type CompanyKind = 'commercial' | 'industrial';

export type Company = Readonly<{
  id: number;
  buildingId: number;
  kind: CompanyKind;
  jobCapacity: number;
}>;

export type CompanyState = Readonly<{
  version: number;
  nextCompanyId: number;
  companies: readonly Company[];
}>;

export type CompanyStateInput = Readonly<{
  version: number;
  nextCompanyId: number;
  companies: readonly Company[];
}>;

function assertNonNegativeSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer`);
  }
}

function assertPositiveSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive safe integer`);
  }
}

function isCompanyKind(value: string): value is CompanyKind {
  return value === 'commercial' || value === 'industrial';
}

export function createEmptyCompanyState(): CompanyState {
  return {
    version: 0,
    nextCompanyId: 1,
    companies: [],
  };
}

export function createCompanyState(input: CompanyStateInput): CompanyState {
  assertNonNegativeSafeInteger(input.version, 'Company version');
  assertPositiveSafeInteger(input.nextCompanyId, 'Next company ID');

  const companyIds = new Set<number>();
  const buildingIds = new Set<number>();
  let maximumId = 0;

  const companies = input.companies.map((company) => {
    assertPositiveSafeInteger(company.id, 'Company ID');
    assertPositiveSafeInteger(company.buildingId, 'Company building ID');

    if (companyIds.has(company.id)) {
      throw new RangeError(`Duplicate company ID: ${company.id}`);
    }
    companyIds.add(company.id);

    if (buildingIds.has(company.buildingId)) {
      throw new RangeError(`Duplicate company building ID: ${company.buildingId}`);
    }
    buildingIds.add(company.buildingId);

    if (!isCompanyKind(company.kind)) {
      throw new RangeError('Company kind must be commercial or industrial');
    }

    assertPositiveSafeInteger(company.jobCapacity, 'Company job capacity');

    maximumId = Math.max(maximumId, company.id);
    return {
      id: company.id,
      buildingId: company.buildingId,
      kind: company.kind,
      jobCapacity: company.jobCapacity,
    } satisfies Company;
  });

  if (input.nextCompanyId <= maximumId) {
    throw new RangeError(
      `Next company ID ${input.nextCompanyId} must be greater than existing maximum company ID ${maximumId}`,
    );
  }

  return {
    version: input.version,
    nextCompanyId: input.nextCompanyId,
    companies,
  };
}

export function findCompanyByBuildingId(
  state: CompanyState,
  buildingId: number,
): Company | undefined {
  return state.companies.find((company) => company.buildingId === buildingId);
}
