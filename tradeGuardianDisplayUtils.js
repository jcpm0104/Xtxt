/* Trade Guardian Display Utilities
   Convierte valores entre porcentaje y dinero
   y devuelve ambos formatos para mostrar en pantalla
*/

function tgSafeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function tgToDollar(value, unit, accountSize) {
  const v = tgSafeNumber(value);
  const size = tgSafeNumber(accountSize);

  if (unit === "%") {
    return size * (v / 100);
  }

  return v;
}

function tgToPercent(value, unit, accountSize) {
  const v = tgSafeNumber(value);
  const size = tgSafeNumber(accountSize);

  if (!size) return 0;

  if (unit === "$") {
    return (v / size) * 100;
  }

  return v;
}

function tgFormatMoney(value) {
  const n = tgSafeNumber(value);
  return "$" + n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function tgFormatPercent(value) {
  const n = tgSafeNumber(value);
  return n.toFixed(2) + "%";
}

function tgDualValue(value, unit, accountSize) {
  const dollars = tgToDollar(value, unit, accountSize);
  const percent = tgToPercent(value, unit, accountSize);

  return {
    dollars,
    percent,
    moneyText: tgFormatMoney(dollars),
    percentText: tgFormatPercent(percent),
    display: `${tgFormatMoney(dollars)} (${tgFormatPercent(percent)})`
  };
}
