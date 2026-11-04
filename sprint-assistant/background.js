// Clicking the toolbar icon opens the side panel, which stays open while you switch tabs.
// Browsers without the side panel API fall back to the classic popup.
function setup() {
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {
      chrome.action.setPopup({ popup: 'panel.html' });
    });
  } else {
    chrome.action.setPopup({ popup: 'panel.html' });
  }
}

chrome.runtime.onInstalled.addListener(setup);
chrome.runtime.onStartup.addListener(setup);
setup();
