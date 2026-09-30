import { summarize, sortPortfolio } from "./calc.js";
import { apiBase } from "./config.js";

const money = new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 0 });
const priceText = new Intl.NumberFormat("zh-TW", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const state = {
  portfolio: null,
  sha: "",
  price: null,
  priceSource: "",
  manualPrice: false,
};

const summaryEl = document.querySelector("#summary");
const tradesBody = document.querySelector("#trades tbody");
const cashBody = document.querySelector("#cash tbody");
const statusEl = document.querySelector("#status");
const bannerEl = document.querySelector("#banner");
const priceInput = document.querySelector("#price");
const priceSourceEl = document.querySelector("#price-source");
const editor = document.querySelector("#editor");
const editorForm = document.querySelector("#editor-form");
const editorTitle = document.querySelector("#editor-title");
const editorFields = document.querySelector("#editor-fields");
const editorError = document.querySelector("#editor-error");
const passwordDialog = document.querySelector("#password-dialog");
const passwordForm = document.querySelector("#password-form");
const passwordInput = document.querySelector("#password");
const passwordError = document.querySelector("#password-error");

let editorMode = null;

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

function signedClass(value) {
  if (value > 0) return "up";
  if (value < 0) return "down";
  return "";
}

function formatMoney(value) {
  if (value === null || value === undefined || value === "") return "";
  return money.format(value);
}

function formatPrice(value) {
  if (value === null || value === undefined || value === "") return "";
  return priceText.format(value);
}

function formatPct(value) {
  if (value === null || value === undefined) return "";
  return `${value.toFixed(2)} %`;
}

function formatDate(value) {
  return value ? value.replaceAll("-", "/") : "";
}

function newId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function today() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function currentSummary() {
  return summarize(state.portfolio, state.price, today());
}

function render() {
  if (!state.portfolio || !state.price) return;
  const view = currentSummary();
  const cards = [
    ["資產淨值", formatMoney(view.netAsset), formatPct(view.netAssetPct), true],
    ["資產淨值(%)", formatPct(view.netAssetPct)],
    ["目前股價", formatPrice(view.price)],
    ["持股平均價", formatPrice(view.avgPrice)],
    ["總持股", formatMoney(view.totalShares)],
    ["投入成本", formatMoney(view.investedCost)],
    ["淨投資損益", formatMoney(view.netInvestPnl), "", false, view.netInvestPnl],
    ["總損益", formatMoney(view.totalPnl), "", false, view.totalPnl],
    ["投資總額", formatMoney(view.deposits)],
    ["帳戶餘額", formatMoney(view.cashBalance), "", false, view.cashBalance],
    ["股利(總)", formatMoney(view.totalDividends)],
    ["股息報酬率", formatPct(view.divYieldPct)],
    ["每股含息成本", formatPrice(view.costPerShareWithDiv)],
    ["股利(當年)", formatMoney(view.yearDividends)],
  ];
  summaryEl.innerHTML = cards
    .map(([label, value, extra, hero, signed]) => {
      const extraHtml = hero && extra ? `<span class="${signedClass(view.netAssetPct)}">${extra}</span>` : "";
      const klass = signedClass(signed);
      return `<article class="card${hero ? " hero" : ""}"><p>${label}</p><strong class="${klass}">${value}</strong>${hero ? extraHtml : ""}</article>`;
    })
    .join("");

  tradesBody.innerHTML = view.trades
    .map((trade) => {
      const returnClass = trade.sold ? "" : signedClass(trade.returnAmount);
      return `<tr>
        <td>${formatDate(trade.date)}</td>
        <td>${formatPrice(trade.price)}</td>
        <td>${formatMoney(trade.shares)}</td>
        <td class="${returnClass}">${trade.returnLabel}</td>
        <td>${formatPrice(trade.sellPrice)}</td>
        <td class="${signedClass(trade.capitalGain)}">${formatMoney(trade.capitalGain)}</td>
        <td>${formatMoney(trade.adjustedShares)}</td>
        <td>${formatMoney(trade.buyAmount)}</td>
        <td>${formatMoney(trade.sellAmount)}</td>
        <td>${trade.year}</td>
        <td><div class="row-actions">
          <button type="button" data-action="edit-trade" data-id="${trade.id}">修改</button>
          <button type="button" data-action="delete-trade" data-id="${trade.id}">刪除</button>
        </div></td>
      </tr>`;
    })
    .join("");

  cashBody.innerHTML = view.cashflows
    .map((row) => {
      const note = row.type === "dividend" && row.asOf && row.asOf !== row.date
        ? `<span class="note">持股時點 ${formatDate(row.asOf)}</span>`
        : "";
      return `<tr>
        <td>${formatDate(row.date)}${note}</td>
        <td>${row.type === "deposit" ? formatMoney(row.amount) : ""}</td>
        <td>${row.type === "dividend" ? formatPrice(row.dps) : ""}</td>
        <td>${formatMoney(row.shares)}</td>
        <td>${formatMoney(row.dividend)}</td>
        <td>${formatMoney(row.costBasis)}</td>
        <td>${formatPct(row.yieldPct)}</td>
        <td>${row.year}</td>
        <td><div class="row-actions">
          <button type="button" data-action="edit-cash" data-id="${row.id}">修改</button>
          <button type="button" data-action="delete-cash" data-id="${row.id}">刪除</button>
        </div></td>
      </tr>`;
    })
    .join("");

  priceInput.value = state.price;
  priceSourceEl.textContent = state.priceSource;
}

function field(label, name, value, type = "text", extra = "") {
  return `<label>${label}<input name="${name}" type="${type}" value="${value ?? ""}" ${extra} required></label>`;
}

function openEditor(mode, record = null) {
  editorMode = { mode, record };
  editorError.textContent = "";
  const titles = {
    "add-trade": "新增買進",
    "edit-trade": "修改交易",
    "add-deposit": "新增存入",
    "add-dividend": "新增配息",
    "edit-cash": record?.type === "deposit" ? "修改存入" : "修改配息",
  };
  editorTitle.textContent = titles[mode];
  if (mode === "add-trade" || mode === "edit-trade") {
    editorFields.innerHTML = [
      field("日期", "date", record?.date ?? today(), "date"),
      field("買入股價", "price", record?.price ?? "", "number", 'min="0" step="0.01"'),
      field("股數", "shares", record?.shares ?? "", "number", 'min="1" step="1"'),
      `<label>賣出股價<input name="sellPrice" type="number" min="0" step="0.01" value="${record?.sellPrice ?? ""}"></label>`,
      `<label>賣出日期<input name="sellDate" type="date" value="${record?.sellDate ?? ""}"></label>`,
    ].join("");
  } else if (mode === "add-deposit" || (mode === "edit-cash" && record.type === "deposit")) {
    editorFields.innerHTML = [
      field("日期", "date", record?.date ?? today(), "date"),
      field("存入金額", "amount", record?.amount ?? "", "number", 'min="1" step="1"'),
    ].join("");
  } else {
    editorFields.innerHTML = [
      field("日期", "date", record?.date ?? today(), "date"),
      field("每股股利", "dps", record?.dps ?? "", "number", 'min="0" step="0.01"'),
    ].join("");
  }
  editor.showModal();
}

function readEditor() {
  const data = new FormData(editorForm);
  const date = String(data.get("date") || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "請填日期" };
  const { mode, record } = editorMode;
  if (mode.endsWith("trade")) {
    const price = Number(data.get("price"));
    const shares = Number(data.get("shares"));
    const sellRaw = String(data.get("sellPrice") || "");
    const sellDate = String(data.get("sellDate") || "");
    if (!(price > 0)) return { error: "買入股價必須大於 0" };
    if (!Number.isInteger(shares) || shares <= 0) return { error: "股數必須是正整數" };
    const trade = {
      id: record?.id ?? newId("buy"),
      date,
      price,
      shares,
    };
    if (sellRaw !== "") {
      const sellPrice = Number(sellRaw);
      if (!(sellPrice > 0)) return { error: "賣出股價必須大於 0" };
      trade.sellPrice = sellPrice;
      trade.sellDate = sellDate || today();
    }
    return { trade };
  }
  if (mode === "add-deposit" || record?.type === "deposit") {
    const amount = Number(data.get("amount"));
    if (!Number.isInteger(amount) || amount <= 0) return { error: "存入金額必須是正整數" };
    return { cashflow: { id: record?.id ?? newId("in"), date, type: "deposit", amount } };
  }
  const dps = Number(data.get("dps"));
  if (!(dps > 0)) return { error: "每股股利必須大於 0" };
  const cashflow = { id: record?.id ?? newId("div"), date, type: "dividend", dps };
  if (record?.asOf && record.date === date) cashflow.asOf = record.asOf;
  return { cashflow };
}

async function commitChange(portfolio, message) {
  const next = sortPortfolio(portfolio);
  if (!apiBase) {
    state.portfolio = next;
    render();
    setStatus("這次只改了畫面上的數字，重新整理會回到匯入資料。");
    return;
  }
  const password = await ensurePassword();
  if (!password) return;
  setStatus("正在寫入 Git…");
  const response = await fetch(`${apiBase}/api/portfolio`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password, baseSha: state.sha, portfolio: next, message }),
  });
  const body = await response.json().catch(() => ({}));
  if (response.status === 401) {
    sessionStorage.removeItem("ledger-password");
    setStatus(body.error || "密碼不對", true);
    return;
  }
  if (response.status === 409) {
    setStatus(body.error || "資料剛被別人改過，請重新整理後再存", true);
    return;
  }
  if (!response.ok) {
    setStatus(body.error || "寫入失敗", true);
    return;
  }
  state.sha = body.sha;
  state.portfolio = body.portfolio;
  render();
  setStatus("已寫進 Git。");
}

function ensurePassword() {
  const saved = sessionStorage.getItem("ledger-password");
  if (saved) return Promise.resolve(saved);
  passwordError.textContent = "";
  passwordInput.value = "";
  passwordDialog.showModal();
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      passwordForm.onsubmit = null;
      passwordDialog.removeEventListener("close", onClose);
      resolve(value);
    };
    const onClose = () => finish(sessionStorage.getItem("ledger-password") || "");
    passwordDialog.addEventListener("close", onClose);
    passwordForm.onsubmit = (event) => {
      event.preventDefault();
      const value = passwordInput.value;
      if (!value) {
        passwordError.textContent = "請輸入密碼";
        return;
      }
      sessionStorage.setItem("ledger-password", value);
      passwordDialog.close();
    };
    document.querySelector("#password-cancel").onclick = () => passwordDialog.close();
  });
}

async function loadPortfolio() {
  if (apiBase) {
    const response = await fetch(`${apiBase}/api/portfolio`);
    if (!response.ok) throw new Error("讀取紀錄失敗");
    const body = await response.json();
    state.sha = body.sha;
    state.portfolio = body.portfolio;
    bannerEl.hidden = true;
    return;
  }
  const response = await fetch("./data/portfolio.json");
  if (!response.ok) throw new Error("讀不到 data/portfolio.json");
  state.portfolio = await response.json();
  state.sha = "";
  bannerEl.hidden = false;
  bannerEl.textContent = "這是本機預覽。看得到和試算表一樣的數字；新增與修改只留在這個畫面，不會寫進 Git。";
}

async function loadPrice() {
  const params = new URLSearchParams(location.search);
  const fromQuery = Number(params.get("price"));
  if (fromQuery > 0) {
    state.price = fromQuery;
    state.manualPrice = true;
    state.priceSource = "網址指定的價格";
    return;
  }
  if (apiBase) {
    try {
      const response = await fetch(`${apiBase}/api/quote`);
      if (response.ok) {
        const quote = await response.json();
        state.price = quote.price;
        state.priceSource = `市價${quote.time ? ` ${quote.time}` : ""}`;
        return;
      }
    } catch {
      // 下面改用手填。
    }
  }
  state.price = 34.9;
  state.manualPrice = true;
  state.priceSource = "抓不到市價，先用試算表上的 34.9";
}

document.querySelector("#price-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const price = Number(priceInput.value);
  if (!(price > 0)) {
    setStatus("股價必須大於 0", true);
    return;
  }
  state.price = price;
  state.manualPrice = true;
  state.priceSource = "手動價格";
  setStatus("");
  render();
});

document.querySelector("#add-trade").addEventListener("click", () => openEditor("add-trade"));
document.querySelector("#add-deposit").addEventListener("click", () => openEditor("add-deposit"));
document.querySelector("#add-dividend").addEventListener("click", () => openEditor("add-dividend"));
document.querySelector("#editor-cancel").addEventListener("click", () => editor.close());

editorForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const result = readEditor();
  if (result.error) {
    editorError.textContent = result.error;
    return;
  }
  const portfolio = structuredClone(state.portfolio);
  let message = "更新投資紀錄";
  if (result.trade) {
    const index = portfolio.trades.findIndex((trade) => trade.id === result.trade.id);
    if (index >= 0) portfolio.trades[index] = result.trade;
    else portfolio.trades.push(result.trade);
    message = index >= 0 ? "修改交易" : `新增買進 ${result.trade.shares} 股`;
  }
  if (result.cashflow) {
    const index = portfolio.cashflows.findIndex((row) => row.id === result.cashflow.id);
    if (index >= 0) portfolio.cashflows[index] = result.cashflow;
    else portfolio.cashflows.push(result.cashflow);
    message = result.cashflow.type === "deposit" ? "新增存入" : "新增配息";
  }
  editor.close();
  await commitChange(portfolio, message);
});

document.body.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const { action, id } = button.dataset;
  if (action === "edit-trade") {
    openEditor("edit-trade", state.portfolio.trades.find((trade) => trade.id === id));
    return;
  }
  if (action === "edit-cash") {
    openEditor("edit-cash", state.portfolio.cashflows.find((row) => row.id === id));
    return;
  }
  if (action === "delete-trade" || action === "delete-cash") {
    const label = action === "delete-trade" ? "這筆交易" : "這筆資金紀錄";
    if (!confirm(`刪除${label}？`)) return;
    const portfolio = structuredClone(state.portfolio);
    if (action === "delete-trade") portfolio.trades = portfolio.trades.filter((trade) => trade.id !== id);
    else portfolio.cashflows = portfolio.cashflows.filter((row) => row.id !== id);
    await commitChange(portfolio, "刪除紀錄");
  }
});

try {
  await loadPortfolio();
  await loadPrice();
  render();
} catch (error) {
  setStatus(error.message || "頁面載入失敗", true);
}
