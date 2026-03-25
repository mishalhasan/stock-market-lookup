//import { API_KEY } from "./config.js";
const API_KEY = "YOUR_API_KEY";

/*---- Load Dom Elements ----*/
const search_input = document.querySelector("#stock-input");
//const search_btn = document.querySelector("#search-stock");
const search_form = document.querySelector("#search-form");
const search_error = document.querySelector("#search-error");
//const qs_btn = document.querySelectorAll(".quick-search-btn");
const qs_btns = document.querySelector("#quick-search-btns");

async function getStockData(symbol) {
  try {
    // symbol = data["bestMatches"][0]["1. symbol"];

    const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${API_KEY}`;
    const response = await fetch(url).catch(() => {
      throw new Error("Network error: Unable to reach the server.");
    });

    //HTTP-level errors
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    console.log("Teting");
    console.log(response);
    const data = await response.json().catch(() => {
      throw new Error("Invalid JSON response from API.");
    });

    //API-level erros: check if valid data came back from API response
    if (data["Error Message"]) throw new Error("Invalid stock symbol.");
    if (data["Note"] || data["Information"])
      throw new Error("API error. Try again later.");
    if (
      !data?.["Global Quote"] ||
      Object.keys(data["Global Quote"]).length === 0
    ) {
      throw new Error("No data found for this stock symbol.");
    }

    //Extract Stock Data and return formated data
    const stockData = {};
    for (const key in data["Global Quote"]) {
      const value = data["Global Quote"][key];
      const newKey = key.replace(/^\d+\. /, "");
      //console.log(`Key is ${newKey} and value is ${value}`);
      stockData[newKey] = value;
    }

    return stockData;
    // console.log(data.price);
  } catch (err) {
    console.error(err);
    if (err instanceof TypeError) {
      search_error.textContent =
        "Network error: Unable to reach the server. Check your internet connection.";
    } else {
      search_error.textContent = err.message;
    }
  }
}

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

function handleAPIErrors(data, apiObj) {
  if (data["Error Message"]) throw new Error("Invalid stock symbol.");
  if (data["Note"] || data["Information"])
    throw new Error("API error. Try again later.");
  if (!data?.[apiObj] || Object.keys(data[apiObj]).length === 0) {
    throw new Error("No data found");
  }
}

function showError(err) {
  console.error(err);
  if (err instanceof TypeError) {
    search_error.textContent =
      "Network error: Unable to reach the server. Check your internet connection.";
  } else {
    search_error.textContent = err.message;
  }
}

/*Gets list of bestmatches for user to choose from*/
async function getSymbol(input) {
  try {
    const url = `https://www.alphavantage.co/query?function=SYMBOL_SEARCH&keywords=${input}&apikey=${API_KEY}`;
    const response = await fetch(url);

    //HTTP-level errors
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const data = await response.json();

    if (data["Information"] || data["Note"])
      throw new Error("API call limit reached. Please wait.");
    if (
      !data?.["bestMatches"] ||
      Object.keys(data["bestMatches"]).length === 0
    ) {
      throw new Error("No data found for this stock symbol.");
    }

    console.log(data);
  } catch (err) {
    console.error(err);
    if (err instanceof TypeError) {
      search_error.textContent =
        "Network error: Unable to reach the server. Check your internet connection.";
    } else {
      search_error.textContent = err.message;
    }
  }
}

/* Validates user input and sends user input to be sent to the API.  */
async function handleSearchForm(event) {
  event.preventDefault();
  document.querySelectorAll("button").forEach((b) => (b.disabled = true));

  console.log("Button clicked");
  const input = search_input.value.trim();

  if (input !== "") {
    search_error.textContent = "";
    const stockData = await getStockData(input);
    console.log("Extracted from API", stockData);
    update;
  } else {
    search_error.textContent = "stock symbol required";
  }
  document.querySelectorAll("button").forEach((b) => (b.disabled = false));
}

function displayStockData(stockData) {
  const stockName = document.querySelector("#active-name");
  const stockSymbol = document.querySelector("#active-symbol");
  const stockPrice = document.querySelector("#active-price");
  const stockChange = document.querySelector("#active-change");
  const openVal = document.querySelector("#open-amount");
  const highVal = document.querySelector("#high-amount");
  const lowVal = document.querySelector("#low-amount");
  const volVal = document.querySelector("#volume-amount");
}
//const symbol = await getSymbol("ba");

async function getCompanyName(symbol) {
  try {
    const url = `https://www.alphavantage.co/query?function=SYMBOL_SEARCH&keywords=${symbol}&apikey=${API_KEY}`;

    const data = await fetchURL(url);
    handleAPIErrors(data, "bestMatches");
    console.log(data);
    const company = data["bestMatches"][0]["2. name"];
    return company;
  } catch (err) {
    //showError(err);
    console.error(err);
  }
}

getCompanyName("AAPL");

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

document.addEventListener("DOMContentLoaded", function () {
  //Event Listerns on Search Bar
  search_form.addEventListener("submit", handleSearchForm);

  qs_btns.addEventListener("click", handleQuickSearch);
});

console.log("Page is Working");
