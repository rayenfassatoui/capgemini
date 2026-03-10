/**
 * CAPGEMINI AI CO-PILOT — LIQUID GLASS CONTROLLER
 * Auto-detects the interview from Meet/Teams and hides the manual form.
 */

const $ = (id) => document.getElementById(id);

// Status UI
const btnStart = $('btn-start');
const btnStop = $('btn-stop');
const statusBadge = $('status-badge');
const statusText = $('status-text');

// Cards
const detectingCard = $('detecting-card');
const detectedCard = $('detected-card');
const noInterviewCard = $('no-interview-card');
const manualConfig = $('manual-config');
const liveStats = $('live-stats');

// Inputs
const backendUrlInput = $('backend-url');
const jobIdInput = $('job-id');
const candidateIdInput = $('candidate-id');
const roleSelect = $('interviewer-role');

// Global state
let durationInterval = null;
let startTime = null;

// The detected role, to bypass manual select if auto-detected
let detectedRole = null;

// ---------- On Popup Load ----------
(async function init() {
  const stored = await chrome.storage.local.get(['backendUrl', 'isRecording', 'startTime', 'detectedRole']);
  
  if (stored.isRecording) {
    startTime = stored.startTime || Date.now();
    setRecordingUI(true);
    startDurationTimer();
    return;
  }

  // Find active tab URL
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url) return showNoInterviewState();

  const url = tab.url;
  const isMeeting = url.includes('meet.google.com') || url.includes('teams.microsoft.com') || url.includes('zoom.us');

  if (!isMeeting) return showNoInterviewState();

  // Try to auto-detect
  detectingCard.classList.remove('hidden');
  manualConfig.classList.add('hidden');
  
  try {
    const baseUrl = backendUrlInput.value.trim().replace(/\/+$/, '');
    const detectUrl = `${baseUrl}/api/copilot/detect?meetLink=${encodeURIComponent(url)}`;
    
    const response = await fetch(detectUrl);
    const data = await response.json();

    detectingCard.classList.add('hidden');

    if (data.found && data.interview) {
      const iv = data.interview;
      
      // We found the interview! 
      // Set the values to internal variables & inputs
      jobIdInput.value = iv.jobId;
      candidateIdInput.value = iv.candidateId;
      detectedRole = iv.stage; // Keep it in memory

      // Update UI Card
      $('detected-candidate').textContent = iv.candidateName || '-';
      $('detected-job').textContent = iv.jobTitle || '-';
      $('detected-stage').textContent = (iv.stage || '-').toUpperCase();
      
      detectedCard.classList.remove('hidden');
      
      // Enable the start button!
      btnStart.disabled = false;

    } else {
      // No match found in the database for this meet link
      showNoInterviewState();
    }
  } catch (err) {
    detectingCard.classList.add('hidden');
    showNoInterviewState();
  }
})();

function showNoInterviewState() {
  detectedCard.classList.add('hidden');
  noInterviewCard.classList.remove('hidden');
  // btnStart stays disabled
}

// ---------- Background Listener ----------
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'COPILOT_STATS') {
    $('stat-lines').textContent = msg.transcriptLines || 0;
    $('stat-hints').textContent = msg.hintsSent || 0;
  }

  if (msg.type === 'COPILOT_STATUS') {
    updateStatus(msg.status);
  }

  if (msg.type === 'COPILOT_STOPPED') {
    setRecordingUI(false);
  }
});

// ---------- Start Intelligence ----------
btnStart.addEventListener('click', async () => {
  const backendUrl = backendUrlInput.value.trim();
  const jobId = jobIdInput.value.trim();
  const candidateId = candidateIdInput.value.trim();
  
  // Use detectedRole if available, else fallback to manual select
  const role = detectedRole || roleSelect.value;
  
  if (!jobId || !candidateId) {
    alert('Missing Job ID or Candidate ID.');
    return;
  }

  // Save config
  chrome.storage.local.set({
    backendUrl,
    role,
    jobId,
    candidateId,
    detectedRole,
    isRecording: true,
    startTime: Date.now(),
  });

  // Start background service
  chrome.runtime.sendMessage({
    type: 'START_COPILOT',
    config: { 
      backendUrl: `${backendUrl.replace(/\/+$/, '')}/api/copilot`,
      role, 
      jobId, 
      candidateId 
    },
  });

  startTime = Date.now();
  setRecordingUI(true);
  startDurationTimer();
});

// ---------- End & Analyze ----------
btnStop.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'STOP_COPILOT' });
  chrome.storage.local.set({ isRecording: false, detectedRole: null });
  setRecordingUI(false);
});

// ---------- Helpers ----------
function setRecordingUI(recording) {
  btnStart.disabled = recording;
  btnStop.disabled = !recording;

  if (recording) {
    liveStats.classList.remove('hidden');
    detectingCard.classList.add('hidden');
    detectedCard.classList.add('hidden');
    noInterviewCard.classList.add('hidden');
    manualConfig.classList.add('hidden');
    updateStatus('recording');
  } else {
    liveStats.classList.add('hidden');
    clearInterval(durationInterval);
    durationInterval = null;
    $('stat-duration').textContent = '00:00';
    $('stat-lines').textContent = '0';
    $('stat-hints').textContent = '0';
    updateStatus('idle');
    
    // reset to appropriate form
    if (!detectedRole) {
      showNoInterviewState();
    } else {
      detectedCard.classList.remove('hidden');
    }
  }
}

function updateStatus(status) {
  statusBadge.className = 'status-badge';
  switch (status) {
    case 'recording':
      statusBadge.classList.add('status-recording');
      statusText.textContent = 'Active';
      break;
    case 'connected':
    case 'processing':
      statusBadge.classList.add('status-recording'); // Share styling
      statusText.textContent = 'Synced';
      break;
    default:
      statusBadge.classList.add('status-idle');
      statusText.textContent = 'Standby';
  }
}

function startDurationTimer() {
  clearInterval(durationInterval);
  durationInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const secs = String(elapsed % 60).padStart(2, '0');
    $('stat-duration').textContent = `${mins}:${secs}`;
  }, 1000);
}
