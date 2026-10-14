import type { City } from './city';

export type FiscalMode='normal'|'austerity';
export const BOND_AMOUNT=25_000;
export const BOND_TERM=60;
const INTEREST_RATE=0.003;
export const fiscalMode=(city:City):FiscalMode=>city.fiscalMode??'normal';
export const outstandingDebt=(city:City)=>city.debt??0;
export const recurringPrincipal=(city:City)=>city.debtPrincipalMonthly??0;

/** Aggregate municipal borrowing: deterministic, bounded, and save-v1 compatible. */
export function debtBudget(city:City,revenue:number){
  const debt=outstandingDebt(city);
  const interest=Math.ceil(debt*INTEREST_RATE);
  const principal=Math.min(debt,recurringPrincipal(city));
  // Maximum borrowing is based on recurring city revenue, not treasury funds.
  const limit=Math.max(25_000,Math.round(revenue*24));
  const headroom=Math.max(0,limit-debt);
  return {debt,interest,principal,limit,headroom,canBorrow:headroom>=BOND_AMOUNT};
}
export function austeritySavings(city:City,population:number,serviceCost:number){
  return fiscalMode(city)==='austerity'
    ? Math.round(30+population*0.16+serviceCost*0.15)
    :0;
}
export function validFiscalState(city:Partial<City>){
  return (city.fiscalMode===undefined||city.fiscalMode==='normal'||city.fiscalMode==='austerity')
    &&(city.debt===undefined||(Number.isSafeInteger(city.debt)&&city.debt>=0&&city.debt<=100_000_000))
    &&(city.debtPrincipalMonthly===undefined||(Number.isSafeInteger(city.debtPrincipalMonthly)&&city.debtPrincipalMonthly>=0&&city.debtPrincipalMonthly<=100_000_000))
    &&(!city.debt||!!city.debtPrincipalMonthly)
    &&(!city.debtPrincipalMonthly||!!city.debt);
}
