/*----  Global Variables ----*/
//import { API_KEY } from "./config.js";
const API_KEY = "YOUR_API_KEY";
const API_KEY2 = "DEMO";
let last_error; //Keep track of error ???
const watchlist = [];
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
//const search_btn = document.querySelector("#search-stock");
const search_form = document.querySelector("#search-form");
const search_error = document.querySelector("#search-error");
//const qs_btn = document.querySelectorAll(".quick-search-btn");
const qs_btns = document.querySelector("#quick-search-btns");
const picker_close_bttn = document.querySelector("#close-picker-btn");
const picker_modal = document.querySelector("#picker-modal");
const picker_results = document.querySelector("#picker-results-container");

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

/*class InvalidJSONError extends Error {
  constructor(message = "Invalid response from API") {
    super(message);
    this.name = "InvalidJSONError";
  }
}*/

/*---- EVENT HANDLER FUNCTIONS ----*/

/*Get user's picked stock and update UI. Utilize picker cache to find details of user choice - data stored in cache due to data flow logic established to mitigate API usage*/
async function handleStockPicker(event) {
  //Grab user selection
  const stockPick = event.target.value;

  //Guard
  if (!stockPick || !pickerCache[stockPick]) return;

  //Initiate Loading
  displaySearchLoading(`Loading ${pickerCache[stockPick]}`);

  // Grab stock info from stockpicker cache based on user selection & update UI
  displayActiveStockData(pickerCache[stockPick]);
  //displayActiveStockData(stockCache[stockPick], compNameCache[stockPick]);

  //Enable search buttons
  enableButtons();

  //Close Modal
  closeStockPicker();
  //picker_modal.classList.add("hidden");
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
   If search fails assumes companyname, calls getCompany.*/

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
      updateSearchState({ status: "fail", lastError: err, terminate: true });
      return;
    }

    if (bestMatch.length === 1) {
      const { symbol, name } = bestMatch;

      if (symbol && name) {
        await delay(2000); // API rate limit
        displaySearchLoading(`Searching for ${symbol} stock`);

        const stockData = await getAllStockData(symbol);

        if (stockData) {
          allStockData = combineStockInfo(stockData, name);
          cache[allStockData.symbol] = allStockData;
          displayActiveStockData(allStockData);
          updateSearchState({ status: "success", terminate: true });
        }
      }
    }

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
        updateSearchState({ status: "success", terminate: true });
        return;
      }
    }
    /*const { symbol, name } = bestMatch;

    if (symbol && name) {
      await delay(2000); // API rate limit
      displaySearchLoading(`Searching for ${symbol} stock`);

      const stockData = await getAllStockData(symbol);
      allStockData = combineStockInfo(stockData, name);

      if (allStockData) {
        cache[allStockData.symbol] = allStockData;
        displayActiveStockData(allStockData);
        updateSearchState({ status: "success", terminate: true });
      } 
  }
    */

    //displayActiveStockData(bestMatch);
    //updateSearchState({ status: "success", terminate: true });
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
/*async function handleSearchForm(event) {
  //Setup start of search
  event.preventDefault();
  disableButtons();
  resetSearchState();
  updateSearchState({ stage: "userInput", status: "pending" });

  console.log("Button clicked");
  let input = search_input.value.trim();

  if (input !== "") {
    search_error.textContent = "";

    //Show Active Stock Section and display loading to user
    displaySearchLoading(`Searching for ${input} stock`);

    //Try and see if user gave symbol or companyName through matching input with dictionary
    if (checkStockDictionary(input.toLowerCase())) {
      input = checkStockDictionary(input);
    }

    //If user matched in dictionary use updated input value as symbol, else assume unique symbol
    let allStockData = await getAllStockData(input);

    //If successful match found, exit from handler, enable API using buttons & update UI
    if (allStockData) {
      //Add data to cache
      cache[allStockData.symbol] = allStockData;

      //Update loading state, and UI. Re-enable buttons
      displaySearchLoading(`Loading for ${input} stock`);
      displayActiveStockData(allStockData);
      enableButtons();

      return;
    }

    // OLD CODE COMMENT START
    // let stockData = await getStockData(input);
    // console.log("Extracted from API", stockData);
    // //If successful match found, exit from handler, enable quick search buttons & update UI
    // if (stockData) {
    //   //let compName = compNameCache[stockData.symbol];
    //   let compName = cache[stockData.symbol].name;
    //   if (!compName) {
    //     compName = await getCompanyName(stockData.symbol);
    //     //compNameCache[stockData.symbol] = compName;
    //     // allStockData = combineStockInfo(stockData, compName);
    //     // addToCache(allStockData);
    //   }
    //
    //   //Combine into one object
    //   const allStockData = { ...stockData, name: compName };
    //   //Add to cache
    //   cache[stockData.symbol] = allStockData; 
    //
    //   displaySearchLoading(`Loading for ${input} stock`);
    //   //displayActiveStockData(stockData);
    //   displayActiveStockData(allStockData);
    //   document
    //     .querySelectorAll("#search-section button")
    //     .forEach((b) => (b.disabled = false));
    //   return;
    // }
    // OLD CODE COMMENT END

    console.log("waiting in handleSearchForm before actual getSymbol Call");
    await delay(2000);
    const bestMatch = await getBestMatch(input);

    if (!bestMatch) {
      enableButtons();
      return; // exits code
    }

    const { symbol, name } = bestMatch;

    if (symbol && name) {
      await delay(2000);
      console.log(
        "waiting in handleSearchForm after actual getSymbol Call for when 1 symbol is returned",
      );

      displaySearchLoading(`Searching for ${symbol} stock`);

      const stockData = await getAllStockData(symbol);
      console.log("Before combine:", symbol, name, stockData);
      allStockData = combineStockInfo(stockData, name);
      if (allStockData) {
        //Add data to cache
        cache[allStockData.symbol] = allStockData;

        displaySearchLoading(`Loading for ${allStockData.symbol} stock`);
        displayActiveStockData(allStockData);
        enableButtons();
      }

      // OLD CODE COMMENT START
      // displaySearchLoading(`Searching for ${stockData.symbol} stock`);
      // const stockData = await getStockData(symbol);
      // displaySearchLoading(`Loading for ${stockData.symbol} stock`);
      // displayActiveStockData(stockData);
      // document
      //   .querySelectorAll("#search-section button")
      //   .forEach((b) => (b.disabled = false));
      // OLD CODE COMMENT END
    }
  } else {
    search_error.textContent = "stock symbol required";
  }
}
*/

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
      return null; // ✅ SOFT FAIL → allow fallback
    }

    // ❗ HARD FAIL → bubble up
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

    if (stockData) {
      //Check for cache first
      let compName = cache[stockData.symbol]?.name;
      if (!compName) {
        //trackAPICalls();
        compName = await getCompanyName(stockData.symbol);
      }

      //Check again if compName was updated,
      if (compName) {
        //Combine into one object
        const allStockData = { ...stockData, name: compName };
        console.log("getAlLStock Func: ", allStockData);

        return allStockData;
      }
      //Add to cache
      //cache[stockData.symbol] = allStockData;
    }

    //combineStockInfo(stockData, compName)
  } catch (err) {
    // last_error = err;
    console.error(`Error in getAllStockData(${symbol}):`, err);
    throw err;
  }
}
/*Combines stock data, with company name in order to maintain 1 set of data being passed through and reduces fragmented data due to data being 
fetched from multiple API's. Can access company name via ".name"*/
function combineStockInfo(stockData, compName) {
  //Combine into one object
  const allStockData = { ...stockData, name: compName };

  return allStockData;
}

function addToCache(allStockData) {
  //Saves copy into cache
  cache[allStockData.symbol] = allStockData;
}

// function successfulAPI(allStockData) {
//   //Add data to cache
//   cache[allStockData.symbol] = allStockData;

//   displaySearchLoading(`Loading for ${allStockData.symbol} stock`);
//   displayActiveStockData(allStockData);
//   enableButtons();

//   //clear last error ?
// }

// function combineToCache(stockData, compName) {
//   const allStockData = combineStockInfo(stockData, compName);
//   addToCache(allStockData);

//   return allStockData;
// }

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
      throw new DataNotFoundError("No matching symbols found");
    }

    //If only one match, return symbol + compName
    if (usEquities.length === 1) {
      return {
        symbol: usEquities[0]["1. symbol"],
        name: usEquities[0]["2. name"],
      };
    }

    //If more than 1 match, return entire array
    if (usEquities.length > 1) return usEquities;

    /*
      //If more than one stock in bestMatch, have user pick appropriate match. Before displaying get all pickerData
    await delay(2000);
    displaySearchLoading(`Searching for stocks`);

    const pickerData = await getAllStocksPickerData(usEquities);

    if (pickerData) {
      displayStockPicker(pickerData);
    }

    const selectedStock = await getAllStocksPickerData(usEquities);

    if (!selectedStock) {
      return null; // Termination point on user selection: cancel = null
    } */

    //Get user selected stock as return value - instead of async, make sync calls
    //return selectedStock;

    //return null;

    // const userPickedSymbol = handleStockerPicker;
    //return userPickedSymbol;

    //console.log(data);
  } catch (err) {
    throw err;
    // console.error(err);
    // displayError(err);
    // document
    //   .querySelectorAll("#search-section button")
    //   .forEach((b) => (b.disabled = false));
  }
}

// getStockData("IBM");
// await delay(3000);
// getSymbol("bank");

/*Gets all the stock picker data needed from SYMBOL_SEARCH endpoint and formats it. Also adds data to cache to reduce API calls*/
async function getAllStocksPickerData(compData) {
  try {
    //stockCache.length = 0;
    //const pickerData = [];

    //pickerCache.length = 0;
    pickerCache = {};

    for (const stock of compData) {
      const symbol = stock["1. symbol"];
      const compName = stock["2. name"];

      // let stockData = stockCache[symbol];

      // if (!stockData) {
      //   stockData = await getStockData(symbol);
      //   stockCache[symbol] = stockData; // store in global cache
      // }

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
      // pickerCache.push(fullStockData);

      /* } 
      pickerData.push({
        symbol,
        name: compName,
        open: stockData.open,
        high: stockData.high,
        low: stockData.low,
        price: stockData.price,
        volume: stockData.volume,
        change: stockData.change,
        ["change percent"]: stockData["change percent"],
      });*/
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

  // let fontColor;
  // let stockChange;

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

    /*if (parseFloat(stockData.change) < 0) {
      fontColor = "text-red-500";
      stockChangeTxt = `-\$${Math.abs(format2Decimal(stockData.change))} (${format2Decimal(stockData["change percent"])})`;
    } else {
      fontColor = "text-green-500";
      stockChangeTxt = `+\$${format2Decimal(stockData.change)} (+${format2Decimal(stockData["change percent"])})`;
    }*/

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

/*Sets cache with stockData so that fewer API calls need to be made. Cache is reset for every new pickerData in   */
// function setStockCache(stockData) {
//   const symbol = stockData.symbol;
//   stockCache[symbol] = {
//     symbol,
//     open: stockData.open,
//     high: stockData.high,
//     low: stockData.low,
//     price: stockData.price,
//     volume: stockData.volume,
//     change: stockData.change,
//     ["change percent"]: stockData["change percent"],
//   };
// }

function displayActiveStockData(stockData) {
  if (!stockData || !stockData.symbol) {
    console.warn("Skipping invalid stock data:", stockData);
    return; // exit early if data is missing
  }

  const stockName = document.querySelector("#active-name");
  const stockSymbol = document.querySelector("#active-symbol");
  const stockPrice = document.querySelector("#active-price");
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
  //Show active stock results article (replaces loading state)
  // loadingDiv.classList.add("hidden");
  // stockResults.classList.remove("hidden");

  //Ensure search section is visible (fallback)
  activeDiv.classList.remove("hidden");
  //stockResults.classList.remove("hidden");
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

  hideLoading();
}

/*-- HELPER FUNCTIONS --*/

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

/*Closes stock picker modal popup*/
function closeStockPicker() {
  picker_modal.classList.add("hidden");
}

/*Toggles loader to hide, should be used after API call*/
function hideLoading() {
  // after fetch
  //  document.getElementById("loading").classList.add("hidden");
  document.getElementById("loading").classList.replace("flex", "hidden");
  //document.getElementById("active-stock-results").classList.remove("hidden");
}

/*Toggles loader to show, should be used before API call*/
function showLoading() {
  // show loading
  // document.getElementById("loading").classList.remove("hidden");
  document.getElementById("loading").classList.replace("hidden", "flex");
  document.getElementById("active-stock-results").classList.add("hidden");
}

function showActiveResults() {
  document.getElementById("active-stock-results").classList.remove("hidden");
}

/*Loading spin wheel to help improve UI/UX for user while API is being fetched*/
function displaySearchLoading(searchTxt) {
  //const activeDiv = document.querySelector("#active-stock-section");

  //Make Stock results section visible and ensure stocksresults are not visible
  activeDiv.classList.remove("hidden");
  //stockResults.classList.add("hidden");
  showLoading();

  document.querySelector("#loading_txt").textContent = `${searchTxt} ...`;
}

/*Enables buttons requiring API usage on webpage to regulate API calls. Re-enabled either on final API error or success*/
function enableButtons() {
  document
    .querySelectorAll("#search-section button")
    .forEach((b) => (b.disabled = false));
}

/**Disables buttons on web-page requiring API calls when API calls are going through*/
function disableButtons() {
  document
    .querySelectorAll("#search-section button")
    .forEach((b) => (b.disabled = true));
}

function format2Decimal(num) {
  return parseFloat(num).toFixed(2);
}

/*Tracks API calls to ensure less than 6 calls are made in a minute, a delay is added and no new calls are added to
 * avoid API errors due to API rate limit set by Alphaadvantage*/
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

/*Adds delay, to create a pause in program execution. Used primarily on API calls to avoid rate limiting */
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/*Checks if company name matches any famous companies to improve ux for companies with different listed names*/
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

/*Fetches data from API, while handling HTTP/Parsing errors*/
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
/*async function fetchURL(url) {
  const response = await fetch(url).catch(() => {
    throw new Error("Network error: Unable to reach the server.");
  });

  //HTTP-level errors
  if (!response.ok) {
    throw new Error(`HTTP error! Status: ${response.status}`);
  }
  console.log("Testing fetchURL");
  console.log(response);
  const data = await response.json().catch(() => {
    throw new Error("Invalid JSON response from API.");
  });

  return data;
}*/

/*Throws errors for API level errors based on Alphaadvantage API responses*/
function handleAPIErrors(data, apiObj) {
  if (data["Error Message"]) {
    throw new DataNotFoundError();
  }

  if (data["Note"] || data["Information"]) {
    throw new APIError();
  }

  if (!data?.[apiObj] || Object.keys(data[apiObj]).length === 0) {
    throw new DataNotFoundError();
  }

  /* if (data["Error Message"]) throw new Error("Invalid stock symbol.");
  if (data["Note"] || data["Information"])
    throw new Error("API error. Try again later.");
  if (!data?.[apiObj] || Object.keys(data[apiObj]).length === 0) {
    throw new Error("No data found");
  }*/
}

/*Displays errors to users above search bar*/
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
  //Event Listerns on Search Bar
  search_form.addEventListener("submit", handleSearchForm);

  qs_btns.addEventListener("click", handleQuickSearch);
  //picker_results.addEventListener("click", handleStockPicker);
  /*picker_close_bttn.addEventListener("click", function () {
    closeStockPicker();
    updateSearchState({
      stage: "pickerDisplay",
      status: "abandoned",
      terminate: true,
    });
  });*/

  //  const symbol = await getSymbol("ba");
});

console.log("Page is Working");
