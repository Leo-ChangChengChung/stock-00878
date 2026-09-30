import { sortPortfolio } from "../../calc.js";

const FILE_PATH = "data/portfolio.json";

export function passwordsMatch(input, expected) {
  if (typeof input !== "string" || typeof expected !== "string" || !expected) return false;
  const a = new TextEncoder().encode(input);
  const b = new TextEncoder().encode(expected);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

function isDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isId(value) {
  return typeof value === "string" && /^[A-Za-z0-9-]{1,80}$/.test(value);
}

function isPositive(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isPositiveInt(value) {
  return isPositive(value) && Number.isInteger(value);
}

export function validatePortfolio(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return "資料格式不對";
  if (data.symbol !== "00878") return "標的必須是 00878";
  if (!Array.isArray(data.trades) || !Array.isArray(data.cashflows)) return "缺少交易或資金明細";
  if (data.trades.length > 5000 || data.cashflows.length > 5000) return "筆數太多";
  const ids = new Set();
  for (const trade of data.trades) {
    if (!trade || !isId(trade.id) || ids.has(trade.id)) return "交易編號不正確";
    ids.add(trade.id);
    if (!isDate(trade.date)) return "交易日期不正確";
    if (!isPositive(trade.price)) return "買入股價必須大於 0";
    if (!isPositiveInt(trade.shares)) return "股數必須是正整數";
    if (trade.sellPrice != null && trade.sellPrice !== "" && !isPositive(Number(trade.sellPrice))) {
      return "賣出股價必須大於 0";
    }
    if (trade.sellDate != null && trade.sellDate !== "" && !isDate(trade.sellDate)) return "賣出日期不正確";
  }
  for (const row of data.cashflows) {
    if (!row || !isId(row.id) || ids.has(row.id)) return "資金編號不正確";
    ids.add(row.id);
    if (!isDate(row.date)) return "資金日期不正確";
    if (row.type === "deposit") {
      if (!isPositiveInt(row.amount)) return "存入金額必須是正整數";
    } else if (row.type === "dividend") {
      if (!isPositive(row.dps)) return "每股股利必須大於 0";
      if (row.asOf != null && row.asOf !== "" && !isDate(row.asOf)) return "配息持股時點不正確";
    } else {
      return "資金類型不正確";
    }
  }
  return "";
}

export function sanitizePortfolio(data) {
  return sortPortfolio({
    symbol: "00878",
    trades: data.trades.map((trade) => {
      const row = {
        id: trade.id,
        date: trade.date,
        price: Number(trade.price),
        shares: Number(trade.shares),
      };
      if (trade.sellPrice != null && trade.sellPrice !== "") row.sellPrice = Number(trade.sellPrice);
      if (trade.sellDate) row.sellDate = trade.sellDate;
      return row;
    }),
    cashflows: data.cashflows.map((row) => {
      if (row.type === "deposit") {
        return { id: row.id, date: row.date, type: "deposit", amount: Number(row.amount) };
      }
      const dividend = { id: row.id, date: row.date, type: "dividend", dps: Number(row.dps) };
      if (row.asOf) dividend.asOf = row.asOf;
      return dividend;
    }),
  });
}

export function parseTwseQuote(payload) {
  const row = payload?.msgArray?.[0];
  if (!row) return null;
  const raw = row.z && row.z !== "-" ? row.z : row.y;
  const price = Number(raw);
  if (!Number.isFinite(price) || price <= 0) return null;
  return { price, name: row.n || "00878", time: row.t || "", source: "twse" };
}

export function parseYahooQuote(payload) {
  const meta = payload?.chart?.result?.[0]?.meta;
  const price = Number(meta?.regularMarketPrice);
  if (!Number.isFinite(price) || price <= 0) return null;
  return { price, name: meta.shortName || "00878", time: "", source: "yahoo" };
}

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      ...extraHeaders,
    },
  });
}

function decodeBase64Utf8(value) {
  const binary = atob(value.replace(/\n/g, ""));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function encodeBase64Utf8(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function githubHeaders(env) {
  return {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "stock-00878",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function repoParts(env) {
  const repo = String(env.GITHUB_REPO || "");
  const [owner, name] = repo.split("/");
  if (!owner || !name || !env.GITHUB_TOKEN) return null;
  return { owner, name, branch: env.GITHUB_BRANCH || "main" };
}

async function githubGet(env) {
  const repo = repoParts(env);
  if (!repo) return { error: "Worker 還沒設定 GITHUB_REPO 或 GITHUB_TOKEN", status: 500 };
  const url = `https://api.github.com/repos/${repo.owner}/${repo.name}/contents/${FILE_PATH}?ref=${encodeURIComponent(repo.branch)}`;
  const response = await fetch(url, { headers: githubHeaders(env) });
  if (!response.ok) return { error: "讀取 Git 上的紀錄失敗", status: 502 };
  const file = await response.json();
  return { sha: file.sha, portfolio: JSON.parse(decodeBase64Utf8(file.content)) };
}

async function githubPut(env, portfolio, sha, message) {
  const repo = repoParts(env);
  const url = `https://api.github.com/repos/${repo.owner}/${repo.name}/contents/${FILE_PATH}`;
  const response = await fetch(url, {
    method: "PUT",
    headers: { ...githubHeaders(env), "Content-Type": "application/json" },
    body: JSON.stringify({
      message: String(message || "更新投資紀錄").replace(/[\r\n]/g, " ").slice(0, 72),
      content: encodeBase64Utf8(`${JSON.stringify(portfolio, null, 2)}\n`),
      sha,
      branch: repo.branch,
    }),
  });
  if (response.status === 409) return { conflict: true };
  if (!response.ok) return { error: "寫入 Git 失敗", status: 502 };
  const body = await response.json();
  return { sha: body.content.sha };
}

async function quote() {
  try {
    const twse = await fetch("https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=tse_00878.tw&json=1&delay=0", {
      headers: { "User-Agent": "stock-00878" },
      signal: AbortSignal.timeout(8000),
    });
    if (twse.ok) {
      const parsed = parseTwseQuote(await twse.json());
      if (parsed) return parsed;
    }
  } catch {
    // 改試下一個來源。
  }
  const yahoo = await fetch("https://query1.finance.yahoo.com/v8/finance/chart/00878.TW?interval=1d&range=1d", {
    headers: { "User-Agent": "stock-00878" },
    signal: AbortSignal.timeout(8000),
  });
  if (!yahoo.ok) return null;
  return parseYahooQuote(await yahoo.json());
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return json({ ok: true });
    const url = new URL(request.url);

    if (url.pathname === "/api/portfolio" && request.method === "GET") {
      const file = await githubGet(env);
      if (file.error) return json({ error: file.error }, file.status);
      return json({ sha: file.sha, portfolio: file.portfolio });
    }

    if (url.pathname === "/api/portfolio" && request.method === "PUT") {
      const text = await request.text();
      if (text.length > 1_000_000) return json({ error: "資料太大" }, 413);
      let body;
      try {
        body = JSON.parse(text);
      } catch {
        return json({ error: "資料格式不對" }, 400);
      }
      if (!passwordsMatch(body.password, env.EDIT_PASSWORD)) return json({ error: "密碼不對" }, 401);
      const problem = validatePortfolio(body.portfolio);
      if (problem) return json({ error: problem }, 400);
      const current = await githubGet(env);
      if (current.error) return json({ error: current.error }, current.status);
      if (body.baseSha !== current.sha) {
        return json({ error: "資料剛被別人改過，請重新整理後再存" }, 409);
      }
      const portfolio = sanitizePortfolio(body.portfolio);
      const saved = await githubPut(env, portfolio, current.sha, body.message);
      if (saved.conflict) return json({ error: "資料剛被別人改過，請重新整理後再存" }, 409);
      if (saved.error) return json({ error: saved.error }, saved.status);
      return json({ sha: saved.sha, portfolio });
    }

    if (url.pathname === "/api/quote" && request.method === "GET") {
      try {
        const parsed = await quote();
        if (!parsed) return json({ error: "抓不到股價" }, 502);
        return json(parsed, 200, { "Cache-Control": "public, max-age=30" });
      } catch {
        return json({ error: "抓不到股價" }, 502);
      }
    }

    return json({ error: "找不到" }, 404);
  },
};
