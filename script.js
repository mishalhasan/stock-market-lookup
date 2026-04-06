/*----  Global Variables ----*/
import { API_KEY } from "./config.js";
let watchlist = [];
let portfolio = [];
let pickerCache = {};
const cache = {}; //global cache

/*---- Search State ----*/

let searchState = {
  stage: null, // e.g., 'userInput', 'symbolFetch', 'companySearch', 'pickerFetch', 'pickerDisplay'
  status: null, // 'pending', 'success', 'fail', 'abandoned'
  lastError: null, // Error object or message
  data: null, // Stock or picker data
  terminate: false, //Program exit marker
};

/*---- Load Dom Elements ----*/
const activeDiv = document.querySelector("#active-state-container");
const stockResults = document.querySelector("#active-stock-results");
const search_input = document.querySelector("#stock-input");
const search_form = document.querySelector("#search-form");
const search_error = document.querySelector("#search-error");
const qs_btns = document.querySelector("#quick-search-btns");
const picker_close_btn = document.querySelector("#close-picker-btn");
const picker_modal = document.querySelector("#picker-modal");
const picker_results = document.querySelector("#picker-results-container");
const inputShares = document.getElementById("shares-input");
const updateSharesBtn = document.getElementById("btn-update-shares");
const stockName = document.querySelector("#active-name");
const stockSymbol = document.querySelector("#active-symbol");
const stockPrice = document.querySelector("#active-price");
const stockChange = document.querySelector("#active-change");
const watchlistBtn = document.querySelector("#btn-add-watchlist");
const refresh_btn = document.querySelector("#btn-price-refresh");

/*---- Toast Notification System ----*/
const toastContainer = document.getElementById("toast-container");
const toastMessage = document.getElementById("toast-message");
const closeToastBtn = document.getElementById("close-toast");
let toastTimeout; // Variable to track the auto-hide timer

/*---- Setup Error Classes ----*/
class NetworkError extends Error {
  constructor(message = "Network error. Check your connection.") {
    super(message);
    this.name = "NetworkError";
  }
}

class APIError extends Error {
  constructor(message = "API error. Try again later.") {
    super(message);
    this.name = "APIError";
  }
}

class DataNotFoundError extends Error {
  constructor(message = "Data not found") {
    super(message);
    this.name = "DataNotFoundError";
  }
}

/*---- EVENT HANDLER SEARCH FUNCTIONS ----*/

/**
 * Submits form through any quick search button
 */
function handleQuickSearch(event) {
  const quickSearchButton = event.target;

  //Ensure only buttons on event delegation, lead to API call
  if (!quickSearchButton.classList.contains("quick-search-btn")) {
    return;
  }

  search_input.value = quickSearchButton.value;
  search_form.requestSubmit();
  search_input.value = "";
}

/**
 * Main search handler. Uses a waterfall approach to resolve input:
 * 1. Checks local dictionary for common aliases (e.g., 'Apple' -> 'AAPL').
 * 2. Attempts direct Global Quote API fetch (assumes input is a symbol).
 * 3. Falls back to Best Match API if direct fetch fails (assumes input is a company name).
 */

async function handleSearchForm(event) {
  event.preventDefault();

  // Disable buttons and reset search state
  disableButtons();
  resetSearchState();
  updateSearchState({ stage: "userInput", status: "pending" });

  let input = search_input.value.trim();

  try {
    // Input validation
    if (!input) {
      throw new Error(
        "Input required: Please enter a stock symbol or company name.",
      );
    }
    search_error.textContent = "";

    // Show loading UI symbolFetch
    updateSearchState({ stage: "symbolFetch" });
    displaySearchLoading(`Searching for ${input} stock`);

    // Check dictionary for mapped symbols
    if (checkStockDictionary(input.toLowerCase())) {
      input = checkStockDictionary(input);
    }

    // Attempt to fetch all stock data
    updateSearchState({ stage: "allFetch" });
    let allStockData = await getAllStockData(input);

    if (allStockData) {
      cache[allStockData.symbol] = allStockData;
      displayActiveStockData(allStockData);
      updateSearchState({ status: "success", terminate: true });
      return;
    }

    // If not found, try best match
    await delay(2000); // API rate limit
    updateSearchState({ stage: "bestMatch", status: "pending" });

    const bestMatch = await getBestMatch(input);
    if (!bestMatch || bestMatch.length === 0) {
      throw new DataNotFoundError(`No matching stock found for "${input}"`);
    }

    if (bestMatch.length === 1) {
      const { symbol, name } = bestMatch[0];

      if (symbol && name) {
        await delay(2000); // API rate limit
        displaySearchLoading(`Searching for ${symbol} stock`);

        let stockData = await getStockData(symbol);
        //getStockData is a soft fail for error type DataNotFoundError, so must throw explicit error here
        if (!stockData) {
          throw new DataNotFoundError(`No stock data found for ${symbol}`);
        }
        stockData = combineStockInfo(stockData, name);
        cache[stockData.symbol] = stockData;
        displayActiveStockData(stockData);
        updateSearchState({ status: "success", terminate: true });
      }
    }

    //BestMatch returned here is array of objects
    if (bestMatch.length > 1) {
      await delay(2000);
      displaySearchLoading(`Searching for stocks`);
      const pickerData = await getAllStocksPickerData(bestMatch);

      if (pickerData) {
        displayStockPicker(pickerData);

        const pickedStock = await new Promise((resolve) => {
          function stockPickerHandler(event) {
            picker_results.removeEventListener("click", stockPickerHandler);
            resolve(event.target.value); // resolve promise with selected stock
          }

          function closePickerHandler() {
            picker_close_btn.removeEventListener("click", stockPickerHandler);
            updateSearchState({
              stage: "pickerDisplay",
              status: "abandoned",
              terminate: true,
            });
            resolve(null);
          }

          picker_results.addEventListener("click", stockPickerHandler);
          picker_close_btn.addEventListener("click", closePickerHandler);
        });

        closeStockPicker();

        if (pickedStock === null) {
          return;
        }

        displaySearchLoading(`Loading ${pickerCache[pickedStock]}`);

        // Grab stock info from stockpicker cache based on user selection & update UI
        displayActiveStockData(pickerCache[pickedStock]);
        //cache[allStockData.symbol] = allStockData;
        updateSearchState({ status: "success", terminate: true });
        return;
      }
    }
  } catch (err) {
    updateSearchState({ status: "fail", lastError: err, terminate: true });
    search_error.textContent = err.message;
  } finally {
    // Always executed: re-enable buttons and hide loading
    enableButtons();
    hideLoading();
  }
}

/*--- HANDLE SEARCH FUNCTIONS ---*/

/**
 * Fetches quote data for a specific symbol.
 * Note: Returns null instead of throwing DataNotFoundError to allow fallback searches.
 */
async function getStockData(symbol) {
  try {
    const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${API_KEY}`;
    await delay(2000);
    const data = await fetchURL(url);

    //API-level erros: check if valid data came back from API response
    handleAPIErrors(data, "Global Quote");

    //Extract Stock Data and return formated data
    const stockData = {};
    for (const key in data["Global Quote"]) {
      const value = data["Global Quote"][key];
      const newKey = key.replace(/^\d+\. /, "");

      stockData[newKey] = value;
    }

    return stockData;
  } catch (err) {
    if (err instanceof DataNotFoundError) {
      console.warn("Stock not found for symbol:", symbol);
      return null; //  SOFT FAIL → allow fallback
    }

    console.error("getStockSymbol fx", err);
    throw err;
  }
}

/**
 * Fetches the official company name for a symbol.
 * Required because the Global Quote endpoint only returns the ticker symbol.
 */
async function getCompanyName(symbol) {
  try {
    // Stop early if search terminated
    if (searchState.terminate) return;

    const url = `https://www.alphavantage.co/query?function=SYMBOL_SEARCH&keywords=${symbol}&apikey=${API_KEY}`;
    await delay(2000);
    const data = await fetchURL(url);
    handleAPIErrors(data, "bestMatches");
    const company = data["bestMatches"][0]["2. name"];
    return company;
  } catch (err) {
    console.error(`Error in getCompanyName(${symbol}):`, err);
    throw err;
  }
}

/**
 * Fetches all relevant stock data for a given symbol.
 * Combines API data with cached company information.
 * Throws an error if stock data or company info cannot be retrieved.
 */
async function getAllStockData(symbol) {
  try {
    if (searchState.terminate) return;

    const stockData = await getStockData(symbol);

    if (!stockData || Object.keys(stockData).length === 0) {
      return null;
    }

    // Get company name from cache if available; otherwise, fetch from API
    let compName = cache[stockData.symbol]?.name;
    if (!compName) {
      compName = await getCompanyName(stockData.symbol);
      if (!compName) {
        throw new DataNotFoundError(
          `No company data found for ${stockData.symbol}`,
        );
      }
    }
    const allStockData = combineStockInfo(stockData, compName);
    return allStockData;
  } catch (err) {
    // last_error = err;
    console.error(`Error in getAllStockData(${symbol}):`, err);
    throw err;
  }
}

/**
 * Fetches potential stock matches for a given query, filtering for US Equities.
 * Returns a single object if an exact match is found, or an array of options for the picker modal.
 */
async function getBestMatch(input) {
  try {
    const url = `https://www.alphavantage.co/query?function=SYMBOL_SEARCH&keywords=${input}&apikey=${API_KEY}`;
    await delay(2000);

    const data = await fetchURL(url);
    handleAPIErrors(data, "bestMatches");

    // Filter for US equities to reduce API rate limit issue
    const usEquities = data.bestMatches.filter((match) => {
      return (
        match["3. type"].toLowerCase() === "equity" &&
        match["4. region"].toLowerCase() === "united states"
      );
    });

    //If no matches, return error
    if (!usEquities || usEquities.length === 0) {
      throw new DataNotFoundError("No matching results found");
    }

    //If only one match, return symbol + compName
    if (usEquities.length === 1) {
      return [
        {
          symbol: usEquities[0]["1. symbol"],
          name: usEquities[0]["2. name"],
        },
      ];
    }

    //If more than 1 match, return entire array
    if (usEquities.length > 1) return usEquities;
  } catch (err) {
    console.error(err);
    throw err;
  }
}

/**
 * Gets all the stock picker data needed from SYMBOL_SEARCH endpoint and formats it. Also adds data to cache to reduce API calls
 */
async function getAllStocksPickerData(compData) {
  try {
    pickerCache = {};

    for (const stock of compData) {
      const symbol = stock["1. symbol"];
      const compName = stock["2. name"];

      await delay(3000);
      const stockData = await getStockData(symbol);

      const fullStockData = {
        symbol,
        name: compName,
        open: stockData.open,
        high: stockData.high,
        low: stockData.low,
        price: stockData.price,
        volume: stockData.volume,
        change: stockData.change,
        ["change percent"]: stockData["change percent"],
      };

      pickerCache[symbol] = fullStockData;
    }

    return Object.values(pickerCache);
  } catch (err) {
    console.error(`Error in getAllStocksPickerData:`, err);
    throw err;
  }
}

/*--- DISPLAY SEARCH FUNCTIONS ---*/

/**
 * Takes in stocks data from SYMBOL_SEARCH to be displayed in picker modal.
 */
async function displayStockPicker(pickerStocks) {
  let textHTML = "";

  for (const stockData of pickerStocks) {
    // Parse numeric values once
    const priceNum = parseFloat(stockData.price);
    const changeNum = parseFloat(stockData.change);
    const changePercentNum = parseFloat(stockData["change percent"]);

    // Determine font color and change text
    let fontColor;
    let stockChangeTxt;

    if (changeNum < 0) {
      fontColor = "text-red-500";
      stockChangeTxt = `-$${Math.abs(changeNum).toFixed(2)} (${Math.abs(changePercentNum).toFixed(2)})`;
    } else {
      fontColor = "text-green-500";
      const sign = changeNum === 0 ? "" : "+";
      stockChangeTxt = `${sign}$${changeNum.toFixed(2)} (+${changePercentNum.toFixed(2)})`;
    }

    //Build HTML button
    textHTML += `<button value="${stockData.symbol}"
              class="w-full text-left bg-white border border-gray-200 rounded-xl p-4 flex justify-between items-center group hover:border-blue-600 hover:bg-blue-50 hover:shadow-sm transition-all cursor-pointer"
            >
              <span class="flex flex-col gap-1 pr-4">
                <span class="font-bold text-gray-900 text-lg">${stockData.symbol}</span>
                <span class="text-sm text-gray-500">${stockData.name}</span>
                <span
                  class="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs text-gray-400 font-medium"
                >
                  <span class="flex items-center gap-1.5"
                    ><i class="fa-solid fa-chart-line"></i> Equity</span
                  >
                  <span class="flex items-center gap-1.5"
                    ><i class="fa-solid fa-globe"></i> United States</span
                  >
                  <span class="flex items-center gap-1.5"
                    ><i class="fa-solid fa-coins"></i> USD</span
                  >
                </span>
              </span>
              <span class="flex items-center gap-4 shrink-0">
                <span class="flex flex-col items-end gap-0.5">
                  <span class="font-bold text-gray-900 text-lg">\$${priceNum.toFixed(2)}</span>
                  <span class="text-sm ${fontColor} font-medium"
                    >${stockChangeTxt}%</span
                  >
                </span>
                <i
                  class="fa-solid fa-chevron-right text-gray-300 group-hover:text-blue-500 transition-colors"
                ></i>
              </span>
            </button>
           `;
  }

  picker_results.innerHTML = textHTML;

  picker_modal.classList.remove("hidden");
}

/**
 * Updates the UI with the active stock's data.
 * Handles numeric parsing, formatting, and visual styling based on stock performance.
 */
function displayActiveStockData(stockData) {
  if (!stockData || !stockData.symbol) {
    console.warn("Skipping invalid stock data:", stockData);
    return; // exit early if data is missing
  }

  const stockChange = document.querySelector("#active-change");
  const openVal = document.querySelector("#open-amount");
  const highVal = document.querySelector("#high-amount");
  const lowVal = document.querySelector("#low-amount");
  const volVal = document.querySelector("#volume-amount");

  //Ensure search article is visible (fallback)
  activeDiv.classList.remove("hidden");
  stockResults.classList.remove("hidden");

  //stockName.textContent = compName;
  stockName.textContent = stockData.name;
  stockSymbol.textContent = stockData.symbol;

  const priceNum = parseFloat(stockData.price);
  const changeNum = parseFloat(stockData.change);
  const changePercentNum = parseFloat(stockData["change percent"]);
  const openNum = parseFloat(stockData.open);
  const highNum = parseFloat(stockData.high);
  const lowNum = parseFloat(stockData.low);
  const volumeNum = parseInt(stockData.volume, 10); // volume is always integer

  stockPrice.textContent = `$${priceNum.toFixed(2)}`;
  openVal.textContent = `$${openNum.toFixed(2)}`;
  highVal.textContent = `$${highNum.toFixed(2)}`;
  lowVal.textContent = `$${lowNum.toFixed(2)}`;
  volVal.textContent = volumeNum.toLocaleString();

  // Display change with proper sign and color
  if (changeNum < 0) {
    stockChange.classList.add("text-red-500");
    stockChange.classList.remove("text-green-500");
    stockChange.textContent = `-$${Math.abs(changeNum).toFixed(2)} (${Math.abs(changePercentNum).toFixed(2)}%)`;
  } else {
    stockChange.classList.add("text-green-500");
    stockChange.classList.remove("text-red-500");
    const sign = changeNum === 0 ? "" : "+";
    stockChange.textContent = `${sign}$${changeNum.toFixed(2)} (+${changePercentNum.toFixed(2)}%)`;
  }

  // Display any saved shares for the stock
  displayCurrentStockShares(stockData.symbol, priceNum);

  hideLoading();
}

/*---- PORTFOLIO MANAGEMENT ----*/

/*
 * Updates the user's portfolio based on input shares.
 * Adds a new stock or updates an existing one in the portfolio array and saves it to localStorage.
 * Updates the UI with current stock holdings, total portfolio value, and ensures the watchlist reflects changes.
 */
function handleShares() {
  const numShares = Number(inputShares.value);
  const searchStockName = validText(stockName.textContent);
  const searchSymbol = validText(stockSymbol.textContent);
  const searchPrice = validPrice(stockPrice.textContent);

  if (isNaN(numShares)) return;

  const stock = portfolio.find((item) => item.symbol === searchSymbol);

  //Update portfolio price if stock exists, or else add to portfolio
  if (stock) {
    stock.shares = numShares;
    stock.lastPrice = searchPrice;
  } else {
    portfolio.push({
      name: searchStockName,
      symbol: searchSymbol,
      shares: numShares,
      lastPrice: searchPrice,
    });
  }

  localStorage.setItem("portfolio", JSON.stringify(portfolio));

  //display saved shares for searched stocks, update displayed portfolio value
  displayCurrentStockShares(searchSymbol, searchPrice, numShares);
  displayPortfolioValue();

  //Update watchlist if stock exists in watchlist
  const watchlistStock = watchlist.find((item) => item.symbol === searchSymbol);
  if (watchlistStock) handleWatchlist();

  //Clear input field
  inputShares.value = "";
}

/*
 * Updates the UI to show the number of shares and current value of a specific stock.
 * Computes total position value as price × number of shares and displays it in designated elements.
 */

function displayCurrentStockShares(symbol, price, numShares) {
  const posVal = document.getElementById("position-val");
  const holdings = document.getElementById("holdings");
  price = validPrice(price);

  if (numShares == null) {
    numShares = getShares(symbol);
  }

  holdings.textContent = `${numShares} shares`;
  const totalValue = numShares * price; // number
  posVal.textContent = `$${totalValue.toFixed(2)}`; // rounded for UI
}

/*
 * Calculates total portfolio value using the ALREADY SAVED data in the portfolio array.
 * Never fetches data from the API.
 */
function calcTotalPortfolio() {
  if (portfolio.length === 0) return 0;

  let totalValue = 0;
  for (const stock of portfolio) {
    totalValue += Number(stock.shares) * validPrice(stock.lastPrice);
  }
  return totalValue;
}

/*
 * Fetches the current stock price for a given symbol from the API.
 * Returns 0 if no price is found and displays an error message on failure.
 */
async function getcurrentPrice(symbol, showError = true) {
  try {
    const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${API_KEY}`;
    await delay(2000);
    const data = await fetchURL(url);

    //API-level erros: check if valid data came back from API response

    // Soft fail for rate limits
    if (data.Note || data.Information) {
      console.warn(`Rate limit hit for ${symbol}`);
      return null;
    }

    // Soft fail for bad symbols
    if (
      !data["Global Quote"] ||
      Object.keys(data["Global Quote"]).length === 0
    ) {
      console.warn(`No quote data for ${symbol}`);
      return null;
    }
    const price = data["Global Quote"]["05. price"];

    return validPrice(price);
  } catch (err) {
    if (showError) showToastError(err.message);
    console.error(`Error in getcurrentPrice(${symbol}):`, err);
    return null; //always return null on failure
  }
}

/*
 * Updates the page header to show the total portfolio value and number of stocks owned.
 */
function displayPortfolioValue() {
  const portfolioValEl = document.querySelector("#header-portfolio-value");
  const stockOwnedEl = document.querySelector("#header-stocks-owned");

  const totalPortfolioVal = calcTotalPortfolio();
  const numStocks = portfolio.length;

  portfolioValEl.textContent = `$${formatPrice(totalPortfolioVal)}`;
  stockOwnedEl.textContent = numStocks;
}

/*----  WATCHLIST FUNCTIONS ----*/

/*
 * Refreshes the watchlist by adding the current stock and re-rendering the watchlist section.
 */
function handleWatchlist() {
  addToWatchlist();
  displayWatchlist();
}

/*
 * Triggered by the "Refresh Prices" button.
 * Disables the button during the update to prevent multiple clicks,
 * then calls syncAllPrices() to update prices for both portfolio and watchlist,
 * respecting API limits and handling errors gracefully.
 */
async function handleRefresh(event) {
  // Prevent multiple clicks
  const btn = event.currentTarget;
  btn.disabled = true;

  //Update middleman in data flow
  await syncAllPrices(true);

  btn.disabled = false;
}

/*
 * Background worker to refresh prices for ALL stocks (Watchlist + Portfolio).
 * Respects API limits and silently falls back to old prices if limits are hit.
 */
async function syncAllPrices() {
  // Combine both arrays to reduce redundant API calls
  const allSymbols = new Set();
  portfolio.forEach((s) => allSymbols.add(s.symbol));
  watchlist.forEach((s) => allSymbols.add(s.symbol));

  let errorOccured = false;

  // Fetch new prices for each stock from set
  for (const symbol of allSymbols) {
    // Suppress errors during bulk refresh (showError=false) to avoid flooding the user with messages
    const newPrice = await getcurrentPrice(symbol, false);

    // If newPrice is null, indicates error and price does not change,
    // otherwise price updates in both datasets.
    if (newPrice !== null && !isNaN(newPrice)) {
      // Update Portfolio
      const portStock = portfolio.find((s) => s.symbol === symbol);
      if (portStock) portStock.lastPrice = newPrice;

      // Update Watchlist
      const watchStock = watchlist.find((s) => s.symbol === symbol);
      if (watchStock) watchStock.price = newPrice;
    } else {
      // Ensures on any error, error is tracked
      errorOccured = true;
    }
  }

  // Save the synced data
  localStorage.setItem("portfolio", JSON.stringify(portfolio));
  localStorage.setItem("watchlist", JSON.stringify(watchlist));

  // Update the UI
  displayPortfolioValue();
  displayWatchlist();

  // Notify user if fallback data used
  if (errorOccured) {
    showToastError(
      "API limit reached. Showing last known prices for some stocks.",
    );
  }
}

/*
 * Adds the current stock to the watchlist or updates its existing entry.
 * Grabs stock info (name, symbol, price, change) directly from rendered active stock search result;
 * keeps price, change, and shares in sync with the portfolio, and saves to localStorage.
 */
function addToWatchlist() {
  const watchlistStockName = validText(stockName.textContent);
  const watchlistSymbol = validText(stockSymbol.textContent);
  const watchlistPrice = validPrice(stockPrice.textContent);
  const watchlistStockChange = validText(stockChange.textContent);
  const numShares = Number(getShares(watchlistSymbol));

  const stock = watchlist.find((item) => item.symbol === watchlistSymbol);

  //Add new stock to watchlist, but if stock exists updates existing watchlist data
  if (stock) {
    stock.change = watchlistStockChange;
    stock.price = watchlistPrice;
    stock.shares = numShares;
  } else {
    watchlist.push({
      name: watchlistStockName,
      symbol: watchlistSymbol,
      price: watchlistPrice,
      shares: numShares,
      change: watchlistStockChange,
    });
  }
  //Save data
  localStorage.setItem("watchlist", JSON.stringify(watchlist));
}

/*
 * Renders all stocks in the watchlist, clearing previous rows first.
 * Shows the empty state if the watchlist is empty.
 * Uses `createWatchlistRow` to generate each stock row and appends it to the container.
 */
function displayWatchlist() {
  //Clear render of any previous populated container
  const populatedContainer = document.getElementById("watchlist-populated");
  populatedContainer.innerHTML = "";

  //Make appropriate watchlist sub-section visisble based on state of watchlist
  const emptyWatclist = document.getElementById("watchlist-empty");

  //Ensure watchlist is not empty
  if (watchlist.length === 0) {
    emptyWatclist.classList.remove("hidden");
    return;
  }

  emptyWatclist.classList.add("hidden");

  //Loop through global watchlist array and create each row to be appended to container
  for (const stock of watchlist) {
    const rowWatchlist = createWatchlistRow(stock);
    populatedContainer.appendChild(rowWatchlist);
  }
}

/*
 * Creates a new row in the watchlist section for a single stock object.
 * Populates the row with stock details (name, symbol, price, change, shares, total value)
 * and attaches event listeners to the action buttons (e.g., delete).
 * Designed to handle button interactions dynamically while keeping the row self-contained.
 */
function createWatchlistRow(stock) {
  const article = document.createElement("article");
  article.className =
    "bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-6 transition-all hover:shadow-md";

  //Calculate position value for each stock, fallback conversion
  const posValue = validPrice(stock.price) * Number(stock.shares);

  //Split stock change string and determine css for change value
  const { changePrice, changePercent } = splitChangeString(stock.change);
  const colorClass =
    validPrice(changePrice) >= 0
      ? "text-green-500 bg-green-50"
      : "text-red-500 bg-red-50";

  article.innerHTML = `
  <div class="flex-1 w-full md:w-auto">
    <h4 class="font-bold text-gray-900 text-lg">${stock.name}</h4>
    <p class="text-xs text-gray-500 font-bold uppercase tracking-wider">
      ${stock.symbol}
    </p>
  </div>

  <div class="flex-1 text-center font-black text-2xl text-gray-900 w-full md:w-auto">
    $${stock.price}
  </div>

  <div class="flex flex-col items-center justify-center w-full md:w-auto gap-0.5">
    <span class="${colorClass} font-bold rounded-full px-1 py-1 text-sm">
      ${changePrice}
    </span>
    <span class="${colorClass} font-bold rounded-full px-1 py-1 text-sm">
      ${changePercent}
    </span>
  </div>

  <div class="flex-1 text-center text-gray-500 font-semibold w-full md:w-auto">
    ${stock.shares} shares
  </div>

  <div class="flex-1 text-center font-bold text-xl text-gray-900 w-full md:w-auto">
    $${formatPrice(posValue)}
  </div>

  <div class="flex gap-3 justify-end w-full md:w-auto">
        <button class="view-btn w-10 h-10 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-600 hover:text-white transition-colors flex items-center justify-center shadow-sm" title="View Details">
          <i class="fa-solid fa-magnifying-glass"></i>
        </button>
        <button class="delete-btn w-10 h-10 bg-red-50 text-red-600 rounded-lg hover:bg-red-600 hover:text-white transition-colors flex items-center justify-center shadow-sm" title="Remove from Watchlist">
          <i class="fa-solid fa-trash-can"></i>
        </button>
      </div>

`;

  const delete_btn = article.querySelector(".delete-btn");
  delete_btn.addEventListener("click", () => {
    //Remove stock in watchlist
    watchlist = watchlist.filter((s) => s.symbol !== stock.symbol);

    //Update localStorage & re-render UI
    localStorage.setItem("watchlist", JSON.stringify(watchlist));
    displayWatchlist();
  });

  //Shows user details of stock data
  const viewBtn = article.querySelector(".view-btn");
  viewBtn.addEventListener("click", () => {
    search_input.value = stock.symbol;
    search_form.requestSubmit();
  });

  return article;
}

/*-- HELPER FUNCTIONS --*/

/**
 * Shows a toast error message to the user for API/background issues.
 * Uses a small setTimeout to ensure CSS transitions trigger smoothly, since JS
 * executes immediately and may otherwise skip transition effects.
 */
function showToastError(message) {
  //Set custom error msg, show to user
  toastMessage.textContent = message;
  toastContainer.classList.remove("hidden");

  // Small delay to allow the CSS transition to trigger smoothly but quick enough for no user lag
  setTimeout(() => {
    toastContainer.classList.remove("translate-y-[-20px]", "opacity-0");
    toastContainer.classList.add("translate-y-0", "opacity-100");
  }, 10);

  // Reset any existing timer, then auto-hide after 5 seconds
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => hideToast(), 5000);
}

/**
 * Hides the toast error message with a slide/fade effect.
 * Uses setTimeout to wait for the Tailwind transition duration (300ms) before fully
 * hiding the element.
 */
function hideToast() {
  // Slide it back up and fade it out
  toastContainer.classList.remove("translate-y-0", "opacity-100");
  toastContainer.classList.add("translate-y-[-20px]", "opacity-0");

  // Wait for the CSS transition (300ms) to finish before actually hiding it
  setTimeout(() => {
    toastContainer.classList.add("hidden");
  }, 300);
}

/*
 * Splits a stock change string (e.g., "+$1.75 (+0.67%)") into { changePrice, changePercent }.
 * Returns the full string as changePrice with empty changePercent if format is unexpected.
 */
function splitChangeString(changeStr) {
  // Find the index of the space right before the '('
  const index = changeStr.lastIndexOf(" (");
  if (index === -1) {
    // fallback if format is unexpected
    return { changePrice: changeStr, changePercent: "" };
  }
  const changePrice = changeStr.slice(0, index).trim(); // "+$1.75" or "-$0.50"
  const changePercent = changeStr.slice(index).trim(); // "(+0.67%)" or "(-0.20%)"
  return { changePrice, changePercent };
}

/*
 * Returns the number of shares owned for a given stock symbol.
 * Returns 0 if the stock is not in the portfolio.
 */
function getShares(symbol) {
  const stock = portfolio.find((item) => item.symbol === symbol);

  if (!stock) return 0;
  return Number(stock.shares) || 0;
}

/**
 * Loads portfolio/watchlist if set from localStorage to maintain persistence
 */

function loadData() {
  const storedPortfolio = JSON.parse(localStorage.getItem("portfolio"));
  const storedWatchlist = JSON.parse(localStorage.getItem("watchlist"));

  if (storedPortfolio) portfolio = storedPortfolio;
  if (storedWatchlist) watchlist = storedWatchlist;
}

/**
Extracts a clean numeric value from a formatted string (e.g., "$1,234.56" -> 1234.56).
Returns NaN if the input is invalid.
*/
function validPrice(input) {
  if (input === null || input === undefined) return NaN;

  const cleaned = String(input)
    .trim()
    .replace(/[^0-9.-]+/g, "");

  const num = Number(cleaned);

  return isNaN(num) ? NaN : num;
}

/**
 * Ensures any text is only a cleaned up text content or returns empty string
 */
function validText(input) {
  return input ? input.trim() : "";
}

/**
 * Reformats number into a price with commas and upto 2 decimal place
 */
function formatPrice(num) {
  return num.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Combines stock data, with company name in order to maintain 1 set of data being passed through and reduces fragmented data due to data being
 * fetched from multiple API's. Can access company name via ".name"
 */
function combineStockInfo(stockData, compName) {
  //Combine into one object
  const allStockData = { ...stockData, name: compName };

  return allStockData;
}

/**
 * Updates one or more fields in searchState (stage, status, lastError, data).
 * Deep copies data if it’s an object/array to avoid shared references.
 * Automatically handles terminal states: hides loading, enables buttons, and displays errors if status is 'fail'.
 * Example: updateSearchState({ stage: 'userInput', status: 'pending', data: { stocks: [] } }).
 */
function updateSearchState(updates) {
  for (let key in updates) {
    if (key in searchState) {
      if (
        key === "data" &&
        updates.data !== null &&
        typeof updates.data === "object"
      ) {
        searchState.data = JSON.parse(JSON.stringify(updates.data));
      } else {
        searchState[key] = updates[key];
      }
    } else {
      console.warn(`Invalid key: ${key}`);
    }
  }

  if (searchState.terminate) {
    hideLoading();
    enableButtons();
    if (searchState.status === "fail" && searchState.lastError) {
      displayError(searchState.lastError);
    }
  }
}

/**
 * Resets searchState to initial values, replacing the object entirely.
 */
function resetSearchState() {
  searchState = {
    stage: null,
    status: null,
    lastError: null,
    data: null,
    terminate: false,
  };
}

/**
 * Closes stock picker modal popup
 */
function closeStockPicker() {
  picker_modal.classList.add("hidden");
}

/**
 * Toggles loader to hide, should be used after API call
 */
function hideLoading() {
  // after fetch
  document.getElementById("loading").classList.replace("flex", "hidden");
}

/**
 * Toggles loader to show, should be used before API call
 */
function showLoading() {
  // show loading
  document.getElementById("loading").classList.replace("hidden", "flex");
  document.getElementById("active-stock-results").classList.add("hidden");
}

/**
 * Loading spin wheel to help improve UI/UX for user while API is being fetched
 */
function displaySearchLoading(searchTxt) {
  //const activeDiv = document.querySelector("#active-stock-section");

  //Make Stock results section visible and ensure stocksresults are not visible
  activeDiv.classList.remove("hidden");
  //stockResults.classList.add("hidden");
  showLoading();

  document.querySelector("#loading_txt").textContent = `${searchTxt} ...`;
}

/**
 * Enables buttons requiring API usage on webpage to regulate API calls. Re-enabled either on final API error or success
 */
function enableButtons() {
  document
    .querySelectorAll("#search-section button")
    .forEach((b) => (b.disabled = false));
}

/**
 * Disables buttons on web-page requiring API calls when API calls are going through
 */
function disableButtons() {
  document
    .querySelectorAll("#search-section button")
    .forEach((b) => (b.disabled = true));
}

/**
 * Adds delay, to create a pause in program execution. Used primarily on API calls to avoid rate limiting
 */
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Checks if company name matches any famous companies to improve ux for companies with different listed names
 */
function checkStockDictionary(symbol) {
  const stockAliases = {
    apple: "AAPL",
    google: "GOOGL",
    alphabet: "GOOGL",
    facebook: "META",
    meta: "META",
    amazon: "AMZN",
    tesla: "TSLA",
    microsoft: "MSFT",
    netflix: "NFLX",

    // Tech & AI
    nvidia: "NVDA",
    amd: "AMD",
    intel: "INTC",
    oracle: "ORCL",
    salesforce: "CRM",
    adobe: "ADBE",
    palantir: "PLTR",
    uber: "UBER",
    airbnb: "ABNB",
    spotify: "SPOT",

    // Finance
    jpmorgan: "JPM",
    "goldman sachs": "GS",
    "bank of america": "BAC",
    "wells fargo": "WFC",
    citigroup: "C",
    visa: "V",
    mastercard: "MA",
    paypal: "PYPL",
    "american express": "AXP",

    // Consumer & Retail
    walmart: "WMT",
    costco: "COST",
    target: "TGT",
    "coca cola": "KO",
    pepsi: "PEP",
    nike: "NKE",
    starbucks: "SBUX",
    mcdonalds: "MCD",
    disney: "DIS",

    // Automotive & Energy
    ford: "F",
    "general motors": "GM",
    exxon: "XOM",
    chevron: "CVX",
    shell: "SHEL",
    bp: "BP",

    // Healthcare & Pharma
    pfizer: "PFE",
    moderna: "MRNA",
    "johnson & johnson": "JNJ",
    "eli lilly": "LLY",
    abbvie: "ABBV",
    merck: "MRK",

    // Telecom & Media
    verizon: "VZ",
    "at&t": "T",
    comcast: "CMCSA",

    // International / Other big names
    alibaba: "BABA",
    tencent: "TCEHY",
    toyota: "TM",
    samsung: "SSNLF",
    lvmh: "LVMUY",
  };

  if (stockAliases[symbol]) {
    return stockAliases[symbol];
  }
}

/**
 * Fetches data from API, while handling HTTP/Parsing errors
 */
async function fetchURL(url) {
  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new APIError(`HTTP error: ${response.status}`);
    }

    const data = await response.json();

    return data;
  } catch (err) {
    if (err instanceof TypeError) {
      throw new NetworkError("Network error: Unable to reach the server");
    }

    if (err instanceof SyntaxError) {
      throw new APIError("Invalid JSON / API error");
    }

    throw err; // already a custom or unknown error
  }
}

/**
 * Throws errors for API level errors based on Alphaadvantage API responses
 */
function handleAPIErrors(data, apiObj) {
  if (data["Error Message"]) {
    throw new APIError("Invalid API call");
  }

  if (data["Note"] || data["Information"]) {
    throw new APIError();
  }

  if (!data?.[apiObj] || Object.keys(data[apiObj]).length === 0) {
    throw new DataNotFoundError();
  }
}

/**
 * Displays errors to users above search bar
 */
function displayError(err) {
  console.error(err);
  if (err instanceof TypeError) {
    search_error.textContent =
      "Network error: Unable to reach the server. Check your internet connection.";
  } else {
    search_error.textContent = err.message;
  }
}

/*-- ON PAGE LOAD --*/

/* EVENT Listeners:  for search and related user actions*/
document.addEventListener("DOMContentLoaded", function () {
  loadData();
  displayPortfolioValue();
  displayWatchlist();

  //Event Listener for background API issues error msg pop up
  closeToastBtn.addEventListener("click", hideToast);

  //Event Listener on Search Bar
  search_form.addEventListener("submit", handleSearchForm);
  qs_btns.addEventListener("click", handleQuickSearch);
  watchlistBtn.addEventListener("click", handleWatchlist);

  // Save shares in Portfolio Management on button click or 'enter' key
  updateSharesBtn.addEventListener("click", handleShares);
  inputShares.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      handleShares();
    }
  });

  //Refresh Watchlist Prices Event Listener
  refresh_btn.addEventListener("click", handleRefresh);
});

console.log("Page is Working");
