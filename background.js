// Tự động mở Side Panel khi bấm vào icon Extension trên thanh công cụ Chrome
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error("[Shopee CS Toolkit] SidePanel error:", error));
