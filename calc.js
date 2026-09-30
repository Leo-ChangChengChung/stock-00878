const FEE_RATE_NUMERATOR = 1425;
const TAX_RATE_NUMERATOR = 1000;
const RATE_DENOMINATOR = 100000000;
const MIN_FEE = 20;
const MIN_FEE_SHARES = 999;

function priceCents(price) {
  return Math.round(Number(price) * 100);
}

function grossCents(price, shares) {
  return priceCents(price) * Number(shares);
}

export function feeAmount(price, shares) {
  const cents = grossCents(price, shares);
  let fee = Math.floor((cents * FEE_RATE_NUMERATOR) / RATE_DENOMINATOR);
  if (Number(shares) > MIN_FEE_SHARES && fee < MIN_FEE) fee = MIN_FEE;
  return fee;
}

export function buyCost(price, shares) {
  const principal = Math.floor(grossCents(price, shares) / 100);
  return principal + feeAmount(price, shares);
}

export function soldIncomeETF(price, shares) {
  const cents = grossCents(price, shares);
  const principal = Math.floor(cents / 100);
  const tax = Math.floor((cents * TAX_RATE_NUMERATOR) / RATE_DENOMINATOR);
  return principal - feeAmount(price, shares) - tax;
}

export function round(value, digits) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function dividendAmount(dps, shares) {
  const dpsCents = Math.round(Number(dps) * 100);
  return Math.round((dpsCents * Number(shares)) / 100);
}

export function isSold(trade) {
  return trade.sellPrice !== null && trade.sellPrice !== undefined && trade.sellPrice !== "";
}

function soldOnOrBefore(trade, asOf) {
  if (!isSold(trade) || !trade.sellDate) return false;
  return trade.sellDate <= asOf;
}

export function holdingsAsOf(trades, asOf) {
  return trades.filter((trade) => trade.date <= asOf && !soldOnOrBefore(trade, asOf));
}

function yearOf(date) {
  return Number(String(date).slice(0, 4));
}

export function describeTrade(trade, price) {
  const cost = buyCost(trade.price, trade.shares);
  const sold = isSold(trade);
  const year = yearOf(trade.date);
  if (sold) {
    const sellAmount = soldIncomeETF(trade.sellPrice, trade.shares);
    return {
      ...trade,
      sold: true,
      year,
      buyAmount: null,
      adjustedShares: 0,
      sellAmount,
      capitalGain: sellAmount - cost,
      returnAmount: null,
      returnPct: null,
      returnLabel: "已沖掉",
    };
  }
  const proceeds = soldIncomeETF(price, trade.shares);
  const returnAmount = proceeds - cost;
  const returnPct = cost === 0 ? null : round((returnAmount / cost) * 100, 2);
  return {
    ...trade,
    sold: false,
    year,
    buyAmount: cost,
    adjustedShares: trade.shares,
    sellAmount: null,
    capitalGain: null,
    returnAmount,
    returnPct,
    returnLabel: returnPct === null ? "" : `${returnPct.toFixed(2)} % (${returnAmount})`,
  };
}

export function describeCashflow(cashflow, trades) {
  const year = yearOf(cashflow.date);
  if (cashflow.type === "deposit") {
    return { ...cashflow, year, shares: null, dividend: null, costBasis: null, yieldPct: null };
  }
  const lots = holdingsAsOf(trades, cashflow.asOf || cashflow.date);
  const shares = lots.reduce((sum, trade) => sum + trade.shares, 0);
  const costBasis = lots.reduce((sum, trade) => sum + buyCost(trade.price, trade.shares), 0);
  const dividend = dividendAmount(cashflow.dps, shares);
  const yieldPct = costBasis === 0 ? null : round((dividend / costBasis) * 100, 2);
  return { ...cashflow, year, shares, dividend, costBasis, yieldPct };
}

export function summarize(portfolio, price, asOf = "2026-09-30") {
  const priceNumber = Number(price);
  const trades = portfolio.trades.map((trade) => describeTrade(trade, priceNumber));
  const cashflows = portfolio.cashflows.map((cashflow) => describeCashflow(cashflow, portfolio.trades));
  const openTrades = trades.filter((trade) => !trade.sold);
  const totalShares = openTrades.reduce((sum, trade) => sum + trade.adjustedShares, 0);
  const investedCost = openTrades.reduce((sum, trade) => sum + trade.buyAmount, 0);
  const deposits = cashflows
    .filter((row) => row.type === "deposit")
    .reduce((sum, row) => sum + row.amount, 0);
  const dividendRows = cashflows.filter((row) => row.type === "dividend");
  const totalDividends = dividendRows.reduce((sum, row) => sum + row.dividend, 0);
  const asOfYear = yearOf(asOf);
  const yearDividends = dividendRows
    .filter((row) => row.year === asOfYear)
    .reduce((sum, row) => sum + row.dividend, 0);
  const liquidation = totalShares > 0 ? soldIncomeETF(priceNumber, totalShares) : 0;
  const netInvestPnl = liquidation - investedCost;
  const totalPnl = Math.round(liquidation + totalDividends) - investedCost;
  const cashBalance = deposits - investedCost + totalDividends;
  const netAsset = netInvestPnl + investedCost + cashBalance;
  return {
    price: priceNumber,
    asOf,
    totalShares,
    investedCost,
    deposits,
    totalDividends,
    yearDividends,
    liquidation,
    netInvestPnl,
    totalPnl,
    cashBalance,
    netAsset,
    netAssetPct: deposits === 0 ? null : round((netAsset / deposits - 1) * 100, 2),
    avgPrice: totalShares === 0 ? null : round(investedCost / totalShares, 2),
    divYieldPct: deposits === 0 ? null : round((totalDividends / deposits) * 100, 2),
    costPerShareWithDiv: totalShares === 0 ? null : round((investedCost - totalDividends) / totalShares, 2),
    trades,
    cashflows,
  };
}

export function sortPortfolio(portfolio) {
  const byDate = (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id);
  return {
    symbol: portfolio.symbol,
    trades: [...portfolio.trades].sort(byDate),
    cashflows: [...portfolio.cashflows].sort(byDate),
  };
}
