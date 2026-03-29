//import { API_KEY } from "./config.js";
const API_KEY = "YOUR_API_KEY";
const API_KEY2 = "DEMO";
let error; //Keep track of error
const watchlist = [];
const stockCache = [];
const compNameCache = [];
let APIcount = 0; // Number of calls made in the current window
let windowStart = null; // Start time of the current 1-minute window
let lastCallTime = 0; // Timestamp of the last API call

/*---- Load Dom Elements ----*/
const activeDiv = document.querySelector("#active-stock-section");
const search_input = document.querySelector("#stock-input");
//const search_btn = document.querySelector("#search-stock");
const search_form = document.querySelector("#search-form");
const search_error = document.querySelector("#search-error");
//const qs_btn = document.querySelectorAll(".quick-search-btn");
const qs_btns = document.querySelector("#quick-search-btns");
const picker_close_bttn = document.querySelector("#close-picker-btn");
const picker_modal = document.querySelector("#picker-modal");
const picker_results = document.querySelector("#picker-results-container");

/*---- EVENT HANDLER FUNCTIONS ----*/

/*Get user's picked stock and update UI*/
async function handleStockPicker(event) {
  //Grab user selection
  const stockPick = event.target.value;
  //? DO I need event.propogation - i dont think so

  //Call get stock info from API based on user selection & update UI
  //const stockData = await getStockData(stockPick);

  //Load Data
  displaySearchLoading(`Loading ${stockCache[stockPick]}`);
  // check cache and match for info from stockpicker cache
  displayActiveStockData(stockCache[stockPick], compNameCache[stockPick]);

  //Enable search buttons
  document
    .querySelectorAll("#search-section button")
    .forEach((b) => (b.disabled = false));

  //Close Modal
  picker_modal.classList.add("hidden");
}

/*Closes stock picker modal popup*/
function closeStockPicker() {
  picker_modal.classList.add("hidden");
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
  document
    .querySelectorAll("#search-section button")
    .forEach((b) => (b.disabled = true));

  console.log("Button clicked");
  let input = search_input.value.trim().toLowerCase();

  if (input !== "") {
    search_error.textContent = "";

    //Show Actice Stock Section and display loading to user
    activeDiv.classList.remove("hidden");

    //Try and see if user gave symbol or companyName through matching input with dictionary
    if (checkStockDictionary(input)) {
      input = checkStockDictionary(input);
    }

    //If user matched in dictionary use updated input value as symbol, else assume unique symbol
    displaySearchLoading(`Searching for ${input} stock`);
    let stockData = await getStockData(input);
    console.log("Extracted from API", stockData);

    //If successful match found, exit from handler, enable quick search buttons & update UI
    if (stockData) {
      let compName = compNameCache[stockData.symbol];
      if (!compName) {
        compName = await getCompanyName(stockData.symbol);
        compNameCache[stockData.symbol] = compName;
      }
      displaySearchLoading(`Loading for ${input} stock`);
      displayActiveStockData(stockData, compName);
      document
        .querySelectorAll("#search-section button")
        .forEach((b) => (b.disabled = false));
      return;
    }

    //If symbol not found because company name, use getSymbol to find best match
    //If a symbol is found and returned, update UI with new symbol stock data
    // Add 5sec delay before API call due to API rate limit restrictions

    console.log("waiting in handleSearchForm before actual getSymbol Call");
    await delay(2000);
    const symbol = await getSymbol(input);
    if (symbol) {
      await delay(2000);
      console.log(
        "waiting in handleSearchForm after actual getSymbol Call for when 1 symbol is returned",
      );
      displaySearchLoading(`Searching for ${stockData.symbol} stock`);
      stockData = await getStockData(symbol);
      displaySearchLoading(`Loading for ${stockData.symbol} stock`);
      displayActiveStockData(stockData);
      document
        .querySelectorAll("#search-section button")
        .forEach((b) => (b.disabled = false));
    }

    //Call and check getSymbol or something for getting the picker data
  } else {
    search_error.textContent = "stock symbol required";
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
    console.error(err);
    displayError(err);
  }
}

/* Gets stock company name based on stock symbol from API. Used in displayFunction primarily for instances where symbol searched 
as global quote does not provide company name */
async function getCompanyName(symbol) {
  try {
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
    console.error(err);
  }
}

/*Calls API to list bestmatches for user to choose US equities based on user input and returns best symbol.
 If only one symbol found, skips stock pickert, and returns symbol. Otherwise stock picker displays*/
async function getSymbol(input) {
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

    //If only one match, return symbol
    if (usEquities.length === 1) {
      const symbol = usEquities[0]["1. symbol"];
      console.log("symbol");
      return symbol;
    }

    //If more than one stock in bestMatch, have user pick appropriate match. Before displaying get all pickerData
    await delay(2000);
    displaySearchLoading(`Searching for stocks`);
    const pickerData = await getAllStocksPickerData(usEquities);
    displayStockPicker(pickerData);

    // const userPickedSymbol = handleStockerPicker;
    //return userPickedSymbol;

    //console.log(data);
  } catch (err) {
    console.error(err);
    displayError(err);
    document
      .querySelectorAll("#search-section button")
      .forEach((b) => (b.disabled = false));
  }
}

// getStockData("IBM");
// await delay(3000);
// getSymbol("bank");

/*Gets all the stock picker data needed from SYMBOL_SEARCH endpoint and formats it. Also adds data to cache to reduce API calls*/
async function getAllStocksPickerData(compData) {
  try {
    stockCache.length = 0;

    const pickerData = [];

    for (const stock of compData) {
      const symbol = stock["1. symbol"];
      const compName = stock["2. name"];

      compNameCache[symbol] = compName;

      await delay(3000);
      const stockData = await getStockData(symbol);
      setStockCache(stockData);
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
      });
    }
    return pickerData;
  } catch {
    console.error("Something went wrong fetching data from stocks picker list");
    //displayError();
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
function setStockCache(stockData) {
  const symbol = stockData.symbol;
  stockCache[symbol] = {
    symbol,
    open: stockData.open,
    high: stockData.high,
    low: stockData.low,
    price: stockData.price,
    volume: stockData.volume,
    change: stockData.change,
    ["change percent"]: stockData["change percent"],
  };
}

async function displayActiveStockData(stockData) {
  const stockName = document.querySelector("#active-name");
  const stockSymbol = document.querySelector("#active-symbol");
  const stockPrice = document.querySelector("#active-price");
  const stockChange = document.querySelector("#active-change");
  const openVal = document.querySelector("#open-amount");
  const highVal = document.querySelector("#high-amount");
  const lowVal = document.querySelector("#low-amount");
  const volVal = document.querySelector("#volume-amount");
  const activeDiv = document.querySelector("#active-stock-section");

  //Show active stock section
  activeDiv.classList.remove("hidden");

  //Get company name, use cache if available, add to cache if unavailable
  let compName = compNameCache[stockData.symbol];
  if (!compName) {
    compName = await getCompanyName(stockData.symbol);
    compNameCache[stockData.symbol] = compName;
  }
  stockName.textContent = compName;
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
    stockChange.classList.add("text-green-500");
    stockChange.classList.remove("text-red-500");
    stockChange.textContent = `-$${Math.abs(changeNum).toFixed(2)} (${Math.abs(changePercentNum).toFixed(2)}%)`;
  } else {
    stockChange.classList.add("text-red-500");
    stockChange.classList.remove("text-green-500");
    const sign = changeNum === 0 ? "" : "+";
    stockChange.textContent = `${sign}$${changeNum.toFixed(2)} (+${changePercentNum.toFixed(2)}%)`;
  }
}

/*-- HELPER FUNCTIONS --*/

function displaySearchLoading(searchTxt) {
  activeDiv.innerHTML = ` <article
          id="loading"
          class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden min-h-[25vh] flex flex-col gap-2 items-center justify-center">
          <div
            class="w-10 h-10 border-4 border-t-blue-500 rounded-full animate-spin"
          ></div>
          <span id="loading_txt">${searchTxt} ...</span>
        </article>`;
}

function format2Decimal(num) {
  return parseFloat(num).toFixed(2);
}

/*Tracks API calls to ensure less than 6 calls are made in a minute, a delay is added and no new calls are added to
avoid API errors due to API rate limit set by Alphaadvantage*/
async function trackAPICAlls() {
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
}

/*Throws errors for API level errors based on Alphaadvantage API responses*/
function handleAPIErrors(data, apiObj) {
  if (data["Error Message"]) throw new Error("Invalid stock symbol.");
  if (data["Note"] || data["Information"])
    throw new Error("API error. Try again later.");
  if (!data?.[apiObj] || Object.keys(data[apiObj]).length === 0) {
    throw new Error("No data found");
  }
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
  picker_results.addEventListener("click", handleStockPicker);
  picker_close_bttn.addEventListener("click", closeStockPicker);

  //  const symbol = await getSymbol("ba");
});

console.log("Page is Working");
