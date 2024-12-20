window.onload = function () {
  const autoModeRadio = document.querySelector('#auto-mode')
  const manualModeRadio = document.querySelector('#manual-mode')
  const lastMeetingTranscriptLink = document.querySelector("#last-meeting-transcript")
  const apiKeyInput = document.querySelector('#api-key-input')
  const saveKeyButton = document.querySelector('#save-api-key')
  const apiKeyStatus = document.querySelector('#api-key-status')


  chrome.storage.sync.get(["operationMode"], function (result) {
    if (result.operationMode == undefined)
      autoModeRadio.checked = true
    else if (result.operationMode == "auto")
      autoModeRadio.checked = true
    else if (result.operationMode == "manual")
      manualModeRadio.checked = true
  })
  chrome.storage.local.get(['openaiApiKey'], function (result) {
    if (result.openaiApiKey) {
      apiKeyStatus.textContent = 'API key is set';
      apiKeyInput.placeholder = '••••••••••••••••';
    } else {
      apiKeyStatus.textContent = 'No API key saved';
    }
  });

  // Save API key
  saveKeyButton.addEventListener('click', function () {
    const apiKey = apiKeyInput.value.trim();
    if (apiKey) {
      chrome.storage.local.set({ openaiApiKey: apiKey }, function () {
        apiKeyStatus.textContent = 'API key saved successfully';
        apiKeyInput.value = '';
        apiKeyInput.placeholder = '••••••••••••••••';
      });
    } else {
      apiKeyStatus.textContent = 'Please enter a valid API key';
    }
  });
  autoModeRadio.addEventListener("change", function () {
    chrome.storage.sync.set({ operationMode: "auto" }, function () { })
  })
  manualModeRadio.addEventListener("change", function () {
    chrome.storage.sync.set({ operationMode: "manual" }, function () { })
  })
  lastMeetingTranscriptLink.addEventListener("click", () => {
    chrome.storage.local.get(["transcript"], function (result) {
      if (result.transcript)
        chrome.runtime.sendMessage({ type: "download" }, function (response) {
          console.log(response)
        })
      else
        alert("Couldn't find the last meeting's transcript. May be attend one?")
    })
  })
}