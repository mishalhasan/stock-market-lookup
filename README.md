# Stock Tracker App

The **Stock Market Lookup** is a professional web application for tracking U.S. stock market data, managing a portfolio, and maintaining a watchlist. Users can search for publicly traded companies and access real-time information such as current stock prices, daily changes, and company details, all within a clean and intuitive interface. By integrating the Alpha Vantage API on the free tier, the app gracefully handles API rate limits while providing persistent portfolio and watchlist management for a seamless user experience

- **Frontend:** HTML, CSS, JavaScript
- **API:** [Alpha Vantage](https://www.alphavantage.co/)
- **Styling:** Tailwind CSS (via CDN)
- **Version Control:** Git & GitHub

---

## ✨ Features

* **Smart Search Engine:** Enter a stock symbol or a company name. Direct symbol searches are recommended for faster results. Generic company name searches may trigger multiple API calls due to the waterfall search method.
* **Dynamic Watchlist:** Add and remove stocks from your watchlist. Detailed stock metrics are displayed for each entry.
* **Portfolio Management:** Enter shares owned and track real-time total position values.
* **Smart Price Refreshing:** Update all prices for portfolio and watchlist stocks simultaneously.
* **Persistent Storage:** Portfolio and watchlist data is saved in `localStorage` and persists across sessions.
* **U.S. Stock Market Coverage:** The app only provides data for U.S. stocks.

---

## 🏗️ Technical Highlights

* **Single Source of Truth:** API data is fetched and stored in memory first, then rendered to the UI. Prevents UI crashes if the API is temporarily unavailable.
* **Rate Limit Awareness:** Alpha Vantage free-tier limits 25 API calls per day and 5 per minute. Features like search, add-to-portfolio, add-to-watchlist, and refresh prices consume API calls. Use them cautiously.
* **Custom Error Handling:** Network errors, API errors, and missing data trigger user-friendly messages.
* **Memory-Safe DOM Manipulation:** Uses `document.createElement()` alongside `innerHTML` for dynamic UI updates while preventing memory leaks.

---

## ⚡ Best Practices for Users

Due to API rate limits, the following usage is recommended:

* **Search:** Limit to 3 individual searches per day; only 1 generic company name search per day (e.g., "Bank") to explore multiple results.
* **Portfolio & Watchlist:** Limit additions to 3 stocks total for testing. Adding more is possible, but each action consumes an API call.
* **Price Refresh / Page Refresh:** Limit to 1-2 times per day during active sessions. Refreshing prices fetches current data for all portfolio and watchlist stocks.
* Quick search buttons like **AAPL** or **TSLA** are available for convenience and minimize API calls.

Following these guidelines ensures smooth functionality without hitting the free-tier API limits.

---

## 🛠️ Setup Instructions

1. Clone the repository:

   ```bash
   git clone <repository-url>
   ```

2. Open `index.html` in a modern web browser.
3. Obtain a free API key from [Alpha Vantage](https://www.alphavantage.co/support/#api-key).
4. Add your API key to the `app.js` file in the designated variable.
5. Start using the app immediately. Tailwind CSS is loaded via CDN, so no additional setup is required.

## 💻 How to Use

1. **Search for Stocks:** Enter a stock symbol (recommended) or a company name. Click **Search**. Example: `"AAPL"` or `"Bank"` (generic search).
2. **Add to Portfolio:** After a search, enter the number of shares owned and click **Update Shares**.
3. **Add to Watchlist:** After a search, click **Add to Watchlist** to save the stock for quick access.
4. **Refresh Prices:** Click **Refresh Prices** to update all portfolio and watchlist stocks in real time.
5. **Manage Portfolio/Watchlist:** Remove items as needed. All changes persist across sessions.

## ⚠️ Notes on API Limitations

- **Daily Limit:** 25 API calls per day (free tier). Plan usage accordingly.
- **Per-Minute Limit:** 5 API calls per minute. Avoid rapid consecutive searches or refreshes.
- **Generic Searches:** Can trigger multiple API calls due to the waterfall search method. Use sparingly.
- **Recommended Testing Usage:** Use up to 3 stocks in total for search, portfolio, and watchlist combined. Refreshing prices and page reloads also count toward API usage.

## 📂 Project Structure

- `index.html` – Main HTML file  
- `app.js` – All JavaScript functionality  

Tailwind CSS is included via CDN in `index.html`; no separate CSS or build setup is required.

## 🔑 Technical Notes

- **API Integration:** Fetches stock data from Alpha Vantage using `fetch` and `async/await`.
- **Error Handling:** Try/catch blocks handle network and API errors and display user-friendly messages.
- **Data Persistence:** Uses `localStorage` to persist portfolio and watchlist data across sessions.
- **Responsive Design:** Fully functional on desktop, tablet, and mobile devices.