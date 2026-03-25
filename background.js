// Service worker – handles storage and message passing

// ── Install / UUID ─────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'add-job-page',
    title: '💼 Add job to Job Seeker',
    contexts: ['page', 'link', 'selection'],
  });

  // Generate a persistent anonymous UUID for cloud backup (once only)
  chrome.storage.local.get({ userId: null }, ({ userId }) => {
    if (!userId) {
      const id = crypto.randomUUID();
      chrome.storage.local.set({ userId: id });
    }
  });
});

// ── Cloud Sync ─────────────────────────────────────────────────────────────
function cloudSync(jobs) {
  chrome.storage.local.get({ cloudApiUrl: '', userId: '' }, ({ cloudApiUrl, userId }) => {
    if (!cloudApiUrl || !userId) return; // not configured — skip silently
    fetch(`${cloudApiUrl}/api/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, jobs }),
    })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(() => chrome.storage.local.set({ lastSynced: new Date().toISOString() }))
      .catch(err => console.warn('Cloud sync failed:', err));
  });
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== 'add-job-page') return;

  if (info.linkUrl) {
    // Right-clicked a hyperlink — save the link directly
    const url = cleanUrl(info.linkUrl);
    const hostname = (() => { try { return new URL(info.linkUrl).hostname; } catch { return ''; } })();
    const job = {
      id: url,
      title: info.selectionText?.trim() || `Job at ${hostname}`,
      company: '',
      location: '',
      description: '',
      notes: '',
      url,
      source: detectSource(hostname),
      dateAdded: new Date().toISOString(),
    };
    saveOneJob(job, tab);
  } else {
    // Right-clicked on the page itself — extract full job details
    chrome.scripting.executeScript(
      { target: { tabId: tab.id }, func: extractJobFromPage },
      results => {
        if (chrome.runtime.lastError || !results?.[0]?.result) {
          flashBadge('✗', '#ff7c00');
          return;
        }
        saveOneJob(results[0].result, tab);
      }
    );
  }
});

function saveOneJob(job, tab) {
  chrome.storage.local.get({ jobs: [] }, ({ jobs }) => {
    const existingMap = new Map(jobs.map(j => [j.id, j]));
    if (existingMap.has(job.id)) {
      // Enrich existing entry with any new data
      const existing = existingMap.get(job.id);
      if (job.description && job.description.length > (existing.description || '').length) {
        existing.description = job.description;
      }
      for (const f of ['company', 'location', 'title']) {
        if (job[f] && !existing[f]) existing[f] = job[f];
      }
      chrome.storage.local.set({ jobs }, () => flashBadge('↑', '#ffe600'));
    } else {
      chrome.storage.local.set({ jobs: [job, ...jobs] }, () => flashBadge('+1', '#00ff88'));
    }
  });
}

function detectSource(hostname) {
  if (hostname.includes('linkedin'))  return 'LinkedIn';
  if (hostname.includes('indeed'))    return 'Indeed';
  if (hostname.includes('github'))    return 'GitHub';
  if (hostname.includes('google'))    return 'Google';
  if (hostname.includes('microsoft')) return 'Microsoft';
  if (hostname.includes('ibm'))       return 'IBM';
  if (hostname.includes('nvidia') || hostname.includes('workday')) return 'Nvidia';
  if (hostname.includes('amd'))       return 'AMD';
  if (hostname.includes('adobe'))     return 'Adobe';
  return 'Manual';
}

function cleanUrl(url) {
  try { const u = new URL(url); return u.origin + u.pathname; } catch { return url; }
}

function flashBadge(text, color) {
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color });
  setTimeout(() => chrome.action.setBadgeText({ text: '' }), 2500);
}

// Injected into the page to extract job details from the DOM.
function extractJobFromPage() {
  const host = window.location.hostname;

  function firstText(el, ...sels) {
    for (const s of sels) {
      const f = el.querySelector(s);
      if (f?.textContent?.trim()) return f.textContent.trim();
    }
    return '';
  }

  function cleanUrl(url) {
    try { const u = new URL(url); return u.origin + u.pathname; } catch { return url; }
  }

  function getDescription() {
    const sels = [
      '.jobs-description__content', '.jobs-box__html-content',   // LinkedIn
      '#jobDescriptionText', '.jobsearch-jobDescriptionText',     // Indeed
      '[data-automation-id="jobPostingDescription"]',             // Workday
      '.gc-job-detail', '.job-detail-description',               // Google / MS
      '#content .section-wrapper', '.job__description',          // Greenhouse
      '[class*="jobDescription"]', '[class*="job-description"]',
      'main article', 'article', 'main',
    ];
    for (const s of sels) {
      const el = document.querySelector(s);
      const t = el?.innerText?.trim();
      if (t && t.length > 150) return t.slice(0, 6000);
    }
    return '';
  }

  let title = '', company = '', location = '';

  if (host.includes('linkedin.com')) {
    title    = firstText(document, 'h1.job-title', '.job-details-jobs-unified-top-card__job-title h1', 'h1');
    company  = firstText(document, '.job-details-jobs-unified-top-card__company-name a', '.topcard__org-name-link');
    location = firstText(document, '.job-details-jobs-unified-top-card__bullet', '.topcard__flavor--bullet');
  } else if (host.includes('indeed.com')) {
    title    = firstText(document, '[data-testid="jobsearch-JobInfoHeader-title"]', 'h1');
    company  = firstText(document, '[data-testid="inlineHeader-companyName"]', '[class*="companyName"]');
    location = firstText(document, '[data-testid="job-location"]');
  } else if (host.includes('myworkdayjobs.com') || host.includes('careers.amd.com') || host.includes('careers.adobe.com') || host.includes('nvidia')) {
    title    = firstText(document, '[data-automation-id="jobPostingHeader"] h1', 'h1');
    location = firstText(document, '[data-automation-id="jobPostingLocation"]');
  } else if (host.includes('careers.microsoft.com')) {
    title    = firstText(document, 'h1', '[data-automation="job-title"]');
    location = firstText(document, '[data-automation="job-location"]');
    company  = 'Microsoft';
  } else if (host.includes('careers.google.com')) {
    title    = firstText(document, 'h2.p-hd', 'h1');
    location = firstText(document, '[class*="location"]');
    company  = 'Google';
  } else {
    title    = firstText(document, 'h1', 'h2');
    company  = firstText(document, '[class*="company"]', '[class*="employer"]');
    location = firstText(document, '[class*="location"]');
  }

  const url = cleanUrl(window.location.href);
  if (!title) title = document.title.slice(0, 100);

  return {
    id: url, url,
    title:       title.slice(0, 200),
    company:     company.slice(0, 100),
    location:    location.slice(0, 100),
    description: getDescription(),
    notes:       '',
    source:      'Manual',
    dateAdded:   new Date().toISOString(),
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'saveJobs') {
    chrome.storage.local.get({ jobs: [] }, ({ jobs }) => {
      const existingMap = new Map(jobs.map(j => [j.id, j]));
      const newJobs = [];

      for (const incoming of message.jobs) {
        if (existingMap.has(incoming.id)) {
          const existing = existingMap.get(incoming.id);
          // Always prefer a longer/richer description
          if (incoming.description && incoming.description.length > (existing.description || '').length) {
            existing.description = incoming.description;
          }
          // Fill in any missing fields
          for (const field of ['company', 'location', 'title']) {
            if (incoming[field] && !existing[field]) existing[field] = incoming[field];
          }
        } else {
          newJobs.push(incoming);
        }
      }

      const merged = [...newJobs, ...jobs]; // newest first
      chrome.storage.local.set({ jobs: merged }, () => {
        cloudSync(merged);
        sendResponse({ success: true, newCount: newJobs.length, total: merged.length });
      });
    });
    return true; // keep channel open for async sendResponse
  }

  if (message.action === 'getJobs') {
    chrome.storage.local.get({ jobs: [] }, ({ jobs }) => {
      sendResponse({ jobs });
    });
    return true;
  }

  if (message.action === 'deleteJob') {
    chrome.storage.local.get({ jobs: [] }, ({ jobs }) => {
      const updated = jobs.filter(j => j.id !== message.id);
      chrome.storage.local.set({ jobs: updated }, () => {
        cloudSync(updated);
        sendResponse({ success: true });
      });
    });
    return true;
  }

  if (message.action === 'clearJobs') {
    chrome.storage.local.set({ jobs: [] }, () => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.action === 'updateJob') {
    chrome.storage.local.get({ jobs: [] }, ({ jobs }) => {
      const idx = jobs.findIndex(j => j.id === message.id);
      if (idx !== -1) {
        jobs[idx] = { ...jobs[idx], ...message.updates };
        chrome.storage.local.set({ jobs }, () => {
          cloudSync(jobs);
          sendResponse({ success: true });
        });
      } else {
        sendResponse({ success: false });
      }
    });
    return true;
  }

  // Proxy Ollama requests to avoid CORS 403 from chrome-extension:// origin
  if (message.action === 'ollamaGenerate') {
    fetch(`${message.url}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: message.model, prompt: message.prompt, stream: false, format: 'json' }),
      signal: AbortSignal.timeout(120000),
    })
      .then(res => {
        if (!res.ok) throw new Error(`Ollama ${res.status}`);
        return res.json();
      })
      .then(data => sendResponse({ success: true, response: data.response }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.action === 'ollamaTags') {
    fetch(`${message.url}/api/tags`, { signal: AbortSignal.timeout(5000) })
      .then(res => { if (!res.ok) throw new Error(`${res.status}`); return res.json(); })
      .then(data => sendResponse({ success: true, data }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.action === 'getCloudSettings') {
    chrome.storage.local.get({ cloudApiUrl: '', userId: '', lastSynced: null }, data => {
      sendResponse(data);
    });
    return true;
  }

  if (message.action === 'saveCloudSettings') {
    chrome.storage.local.set({ cloudApiUrl: message.cloudApiUrl }, () => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.action === 'syncNow') {
    chrome.storage.local.get({ jobs: [], cloudApiUrl: '', userId: '' }, ({ jobs, cloudApiUrl, userId }) => {
      if (!cloudApiUrl || !userId) {
        sendResponse({ success: false, error: 'Cloud API URL not configured' });
        return;
      }
      fetch(`${cloudApiUrl}/api/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, jobs }),
      })
        .then(r => r.ok ? r.json() : r.json().then(e => Promise.reject(e.error || r.status)))
        .then(data => {
          const ts = new Date().toISOString();
          chrome.storage.local.set({ lastSynced: ts });
          sendResponse({ success: true, count: data.count, lastSynced: ts });
        })
        .catch(err => sendResponse({ success: false, error: String(err) }));
    });
    return true;
  }

  if (message.action === 'cloudRestore') {
    chrome.storage.local.get({ cloudApiUrl: '', userId: '' }, ({ cloudApiUrl, userId }) => {
      if (!cloudApiUrl || !userId) {
        sendResponse({ success: false, error: 'Cloud API URL not configured' });
        return;
      }
      fetch(`${cloudApiUrl}/api/restore?user_id=${encodeURIComponent(userId)}`)
        .then(r => r.ok ? r.json() : r.json().then(e => Promise.reject(e.error || r.status)))
        .then(data => {
          if (!Array.isArray(data.jobs)) throw new Error('Invalid response');
          chrome.storage.local.set({ jobs: data.jobs }, () => {
            sendResponse({ success: true, count: data.jobs.length });
          });
        })
        .catch(err => sendResponse({ success: false, error: String(err) }));
    });
    return true;
  }

  if (message.action === 'addJob') {
    chrome.storage.local.get({ jobs: [] }, ({ jobs }) => {
      const job = message.job;
      if (!job.id) job.id = job.url || `manual-${Date.now()}`;
      if (!job.dateAdded) job.dateAdded = new Date().toISOString();
      // Deduplicate
      const exists = jobs.some(j => j.id === job.id);
      if (!exists) jobs = [job, ...jobs];
      chrome.storage.local.set({ jobs }, () => {
        if (!exists) cloudSync(jobs);
        sendResponse({ success: true, duplicate: exists });
      });
    });
    return true;
  }
});
