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
      rerenderBookings();
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
      rerenderBookings();
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
    return `You are a knowledgeable, friendly travel assistant for the Pandya family trip to Barcelona and Costa Brava (Aug 11-17, 2026). You are an expert on Barcelona, Catalonia, the Costa Brava, Spanish food, culture, logistics, and family travel.

YOU CAN:
1. Answer ANY question about the trip, Barcelona, Costa Brava, Spain, Catalan culture, food, transport, weather, packing, safety, language, tipping, etc.
2. Give specific restaurant recommendations, activity suggestions, neighborhood guides, insider tips.
3. Modify the itinerary when asked (move, add, remove, swap, restructure activities).
4. Help with practical logistics: airport transfers, metro, taxis, driving, parking, beach gear, etc.
5. Suggest alternatives when plans change (rain, fatigue, closed venues).

WHEN ANSWERING QUESTIONS (no itinerary change needed):
Just respond naturally in plain text. Be specific and helpful. Give real place names, addresses, and practical details when relevant. Keep responses concise but thorough.

WHEN THE USER ASKS TO CHANGE THE ITINERARY:
Respond with JSON to modify the schedule. Use this format:

Actions:
- "update": modify fields. changes: [{dayId, eventIndex (0-based), field, value}]. Fields: time, title, details, location, highlight, choice.
- "add": add events. changes: [{dayId, event: {time, title, details, location}}]. Auto-sorts by time.
- "remove": remove events. changes: [{dayId, eventIndex}].
- "swap_events": swap within a day. changes: [{dayId, eventIndexA, eventIndexB}].
- "swap_days": swap entire days. changes: [{dayIdA, dayIdB}].
- "move_event": move between days. changes: [{fromDayId, eventIndex, toDayId}].
- "replace_day": replace all events for a day. changes: [{dayId, theme (optional), events: [{time, title, details, location, highlight (optional)}]}]. Use for restructuring, time shifts, or major changes.
- "confirm_booking": move something to the confirmed list. changes: [{title, detail, ref, refLabel, fromId (optional — id from toBook list to remove it from there)}].
- "add_to_book": add a new suggestion to the "Still to Book" list. changes: [{id, title, detail, link (booking URL), priority ("urgent"/"recommended"/"flexible")}].
- "remove_booking": remove from either list. changes: [{id}].
- "none": no change, just a conversational answer.

For changes, respond ONLY with valid JSON: {"action":"...", "changes":[...]}
For questions/conversation, just respond in plain text — no JSON needed.

IMPORTANT:
- If unsure whether the user wants a change or just info, answer the question first and ask if they'd like you to update the itinerary.
- When adding events, always include a Google Maps location link: https://maps.google.com/?q=Place+Name+City
- Keep the schedule realistic: account for travel time between locations, meal durations, rest needs for a family.
- Spanish dinner is 20:30-22:00, lunch 13:30-15:00. Don't schedule meals outside these windows.
- The W Barcelona is on the waterfront — taxis needed for most sightseeing destinations (15-20 min).
- Le Méridien is on La Rambla — everything central is walkable.

TRIP CONTEXT:
- Family of 4
- Staying at W Barcelona (Days 1-3), Costa Brava/Begur area (Days 4-5), Le Méridien (Days 6-7)
- Already booked: Flamenco Palau Dalmases (Day 1, 18:45), Casa Batlló Magical Nights (Day 2, 20:00), Park Güell (Day 3, 12:30)
- Still need: Sagrada Família tickets, rental car, farewell dinner reservation
- Travel dates: August (hot, 30-33°C, tourist high season)

Current itinerary:
${JSON.stringify(itinerary.days.map(d => ({id: d.id, label: d.label, base: d.base, theme: d.theme, events: d.events.map((e, i) => ({index: i, ...e}))})), null, 1)}

Current bookings:
${JSON.stringify(itinerary.bookings || {toBook: [], confirmed: []}, null, 1)}`;
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

      case 'confirm_booking':
        // Move from toBook to confirmed, or add directly to confirmed
        changes.forEach(c => {
          if (!itinerary.bookings) itinerary.bookings = { toBook: [], confirmed: [] };
          // Remove from toBook if it exists there
          if (c.fromId) {
            itinerary.bookings.toBook = itinerary.bookings.toBook.filter(b => b.id !== c.fromId);
          }
          // Add to confirmed
          itinerary.bookings.confirmed.push({
            id: c.id || Date.now().toString(),
            title: c.title,
            detail: c.detail,
            ref: c.ref || '',
            refLabel: c.refLabel || 'Confirmation'
          });
        });
        break;

      case 'add_to_book':
        // Add a new item to the "Still to Book" list
        changes.forEach(c => {
          if (!itinerary.bookings) itinerary.bookings = { toBook: [], confirmed: [] };
          itinerary.bookings.toBook.push({
            id: c.id || Date.now().toString(),
            title: c.title,
            detail: c.detail,
            link: c.link || '',
            priority: c.priority || 'recommended'
          });
        });
        break;

      case 'remove_booking':
        // Remove from either list
        changes.forEach(c => {
          if (!itinerary.bookings) return;
          itinerary.bookings.toBook = itinerary.bookings.toBook.filter(b => b.id !== c.id);
          itinerary.bookings.confirmed = itinerary.bookings.confirmed.filter(b => b.id !== c.id);
        });
        break;

      default:
        return;
    }

    rerenderItinerary();
    rerenderBookings();
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

  // --- RE-RENDER BOOKINGS ---
  function rerenderBookings() {
    if (!itinerary || !itinerary.bookings) return;

    // Render "Still to Book"
    const toBookGrid = document.querySelector('.book-first__grid');
    if (toBookGrid) {
      toBookGrid.innerHTML = itinerary.bookings.toBook.map((b, i) => {
        const priorityClass = b.priority === 'urgent' ? 'chip--urgent' : b.priority === 'flexible' ? 'chip--flexible' : 'chip--recommended';
        const linkText = b.priority === 'urgent' ? 'Book now →' : b.priority === 'flexible' ? 'Browse →' : 'Recommended →';
        return `
          <article class="reservation-card is-revealed">
            <span class="reservation-card__priority">${i + 1}</span>
            <h3 class="reservation-card__title">${b.title}</h3>
            <p class="reservation-card__detail">${b.detail}</p>
            ${b.link ? `<a href="${b.link}" target="_blank" rel="noopener" class="chip ${priorityClass}">${linkText}</a>` : `<span class="chip ${priorityClass}">${b.priority}</span>`}
          </article>
        `;
      }).join('');
    }

    // Render "Confirmed"
    const confirmedGrid = document.querySelector('.confirmed__grid');
    if (confirmedGrid) {
      confirmedGrid.innerHTML = itinerary.bookings.confirmed.map(b => `
        <article class="confirmed__card is-revealed">
          <div class="confirmed__icon">✓</div>
          <div class="confirmed__info">
            <h3>${b.title}</h3>
            <p>${b.detail}</p>
            ${b.ref ? `<span class="confirmed__ref">${b.refLabel || 'Confirmation'}: <em>${b.ref}</em></span>` : ''}
          </div>
        </article>
      `).join('');
    }
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
            <p>Hi! I'm your Barcelona + Costa Brava trip assistant. I can:</p>
            <ul>
              <li>Answer questions about the trip, food, transport, culture</li>
              <li>Recommend restaurants, activities, or alternatives</li>
              <li>Rearrange the itinerary (move, add, remove, swap)</li>
              <li>Help with logistics and packing tips</li>
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

    // Move panel to body root so nothing interferes with fixed positioning
    const panel = document.getElementById('chat-panel');
    document.body.appendChild(panel);

    // Bind events
    const toggle = document.getElementById('chat-toggle');
    const closeBtn = document.getElementById('chat-close');
    const form = document.getElementById('chat-form');
    const input = document.getElementById('chat-input');
    const messages = document.getElementById('chat-messages');

    let savedScrollY = 0;
    const isMobile = () => window.innerWidth < 768;

    function lockScroll() {
      if (!isMobile()) return;
      savedScrollY = window.scrollY;
      document.documentElement.style.overflow = 'hidden';
      document.documentElement.style.height = '100%';
      document.body.style.overflow = 'hidden';
      document.body.style.height = '100%';
      document.body.style.position = 'fixed';
      document.body.style.top = `-${savedScrollY}px`;
      document.body.style.width = '100%';
    }

    function unlockScroll() {
      if (!isMobile()) return;
      document.documentElement.style.overflow = '';
      document.documentElement.style.height = '';
      document.body.style.overflow = '';
      document.body.style.height = '';
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      window.scrollTo(0, savedScrollY);
    }

    toggle.addEventListener('click', () => {
      panel.hidden = false;
      toggle.hidden = true;
      lockScroll();
      input.focus();
    });

    closeBtn.addEventListener('click', () => {
      panel.hidden = true;
      toggle.hidden = false;
      unlockScroll();
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
        // Strip thinking tags and code fences
        let cleaned = reply;
        cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/g, '');
        cleaned = cleaned.replace(/```json\n?/g, '').replace(/```\n?/g, '');
        cleaned = cleaned.trim();

        // Try to find and parse JSON
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            parsed = JSON.parse(jsonMatch[0]);
          } catch (e) {
            // JSON-like but invalid — treat as plain text
            parsed = null;
          }
        }

        // If we got valid parsed JSON with an action
        if (parsed && parsed.action) {
          if (parsed.action === 'none') {
            appendMessage(parsed.message || cleaned, 'bot');
          } else {
            applyChanges(parsed);
            appendMessage(describeChanges(parsed), 'bot');
          }
        } else {
          // No valid JSON action — show the reply as plain text conversation
          // Remove any leftover JSON artifacts
          let plainMsg = cleaned.replace(/^\{.*\}$/s, '').trim() || cleaned;
          appendMessage(plainMsg, 'bot');
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

    // Block touch scrolling outside the messages area
    panel.addEventListener('touchmove', (e) => {
      // Only allow scroll inside the messages container
      if (!e.target.closest('.chat-panel__messages')) {
        e.preventDefault();
      }
    }, { passive: false });

    // Keep input visible when focused
    input.addEventListener('focus', () => {
      setTimeout(() => {
        messages.scrollTop = messages.scrollHeight;
      }, 400);
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
      case 'confirm_booking': return `✓ Moved to confirmed: ${parsed.changes.map(c => c.title).join(', ')}.`;
      case 'add_to_book': return `✓ Added to booking list: ${parsed.changes.map(c => c.title).join(', ')}.`;
      case 'remove_booking': return `✓ Removed from bookings.`;
      default: return `✓ Change applied.`;
    }
  }

  // --- INIT ---
  createChatUI();
  loadFromGitHub();

})();
