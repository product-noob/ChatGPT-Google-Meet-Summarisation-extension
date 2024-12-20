//*********** GLOBAL VARIABLES **********//
const timeFormat = {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true
}
const extensionStatusJSON_bug = {
  "status": 400,
  "message": "<strong>AI Meeting Summariser encountered a new error</strong> <br />"
}
const reportErrorMessage = "There is a bug in AI Meeting Summariser. Please report it by dropping a mail at prince.jain@flipkart.com and I'll check it when feasible."
const mutationConfig = { childList: true, attributes: true, subtree: true }

// Name of the person attending the meeting
let userName = "You"
overWriteChromeStorage(["userName"], false)
// Transcript array that holds one or more transcript blocks
// Each transcript block (object) has personName, timeStamp and transcriptText key value pairs
let transcript = []
// Buffer variables to dump values, which get pushed to transcript array as transcript blocks, at defined conditions
let personNameBuffer = "", transcriptTextBuffer = "", timeStampBuffer = undefined
// Buffer variables for deciding when to push a transcript block
let beforePersonName = "", beforeTranscriptText = ""
// Chat messages array that holds one or more chat messages of the meeting
// Each message block(object) has personName, timeStamp and messageText key value pairs
let chatMessages = []
overWriteChromeStorage(["chatMessages"], false)

// Capture meeting start timestamp and sanitize special characters with "-" to avoid invalid filenames
let meetingStartTimeStamp = new Date().toLocaleString("default", timeFormat).replace(/[/:]/g, '-').toUpperCase()
let meetingTitle = document.title
overWriteChromeStorage(["meetingStartTimeStamp", "meetingTitle"], false)
// Capture invalid transcript and chat messages DOM element error for the first time
let isTranscriptDomErrorCaptured = false
let isChatMessagesDomErrorCaptured = false
// Capture meeting begin to abort userName capturing interval
let hasMeetingStarted = false
// Capture meeting end to suppress any errors
let hasMeetingEnded = false

let extensionStatusJSON

function autoSendMessage() {
  try {
    const targetDiv = document.querySelector('.mcadHd');
    if (targetDiv) {
      const textBox = targetDiv.querySelector('textarea');
      const sendButton = targetDiv.querySelector('button');
      
      if (textBox && sendButton) {
        textBox.value = "Please Note: Meeting Transcripts are auto-recorded by Chrome extension for Summarisation";
        sendButton.disabled = false;
        sendButton.click();
        
        const data = {
          textBoxValue: textBox.value,
          isSendButtonDisabled: sendButton.disabled,
          sendButtonClicked: true
        };
        
        console.log('Auto message sent:', data);
      }
    }
  } catch (error) {
    console.error('Error in autoSendMessage:', error);
  }
}


async function checkExtensionStatus() {
  try {
    // Default status indicating the extension is running
    const defaultStatus = {
      status: 200,
      message: "<strong>FK GPT Meeting Summariser is running</strong> <br /> Captions are ON"
    };

    // Save default status directly to chrome storage
    chrome.storage.local.set({ extensionStatusJSON: defaultStatus });
    console.log("Extension status set to default:", defaultStatus);
  } catch (error) {
    console.error('Error setting extension status:', error);
  }
}
checkExtensionStatus().then(() => {
  // Read the status JSON
  chrome.storage.local.get(["extensionStatusJSON"], function (result) {
    extensionStatusJSON = result.extensionStatusJSON;
    console.log("Extension status " + extensionStatusJSON.status);

    // Enable extension functions only if status is 200
    if (extensionStatusJSON.status == 200) {
      // NON CRITICAL DOM DEPENDENCY. Attempt to get username before meeting starts. Abort interval if valid username is found or if meeting starts and default to "You".
      checkElement(".awLEm").then(() => {
        // Poll the element until the textContent loads from network or until meeting starts
        const captureUserNameInterval = setInterval(() => {
          userName = document.querySelector(".awLEm").textContent
          if (userName || hasMeetingStarted) {
            clearInterval(captureUserNameInterval)
            // Prevent overwriting default "You" where element is found, but valid userName is not available
            if (userName != "")
              overWriteChromeStorage(["userName"], false)
          }
        }, 100)
      })

      // 1. Meet UI prior to July/Aug 2024
      meetingRoutines(1)

      // 2. Meet UI post July/Aug 2024
      meetingRoutines(2)
    }
    else {
      // Show downtime message as extension status is 400
      showNotification(extensionStatusJSON)
    }
  })
})


function meetingRoutines(uiType) {
  const meetingEndIconData = {
    selector: "",
    text: ""
  }
  const captionsIconData = {
    selector: "",
    text: ""
  }
  // Different selector data for different UI versions
  switch (uiType) {
    case 1:
      meetingEndIconData.selector = ".google-material-icons"
      meetingEndIconData.text = "call_end"
      captionsIconData.selector = ".material-icons-extended"
      captionsIconData.text = "closed_caption_off"
      break;
    case 2:
      meetingEndIconData.selector = ".google-symbols"
      meetingEndIconData.text = "call_end"
      captionsIconData.selector = ".google-symbols"
      captionsIconData.text = "closed_caption_off"
    default:
      break;
  }

  // CRITICAL DOM DEPENDENCY. Wait until the meeting end icon appears, used to detect meeting start
  checkElement(meetingEndIconData.selector, meetingEndIconData.text).then(() => {
    console.log("Meeting started")
    chrome.runtime.sendMessage({ type: "new_meeting_started" }, function (response) {
      console.log(response);
    });
    hasMeetingStarted = true

    try {
      // Delay the auto send message to ensure DOM is fully loaded
      setTimeout(autoSendMessage, 2000);
    } catch (error) {
      console.error('Error in auto send message:', error);
    }



    try {
      //*********** MEETING START ROUTINES **********//
      // Pick up meeting name after a delay, since Google meet updates meeting name after a delay
      setTimeout(() => updateMeetingTitle(), 5000)

      // **** TRANSCRIPT ROUTINES **** //
      // CRITICAL DOM DEPENDENCY
      const captionsButton = contains(captionsIconData.selector, captionsIconData.text)[0]


      // Click captions icon for non manual operation modes. Async operation.
      chrome.storage.sync.get(["operationMode"], function (result) {
        if (result.operationMode == "manual")
          console.log("Manual mode selected, leaving transcript off")
        else
          captionsButton.click()
      })

      // CRITICAL DOM DEPENDENCY. Grab the transcript element. This element is present, irrespective of captions ON/OFF, so this executes independent of operation mode.
      const transcriptTargetNode = document.querySelector('.a4cQT')
      // Attempt to dim down the transcript
      try {
        transcriptTargetNode.childNodes[1].style.opacity = 0.2
      } catch (error) {
        console.error(error)
      }

      // Create transcript observer instance linked to the callback function. Registered irrespective of operation mode, so that any visible transcript can be picked up during the meeting, independent of the operation mode.
      const transcriptObserver = new MutationObserver(transcriber)

      // Start observing the transcript element and chat messages element for configured mutations
      transcriptObserver.observe(transcriptTargetNode, mutationConfig)

      // **** CHAT MESSAGES ROUTINES **** //
      const chatMessagesButton = contains(".google-symbols", "chat")[0]
      // Force open chat messages to make the required DOM to appear. Otherwise, the required chatMessages DOM element is not available.
      chatMessagesButton.click()
      let chatMessagesObserver
      // Allow DOM to be updated and then register chatMessage mutation observer
      setTimeout(() => {
        chatMessagesButton.click()
        // CRITICAL DOM DEPENDENCY. Grab the chat messages element. This element is present, irrespective of chat ON/OFF, once it appears for this first time.
        try {
          const chatMessagesTargetNode = document.querySelector('div[aria-live="polite"]')
            || document.querySelector('[aria-live="polite"][role="log"]') // Alternative selector
            || document.querySelector('.KMPEld'); // Update this selector based on the actual DOM

          // Create chat messages observer instance linked to the callback function. Registered irrespective of operation mode.
          chatMessagesObserver = new MutationObserver(chatMessagesRecorder)

          chatMessagesObserver.observe(chatMessagesTargetNode, mutationConfig)
        } catch (error) {
          console.error(error)
          showNotification(extensionStatusJSON_bug)
        }
      }, 500)

      // Show confirmation message from extensionStatusJSON, once observation has started, based on operation mode
      chrome.storage.sync.get(["operationMode"], function (result) {
        if (result.operationMode == "manual")
          showNotification({ status: 400, message: "<strong>AI Meeting Summariser is not running</strong> <br /> Turn on captions using the CC icon, if needed" })
        else
          showNotification(extensionStatusJSON)
      })


      //*********** MEETING END ROUTINES **********//
      // CRITICAL DOM DEPENDENCY. Event listener to capture meeting end button click by user
      contains(meetingEndIconData.selector, meetingEndIconData.text)[0].parentElement.parentElement.addEventListener("click", () => {
        // To suppress further errors
        hasMeetingEnded = true
        transcriptObserver.disconnect()
        chatMessagesObserver.disconnect()

        // Push any data in the buffer variables to the transcript array, but avoid pushing blank ones. Needed to handle one or more speaking when meeting ends.
        if ((personNameBuffer != "") && (transcriptTextBuffer != ""))
          pushBufferToTranscript()
        // Save to chrome storage and send message to download transcript from background script
        overWriteChromeStorage(["transcript", "chatMessages"], true)
      })
    } catch (error) {
      console.error(error)
      showNotification(extensionStatusJSON_bug)
    }
  })
}


// Returns all elements of the specified selector type and specified textContent. Return array contains the actual element as well as all the upper parents. 
function contains(selector, text) {
  var elements = document.querySelectorAll(selector);
  return Array.prototype.filter.call(elements, function (element) {
    return RegExp(text).test(element.textContent);
  });
}

// Efficiently waits until the element of the specified selector and textContent appears in the DOM. Polls only on animation frame change
const checkElement = async (selector, text) => {
  if (text) {
    // loops for every animation frame change, until the required element is found
    while (!Array.from(document.querySelectorAll(selector)).find(element => element.textContent === text)) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  }
  else {
    // loops for every animation frame change, until the required element is found
    while (!document.querySelector(selector)) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  }
  return document.querySelector(selector);
}

// Shows a responsive notification of specified type and message
function showNotification(extensionStatusJSON) {
  // Banner CSS
  let html = document.querySelector("html");
  let obj = document.createElement("div");
  let logo = document.createElement("img");
  let text = document.createElement("p");
  logo.setAttribute("src", chrome.runtime.getURL("icon.png"));
  logo.setAttribute("height", "32px");
  logo.setAttribute("width", "32px");
  logo.style.cssText = "border-radius: 4px";

  // Remove banner after 5s
  setTimeout(() => {
    obj.style.display = "none";
  }, 5000);

  if (extensionStatusJSON.status == 200) {
    obj.style.cssText = `color: #2A9ACA; ${commonCSS}`;
    text.innerHTML = extensionStatusJSON.message;
  }
  else {
    obj.style.cssText = `color: orange; ${commonCSS}`;
    text.innerHTML = extensionStatusJSON.message;
  }

  obj.prepend(text);
  obj.prepend(logo);
  if (html)
    html.append(obj);
}

// CSS for notification
const commonCSS = `background: rgb(255 255 255 / 10%); 
    backdrop-filter: blur(16px); 
    position: fixed;
    top: 5%; 
    left: 0; 
    right: 0; 
    margin-left: auto; 
    margin-right: auto;
    max-width: 780px;  
    z-index: 1000; 
    padding: 0rem 1rem;
    border-radius: 8px; 
    display: flex; 
    justify-content: center; 
    align-items: center; 
    gap: 16px;  
    font-size: 1rem; 
    line-height: 1.5; 
    font-family: 'Google Sans',Roboto,Arial,sans-serif; 
    box-shadow: rgba(0, 0, 0, 0.16) 0px 10px 36px 0px, rgba(0, 0, 0, 0.06) 0px 0px 0px 1px;`;

// Callback function to execute when transcription mutations are observed. 
function transcriber(mutationsList, observer) {
  // Delay for 1000ms to allow for text corrections by Meet.
  mutationsList.forEach(mutation => {
    try {
      // CRITICAL DOM DEPENDENCY. Get all people in the transcript
      const people = document.querySelector('.a4cQT').childNodes[1]?.firstChild?.childNodes
      // Begin parsing transcript
      if (people && people.length > 0) {
        // Get the last person
        const person = people[people.length - 1]
        // CRITICAL DOM DEPENDENCY
        const currentPersonName = person.childNodes[0]?.textContent || 'Unknown'
        // CRITICAL DOM DEPENDENCY
        const currentTranscriptText = person.childNodes[1]?.lastChild?.textContent || ''

        // Starting fresh in a meeting or resume from no active transcript
        if (beforeTranscriptText == "") {
          personNameBuffer = currentPersonName
          timeStampBuffer = new Date().toLocaleString("default", timeFormat).toUpperCase()
          beforeTranscriptText = currentTranscriptText
          transcriptTextBuffer = currentTranscriptText
        }
        // Some prior transcript buffer exists
        else {
          // New person started speaking 
          if (personNameBuffer != currentPersonName) {
            // Push previous person's transcript as a block
            pushBufferToTranscript()
            overWriteChromeStorage(["transcript"], false)
            // Update buffers for next mutation and store transcript block timeStamp
            beforeTranscriptText = currentTranscriptText
            personNameBuffer = currentPersonName
            timeStampBuffer = new Date().toLocaleString("default", timeFormat).toUpperCase()
            transcriptTextBuffer = currentTranscriptText
          }
          // Same person speaking more
          else {
            transcriptTextBuffer = currentTranscriptText
            // Update buffers for next mutation
            beforeTranscriptText = currentTranscriptText
            // If a person is speaking for a long time, Google Meet does not keep the entire text in the spans. Starting parts are automatically removed in an unpredictable way as the length increases and AI Meeting Summariser will miss them. So we force remove a lengthy transcript node in a controlled way. Google Meet will add a fresh person node when we remove it and continue transcription. AI Meeting Summariser picks it up as a new person and nothing is missed.
            if (currentTranscriptText.length > 250)
              person.remove()
          }
        }
      }
      // No people found in transcript DOM
      else {
        // No transcript yet or the last person stopped speaking(and no one has started speaking next)
        console.log("No active transcript")
        // Push data in the buffer variables to the transcript array, but avoid pushing blank ones.
        if ((personNameBuffer != "") && (transcriptTextBuffer != "")) {
          pushBufferToTranscript()
          overWriteChromeStorage(["transcript"], false)
        }
        // Update buffers for the next person in the next mutation
        beforePersonName = ""
        beforeTranscriptText = ""
        personNameBuffer = ""
        transcriptTextBuffer = ""
      }
      console.log(transcriptTextBuffer)
      // console.log(transcript)
    } catch (error) {
      console.error(error)
      if (isTranscriptDomErrorCaptured == false && hasMeetingEnded == false) {
        console.log(reportErrorMessage)
        showNotification(extensionStatusJSON_bug)
      }
      isTranscriptDomErrorCaptured = true
    }
  })
}

// Callback function to execute when chat messages mutations are observed. 
function chatMessagesRecorder(mutationsList, observer) {
  mutationsList.forEach(mutation => {
    try {
      // Attempt to get the chat messages element
      let chatMessagesElement = document.querySelector('div[aria-live="polite"]')
        || document.querySelector('[aria-live="polite"][role="log"]') // Alternative selector
        || document.querySelector('.KMPEld'); // Update this selector based on the actual DOM

      if (chatMessagesElement && chatMessagesElement.children.length > 0) {
        // Get the last message that was sent/received.
        const chatMessageElement = chatMessagesElement.lastElementChild;

        // Safely access the necessary elements
        const personNameElement = chatMessageElement.querySelector('div.XInuTe') // Update with actual class
          || chatMessageElement.querySelector('.YTbUzc'); // Alternative selector

        const messageTextElement = chatMessageElement.querySelector('div.GDhqjd') // Update with actual class
          || chatMessageElement.querySelector('.oIy2qc'); // Alternative selector

        const personName = personNameElement?.textContent?.trim() || 'Unknown';
        const chatMessageText = messageTextElement?.textContent?.trim() || '';

        if (chatMessageText) {
          const chatMessageBlock = {
            personName: personName,
            timeStamp: new Date().toLocaleString("default", timeFormat).toUpperCase(),
            chatMessageText: chatMessageText
          };

          // Avoid duplicates
          pushUniqueChatBlock(chatMessageBlock);
          overWriteChromeStorage(["chatMessages"], false);
          console.log(chatMessages);
        }
      } else {
        console.log('No chat messages found or chatMessagesElement is null.');
      }
    } catch (error) {
      console.error('Error in chatMessagesRecorder:', error);
      if (!isChatMessagesDomErrorCaptured && !hasMeetingEnded) {
        console.log(reportErrorMessage);
        showNotification(extensionStatusJSON_bug);
      }
      isChatMessagesDomErrorCaptured = true;
    }
  });
}

// Pushes data in the buffer to transcript array as a transcript block
function pushBufferToTranscript() {
  transcript.push({
    "personName": personNameBuffer,
    "timeStamp": timeStampBuffer,
    "personTranscript": transcriptTextBuffer
  })
}

// Pushes object to array only if it doesn't already exist. chatMessage is checked for substring since some trailing text(keep Pin message) is present from a button that allows to pin the message.
function pushUniqueChatBlock(chatBlock) {
  const isExisting = chatMessages.some(item =>
    item.personName == chatBlock.personName &&
    item.timeStamp == chatBlock.timeStamp &&
    chatBlock.chatMessageText.includes(item.chatMessageText)
  )
  if (!isExisting)
    chatMessages.push(chatBlock);
}

// Saves specified variables to chrome storage. Optionally, can send message to background script to download, post saving.
function overWriteChromeStorage(keys, sendDownloadMessage) {
  const objectToSave = {}
  // Hard coded list of keys that are accepted
  if (keys.includes("userName"))
    objectToSave.userName = userName
  if (keys.includes("transcript"))
    objectToSave.transcript = transcript
  if (keys.includes("meetingTitle"))
    objectToSave.meetingTitle = meetingTitle
  if (keys.includes("meetingStartTimeStamp"))
    objectToSave.meetingStartTimeStamp = meetingStartTimeStamp
  if (keys.includes("chatMessages"))
    objectToSave.chatMessages = chatMessages

  chrome.storage.local.set(objectToSave, function () {
    if (sendDownloadMessage) {
      // Download only if any transcript is present, irrespective of chat messages
      if (transcript.length > 0) {
        chrome.runtime.sendMessage({ type: "download" }, function (response) {
          console.log(response);
        })
      }
    }
  })
}

// Grabs updated meeting title, if available. Replaces special characters with underscore to avoid invalid file names.
function updateMeetingTitle() {
  try {
    // NON CRITICAL DOM DEPENDENCY
    const title = document.querySelector(".u6vdEc")?.textContent
    const invalidFilenameRegex = /[^\w\-_.() ]/g
    if (title) {
      meetingTitle = title.replace(invalidFilenameRegex, '_')
      overWriteChromeStorage(["meetingTitle"], false)
    }
  } catch (error) {
    console.error(error)
  }
}