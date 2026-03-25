// ── Search URL config ──────────────────────────────────────────────────────
// Job board searches: pre-configured for Remote, Illinois, Wisconsin
const SEARCH_URLS = {
  linkedin: {
    apprenticeship: [
      'https://www.linkedin.com/jobs/search/?keywords=software+engineering+apprenticeship&f_WT=2',
      'https://www.linkedin.com/jobs/search/?keywords=software+engineering+apprenticeship&location=Illinois',
      'https://www.linkedin.com/jobs/search/?keywords=software+engineering+apprenticeship&location=Wisconsin',
    ],
    internship: [
      'https://www.linkedin.com/jobs/search/?keywords=software+engineer+intern&f_WT=2&f_JT=I',
      'https://www.linkedin.com/jobs/search/?keywords=software+engineer+intern&location=Illinois&f_JT=I',
      'https://www.linkedin.com/jobs/search/?keywords=software+engineer+intern&location=Wisconsin&f_JT=I',
    ],
    entry: [
      'https://www.linkedin.com/jobs/search/?keywords=software+engineer+entry+level&f_WT=2&f_E=2',
      'https://www.linkedin.com/jobs/search/?keywords=software+engineer+entry+level&location=Illinois&f_E=2',
      'https://www.linkedin.com/jobs/search/?keywords=software+engineer+entry+level&location=Wisconsin&f_E=2',
    ],
  },
  indeed: {
    apprenticeship: [
      'https://www.indeed.com/jobs?q=software+engineer+apprenticeship&l=Remote&jt=apprenticeship',
      'https://www.indeed.com/jobs?q=software+engineer+apprenticeship&l=Illinois',
      'https://www.indeed.com/jobs?q=software+engineer+apprenticeship&l=Wisconsin',
    ],
    internship: [
      'https://www.indeed.com/jobs?q=software+engineer&l=Remote&jt=internship',
      'https://www.indeed.com/jobs?q=software+engineer&l=Illinois&jt=internship',
      'https://www.indeed.com/jobs?q=software+engineer&l=Wisconsin&jt=internship',
    ],
    entry: [
      'https://www.indeed.com/jobs?q=software+engineer+entry+level&l=Remote',
      'https://www.indeed.com/jobs?q=software+engineer+entry+level&l=Illinois',
      'https://www.indeed.com/jobs?q=software+engineer+entry+level&l=Wisconsin',
    ],
  },
};

// Company career page searches (intern + entry in one tab each where possible)
const COMPANY_URLS = {
  github: [
    'https://www.github.careers/careers-home/jobs?q=software+engineer',
  ],
  google: [
    'https://careers.google.com/jobs/results/?q=software+engineer&employment_type=INTERN',
    'https://careers.google.com/jobs/results/?q=software+engineer&experience=1_NEW_GRAD',
  ],
  ibm: [
    'https://careers.ibm.com/jobs?field_keyword_03=software+engineer&field_keyword_18=Intern',
    'https://careers.ibm.com/jobs?field_keyword_03=software+engineer+entry+level',
  ],
  microsoft: [
    'https://jobs.careers.microsoft.com/global/en/search?q=software+engineer&lc=United+States&exp=Internship',
    'https://jobs.careers.microsoft.com/global/en/search?q=software+engineer&lc=United+States&exp=Entry+Level',
  ],
  nvidia: [
    'https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite?q=software+engineer+intern',
    'https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite?q=software+engineer+new+grad',
  ],
  amd: [
    'https://careers.amd.com/careers-home/jobs?q=software%20engineer%20intern&page=1',
    'https://careers.amd.com/careers-home/jobs?q=software%20engineer%20entry%20level&page=1',
  ],
  adobe: [
    'https://careers.adobe.com/us/en/search-results?keywords=software+engineer+intern',
    'https://careers.adobe.com/us/en/search-results?keywords=software+engineer+new+grad',
  ],
};

// ── State ──────────────────────────────────────────────────────────────────
let allJobs = [];

// ── Init ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await loadJobs();
  bindEvents();

  // Live-update if background saves new jobs while popup is open
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.jobs) {
      allJobs = changes.jobs.newValue || [];
      render();
    }
  });

  // Listen for scrape results from the background worker
  chrome.runtime.onMessage.addListener(handleRuntimeMessage);
});

// ── Data ───────────────────────────────────────────────────────────────────
async function loadJobs() {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ action: 'getJobs' }, ({ jobs }) => {
      allJobs = jobs || [];
      render();
      resolve();
    });
  });
}

// ── Events ─────────────────────────────────────────────────────────────────
function bindEvents() {
  // Company career buttons
  document.querySelectorAll('.btn-company').forEach(btn => {
    btn.addEventListener('click', () => {
      const urls = COMPANY_URLS[btn.dataset.company];
      if (urls) urls.forEach(url => chrome.tabs.create({ url }));
    });
  });

  // Search launcher buttons
  document.querySelectorAll('.btn[data-site]').forEach(btn => {
    btn.addEventListener('click', () => {
      const { site, role } = btn.dataset;
      const urls = SEARCH_URLS[site]?.[role];
      if (!urls) return;
      // Open one tab per location (remote + IL + WI = 3 tabs)
      urls.forEach(url => chrome.tabs.create({ url }));
    });
  });

  // Scrape current page
  document.getElementById('btn-scrape').addEventListener('click', scrapeCurrentPage);

  // Filters
  document.getElementById('filter-input').addEventListener('input', render);
  document.getElementById('source-filter').addEventListener('change', render);

  // Footer
  document.getElementById('btn-open-options').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
  document.getElementById('btn-add-manual').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('options.html#add') });
  });
}

// ── Scraping ───────────────────────────────────────────────────────────────
async function scrapeCurrentPage() {
  const btn = document.getElementById('btn-scrape');
  const status = document.getElementById('scrape-status');

  btn.disabled = true;
  setStatus('Scraping…', '');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab?.url?.match(/linkedin\.com|indeed\.com|github\.careers|careers\.google\.com|careers\.microsoft\.com|careers\.ibm\.com|myworkdayjobs\.com|careers\.amd\.com|careers\.adobe\.com/i)) {
      setStatus('⚠ Navigate to a supported job site first (LinkedIn, Indeed, or a company career page).', 'error');
      btn.disabled = false;
      return;
    }

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content/scraper.js'],
    });

    // Results arrive via runtime message (handleRuntimeMessage)
    // Set a timeout in case the page gives no response
    setTimeout(() => {
      if (btn.disabled) {
        setStatus('⚠ No jobs found. Try scrolling to load listings first.', 'error');
        btn.disabled = false;
      }
    }, 5000);

  } catch (err) {
    setStatus(`⚠ Error: ${err.message}`, 'error');
    btn.disabled = false;
  }
}

function handleRuntimeMessage(message) {
  const btn = document.getElementById('btn-scrape');
  if (message.action === 'scrapeComplete') {
    const { newCount, scraped } = message;
    setStatus(`✓ Found ${scraped} listing${scraped !== 1 ? 's' : ''} — ${newCount} new added.`, 'success');
    btn.disabled = false;
  } else if (message.action === 'scrapeError') {
    setStatus(`⚠ ${message.message}`, 'error');
    btn.disabled = false;
  }
}

function setStatus(text, type = '') {
  const el = document.getElementById('scrape-status');
  el.textContent = text;
  el.className = 'scrape-status' + (type ? ` ${type}` : '');
}

// ── Render ─────────────────────────────────────────────────────────────────
function render() {
  const filterText = document.getElementById('filter-input').value.toLowerCase();
  const filterSource = document.getElementById('source-filter').value;

  const filtered = allJobs.filter(job => {
    const matchText = !filterText ||
      job.title.toLowerCase().includes(filterText) ||
      (job.company || '').toLowerCase().includes(filterText);
    const matchSource = !filterSource || job.source === filterSource;
    return matchText && matchSource;
  });

  document.getElementById('job-count').textContent =
    `${allJobs.length} saved${filtered.length !== allJobs.length ? ` (${filtered.length} shown)` : ''}`;

  const list = document.getElementById('jobs-list');
  const empty = document.getElementById('empty-msg');

  if (filtered.length === 0) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');
  list.innerHTML = filtered.map(job => jobItemHTML(job)).join('');

  // Bind delete buttons
  list.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      const { id } = btn.dataset;
      await chrome.runtime.sendMessage({ action: 'deleteJob', id });
      // Storage change listener will re-render automatically
    });
  });
}

function jobItemHTML(job) {
  const sourceClass = {
    LinkedIn:  'dot-linkedin',
    Indeed:    'dot-indeed',
    GitHub:    'dot-github',
    Google:    'dot-google',
    IBM:       'dot-ibm',
    Microsoft: 'dot-microsoft',
    Nvidia:    'dot-nvidia',
    AMD:       'dot-amd',
    Adobe:     'dot-adobe',
    Manual:    'dot-manual',
  }[job.source] || 'dot-other';

  const meta = [job.company, job.location].filter(Boolean).join(' · ');
  const safeTitle = escHtml(job.title);
  const safeMeta  = escHtml(meta);
  const safeId    = escHtml(job.id);

  return `
    <li class="job-item">
      <span class="job-source-dot ${sourceClass}" title="${escHtml(job.source)}"></span>
      <div class="job-info">
        <a class="job-title" href="${escHtml(job.url)}" target="_blank" title="${safeTitle}">${safeTitle}</a>
        ${meta ? `<span class="job-meta">${safeMeta}</span>` : ''}
      </div>
      <button class="btn-delete" data-id="${safeId}" title="Remove">✕</button>
    </li>`;
}

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
