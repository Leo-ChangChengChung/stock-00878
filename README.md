# 00878 投資紀錄

公開網頁，內容來自試算表「嘉玲投資紀錄」的 00878 交易與存入／配息。誰都可以看。新增、修改、刪除要密碼，而且會寫進這個 Git 倉庫的 `data/portfolio.json`。

本機先看數字：

```powershell
npm test
python -m http.server 8765
```

瀏覽器打開 `http://127.0.0.1:8765/?price=34.9`。股價固定 34.9 時，總覽應和試算表一致：總持股 9000、投入成本 176260、資產淨值 313321、總損益 193321、帳戶餘額 -18。

本機預覽的新增和修改只留在畫面上，重新整理會回到匯入資料。

## 計算

網頁只存日期、買進價、股數、賣出價、存入金額、每股股利。報酬、手續費、資產淨值都在畫面上重算。

- 手續費是成交金額的 0.1425%，無條件捨去。股數大於 999 且手續費低於 20 元時，以 20 元計。
- 賣出再扣 0.1% 交易稅，同樣無條件捨去。
- 配息的持股與當時成本，用配息日當天（含）以前、還沒賣出的買進合計。

有兩筆配息在試算表裡是早先凍結的持股，沒有把緊鄰的買進算進去：2022/08/17 用 2022/08/15 的持股，2023/02/16 用 2023/02/15 的持股。這兩筆在資料裡留了 `asOf`，總覽才會和試算表相同。之後新加的配息不會帶 `asOf`。

## 部署

1. 在 GitHub 建一個公開倉庫，把這個資料夾推上去。公開才能讓朋友不用登入就看；明細也會被任何人讀到。
2. 倉庫 Settings → Pages，來源選主分支的根目錄。頁面網址就是給朋友的網址。
3. 到 GitHub → Settings → Developer settings，建一個 fine-grained token。只勾這個倉庫的 Contents 讀寫。
4. 安裝 Wrangler 後，在 `worker` 目錄部署：

```powershell
npx wrangler login
npx wrangler secret put GITHUB_TOKEN
npx wrangler secret put EDIT_PASSWORD
```

5. 編輯 `worker/wrangler.toml` 的 `GITHUB_REPO`，填 `帳號/倉庫名`，再執行 `npx wrangler deploy`。
6. 把 Worker 網址填進專案根目錄的 `config.js`：

```javascript
export const apiBase = "https://stock-00878.你的帳號.workers.dev";
```

7. 再推一次，等 GitHub Pages 更新。

密碼和 token 只放在 Cloudflare 的 secret，不要寫進 Git。兩個人同時儲存時，後送出的那位會看到「請重新整理後再存」，避免蓋掉前一位剛寫入的紀錄。

市價由 Worker 代抓。抓不到時，頁面上可以手填股價。
