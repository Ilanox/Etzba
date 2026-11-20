export const TAX_2026 = {
  brackets: [[7010, .10], [10060, .14], [19000, .20], [25100, .31], [46690, .35], [Infinity, .47]],
  surtaxFrom: 60130, surtaxRate: .03,
  pointValue: 242,
  blLow: 7703, blMax: 51910,
  niLow: .0104, niHigh: .07,
  hLow: .0323, hHigh: .0517,
  erLow: .0451, erHigh: .076,
  pensionCreditCap: 9700,
};

function bracketTax(income, T) {
  let tax = 0, prev = 0, marginal = T.brackets[0][1];
  for (const [cap, rate] of T.brackets) {
    if (income > prev) { tax += (Math.min(income, cap) - prev) * rate; marginal = rate; }
    prev = cap;
  }
  if (income > T.surtaxFrom) { tax += (income - T.surtaxFrom) * T.surtaxRate; marginal += T.surtaxRate; }
  return { tax, marginal };
}

function split(g, lo, hi, T) {
  const x = Math.min(g, T.blMax);
  return Math.min(x, T.blLow) * lo + Math.max(0, x - T.blLow) * hi;
}

let TABLES = { 2026: TAX_2026 };
export function setTaxTables(t) { TABLES = { 2026: TAX_2026, ...t }; }
export function taxFor(year = new Date().getFullYear()) {
  const ys = Object.keys(TABLES).map(Number).sort((a, b) => a - b);
  const y = ys.filter(x => x <= year).pop() ?? ys[0];
  return TABLES[y];
}

export function grossToNet(gross, s, T = taxFor()) {
  const pEmp = s.pension ? gross * s.pEmp / 100 : 0;
  const hEmp = s.hish ? gross * .025 : 0;
  const ni = split(gross, T.niLow, T.niHigh, T);
  const health = split(gross, T.hLow, T.hHigh, T);
  const { tax: rawTax, marginal } = bracketTax(gross, T);
  const pointsCredit = s.points * T.pointValue;
  const pensionCredit = s.pension ? .35 * Math.min(pEmp, .07 * Math.min(gross, T.pensionCreditCap)) : 0;
  const tax = Math.max(0, rawTax - pointsCredit - pensionCredit);
  const net = gross - tax - ni - health - pEmp - hEmp;
  const employer = {
    pension: s.pension ? gross * s.pEr / 100 : 0,
    severance: s.pension ? gross * s.sev / 100 : 0,
    hish: s.hish ? gross * .075 : 0,
    bl: split(gross, T.erLow, T.erHigh, T),
  };
  const cost = gross + employer.pension + employer.severance + employer.hish + employer.bl;
  return { gross, rawTax, pointsCredit, pensionCredit, tax, ni, health, pEmp, hEmp, net, marginal, employer, cost };
}
