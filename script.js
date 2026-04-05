/*----  Global Variables ----*/
//import { API_KEY } from "./config.js";
const API_KEY = "YOUR_API_KEY";
const API_KEY2 = "DEMO";
let watchlist = [];
let portfolio = [];
let pickerCache = {};
const cache = {}; //global cache
let APIcount = 0; // Number of calls made in the current window
let windowStart = null; // Start time of the current 1-minute window
let lastCallTime = 0; // Timestamp of the last API call

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
const picker_close_bttn = document.querySelector("#close-picker-btn");
const picker_modal = document.querySelector("#picker-modal");
const picker_results = document.querySelector("#picker-results-container");
const inputShares = document.getElementById("shares-input");
const updateSharesBtn = document.getElementById("btn-update-shares");
const stockName = document.querySelector("#active-name");
const stockSymbol = document.querySelector("#active-symbol");
const stockPrice = document.querySelector("#active-price");
const stockChange = document.querySelector("#active-change");
const watchlistBtn = document.querySelector("#btn-add-watchlist");

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

/*---- EVENT HANDLER FUNCTIONS ----*/

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

/*Submits form through any quick search button*/
function handleQuickSearch(event) {
  // console.log("button is clicked");
  console.log(event.target.value);
  console.log(event.target.closest(".quick-search-btn"));
  const quickSearchButton = event.target;

  //Ensure only buttons on event delegation, lead to API call
  if (!quickSearchButton.classList.contains("quick-search-btn")) {
    return;
  }

  search_input.value = quickSearchButton.value;
  search_form.requestSubmit();
  search_input.value = "";
}

/* Validates user input and sends user input to be sent to the API. Usees a waterfall approach, to find whether user inputs symbol or company name was sent by user. 
   Global quote API limited to symbol, must seperately find company name, thus first check stock aliases dictionary, then searches global quote assuming SYMBOL. 
   If search fails assumes companyname, calls getBestMatch.*/

async function handleSearchForm(event) {
  event.preventDefault();

  // Disable buttons and reset search state
  disableButtons();
  resetSearchState();
  updateSearchState({ stage: "userInput", status: "pending" });

  let input = search_input.value.trim();

  console.log("handleSearchForm Button clicked");

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
    console.log("still running after return");
    console.log("waiting in handleSearchForm before actual getBestMatch call");

    // If not found, try best match
    await delay(2000); // API rate limit
    updateSearchState({ stage: "bestMatch", status: "pending" });

    const bestMatch = await getBestMatch(input);
    if (!bestMatch || bestMatch.length === 0) {
      throw new DataNotFoundError(`No matching stock found for "${input}"`);
    }

    console.log("BestMatch contents", bestMatch);

    if (bestMatch.length === 1) {
      const { symbol, name } = bestMatch[0];

      if (symbol && name) {
        await delay(2000); // API rate limit
        displaySearchLoading(`Searching for ${symbol} stock`);

        let stockData = await getStockData(symbol);
        console.log("stockData before", stockData);
        //getStockData is a soft fail for error type DataNotFoundError, so must throw explicit error here
        if (!stockData) {
          throw new DataNotFoundError(`No stock data found for ${symbol}`);
        }
        stockData = combineStockInfo(stockData, name);
        console.log("stockData after if+combine", stockData);
        //cache[stockData.symbol] = stockData;
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
            picker_close_bttn.removeEventListener("click", stockPickerHandler);
            updateSearchState({
              stage: "pickerDisplay",
              status: "abandoned",
              terminate: true,
            });
            resolve(null);
          }

          console.log("reached inside promise");
          picker_results.addEventListener("click", stockPickerHandler);
          picker_close_bttn.addEventListener("click", closePickerHandler);
        });

        closeStockPicker();

        if (pickedStock === null) {
          console.log("user exited picker");
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
    //console.error(err);
    updateSearchState({ status: "fail", lastError: err, terminate: true });
    search_error.textContent = err.message;
  } finally {
    // Always executed: re-enable buttons and hide loading
    enableButtons();
    hideLoading();
  }
}

/*--- HANDLE SEARCH FUNCTIONS ---*/

async function getStockData(symbol) {
  try {
    const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${API_KEY}`;
    await delay(2000);
    console.log("waiting in getStockData");
    const data = await fetchURL(url);
    console.log("in getStockData f(x)", data);

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
    //displayError(err);

    if (err instanceof DataNotFoundError) {
      console.warn("Stock not found for symbol:", symbol);
      return null; //  SOFT FAIL → allow fallback
    }

    console.error("getStockSymbol fx", err);
    throw err;
  }
}

/* Gets stock company name based on stock symbol from API. Used in displayFunction primarily for instances where symbol searched 
as global quote does not provide company name */
async function getCompanyName(symbol) {
  try {
    // Stop early if search terminated
    if (searchState.terminate) return;

    const url = `https://www.alphavantage.co/query?function=SYMBOL_SEARCH&keywords=${symbol}&apikey=${API_KEY}`;
    await delay(2000);
    console.log("waiting in getCompany");
    const data = await fetchURL(url);
    handleAPIErrors(data, "bestMatches");
    console.log(data);
    const company = data["bestMatches"][0]["2. name"];
    console.log(company);
    return company;
  } catch (err) {
    //displayError(err);
    console.error(`Error in getCompanyName(${symbol}):`, err);
    throw err;
  }
}

async function getAllStockData(symbol) {
  try {
    if (searchState.terminate) return;

    //trackAPICalls();
    const stockData = await getStockData(symbol);

    if (!stockData || Object.keys(stockData).length === 0) {
      //throw new DataNotFoundError(`No stock data found for ${symbol}`);
      console.log("I am in getAllStockData");
      return null;
    }
    console.log("Should not run if no stock data in getALLSTOCKDATA");

    // Get company name from cache or API
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

function addToCache(allStockData) {
  //Saves copy into cache
  cache[allStockData.symbol] = allStockData;
}

/*Calls API to list bestmatches for user to choose US equities based on user input and returns best symbol.
 If only one symbol found, skips stock picker, and returns symbol. Otherwise stock picker displays*/
async function getBestMatch(input) {
  try {
    const url = `https://www.alphavantage.co/query?function=SYMBOL_SEARCH&keywords=${input}&apikey=${API_KEY}`;
    console.log("waiting in getSymbol first call");
    await delay(2000);

    const data = await fetchURL(url);
    handleAPIErrors(data, "bestMatches");
    console.log(data);
    // Filter for US equities
    const usEquities = data.bestMatches.filter((match) => {
      return (
        match["3. type"].toLowerCase() === "equity" &&
        match["4. region"].toLowerCase() === "united states"
      );
    });

    console.log("UsEQUITIEs", usEquities);

    //If no matches, return error
    if (!usEquities || usEquities.length === 0) {
      //last_error = "No data found";
      //return null;
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

/*Gets all the stock picker data needed from SYMBOL_SEARCH endpoint and formats it. Also adds data to cache to reduce API calls*/
async function getAllStocksPickerData(compData) {
  try {
    pickerCache = {};

    for (const stock of compData) {
      const symbol = stock["1. symbol"];
      const compName = stock["2. name"];

      await delay(3000);
      const stockData = await getStockData(symbol);
      //setStockCache(stockData);

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

    console.log(pickerCache);
    return Object.values(pickerCache);
    //return pickerData;
  } catch (err) {
    console.error("Something went wrong fetching data from stocks picker list");
    console.error(`Error in getAllStocksPickerData:`, err);

    //displayError();
    throw err;
  }
}

/*Takes in stocks data from SYMBOL_SEARCH to be displayed in picker modal.  */
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

  //Get company name, use cache if available, add to cache if unavailable
  /*let compName = compNameCache[stockData.symbol];
  if (!compName) {
    compName = await getCompanyName(stockData.symbol);
    compNameCache[stockData.symbol] = compName;
  }*/

  //Ensure search article is visible (fallback)
  activeDiv.classList.remove("hidden");
  showActiveResults();

  console.log("In displayActive", stockData);
  console.log("Name:", stockData.name);

  //stockName.textContent = compName;
  stockName.textContent = stockData.name;
  stockSymbol.textContent = stockData.symbol;

  // Parse all numeric values once
  const priceNum = parseFloat(stockData.price);
  const changeNum = parseFloat(stockData.change);
  const changePercentNum = parseFloat(stockData["change percent"]);
  const openNum = parseFloat(stockData.open);
  const highNum = parseFloat(stockData.high);
  const lowNum = parseFloat(stockData.low);
  const volumeNum = parseInt(stockData.volume, 10); // volume is always integer

  // Display stock values
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

  //display saved shares for searched stocks
  displayCurrentStockShares(stockData.symbol, priceNum);

  hideLoading();
}

/*---- PORTFOLIO MANAGEMENT ----*/

/*Handles user portfolio shares via saving into local storage and updating current holdings via update shares buton */
function handleShares() {
  console.log("working");
  console.log(inputShares.value);
  const numShares = Number(inputShares.value);
  const searchStockName = validText(stockName.textContent);
  const searchSymbol = validText(stockSymbol.textContent);
  const searchPrice = validPrice(stockPrice.textContent);

  console.log("price:", searchPrice);
  console.log("shares:", numShares);
  if (isNaN(numShares)) return;

  const stock = portfolio.find((item) => item.symbol === searchSymbol);
  if (stock) {
    stock.shares = numShares;
    console.log(
      `Updated ${searchStockName} (${searchSymbol}) to ${numShares} shares.`,
    );
    console.log("UserPortfolio:", portfolio);
  } else {
    portfolio.push({
      name: searchStockName,
      symbol: searchSymbol,
      shares: numShares,
    });
    console.log(
      `Added ${searchStockName} (${searchSymbol}) with ${numShares} shares.`,
    );
    console.log("UserPortfolio:", portfolio);
  }

  localStorage.setItem("portfolio", JSON.stringify(portfolio));

  //display saved shares for searched stocks, update displayed portfolio value
  displayCurrentStockShares(searchSymbol, searchPrice, numShares);
  displayPortfolioValue();

  //ensure watchlist is updated with new shares added & displayed
  handleWatchlist();
}

function getShares(symbol) {
  const stock = portfolio.find((item) => item.symbol === symbol);

  if (!stock) return 0;
  return Number(stock.shares) || 0;

  // if (stock) return stock.shares;
  // console.log("In get shares", stock);
  // console.log(stock.shares);
  // return 0;
  // return stock ? stock.shares : 0;
}

function handleWatchlist() {
  console.log("in Handle Watchlist", watchlist);
  addToWatchlist();
  displayWatchlist();
}

function addToWatchlist() {
  console.log("working in watchlist");
  //Cleaning formatting for data grabbed from page
  const watchlistStockName = validText(stockName.textContent);
  const watchlistSymbol = validText(stockSymbol.textContent);
  const watchlistPrice = validPrice(stockPrice.textContent);
  const watchlistStockChange = validText(stockChange.textContent);
  const numShares = Number(getShares(watchlistSymbol));

  // value= `$${validPrice(watchlistPrice) * numShares}`,

  const stock = watchlist.find((item) => item.symbol === watchlistSymbol);

  //Add new stock to watchlist, but if stock exists updates existing watchlist data
  if (stock) {
    stock.change = watchlistStockChange;
    stock.price = watchlistPrice;
    stock.shares = numShares;
    console.log(`Updated ${watchlistStockName} (${watchlistSymbol})`);
    console.log("Watchlist:", watchlist);
  } else {
    watchlist.push({
      name: watchlistStockName,
      symbol: watchlistSymbol,
      price: watchlistPrice,
      shares: numShares,
      change: watchlistStockChange,
    });
    console.log(
      `Added ${watchlistStockName} (${watchlistSymbol}) with ${numShares} shares.`,
    );
    console.log("Watchlist:", watchlist);
  }

  localStorage.setItem("watchlist", JSON.stringify(watchlist));
}

function displayWatchlist() {
  console.log("displayWacthlist");

  //Ensure watchlist is not empty
  if (watchlist.length === 0) return;

  //Make appropriate empty watchlist sub-section invisible
  const emptyWatclist = document.getElementById("watchlist-empty");
  emptyWatclist.classList.add("hidden");

  //  const watchlistPopulated = document.getElementById("watchlist-populated");
  // watchlistPopulated.classList.remove("hidden");

  //Clear render of any previous populated container
  const populatedContainer = document.getElementById("watchlist-populated");
  populatedContainer.innerHTML = "";

  //Loop through global watchlist array and create each row to be appended to container
  for (const stock of watchlist) {
    const rowWatchlist = createWatchlistRow(stock);
    populatedContainer.appendChild(rowWatchlist);
  }
}

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

function createWatchlistRow(stock) {
  console.log("row in createwatchlist", stock.name);

  //create article el as fixed point for populating
  const article = document.createElement("article");
  article.className =
    "bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-6 transition-all hover:shadow-md";

  //Calculate position value for each stock, fallback conversion
  const posValue = validPrice(stock.price) * Number(stock.shares);

  //Split stock change string and determine css for change value
  const { changePrice, changePercent } = splitChangeString(stock.change);
  const changeSign = stock.change[0];
  const colorClass =
    changeSign === "+"
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
    $${posValue}
  </div>

  <div class="flex gap-3 justify-end w-full md:w-auto">
    <button
      class="bg-red-50 text-red-600 rounded-lg hover:bg-red-600 hover:text-white transition-colors flex items-center justify-center gap-2 px-3 py-2 shadow-sm"
      title="Remove from Watchlist"
    >
      <i class="fa-solid fa-trash-can"></i>
      Remove
    </button>
  </div>
`;

  const delete_btn = article.querySelector(".delete-btn");

  return article;

  //  <div
  //         class="flex flex-col items-center justify-center ${colorClass}"
  //         >
  //            <span
  //            class="font-bold bg-green-50 px-3 py-1 rounded-full text-sm
  //            >
  //            ${changePrice}
  //           </span>
  //            <span
  //            class="font-bold bg-green-50 px-3 py-1 rounded-full text-sm"
  //            >
  //            ${changePercent}
  //            </span>
  //         </div>
  // <div class="flex gap-3 justify-end w-full md:w-auto">
  //   <button
  //     class="w-10 h-10 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-600 hover:text-white transition-colors flex items-center justify-center shadow-sm"
  //     title="View Details"
  //   >
  //     <i class="fa-solid fa-magnifying-glass"></i>
  //   </button>
  //   <button
  //     class="delete-btn w-10 h-10 bg-red-50 text-red-600 rounded-lg hover:bg-red-600 hover:text-white transition-colors flex items-center justify-center shadow-sm"
  //     title="Remove from Watchlist"
  //   >
  //     <i class="fa-solid fa-trash-can"></i>
  //   </button>
  // </div>;
}

/*Displays current stock shares & prices in portfolio management*/
function displayCurrentStockShares(symbol, price, numShares) {
  const posVal = document.getElementById("position-val");
  const holdings = document.getElementById("holdings");
  price = validPrice(price);

  if (numShares == null) {
    // const stock = portfolio.find((item) => item.symbol === symbol);
    // numShares = stock ? stock.shares : 0;
    // test
    numShares = getShares(symbol);
  }

  holdings.textContent = `${numShares} shares`;
  const totalValue = numShares * price; // number
  posVal.textContent = `$${totalValue.toFixed(2)}`; // rounded for UI
}

/*Calculates total portfolio value using global portfolio variable*/
async function calcTotalPortfolio() {
  //if portfolio empty
  if (portfolio.length === 0) return 0;

  let totalValue = 0;
  for (const stock of portfolio) {
    console.log(stock.symbol);
    const price = await getcurrentPrice(stock.symbol);

    // skip invalid price
    if (isNaN(price)) {
      console.warn("Skipping invalid price for", stock.symbol);
      continue;
    }

    totalValue += Number(stock.shares) * price;
  }

  console.log("Total portfolio value:", totalValue);

  return totalValue;
}

/*Gets current price of stock using symbol from API, if no price, returns 0*/
async function getcurrentPrice(symbol) {
  try {
    const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${API_KEY}`;
    await delay(2000);
    console.log("waiting in getCurrentPrice");
    const data = await fetchURL(url);

    //API-level erros: check if valid data came back from API response
    handleAPIErrors(data, "Global Quote");
    const price = data["Global Quote"]["05. price"];
    console.log("Price set", price);
    return validPrice(price);
  } catch (err) {
    showToastError(err.message);
    console.error(`Error in getcurrentPrice(${symbol}):`, err);
  }
}
/*Displays portfolio current value in page header*/
async function displayPortfolioValue() {
  const portfolioValEl = document.querySelector("#header-portfolio-value");
  const stockOwnedEl = document.querySelector("#header-stocks-owned");

  const totalPortfolioVal = await calcTotalPortfolio();
  const numStocks = portfolio.length;

  portfolioValEl.textContent = `$${formatPrice(totalPortfolioVal)}`;
  stockOwnedEl.textContent = numStocks;
}

/*-- HELPER FUNCTIONS --*/

/*Makes searched stock info visible in active stock section */
function showActiveResults() {
  document.getElementById("active-stock-results").classList.remove("hidden");
}

/**
 * Loads portfolio if set from localStorage to maintain persistence
 */
function loadPortfolio() {
  const loadPortfolio = JSON.parse(localStorage.getItem("portfolio"));
  if (loadPortfolio) portfolio = loadPortfolio;
}
function loadWatchlist() {
  const loadWatchlist = JSON.parse(localStorage.getItem("watchlist"));
  if (loadWatchlist) watchlist = loadWatchlist;
}
function loadData() {
  const storedPortfolio = JSON.parse(localStorage.getItem("portfolio"));
  const storedWatchlist = JSON.parse(localStorage.getItem("watchlist"));

  if (storedPortfolio) portfolio = storedPortfolio;
  if (storedWatchlist) watchlist = storedWatchlist;
}

/**
 * Ensures any price is only a number val
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
 * Ensures any text is only a cleaned up text val
 */
function validText(input) {
  return input ? input.trim() : "";
}

/**
 * Reformats price with commas and upto 2 decimal place
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

  console.log("Search state updated:", searchState);

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
  console.log("Search state reset:", searchState);
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
 * Tracks API calls to ensure less than 6 calls are made in a minute, a delay is added and no new calls are added to
 * avoid API errors due to API rate limit set by Alphaadvantage
 */
async function trackAPICalls() {
  const maxCallsPerMinute = 5;
  const perCallDelay = 1000; // 1 second between calls
  const safetyBuffer = 5000; // 5 second extra after window reset
  const now = Date.now();

  // If windowStart is null, this is the first call in a new window
  if (!windowStart) {
    windowStart = now;
  }

  APIcount++;

  //Delay between each API call between by 1 second to avoid API errors
  if (APIcount > 1) {
    await delay(perCallDelay);
  }

  // If batch limit reached
  if (APIcount >= maxCallsPerMinute) {
    const timePassedInWindow = Date.now() - windowStart;
    let waitTime = 60000 - timePassedInWindow + safetyBuffer;
    if (waitTime > 0) {
      console.log(
        `Batch of ${maxCallsPerMinute} done. Waiting ${Math.ceil(waitTime / 1000)}s for window reset...`,
      );
      await delay(waitTime);
    }

    // Reset for next batch
    APIcount = 0;
    windowStart = null;
  }
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
    // Stop API call immediately if search is terminated
    //if (searchState.terminate) return null;

    const response = await fetch(url);

    if (!response.ok) {
      throw new APIError(`HTTP error: ${response.status}`);
    }

    const data = await response.json();
    console.log("Testing fetchURL", data);

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
    //if(error){} check if lastErrorMsg is true, if yes display to user
    search_error.textContent = err.message;
  }
}

/*-- ON PAGE LOAD --*/

/* EVENT Listeners:  for search and related user actions*/
document.addEventListener("DOMContentLoaded", function () {
  //Loading Portfolio Data & Displaying it on UI
  loadPortfolio();
  //displayPortfolioValue();
  console.log(portfolio);
  //loadData();

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
});

console.log("Page is Working");
