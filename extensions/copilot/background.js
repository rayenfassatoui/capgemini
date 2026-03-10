/**
 * CAPGEMINI AI CO-PILOT — BACKGROUND SERVICE WORKER
 * 
 * The brain of the Chrome Extension.
 * Responsibilities:
 * 1. Capture tab audio (candidate voice) via chrome.tabCapture
 * 2. Capture mic audio (interviewer voice) via offscreen document
 * 3. Mix both streams using AudioContext
 * 4. Send audio chunks via WebSocket to the Next.js backend every 2 seconds
 * 5. Receive live hints from the backend and relay them to the content script
 * 6. Handle start/stop lifecycle
 */

let ws = null;
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let transcriptLines = 0;
let hintsSent = 0;
let config = null;

// Allow users to open the side panel by clicking on the action toolbar icon
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

// ---------- Message Handler from Popup ----------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'START_COPILOT') {
    config = msg.config;
    startCopilot(config);
    sendResponse({ ok: true });
  }

  if (msg.type === 'STOP_COPILOT') {
    stopCopilot();
    sendResponse({ ok: true });
  }

  return true; // Keep the message channel open for async
});

// ---------- Start Co-Pilot ----------
async function startCopilot(cfg) {
  if (isRecording) return;

  try {
    // 1. Connect WebSocket to the backend
    ws = new WebSocket(cfg.backendUrl);

    ws.onopen = () => {
      console.log('[Co-Pilot] WebSocket connected');

      // Send initial handshake with interview metadata
      ws.send(JSON.stringify({
        type: 'INIT',
        role: cfg.role,
        jobId: cfg.jobId,
        candidateId: cfg.candidateId,
        timestamp: new Date().toISOString(),
      }));

      broadcastStatus('connected');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        // Receive transcript updates
        if (data.type === 'TRANSCRIPT_UPDATE') {
          transcriptLines = data.totalLines || transcriptLines + 1;
          broadcastStats();
        }

        // Receive live hints from AI
        if (data.type === 'LIVE_HINT') {
          hintsSent++;
          broadcastStats();

          // Forward the hint to the content script on the meeting page
          forwardHintToContentScript(data.hint);
        }

        // Receive final report signal
        if (data.type === 'REPORT_READY') {
          console.log('[Co-Pilot] Report generated:', data.report);
          broadcastStatus('processing');
        }
      } catch (err) {
        console.error('[Co-Pilot] Error parsing WS message:', err);
      }
    };

    ws.onclose = () => {
      console.log('[Co-Pilot] WebSocket closed');
      if (isRecording) {
        // Attempt reconnection after 3 seconds
        setTimeout(() => {
          if (isRecording && config) {
            console.log('[Co-Pilot] Attempting reconnection...');
            ws = new WebSocket(config.backendUrl);
          }
        }, 3000);
      }
    };

    ws.onerror = (err) => {
      console.error('[Co-Pilot] WebSocket error:', err);
    };

    // 2. Capture Tab Audio (Candidate's voice from the meeting)
    const tabStream = await captureTabAudio();

    if (!tabStream) {
      console.error('[Co-Pilot] Failed to capture tab audio');
      return;
    }

    // 3. Start recording the stream
    startRecording(tabStream);

    isRecording = true;
    transcriptLines = 0;
    hintsSent = 0;

    broadcastStatus('recording');
    broadcastStats();

    // 4. Notify the content script that recording has started
    notifyContentScript('RECORDING_STARTED');

  } catch (err) {
    console.error('[Co-Pilot] Failed to start:', err);
    broadcastStatus('idle');
  }
}

// ---------- Stop Co-Pilot ----------
function stopCopilot() {
  isRecording = false;

  // Stop the MediaRecorder
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  mediaRecorder = null;

  // Send END signal to backend
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'END_INTERVIEW' }));
  }

  // Close WebSocket after a short delay (to allow the END message to be sent)
  setTimeout(() => {
    if (ws) {
      ws.close();
      ws = null;
    }
  }, 1000);

  // Notify content script
  notifyContentScript('RECORDING_STOPPED');

  // Notify popup
  chrome.runtime.sendMessage({ type: 'COPILOT_STOPPED' });

  broadcastStatus('idle');
}

// ---------- Tab Audio Capture ----------
async function captureTabAudio() {
  return new Promise((resolve) => {
    chrome.tabCapture.capture(
      {
        audio: true,
        video: false,
      },
      (stream) => {
        if (chrome.runtime.lastError) {
          console.error('[Co-Pilot] tabCapture error:', chrome.runtime.lastError.message);
          resolve(null);
          return;
        }
        resolve(stream);
      }
    );
  });
}

// ---------- Audio Recording & Chunking ----------
function startRecording(stream) {
  // Use webm/opus for good compression and quality
  const options = { mimeType: 'audio/webm;codecs=opus' };

  try {
    mediaRecorder = new MediaRecorder(stream, options);
  } catch (err) {
    // Fallback if opus is not supported
    mediaRecorder = new MediaRecorder(stream);
  }

  mediaRecorder.ondataavailable = (event) => {
    if (event.data.size > 0 && ws && ws.readyState === WebSocket.OPEN) {
      // Send the raw audio blob to the backend
      event.data.arrayBuffer().then((buffer) => {
        ws.send(buffer);
      });
    }
  };

  mediaRecorder.onstop = () => {
    console.log('[Co-Pilot] MediaRecorder stopped');
    // Stop all tracks to release the microphone/tab
    stream.getTracks().forEach((track) => track.stop());
  };

  // Record in 2-second chunks
  mediaRecorder.start(2000);
  console.log('[Co-Pilot] Recording started (2s chunks)');
}

// ---------- Communication Helpers ----------

function broadcastStatus(status) {
  chrome.runtime.sendMessage({ type: 'COPILOT_STATUS', status }).catch(() => {
    // Popup might be closed, ignore
  });
}

function broadcastStats() {
  chrome.runtime.sendMessage({
    type: 'COPILOT_STATS',
    transcriptLines,
    hintsSent,
  }).catch(() => {
    // Popup might be closed, ignore
  });
}

function forwardHintToContentScript(hint) {
  // Send the hint to ALL tabs matching meeting URLs
  chrome.tabs.query(
    {
      url: [
        'https://meet.google.com/*',
        'https://teams.microsoft.com/*',
        'https://*.zoom.us/*',
      ],
    },
    (tabs) => {
      tabs.forEach((tab) => {
        chrome.tabs.sendMessage(tab.id, {
          type: 'SHOW_HINT',
          hint,
        }).catch(() => {
          // Tab might not have content script loaded
        });
      });
    }
  );
}

function notifyContentScript(action) {
  chrome.tabs.query(
    {
      url: [
        'https://meet.google.com/*',
        'https://teams.microsoft.com/*',
        'https://*.zoom.us/*',
      ],
    },
    (tabs) => {
      tabs.forEach((tab) => {
        chrome.tabs.sendMessage(tab.id, { type: action }).catch(() => {});
      });
    }
  );
}
