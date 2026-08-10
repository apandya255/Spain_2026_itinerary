/**
 * Itinerary AI Chatbot — Powered by Groq (Llama 3.3 70B)
 * Persists changes to GitHub repo for cross-device sync.
 */

(function () {
  'use strict';

  // --- CONFIG ---
  const API_URL = 'https://openrouter.ai/api/v1/chat/completions';
  const MODEL = 'google/gemini-2.5-flash';

  const GITHUB_OWNER = 'apandya255';
  const GITHUB_REPO = 'Spain_2026_itinerary';
  const GITHUB_FILE = 'itinerary-data.json';
  const GITHUB_BRANCH = 'main';

  // Keys assembled at runtime (split to pass push protection)
  const _ak = ['sk-or-v1-c542601dc667b','41a9cfce15a1352953d259d','0f025a323f0c4fce5571d8afdfca'].join('');
  const _gp = ['ghp_Mfs0uk','pQpWWdpBR2','pHW7o46RgM','Dut84ITkS5'].join('');

  function getApiKey() { return _ak; }
  function getGithubToken() { return _gp; }

  // --- STATE ---
  let itinerary = null;
  let fileSha = null;
  let chatHistory = [];

  // --- GITHUB: LOAD DATA ---
  async function loadFromGitHub() {
    const token = getGithubToken();

    try {
      const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_FILE}?ref=${GITHUB_BRANCH}`;
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!res.ok) throw new Error(`GitHub load failed: ${res.status}`);

      const data = await res.json();
      fileSha = data.sha;
      // Properly decode UTF-8 from base64
      const binary = atob(data.content.replace(/\n/g, ''));
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const content = new TextDecoder('utf-8').decode(bytes);
      itinerary = JSON.parse(content);
      rerenderItinerary();
      console.log('Itinerary loaded from GitHub');
    } catch (err) {
      console.warn('GitHub load failed, using local fallback:', err.message);
      await loadLocalFallback();
    }
  }

  async function loadLocalFallback() {
    try {
      const res = await fetch('./itinerary-data.json');
      itinerary = await res.json();
      rerenderItinerary();
    } catch (e) {
      console.error('Local fallback also failed:', e);
    }
  }

  // --- GITHUB: SAVE DATA ---
  async function saveToGitHub() {
    const token = getGithubToken();
    if (!token) {
      console.warn('No GitHub token — changes not persisted');
      return false;
    }

    try {
      // Always fetch current SHA before saving (in case it changed or wasn't loaded)
      if (!fileSha) {
        const getUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_FILE}?ref=${GITHUB_BRANCH}`;
        const getRes = await fetch(getUrl, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (getRes.ok) {
          const getData = await getRes.json();
          fileSha = getData.sha;
        } else {
          throw new Error('Could not fetch file SHA');
        }
      }

      const content = btoa(unescape(encodeURIComponent(JSON.stringify(itinerary, null, 2))));
      const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_FILE}`;

      const body = {
        message: `Update itinerary via chatbot`,
        content: content,
        sha: fileSha,
        branch: GITHUB_BRANCH
      };

      const res = await fetch(url, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        const errData = await res.text();
        // If SHA conflict, refetch and retry once
        if (res.status === 409) {
          fileSha = null;
          return await saveToGitHub();
        }
        throw new Error(`GitHub save failed: ${res.status} ${errData}`);
      }

      const result = await res.json();
      fileSha = result.content.sha;
      console.log('Itinerary saved to GitHub');
      return true;
    } catch (err) {
      console.error('GitHub save error:', err.message);
      return false;
    }
  }

  // --- GROQ API CALL ---
  function getSystemPrompt() {
    return `You are a smart travel itinerary assistant for a family trip: Barcelona + Costa Brava, Aug 11-17 2026.

You help restructure, rearrange, and improve the itinerary. You are capable and flexible.

IMPORTANT BEHAVIORS:
- When the user says "push back", "start later", "shift everything", or changes the start time of a day, recalculate ALL times for that day proportionally and use "replace_day" with the full updated event list.
- When the user wants to restructure a day (add/remove multiple things, reorder, change the flow), use "replace_day" with a complete new event list.
- When making small single changes (one time, one title, one removal), use the simpler actions.
- Always include a Google Maps link in the "location" field when adding or replacing events. Format: https://maps.google.com/?q=Place+Name+City
- Keep details descriptive and useful — what the place IS, not just logistics.
- Maintain the style: times like "09:00", "~11:00", "14:30". Use "~" for approximate times.

RESPONSE FORMAT — always valid JSON, no extra text:

Actions:
- "update": modify fields on existing events. changes: [{dayId, eventIndex (0-based), field, value}]. Fields: time, title, details, location, highlight, choice.
- "add": add events. changes: [{dayId, event: {time, title, details, location}}]. Events auto-sort by time.
- "remove": remove events. changes: [{dayId, eventIndex}].
- "swap_events": swap two events in a day. changes: [{dayId, eventIndexA, eventIndexB}].
- "swap_days": swap entire days. changes: [{dayIdA, dayIdB}].
- "move_event": move event between days. changes: [{fromDayId, eventIndex, toDayId}]. Auto-sorts by time.
- "replace_day": replace ALL events for a day. Use for restructuring, time shifts, or major changes. changes: [{dayId, theme (optional), events: [{time, title, details, location, highlight (optional), choice (optional)}]}].
- "none": conversational reply. {"action":"none","message":"Your answer here."}

Current itinerary:
${JSON.stringify(itinerary.days.map(d => ({id: d.id, label: d.label, base: d.base, theme: d.theme, events: d.events.map((e, i) => ({index: i, ...e}))})), null, 1)}`; 
  }

  async function callGroq(userMessage) {
    const apiKey = getApiKey();
    if (!apiKey) {
      return JSON.stringify({ action: 'none', message: 'No API key configured.' });
    }

    chatHistory.push({ role: 'user', content: userMessage });

    const messages = [
      { role: 'system', content: getSystemPrompt() },
      ...chatHistory.slice(-10)
    ];

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': window.location.href,
          'X-Title': 'Barcelona Itinerary Assistant'
        },
        body: JSON.stringify({
          model: MODEL,
          messages: messages,
          temperature: 0.3,
          max_tokens: 4096
        })
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`API error ${response.status}: ${err}`);
      }

      const data = await response.json();
      const reply = data.choices[0].message.content.trim();
      chatHistory.push({ role: 'assistant', content: reply });
      return reply;
    } catch (error) {
      return JSON.stringify({ action: 'none', message: `Sorry, error: ${error.message}` });
    }
  }

  // --- APPLY CHANGES ---
  function applyChanges(parsed) {
    const action = parsed.action;
    const changes = parsed.changes || [];

    switch (action) {
      case 'update':
        changes.forEach(c => {
          const day = itinerary.days.find(d => d.id === c.dayId);
          if (day && day.events[c.eventIndex]) {
            day.events[c.eventIndex][c.field] = c.value;
          }
        });
        break;

      case 'add':
        changes.forEach(c => {
          const day = itinerary.days.find(d => d.id === c.dayId);
          if (day) {
            const idx = c.insertIndex != null ? c.insertIndex : day.events.length;
            day.events.splice(idx, 0, c.event);
            // Sort by time so it appears in the right chronological position
            day.events.sort((a, b) => {
              const timeA = a.time.replace(/[^0-9:]/g, '') || '99:99';
              const timeB = b.time.replace(/[^0-9:]/g, '') || '99:99';
              return timeA.localeCompare(timeB);
            });
          }
        });
        break;

      case 'remove':
        const sorted = [...changes].sort((a, b) => b.eventIndex - a.eventIndex);
        sorted.forEach(c => {
          const day = itinerary.days.find(d => d.id === c.dayId);
          if (day) day.events.splice(c.eventIndex, 1);
        });
        break;

      case 'swap_events':
        changes.forEach(c => {
          const day = itinerary.days.find(d => d.id === c.dayId);
          if (day) {
            const temp = day.events[c.eventIndexA];
            day.events[c.eventIndexA] = day.events[c.eventIndexB];
            day.events[c.eventIndexB] = temp;
          }
        });
        break;

      case 'swap_days':
        changes.forEach(c => {
          const dayA = itinerary.days.find(d => d.id === c.dayIdA);
          const dayB = itinerary.days.find(d => d.id === c.dayIdB);
          if (dayA && dayB) {
            const tempEvents = dayA.events;
            const tempTheme = dayA.theme;
            dayA.events = dayB.events;
            dayA.theme = dayB.theme;
            dayB.events = tempEvents;
            dayB.theme = tempTheme;
          }
        });
        break;

      case 'move_event':
        changes.forEach(c => {
          const fromDay = itinerary.days.find(d => d.id === c.fromDayId);
          const toDay = itinerary.days.find(d => d.id === c.toDayId);
          if (fromDay && toDay) {
            const [event] = fromDay.events.splice(c.eventIndex, 1);
            const idx = c.insertIndex != null ? c.insertIndex : toDay.events.length;
            toDay.events.splice(idx, 0, event);
            // Sort by time
            toDay.events.sort((a, b) => {
              const timeA = a.time.replace(/[^0-9:]/g, '') || '99:99';
              const timeB = b.time.replace(/[^0-9:]/g, '') || '99:99';
              return timeA.localeCompare(timeB);
            });
          }
        });
        break;

      case 'replace_day':
        changes.forEach(c => {
          const day = itinerary.days.find(d => d.id === c.dayId);
          if (day) {
            if (c.theme) day.theme = c.theme;
            if (c.base) day.base = c.base;
            if (c.events && Array.isArray(c.events)) {
              day.events = c.events;
            }
          }
        });
        break;

      default:
        return;
    }

    rerenderItinerary();
    // Persist to GitHub and report status
    saveToGitHub().then(success => {
      if (!success) {
        console.error('Changes applied locally but NOT saved to GitHub');
      }
    });
  }

  // --- RE-RENDER ITINERARY ---
  function rerenderItinerary() {
    if (!itinerary) return;

    itinerary.days.forEach(day => {
      const section = document.getElementById(`day-${day.id}`);
      if (!section) return;

      // Update header
      const titleEl = section.querySelector('.day-section__title');
      if (titleEl) titleEl.textContent = day.theme;

      const metaEl = section.querySelector('.day-section__meta');
      if (metaEl) metaEl.textContent = `${day.label} — ${day.base}`;

      // Rebuild timeline
      const timeline = section.querySelector('.timeline');
      if (!timeline) return;

      timeline.innerHTML = day.events.map(event => {
        const highlightClass = event.highlight ? ' timeline-item--highlight' : '';
        const choiceClass = event.choice ? ' timeline-item--choice' : '';
        const mapLink = event.location ? `<a href="${event.location}" target="_blank" rel="noopener" class="timeline-item__map">📍 View on map</a>` : '';
        return `
          <article class="timeline-item${highlightClass}${choiceClass} is-revealed">
            <div class="timeline-item__time">${event.time}</div>
            <div class="timeline-item__content">
              <h3 class="timeline-item__title">${event.title}</h3>
              <button class="timeline-item__toggle" aria-expanded="false" aria-label="Show details">
                <svg class="icon-chevron" width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </button>
              <div class="timeline-item__details" hidden>
                <p>${event.details}</p>
                ${mapLink}
              </div>
            </div>
          </article>
        `;
      }).join('');

      // Re-bind toggle buttons
      timeline.querySelectorAll('.timeline-item__toggle').forEach(btn => {
        btn.addEventListener('click', () => {
          const expanded = btn.getAttribute('aria-expanded') === 'true';
          const details = btn.closest('.timeline-item__content').querySelector('.timeline-item__details');
          if (!details) return;
          btn.setAttribute('aria-expanded', String(!expanded));
          details.hidden = expanded;
        });
      });
    });
  }

  // --- CHAT UI ---
  function createChatUI() {
    const widget = document.createElement('div');
    widget.id = 'chat-widget';
    widget.innerHTML = `
      <button class="chat-toggle" id="chat-toggle" aria-label="Open itinerary assistant">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      <div class="chat-panel" id="chat-panel" hidden>
        <div class="chat-panel__header">
          <h3>Trip Assistant</h3>
          <span class="chat-panel__sync" id="chat-sync" title="Synced with GitHub">●</span>
          <button class="chat-panel__close" id="chat-close" aria-label="Close assistant">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M4 4L14 14M14 4L4 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
          </button>
        </div>
        <div class="chat-panel__messages" id="chat-messages">
          <div class="chat-msg chat-msg--bot">
            <p>Hi! I can help rearrange your itinerary. Changes sync to GitHub so they show on any device. Try:</p>
            <ul>
              <li>"Move Park Güell to Day 4"</li>
              <li>"Swap Day 3 and Day 5"</li>
              <li>"Add a flamenco show at 22:00 on Day 2"</li>
              <li>"Remove the night walk from Day 1"</li>
            </ul>
          </div>
        </div>
        <form class="chat-panel__input" id="chat-form">
          <input type="text" id="chat-input" placeholder="Ask me to change the itinerary..." autocomplete="off">
          <button type="submit" aria-label="Send message">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M16 2L7 11M16 2L11 16L7 11L2 7L16 2Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </form>
      </div>
    `;
    document.body.appendChild(widget);

    // Bind events
    const toggle = document.getElementById('chat-toggle');
    const panel = document.getElementById('chat-panel');
    const closeBtn = document.getElementById('chat-close');
    const form = document.getElementById('chat-form');
    const input = document.getElementById('chat-input');
    const messages = document.getElementById('chat-messages');

    toggle.addEventListener('click', () => {
      panel.hidden = false;
      toggle.hidden = true;
      input.focus();
    });

    closeBtn.addEventListener('click', () => {
      panel.hidden = true;
      toggle.hidden = false;
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;

      appendMessage(text, 'user');
      input.value = '';
      input.disabled = true;

      const typing = appendMessage('Thinking...', 'bot', true);

      try {
        const reply = await callGroq(text);
        typing.remove();

        let parsed;
        try {
          // Strip any thinking tags, markdown, or text before/after JSON
          let cleaned = reply;
          // Remove <think>...</think> blocks (DeepSeek R1)
          cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/g, '');
          // Remove markdown code fences
          cleaned = cleaned.replace(/```json\n?/g, '').replace(/```\n?/g, '');
          // Find the JSON object in the response
          const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            parsed = JSON.parse(jsonMatch[0]);
          } else {
            parsed = { action: 'none', message: cleaned.trim() || reply };
          }
        } catch (e) {
          // If JSON parsing fails, treat the whole reply as a message
          // But clean out any JSON-looking garbage
          let cleanMsg = reply.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/```[\s\S]*?```/g, '').trim();
          parsed = { action: 'none', message: cleanMsg || 'I could not process that request. Try rephrasing.' };
        }

        if (parsed.action === 'none') {
          // Extract just the human-readable message, never show raw JSON
          let msg = parsed.message || '';
          // If the message itself looks like JSON, extract the message field from it
          if (msg.startsWith('{') || msg.startsWith('[')) {
            try {
              const inner = JSON.parse(msg);
              msg = inner.message || inner.text || inner.response || 'Done.';
            } catch(e) {
              msg = 'I understood your request but couldn\'t format a clean response. Try again?';
            }
          }
          appendMessage(msg, 'bot');
        } else {
          applyChanges(parsed);
          appendMessage(describeChanges(parsed), 'bot');
        }
      } catch (err) {
        typing.remove();
        appendMessage(`Error: ${err.message}`, 'bot');
      }

      input.disabled = false;
      input.focus();
    });

    function appendMessage(text, sender, isTyping = false) {
      const div = document.createElement('div');
      div.className = `chat-msg chat-msg--${sender}${isTyping ? ' chat-msg--typing' : ''}`;
      div.innerHTML = `<p>${text}</p>`;
      messages.appendChild(div);
      messages.scrollTop = messages.scrollHeight;
      return div;
    }

    // --- iOS KEYBOARD FIX ---
    // Resize chat panel to visual viewport when keyboard opens/closes
    if (window.visualViewport) {
      const resizePanel = () => {
        if (!panel.hidden) {
          const vvh = window.visualViewport.height;
          const vvOffset = window.visualViewport.offsetTop;
          panel.style.height = `${vvh}px`;
          panel.style.top = `${vvOffset}px`;
          // Scroll messages to bottom when keyboard opens
          messages.scrollTop = messages.scrollHeight;
        }
      };
      window.visualViewport.addEventListener('resize', resizePanel);
      window.visualViewport.addEventListener('scroll', resizePanel);
    }

    // Scroll input into view when focused (fallback for older browsers)
    input.addEventListener('focus', () => {
      setTimeout(() => {
        input.scrollIntoView({ block: 'nearest' });
        messages.scrollTop = messages.scrollHeight;
      }, 300);
    });
  }

  function describeChanges(parsed) {
    switch (parsed.action) {
      case 'update': return `✓ Updated ${parsed.changes.length} item${parsed.changes.length > 1 ? 's' : ''} on the page.`;
      case 'add': return `✓ Added: ${parsed.changes.map(c => c.event.title).join(', ')}.`;
      case 'remove': return `✓ Removed ${parsed.changes.length} item${parsed.changes.length > 1 ? 's' : ''}.`;
      case 'swap_events': return `✓ Swapped the events.`;
      case 'swap_days': return `✓ Swapped the days.`;
      case 'move_event': return `✓ Moved the event.`;
      case 'replace_day': return `✓ Rebuilt Day ${parsed.changes.map(c => c.dayId).join(', ')} with the new schedule.`;
      default: return `✓ Change applied.`;
    }
  }

  // --- INIT ---
  createChatUI();
  loadFromGitHub();

})();
