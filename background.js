(function () {
  "use strict";

  var SLITHER_URL_PATTERNS = ["*://slither.io/*", "*://www.slither.io/*", "*://slither.com/*", "*://www.slither.com/*"];
  var SLITHER_REGEX = /slither\.(io|com)/i;

  function injectIntoTab(tabId) {
    // Inject page-bridge into MAIN world (reads game variables)
    chrome.scripting.executeScript({
      target: { tabId: tabId, allFrames: true },
      files: ["page-bridge.js"],
      world: "MAIN"
    }).catch(function () {
      // Retry once after a short delay
      setTimeout(function () {
        chrome.scripting.executeScript({
          target: { tabId: tabId, allFrames: true },
          files: ["page-bridge.js"],
          world: "MAIN"
        }).catch(function () {});
      }, 2000);
    });

    // Inject overlay into ISOLATED world (creates HUD)
    chrome.scripting.executeScript({
      target: { tabId: tabId, allFrames: true },
      files: ["overlay.js"]
    }).catch(function () {
      setTimeout(function () {
        chrome.scripting.executeScript({
          target: { tabId: tabId, allFrames: true },
          files: ["overlay.js"]
        }).catch(function () {});
      }, 2000);
    });
  }

  // Inject when a slither.io tab finishes loading
  chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
    if (changeInfo.status === "complete" && tab.url && SLITHER_REGEX.test(tab.url)) {
      injectIntoTab(tabId);
    }
  });

  // Inject into already-open slither.io tabs when extension loads/reloads
  chrome.tabs.query({ url: SLITHER_URL_PATTERNS }, function (tabs) {
    if (chrome.runtime.lastError || !tabs) { return; }
    for (var i = 0; i < tabs.length; i++) {
      injectIntoTab(tabs[i].id);
    }
  });
})();
