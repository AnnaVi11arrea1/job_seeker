// Injected into job listing pages to extract jobs.
// Supports: LinkedIn, Indeed, GitHub Careers, Google Careers, IBM,
//           Microsoft, Nvidia/AMD/Adobe (Workday).

(function jobSeeperScraper() {
  const host = window.location.hostname;
  const path = window.location.pathname;
  let jobs = [];

  if (host.includes('linkedin.com')) {
    jobs = scrapeLinkedIn();
  } else if (host.includes('indeed.com')) {
    jobs = scrapeIndeed();
  } else if (host.includes('github.careers')) {
    jobs = scrapeGitHub();
  } else if (host.includes('careers.google.com')) {
    jobs = scrapeGoogle();
  } else if (host.includes('careers.microsoft.com')) {
    jobs = scrapeMicrosoft();
  } else if (host.includes('careers.ibm.com')) {
    jobs = scrapeIBM();
  } else if (host.includes('myworkdayjobs.com')) {
    jobs = scrapeWorkday();
  } else if (host.includes('careers.amd.com')) {
    jobs = scrapeWorkday();
  } else if (host.includes('careers.adobe.com')) {
    jobs = scrapeAdobe();
  } else {
    chrome.runtime.sendMessage({
      action: 'scrapeError',
      message: 'Not a supported job site. Navigate to LinkedIn, Indeed, or a company career page (GitHub, Google, IBM, Microsoft, Nvidia, AMD, Adobe).',
    });
    return;
  }

  if (jobs.length === 0) {
    chrome.runtime.sendMessage({ action: 'scrapeError', message: 'No job listings found on this page. Try scrolling down to load more results first.' });
    return;
  }

  chrome.runtime.sendMessage({ action: 'saveJobs', jobs }, response => {
    chrome.runtime.sendMessage({
      action: 'scrapeComplete',
      newCount: response?.newCount ?? 0,
      total: response?.total ?? 0,
      scraped: jobs.length
    });
  });

  // ── Helpers ───────────────────────────────────────────────────────────────
  function firstText(el, ...selectors) {
    for (const s of selectors) {
      const found = el.querySelector(s);
      if (found?.textContent?.trim()) return found.textContent.trim();
    }
    return '';
  }

  function firstHref(el, ...selectors) {
    for (const s of selectors) {
      const found = el.querySelector(s);
      if (found?.href) return found.href;
    }
    return '';
  }

  function makeAbsolute(url, base) {
    if (!url) return '';
    try { return new URL(url, base).href; } catch (_) { return url; }
  }

  function cleanUrl(url) {
    try {
      const u = new URL(url);
      return u.origin + u.pathname;
    } catch (_) { return url; }
  }

  // Extract description text from the current page using site-aware selectors.
  function getPageDescription(extraSelectors = []) {
    const selectors = [
      ...extraSelectors,
      // LinkedIn detail
      '.jobs-description__content',
      '.jobs-box__html-content',
      '.job-details-jobs-unified-top-card__job-insight',
      // Indeed detail
      '#jobDescriptionText',
      '.jobsearch-jobDescriptionText',
      // Workday detail
      '[data-automation-id="jobPostingDescription"]',
      // Google
      '.gc-job-detail',
      // Microsoft
      '.job-detail-description',
      '[class*="jobDescription"]',
      // Greenhouse / GitHub
      '#content .section-wrapper',
      // Generic
      '[id*="job-description"]',
      '[class*="job-description"]',
      'main article',
      'article',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      const text = el?.innerText?.trim();
      if (text && text.length > 150) return text.slice(0, 6000);
    }
    return '';
  }

  // Extract any description snippet visible inside a list-item card.
  function getCardDescription(card) {
    const snippetSelectors = [
      '.job-search-card__snippet',          // LinkedIn
      '[data-testid="job-snippet"]',         // Indeed
      '.snippet',
      '[class*="snippet"]',
      '[class*="description"]',
      'p',
    ];
    for (const sel of snippetSelectors) {
      const el = card.querySelector(sel);
      const text = el?.innerText?.trim();
      if (text && text.length > 30) return text.slice(0, 1000);
    }
    return '';
  }

  // ── LinkedIn ──────────────────────────────────────────────────────────────
  function scrapeLinkedIn() {
    // Detail page: /jobs/view/12345678/
    if (/\/jobs\/view\/\d+/.test(path)) {
      return scrapeLinkedInDetailPage();
    }
    const results = [];
    const cardSelectors = [
      '.job-search-card',
      '.jobs-search-results__list-item',
      'li.occludable-update',
      '.scaffold-layout__list-item',
    ];
    let cards = [];
    for (const sel of cardSelectors) {
      const found = document.querySelectorAll(sel);
      if (found.length > 0) { cards = found; break; }
    }

    // The right-hand detail panel may have a description visible for the selected job.
    const panelDescription = getPageDescription([
      '.jobs-description__content',
      '.jobs-box__html-content',
    ]);

    // Which job card is currently selected/active?
    const activeCardSelectors = [
      '.job-search-card--active',
      '.jobs-search-results__list-item--active',
      'li.occludable-update.active',
    ];
    let activeCardIndex = -1;

    cards.forEach((card, i) => {
      try {
        const title = firstText(card,
          '.job-search-card__title', '.job-card-list__title', '.job-card-container__link');
        let url = firstHref(card,
          'a.job-search-card__title-link', 'a.job-card-list__title', 'a[href*="/jobs/view/"]');
        if (!title || !url) return;
        url = cleanUrl(url);

        // Check if this card is the active/selected one
        const isActive = activeCardSelectors.some(sel => card.matches(sel) || card.closest(sel));
        if (isActive) activeCardIndex = i;

        const cardDesc = getCardDescription(card);
        results.push({
          id: url, title,
          company:     firstText(card, '.job-search-card__subtitle-link', '.job-search-card__subtitle', '.job-card-container__primary-description'),
          location:    firstText(card, '.job-search-card__location', '.job-card-container__metadata-item'),
          description: cardDesc,
          url, source: 'LinkedIn', dateAdded: new Date().toISOString(),
        });
      } catch (_) {}
    });

    // Attach the panel description to the active card
    if (panelDescription && results.length > 0) {
      const target = activeCardIndex >= 0 ? results[activeCardIndex] : results[0];
      if (!target.description || target.description.length < panelDescription.length) {
        target.description = panelDescription;
      }
    }

    return results;
  }

  function scrapeLinkedInDetailPage() {
    const title    = firstText(document, 'h1.job-title', 'h1[class*="title"]', '.job-details-jobs-unified-top-card__job-title h1', 'h1');
    const company  = firstText(document, '.job-details-jobs-unified-top-card__company-name', '.topcard__org-name-link', '.topcard__flavor');
    const location = firstText(document, '.job-details-jobs-unified-top-card__bullet', '.topcard__flavor--bullet');
    const description = getPageDescription(['.jobs-description__content', '.jobs-box__html-content']);
    const url = cleanUrl(window.location.href);
    if (!title || !url) return [];
    return [{ id: url, title, company, location, description, url, source: 'LinkedIn', dateAdded: new Date().toISOString() }];
  }

  // ── Indeed ────────────────────────────────────────────────────────────────
  function scrapeIndeed() {
    // Detail/apply page
    if (path.includes('/viewjob') || path.includes('/rc/clk') || document.querySelector('#jobDescriptionText')) {
      return scrapeIndeedDetailPage();
    }
    const results = [];
    const cardSelectors = ['.job_seen_beacon', '[data-testid="slider_item"]', '.tapItem', '.jobsearch-ResultsList > li[class]'];
    let cards = [];
    for (const sel of cardSelectors) {
      const found = document.querySelectorAll(sel);
      if (found.length > 0) { cards = found; break; }
    }

    // Right-panel description for the selected job
    const panelDescription = getPageDescription(['#jobDescriptionText', '.jobsearch-jobDescriptionText']);

    cards.forEach((card, i) => {
      try {
        const title = firstText(card,
          '[data-testid="jobTitle"] span', 'h2.jobTitle span', 'h2[class*="jobTitle"] span');
        let url = firstHref(card,
          '[data-testid="jobTitle"] a', 'h2.jobTitle a', 'a[data-jk]', 'a[id^="job_"]');
        if (!title || !url) return;
        if (!url.startsWith('http')) url = 'https://www.indeed.com' + url;

        const isActive = card.classList.contains('resultWithShelf') || card.getAttribute('data-resultid') !== null;
        const cardDesc = getCardDescription(card);
        results.push({
          id: url, title,
          company:     firstText(card, '[data-testid="company-name"]', 'span.companyName', '.companyName'),
          location:    firstText(card, '[data-testid="text-track-click-origin"]', '.companyLocation'),
          description: i === 0 && panelDescription ? panelDescription : cardDesc,
          url, source: 'Indeed', dateAdded: new Date().toISOString(),
        });
      } catch (_) {}
    });
    return results;
  }

  function scrapeIndeedDetailPage() {
    const title    = firstText(document, '[data-testid="jobsearch-JobInfoHeader-title"]', 'h1.jobsearch-JobInfoHeader-title', 'h1');
    const company  = firstText(document, '[data-testid="inlineHeader-companyName"]', '.jobsearch-InlineCompanyRating-companyHeader', '[class*="companyName"]');
    const location = firstText(document, '[data-testid="job-location"]', '.jobsearch-JobInfoHeader-subtitle > div:last-child');
    const description = getPageDescription(['#jobDescriptionText', '.jobsearch-jobDescriptionText']);
    const url = cleanUrl(window.location.href);
    if (!title) return [];
    return [{ id: url, title, company, location, description, url, source: 'Indeed', dateAdded: new Date().toISOString() }];
  }

  // ── GitHub Careers (Greenhouse ATS) ───────────────────────────────────────
  function scrapeGitHub() {
    // Detail page: has a description section
    const descEl = document.querySelector('#content .section-wrapper, .job__description');
    if (descEl && descEl.innerText.length > 150) {
      const title    = firstText(document, 'h1.job__title', 'h1', '.job-title');
      const location = firstText(document, '.job__location', '.location');
      const description = descEl.innerText.trim().slice(0, 6000);
      const url = cleanUrl(window.location.href);
      if (title) return [{ id: url, title, company: 'GitHub', location, description, url, source: 'GitHub', dateAdded: new Date().toISOString() }];
    }

    const results = [];
    const items = document.querySelectorAll('div.opening, .job-post, li[class*="job"]');
    items.forEach(item => {
      try {
        const linkEl = item.querySelector('a[href]');
        if (!linkEl) return;
        const title = linkEl.textContent.trim();
        let url = makeAbsolute(linkEl.getAttribute('href'), window.location.href);
        const location = firstText(item, '.location', 'span[class*="location"]', '.job-location');
        if (!title || !url) return;
        results.push({ id: url, title, company: 'GitHub', location, description: '', url, source: 'GitHub', dateAdded: new Date().toISOString() });
      } catch (_) {}
    });
    return results;
  }

  // ── Google Careers ────────────────────────────────────────────────────────
  function scrapeGoogle() {
    // Detail page
    const descEl = document.querySelector('.gc-job-detail, [class*="jobDetailContent"]');
    if (descEl && descEl.innerText.length > 150) {
      const title    = firstText(document, 'h2.p-hd', 'h1', '[class*="title"]');
      const location = firstText(document, '[class*="location"]');
      const description = descEl.innerText.trim().slice(0, 6000);
      const url = cleanUrl(window.location.href);
      if (title) return [{ id: url, title, company: 'Google', location, description, url, source: 'Google', dateAdded: new Date().toISOString() }];
    }

    const results = [];
    const cardSelectors = ['li[jsmodel]', 'li[class*="lLd3Je"]', '[data-dobid="hdp"]', '.jtDqE'];
    let cards = [];
    for (const sel of cardSelectors) {
      const found = document.querySelectorAll(sel);
      if (found.length > 0) { cards = found; break; }
    }
    if (cards.length === 0) {
      document.querySelectorAll('a[href*="/jobs/results/"]').forEach(a => {
        try {
          const title = a.textContent.trim() || a.getAttribute('aria-label') || '';
          const url = a.href;
          if (title && url) results.push({ id: url, title, company: 'Google', location: '', description: '', url, source: 'Google', dateAdded: new Date().toISOString() });
        } catch (_) {}
      });
      return results;
    }
    cards.forEach(card => {
      try {
        const linkEl = card.querySelector('a[href*="/jobs/results/"]');
        const title = firstText(card, 'h3', 'h2', '[class*="title"]') || linkEl?.textContent?.trim();
        const url = linkEl?.href;
        if (!title || !url) return;
        const location = firstText(card, '[class*="location"]', '[class*="subtitle"]');
        results.push({ id: url, title, company: 'Google', location, description: getCardDescription(card), url, source: 'Google', dateAdded: new Date().toISOString() });
      } catch (_) {}
    });
    return results;
  }

  // ── Microsoft Careers ─────────────────────────────────────────────────────
  function scrapeMicrosoft() {
    // Detail page
    const descEl = document.querySelector('.job-detail-description, [class*="jobDescription"]');
    if (descEl && descEl.innerText.length > 150) {
      const title    = firstText(document, 'h1', '[data-automation="job-title"]');
      const location = firstText(document, '[data-automation="job-location"]', '[class*="location"]');
      const description = descEl.innerText.trim().slice(0, 6000);
      const url = cleanUrl(window.location.href);
      if (title) return [{ id: url, title, company: 'Microsoft', location, description, url, source: 'Microsoft', dateAdded: new Date().toISOString() }];
    }

    const results = [];
    const cardSelectors = ['[data-automation="job-list-item"]', '[class*="ms-List-cell"]', 'li[role="listitem"]'];
    let cards = [];
    for (const sel of cardSelectors) {
      const found = document.querySelectorAll(sel);
      if (found.length > 0) { cards = found; break; }
    }
    cards.forEach(card => {
      try {
        const title = firstText(card, '[data-automation="job-title"]', 'h2', 'h3', 'a');
        const linkEl = card.querySelector('a[href]');
        let url = makeAbsolute(linkEl?.getAttribute('href'), window.location.href);
        if (!title || !url) return;
        const location = firstText(card, '[data-automation="job-location"]', '[class*="location"]');
        results.push({ id: url, title, company: 'Microsoft', location, description: getCardDescription(card), url, source: 'Microsoft', dateAdded: new Date().toISOString() });
      } catch (_) {}
    });
    return results;
  }

  // ── IBM Careers ───────────────────────────────────────────────────────────
  function scrapeIBM() {
    // Detail page
    const descEl = document.querySelector('[class*="jobDescription"], [class*="job-description"], .bx--content');
    if (descEl && descEl.innerText.length > 150 && !document.querySelectorAll('[class*="jobTile"]').length) {
      const title    = firstText(document, 'h1', '[class*="jobTitle"]');
      const location = firstText(document, '[class*="location"]', '[class*="city"]');
      const description = descEl.innerText.trim().slice(0, 6000);
      const url = cleanUrl(window.location.href);
      if (title) return [{ id: url, title, company: 'IBM', location, description, url, source: 'IBM', dateAdded: new Date().toISOString() }];
    }

    const results = [];
    const cardSelectors = ['[class*="jobTile"]', '[class*="job-tile"]', '.bx--tile', 'article[class*="job"]', 'li[class*="job"]'];
    let cards = [];
    for (const sel of cardSelectors) {
      const found = document.querySelectorAll(sel);
      if (found.length > 0) { cards = found; break; }
    }
    if (cards.length === 0) {
      document.querySelectorAll('a[href*="/job/"]').forEach(a => {
        try {
          const title = a.textContent.trim();
          const url = makeAbsolute(a.getAttribute('href'), window.location.href);
          if (title && url) results.push({ id: url, title, company: 'IBM', location: '', description: '', url, source: 'IBM', dateAdded: new Date().toISOString() });
        } catch (_) {}
      });
      return results;
    }
    cards.forEach(card => {
      try {
        const linkEl = card.querySelector('a[href]');
        const title = firstText(card, 'h3', 'h4', '[class*="title"]') || linkEl?.textContent?.trim();
        const url = makeAbsolute(linkEl?.getAttribute('href'), window.location.href);
        if (!title || !url) return;
        const location = firstText(card, '[class*="location"]', '[class*="city"]');
        results.push({ id: url, title, company: 'IBM', location, description: getCardDescription(card), url, source: 'IBM', dateAdded: new Date().toISOString() });
      } catch (_) {}
    });
    return results;
  }

  // ── Workday (Nvidia, AMD, and other Workday-based career sites) ───────────
  function scrapeWorkday() {
    const h = window.location.hostname;
    const company = h.includes('nvidia') ? 'Nvidia'
      : h.includes('amd') ? 'AMD'
      : h.includes('adobe') ? 'Adobe'
      : h.split('.')[0].replace(/^\w/, c => c.toUpperCase());

    // Detail page
    const descEl = document.querySelector('[data-automation-id="jobPostingDescription"]');
    if (descEl && descEl.innerText.length > 150) {
      const title    = firstText(document, '[data-automation-id="jobPostingHeader"] h1', 'h1');
      const location = firstText(document, '[data-automation-id="jobPostingLocation"]', '[data-automation-id="location"]');
      const description = descEl.innerText.trim().slice(0, 6000);
      const url = cleanUrl(window.location.href);
      if (title) return [{ id: url, title, company, location, description, url, source: company, dateAdded: new Date().toISOString() }];
    }

    const results = [];
    const cardSelectors = [
      '[data-automation-id="jobResults"] li',
      'li[class*="WGMF"]',
      '[class*="jobResult"]',
      'ul[aria-label*="job"] li',
    ];
    let cards = [];
    for (const sel of cardSelectors) {
      const found = document.querySelectorAll(sel);
      if (found.length > 0) { cards = found; break; }
    }
    cards.forEach(card => {
      try {
        const titleEl = card.querySelector('[data-automation-id="jobTitle"], a[data-automation-id="jobTitle"]');
        const title = titleEl?.textContent?.trim();
        let url = titleEl?.href || firstHref(card, 'a[href]');
        if (!title || !url) return;
        url = makeAbsolute(url, window.location.href);
        const location = firstText(card, '[data-automation-id="jobPostingLocation"]', '[data-automation-id="location"]', '[class*="location"]');
        results.push({ id: url, title, company, location, description: '', url, source: company, dateAdded: new Date().toISOString() });
      } catch (_) {}
    });
    return results;
  }
  // ── AMD Careers (Angular Material accordion) ──────────────────────────────
  function scrapeAMD() {
    const descEl = document.querySelector('[data-automation-id="jobPostingDescription"], .job-description, [class*="jobDescription"]');
    if (descEl && descEl.innerText.length > 150) {
      const title       = firstText(document, 'h1', 'mat-panel-title', '[class*="title"]');
      const location    = firstText(document, '[data-automation-id="jobPostingLocation"]', '[class*="location"]');
      const description = descEl.innerText.trim().slice(0, 6000);
      const url         = cleanUrl(window.location.href);
      if (title) return [{ id: url, title, company: 'AMD', location, description, url, source: 'AMD', dateAdded: new Date().toISOString() }];
    }
    const results = [];

    // Primary: target the exact job title link AMD renders in each panel
    const titleLinks = document.querySelectorAll('a.job-title-link[href]');
    titleLinks.forEach(a => {
      try {
        const title  = a.textContent.trim();
        const url    = makeAbsolute(a.getAttribute('href'), 'https://careers.amd.com');
        if (!title || !url) return;

        // Location lives in the same mat-expansion-panel-header
        const header   = a.closest('mat-expansion-panel-header') || a.closest('mat-expansion-panel');
        const location = header ? firstText(header, 'mat-panel-description', '[class*="location"]', '[class*="subtitle"]') : '';

        results.push({ id: cleanUrl(url), title, company: 'AMD', location, description: '', url: cleanUrl(url), source: 'AMD', dateAdded: new Date().toISOString() });
      } catch (_) {}
    });

    // Fallback: mat-expansion-panel-header with any anchor
    if (results.length === 0) {
      document.querySelectorAll('mat-expansion-panel-header').forEach(panel => {
        try {
          const anchor = panel.querySelector('a[href]') || panel.closest('mat-expansion-panel')?.querySelector('a[href]');
          const title  = anchor?.textContent?.trim() || firstText(panel, 'mat-panel-title', 'span');
          const url    = anchor ? makeAbsolute(anchor.getAttribute('href'), 'https://careers.amd.com') : '';
          if (!title || !url) return;
          const location = firstText(panel, 'mat-panel-description', '[class*="location"]');
          results.push({ id: cleanUrl(url), title, company: 'AMD', location, description: '', url: cleanUrl(url), source: 'AMD', dateAdded: new Date().toISOString() });
        } catch (_) {}
      });
    }

    // Last-resort: any /careers-home/jobs/ link
    if (results.length === 0) {
      document.querySelectorAll('a[href*="/careers-home/jobs/"]').forEach(a => {
        try {
          const title = a.textContent.trim();
          const url   = cleanUrl(makeAbsolute(a.getAttribute('href'), 'https://careers.amd.com'));
          if (title && url && title.length > 3)
            results.push({ id: url, title, company: 'AMD', location: '', description: '', url, source: 'AMD', dateAdded: new Date().toISOString() });
        } catch (_) {}
      });
    }
    return results;
  }


  // ── Adobe Careers ─────────────────────────────────────────────────────────
  function scrapeAdobe() {
    const results = [];
    const cardSelectors = ['[data-ph-at-id="job-item"]', '.job-list-item', 'li[class*="job"]', 'article[class*="job"]'];
    let cards = [];
    for (const sel of cardSelectors) {
      const found = document.querySelectorAll(sel);
      if (found.length > 0) { cards = found; break; }
    }
    if (cards.length === 0) return scrapeWorkday();

    cards.forEach(card => {
      try {
        const linkEl = card.querySelector('a[href]');
        const title = firstText(card, '[data-ph-at-id="job-title"]', 'h3', 'h4', 'a') || linkEl?.textContent?.trim();
        const url = makeAbsolute(linkEl?.getAttribute('href'), window.location.href);
        if (!title || !url) return;
        const location = firstText(card, '[data-ph-at-id="job-location"]', '[class*="location"]');
        results.push({ id: url, title, company: 'Adobe', location, description: getCardDescription(card), url, source: 'Adobe', dateAdded: new Date().toISOString() });
      } catch (_) {}
    });
    return results;
  }

})();
