// ============================================================================
// Shopee CS Toolkit v2.1.0 — Chrome Side Panel Script
// ============================================================================

// Regex tách mã đơn hàng Shopee: 6 chữ số đầu + 8 ký tự chữ/số cuối
const ORDER_ID_REGEX = /(?<![A-Za-z0-9])\d{6}[A-Za-z0-9]{8}(?![A-Za-z0-9])/g;
const DEFAULT_INV_MASTER_URL =
  "https://docs.google.com/spreadsheets/d/1SMiD2joWfYTNrkt9vS1TyiyNM2GOkxenODCwbF08JZs/edit?gid=0#gid=0";

const els = {
  // Tabs
  tabBtnDms: document.getElementById("tabBtnDms"),
  tabBtnExtractor: document.getElementById("tabBtnExtractor"),
  tabBtnInvoice: document.getElementById("tabBtnInvoice"),
  panelDms: document.getElementById("panelDms"),
  panelExtractor: document.getElementById("panelExtractor"),
  panelInvoice: document.getElementById("panelInvoice"),

  // DMS Tracking
  orderInput: document.getElementById("orderInput"),
  dmsDetectedCount: document.getElementById("dmsDetectedCount"),
  dmsExtractBtn: document.getElementById("dmsExtractBtn"),
  dmsAutoExtract: document.getElementById("dmsAutoExtract"),
  dmsClearInputBtn: document.getElementById("dmsClearInputBtn"),
  targetUrl: document.getElementById("targetUrl"),
  inputSelector: document.getElementById("inputSelector"),
  firstResultSelector: document.getElementById("firstResultSelector"),
  autoClickFirst: document.getElementById("autoClickFirst"),
  labelKeyword: document.getElementById("labelKeyword"),
  delayMs: document.getElementById("delayMs"),
  reuseTab: document.getElementById("reuseTab"),
  closeTabsOnComplete: document.getElementById("closeTabsOnComplete"),
  startBtn: document.getElementById("startBtn"),
  stopBtn: document.getElementById("stopBtn"),
  copyBtn: document.getElementById("copyBtn"),
  csvBtn: document.getElementById("csvBtn"),
  clearBtn: document.getElementById("clearBtn"),
  statusBar: document.getElementById("statusBar"),
  resultBody: document.getElementById("resultBody"),
  logBox: document.getElementById("logBox"),
  logCount: document.getElementById("logCount"),
  copyLogBtn: document.getElementById("copyLogBtn"),
  clearLogBtn: document.getElementById("clearLogBtn"),

  // Order Extractor Tab
  extInputText: document.getElementById("extInputText"),
  extDedupe: document.getElementById("extDedupe"),
  extSeparator: document.getElementById("extSeparator"),
  extRunBtn: document.getElementById("extRunBtn"),
  extClearBtn: document.getElementById("extClearBtn"),
  extOutputText: document.getElementById("extOutputText"),
  extStatus: document.getElementById("extStatus"),
  extCopyBtn: document.getElementById("extCopyBtn"),
  extSendToDmsBtn: document.getElementById("extSendToDmsBtn"),

  // Invoice Lookup Tab
  invShopId: document.getElementById("invShopId"),
  invPeriodCount: document.getElementById("invPeriodCount"),
  invLoadPeriodsBtn: document.getElementById("invLoadPeriodsBtn"),
  invYearSelect: document.getElementById("invYearSelect"),
  invSelectAllBtn: document.getElementById("invSelectAllBtn"),
  invClearSelectBtn: document.getElementById("invClearSelectBtn"),
  invPeriodList: document.getElementById("invPeriodList"),
  invSelectedMeta: document.getElementById("invSelectedMeta"),
  invMasterUrl: document.getElementById("invMasterUrl"),
  invTargetSheetName: document.getElementById("invTargetSheetName"),
  invAmsSheetKeyword: document.getElementById("invAmsSheetKeyword"),
  invCloseTabs: document.getElementById("invCloseTabs"),
  invSearchBtn: document.getElementById("invSearchBtn"),
  invStopBtn: document.getElementById("invStopBtn"),
  invOpenMonthBtn: document.getElementById("invOpenMonthBtn"),
  invStatusBar: document.getElementById("invStatusBar"),
  invResultCard: document.getElementById("invResultCard"),
  invResultList: document.getElementById("invResultList"),
  invOutputText: document.getElementById("invOutputText"),
  invCopyBtn: document.getElementById("invCopyBtn"),
  invLogBox: document.getElementById("invLogBox"),
  invLogCount: document.getElementById("invLogCount"),
  invCopyLogBtn: document.getElementById("invCopyLogBtn"),
  invClearLogBtn: document.getElementById("invClearLogBtn"),
};

let isRunning = false;
let isInvoiceBusy = false;
let isInvoiceStopping = false;
let results = [];
let rawLogs = [];
let invLogs = [];
let invPeriods = [];
let invSelectedKeys = new Set();
let lastExtractedOrders = [];

// ============================================================================
// Shared Helpers: Tách mã đơn hàng & Clipboard
// ============================================================================

function extractOrderIds(input, dedupe = true) {
  if (!input) {
    return { orders: [], totalFound: 0, duplicatesRemoved: 0 };
  }
  const rawMatches = input.match(ORDER_ID_REGEX) || [];
  if (!dedupe) {
    return {
      orders: rawMatches,
      totalFound: rawMatches.length,
      duplicatesRemoved: 0,
    };
  }
  const uniqueOrders = [...new Set(rawMatches)];
  return {
    orders: uniqueOrders,
    totalFound: rawMatches.length,
    duplicatesRemoved: rawMatches.length - uniqueOrders.length,
  };
}

async function copyTextSafe(text, fallbackTextareaEl = null) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to execCommand fallback
    }
  }
  if (fallbackTextareaEl) {
    fallbackTextareaEl.select();
    fallbackTextareaEl.setSelectionRange(0, 99999);
    return document.execCommand("copy");
  }
  const temp = document.createElement("textarea");
  temp.value = text;
  document.body.appendChild(temp);
  temp.select();
  const ok = document.execCommand("copy");
  document.body.removeChild(temp);
  return ok;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[m]));
}

// ============================================================================
// Tab Switching & Storage Persistence
// ============================================================================

function switchTab(tabName) {
  const tabs = [
    { key: "dms", btn: els.tabBtnDms, panel: els.panelDms },
    { key: "extractor", btn: els.tabBtnExtractor, panel: els.panelExtractor },
    { key: "invoice", btn: els.tabBtnInvoice, panel: els.panelInvoice },
  ];

  tabs.forEach((t) => {
    const active = t.key === tabName;
    t.btn.classList.toggle("active", active);
    t.btn.setAttribute("aria-selected", String(active));
    t.panel.hidden = !active;
    t.panel.classList.toggle("active", active);
  });

  chrome.storage.local.set({ activeTab: tabName });
}

els.tabBtnDms.addEventListener("click", () => switchTab("dms"));
els.tabBtnExtractor.addEventListener("click", () => switchTab("extractor"));
els.tabBtnInvoice.addEventListener("click", () => switchTab("invoice"));

chrome.storage.local.get(
  [
    "activeTab",
    "targetUrl",
    "inputSelector",
    "firstResultSelector",
    "autoClickFirst",
    "labelKeyword",
    "delayMs",
    "reuseTab",
    "closeTabsOnComplete",
    "dmsAutoExtract",
    "extDedupe",
    "extSeparator",
    "invMasterUrl",
    "invTargetSheetName",
    "invAmsSheetKeyword",
    "invCloseTabs",
    "invPeriods",
    "invSelectedKeys",
    "invLastSelectedKey",
  ],
  (data) => {
    if (data.activeTab === "extractor" || data.activeTab === "invoice") {
      switchTab(data.activeTab);
    }
    if (data.targetUrl) els.targetUrl.value = data.targetUrl;
    if (data.inputSelector) els.inputSelector.value = data.inputSelector;
    if (data.firstResultSelector) els.firstResultSelector.value = data.firstResultSelector;
    if (typeof data.autoClickFirst === "boolean") els.autoClickFirst.checked = data.autoClickFirst;
    if (data.labelKeyword) els.labelKeyword.value = data.labelKeyword;
    if (data.delayMs) els.delayMs.value = data.delayMs;
    if (typeof data.reuseTab === "boolean") els.reuseTab.checked = data.reuseTab;
    if (typeof data.closeTabsOnComplete === "boolean") {
      els.closeTabsOnComplete.checked = data.closeTabsOnComplete;
    }
    if (typeof data.dmsAutoExtract === "boolean") {
      els.dmsAutoExtract.checked = data.dmsAutoExtract;
    }
    if (typeof data.extDedupe === "boolean") els.extDedupe.checked = data.extDedupe;
    if (data.extSeparator) els.extSeparator.value = data.extSeparator;

    if (data.invMasterUrl) els.invMasterUrl.value = data.invMasterUrl;
    if (data.invTargetSheetName) els.invTargetSheetName.value = data.invTargetSheetName;
    if (data.invAmsSheetKeyword) els.invAmsSheetKeyword.value = data.invAmsSheetKeyword;
    if (typeof data.invCloseTabs === "boolean") els.invCloseTabs.checked = data.invCloseTabs;
    if (Array.isArray(data.invSelectedKeys) && data.invSelectedKeys.length > 0) {
      invSelectedKeys = new Set(data.invSelectedKeys);
    } else if (data.invLastSelectedKey) {
      invSelectedKeys = new Set([data.invLastSelectedKey]);
    }
    if (Array.isArray(data.invPeriods) && data.invPeriods.length > 0) {
      invPeriods = data.invPeriods;
      renderInvoicePeriodSelectors();
    }

    updateDmsDetectedCount();
  }
);

function saveConfig() {
  chrome.storage.local.set({
    targetUrl: els.targetUrl.value.trim() || "https://dms.cs.shopee.vn/",
    inputSelector: els.inputSelector.value.trim() || "input.pcs-input__input",
    firstResultSelector: els.firstResultSelector.value.trim(),
    autoClickFirst: els.autoClickFirst.checked,
    labelKeyword: els.labelKeyword.value.trim() || "Shipping Tracking Number",
    delayMs: Number(els.delayMs.value) || 1000,
    reuseTab: els.reuseTab.checked,
    closeTabsOnComplete: els.closeTabsOnComplete.checked,
    dmsAutoExtract: els.dmsAutoExtract.checked,
    extDedupe: els.extDedupe.checked,
    extSeparator: els.extSeparator.value,
    invMasterUrl: els.invMasterUrl.value.trim() || DEFAULT_INV_MASTER_URL,
    invTargetSheetName: els.invTargetSheetName.value.trim() || "Hoa don gui PN",
    invAmsSheetKeyword: els.invAmsSheetKeyword.value.trim() || "_AMS",
    invCloseTabs: els.invCloseTabs.checked,
  });
}

// ============================================================================
// TAB 2: Công cụ tách mã đơn hàng
// ============================================================================

function setExtStatus(msg, type = "") {
  els.extStatus.textContent = msg;
  els.extStatus.className = "ext-status" + (type ? ` is-${type}` : "");
}

function runExtractorTab() {
  saveConfig();
  const input = els.extInputText.value;
  const dedupe = els.extDedupe.checked;
  const separator = els.extSeparator.value === "newline" ? "\n" : ",";

  const { orders, duplicatesRemoved } = extractOrderIds(input, dedupe);
  lastExtractedOrders = orders;
  els.extOutputText.value = orders.join(separator);

  if (orders.length > 0) {
    const dupNote = duplicatesRemoved > 0 ? ` (đã lọc ${duplicatesRemoved} mã trùng)` : "";
    setExtStatus(`Đã tìm thấy ${orders.length} mã đơn${dupNote}.`, "ok");
  } else {
    setExtStatus("Không tìm thấy mã đơn hợp lệ.", "err");
  }
}

els.extRunBtn.addEventListener("click", runExtractorTab);

els.extSeparator.addEventListener("change", () => {
  saveConfig();
  if (lastExtractedOrders.length > 0) {
    const separator = els.extSeparator.value === "newline" ? "\n" : ",";
    els.extOutputText.value = lastExtractedOrders.join(separator);
  }
});

els.extDedupe.addEventListener("change", () => {
  saveConfig();
  if (els.extInputText.value.trim()) {
    runExtractorTab();
  }
});

els.extClearBtn.addEventListener("click", () => {
  els.extInputText.value = "";
  els.extOutputText.value = "";
  lastExtractedOrders = [];
  setExtStatus("");
  els.extInputText.focus();
});

els.extCopyBtn.addEventListener("click", async () => {
  if (!els.extOutputText.value.trim()) {
    setExtStatus("Chưa có kết quả để sao chép.", "err");
    return;
  }

  const prevText = els.extStatus.textContent;
  const prevClass = els.extStatus.className;
  await copyTextSafe(els.extOutputText.value, els.extOutputText);
  setExtStatus("Đã sao chép kết quả!", "info");

  setTimeout(() => {
    if (prevText.includes("Đã tìm thấy")) {
      els.extStatus.textContent = prevText;
      els.extStatus.className = prevClass;
    }
  }, 2000);
});

els.extSendToDmsBtn.addEventListener("click", () => {
  let ordersToSend = lastExtractedOrders;
  if (ordersToSend.length === 0 && els.extInputText.value.trim()) {
    const res = extractOrderIds(els.extInputText.value, els.extDedupe.checked);
    ordersToSend = res.orders;
    lastExtractedOrders = res.orders;
    const sep = els.extSeparator.value === "newline" ? "\n" : ",";
    els.extOutputText.value = res.orders.join(sep);
  }

  if (ordersToSend.length === 0) {
    setExtStatus("Chưa có mã đơn hợp lệ để chuyển sang DMS.", "err");
    return;
  }

  els.orderInput.value = ordersToSend.join("\n");
  updateDmsDetectedCount();
  switchTab("dms");
  setStatus(`Đã chuyển ${ordersToSend.length} mã đơn từ công cụ tách mã sang DMS Tracking.`, "ok");
});

// ============================================================================
// TAB 1: DMS Tracking + Tích hợp tách mã đơn vào Input
// ============================================================================

function parseDmsOrders(rawText, useAutoExtract) {
  if (useAutoExtract) {
    return extractOrderIds(rawText, true);
  }
  const lines = rawText
    .split(/[\r\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    orders: lines,
    totalFound: lines.length,
    duplicatesRemoved: 0,
  };
}

function updateDmsDetectedCount() {
  const { orders } = parseDmsOrders(els.orderInput.value, els.dmsAutoExtract.checked);
  els.dmsDetectedCount.textContent = `${orders.length} mã đơn`;
}

els.orderInput.addEventListener("input", updateDmsDetectedCount);
els.dmsAutoExtract.addEventListener("change", () => {
  saveConfig();
  updateDmsDetectedCount();
});

els.dmsExtractBtn.addEventListener("click", () => {
  const { orders, duplicatesRemoved } = extractOrderIds(els.orderInput.value, true);
  if (orders.length === 0) {
    setStatus("Không tìm thấy mã đơn hàng hợp lệ trong ô nhập (định dạng 6 số + 8 ký tự).", "err");
    return;
  }
  els.orderInput.value = orders.join("\n");
  updateDmsDetectedCount();
  const dupNote = duplicatesRemoved > 0 ? ` (lọc bỏ ${duplicatesRemoved} mã trùng)` : "";
  setStatus(`Đã tách ${orders.length} mã đơn hợp lệ${dupNote}.`, "ok");
});

els.dmsClearInputBtn.addEventListener("click", () => {
  els.orderInput.value = "";
  updateDmsDetectedCount();
  els.orderInput.focus();
});

function addLog(msg, level = "info") {
  const now = new Date().toTimeString().split(" ")[0];
  const line = `[${now}] ${msg}`;
  rawLogs.push(line);

  const div = document.createElement("div");
  div.className = `log-${level}`;
  div.textContent = line;
  els.logBox.appendChild(div);
  els.logBox.scrollTop = els.logBox.scrollHeight;
  els.logCount.textContent = `${rawLogs.length} dòng`;
}

function setStatus(msg, type = "") {
  els.statusBar.style.display = "block";
  els.statusBar.textContent = msg;
  els.statusBar.className = "status-bar" + (type ? ` is-${type}` : "");
}

function renderTable() {
  if (results.length === 0) {
    els.resultBody.innerHTML =
      '<tr class="empty-row"><td colspan="4">Chưa có dữ liệu tra cứu.</td></tr>';
    return;
  }
  els.resultBody.innerHTML = "";
  results.forEach((item, idx) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="col-idx">${idx + 1}</td>
      <td class="mono">${escapeHtml(item.orderId)}</td>
      <td class="mono"><strong>${escapeHtml(item.tracking || "-")}</strong></td>
      <td class="${item.ok ? "ok" : "err"}">${escapeHtml(item.status)}</td>
    `;
    els.resultBody.appendChild(tr);
  });
}

async function safeCloseTab(tabId) {
  if (!tabId) return false;
  try {
    await chrome.tabs.remove(tabId);
    return true;
  } catch {
    return false;
  }
}

function navigateAndWait(tabId, url, isCreate = false) {
  return new Promise((resolve, reject) => {
    let targetTabId = tabId;
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      reject(new Error("Timeout tải trang (30s)"));
    }, 30000);

    function onUpdated(updatedId, changeInfo) {
      if (updatedId === targetTabId && changeInfo.status === "complete") {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(onUpdated);
        resolve(targetTabId);
      }
    }

    chrome.tabs.onUpdated.addListener(onUpdated);

    if (isCreate) {
      chrome.tabs.create({ url, active: true }, (tab) => {
        if (chrome.runtime.lastError || !tab) {
          clearTimeout(timeout);
          chrome.tabs.onUpdated.removeListener(onUpdated);
          return reject(new Error(chrome.runtime.lastError?.message || "Không tạo được tab mới"));
        }
        targetTabId = tab.id;
      });
    } else {
      chrome.tabs.update(tabId, { url }, () => {
        if (chrome.runtime.lastError) {
          clearTimeout(timeout);
          chrome.tabs.onUpdated.removeListener(onUpdated);
          return reject(new Error(chrome.runtime.lastError.message));
        }
      });
    }
  });
}

async function waitIfTabLoading(tabId, timeoutMs = 20000) {
  const tab = await chrome.tabs.get(tabId);
  if (tab.status === "complete") return;

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error("Timeout đợi trang chi tiết tải"));
    }, timeoutMs);

    function listener(updatedId, changeInfo) {
      if (updatedId === tabId && changeInfo.status === "complete") {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }

    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.get(tabId, (t) => {
      if (t && t.status === "complete") {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    });
  });
}

// BƯỚC 1: Nhập mã -> Enter -> Click vào kết quả đầu tiên
async function step1SearchAndClick(orderId, config) {
  const logs = [];
  const log = (msg, level = "info") => {
    const t = new Date().toTimeString().split(" ")[0];
    logs.push({ msg: `[Step1 ${t}] ${msg}`, level });
  };
  const sleepInPage = (ms) => new Promise((r) => setTimeout(r, ms));

  function isVisible(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && getComputedStyle(el).visibility !== "hidden";
  }

  try {
    let inputEl = null;
    const startInput = Date.now();
    while (Date.now() - startInput < 15000) {
      const allMatches = Array.from(document.querySelectorAll(config.inputSelector));
      const visibleMatches = allMatches.filter(isVisible);
      if (visibleMatches.length > 0) {
        inputEl = visibleMatches[0];
        log(`Tìm thấy ${allMatches.length} input (${visibleMatches.length} hiển thị). Dùng input[0]`, "ok");
        break;
      }
      await sleepInPage(300);
    }

    if (!inputEl) {
      log(`Không thấy ô nhập "${config.inputSelector}" sau 15s`, "err");
      return { ok: false, error: "Không thấy ô nhập mã", logs };
    }

    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value"
    ).set;

    inputEl.focus();
    nativeSetter.call(inputEl, "");
    inputEl.dispatchEvent(new Event("input", { bubbles: true }));
    await sleepInPage(100);

    nativeSetter.call(inputEl, orderId);
    inputEl.dispatchEvent(new Event("input", { bubbles: true }));
    inputEl.dispatchEvent(new Event("change", { bubbles: true }));
    inputEl.dispatchEvent(new Event("compositionend", { bubbles: true }));
    log(`Đã nhập "${orderId}" vào input.`);

    await sleepInPage(300);

    const keyOpts = {
      key: "Enter",
      code: "Enter",
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true,
    };
    inputEl.dispatchEvent(new KeyboardEvent("keydown", keyOpts));
    inputEl.dispatchEvent(new KeyboardEvent("keypress", keyOpts));
    inputEl.dispatchEvent(new KeyboardEvent("keyup", keyOpts));
    log("Đã gửi phím Enter.");

    const resultSelector =
      config.firstResultSelector ||
      ".search-result .container-search-box, .result-item-container .container-search-box";

    const ORDER_URL_PREFIX = "/info/order/";

    // Tìm tất cả thẻ div hiển thị có thuộc tính url bắt đầu/chứa "/info/order/"
    // (VD: <div url="/info/order/248841747237619">)
    function findOrderUrlDivs() {
      const candidates = [];
      const seen = new Set();
      const addIfVisible = (el) => {
        if (el && !seen.has(el) && isVisible(el)) {
          seen.add(el);
          candidates.push(el);
        }
      };

      // Ưu tiên 1: div có url bắt đầu chính xác bằng "/info/order/"
      document
        .querySelectorAll('div[url^="/info/order/"]')
        .forEach(addIfVisible);

      // Ưu tiên 2: div có url chứa "/info/order/" (phòng trường hợp có domain phía trước)
      document
        .querySelectorAll('div[url*="/info/order/"]')
        .forEach(addIfVisible);

      // Ưu tiên 3: tìm bên trong kết quả khớp resultSelector
      document.querySelectorAll(resultSelector).forEach((el) => {
        const ownUrl = (el.getAttribute("url") || "").trim();
        if (ownUrl.startsWith(ORDER_URL_PREFIX) || ownUrl.includes(ORDER_URL_PREFIX)) {
          addIfVisible(el);
        } else {
          const nestedDiv = el.querySelector('div[url^="/info/order/"], div[url*="/info/order/"]');
          if (nestedDiv) addIfVisible(nestedDiv);
        }
      });

      return candidates;
    }

    log(`Đang đợi kết quả tìm kiếm (ưu tiên div[url^="/info/order/"])...`);
    const startWaitResult = Date.now();
    const ORDER_WAIT_GRACE_MS = 2500;
    let firstGenericSeenAt = 0;
    let targetEl = null;

    while (Date.now() - startWaitResult < 10000) {
      const directInfo = document.querySelector(".info-item-r");
      if (directInfo && isVisible(directInfo)) {
        log("Trang đã hiển thị thẳng .info-item-r, không cần click danh sách.", "ok");
        return { ok: true, clicked: false, logs };
      }

      const subTextEl = document.querySelector(".search-result__text-sub");
      if (subTextEl && /found\s*0\s*result/i.test(subTextEl.innerText || "")) {
        log(`Hệ thống báo: "${subTextEl.innerText.trim()}"`, "err");
        return { ok: false, error: "Không có kết quả (Found 0)", logs };
      }

      // 1. Khi có nhiều kết quả, luôn chọn kết quả đầu tiên là div có url="/info/order/..."
      const orderDivs = findOrderUrlDivs();
      if (orderDivs.length > 0) {
        const allMatches = Array.from(document.querySelectorAll(resultSelector)).filter(isVisible);
        targetEl = orderDivs[0];
        const urlAttr = targetEl.getAttribute("url") || "";
        const textPreview = (targetEl.innerText || "").replace(/\s+/g, " ").trim().slice(0, 80);
        log(
          `Thấy ${Math.max(allMatches.length, orderDivs.length)} kết quả (${orderDivs.length} div khớp url="/info/order/..."). Chọn kết quả đầu tiên: [${urlAttr}] "${textPreview}"`,
          "ok"
        );
        break;
      }

      // 2. Nếu có kết quả khác xuất hiện trước, đợi thêm tối đa 2.5s để div url="/info/order/" kịp render rồi mới fallback
      const genericMatches = Array.from(document.querySelectorAll(resultSelector)).filter(isVisible);
      if (genericMatches.length > 0) {
        if (!firstGenericSeenAt) {
          firstGenericSeenAt = Date.now();
          log(
            `Thấy ${genericMatches.length} kết quả nhưng chưa có div[url*="/info/order/"]. Đợi thêm kết quả đơn hàng...`,
            "info"
          );
        } else if (Date.now() - firstGenericSeenAt >= ORDER_WAIT_GRACE_MS) {
          targetEl =
            genericMatches.find((el) => /order\s*detail/i.test(el.innerText || "")) ||
            genericMatches[0];
          const urlAttr = targetEl.getAttribute("url") || "";
          const textPreview = (targetEl.innerText || "").replace(/\s+/g, " ").trim().slice(0, 80);
          log(
            `Không thấy div[url*="/info/order/"] sau 2.5s. Fallback sang kết quả: [${urlAttr}] "${textPreview}"`,
            "warn"
          );
          break;
        }
      }

      await sleepInPage(250);
    }

    if (!targetEl) {
      if (!config.autoClickFirst) {
        log("Đã tắt tự động click kết quả đầu tiên.", "warn");
        return { ok: true, clicked: false, logs };
      }
      log("Hết 10s không thấy kết quả tìm kiếm nào hiện ra.", "err");
      return { ok: false, error: "Không thấy kết quả tìm kiếm", logs };
    }

    if (!config.autoClickFirst) {
      log("Đã tắt tự động click kết quả đầu tiên.", "warn");
      return { ok: true, clicked: false, targetUrl: targetEl.getAttribute("url") || "", logs };
    }

    targetEl.scrollIntoView({ block: "nearest" });
    targetEl.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    targetEl.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
    targetEl.click();
    log(`Đã click vào kết quả [${targetEl.getAttribute("url") || "no-url"}]!`, "ok");

    return { ok: true, clicked: true, targetUrl: targetEl.getAttribute("url") || "", logs };
  } catch (err) {
    log(`Lỗi Step1: ${err.message}`, "err");
    return { ok: false, error: err.message, logs };
  }
}

// BƯỚC 2: Đợi và lấy Shipping Tracking Number từ .info-item-r
async function step2ExtractTracking(config) {
  const logs = [];
  const log = (msg, level = "info") => {
    const t = new Date().toTimeString().split(" ")[0];
    logs.push({ msg: `[Step2 ${t}] ${msg}`, level });
  };
  const sleepInPage = (ms) => new Promise((r) => setTimeout(r, ms));

  function extractTracking() {
    const items = document.querySelectorAll(".info-item-r");
    for (const item of items) {
      const labelEl = item.querySelector(".label");
      const valueEl = item.querySelector(".value");
      if (labelEl && valueEl) {
        const labelTxt = (labelEl.textContent || "").trim();
        if (labelTxt.toLowerCase().includes(config.labelKeyword.toLowerCase())) {
          const valTxt = (valueEl.textContent || "").trim();
          if (valTxt && valTxt !== "-" && !/^(loading|null|undefined|none|n\/a)$/i.test(valTxt)) {
            return { val: valTxt, method: "DOM .info-item-r", count: items.length };
          }
        }
      }
    }

    const escaped = config.labelKeyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(escaped + "\\s*[:=\\-]?\\s*[\\r\\n\\t ]*([A-Z0-9_-]{6,})", "i");
    const match = (document.body.innerText || "").match(regex);
    if (match && match[1]) {
      const val = match[1].trim();
      if (!/^(loading|null|undefined|none)$/i.test(val)) {
        return { val, method: "Regex innerText", count: items.length };
      }
    }
    return null;
  }

  try {
    log(`Đang đợi "${config.labelKeyword}" xuất hiện tại ${location.href}...`);
    const startWait = Date.now();
    while (Date.now() - startWait < 15000) {
      const found = extractTracking();
      if (found) {
        log(`Lấy thành công (${found.method}, ${found.count} .info-item-r): ${found.val}`, "ok");
        return { ok: true, tracking: found.val, logs };
      }
      await sleepInPage(350);
    }

    const debugItems = Array.from(document.querySelectorAll(".info-item-r")).map((el) =>
      (el.innerText || "").replace(/\s+/g, " ").trim()
    );
    log(
      `Timeout 15s! Tìm thấy ${debugItems.length} .info-item-r. Mẫu: ${JSON.stringify(debugItems.slice(0, 6))}`,
      "err"
    );
    return { ok: false, error: "Không thấy Shipping Tracking Number", logs };
  } catch (err) {
    log(`Lỗi Step2: ${err.message}`, "err");
    return { ok: false, error: err.message, logs };
  }
}

// Vòng lặp chính DMS Tracking (tích hợp tự tách mã + tự đóng tab sau khi hoàn tất)
els.startBtn.addEventListener("click", async () => {
  saveConfig();

  const useAutoExtract = els.dmsAutoExtract.checked;
  const parsed = parseDmsOrders(els.orderInput.value, useAutoExtract);
  const orders = parsed.orders;

  if (orders.length === 0) {
    setStatus(
      useAutoExtract
        ? "Không tìm thấy mã đơn hàng hợp lệ (6 số + 8 ký tự). Hãy kiểm tra lại dữ liệu đầu vào."
        : "Vui lòng nhập ít nhất 1 mã đơn hàng!",
      "err"
    );
    return;
  }

  // Chuẩn hóa lại ô nhập thành danh sách mã đơn sạch nếu bật tự động tách
  if (useAutoExtract) {
    els.orderInput.value = orders.join("\n");
    updateDmsDetectedCount();
    if (parsed.duplicatesRemoved > 0) {
      addLog(`Tự động tách ${orders.length} mã đơn hợp lệ (loại bỏ ${parsed.duplicatesRemoved} mã trùng).`, "ok");
    }
  }

  isRunning = true;
  els.startBtn.disabled = true;
  els.stopBtn.disabled = false;
  results = [];
  renderTable();

  const targetUrl = els.targetUrl.value.trim() || "https://dms.cs.shopee.vn/";
  const config = {
    inputSelector: els.inputSelector.value.trim() || "input.pcs-input__input",
    firstResultSelector: els.firstResultSelector.value.trim(),
    autoClickFirst: els.autoClickFirst.checked,
    labelKeyword: els.labelKeyword.value.trim() || "Shipping Tracking Number",
  };
  const delayMs = Number(els.delayMs.value) || 1000;
  const reuseTab = els.reuseTab.checked;
  const closeTabsOnComplete = els.closeTabsOnComplete.checked;

  addLog(`=== BẮT ĐẦU (${orders.length} mã) | URL: ${targetUrl} ===`, "info");

  let activeTabId = null;
  let needsLogin = false;
  const createdTabIds = new Set();

  try {
    for (let i = 0; i < orders.length; i++) {
      if (!isRunning) break;
      const orderId = orders[i];
      setStatus(`Đang xử lý (${i + 1}/${orders.length}): ${orderId}...`);
      addLog(`--- [${i + 1}/${orders.length}] Xử lý mã: ${orderId} ---`, "info");

      let openedNewTabId = null;

      try {
        if (!activeTabId || !reuseTab) {
          addLog(`Mở tab mới tới ${targetUrl}...`);
          activeTabId = await navigateAndWait(null, targetUrl, true);
          createdTabIds.add(activeTabId);
        } else {
          addLog(`Tải lại tab #${activeTabId} tới ${targetUrl}...`);
          try {
            await navigateAndWait(activeTabId, targetUrl, false);
          } catch {
            // Nếu tab trước đó đã bị người dùng đóng thủ công, tự mở lại tab mới
            addLog("Tab cũ không còn tồn tại, đang mở tab tra cứu mới...", "warn");
            createdTabIds.delete(activeTabId);
            activeTabId = await navigateAndWait(null, targetUrl, true);
            createdTabIds.add(activeTabId);
          }
        }

        const currentTab = await chrome.tabs.get(activeTabId);
        if (currentTab.url && currentTab.url.includes("accounts.google.com")) {
          addLog("Đang bị chuyển sang đăng nhập Google! Giữ tab mở để đăng nhập.", "err");
          setStatus("Vui lòng đăng nhập Google trên tab vừa mở rồi chạy lại.", "err");
          needsLogin = true;
          isRunning = false;
          break;
        }

        await sleep(1000);
        if (!isRunning) break;

        const onTabCreated = (newTab) => {
          if (!openedNewTabId) {
            openedNewTabId = newTab.id;
            createdTabIds.add(newTab.id);
          }
        };
        chrome.tabs.onCreated.addListener(onTabCreated);

        let step1Res = null;
        try {
          const exec1 = await chrome.scripting.executeScript({
            target: { tabId: activeTabId },
            func: step1SearchAndClick,
            args: [orderId, config],
          });
          step1Res = exec1?.[0]?.result;
          if (step1Res?.logs) step1Res.logs.forEach((l) => addLog(l.msg, l.level));
        } finally {
          await sleep(600);
          chrome.tabs.onCreated.removeListener(onTabCreated);
        }

        if (!step1Res || !step1Res.ok) {
          results.push({
            orderId,
            tracking: "",
            status: step1Res?.error || "Lỗi tìm kiếm",
            ok: false,
          });
          renderTable();
          continue;
        }

        const detailTabId = openedNewTabId || activeTabId;
        if (openedNewTabId) {
          addLog(`Phát hiện click mở tab chi tiết mới (#${openedNewTabId}). Đang đợi tải...`);
        }
        await waitIfTabLoading(detailTabId);
        await sleep(600);
        if (!isRunning) break;

        const exec2 = await chrome.scripting.executeScript({
          target: { tabId: detailTabId },
          func: step2ExtractTracking,
          args: [config],
        });
        const step2Res = exec2?.[0]?.result;
        if (step2Res?.logs) step2Res.logs.forEach((l) => addLog(l.msg, l.level));

        if (step2Res && step2Res.ok) {
          results.push({ orderId, tracking: step2Res.tracking, status: "Thành công", ok: true });
        } else {
          results.push({
            orderId,
            tracking: "",
            status: step2Res?.error || "Thất bại",
            ok: false,
          });
        }
      } catch (err) {
        addLog(`Lỗi ngoại lệ: ${err.message}`, "err");
        results.push({ orderId, tracking: "", status: err.message, ok: false });
      } finally {
        // Luôn đóng tab chi tiết phụ phát sinh sau khi lấy xong đơn
        if (openedNewTabId) {
          await safeCloseTab(openedNewTabId);
          createdTabIds.delete(openedNewTabId);
        }
      }

      renderTable();
      if (i < orders.length - 1 && isRunning) {
        await sleep(delayMs);
      }
    }

    // Tự động đóng toàn bộ tab tool đã tạo sau khi hoàn tất (trừ khi cần đăng nhập Google)
    let closedCount = 0;
    if (closeTabsOnComplete && !needsLogin && createdTabIds.size > 0) {
      for (const tabId of createdTabIds) {
        const closed = await safeCloseTab(tabId);
        if (closed) closedCount++;
      }
      createdTabIds.clear();
      if (closedCount > 0) {
        addLog(`Đã tự động đóng ${closedCount} tab tra cứu được tạo.`, "ok");
      }
    }

    if (!needsLogin && isRunning) {
      const okCount = results.filter((r) => r.ok).length;
      const tabNote = closedCount > 0 ? " · Đã đóng tab tra cứu." : "";
      setStatus(`Hoàn tất! ${okCount}/${orders.length} thành công${tabNote}`, okCount > 0 ? "ok" : "err");
      addLog("=== HOÀN TẤT ===", "ok");
    }
  } finally {
    // Dự phòng: đóng tab nếu dừng giữa chừng (và không phải lỗi đăng nhập)
    if (closeTabsOnComplete && !needsLogin && createdTabIds.size > 0) {
      for (const tabId of createdTabIds) {
        await safeCloseTab(tabId);
      }
      createdTabIds.clear();
    }
    isRunning = false;
    els.startBtn.disabled = false;
    els.stopBtn.disabled = true;
  }
});

els.stopBtn.addEventListener("click", () => {
  isRunning = false;
  addLog("Người dùng đã bấm Dừng.", "warn");
  setStatus("Đã dừng theo yêu cầu.");
});

els.clearBtn.addEventListener("click", () => {
  results = [];
  renderTable();
  els.statusBar.style.display = "none";
});

els.clearLogBtn.addEventListener("click", () => {
  rawLogs = [];
  els.logBox.innerHTML = "";
  els.logCount.textContent = "0 dòng";
});

els.copyLogBtn.addEventListener("click", async () => {
  if (!rawLogs.length) return;
  await copyTextSafe(rawLogs.join("\n"));
  setStatus("Đã copy toàn bộ nhật ký chạy!", "ok");
});

els.copyBtn.addEventListener("click", async () => {
  if (!results.length) return;
  const tsv = results.map((r) => `${r.orderId}\t${r.tracking}`).join("\n");
  await copyTextSafe(tsv);
  setStatus("Đã copy dạng bảng (dán thẳng vào Excel / Google Sheets)!", "ok");
});

els.csvBtn.addEventListener("click", () => {
  if (!results.length) return;
  const header = "Ma_Don_Hang,Ma_Van_Don,Trang_Thai\n";
  const rows = results
    .map((r) => `"${r.orderId}","${r.tracking}","${r.status}"`)
    .join("\n");
  const blob = new Blob(["\uFEFF" + header + rows], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `shopee-dms-tracking-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});

// ============================================================================
// TAB 3: Tra cứu mã hóa đơn từ Google Sheets (Master -> Sheet tháng -> Hoa don gui PN)
// ============================================================================

function addInvLog(msg, level = "info") {
  const now = new Date().toTimeString().split(" ")[0];
  const line = `[${now}] ${msg}`;
  invLogs.push(line);

  const div = document.createElement("div");
  div.className = `log-${level}`;
  div.textContent = line;
  els.invLogBox.appendChild(div);
  els.invLogBox.scrollTop = els.invLogBox.scrollHeight;
  els.invLogCount.textContent = `${invLogs.length} dòng`;
}

function setInvStatus(msg, type = "") {
  els.invStatusBar.style.display = "block";
  els.invStatusBar.textContent = msg;
  els.invStatusBar.className = "status-bar" + (type ? ` is-${type}` : "");
}

function parseSpreadsheetUrl(url) {
  const idMatch = String(url || "").match(/\/spreadsheets\/(?:u\/\d+\/)?d\/([a-zA-Z0-9-_]+)/);
  const gidMatch = String(url || "").match(/[?#&]gid=(\d+)/);
  return {
    sheetId: idMatch ? idMatch[1] : "",
    gid: gidMatch ? gidMatch[1] : "0",
  };
}

function periodKey(p) {
  return `${p.year}__${p.month}`;
}

function getFilteredInvoicePeriods() {
  const yearFilter = els.invYearSelect.value;
  return yearFilter === "all"
    ? invPeriods
    : invPeriods.filter((p) => p.year === yearFilter);
}

function getSelectedInvoicePeriods() {
  return invPeriods.filter((p) => invSelectedKeys.has(periodKey(p)));
}

function saveSelectedPeriodKeys() {
  chrome.storage.local.set({ invSelectedKeys: Array.from(invSelectedKeys) });
}

function updateSelectedPeriodMeta() {
  const selectedList = getSelectedInvoicePeriods();
  els.invPeriodCount.textContent =
    invPeriods.length > 0
      ? `${selectedList.length}/${invPeriods.length} kỳ chọn`
      : "Chưa tải kỳ";

  if (selectedList.length === 0) {
    els.invOpenMonthBtn.disabled = true;
    els.invSelectedMeta.textContent = invPeriods.length
      ? "Tick chọn ít nhất 1 kỳ Năm - Tháng bên trên để tra cứu."
      : "Bấm \"Tải kỳ từ Sheet gốc\" để lấy danh sách Năm - Tháng (cột A, B, C).";
    return;
  }

  els.invOpenMonthBtn.disabled = false;
  if (selectedList.length === 1) {
    const one = selectedList[0];
    const parsed = parseSpreadsheetUrl(one.url);
    const shortId = parsed.sheetId ? ` · ID: ${parsed.sheetId.slice(0, 8)}...${parsed.sheetId.slice(-4)}` : "";
    els.invSelectedMeta.textContent = `Đã chọn 1 kỳ · File: ${one.title || one.url}${shortId}`;
  } else {
    const labels = selectedList.map((p) => `${p.year} - ${p.month}`).join(", ");
    els.invSelectedMeta.textContent = `Đã chọn ${selectedList.length} kỳ: ${labels}`;
  }
  saveSelectedPeriodKeys();
}

function populatePeriodOptions() {
  const filtered = getFilteredInvoicePeriods();
  els.invPeriodList.innerHTML = "";

  if (filtered.length === 0) {
    els.invPeriodList.innerHTML =
      '<div class="inv-period-empty">Bấm "Tải kỳ từ Sheet gốc" để nạp danh sách Năm - Tháng.</div>';
    updateSelectedPeriodMeta();
    return;
  }

  // Nếu chưa có kỳ nào được chọn hợp lệ trong invPeriods, mặc định tick kỳ mới nhất
  const validExisting = invPeriods.filter((p) => invSelectedKeys.has(periodKey(p)));
  if (validExisting.length === 0 && filtered.length > 0) {
    invSelectedKeys.add(periodKey(filtered[filtered.length - 1]));
  }

  filtered.forEach((p) => {
    const key = periodKey(p);
    const checked = invSelectedKeys.has(key);
    const parsed = parseSpreadsheetUrl(p.url);
    const shortTag = p.title
      ? p.title.replace(/^CS\s+monthly\s+invoice\s+tracker\s*/i, "").trim()
      : parsed.sheetId.slice(0, 10);

    const label = document.createElement("label");
    label.className = "inv-period-item" + (checked ? " is-checked" : "");

    const left = document.createElement("span");
    left.className = "inv-period-left";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.value = key;
    cb.checked = checked;
    cb.addEventListener("change", () => {
      if (cb.checked) {
        invSelectedKeys.add(key);
      } else {
        invSelectedKeys.delete(key);
      }
      label.classList.toggle("is-checked", cb.checked);
      updateSelectedPeriodMeta();
    });

    const nameSpan = document.createElement("span");
    nameSpan.className = "inv-period-name";
    nameSpan.textContent = `${p.year} - ${p.month}`;

    left.appendChild(cb);
    left.appendChild(nameSpan);

    const subSpan = document.createElement("span");
    subSpan.className = "inv-period-sub";
    subSpan.title = p.title || p.url;
    subSpan.textContent = shortTag;

    label.appendChild(left);
    label.appendChild(subSpan);
    els.invPeriodList.appendChild(label);
  });

  updateSelectedPeriodMeta();
}

function renderInvoicePeriodSelectors() {
  const validKeys = new Set(invPeriods.map((p) => periodKey(p)));
  invSelectedKeys = new Set([...invSelectedKeys].filter((k) => validKeys.has(k)));

  const years = [...new Set(invPeriods.map((p) => p.year))].sort((a, b) => Number(b) - Number(a));
  const currentYearVal = els.invYearSelect.value;

  els.invYearSelect.innerHTML = '<option value="all">Tất cả năm</option>';
  years.forEach((y) => {
    const opt = document.createElement("option");
    opt.value = y;
    opt.textContent = `Năm ${y}`;
    els.invYearSelect.appendChild(opt);
  });

  if (years.includes(currentYearVal)) {
    els.invYearSelect.value = currentYearVal;
  } else if (years.length > 0) {
    els.invYearSelect.value = years[0];
  }

  populatePeriodOptions();
}

els.invYearSelect.addEventListener("change", () => populatePeriodOptions());

els.invSelectAllBtn.addEventListener("click", () => {
  const filtered = getFilteredInvoicePeriods();
  filtered.forEach((p) => invSelectedKeys.add(periodKey(p)));
  populatePeriodOptions();
});

els.invClearSelectBtn.addEventListener("click", () => {
  const filtered = getFilteredInvoicePeriods();
  filtered.forEach((p) => invSelectedKeys.delete(periodKey(p)));
  populatePeriodOptions();
});

els.invOpenMonthBtn.addEventListener("click", () => {
  const selectedList = getSelectedInvoicePeriods();
  if (selectedList.length === 0) return;
  // Mở tối đa 5 tab cùng lúc để tránh treo trình duyệt nếu tick quá nhiều
  selectedList.slice(0, 5).forEach((p, idx) => {
    if (p.url) chrome.tabs.create({ url: p.url, active: idx === 0 });
  });
});

// ============================================================================
// Google Sheets Helpers (Chạy trực tiếp trong Side Panel -> KHÔNG BỊ CHẶN CORS
// khi Google Sheets redirect 302 sang *.googleusercontent.com!)
// ============================================================================

function normSheetText(str) {
  return String(str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function normSheetKey(str) {
  return normSheetText(str).replace(/[^a-z0-9]+/g, "");
}

function normShopIdVal(val) {
  return String(val || "")
    .trim()
    .replace(/^'/, "")
    .replace(/[\s,]+/g, "")
    .replace(/\.0+$/, "");
}

function parseSpreadsheetFullUrl(url) {
  const raw = String(url || "");
  const m = raw.match(/\/spreadsheets\/(u\/\d+\/)?d\/([a-zA-Z0-9-_]+)/);
  const gidMatch = raw.match(/[?#&]gid=(\d+)/);
  const accPrefix = m && m[1] ? m[1] : "";
  const sheetId = m ? m[2] : "";
  return {
    accPrefix,
    sheetId,
    gid: gidMatch ? gidMatch[1] : "0",
    basePath: sheetId ? `https://docs.google.com/spreadsheets/${accPrefix}d/${sheetId}` : "",
  };
}

function unwrapGoogleHref(rawHref) {
  if (!rawHref) return "";
  const cleaned = String(rawHref).replace(/&amp;/g, "&").trim();
  try {
    const u = new URL(cleaned, "https://docs.google.com");
    if (u.hostname.includes("google.com") && u.pathname === "/url") {
      const q = u.searchParams.get("q") || u.searchParams.get("url");
      if (q) return q.trim();
    }
    return u.href;
  } catch {
    return cleaned;
  }
}

function extractInvoiceCodeValue(rawValue) {
  const cleaned = String(rawValue || "").trim();
  if (!cleaned || cleaned === "-" || /^n\/a$/i.test(cleaned)) {
    return "Không phát sinh";
  }
  if (/khong\s*phat\s*sinh/i.test(normSheetText(cleaned))) {
    return "Không phát sinh";
  }
  const tokens = cleaned
    .split(/[\r\n,;]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  const extracted = tokens.map((token) => {
    if (token.includes("_")) {
      const parts = token.split("_").filter(Boolean);
      return parts[parts.length - 1] || token;
    }
    return token;
  });
  return extracted.join(", ") || "Không phát sinh";
}

function parseTsvRows(text) {
  return String(text || "")
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map((line) =>
      line.split("\t").map((cell) => cell.trim().replace(/^"(.*)"$/, "$1"))
    );
}

function parseGvizJsonRows(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < 0) return [];
  const data = JSON.parse(text.slice(start, end + 1));
  const table = data?.table;
  if (!table) return [];
  const rows = [];
  if (Array.isArray(table.cols)) {
    const headerRow = table.cols.map((c) => String(c?.label || "").trim());
    if (headerRow.some(Boolean)) rows.push(headerRow);
  }
  if (Array.isArray(table.rows)) {
    for (const r of table.rows) {
      const cells = (r?.c || []).map((cell) => {
        if (!cell) return "";
        if (cell.f !== undefined && cell.f !== null) return String(cell.f).trim();
        if (cell.v !== undefined && cell.v !== null) return String(cell.v).trim();
        return "";
      });
      rows.push(cells);
    }
  }
  return rows;
}

// Giải nén toàn bộ file text (XML / HTML) từ buffer ZIP hoặc XLSX không cần thư viện ngoài
async function extractTextFilesFromZipBuffer(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const files = new Map();
  if (bytes.length < 22 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    return files;
  }

  const view = new DataView(arrayBuffer);
  let eocdOffset = -1;
  const minOffset = Math.max(0, bytes.length - 65557);
  for (let i = bytes.length - 22; i >= minOffset; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) return files;

  const totalEntries = view.getUint16(eocdOffset + 10, true);
  let cdOffset = view.getUint32(eocdOffset + 16, true);
  const decoder = new TextDecoder("utf-8");

  for (let idx = 0; idx < totalEntries; idx++) {
    if (cdOffset + 46 > bytes.length || view.getUint32(cdOffset, true) !== 0x02014b50) break;
    const compressionMethod = view.getUint16(cdOffset + 10, true);
    const compressedSize = view.getUint32(cdOffset + 20, true);
    const fileNameLen = view.getUint16(cdOffset + 28, true);
    const extraLen = view.getUint16(cdOffset + 30, true);
    const commentLen = view.getUint16(cdOffset + 32, true);
    const localHeaderOffset = view.getUint32(cdOffset + 42, true);

    const fileName = decoder.decode(bytes.subarray(cdOffset + 46, cdOffset + 46 + fileNameLen));
    cdOffset += 46 + fileNameLen + extraLen + commentLen;

    if (!/\.(xml|rels|html?)$/i.test(fileName)) continue;
    if (localHeaderOffset + 30 > bytes.length) continue;

    const localNameLen = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
    const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
    if (dataStart + compressedSize > bytes.length) continue;

    const compressedData = bytes.subarray(dataStart, dataStart + compressedSize);
    if (compressionMethod === 0) {
      files.set(fileName, decoder.decode(compressedData));
    } else if (compressionMethod === 8 && typeof DecompressionStream !== "undefined") {
      try {
        const ds = new DecompressionStream("deflate-raw");
        const stream = new Blob([compressedData]).stream().pipeThrough(ds);
        const text = await new Response(stream).text();
        files.set(fileName, text);
      } catch {
        // Bỏ qua entry lỗi nén nếu có
      }
    }
  }
  return files;
}

function colLettersToZeroIdx(letters) {
  let idx = 0;
  for (let i = 0; i < letters.length; i++) {
    idx = idx * 26 + (letters.charCodeAt(i) - 64);
  }
  return idx - 1;
}

function normalizeXlsxTargetPath(target) {
  const cleaned = String(target || "").replace(/^\/+/, "");
  if (cleaned.startsWith("xl/")) return cleaned;
  return `xl/${cleaned}`;
}

// Parse file .xlsx trực tiếp: giữ chính xác tọa độ ô (A29, B29, C29) và link Smart Chips trong <hyperlinks> + .rels
async function parseXlsxWorkbookBuffer(arrayBuffer) {
  const files = await extractTextFilesFromZipBuffer(arrayBuffer);
  const workbookXml = files.get("xl/workbook.xml");
  if (!workbookXml) return null;

  const parser = new DOMParser();

  // 1. Đọc bảng chuỗi dùng chung (sharedStrings.xml)
  const sharedStrings = [];
  const sstXml = files.get("xl/sharedStrings.xml");
  if (sstXml) {
    const sstDoc = parser.parseFromString(sstXml, "application/xml");
    const siNodes = Array.from(sstDoc.getElementsByTagNameNS("*", "si"));
    for (const si of siNodes) {
      const tNodes = Array.from(si.getElementsByTagNameNS("*", "t"));
      sharedStrings.push(tNodes.map((t) => t.textContent || "").join(""));
    }
  }

  // 2. Đọc quan hệ workbook -> đường dẫn file từng sheet
  const wbRelsMap = new Map();
  const wbRelsXml = files.get("xl/_rels/workbook.xml.rels");
  if (wbRelsXml) {
    const relDoc = parser.parseFromString(wbRelsXml, "application/xml");
    const rels = Array.from(relDoc.getElementsByTagNameNS("*", "Relationship"));
    for (const rel of rels) {
      const id = rel.getAttribute("Id");
      const target = rel.getAttribute("Target");
      if (id && target) wbRelsMap.set(id, normalizeXlsxTargetPath(target));
    }
  }

  // 3. Danh sách sheet
  const wbDoc = parser.parseFromString(workbookXml, "application/xml");
  const sheetNodes = Array.from(wbDoc.getElementsByTagNameNS("*", "sheet"));
  const sheets = sheetNodes.map((node, index) => {
    const name = node.getAttribute("name") || `Sheet${index + 1}`;
    const rId =
      node.getAttribute("r:id") ||
      node.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id") ||
      "";
    const path = (rId && wbRelsMap.get(rId)) || `xl/worksheets/sheet${index + 1}.xml`;
    return { name, rId, path };
  });

  function readSheetCells(sheetObj) {
    const xml = files.get(sheetObj.path);
    if (!xml) return [];
    const doc = parser.parseFromString(xml, "application/xml");

    // Đọc file .rels của riêng sheet để ánh xạ rId -> URL thực (Smart Chips & Hyperlinks)
    const relPath = sheetObj.path.replace(
      /^(.*\/)([^/]+\.xml)$/,
      "$1_rels/$2.rels"
    );
    const relTargets = new Map();
    const relXml = files.get(relPath);
    if (relXml) {
      const relDoc = parser.parseFromString(relXml, "application/xml");
      const rels = Array.from(relDoc.getElementsByTagNameNS("*", "Relationship"));
      for (const rel of rels) {
        const id = rel.getAttribute("Id");
        const target = rel.getAttribute("Target");
        if (id && target) relTargets.set(id, unwrapGoogleHref(target));
      }
    }

    // Ánh xạ tọa độ ô (VD: "C29") -> URL từ thẻ <hyperlinks>
    const cellLinks = new Map();
    const hlNodes = Array.from(doc.getElementsByTagNameNS("*", "hyperlink"));
    for (const hl of hlNodes) {
      const refRaw = hl.getAttribute("ref") || "";
      const refCell = refRaw.split(":")[0].trim().toUpperCase();
      const rId =
        hl.getAttribute("r:id") ||
        hl.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id") ||
        "";
      const targetUrl = (rId && relTargets.get(rId)) || "";
      if (refCell && targetUrl) {
        cellLinks.set(refCell, targetUrl);
      }
    }

    // Đọc từng dòng & ô theo đúng chỉ số cột thật
    const rows = [];
    const rowNodes = Array.from(doc.getElementsByTagNameNS("*", "row"));
    for (const rowNode of rowNodes) {
      const cNodes = Array.from(rowNode.getElementsByTagNameNS("*", "c"));
      if (cNodes.length === 0) continue;
      const rowArr = [];

      for (const c of cNodes) {
        const ref = (c.getAttribute("r") || "").toUpperCase();
        const refMatch = ref.match(/^([A-Z]+)(\d+)$/);
        const colIdx = refMatch ? colLettersToZeroIdx(refMatch[1]) : rowArr.length;
        const cellType = c.getAttribute("t") || "";

        let text = "";
        if (cellType === "s") {
          const vNode = c.getElementsByTagNameNS("*", "v")[0];
          const idx = Number(vNode?.textContent || "");
          text = Number.isFinite(idx) && sharedStrings[idx] !== undefined ? sharedStrings[idx] : "";
        } else if (cellType === "inlineStr") {
          const tNodes = Array.from(c.getElementsByTagNameNS("*", "t"));
          text = tNodes.map((t) => t.textContent || "").join("");
        } else {
          const vNode = c.getElementsByTagNameNS("*", "v")[0];
          text = vNode ? vNode.textContent || "" : "";
        }

        let link = cellLinks.get(ref) || "";
        if (!link) {
          const fNode = c.getElementsByTagNameNS("*", "f")[0];
          const formula = fNode?.textContent || "";
          const fMatch = formula.match(/HYPERLINK\(\s*"(https?:\/\/[^"]+)"/i);
          if (fMatch) link = unwrapGoogleHref(fMatch[1]);
        }

        rowArr[colIdx] = { text: String(text || "").trim(), link };
      }

      if (rowArr.length > 0) rows.push(rowArr);
    }
    return rows;
  }

  return { sheets, readSheetCells };
}

// Parse file .ods (OpenDocument Spreadsheet — cũng là file ZIP chứa content.xml, giữ nguyên <text:a xlink:href="..."> của Smart Chips!)
async function parseOdsWorkbookBuffer(arrayBuffer) {
  const files = await extractTextFilesFromZipBuffer(arrayBuffer);
  const contentXml = files.get("content.xml");
  if (!contentXml) return null;

  const parser = new DOMParser();
  const doc = parser.parseFromString(contentXml, "application/xml");
  const tableNodes = Array.from(doc.getElementsByTagNameNS("*", "table"));
  const sheets = tableNodes.map((tbl, index) => {
    const name =
      tbl.getAttribute("table:name") ||
      tbl.getAttributeNS("urn:oasis:names:tc:opendocument:xmlns:table:1.0", "name") ||
      tbl.getAttribute("name") ||
      `Sheet${index + 1}`;
    return { name, node: tbl };
  });

  function readSheetCells(sheetObj) {
    const rows = [];
    const rowNodes = Array.from(sheetObj.node.getElementsByTagNameNS("*", "table-row"));
    for (const rowNode of rowNodes) {
      const cellNodes = Array.from(rowNode.children).filter(
        (el) => el.localName === "table-cell" || el.localName === "covered-table-cell"
      );
      if (cellNodes.length === 0) continue;
      const rowArr = [];
      for (const cell of cellNodes) {
        const repAttr =
          cell.getAttribute("table:number-columns-repeated") ||
          cell.getAttributeNS("urn:oasis:names:tc:opendocument:xmlns:table:1.0", "number-columns-repeated") ||
          "1";
        const repeat = Math.min(Math.max(1, parseInt(repAttr, 10) || 1), 16);

        const text = (cell.textContent || "").trim();
        let link = "";
        const linkNodes = Array.from(cell.getElementsByTagNameNS("*", "a"));
        for (const a of linkNodes) {
          const href =
            a.getAttribute("xlink:href") ||
            a.getAttributeNS("http://www.w3.org/1999/xlink", "href") ||
            a.getAttribute("href") ||
            "";
          const unwrapped = unwrapGoogleHref(href);
          if (unwrapped.includes("docs.google.com/spreadsheets") || unwrapped.includes("drive.google.com")) {
            link = unwrapped;
            break;
          }
          if (!link && /^https?:\/\//i.test(unwrapped)) {
            link = unwrapped;
          }
        }

        for (let r = 0; r < repeat; r++) {
          if (rowArr.length >= 16) break;
          rowArr.push({ text, link });
        }
        if (rowArr.length >= 16) break;
      }
      if (rowArr.some((c) => c.text || c.link)) rows.push(rowArr);
    }
    return rows;
  }

  return { sheets, readSheetCells };
}

function extractPeriodsFromCellRows(cellRows) {
  const items = [];
  const seenKeys = new Set();
  let lastValidYear = "";

  for (const row of cellRows) {
    if (!row || row.length < 3) continue;
    const rawYear = (row[0]?.text || "").trim();
    const rawMonth = (row[1]?.text || "").trim();
    const colC = row[2];

    let year = rawYear;
    if (/^20\d{2}$/.test(rawYear)) {
      lastValidYear = rawYear;
    } else if (!rawYear && lastValidYear && /th[aá]ng|t\d|p\d/i.test(rawMonth)) {
      year = lastValidYear;
    }

    if (!/^20\d{2}$/.test(year) || !rawMonth) continue;

    let title = (colC?.text || "").replace(/\s+/g, " ").trim();
    let link = colC?.link || "";

    // Dự phòng nếu cột C trống link nhưng có cột liền kề chứa link Google Sheets
    if (!link) {
      const linkCell = row.slice(2, 6).find((c) => c && c.link);
      if (linkCell) {
        link = linkCell.link;
        if (!title) title = (linkCell.text || "").replace(/\s+/g, " ").trim();
      }
    }

    if (link) {
      const key = `${year}__${rawMonth}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        items.push({ year, month: rawMonth, title, url: link });
      }
    }
  }
  return items;
}

function extractLinkFromHtmlTd(td) {
  if (!td) return "";
  const anchors = Array.from(td.querySelectorAll("a[href]"));
  for (const a of anchors) {
    const unwrapped = unwrapGoogleHref(a.getAttribute("href") || "");
    if (unwrapped.includes("docs.google.com/spreadsheets") || unwrapped.includes("drive.google.com")) {
      return unwrapped;
    }
  }
  for (const a of anchors) {
    const unwrapped = unwrapGoogleHref(a.getAttribute("href") || "");
    if (/^https?:\/\//i.test(unwrapped)) return unwrapped;
  }

  const rawHtml = td.innerHTML || "";
  const directMatch = rawHtml.match(/https?:\/\/docs\.google\.com\/spreadsheets\/d\/[a-zA-Z0-9-_]+[^"'\s<>]*/i);
  if (directMatch) return unwrapGoogleHref(directMatch[0]);

  const encodedMatch = rawHtml.match(/https%3A%2F%2Fdocs\.google\.com%2Fspreadsheets%2Fd%2F[a-zA-Z0-9-_]+[^"'\s<>%&]*/i);
  if (encodedMatch) {
    try {
      return decodeURIComponent(encodedMatch[0]);
    } catch {
      // ignore
    }
  }
  return "";
}

// Parse bảng HTML (cả /htmlview/sheet lẫn /export?format=zip) thành ma trận ô chuẩn, bỏ freezebar & xử lý rowspan/colspan
function parseHtmlToCellMatrix(htmlText, targetGid = "") {
  const doc = new DOMParser().parseFromString(htmlText, "text/html");
  let container = doc;
  if (targetGid) {
    const gidContainer = doc.getElementById(String(targetGid));
    if (gidContainer) {
      container = gidContainer;
    } else {
      const firstGrid = doc.querySelector(".ritz.grid-container");
      if (firstGrid) container = firstGrid;
    }
  }

  const table = container.querySelector("table.waffle") || container.querySelector("table");
  if (!table) return [];

  const trList = Array.from(table.querySelectorAll("tbody tr, tr"));
  const grid = [];
  const seenTr = new Set();

  let rowIdx = 0;
  for (const tr of trList) {
    if (seenTr.has(tr)) continue;
    seenTr.add(tr);

    const tds = Array.from(tr.children).filter(
      (el) => el.tagName === "TD" && !el.classList.contains("freezebar-cell")
    );
    if (tds.length === 0) continue;

    if (!grid[rowIdx]) grid[rowIdx] = [];
    let colIdx = 0;

    for (const td of tds) {
      while (grid[rowIdx][colIdx]) colIdx++;
      const rowSpan = Math.max(1, parseInt(td.getAttribute("rowspan") || "1", 10) || 1);
      const colSpan = Math.max(1, parseInt(td.getAttribute("colspan") || "1", 10) || 1);
      const cellObj = {
        text: (td.textContent || "").trim(),
        link: extractLinkFromHtmlTd(td),
      };

      for (let rs = 0; rs < rowSpan; rs++) {
        if (!grid[rowIdx + rs]) grid[rowIdx + rs] = [];
        for (let cs = 0; cs < colSpan; cs++) {
          grid[rowIdx + rs][colIdx + cs] = cellObj;
        }
      }
      colIdx += colSpan;
    }
    rowIdx++;
  }
  return grid;
}

// IN-PAGE HELPER 1: Đọc tên sheet đang active + quét dự phòng bootstrapData nếu các cách export đều bị ẩn link Smart Chip
function stepReadMasterMetaInPage(extractBootstrapLinks = false) {
  const activeTabNameEl = document.querySelector(".docs-sheet-active-tab .docs-sheet-tab-name");
  const activeSheetName = (activeTabNameEl?.textContent || "").trim();
  const title = (document.title || "").trim();

  if (!extractBootstrapLinks) {
    return { activeSheetName, title, pairs: [] };
  }

  // Dự phòng: quét cặp (title <-> spreadsheet/drive URL) trong các thẻ script của trang /edit
  const fullText = Array.from(document.scripts)
    .map((s) => s.textContent || "")
    .join("\n")
    .replace(/\\\//g, "/")
    .replace(/\\u002[fF]/g, "/");

  const urlRegex = /https:\/\/(?:docs\.google\.com\/spreadsheets\/d\/|drive\.google\.com\/(?:file\/d\/|open\?id=))[a-zA-Z0-9-_]+(?:\/[^"'\\\s<>]*)?/g;
  const pairs = [];
  let match;
  while ((match = urlRegex.exec(fullText)) !== null) {
    const start = Math.max(0, match.index - 280);
    const end = Math.min(fullText.length, match.index + match[0].length + 280);
    const windowStr = fullText.slice(start, end);
    pairs.push({ url: match[0], context: windowStr });
  }
  return { activeSheetName, title, pairs };
}

// IN-PAGE HELPER 2: Tìm & click tab sheet khớp "Hoa don gui PN" trên thanh tab /edit (dự phòng khi /htmlview không có #sheet-menu)
async function stepFindSheetGidInPage(targetSheetKeyword) {
  const sleepInPage = (ms) => new Promise((r) => setTimeout(r, ms));
  const norm = (str) =>
    String(str || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/gi, "d")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();

  const targetNorm = norm(targetSheetKeyword || "Hoa don gui PN");
  const startTabs = Date.now();
  let matchedTabEl = null;
  let matchedSheetName = "";
  let uiNames = [];

  while (Date.now() - startTabs < 8000) {
    const tabEls = Array.from(document.querySelectorAll(".docs-sheet-tab"));
    if (tabEls.length > 0) {
      uiNames = tabEls.map((el) => (el.textContent || "").trim()).filter(Boolean);
      for (const tabEl of tabEls) {
        const nameEl = tabEl.querySelector(".docs-sheet-tab-name") || tabEl;
        const tabName = (nameEl.textContent || "").trim();
        if (norm(tabName) === targetNorm || norm(tabName).includes(targetNorm)) {
          matchedTabEl = tabEl;
          matchedSheetName = tabName;
          break;
        }
      }
      break;
    }
    await sleepInPage(300);
  }

  if (!matchedTabEl) {
    return { ok: false, matchedGid: "", matchedSheetName: "", uiNames, pageTitle: document.title || "" };
  }

  const wasActive = matchedTabEl.classList.contains("docs-sheet-active-tab");
  const prevHref = location.href;
  const clickTarget = matchedTabEl.querySelector(".docs-sheet-tab-name") || matchedTabEl;
  clickTarget.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
  clickTarget.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
  clickTarget.click();

  let matchedGid = "";
  const waitStart = Date.now();
  while (Date.now() - waitStart < 4000) {
    const isNowActive = matchedTabEl.classList.contains("docs-sheet-active-tab");
    if (isNowActive && (wasActive || location.href !== prevHref)) {
      const hashGid = location.href.match(/[?#&]gid=(\d+)/);
      if (hashGid) {
        matchedGid = hashGid[1];
        break;
      }
      if (wasActive && Date.now() - waitStart > 1000) {
        break;
      }
    }
    await sleepInPage(200);
  }

  return {
    ok: true,
    matchedGid,
    matchedSheetName,
    wasActive,
    uiNames,
    pageTitle: document.title || "",
  };
}

// BƯỚC 1 (UI): Tải danh sách Năm - Tháng từ Master Sheet (fetch trực tiếp từ Extension -> không bị CORS!)
els.invLoadPeriodsBtn.addEventListener("click", async () => {
  if (isInvoiceBusy) return;
  saveConfig();

  const masterUrl = els.invMasterUrl.value.trim() || DEFAULT_INV_MASTER_URL;
  const initialParsed = parseSpreadsheetFullUrl(masterUrl);
  if (!initialParsed.sheetId) {
    setInvStatus("URL Sheet tổng hợp không hợp lệ!", "err");
    return;
  }

  isInvoiceBusy = true;
  els.invLoadPeriodsBtn.disabled = true;
  els.invSearchBtn.disabled = true;

  let masterTabId = null;
  let needsLogin = false;
  const shouldCloseTabs = els.invCloseTabs.checked;

  try {
    setInvStatus("Đang mở Sheet gốc để xác thực phiên Google và đọc cột A, B, C...");
    addInvLog(`Mở Sheet gốc: ${masterUrl}`, "info");

    masterTabId = await navigateAndWait(null, masterUrl, true);
    const tabInfo = await chrome.tabs.get(masterTabId);
    if (tabInfo.url && tabInfo.url.includes("accounts.google.com")) {
      needsLogin = true;
      addInvLog("Cần đăng nhập Google! Giữ tab mở để bạn đăng nhập.", "err");
      setInvStatus("Vui lòng đăng nhập Google trên tab vừa mở rồi bấm tải lại.", "err");
      return;
    }

    // Lấy accPrefix (/u/0/, /u/1/...) và gid thật từ tab đã mở
    const resolved = parseSpreadsheetFullUrl(tabInfo.url || masterUrl);
    const basePath = resolved.basePath || initialParsed.basePath;
    const targetGid = resolved.gid || initialParsed.gid || "0";

    await sleep(900);
    let activeSheetName = "";
    try {
      const metaRes = await chrome.scripting.executeScript({
        target: { tabId: masterTabId },
        func: stepReadMasterMetaInPage,
        args: [false],
      });
      activeSheetName = metaRes?.[0]?.result?.activeSheetName || "";
      if (activeSheetName) {
        addInvLog(`Sheet gốc đang mở: "${activeSheetName}" (gid=${targetGid}, prefix="${resolved.accPrefix || "default"}")`, "info");
      }
    } catch {
      // Không chặn nếu chưa kịp đọc tên tab
    }

    let periods = [];
    let usedMethod = "";
    let fallbackTextRows = [];

    // CÁCH 1 (Ưu tiên cao nhất): /export?format=zip KHÔNG kèm &gid= (Google trả 400 nếu truyền gid cho format=zip!)
    // Giữ nguyên 100% link Smart Chips cột C dưới dạng <a href="..."> trong file "<tên sheet>.html"
    addInvLog("[Cách 1] Đang tải gói HTML (/export?format=zip) từ Extension...", "info");
    try {
      const zipRes = await fetch(`${basePath}/export?format=zip`, {
        credentials: "include",
        redirect: "follow",
      });
      if (zipRes.ok && !zipRes.url.includes("accounts.google.com")) {
        const buf = await zipRes.arrayBuffer();
        const files = await extractTextFilesFromZipBuffer(buf);
        const htmlEntries = Array.from(files.entries())
          .filter(([name]) => /\.html?$/i.test(name))
          .map(([fileName, html]) => ({ fileName, html }));

        addInvLog(
          `Đã giải nén ${htmlEntries.length} sheet HTML: ${htmlEntries.map((e) => e.fileName).join(", ")}`,
          "info"
        );

        const targetKey = normSheetKey(activeSheetName);
        htmlEntries.sort((a, b) => {
          const aMatch = targetKey && normSheetKey(a.fileName.replace(/\.html?$/i, "")) === targetKey ? 1 : 0;
          const bMatch = targetKey && normSheetKey(b.fileName.replace(/\.html?$/i, "")) === targetKey ? 1 : 0;
          return bMatch - aMatch;
        });

        for (const entry of htmlEntries) {
          const matrix = parseHtmlToCellMatrix(entry.html, "");
          if (fallbackTextRows.length === 0 && matrix.length > 0) fallbackTextRows = matrix;
          const extracted = extractPeriodsFromCellRows(matrix);
          if (extracted.length > 0) {
            periods = extracted;
            usedMethod = `export-zip (${entry.fileName})`;
            break;
          }
        }
        if (periods.length === 0) {
          addInvLog("Không thấy link Smart Chip trong /export?format=zip, chuyển sang /export?format=ods...", "warn");
        }
      } else {
        addInvLog(`/export?format=zip trả mã ${zipRes.status}, chuyển sang /export?format=ods...`, "warn");
      }
    } catch (e) {
      addInvLog(`Lỗi /export?format=zip: ${e.message}`, "warn");
    }

    // CÁCH 2: /export?format=ods (OpenDocument Spreadsheet -> content.xml chứa <text:a xlink:href="..."> của Smart Chips!)
    if (periods.length === 0) {
      addInvLog("[Cách 2] Đang tải /export?format=ods từ Extension...", "info");
      try {
        const odsRes = await fetch(`${basePath}/export?format=ods`, {
          credentials: "include",
          redirect: "follow",
        });
        if (odsRes.ok && !odsRes.url.includes("accounts.google.com")) {
          const buf = await odsRes.arrayBuffer();
          const wb = await parseOdsWorkbookBuffer(buf);
          if (wb && wb.sheets.length > 0) {
            const targetKey = normSheetKey(activeSheetName);
            const orderedSheets = [...wb.sheets].sort((a, b) => {
              const aMatch = targetKey && normSheetKey(a.name) === targetKey ? 1 : 0;
              const bMatch = targetKey && normSheetKey(b.name) === targetKey ? 1 : 0;
              return bMatch - aMatch;
            });
            for (const sh of orderedSheets) {
              const cellRows = wb.readSheetCells(sh);
              if (fallbackTextRows.length === 0 && cellRows.length > 0) fallbackTextRows = cellRows;
              const extracted = extractPeriodsFromCellRows(cellRows);
              if (extracted.length > 0) {
                periods = extracted;
                usedMethod = `export-ods (${sh.name})`;
                break;
              }
            }
            if (periods.length === 0) {
              addInvLog("File ODS không thấy link cột C, thử /htmlview/sheet...", "warn");
            }
          }
        } else {
          addInvLog(`/export?format=ods trả mã ${odsRes.status}.`, "warn");
        }
      } catch (e) {
        addInvLog(`Lỗi /export?format=ods: ${e.message}`, "warn");
      }
    }

    // CÁCH 3: /htmlview/sheet?gid=... (endpoint chứa thẳng <table class="waffle"> kể cả khi file có nhiều sheet!)
    if (periods.length === 0) {
      addInvLog(`[Cách 3] Đang đọc /htmlview/sheet?gid=${targetGid}...`, "info");
      try {
        const hvRes = await fetch(`${basePath}/htmlview/sheet?gid=${targetGid}`, {
          credentials: "include",
          redirect: "follow",
        });
        if (hvRes.ok && !hvRes.url.includes("accounts.google.com")) {
          const html = await hvRes.text();
          const matrix = parseHtmlToCellMatrix(html, "");
          if (fallbackTextRows.length === 0 && matrix.length > 0) fallbackTextRows = matrix;
          const extracted = extractPeriodsFromCellRows(matrix);
          if (extracted.length > 0) {
            periods = extracted;
            usedMethod = `htmlview-sheet (gid=${targetGid})`;
          } else {
            addInvLog(`Đã đọc ${matrix.length} dòng từ /htmlview/sheet nhưng không thấy thẻ <a href> cột C.`, "warn");
          }
        } else {
          addInvLog(`/htmlview/sheet trả mã ${hvRes.status}.`, "warn");
        }
      } catch (e) {
        addInvLog(`Lỗi /htmlview/sheet: ${e.message}`, "warn");
      }
    }

    // CÁCH 4: /export?format=xlsx (kiểm tra <hyperlinks> + .rels + công thức HYPERLINK)
    if (periods.length === 0) {
      addInvLog("[Cách 4] Đang tải /export?format=xlsx từ Extension...", "info");
      try {
        const xlsxRes = await fetch(`${basePath}/export?format=xlsx`, {
          credentials: "include",
          redirect: "follow",
        });
        if (xlsxRes.ok && !xlsxRes.url.includes("accounts.google.com")) {
          const buf = await xlsxRes.arrayBuffer();
          const wb = await parseXlsxWorkbookBuffer(buf);
          if (wb && wb.sheets.length > 0) {
            const targetKey = normSheetKey(activeSheetName);
            const orderedSheets = [...wb.sheets].sort((a, b) => {
              const aMatch = targetKey && normSheetKey(a.name) === targetKey ? 1 : 0;
              const bMatch = targetKey && normSheetKey(b.name) === targetKey ? 1 : 0;
              return bMatch - aMatch;
            });
            for (const sh of orderedSheets) {
              const cellRows = wb.readSheetCells(sh);
              if (fallbackTextRows.length === 0 && cellRows.length > 0) fallbackTextRows = cellRows;
              const extracted = extractPeriodsFromCellRows(cellRows);
              if (extracted.length > 0) {
                periods = extracted;
                usedMethod = `export-xlsx (${sh.name})`;
                break;
              }
            }
          }
        }
      } catch (e) {
        addInvLog(`Lỗi /export?format=xlsx: ${e.message}`, "warn");
      }
    }

    // CÁCH 5 (Dự phòng cuối): Lấy text cột A/B/C qua TSV nếu chưa có, rồi ghép với URL Smart Chip trong trang /edit
    if (periods.length === 0) {
      if (fallbackTextRows.length === 0) {
        try {
          const tsvRes = await fetch(`${basePath}/export?format=tsv&gid=${targetGid}`, {
            credentials: "include",
            redirect: "follow",
          });
          if (tsvRes.ok) {
            const tsvText = await tsvRes.text();
            fallbackTextRows = parseTsvRows(tsvText).map((r) => r.map((txt) => ({ text: txt, link: "" })));
          }
        } catch {
          // ignore
        }
      }

      if (fallbackTextRows.length > 0) {
        addInvLog(`[Cách 5] Thử ghép ${fallbackTextRows.length} dòng cột A/B/C với dữ liệu Smart Chip trên trang /edit...`, "info");
        try {
          const bootRes = await chrome.scripting.executeScript({
            target: { tabId: masterTabId },
            func: stepReadMasterMetaInPage,
            args: [true],
          });
          const pairs = bootRes?.[0]?.result?.pairs || [];
          addInvLog(`Tìm thấy ${pairs.length} URL Google Sheets trong script của trang /edit.`, "info");
          if (pairs.length > 0) {
            let lastYear = "";
            const seenKeys = new Set();
            for (const row of fallbackTextRows) {
              if (!row || row.length < 3) continue;
              const rawYear = (row[0]?.text || "").trim();
              const rawMonth = (row[1]?.text || "").trim();
              const title = (row[2]?.text || "").replace(/\s+/g, " ").trim();
              let year = rawYear;
              if (/^20\d{2}$/.test(rawYear)) lastYear = rawYear;
              else if (!rawYear && lastYear && /th[aá]ng|t\d|p\d/i.test(rawMonth)) year = lastYear;
              if (!/^20\d{2}$/.test(year) || !rawMonth || !title) continue;

              const titleNorm = normSheetKey(title);
              const matchedPair = pairs.find((p) => normSheetKey(p.context).includes(titleNorm));
              if (matchedPair) {
                const key = `${year}__${rawMonth}`;
                if (!seenKeys.has(key)) {
                  seenKeys.add(key);
                  periods.push({ year, month: rawMonth, title, url: matchedPair.url });
                }
              }
            }
            if (periods.length > 0) usedMethod = "edit-bootstrap";
          }
        } catch (e) {
          addInvLog(`Lỗi Cách 5: ${e.message}`, "warn");
        }
      }
    }

    if (periods.length === 0) {
      setInvStatus("Không đọc được link cột C từ Sheet gốc (xem Nhật ký Logs bên dưới).", "err");
      return;
    }

    addInvLog(`Đọc thành công ${periods.length} kỳ qua [${usedMethod}]:`, "ok");
    periods.forEach((p) => {
      const m = p.url.match(/\/d\/([a-zA-Z0-9-_]+)/);
      addInvLog(`  • ${p.year} - ${p.month} => ${p.title} [ID: ${m ? m[1] : p.url}]`, "info");
    });

    invPeriods = periods;
    chrome.storage.local.set({ invPeriods });
    renderInvoicePeriodSelectors();

    setInvStatus(`Đã nạp ${invPeriods.length} kỳ Năm - Tháng từ Sheet gốc (${usedMethod}).`, "ok");
  } catch (err) {
    addInvLog(`Lỗi tải Sheet gốc: ${err.message}`, "err");
    setInvStatus(`Lỗi: ${err.message}`, "err");
  } finally {
    if (masterTabId && shouldCloseTabs && !needsLogin) {
      await safeCloseTab(masterTabId);
      addInvLog(`Đã tự động đóng tab Sheet gốc #${masterTabId}.`, "ok");
    }
    isInvoiceBusy = false;
    els.invLoadPeriodsBtn.disabled = false;
    els.invSearchBtn.disabled = false;
  }
});

// Lọc sheet AMS: CHỈ lấy sheet có chứa "_AMS", TUYỆT ĐỐI loại bỏ "AMS Service fee"
function isAmsSheetMatch(sheetName, amsKeyword = "_AMS") {
  const raw = String(sheetName || "").trim();
  const norm = normSheetText(raw);
  if (norm.includes("ams service fee")) return false;
  const kw = String(amsKeyword || "_AMS").trim().toLowerCase();
  return raw.toLowerCase().includes(kw) || norm.includes(normSheetText(kw));
}

// Helper dùng chung tải dữ liệu 1 sheet theo gid/tên trực tiếp từ Extension (KHÔNG BỊ CORS!)
async function fetchSheetRowsFromExtension(basePath, sheetGid, sheetName, xlsxCacheRef) {
  let rows = [];
  let fetchMethod = "";

  if (sheetGid) {
    try {
      const tsvRes = await fetch(`${basePath}/export?format=tsv&gid=${sheetGid}`, {
        credentials: "include",
        redirect: "follow",
      });
      if (tsvRes.ok && !tsvRes.url.includes("accounts.google.com")) {
        const tsvText = await tsvRes.text();
        if (tsvText && !/^\s*<!doctype html/i.test(tsvText) && !/^\s*<html/i.test(tsvText)) {
          rows = parseTsvRows(tsvText);
          fetchMethod = "export-tsv";
        }
      }
    } catch (e) {
      addInvLog(`Lỗi TSV ("${sheetName}"): ${e.message}`, "warn");
    }

    if (rows.length === 0) {
      try {
        const gvizRes = await fetch(`${basePath}/gviz/tq?tqx=out:json&gid=${sheetGid}`, {
          credentials: "include",
          redirect: "follow",
        });
        if (gvizRes.ok && !gvizRes.url.includes("accounts.google.com")) {
          const gvizText = await gvizRes.text();
          rows = parseGvizJsonRows(gvizText);
          if (rows.length > 0) fetchMethod = "gviz-gid";
        }
      } catch (e) {
        addInvLog(`Lỗi GViz ("${sheetName}"): ${e.message}`, "warn");
      }
    }
  }

  if (rows.length === 0) {
    try {
      if (!xlsxCacheRef.attempted) {
        xlsxCacheRef.attempted = true;
        const xlsxRes = await fetch(`${basePath}/export?format=xlsx`, {
          credentials: "include",
          redirect: "follow",
        });
        if (xlsxRes.ok && !xlsxRes.url.includes("accounts.google.com")) {
          const buf = await xlsxRes.arrayBuffer();
          xlsxCacheRef.wb = await parseXlsxWorkbookBuffer(buf);
        }
      }
      const wb = xlsxCacheRef.wb;
      if (wb && wb.sheets.length > 0 && sheetName) {
        const wantNorm = normSheetText(sheetName);
        const targetSh =
          wb.sheets.find((s) => normSheetText(s.name) === wantNorm) ||
          wb.sheets.find((s) => normSheetText(s.name).includes(wantNorm));
        if (targetSh) {
          const cellRows = wb.readSheetCells(targetSh);
          rows = cellRows.map((r) => r.map((c) => (c ? c.text : "")));
          if (rows.length > 0) fetchMethod = "export-xlsx";
        }
      }
    } catch (e) {
      addInvLog(`Lỗi XLSX ("${sheetName}"): ${e.message}`, "warn");
    }
  }

  if (rows.length === 0 && sheetGid) {
    try {
      const hvSheetRes = await fetch(`${basePath}/htmlview/sheet?gid=${sheetGid}`, {
        credentials: "include",
        redirect: "follow",
      });
      if (hvSheetRes.ok && !hvSheetRes.url.includes("accounts.google.com")) {
        const htmlText = await hvSheetRes.text();
        const matrix = parseHtmlToCellMatrix(htmlText, "");
        rows = matrix.map((r) => r.map((c) => (c ? c.text : "")));
        if (rows.length > 0) fetchMethod = "htmlview-sheet";
      }
    } catch (e) {
      addInvLog(`Lỗi /htmlview/sheet ("${sheetName}"): ${e.message}`, "warn");
    }
  }

  return { rows, fetchMethod };
}

// Tìm dòng tiêu đề và dòng khớp ShopID trong 1 bảng
function findHeaderAndShopRow(rows, cleanShopId) {
  let headerRowIdx = -1;
  let shopIdCol = -1;

  for (let r = 0; r < Math.min(rows.length, 10); r++) {
    const normCells = rows[r].map(normSheetText);
    const shopIdx = normCells.findIndex(
      (h) => h === "shopid" || /shop\s*_?id/.test(h) || h === "shop"
    );
    const hasMetaCols = normCells.some((h) =>
      /user\s*_?id|username|hoa\s*don|phi\s*san|ma\s*tra\s*cuu|tra\s*cuu|invoice|ams/.test(h)
    );
    if (shopIdx >= 0 || hasMetaCols) {
      headerRowIdx = r;
      if (shopIdx >= 0) shopIdCol = shopIdx;
      break;
    }
  }

  // Nếu không khớp từ khóa tiêu đề rõ ràng, chọn dòng đầu tiên có >= 3 ô chữ (không phải dòng số ShopID)
  if (headerRowIdx < 0) {
    for (let r = 0; r < Math.min(rows.length, 5); r++) {
      const nonEmpty = rows[r].filter((c) => String(c || "").trim().length > 0);
      const firstIsPureDigits = /^\d{5,}$/.test(normShopIdVal(rows[r][0]));
      if (nonEmpty.length >= 3 && !firstIsPureDigits) {
        headerRowIdx = r;
        break;
      }
    }
  }

  const startDataIdx = headerRowIdx >= 0 ? headerRowIdx + 1 : 0;
  let matchedRow = null;
  let matchedRowIndex = -1;

  if (shopIdCol >= 0) {
    for (let i = startDataIdx; i < rows.length; i++) {
      if (normShopIdVal(rows[i][shopIdCol]) === cleanShopId) {
        matchedRow = rows[i];
        matchedRowIndex = i + 1;
        break;
      }
    }
  }

  if (!matchedRow) {
    for (let i = startDataIdx; i < rows.length; i++) {
      const c0 = normShopIdVal(rows[i][0]);
      const c1 = normShopIdVal(rows[i][1]);
      if (c0 === cleanShopId || c1 === cleanShopId) {
        matchedRow = rows[i];
        matchedRowIndex = i + 1;
        break;
      }
    }
  }

  if (!matchedRow) {
    for (let i = startDataIdx; i < rows.length; i++) {
      if (rows[i].some((c) => normShopIdVal(c) === cleanShopId)) {
        matchedRow = rows[i];
        matchedRowIndex = i + 1;
        break;
      }
    }
  }

  return {
    headerRow: headerRowIdx >= 0 ? rows[headerRowIdx] : [],
    headerRowIdx,
    shopIdCol,
    matchedRow,
    matchedRowIndex,
  };
}

// Bỏ 3 cột đầu tiên (A, B, C) của sheet "Hoa don gui PN", lấy mã tra cứu cho TẤT CẢ các cột còn lại!
function extractAllColumnsAfterFirst3(headerRow, matchedRow) {
  const maxCol = Math.max(headerRow.length, matchedRow.length);
  const items = [];

  for (let c = 3; c < maxCol; c++) {
    const rawHeader = String(headerRow[c] || "").replace(/\s+/g, " ").trim();
    const rawVal = String(matchedRow[c] || "").trim();
    if (!rawHeader && !rawVal) continue;

    const label =
      rawHeader ||
      (c === 3
        ? "Hoa_don_phi_san"
        : c === 4
        ? "Hoa_don_phi_rut_tien"
        : c === 5
        ? "Hoa_don_phi_svs"
        : `Hoa_don_cot_${c + 1}`);

    items.push({
      label,
      value: extractInvoiceCodeValue(rawVal),
      source: "pn",
    });
  }
  return items;
}

// Trích xuất mã tra cứu "Phí dịch vụ AMS" từ dòng tìm thấy trong sheet "_AMS"
function extractAmsItemsFromRow(headerRow, matchedRow, shopIdCol) {
  if (!matchedRow) {
    return [{ label: "Phi_dich_vu_AMS", value: "Không phát sinh", source: "ams" }];
  }

  const maxCol = Math.max(headerRow.length, matchedRow.length);
  const codeHeaderCols = [];

  // Ưu tiên 1: Các cột có tiêu đề rõ ràng về mã hóa đơn / mã tra cứu
  for (let c = 0; c < maxCol; c++) {
    if (c === shopIdCol) continue;
    const h = normSheetText(headerRow[c]);
    if (!h) continue;
    const isCodeHeader =
      /ma\s*tra\s*cuu|tra\s*cuu|hoa\s*don|invoice|lookup|ma\s*hd|ky\s*hieu|code|serial|so\s*hd/.test(h);
    const isExcluded =
      /ngay|date|trang\s*thai|status|so\s*tien|amount|vat|thue|tong|total|ghi\s*chu|note|email|tax/.test(h);
    if (isCodeHeader && !isExcluded) {
      codeHeaderCols.push(c);
    }
  }

  if (codeHeaderCols.length > 0) {
    const vals = codeHeaderCols
      .map((c) => extractInvoiceCodeValue(matchedRow[c]))
      .filter((v, idx, arr) => v !== "Không phát sinh" || arr.length === 1);
    const uniqueVals = [...new Set(vals)];
    return [
      {
        label: "Phi_dich_vu_AMS",
        value: uniqueVals.length > 0 ? uniqueVals.join(", ") : "Không phát sinh",
        source: "ams",
      },
    ];
  }

  // Ưu tiên 2: Các ô sau 3 cột đầu (c >= 3) có định dạng mã hóa đơn chứa "_" (VD: K26TAC_12345_CODE)
  const patternVals = [];
  for (let c = 0; c < matchedRow.length; c++) {
    if (c === shopIdCol || c < 2) continue;
    const raw = String(matchedRow[c] || "").trim();
    if (/_[A-Za-z0-9]{5,}/.test(raw)) {
      patternVals.push(extractInvoiceCodeValue(raw));
    }
  }
  if (patternVals.length > 0) {
    return [
      {
        label: "Phi_dich_vu_AMS",
        value: [...new Set(patternVals)].join(", "),
        source: "ams",
      },
    ];
  }

  // Ưu tiên 3: Bỏ 3 cột đầu tiên (c >= 3), lấy giá trị mã từ các cột còn lại (bỏ qua cột tiền thuần số)
  const fallbackVals = [];
  for (let c = 3; c < maxCol; c++) {
    const raw = String(matchedRow[c] || "").trim();
    if (!raw) continue;
    if (/^[\d.,\s]+$/.test(raw)) continue;
    fallbackVals.push(extractInvoiceCodeValue(raw));
  }
  return [
    {
      label: "Phi_dich_vu_AMS",
      value: fallbackVals.length > 0 ? [...new Set(fallbackVals)].join(", ") : "Không phát sinh",
      source: "ams",
    },
  ];
}

function formatMultiPeriodResultsText(periodResults) {
  const valid = periodResults.filter((r) => r.ok && r.items.length > 0);
  if (valid.length === 0) return "";
  if (valid.length === 1) {
    return valid[0].items.map((it) => `${it.label} ${it.value}`).join("\n");
  }
  return valid
    .map((r) => {
      const lines = r.items.map((it) => `${it.label} ${it.value}`).join("\n");
      return `[${r.periodLabel}]\n${lines}`;
    })
    .join("\n\n");
}

function renderInvoiceResultsUI(periodResults) {
  els.invResultList.innerHTML = "";
  periodResults.forEach((res) => {
    const block = document.createElement("div");
    block.className = "inv-period-result" + (res.ok ? "" : " is-error");

    const head = document.createElement("div");
    head.className = "inv-result-head";

    const titleEl = document.createElement("strong");
    titleEl.textContent = `${res.periodLabel}${res.username ? ` · ${res.username}` : ""}`;

    const rightWrap = document.createElement("span");
    rightWrap.style.display = "inline-flex";
    rightWrap.style.alignItems = "center";
    rightWrap.style.gap = "6px";

    if (res.ok && res.items.length > 0) {
      const copyOneBtn = document.createElement("button");
      copyOneBtn.type = "button";
      copyOneBtn.className = "btn-inline";
      copyOneBtn.textContent = "Copy kỳ này";
      copyOneBtn.addEventListener("click", async () => {
        const text = res.items.map((it) => `${it.label} ${it.value}`).join("\n");
        await copyTextSafe(text);
        setInvStatus(`Đã sao chép kết quả kỳ ${res.periodLabel}!`, "ok");
      });
      rightWrap.appendChild(copyOneBtn);
    } else {
      const errTag = document.createElement("span");
      errTag.className = "err";
      errTag.textContent = "Lỗi / Không thấy";
      rightWrap.appendChild(errTag);
    }

    head.appendChild(titleEl);
    head.appendChild(rightWrap);
    block.appendChild(head);

    if (res.ok && res.items.length > 0) {
      const rowsDiv = document.createElement("div");
      rowsDiv.className = "inv-rows";
      res.items.forEach((it) => {
        const rowEl = document.createElement("div");
        rowEl.className = "inv-row" + (it.source === "ams" ? " is-ams" : "");
        rowEl.innerHTML = `
          <span class="inv-row-key">${escapeHtml(it.label)}</span>
          <strong class="mono inv-row-val">${escapeHtml(it.value)}</strong>
        `;
        rowsDiv.appendChild(rowEl);
      });
      block.appendChild(rowsDiv);
    } else {
      const msgDiv = document.createElement("div");
      msgDiv.className = "inv-meta-note";
      msgDiv.style.color = "#b91c1c";
      msgDiv.textContent = res.error || "Không tìm thấy dữ liệu.";
      block.appendChild(msgDiv);
    }

    els.invResultList.appendChild(block);
  });

  els.invOutputText.value = formatMultiPeriodResultsText(periodResults);
  els.invResultCard.hidden = periodResults.length === 0;
}

// Tra cứu 1 kỳ hóa đơn (sheet "Hoa don gui PN" bỏ 3 cột đầu lấy hết cột sau + sheet "_AMS" loại trừ "AMS Service fee")
async function lookupSingleInvoicePeriod(period, cleanShopId, targetSheetName, amsKeyword, shouldCloseTabs) {
  const periodLabel = `${period.year} - ${period.month}`;
  const targetNorm = normSheetText(targetSheetName);
  let monthTabId = null;
  let needsLogin = false;

  try {
    addInvLog(`=== KỲ ${periodLabel} | ShopID: ${cleanShopId} ===`, "info");
    addInvLog(`Mở link cột C: ${period.url}`, "info");

    monthTabId = await navigateAndWait(null, period.url, true);
    const tabInfo = await chrome.tabs.get(monthTabId);
    if (tabInfo.url && tabInfo.url.includes("accounts.google.com")) {
      needsLogin = true;
      addInvLog("Cần đăng nhập Google! Giữ tab mở để bạn đăng nhập.", "err");
      return { ok: false, needsLogin: true, periodLabel, items: [], error: "Cần đăng nhập Google." };
    }

    const resolved = parseSpreadsheetFullUrl(tabInfo.url || period.url);
    if (!resolved.sheetId) {
      addInvLog(`URL sau khi mở không phải Google Sheets: ${tabInfo.url}`, "err");
      return { ok: false, periodLabel, items: [], error: "Link cột C không mở ra Google Sheets hợp lệ." };
    }
    const basePath = resolved.basePath;
    addInvLog(`Spreadsheet ID: ${resolved.sheetId} (prefix="${resolved.accPrefix || "default"}")`, "info");

    // 1. Lấy danh sách toàn bộ tab sheet (gid + tên) từ /htmlview
    let pnGid = "";
    let pnSheetName = "";
    let amsGid = "";
    let amsSheetName = "";
    let cachedHtmlViewText = "";
    const discoveredSheets = [];

    try {
      const hvRes = await fetch(`${basePath}/htmlview`, { credentials: "include", redirect: "follow" });
      if (hvRes.ok && !hvRes.url.includes("accounts.google.com")) {
        cachedHtmlViewText = await hvRes.text();
        const hvDoc = new DOMParser().parseFromString(cachedHtmlViewText, "text/html");
        const menuItems = Array.from(hvDoc.querySelectorAll('#sheet-menu li[id^="sheet-button-"]'));
        const seenGids = new Set();
        for (const li of menuItems) {
          const gidMatch = (li.id || "").match(/sheet-button-(\d+)/);
          const name = (li.textContent || "").trim();
          if (gidMatch && name && !seenGids.has(gidMatch[1])) {
            seenGids.add(gidMatch[1]);
            discoveredSheets.push({ gid: gidMatch[1], name });
          }
        }
        if (discoveredSheets.length === 0) {
          const itemRegex = /items\.push\(\{name:\s*"([^"]+)"[\s\S]*?gid:\s*"(\d+)"/g;
          let m;
          while ((m = itemRegex.exec(cachedHtmlViewText)) !== null) {
            const rawName = m[1].replace(/\\"/g, '"').replace(/\\u([0-9a-fA-F]{4})/g, (_, h) =>
              String.fromCharCode(parseInt(h, 16))
            );
            if (!seenGids.has(m[2])) {
              seenGids.add(m[2]);
              discoveredSheets.push({ gid: m[2], name: rawName });
            }
          }
        }

        if (discoveredSheets.length > 0) {
          addInvLog(
            `Danh sách sheet (${discoveredSheets.length}): ${discoveredSheets.map((s) => `${s.name} [gid=${s.gid}]`).join(", ")}`,
            "info"
          );
          const pnExact = discoveredSheets.find((s) => normSheetText(s.name) === targetNorm);
          const pnPartial = discoveredSheets.find((s) => normSheetText(s.name).includes(targetNorm));
          const pnChosen = pnExact || pnPartial;
          if (pnChosen) {
            pnGid = pnChosen.gid;
            pnSheetName = pnChosen.name;
            addInvLog(`Khớp sheet chính: "${pnSheetName}" (gid=${pnGid}).`, "ok");
          }

          const amsChosen = discoveredSheets.find((s) => isAmsSheetMatch(s.name, amsKeyword));
          if (amsChosen) {
            amsGid = amsChosen.gid;
            amsSheetName = amsChosen.name;
            addInvLog(`Khớp sheet AMS: "${amsSheetName}" (gid=${amsGid}, đã loại trừ "AMS Service fee").`, "ok");
          } else {
            addInvLog(`Không thấy sheet chứa "${amsKeyword}" (loại trừ "AMS Service fee") trong file tháng này.`, "warn");
          }
        }
      }
    } catch (e) {
      addInvLog(`Không đọc được danh sách sheet qua /htmlview: ${e.message}`, "warn");
    }

    // 2. Dự phòng nếu chưa tìm thấy sheet chính từ /htmlview (VD: file 1 sheet)
    if (!pnGid) {
      await sleep(900);
      try {
        const uiRes = await chrome.scripting.executeScript({
          target: { tabId: monthTabId },
          func: stepFindSheetGidInPage,
          args: [targetSheetName],
        });
        const uiData = uiRes?.[0]?.result;
        if (uiData?.uiNames?.length) {
          addInvLog(`Các sheet trên thanh tab: ${uiData.uiNames.join(", ")}`, "info");
          if (!amsSheetName) {
            const uiAmsName = uiData.uiNames.find((n) => isAmsSheetMatch(n, amsKeyword));
            if (uiAmsName) amsSheetName = uiAmsName;
          }
        }
        if (uiData?.ok) {
          pnSheetName = uiData.matchedSheetName;
          pnGid = uiData.matchedGid || (uiData.wasActive ? "0" : "");
        }
      } catch (e) {
        addInvLog(`Lỗi đọc thanh tab /edit: ${e.message}`, "warn");
      }
    }

    if (!pnGid && !pnSheetName && !amsGid && !amsSheetName) {
      const sheetListMsg = discoveredSheets.length
        ? ` Các sheet hiện có: ${discoveredSheets.map((s) => s.name).join(", ")}`
        : "";
      return {
        ok: false,
        periodLabel,
        items: [],
        error: `Không tìm thấy sheet "${targetSheetName}" hoặc "${amsKeyword}".${sheetListMsg}`,
      };
    }

    const xlsxCacheRef = { attempted: false, wb: null };
    let allItems = [];
    let username = "";
    let foundInPn = false;
    let foundInAms = false;

    // 3. Đọc sheet chính "Hoa don gui PN" -> bỏ 3 cột đầu tiên (A, B, C), lấy mã tra cứu tất cả cột còn lại
    if (pnGid || pnSheetName) {
      const pnData = await fetchSheetRowsFromExtension(basePath, pnGid, pnSheetName || targetSheetName, xlsxCacheRef);
      if (pnData.rows.length > 0) {
        addInvLog(`Đọc "${pnSheetName}" (${pnData.rows.length} dòng, ${pnData.fetchMethod}).`, "ok");
        const found = findHeaderAndShopRow(pnData.rows, cleanShopId);
        if (found.matchedRow) {
          foundInPn = true;
          username = (found.matchedRow[2] || "").trim();
          const pnItems = extractAllColumnsAfterFirst3(found.headerRow, found.matchedRow);
          allItems.push(...pnItems);
          addInvLog(
            `[PN] Dòng #${found.matchedRowIndex} -> tách ${pnItems.length} cột (bỏ 3 cột đầu): ${pnItems.map((x) => `${x.label}=${x.value}`).join(" | ")}`,
            "ok"
          );
        } else {
          addInvLog(`[PN] Không thấy ShopID ${cleanShopId} trong "${pnSheetName}".`, "warn");
        }
      } else {
        addInvLog(`[PN] Không đọc được dữ liệu sheet "${pnSheetName}".`, "warn");
      }
    }

    // 4. Đọc sheet "_AMS" (loại trừ "AMS Service fee") -> lấy mã "Phí dịch vụ AMS"
    if (amsGid || amsSheetName) {
      const amsData = await fetchSheetRowsFromExtension(basePath, amsGid, amsSheetName, xlsxCacheRef);
      if (amsData.rows.length > 0) {
        addInvLog(`Đọc "${amsSheetName}" (${amsData.rows.length} dòng, ${amsData.fetchMethod}).`, "ok");
        const foundAms = findHeaderAndShopRow(amsData.rows, cleanShopId);
        if (foundAms.matchedRow) {
          foundInAms = true;
          if (!username && foundAms.matchedRow[2]) username = String(foundAms.matchedRow[2]).trim();
          const amsItems = extractAmsItemsFromRow(foundAms.headerRow, foundAms.matchedRow, foundAms.shopIdCol);
          allItems.push(...amsItems);
          addInvLog(
            `[AMS] Dòng #${foundAms.matchedRowIndex} trong "${amsSheetName}" -> ${amsItems.map((x) => `${x.label}=${x.value}`).join(" | ")}`,
            "ok"
          );
        } else {
          allItems.push({ label: "Phi_dich_vu_AMS", value: "Không phát sinh", source: "ams" });
          addInvLog(`[AMS] Không thấy ShopID ${cleanShopId} trong "${amsSheetName}" -> Không phát sinh.`, "info");
        }
      } else {
        addInvLog(`[AMS] Không đọc được dữ liệu sheet "${amsSheetName}".`, "warn");
      }
    }

    if (!foundInPn && !foundInAms) {
      return {
        ok: false,
        periodLabel,
        items: [],
        error: `Không tìm thấy ShopID ${cleanShopId} trong "${pnSheetName || targetSheetName}"${amsSheetName ? ` và "${amsSheetName}"` : ""}.`,
      };
    }

    return {
      ok: true,
      periodLabel,
      shopId: cleanShopId,
      username,
      pnSheetName,
      amsSheetName,
      items: allItems,
    };
  } catch (err) {
    addInvLog(`Lỗi tra cứu kỳ ${periodLabel}: ${err.message}`, "err");
    return { ok: false, periodLabel, items: [], error: err.message };
  } finally {
    if (monthTabId && shouldCloseTabs && !needsLogin) {
      await safeCloseTab(monthTabId);
      addInvLog(`Đã tự động đóng tab Google Sheet #${monthTabId}.`, "ok");
    }
  }
}

els.invStopBtn.addEventListener("click", () => {
  if (!isInvoiceBusy) return;
  isInvoiceStopping = true;
  addInvLog("Người dùng bấm Dừng tra cứu hóa đơn.", "warn");
  setInvStatus("Đang dừng sau kỳ hiện tại...");
});

// BƯỚC 2, 3, 4 (UI): Lặp qua TẤT CẢ các kỳ đã tick checkbox -> tra "Hoa don gui PN" (bỏ 3 cột đầu) + "_AMS"
els.invSearchBtn.addEventListener("click", async () => {
  if (isInvoiceBusy) return;
  saveConfig();

  const shopId = els.invShopId.value.replace(/\D+/g, "").trim();
  if (!shopId) {
    setInvStatus("Vui lòng nhập Shop ID dạng số (VD: 1407993795)!", "err");
    els.invShopId.focus();
    return;
  }
  els.invShopId.value = shopId;

  const selectedPeriods = getSelectedInvoicePeriods();
  if (selectedPeriods.length === 0) {
    setInvStatus('Vui lòng bấm "Tải kỳ từ Sheet gốc" và tick chọn ít nhất 1 kỳ Năm - Tháng!', "err");
    return;
  }

  const targetSheetName = els.invTargetSheetName.value.trim() || "Hoa don gui PN";
  const amsKeyword = els.invAmsSheetKeyword.value.trim() || "_AMS";
  const shouldCloseTabs = els.invCloseTabs.checked;

  isInvoiceBusy = true;
  isInvoiceStopping = false;
  els.invSearchBtn.disabled = true;
  els.invLoadPeriodsBtn.disabled = true;
  els.invStopBtn.disabled = false;
  els.invResultList.innerHTML = "";
  els.invOutputText.value = "";
  els.invResultCard.hidden = true;

  const periodResults = [];

  try {
    addInvLog(
      `=== BẮT ĐẦU TRA CỨU ${selectedPeriods.length} KỲ | ShopID: ${shopId} | PN: "${targetSheetName}" | AMS: "${amsKeyword}" ===`,
      "info"
    );

    for (let i = 0; i < selectedPeriods.length; i++) {
      if (isInvoiceStopping) {
        addInvLog("Đã dừng vòng lặp theo yêu cầu.", "warn");
        break;
      }

      const period = selectedPeriods[i];
      setInvStatus(
        `[${i + 1}/${selectedPeriods.length}] Đang tra cứu ${period.year} - ${period.month} (ShopID ${shopId})...`
      );

      const res = await lookupSingleInvoicePeriod(
        period,
        shopId,
        targetSheetName,
        amsKeyword,
        shouldCloseTabs
      );
      periodResults.push(res);
      renderInvoiceResultsUI(periodResults);

      if (res.needsLogin) {
        setInvStatus("Vui lòng đăng nhập Google trên tab vừa mở rồi bấm tra cứu lại.", "err");
        return;
      }
    }

    const okCount = periodResults.filter((r) => r.ok).length;
    const stopNote = isInvoiceStopping ? " (đã dừng sớm)" : "";
    const tabNote = shouldCloseTabs ? " · Đã đóng tab Sheet." : "";
    setInvStatus(
      `Hoàn tất tra cứu ${okCount}/${periodResults.length} kỳ thành công${stopNote}${tabNote}`,
      okCount > 0 ? "ok" : "err"
    );
  } catch (err) {
    addInvLog(`Lỗi tra cứu hóa đơn: ${err.message}`, "err");
    setInvStatus(`Lỗi: ${err.message}`, "err");
  } finally {
    isInvoiceBusy = false;
    isInvoiceStopping = false;
    els.invSearchBtn.disabled = false;
    els.invLoadPeriodsBtn.disabled = false;
    els.invStopBtn.disabled = true;
  }
});

els.invCopyBtn.addEventListener("click", async () => {
  if (!els.invOutputText.value.trim()) return;
  await copyTextSafe(els.invOutputText.value, els.invOutputText);
  setInvStatus("Đã sao chép toàn bộ kết quả mã hóa đơn!", "ok");
});

els.invCopyLogBtn.addEventListener("click", async () => {
  if (!invLogs.length) return;
  await copyTextSafe(invLogs.join("\n"));
  setInvStatus("Đã copy nhật ký tra cứu hóa đơn!", "ok");
});

els.invClearLogBtn.addEventListener("click", () => {
  invLogs = [];
  els.invLogBox.innerHTML = "";
  els.invLogCount.textContent = "0 dòng";
});
