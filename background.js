const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

async function getSummary(transcriptText) {
    try {
        // Get the API key from storage
        const result = await chrome.storage.local.get(['openaiApiKey']);
        if (!result.openaiApiKey) {
            console.error('OpenAI API key not found');
            return 'Please set your OpenAI API key in the extension popup to enable summarization.';
        }

        const response = await fetch(OPENAI_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${result.openaiApiKey}`
            },
            body: JSON.stringify({
                model: "gpt-4",
                messages: [{
                    role: "system",
                    content: "You are a smart assistant with knowledge of e-commerce, which you can use to enhance the summarization of meeting transcripts. Your task is to summarize the transcript of a Google Meet call, focusing on the key points and ensuring all relevant details are captured concisely. In addition to the summary, list any action items discussed during the meeting in a clear, bullet-point format."
                }, {
                    role: "user",
                    content: `Please summarize this meeting transcript:\n\n${transcriptText}`
                }],
                temperature: 0.7,
                max_tokens: 1000
            })
        });

        const data = await response.json();
        if (data.error) {
            console.error('OpenAI API error:', data.error);
            return 'Error generating summary. Please check your API key and try again.';
        }
        return data.choices[0].message.content;
    } catch (error) {
        console.error('Error getting summary:', error);
        return 'Error generating summary. Please check your internet connection and try again.';
    }
}

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    console.log(message.type)
    if (message.type == "new_meeting_started") {
        // Saving current tab id, to download transcript when this tab is closed
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            const tabId = tabs[0].id
            chrome.storage.local.set({ meetingTabId: tabId }, function () {
                console.log("Meeting tab id saved")
            })
        })
    }
    if (message.type == "download") {
        // Invalidate tab id since transcript is downloaded, prevents double downloading of transcript from tab closed event listener
        chrome.storage.local.set({ meetingTabId: null }, function () {
            console.log("Meeting tab id cleared")
        })
        downloadTranscript()
    }
    return true
})

// Download transcript if meeting tab is closed
chrome.tabs.onRemoved.addListener(function (tabid) {
    chrome.storage.local.get(["meetingTabId"], function (data) {
        if (tabid == data.meetingTabId) {
            console.log("Successfully intercepted tab close")
            downloadTranscript()
            // Clearing meetingTabId to prevent misfires of onRemoved until next meeting actually starts
            chrome.storage.local.set({ meetingTabId: null }, function () {
                console.log("Meeting tab id cleared for next meeting")
            })
        }
    })
})

async function downloadTranscript() {
    chrome.storage.local.get(["userName", "transcript", "chatMessages", "meetingTitle", "meetingStartTimeStamp"], async function (result) {
        if (result.userName && result.transcript && result.chatMessages) {
            // Create file name if values or provided, use default otherwise
            const fileName = result.meetingTitle && result.meetingStartTimeStamp ? `MeetTranscript/MeetTranscript-${result.meetingTitle} at ${result.meetingStartTimeStamp}.txt` : `MeetTranscript/Transcript.txt`

            // Create an array to store lines of the text file
            const lines = []

            // Iterate through the transcript array and format each entry
            result.transcript.forEach(entry => {
                lines.push(`${entry.personName} (${entry.timeStamp})`)
                lines.push(entry.personTranscript)
                // Add an empty line between entries
                lines.push("")
            })

            // Get the summary from OpenAI
            const transcriptText = result.transcript.map(entry =>
                `${entry.personName}: ${entry.personTranscript}`
            ).join('\n');

            const summary = await getSummary(transcriptText);

            if (summary) {
                lines.push("--------------------------------------------------------------------------------------------------------------------------------------------")
                lines.push("MEETING SUMMARY GENERATED WITH CHATGPT")
                lines.push("--------------------------------------------------------------------------------------------------------------------------------------------")
                lines.push(summary)
                lines.push("")
                lines.push("")
            }

            lines.push("")
            lines.push("")

            if (result.chatMessages.length > 0) {
                // Iterate through the chat messages array and format each entry
                lines.push("--------------------------------------------------------------------------------------------------------------------------------------------")
                lines.push("CHAT MESSAGES")
                lines.push("--------------------------------------------------------------------------------------------------------------------------------------------")
                result.chatMessages.forEach(entry => {
                    lines.push(`${entry.personName} (${entry.timeStamp})`)
                    lines.push(entry.chatMessageText)
                    // Add an empty line between entries
                    lines.push("")
                })
                lines.push("")
                lines.push("")
            }

            // Add branding
            lines.push("--------------------------------------------------------------------------------------------------------------------------------------------")
            lines.push("Transcript saved using Google Meet AI Summariser extension created by https://www.princejain.me")
            lines.push("--------------------------------------------------------------------------------------------------------------------------------------------")

            // Join the lines into a single string, replace "You" with userName from storage
            const textContent = lines.join("\n").replace(/You \(/g, result.userName + " (")

            // Create a blob containing the text content
            const blob = new Blob([textContent], { type: "text/plain" })

            // Read the blob as a data URL
            const reader = new FileReader()

            // Download once blob is read
            reader.onload = function (event) {
                const dataUrl = event.target.result

                // Create a download with Chrome Download API
                chrome.downloads.download({
                    url: dataUrl,
                    filename: fileName,
                    conflictAction: "uniquify"
                }).then(() => {
                    console.log("Transcript downloaded to MeetTranscript directory")
                }).catch((error) => {
                    console.log(error)
                    chrome.downloads.download({
                        url: dataUrl,
                        filename: "MeetTranscript/Transcript.txt",
                        conflictAction: "uniquify"
                    })
                    console.log("Invalid file name. Transcript downloaded to AI Transcript Summary directory with simple file name.")
                })
            }

            // Read the blob and download as text file
            reader.readAsDataURL(blob)
        }
        else
            console.log("No transcript found")
    })
}