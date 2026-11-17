// Israeli payroll math, tax year 2026 (salaried employee, 18 to retirement age, single employer).
// Sources: Israel Tax Authority 2026 tables (after bracket widening), Bituach Leumi 2026 employee rates.
export const TAX_2026 = {
  brackets: [[7010, .10], [10060, .14], [19000, .20], [25100, .31], [46690, .35], [Infinity, .47]],
  surtaxFrom: 60130, surtaxRate: .03,
  pointValue: 242,
  blLow: 7703, blMax: 51910,
  niLow: .0104, niHigh: .07,       // ביטוח לאומי עובד
  hLow: .0323, hHigh: .0517,       // ביטוח בריאות
  erLow: .0451, erHigh: .076,      // ביטוח לאומי מעסיק
  pensionCreditCap: 9700,           // approx. insured-salary cap for 35% credit
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

/** s = settings: { points, pension, pEmp, pEr, sev, hish } */
export function grossToNet(gross, s, T = TAX_2026) {
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
