# 📈 Stock Tracker App

**Overview**

The **Stock Market Lookup** is a professional web application for tracking U.S. stock market data, managing a portfolio, and maintaining a watchlist. Users can search for publicly traded companies and access real-time information such as current stock prices, daily changes, and company details, all within a clean and intuitive interface. By integrating the Alpha Vantage API on the free tier, the app gracefully handles API rate limits while providing persistent portfolio and watchlist management for a seamless user experience.

### 💻 Tech Stack
- **Frontend:** HTML5, CSS3, Vanilla JavaScript (ES6+)
- **API:** [Alpha Vantage](https://www.alphavantage.co/)
- **Styling:** Tailwind CSS (via CDN)
- **Version Control:** Git & GitHub

---

## 📖 Table of Contents
- [Features](#-features)
- [Technical Highlights](#-technical-highlights)
- [Setup Instructions](#-setup-instructions)
- [Project Structure](#-project-structure)
- [How to Use](#-how-to-use)
- [API Usage & Best Practices](#-api-usage--best-practices)


---

## ✨ Features

* **Smart Stock Search:** Enter a stock symbol (recommended) or a company name. Direct symbol searches are faster; generic searches may trigger multiple API calls.
* **Dynamic Watchlist & Portfolio:** Add/remove stocks, track shares owned, and view real-time total position values.
* **Smart Price Refresh:** Update all prices for portfolio and watchlist stocks simultaneously.
* **Persistent Storage:** Data is saved in `localStorage` and persists across sessions.
* **U.S. Stock Market Coverage:** Provides data exclusively for U.S.-listed equities.
* **Responsive Design:** Works seamlessly on desktop, tablet, and mobile devices using Tailwind CSS.

---

## 🏗️ Technical Highlights

* **Single Source of Truth:** API data is stored in memory before rendering to the UI to prevent crashes and support offline persistence.
* **Rate Limit Awareness:** Manages Alpha Vantage free-tier limits (25 calls/day, 5 calls/min) with soft-fail handling.
* **Custom Error Handling:** Network, API, or missing data triggers user-friendly notifications rather than console logs.
* **Memory-Safe DOM Manipulation:** Uses `document.createElement()` with `innerHTML` to preserve event listeners and prevent memory leaks.
* **Modern API Integration:** Uses `fetch` and `async/await` for asynchronous data retrieval.

---

## 🛠️ Setup Instructions

1. Clone the repository to your local machine:

   ```bash
   git clone <repository-url>
   ```

2. Obtain a free API key from Alpha Vantage.
3. Open `app.js` (or `config.js` if configured) and add your API key to the designated `API_KEY` variable.
4. Open `index.html` in a modern web browser (or use an extension like Live Server).
5. Start using the app immediately. Tailwind CSS is loaded via CDN, so no additional `npm install` or build setup is required.

---

## 📂 Project Structure

- `index.html` – Main HTML structural file
- `app.js` – All JavaScript logic, state management, and API handling

*Note: Tailwind CSS is included via CDN in `index.html`; no separate CSS file is required.*

---
## 🚀 How to Use

1. **Search for Stocks:** Enter a stock symbol (recommended) or a company name. Click **Search**. *(Example: "AAPL" or "Bank")*.
2. **Add to Portfolio:** After a successful search, enter the number of shares owned and click **Update Shares**.
3. **Add to Watchlist:** After a successful search, click **Add to Watchlist** to save the stock for quick access.
4. **Refresh Prices:** Click **Refresh Prices** in the Watchlist section to update all portfolio and watchlist stocks in real time.
5. **Manage Portfolio/Watchlist:** Remove items as needed using the trash icon. All changes will persist across sessions.

---

## ⚡ API Usage & Best Practices

To stay within free-tier limits and ensure smooth performance:

* **Search:** Limit to 3 individual searches/day; only 1 generic company name search/day (e.g., "Bank").
* **Portfolio & Watchlist:** Limit additions to 3 stocks for testing; each action consumes an API call.
* **Price Refresh / Page Reload:** Limit to 1–2 times per day. Refreshing fetches current data for all portfolio and watchlist stocks.
* **Quick Search Buttons:** Use pre-set buttons like **AAPL** or **TSLA** to minimize complex API requests.

> Following these guidelines prevents hitting API limits and ensures a seamless experience.