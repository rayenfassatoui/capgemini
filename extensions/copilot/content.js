/**
 * CAPGEMINI AI CO-PILOT — CONTENT SCRIPT
 * 
 * Injected into Google Meet / Teams / Zoom pages.
 * Responsibilities:
 * 1. Display a floating "AI Recording" banner so the interviewer knows it's active.
 * 2. Display live AI hints as toast notifications on the meeting page.
 * 3. Auto-dismiss hints after 12 seconds.
 */

(() => {
  // Prevent double injection
  if (document.getElementById('capgemini-copilot-root')) return;

  // ---------- Create Root Container ----------
  const root = document.createElement('div');
  root.id = 'capgemini-copilot-root';
  document.body.appendChild(root);

  // ---------- Recording Banner ----------
  const banner = document.createElement('div');
  banner.id = 'copilot-banner';
  banner.className = 'copilot-banner copilot-hidden';
  banner.innerHTML = `
    <div class="copilot-banner-dot"></div>
    <span class="copilot-banner-text">AI Co-Pilot Active</span>
  `;
  root.appendChild(banner);

  // ---------- Hints Container ----------
  const hintsContainer = document.createElement('div');
  hintsContainer.id = 'copilot-hints';
  hintsContainer.className = 'copilot-hints';
  root.appendChild(hintsContainer);

  // ---------- Hint Counter ----------
  let hintCount = 0;

  // ---------- Show a Hint Toast ----------
  function showHint(hint) {
    hintCount++;

    const toast = document.createElement('div');
    toast.className = 'copilot-hint copilot-hint-enter';

    // Determine icon based on hint type
    const iconMap = {
      probe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>',
      flag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>',
      info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>',
      redirect: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8l4 4-4 4"/><path d="M2 12h20"/></svg>',
    };

    const colorMap = {
      probe: '#3b82f6',
      flag: '#ef4444',
      info: '#22c55e',
      redirect: '#f59e0b',
    };

    const labelMap = {
      probe: 'FOLLOW UP',
      flag: 'RED FLAG',
      info: 'INSIGHT',
      redirect: 'REDIRECT',
    };

    const type = hint.type || 'info';
    const urgency = hint.urgency || 'low';
    const color = colorMap[type] || colorMap.info;

    toast.innerHTML = `
      <div class="copilot-hint-header">
        <div class="copilot-hint-icon" style="color: ${color}">
          ${iconMap[type] || iconMap.info}
        </div>
        <span class="copilot-hint-label" style="color: ${color}">${labelMap[type]}</span>
        ${urgency === 'high' ? '<span class="copilot-hint-urgent">URGENT</span>' : ''}
        <button class="copilot-hint-close" onclick="this.closest('.copilot-hint').remove()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <p class="copilot-hint-message">${hint.message || ''}</p>
      ${hint.context ? `<p class="copilot-hint-context">${hint.context}</p>` : ''}
    `;

    hintsContainer.appendChild(toast);

    // Trigger entrance animation
    requestAnimationFrame(() => {
      toast.classList.remove('copilot-hint-enter');
    });

    // Auto-dismiss after 12 seconds
    setTimeout(() => {
      toast.classList.add('copilot-hint-exit');
      setTimeout(() => toast.remove(), 300);
    }, 12000);

    // Keep max 3 hints visible
    const hints = hintsContainer.querySelectorAll('.copilot-hint');
    if (hints.length > 3) {
      hints[0].remove();
    }
  }

  // ---------- Message Listener from Background ----------
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'RECORDING_STARTED') {
      banner.classList.remove('copilot-hidden');
    }

    if (msg.type === 'RECORDING_STOPPED') {
      banner.classList.add('copilot-hidden');
      // Clear all hints
      hintsContainer.innerHTML = '';
    }

    if (msg.type === 'SHOW_HINT') {
      showHint(msg.hint);
    }
  });
})();
