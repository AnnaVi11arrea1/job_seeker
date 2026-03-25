// ── State ──────────────────────────────────────────────────────────────────
let allJobs = [];

// ── Init ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await loadJobs();
  await loadAISettings();
  bindEvents();

  if (window.location.hash === '#add') {
    document.getElementById('add-form-section').scrollIntoView({ behavior: 'smooth' });
    document.getElementById('f-title').focus();
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.jobs) {
      allJobs = changes.jobs.newValue || [];
      renderTable();
    }
  });

  document.getElementById('jobs-tbody').addEventListener('click', handleCellClick);
});

// ── Data ───────────────────────────────────────────────────────────────────
async function loadJobs() {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ action: 'getJobs' }, ({ jobs }) => {
      allJobs = jobs || [];
      renderTable();
      resolve();
    });
  });
}

async function loadAISettings() {
  return new Promise(resolve => {
    chrome.storage.local.get({ resume: '', ollamaUrl: 'http://localhost:11434', ollamaModel: 'llama3.2' }, data => {
      document.getElementById('resume-text').value  = data.resume;
      document.getElementById('ollama-url').value   = data.ollamaUrl;
      document.getElementById('ollama-model').value = data.ollamaModel;
      resolve();
    });
  });
}

// ── Events ─────────────────────────────────────────────────────────────────
function bindEvents() {
  document.getElementById('add-job-form').addEventListener('submit', handleAddJob);
  document.getElementById('filter-input').addEventListener('input', renderTable);
  document.getElementById('source-filter').addEventListener('change', renderTable);
  document.getElementById('sort-select').addEventListener('change', renderTable);
  document.getElementById('btn-export-csv').addEventListener('click', exportCSV);
  document.getElementById('btn-clear-all').addEventListener('click', () => {
    if (allJobs.length === 0) return;
    if (confirm(`Delete all ${allJobs.length} saved jobs? This cannot be undone.`)) {
      chrome.runtime.sendMessage({ action: 'clearJobs' });
    }
  });
  document.getElementById('btn-save-resume').addEventListener('click', saveResume);
  document.getElementById('btn-test-ollama').addEventListener('click', testOllamaConnection);
  document.getElementById('btn-analyze').addEventListener('click', analyzeAllJobs);
  document.getElementById('btn-test-one').addEventListener('click', testOneJob);
}

// ── Add Job ────────────────────────────────────────────────────────────────
async function handleAddJob(e) {
  e.preventDefault();
  const job = {
    title:       document.getElementById('f-title').value.trim(),
    company:     document.getElementById('f-company').value.trim(),
    location:    document.getElementById('f-location').value.trim(),
    source:      document.getElementById('f-source').value,
    url:         document.getElementById('f-url').value.trim(),
    description: document.getElementById('f-description').value.trim(),
    notes:       document.getElementById('f-notes').value.trim(),
  };
  chrome.runtime.sendMessage({ action: 'addJob', job }, response => {
    if (response?.duplicate) {
      setAddStatus('⚠ A job with this URL is already saved.', 'error');
    } else if (response?.success) {
      setAddStatus('✓ Job added!', 'success');
      document.getElementById('add-job-form').reset();
      setTimeout(() => setAddStatus('', ''), 3000);
    } else {
      setAddStatus('⚠ Could not save job.', 'error');
    }
  });
}

function setAddStatus(text, type) {
  const el = document.getElementById('add-status');
  el.textContent = text;
  el.className = 'add-status' + (type ? ` ${type}` : '');
}

// ── Resume & Ollama settings ───────────────────────────────────────────────
function saveResume() {
  const resume     = document.getElementById('resume-text').value.trim();
  const ollamaUrl  = document.getElementById('ollama-url').value.trim();
  const ollamaModel = document.getElementById('ollama-model').value.trim();
  chrome.storage.local.set({ resume, ollamaUrl, ollamaModel }, () => {
    const el = document.getElementById('resume-status');
    el.textContent = '✓ Saved';
    el.className = 'add-status success';
    setTimeout(() => { el.textContent = ''; el.className = 'add-status'; }, 2500);
  });
}

async function testOllamaConnection() {
  const url = document.getElementById('ollama-url').value.trim();
  const el  = document.getElementById('ollama-status');
  el.textContent = 'Connecting…';
  el.className   = 'add-status';
  try {
    const reply = await chrome.runtime.sendMessage({ action: 'ollamaTags', url });
    if (!reply.success) throw new Error(reply.error);
    const models = (reply.data.models || []).map(m => m.name).join(', ') || 'none found';
    el.textContent = `✓ Connected — models: ${models}`;
    el.className   = 'add-status success';
  } catch (err) {
    el.textContent = `✗ ${err.message} — is Ollama running?`;
    el.className   = 'add-status error';
  }
}

// ── Ollama Analysis ────────────────────────────────────────────────────────
async function analyzeAllJobs() {
  const resume = document.getElementById('resume-text').value.trim();
  if (!resume) {
    alert('Please paste your resume first, then save it.');
    return;
  }
  if (allJobs.length === 0) {
    alert('No jobs saved yet.');
    return;
  }

  const url   = document.getElementById('ollama-url').value.trim();
  const model = document.getElementById('ollama-model').value.trim();
  const btn   = document.getElementById('btn-analyze');
  const progress = document.getElementById('analyze-progress');
  const fill  = document.getElementById('progress-fill');
  const text  = document.getElementById('progress-text');

  btn.disabled = true;
  progress.classList.remove('hidden');

  const snapshot = [...allJobs];
  let done = 0;
  let errorCount = 0;
  let lastError = '';

  for (const job of snapshot) {
    text.textContent = `[${done + 1}/${snapshot.length}] Analyzing: ${job.title}…`;
    fill.style.width = `${Math.round((done / snapshot.length) * 100)}%`;

    try {
      const { matchScore, matchReason } = await analyzeJob(resume, job, url, model);
      const saved = await new Promise(res => chrome.runtime.sendMessage(
        { action: 'updateJob', id: job.id, updates: { matchScore, matchReason } }, res
      ));
      if (!saved?.success) {
        console.warn(`updateJob failed for "${job.title}" (id: ${job.id})`);
        errorCount++;
        lastError = `Job ID not found in storage: ${job.id.slice(0, 60)}`;
      }
    } catch (err) {
      errorCount++;
      lastError = err.message;
      console.error(`Ollama error for "${job.title}":`, err);
      text.textContent = `[${done + 1}/${snapshot.length}] ⚠ Error: ${err.message}`;
      await new Promise(r => setTimeout(r, 1500)); // pause so user can read it
    }

    done++;
    fill.style.width = `${Math.round((done / snapshot.length) * 100)}%`;
  }

  if (errorCount > 0) {
    text.textContent = `⚠ Finished with ${errorCount} error(s). Last: ${lastError}`;
  } else {
    text.textContent = `✓ Done! Analyzed ${done} jobs.`;
  }
  fill.style.width = '100%';
  btn.disabled = false;

  // Reload fresh data from storage so all scores are current before rendering
  await loadJobs();
  document.getElementById('sort-select').value = 'match';
  renderTable();
}

async function testOneJob() {
  const resume = document.getElementById('resume-text').value.trim();
  const url    = document.getElementById('ollama-url').value.trim();
  const model  = document.getElementById('ollama-model').value.trim();
  const text   = document.getElementById('progress-text');
  const progress = document.getElementById('analyze-progress');
  progress.classList.remove('hidden');

  const job = allJobs[0];
  if (!job) { text.textContent = '⚠ No jobs saved.'; return; }
  if (!resume) { text.textContent = '⚠ Paste your resume first.'; return; }

  text.textContent = `Testing on: "${job.title}"…`;
  try {
    const { matchScore, matchReason } = await analyzeJob(resume, job, url, model);
    const saved = await new Promise(res => chrome.runtime.sendMessage(
      { action: 'updateJob', id: job.id, updates: { matchScore, matchReason } }, res
    ));
    text.textContent = saved?.success
      ? `✓ "${job.title}" → ${'★'.repeat(matchScore)}${'☆'.repeat(5 - matchScore)} — ${matchReason}`
      : `⚠ Score returned (${matchScore}★) but save failed — job ID mismatch?`;
    await loadJobs();
    renderTable();
  } catch (err) {
    text.textContent = `✗ Error: ${err.message}`;
    console.error('Test job error:', err);
  }
}

// ── Ollama single-job analysis ─────────────────────────────────────────────
async function analyzeJob(resume, job, ollamaUrl, model) {
  const jobInfo = [
    `Job Title: ${job.title}`,
    job.company     ? `Company: ${job.company}`                         : '',
    job.location    ? `Location: ${job.location}`                       : '',
    job.description ? `\nJob Description:\n${job.description.slice(0, 3000)}` : '',
    job.notes       ? `\nNotes: ${job.notes}`                           : '',
  ].filter(Boolean).join('\n');

  const prompt =
`You are a technical recruiter evaluating resume-to-job fit. Compare the candidate's ACTUAL skills and experience against the job requirements.

CANDIDATE RESUME:
${resume.slice(0, 4000)}

JOB POSTING:
${jobInfo.slice(0, 2500)}

Instructions:
- Read the resume carefully. Note their programming languages, frameworks, tools, years of experience, and education.
- Read the job requirements. Note required skills, preferred skills, and experience level.
- Compare them directly. Do the candidate's skills actually appear in the job requirements?
- Be honest and strict. Do not give high ratings just because the job title sounds relevant.

Star rating:
5 = Candidate meets nearly all requirements; strong direct skill overlap
4 = Candidate meets most requirements; good skill overlap with minor gaps
3 = Candidate meets some requirements; noticeable skill gaps but transferable skills exist
2 = Candidate meets few requirements; significant skill gaps
1 = Candidate's skills do not align with this role

Reply with ONLY valid JSON (no markdown, no extra text):
{"stars": <integer 1-5>, "reason": "<one sentence citing specific matching or missing skills, max 20 words>"}`;

  const reply = await chrome.runtime.sendMessage({
    action: 'ollamaGenerate',
    url: ollamaUrl,
    model,
    prompt,
  });

  if (!reply.success) throw new Error(reply.error);

  const data = reply.response; // raw JSON string from Ollama
  let parsed;
  try {
    parsed = JSON.parse(data);
  } catch {
    const sm = data.match(/"stars"\s*:\s*([1-5])/) || data.match(/"score"\s*:\s*(\d+)/);
    const rm = data.match(/"reason"\s*:\s*"([^"]+)"/);
    parsed = { stars: sm ? parseInt(sm[1]) : 3, reason: rm ? rm[1] : '' };
  }

  let stars = parsed.stars ?? (parsed.score != null ? Math.round(parsed.score / 20) : 3);
  stars = Math.min(5, Math.max(1, Math.round(Number(stars) || 3)));

  return {
    matchScore:  stars,
    matchReason: String(parsed.reason || '').slice(0, 200),
  };
}

// ── Render ─────────────────────────────────────────────────────────────────
function renderTable() {
  const filterText   = document.getElementById('filter-input').value.toLowerCase();
  const filterSource = document.getElementById('source-filter').value;
  const sortVal      = document.getElementById('sort-select').value;

  let jobs = allJobs.filter(job => {
    const text = [job.title, job.company, job.location, job.notes, job.description].join(' ').toLowerCase();
    return (!filterText || text.includes(filterText)) &&
           (!filterSource || job.source === filterSource);
  });

  jobs = sortJobs(jobs, sortVal);

  document.getElementById('total-count').textContent =
    `${allJobs.length} job${allJobs.length !== 1 ? 's' : ''}` +
    (jobs.length !== allJobs.length ? ` (${jobs.length} shown)` : '');

  const tbody    = document.getElementById('jobs-tbody');
  const emptyMsg = document.getElementById('empty-msg');

  if (jobs.length === 0) {
    tbody.innerHTML = '';
    emptyMsg.classList.remove('hidden');
    return;
  }

  emptyMsg.classList.add('hidden');
  tbody.innerHTML = jobs.map(job => rowHTML(job)).join('');

  tbody.querySelectorAll('.btn-delete-row').forEach(btn => {
    btn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: 'deleteJob', id: btn.dataset.id });
    });
  });
}

function sortJobs(jobs, mode) {
  const copy = [...jobs];
  switch (mode) {
    case 'oldest':  return copy.sort((a, b) => (a.dateAdded || '').localeCompare(b.dateAdded || ''));
    case 'title':   return copy.sort((a, b) => a.title.localeCompare(b.title));
    case 'company': return copy.sort((a, b) => (a.company || '').localeCompare(b.company || ''));
    case 'match':   return copy.sort((a, b) => (b.matchScore ?? -1) - (a.matchScore ?? -1));
    default:        return copy.sort((a, b) => (b.dateAdded || '').localeCompare(a.dateAdded || ''));
  }
}

function scoreBadgeHTML(job) {
  if (job.matchScore == null) return '<span class="score-badge score-none" title="Not yet analyzed">☆☆☆☆☆</span>';
  const s   = Math.min(5, Math.max(1, Math.round(job.matchScore)));
  const cls = ['', 'score-1', 'score-2', 'score-3', 'score-4', 'score-5'][s];
  const stars = '★'.repeat(s) + '☆'.repeat(5 - s);
  const tip = esc(job.matchReason || '');
  return `<span class="score-badge ${cls}" title="${tip}">${stars}</span>`;
}

function rowHTML(job) {
  const srcClass = ({
    LinkedIn:  'source-linkedin',
    Indeed:    'source-indeed',
    GitHub:    'source-github',
    Google:    'source-google',
    IBM:       'source-ibm',
    Microsoft: 'source-microsoft',
    Nvidia:    'source-nvidia',
    AMD:       'source-amd',
    Adobe:     'source-adobe',
    Manual:    'source-manual',
  })[job.source] || 'source-other';

  const dateStr = job.dateAdded
    ? new Date(job.dateAdded).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' })
    : '';

  return `
    <tr data-job-id="${esc(job.id)}">
      <td>${scoreBadgeHTML(job)}</td>
      <td><a class="job-link" href="${esc(job.url)}" target="_blank">${esc(job.title)}</a></td>
      <td class="editable-cell" data-field="company"     data-job-id="${esc(job.id)}" title="Click to edit">${esc(job.company  || '')}<span class="edit-hint">✎</span></td>
      <td class="editable-cell" data-field="location"    data-job-id="${esc(job.id)}" title="Click to edit">${esc(job.location || '')}<span class="edit-hint">✎</span></td>
      <td><span class="source-badge ${srcClass}">${esc(job.source)}</span></td>
      <td class="date-cell">${dateStr}</td>
      <td class="editable-cell desc-cell" data-field="description" data-job-id="${esc(job.id)}" title="Click to edit description">${esc(job.description || '')}<span class="edit-hint">✎</span></td>
      <td class="editable-cell notes-cell" data-field="notes"      data-job-id="${esc(job.id)}" title="Click to edit">${esc(job.notes || '')}<span class="edit-hint">✎</span></td>
      <td style="text-align:right">
        <button class="btn-icon btn-delete-row" data-id="${esc(job.id)}" title="Delete">✕</button>
      </td>
    </tr>`;
}

// ── Inline cell editing ────────────────────────────────────────────────────
function handleCellClick(e) {
  const cell = e.target.closest('.editable-cell');
  if (!cell || cell.querySelector('input, textarea')) return;

  const { field, jobId } = cell.dataset;
  const isMultiline = field === 'notes' || field === 'description';
  const currentVal  = cell.childNodes[0]?.textContent?.trim() || '';

  const input = document.createElement(isMultiline ? 'textarea' : 'input');
  input.value     = currentVal;
  input.className = 'inline-edit';
  if (isMultiline) input.rows = 4;

  cell.innerHTML = '';
  cell.appendChild(input);
  input.focus();
  input.select();

  let saved = false;

  const save = () => {
    if (saved) return;
    saved = true;
    const newVal = input.value.trim();
    const job = allJobs.find(j => j.id === jobId);
    if (job) job[field] = newVal;
    chrome.runtime.sendMessage({ action: 'updateJob', id: jobId, updates: { [field]: newVal } });
    cell.innerHTML = esc(newVal) + '<span class="edit-hint">✎</span>';
  };

  const cancel = () => {
    if (saved) return;
    saved = true;
    cell.innerHTML = esc(currentVal) + '<span class="edit-hint">✎</span>';
  };

  input.addEventListener('blur', save);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') { saved = true; input.removeEventListener('blur', save); cancel(); }
  });
}

// ── Export CSV ─────────────────────────────────────────────────────────────
function exportCSV() {
  if (allJobs.length === 0) { alert('No jobs to export.'); return; }

  const headers = ['Match Score', 'Match Reason', 'Title', 'Company', 'Location', 'Source', 'URL', 'Date Added', 'Description', 'Notes'];
  const rows = allJobs.map(j => [
    j.matchScore ?? '', j.matchReason || '', j.title, j.company, j.location,
    j.source, j.url, j.dateAdded, j.description || '', j.notes || ''
  ].map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','));

  const csv  = [headers.join(','), ...rows].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `job-seeker-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Utility ────────────────────────────────────────────────────────────────
function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

