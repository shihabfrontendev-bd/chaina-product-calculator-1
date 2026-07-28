// Application State & Storage Keys
const STORAGE_KEY = "saas_calc_data_v1";

let appState = {
  theme: "dark",
  settings: {
    airRate: 1.2,
    seaRate: 0.4,
    currency: "৳",
    exchangeRate: 17.5,
    defPack: 50,
    defCourier: 120,
    defAds: 150,
    bizName: "Global Import Store",
    logoUrl: ""
  },
  products: [],
  customCosts: [],
  currentProduct: null
};

// DOM Content Loaded Initializer
document.addEventListener("DOMContentLoaded", () => {
  loadState();
  initNavigation();
  initTheme();
  bindCalculatorEvents();
  bindDatabaseEvents();
  bindSettingsEvents();
  renderSettings();
  renderDatabase();
  runCalculation();

  // Listen for Chrome Extension communication
  window.addEventListener("message", handleExtensionMessage);
});

/* --- LOCAL STORAGE HANDLING --- */
function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    const parsed = JSON.parse(saved);
    appState = { ...appState, ...parsed };
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
}

/* --- NAVIGATION & THEME --- */
function initNavigation() {
  const navItems = document.querySelectorAll(".nav-links li");
  const tabs = document.querySelectorAll(".tab-content");

  navItems.forEach(item => {
    item.addEventListener("click", () => {
      navItems.forEach(i => i.classList.remove("active"));
      tabs.forEach(t => t.classList.remove("active"));

      item.classList.add("active");
      const targetId = item.getAttribute("data-tab");
      document.getElementById(targetId).classList.add("active");

      if (targetId === "tab-dashboard") updateDashboard();
      if (targetId === "tab-database") renderDatabase();
    });
  });
}

function initTheme() {
  document.body.setAttribute("data-theme", appState.theme);
  document.getElementById("themeToggleBtn").addEventListener("click", () => {
    appState.theme = appState.theme === "dark" ? "light" : "dark";
    document.body.setAttribute("data-theme", appState.theme);
    saveState();
  });
}

/* --- CALCULATOR ENGINE --- */
function bindCalculatorEvents() {
  const inputs = [
    "calcName", "calcPrice", "calcWeight", "calcImage",
    "costPack", "costCourier", "costAds", "costCustoms", "costMisc", "costTxFee",
    "calcProfitInput"
  ];
  inputs.forEach(id => {
    document.getElementById(id).addEventListener("input", runCalculation);
  });

  document.querySelectorAll("input[name='shipMethod']").forEach(radio => {
    radio.addEventListener("change", runCalculation);
  });

  // Profit Slider Sync
  const slider = document.getElementById("calcProfitSlider");
  const input = document.getElementById("calcProfitInput");
  slider.addEventListener("input", (e) => {
    input.value = e.target.value;
    runCalculation();
  });
  input.addEventListener("input", (e) => {
    slider.value = e.target.value;
    runCalculation();
  });

  // Dynamic Custom Costs
  document.getElementById("btnAddCustomCost").addEventListener("click", () => {
    addCustomCostField("", 0);
  });

  // Action Buttons
  document.getElementById("btnResetCalc").addEventListener("click", resetCalculatorForm);
  document.getElementById("btnSaveDb").addEventListener("click", saveCurrentToDatabase);
  document.getElementById("btnCopySummary").addEventListener("click", copyPricingSummary);

  // Reverse Calc Binds
  document.getElementById("revSellingInput").addEventListener("input", runReverseCalculation);
  document.getElementById("goalProfitInput").addEventListener("input", runGoalCalculation);
}

function addCustomCostField(nameVal = "", amountVal = 0) {
  const container = document.getElementById("customCostsContainer");
  const id = "custom_" + Date.now();
  
  const div = document.createElement("div");
  div.className = "custom-cost-row";
  div.id = id;
  div.innerHTML = `
    <input type="text" placeholder="Cost Name" class="cust-name" value="${nameVal}">
    <input type="number" placeholder="Amount" class="cust-val" value="${amountVal}">
    <button type="button" class="btn danger small" onclick="removeCustomCost('${id}')">X</button>
  `;
  container.appendChild(div);

  div.querySelector(".cust-val").addEventListener("input", runCalculation);
}

window.removeCustomCost = function(id) {
  document.getElementById(id).remove();
  runCalculation();
};

function getNumber(id) {
  const val = parseFloat(document.getElementById(id).value);
  return isNaN(val) ? 0 : val;
}

function runCalculation() {
  const chinaPriceRMB = getNumber("calcPrice");
  const weightGrams = getNumber("calcWeight");
  const shipMethod = document.querySelector("input[name='shipMethod']:checked").value;

  // Convert China price to BDT
  const chinaPriceBDT = chinaPriceRMB * appState.settings.exchangeRate;

  // Shipping Calculation
  const ratePerGram = shipMethod === "air" ? appState.settings.airRate : appState.settings.seaRate;
  const shippingCost = weightGrams * ratePerGram;

  // Additional Costs
  const pack = getNumber("costPack");
  const courier = getNumber("costCourier");
  const ads = getNumber("costAds");
  const customs = getNumber("costCustoms");
  const misc = getNumber("costMisc");
  const txFeePct = getNumber("costTxFee");

  // Custom Costs Sum
  let customSum = 0;
  document.querySelectorAll("#customCostsContainer .cust-val").forEach(input => {
    customSum += (parseFloat(input.value) || 0);
  });

  const landingCost = chinaPriceBDT + shippingCost + customs;
  const fixedAdditional = pack + courier + ads + misc + customSum;
  const baseTotalCost = landingCost + fixedAdditional;

  // Target Profit Math
  const profitPct = getNumber("calcProfitInput");
  
  // Account for transaction fee percentage on final selling price
  // Selling = BaseTotal + ProfitAmount + TxFeeAmount
  // Let Selling = S. S = BaseTotal + (BaseTotal * profitPct/100) + (S * txFeePct/100)
  // S * (1 - txFeePct/100) = BaseTotal * (1 + profitPct/100)
  const txDivisor = 1 - (txFeePct / 100);
  const rawSellingPrice = txDivisor > 0 ? (baseTotalCost * (1 + (profitPct / 100))) / txDivisor : 0;
  const txFeeAmount = rawSellingPrice * (txFeePct / 100);
  const totalCostWithTx = baseTotalCost + txFeeAmount;
  const netProfitAmount = rawSellingPrice - totalCostWithTx;
  const netMargin = rawSellingPrice > 0 ? (netProfitAmount / rawSellingPrice) * 100 : 0;

  // Update UI Outputs
  const curr = appState.settings.currency;
  document.getElementById("resShipping").innerText = `${curr}${shippingCost.toFixed(2)}`;
  document.getElementById("resAddCosts").innerText = `${curr}${fixedAdditional.toFixed(2)}`;
  document.getElementById("resLanding").innerText = `${curr}${landingCost.toFixed(2)}`;
  document.getElementById("resTotal").innerText = `${curr}${totalCostWithTx.toFixed(2)}`;
  document.getElementById("resProfit").innerText = `${curr}${netProfitAmount.toFixed(2)}`;
  document.getElementById("resMargin").innerText = `${netMargin.toFixed(2)}%`;
  document.getElementById("resSelling").innerText = `${curr}${rawSellingPrice.toFixed(0)}`;

  // Store active calculated product state
  appState.currentProduct = {
    name: document.getElementById("calcName").value || "Unnamed Product",
    chinaPriceRMB,
    chinaPriceBDT,
    weight: weightGrams,
    image: document.getElementById("calcImage").value || "https://via.placeholder.com/150",
    shippingCost,
    landingCost,
    adsCost: ads,
    packCost: pack,
    courierCost: courier,
    totalCost: totalCostWithTx,
    sellingPrice: rawSellingPrice,
    profit: netProfitAmount,
    margin: netMargin,
    date: new Date().toLocaleDateString()
  };

  generateSmartPrices(rawSellingPrice);
  updateDashboard();
}

function generateSmartPrices(basePrice) {
  const container = document.getElementById("smartPriceTags");
  container.innerHTML = "";
  
  if (basePrice <= 0) return;

  const breakpoints = [499, 599, 699, 799, 899, 999, 1099, 1199, 1299, 1499, 1599, 1999];
  const suggestions = new Set();

  // Add closest preset breakpoints above base price
  breakpoints.forEach(bp => {
    if (bp >= basePrice && bp <= basePrice * 2.5) suggestions.add(bp);
  });

  // Add algorithmic nice numbers
  const hundred = Math.ceil(basePrice / 100) * 100;
  suggestions.add(hundred - 1);  // e.g., 699
  suggestions.add(hundred + 99); // e.g., 799

  Array.from(suggestions).sort((a,b) => a - b).slice(0, 6).forEach(price => {
    const tag = document.createElement("span");
    tag.className = "price-tag";
    tag.innerText = `${appState.settings.currency}${price}`;
    tag.onclick = () => {
      document.getElementById("revSellingInput").value = price;
      document.querySelector('[data-tab="tab-reverse"]').click();
      runReverseCalculation();
    };
    container.appendChild(tag);
  });
}

function resetCalculatorForm() {
  document.getElementById("calcName").value = "";
  document.getElementById("calcPrice").value = "0";
  document.getElementById("calcWeight").value = "0";
  document.getElementById("calcImage").value = "";
  document.getElementById("costPack").value = appState.settings.defPack;
  document.getElementById("costCourier").value = appState.settings.defCourier;
  document.getElementById("costAds").value = appState.settings.defAds;
  document.getElementById("costCustoms").value = "0";
  document.getElementById("costMisc").value = "0";
  document.getElementById("costTxFee").value = "0";
  document.getElementById("customCostsContainer").innerHTML = "";
  runCalculation();
}

/* --- REVERSE CALCULATOR LOGIC --- */
function runReverseCalculation() {
  if (!appState.currentProduct) return;
  const targetSelling = parseFloat(document.getElementById("revSellingInput").value) || 0;
  const baseCost = appState.currentProduct.totalCost;
  
  const profit = targetSelling - baseCost;
  const margin = targetSelling > 0 ? (profit / targetSelling) * 100 : 0;
  const roi = baseCost > 0 ? (profit / baseCost) * 100 : 0;

  const curr = appState.settings.currency;
  document.getElementById("revTotalCost").innerText = `${curr}${baseCost.toFixed(2)}`;
  document.getElementById("revProfit").innerText = `${curr}${profit.toFixed(2)}`;
  document.getElementById("revMargin").innerText = `${margin.toFixed(2)}%`;
  document.getElementById("revRoi").innerText = `${roi.toFixed(2)}%`;
}

function runGoalCalculation() {
  if (!appState.currentProduct) return;
  const goalProfit = parseFloat(document.getElementById("goalProfitInput").value) || 0;
  const baseCost = appState.currentProduct.totalCost;
  
  const reqSelling = baseCost + goalProfit;
  document.getElementById("goalSellingResult").innerText = `${appState.settings.currency}${reqSelling.toFixed(0)}`;
}

/* --- EXECUTIVE DASHBOARD & CANVAS CHARTS --- */
function updateDashboard() {
  if (!appState.currentProduct) return;
  const p = appState.currentProduct;
  const curr = appState.settings.currency;

  document.getElementById("dashLanding").innerText = `${curr}${p.landingCost.toFixed(0)}`;
  document.getElementById("dashSelling").innerText = `${curr}${p.sellingPrice.toFixed(0)}`;
  document.getElementById("dashProfit").innerText = `${curr}${p.profit.toFixed(0)}`;
  document.getElementById("dashMargin").innerText = `Margin: ${p.margin.toFixed(1)}%`;
  document.getElementById("dashAds").innerText = `${curr}${p.adsCost.toFixed(0)}`;
  
  const shipPct = p.totalCost > 0 ? (p.shippingCost / p.totalCost) * 100 : 0;
  const adsPct = p.totalCost > 0 ? (p.adsCost / p.totalCost) * 100 : 0;
  document.getElementById("dashShipPct").innerText = `Ship: ${shipPct.toFixed(0)}%`;
  document.getElementById("dashAdsPct").innerText = `Ads: ${adsPct.toFixed(0)}%`;

  // Draw Pie Chart
  const chartData = [
    { label: "China Cost", value: p.chinaPriceBDT, color: "#3b82f6" },
    { label: "Shipping", value: p.shippingCost, color: "#06b6d4" },
    { label: "FB Ads", value: p.adsCost, color: "#f59e0b" },
    { label: "Net Profit", value: Math.max(0, p.profit), color: "#10b981" },
    { label: "Pack & Courier", value: (p.packCost + p.courierCost), color: "#8b5cf6" }
  ];
  drawPieChart("costChart", chartData);
}

function drawPieChart(canvasId, data) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const legend = document.getElementById("chartLegend");
  
  const total = data.reduce((sum, item) => sum + item.value, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  legend.innerHTML = "";

  if (total === 0) return;

  let startAngle = 0;
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const radius = Math.min(centerX, centerY) - 10;

  data.forEach(item => {
    const sliceAngle = (item.value / total) * 2 * Math.PI;
    
    // Draw Slice
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, radius, startAngle, startAngle + sliceAngle);
    ctx.closePath();
    ctx.fillStyle = item.color;
    ctx.fill();

    startAngle += sliceAngle;

    // Add to HTML Legend
    const pct = ((item.value / total) * 100).toFixed(1);
    legend.innerHTML += `
      <div class="legend-item">
        <span class="legend-color" style="background:${item.color}"></span>
        <span>${item.label}: <strong>${pct}%</strong> (${appState.settings.currency}${item.value.toFixed(0)})</span>
      </div>
    `;
  });
}

/* --- PRODUCT DATABASE & EXPORT --- */
function bindDatabaseEvents() {
  document.getElementById("dbSearch").addEventListener("input", renderDatabase);
  document.getElementById("dbCategoryFilter").addEventListener("change", renderDatabase);
  document.getElementById("btnExportCsv").addEventListener("click", exportDatabaseCSV);
  document.getElementById("btnPrintDb").addEventListener("click", () => window.print());
}

function saveCurrentToDatabase() {
  if (!appState.currentProduct) return;
  const newProd = {
    ...appState.currentProduct,
    id: "prod_" + Date.now(),
    category: "general"
  };
  appState.products.unshift(newProd);
  saveState();
  showToast("Product saved to database successfully!");
  renderDatabase();
}

function renderDatabase() {
  const tbody = document.getElementById("productTableBody");
  const search = document.getElementById("dbSearch").value.toLowerCase();
  const cat = document.getElementById("dbCategoryFilter").value;
  const emptyState = document.getElementById("dbEmptyState");

  tbody.innerHTML = "";

  const filtered = appState.products.filter(p => {
    const matchName = p.name.toLowerCase().includes(search);
    const matchCat = cat ? p.category === cat : true;
    return matchName && matchCat;
  });

  if (filtered.length === 0) {
    emptyState.classList.remove("hidden");
    return;
  }
  emptyState.classList.add("hidden");

  const curr = appState.settings.currency;
  filtered.forEach(p => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><img src="${p.image}" class="table-img" alt="img"></td>
      <td><strong>${p.name}</strong><br><small class="text-muted">${p.date}</small></td>
      <td><span class="badge" style="position:static">${p.category || 'General'}</span></td>
      <td>${curr}${p.chinaPriceBDT.toFixed(0)}</td>
      <td>${curr}${p.landingCost.toFixed(0)}</td>
      <td><strong style="color:var(--primary)">${curr}${p.sellingPrice.toFixed(0)}</strong></td>
      <td class="text-success">${curr}${p.profit.toFixed(0)}</td>
      <td>${p.margin.toFixed(1)}%</td>
      <td>
        <button class="btn danger small" onclick="deleteProduct('${p.id}')">Delete</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

window.deleteProduct = function(id) {
  appState.products = appState.products.filter(p => p.id !== id);
  saveState();
  renderDatabase();
  showToast("Product deleted.");
};

function exportDatabaseCSV() {
  if (appState.products.length === 0) {
    showToast("No products to export!");
    return;
  }
  let csv = "ID,Name,Date,ChinaCostBDT,LandingCost,TotalCost,SellingPrice,Profit,MarginPct\n";
  appState.products.forEach(p => {
    csv += `"${p.id}","${p.name.replace(/"/g, '""')}","${p.date}",${p.chinaPriceBDT},${p.landingCost},${p.totalCost},${p.sellingPrice},${p.profit},${p.margin}\n`;
  });

  const blob = new Blob([csv], { type: "text/csv" });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.setAttribute("hidden", "");
  a.setAttribute("href", url);
  a.setAttribute("download", `import_products_${Date.now()}.csv`);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function copyPricingSummary() {
  if (!appState.currentProduct) return;
  const p = appState.currentProduct;
  const curr = appState.settings.currency;
  const text = `
📦 PRODUCT IMPORT PRICING SUMMARY 📦
------------------------------------
Product Name: ${p.name}
China Cost: ${p.chinaPriceRMB} RMB (${curr}${p.chinaPriceBDT.toFixed(2)})
Weight: ${p.weight}g | Shipping: ${curr}${p.shippingCost.toFixed(2)}
------------------------------------
Landing Cost: ${curr}${p.landingCost.toFixed(2)}
Total Cost (Inc. Ads/Misc): ${curr}${p.totalCost.toFixed(2)}
------------------------------------
🚀 Recommended Selling Price: ${curr}${p.sellingPrice.toFixed(0)}
💰 Estimated Net Profit: ${curr}${p.profit.toFixed(2)} (${p.margin.toFixed(1)}% Margin)
  `.trim();

  navigator.clipboard.writeText(text);
  showToast("Summary copied to clipboard!");
}

/* --- SETTINGS TAB --- */
function bindSettingsEvents() {
  document.getElementById("btnSaveSettings").addEventListener("click", () => {
    appState.settings.airRate = parseFloat(document.getElementById("setAirRate").value) || 1.2;
    appState.settings.seaRate = parseFloat(document.getElementById("setSeaRate").value) || 0.4;
    appState.settings.currency = document.getElementById("setCurrency").value || "৳";
    appState.settings.exchangeRate = parseFloat(document.getElementById("setExchange").value) || 17.5;
    appState.settings.defPack = parseFloat(document.getElementById("setDefPack").value) || 0;
    appState.settings.defCourier = parseFloat(document.getElementById("setDefCourier").value) || 0;
    appState.settings.defAds = parseFloat(document.getElementById("setDefAds").value) || 0;
    appState.settings.bizName = document.getElementById("setBizName").value || "My Store";
    appState.settings.logoUrl = document.getElementById("setLogoUrl").value || "";

    saveState();
    renderSettings();
    showToast("Settings saved permanently!");
    runCalculation();
  });
}

function renderSettings() {
  const s = appState.settings;
  document.getElementById("setAirRate").value = s.airRate;
  document.getElementById("setSeaRate").value = s.seaRate;
  document.getElementById("setCurrency").value = s.currency;
  document.getElementById("setExchange").value = s.exchangeRate;
  document.getElementById("setDefPack").value = s.defPack;
  document.getElementById("setDefCourier").value = s.defCourier;
  document.getElementById("setDefAds").value = s.defAds;
  document.getElementById("setBizName").value = s.bizName;
  document.getElementById("setLogoUrl").value = s.logoUrl;

  // Update labels in Calc UI
  document.getElementById("lblAirRate").innerText = s.currency + s.airRate;
  document.getElementById("lblSeaRate").innerText = s.currency + s.seaRate;
  document.getElementById("businessNameDisplay").innerText = s.bizName;
  
  // Apply defaults to calc inputs if they are currently zero
  if (document.getElementById("costPack").value == "0") document.getElementById("costPack").value = s.defPack;
  if (document.getElementById("costCourier").value == "0") document.getElementById("costCourier").value = s.defCourier;
  if (document.getElementById("costAds").value == "0") document.getElementById("costAds").value = s.defAds;
}

/* --- CHROME EXTENSION COMMUNICATION --- */
function handleExtensionMessage(event) {
  // Validate message structure
  if (event.data && event.data.type === "IMPORT_PRODUCT_DATA") {
    const payload = event.data.payload;
    showToast("🚀 Received product data from Chrome Extension!");

    // Auto-fill calculator fields
    if (payload.title) document.getElementById("calcName").value = payload.title;
    if (payload.price) document.getElementById("calcPrice").value = payload.price;
    if (payload.weight) document.getElementById("calcWeight").value = payload.weight;
    if (payload.image) document.getElementById("calcImage").value = payload.image;

    // Switch to calculator tab and run calculation automatically
    document.querySelector('[data-tab="tab-calculator"]').click();
    runCalculation();
  }
}

function showToast(msg) {
  const toast = document.getElementById("toast");
  toast.innerText = msg;
  toast.classList.remove("hidden");
  setTimeout(() => toast.classList.add("hidden"), 3000);
}