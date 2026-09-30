import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseTwseQuote, parseYahooQuote, passwordsMatch, sanitizePortfolio, validatePortfolio } from "./index.js";

const portfolio = JSON.parse(readFileSync(new URL("../../data/portfolio.json", import.meta.url), "utf8"));

test("匯入的紀錄可以通過寫入檢查", () => {
  assert.equal(validatePortfolio(portfolio), "");
  const clean = sanitizePortfolio(portfolio);
  assert.equal(clean.trades.length, 42);
  assert.equal(clean.cashflows[3].asOf, "2022-08-15");
});

test("密碼比對與衝突條件", () => {
  assert.equal(passwordsMatch("secret", "secret"), true);
  assert.equal(passwordsMatch("secret", "Secret"), false);
  assert.equal(passwordsMatch("", "secret"), false);
  assert.equal(passwordsMatch("secret", ""), false);
});

test("拒絕不完整的交易", () => {
  const broken = structuredClone(portfolio);
  broken.trades[0].shares = 0;
  assert.equal(validatePortfolio(broken), "股數必須是正整數");
});

test("股價回應解析", () => {
  assert.deepEqual(parseTwseQuote({ msgArray: [{ n: "國泰永續高股息", z: "21.5", t: "13:30:00" }] }), {
    price: 21.5,
    name: "國泰永續高股息",
    time: "13:30:00",
    source: "twse",
  });
  assert.equal(parseTwseQuote({ msgArray: [{ z: "-", y: "21.4" }] }).price, 21.4);
  assert.equal(parseYahooQuote({ chart: { result: [{ meta: { regularMarketPrice: 22.2 } }] } }).price, 22.2);
  assert.equal(parseYahooQuote({}), null);
});
