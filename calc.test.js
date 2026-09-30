import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buyCost, feeAmount, soldIncomeETF, summarize } from "./calc.js";

const portfolio = JSON.parse(readFileSync(new URL("./data/portfolio.json", import.meta.url), "utf8"));
const sheet = summarize(portfolio, 34.9, "2026-09-30");

test("買進手續費與 20 元下限", () => {
  assert.equal(buyCost(19.6, 152), 2983);
  assert.equal(buyCost(17, 1000), 17024);
  assert.equal(feeAmount(10, 1000), 20);
  assert.equal(buyCost(10, 1000), 10020);
  assert.equal(feeAmount(10, 100), 1);
});

test("股價 34.9 時總覽對上試算表", () => {
  assert.equal(sheet.totalShares, 9000);
  assert.equal(sheet.investedCost, 176260);
  assert.equal(sheet.deposits, 120000);
  assert.equal(sheet.totalDividends, 56242);
  assert.equal(sheet.yearDividends, 17973);
  assert.equal(sheet.liquidation, 313339);
  assert.equal(sheet.netInvestPnl, 137079);
  assert.equal(sheet.totalPnl, 193321);
  assert.equal(sheet.cashBalance, -18);
  assert.equal(sheet.netAsset, 313321);
  assert.equal(sheet.netAssetPct, 161.1);
  assert.equal(sheet.avgPrice, 19.58);
  assert.equal(sheet.divYieldPct, 46.87);
  assert.equal(sheet.costPerShareWithDiv, 13.34);
});

test("第一筆買進的報酬對上試算表", () => {
  const first = sheet.trades[0];
  assert.equal(first.date, "2022-02-09");
  assert.equal(first.buyAmount, 2983);
  assert.equal(first.adjustedShares, 152);
  assert.equal(first.returnAmount, 2309);
  assert.equal(first.returnPct, 77.41);
  assert.equal(first.returnLabel, "77.41 % (2309)");
});

test("每一筆買進金額對上試算表", () => {
  const expected = [
    2983, 3494, 3476, 5196, 2506, 1338, 1323, 2495, 2499, 2572, 2970, 2436, 2798, 4966, 2509, 2448,
    1604, 1585, 1958, 2433, 3298, 2439, 1627, 1052, 17024, 14146, 1494, 21690, 8306, 2350, 2431, 2704,
    3774, 3988, 4227, 3897, 3714, 3407, 3073, 3573, 5689, 8768,
  ];
  assert.deepEqual(sheet.trades.map((trade) => trade.buyAmount), expected);
});

test("配息列對上試算表，含兩筆凍結時點", () => {
  const expected = [
    ["2022-02-22", 509, 153, 9953, 1.54],
    ["2022-05-17", 1325, 424, 25310, 1.68],
    ["2022-08-17", 1965, 550, 36086, 1.52],
    ["2022-11-16", 2880, 806, 51156, 1.58],
    ["2023-02-16", 4545, 1227, 79029, 1.55],
    ["2023-07-28", 5455, 1473, 94669, 1.56],
    ["2023-08-15", 6845, 2396, 124665, 1.92],
    ["2023-11-15", 6960, 2436, 127015, 1.92],
    ["2024-02-26", 7080, 2832, 129446, 2.19],
    ["2024-05-16", 7200, 3672, 132150, 2.78],
    ["2024-08-14", 7360, 4048, 135924, 2.98],
    ["2024-11-15", 7535, 4144, 139912, 2.96],
    ["2025-02-20", 7725, 3863, 144139, 2.68],
    ["2025-05-22", 7900, 3713, 148036, 2.51],
    ["2025-08-16", 8085, 3234, 151750, 2.13],
    ["2025-11-18", 8245, 3298, 155157, 2.13],
    ["2026-02-26", 8380, 3520, 158230, 2.22],
    ["2026-05-21", 8540, 5636, 161803, 3.48],
    ["2026-08-17", 8730, 8817, 167492, 5.26],
  ];
  const rows = sheet.cashflows.filter((row) => row.type === "dividend");
  assert.deepEqual(
    rows.map((row) => [row.date, row.shares, row.dividend, row.costBasis, row.yieldPct]),
    expected,
  );
});

test("賣出 20 元手續費下限不影響目前這批總覽", () => {
  assert.equal(soldIncomeETF(34.9, 9000), 313339);
  assert.ok(feeAmount(34.9, 9000) > 20);
});
