function detectCurrentPage() {
  const pathname = location.pathname || '';
  const pageKind = wantsPageKind(pathname);
  const wantListId = extractWantListId(location.href);
  const rowCandidates = document.querySelectorAll('input[data-id-want], input[name="checkWantsRow[]"][data-id-want]').length;

  return {
    title: document.title,
    href: location.href,
    pathname,
    pageKind,
    supported: pageKind === 'wants-detail',
    wantListId,
    visibleRowCandidates: rowCandidates,
  };

  function wantsPageKind(currentPath) {
    if (/\/Wants\/(?:EditWantsList\/|Show\/)?\d+(?:[/?#]|$)/i.test(currentPath)) return 'wants-detail';
    if (/\/Wants(?:[/?#]|$)/i.test(currentPath)) return 'wants-overview';
    return 'other-cardmarket';
  }

  function extractWantListId(href) {
    const patterns = [
      /\/Wants\/(?:EditWantsList\/|Show\/)?(\d+)(?:[/?#]|$)/i,
      /[?&]idWantsList=(\d+)/i,
    ];
    for (const pattern of patterns) {
      const match = href.match(pattern);
      if (match) return match[1];
    }
    return '';
  }
}

function injectedFetchAvailableWantListsFromCardmarket() {
  const textOf = (value) => String(value || '').trim().replace(/\s+/g, ' ');
  const extractWantListId = (href) => {
    const patterns = [
      /\/Wants\/(?:EditWantsList\/|Show\/)?(\d+)(?:[/?#]|$)/i,
      /[?&]idWantsList=(\d+)/i,
    ];
    for (const pattern of patterns) {
      const match = String(href || '').match(pattern);
      if (match) return match[1];
    }
    return '';
  };

  const pathParts = location.pathname.split('/').filter(Boolean);
  const lang = pathParts[0] || 'en';
  const game = pathParts[1] || 'Magic';
  const pageWantListId = extractWantListId(location.href);

  return fetch(`/${lang}/${game}/Wants`, { credentials: 'include' })
    .then(async (overviewResponse) => {
      if (!overviewResponse.ok) {
        throw new Error(`Could not load Cardmarket wants overview. HTTP ${overviewResponse.status}.`);
      }

      const overviewHtml = await overviewResponse.text();
      const overviewDoc = new DOMParser().parseFromString(overviewHtml, 'text/html');
      const results = [];
      const seenIds = new Set();

      overviewDoc.querySelectorAll('a[href], button[onclick], [data-url], [data-href], option[value], [data-id-wants-list], [data-wants-list-id]').forEach((node) => {
        const candidates = [
          node.getAttribute('href') || '',
          node.getAttribute('onclick') || '',
          node.getAttribute('data-url') || '',
          node.getAttribute('data-href') || '',
          node.getAttribute('value') || '',
          node.getAttribute('data-id-wants-list') || '',
          node.getAttribute('data-wants-list-id') || '',
        ];
        const id = candidates.map((value) => extractWantListId(value)).find(Boolean);
        if (!id || seenIds.has(id)) return;

        seenIds.add(id);
        const rawPath = candidates.find((value) => extractWantListId(value) === id) || '';
        results.push({
          id,
          name: extractWantListName(node, id),
          path: normalizeWantListPath(rawPath),
        });
      });

      if (!results.length) {
        const regex = /(?:\/Wants\/(?:EditWantsList\/|Show\/)?|[?&]idWantsList=)(\d+)/gi;
        let match;
        while ((match = regex.exec(overviewHtml)) !== null) {
          const id = match[1];
          if (!id || seenIds.has(id)) continue;
          seenIds.add(id);
          results.push({
            id,
            name: `Want list ${id}`,
            path: `/${lang}/${game}/Wants/${id}`,
          });
        }
      }

      if (pageWantListId && !seenIds.has(pageWantListId)) {
        results.unshift({
          id: pageWantListId,
          name: extractCurrentWantListName() || `Want list ${pageWantListId}`,
          path: normalizeWantListPath(location.href) || `/${lang}/${game}/Wants/${pageWantListId}`,
        });
      }

      if (!results.length) {
        console.warn('[Cardmarket Wants Optimizer] No want lists found in overview HTML sample:', overviewHtml.slice(0, 2000));
      }

      return {
        pageWantListId,
        wantLists: results,
      };
    });

  function extractWantListName(node, id) {
    const ownText = sanitizeWantListName(node.textContent, id);
    if (ownText && !new RegExp(`^${id}$`).test(ownText)) return ownText;

    const heading = node.closest('tr, li, article, .row, .item, .accordion-item, .panel, .card, .list-group-item')
      ?.querySelector('.card-title, h1, h2, h3, h4, strong, .fw-bold, .font-weight-bold');
    const headingText = sanitizeWantListName(heading?.textContent || '', id);
    if (headingText) return headingText;

    const container = node.closest('tr, li, article, .row, .item, .accordion-item, .panel, .card, .list-group-item');
    const containerText = sanitizeWantListName(container?.textContent || '', id);
    if (containerText) {
      const cleaned = containerText.split(id).join(' ').replace(/\s+/g, ' ').trim();
      if (cleaned) return cleaned.slice(0, 120);
    }

    const labelled = sanitizeWantListName(
      node.getAttribute('aria-label')
      || node.getAttribute('title')
      || node.getAttribute('data-bs-title')
      || node.getAttribute('data-original-title'),
      id
    );
    return labelled || `Want list ${id}`;
  }

  function sanitizeWantListName(value, id) {
    const normalizedId = String(id || '').trim();
    let cleaned = textOf(value);
    if (!cleaned) return '';
    cleaned = cleaned
      .replace(/\bView\s*\/??\s*Edit\s*List\b.*$/i, '')
      .replace(/\bView\b.*$/i, '')
      .replace(/\bEdit\s*List\b.*$/i, '')
      .replace(/\s+Wants\s*\(\d+\s*cards?\)\s*$/i, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (normalizedId) {
      cleaned = cleaned.replace(new RegExp(`\\b${normalizedId}\\b`, 'g'), '').replace(/\s+/g, ' ').trim();
    }
    return cleaned;
  }

  function extractCurrentWantListName() {
    const candidates = [
      document.querySelector('h1'),
      document.querySelector('.page-title'),
      document.querySelector('.title-container h1, .title-container h2'),
      document.querySelector('[data-wants-list-name]'),
    ];
    const name = candidates.map((node) => textOf(node?.textContent || node?.getAttribute?.('data-wants-list-name') || '')).find(Boolean);
    return name || '';
  }

  function normalizeWantListPath(value) {
    if (!value) return '';

    try {
      const parsed = new URL(value, location.origin);
      if (parsed.origin !== location.origin) return '';
      if (!extractWantListId(parsed.href)) return '';
      parsed.hash = '';
      parsed.searchParams.delete('site');
      return `${parsed.pathname}${parsed.search}`;
    } catch {
      return '';
    }
  }
}

async function injectedLoadWantListItemsById({ wantListId, wantListName, wantListPath, previewLimit }) {
  const textOf = (value) => String(value || '').trim().replace(/\s+/g, ' ');
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const extractWantListId = (href) => {
    const patterns = [
      /\/Wants\/(?:EditWantsList\/|Show\/)?(\d+)(?:[/?#]|$)/i,
      /[?&]idWantsList=(\d+)/i,
    ];
    for (const pattern of patterns) {
      const match = String(href || '').match(pattern);
      if (match) return match[1];
    }
    return '';
  };
  const parseContext = (urlValue) => {
    const parsed = new URL(urlValue, location.origin);
    const pathParts = parsed.pathname.split('/').filter(Boolean);
    return {
      lang: pathParts[0] || 'en',
      game: pathParts[1] || 'Magic',
    };
  };
  const { lang, game } = parseContext(location.href);
  const normalizedWantListId = textOf(wantListId);
  if (!normalizedWantListId) {
    throw new Error('Missing want list id. Wait for auto-detection, then choose one again.');
  }

  const aggregatedItems = [];
  const seenKeys = new Set();
  let pagesScanned = 0;
  let parserSource = 'fetched-pages';
  let previousPageSignature = '';
  let username = detectCurrentUsernameLocal(document);
  const normalizedWantListPath = normalizeWantListPathLocal(wantListPath);

  for (let page = 1; page <= 100; page += 1) {
    const urlCandidates = buildWantListPageCandidatesLocal({
      lang,
      game,
      normalizedWantListId,
      wantListPath: normalizedWantListPath,
      page,
    });

    let html = '';
    let responseUrl = '';
    for (const candidate of urlCandidates) {
      const response = await fetch(candidate, { credentials: 'include' });
      if (response.status === 429) {
        await sleep(10000);
        continue;
      }
      if (!response.ok) continue;

      const candidateHtml = await response.text();
      if (!/checkWantsRow|data-id-want|MobileWantsList|WantsListTable|want-name|item-body-wrapper|article-row|productInfo/i.test(candidateHtml)) continue;
      html = candidateHtml;
      responseUrl = candidate;
      break;
    }

    if (!html) break;

    const doc = new DOMParser().parseFromString(html, 'text/html');
    username = username || detectCurrentUsernameLocal(doc);
    const parsed = parseWantItemsFromDocumentLocal(doc, `${location.origin}${responseUrl}`);
    const pageSignature = parsed.items.map((item) => buildWantListItemKeyLocal(item)).join('|');
    parserSource = parsed.debug.source || parserSource;
    if (!parsed.items.length || (page > 1 && pageSignature && pageSignature === previousPageSignature)) {
      break;
    }
    previousPageSignature = pageSignature;
    pagesScanned += 1;

    parsed.items.forEach((item) => {
      const key = buildWantListItemKeyLocal(item);
      if (seenKeys.has(key)) return;
      seenKeys.add(key);
      aggregatedItems.push(item);
    });

    const hasNextPage = !!doc.querySelector(`a[href*="site=${page + 1}"], a[href$="/${page + 1}"], .pagination a[rel="next"]`);
    if (!hasNextPage) break;
  }

  return {
    kind: 'selected-want-list',
    wantListId: normalizedWantListId,
    wantListName: textOf(wantListName) || `Want list ${normalizedWantListId}`,
    username,
    totalVisible: aggregatedItems.length,
    pagesScanned,
    items: aggregatedItems,
    debug: {
      source: parserSource,
      parsedItems: aggregatedItems.length,
      previewLimit: previewLimit || 8,
    },
  };

  function buildWantListItemKeyLocal(item) {
    if (textOf(item?.idWant)) return `want-${textOf(item.idWant)}`;
    if (textOf(item?.idProduct)) return `product-${textOf(item.idProduct)}-${textOf(item?.quantity)}`;
    return `name-${textOf(item?.productName)}-${textOf(item?.quantity)}`;
  }

  function normalizeWantListPathLocal(value) {
    if (!value) return '';

    try {
      const parsed = new URL(value, location.origin);
      if (parsed.origin !== location.origin) return '';
      if (extractWantListId(parsed.href) !== normalizedWantListId) return '';
      parsed.hash = '';
      parsed.searchParams.delete('site');
      return `${parsed.pathname}${parsed.search}`;
    } catch {
      return '';
    }
  }

  function buildWantListPageCandidatesLocal({ lang, game, normalizedWantListId, wantListPath, page }) {
    const candidates = [];
    const seen = new Set();

    const addCandidate = (value) => {
      const normalized = textOf(value);
      if (!normalized || seen.has(normalized)) return;
      seen.add(normalized);
      candidates.push(normalized);
    };

    if (wantListPath) {
      try {
        const parsed = new URL(wantListPath, location.origin);
        parsed.hash = '';
        if (page <= 1) {
          parsed.searchParams.delete('site');
        } else {
          parsed.searchParams.set('site', String(page));
        }
        addCandidate(`${parsed.pathname}${parsed.search}`);
      } catch {
        addCandidate(wantListPath);
      }
    }

    addCandidate(`/${lang}/${game}/Wants/${normalizedWantListId}${page > 1 ? `?site=${page}` : ''}`);
    addCandidate(`/${lang}/${game}/Wants/${normalizedWantListId}/${page}`);
    addCandidate(`/${lang}/${game}/Wants/EditWantsList/${normalizedWantListId}${page > 1 ? `?site=${page}` : ''}`);
    addCandidate(`/${lang}/${game}/Wants/Show/${normalizedWantListId}${page > 1 ? `?site=${page}` : ''}`);
    addCandidate(`/${lang}/${game}/Wants?idWantsList=${normalizedWantListId}${page > 1 ? `&site=${page}` : ''}`);

    return candidates;
  }

  function parseWantItemsFromDocumentLocal(doc, href) {
    const wantListIdFromHref = extractWantListId(href);
    const languagePattern = /^(Deutsch|Englisch|Französisch|Italienisch|Spanisch|Portugiesisch|Japanisch|Koreanisch|Chinesisch|Russisch|S-Chinesisch|T-Chinesisch|English|German|French|Italian|Spanish|Portuguese|Japanese|Korean|Chinese|Russian)$/;
    const desktopRows = [...doc.querySelectorAll('#WantsListTable table.d-lg-table tbody tr')];
    const mobileRows = [...doc.querySelectorAll('#MobileWantsList .accordion-item')];
    const fallbackRows = collectCheckboxRows();
    const source = desktopRows.length
      ? 'desktop-table'
      : mobileRows.length
        ? 'mobile-accordion'
        : 'checkbox-walkup';
    const parsedItems = (
      desktopRows.length
        ? desktopRows.map(parseDesktopRow)
        : mobileRows.length
          ? mobileRows.map(parseMobileRow)
          : fallbackRows.map(parseGenericRow)
    )
      .filter((item) => item && (item.idWant || item.productName));

    return {
      wantListId: wantListIdFromHref,
      items: parsedItems,
      debug: {
        source,
        desktopRows: desktopRows.length,
        mobileRows: mobileRows.length,
        fallbackRows: fallbackRows.length,
        parsedItems: parsedItems.length,
      },
    };

    function collectCheckboxRows() {
      const checkboxes = [...doc.querySelectorAll('input[name="checkWantsRow[]"][data-id-want], input[name="mobileCheckWant"][data-id-want], input[data-id-want]')];
      const rowSet = new Set();
      const rows = [];

      checkboxes.forEach((checkbox) => {
        let container = checkbox.parentElement;
        let depth = 0;
        while (container && depth < 8) {
          const productLink = container.querySelector('a[href*="/Products/Singles/"], a[href*="/Products/"]');
          if (productLink) break;
          container = container.parentElement;
          depth += 1;
        }
        if (!container || rowSet.has(container)) return;
        rowSet.add(container);
        rows.push(container);
      });

      return rows;
    }

    function parseDesktopRow(row) {
      const checkbox = row.querySelector('input[name="checkWantsRow[]"][data-id-want], input[data-id-want]');
      const nameLink = row.querySelector('td.name a[href], a[href*="/Products/"]');
      const expansionContainer = findExpansionContainer(row);
      const preview = row.querySelector('td.preview [data-bs-title], td.preview [data-bs-original-title], td.preview [title], [data-bs-title], [title]');
      const conditionBadge = row.querySelector('td.condition .article-condition .badge, td.condition .badge');
      const priceCell = row.querySelector('td.buyPrice');
      const quantityCell = row.querySelector('td.amount');
      const previewTitle = preview?.getAttribute('data-bs-title') || preview?.getAttribute('data-bs-original-title') || preview?.getAttribute('title') || '';
      const rowText = row.textContent || '';
      const rawHref = nameLink?.getAttribute('href') || '';
      const productUrl = normalizeProductUrl(rawHref);
      const productName = textOf(nameLink?.textContent)
        || decodeHtmlAttribute(previewTitle.match(/alt=&quot;([^&]+(?:&[^;]+;)*)&quot;/i)?.[1] || '')
        || textOf(row.querySelector('td.name')?.textContent);
      const productIdMatch = previewTitle.match(/product-images\.s3\.cardmarket\.com\/\d+\/[^/]+\/(\d+)\//i)
        || rawHref.match(/\/(\d+)(?:[/?#]|$)/);
      const priceMatch = textOf(priceCell?.textContent).match(/(\d{1,3}(?:[.,]\d{3})*[,.]\d{2})/);

      return {
        wantListId: wantListIdFromHref,
        idWant: checkbox?.getAttribute('data-id-want') || '',
        idProduct: productIdMatch?.[1] || '',
        productName,
        productUrl,
        quantity: textOf(quantityCell?.getAttribute('data-amount')) || textOf(quantityCell?.textContent) || '1',
        languages: extractSelectedLanguages(row),
        minCondition: extractSelectedCondition(row) || textOf(conditionBadge?.textContent),
        expansions: extractSelectedExpansions(expansionContainer),
        maxPrice: priceMatch?.[1] || '',
        isFoil: extractDesktopTernaryPreference(row, 7, 'foil') ?? extractBooleanPreference(row, 'foil', /\bFoil\b/i, rowText),
        isReverseHolo: extractBooleanPreference(row, 'reverse', /Reverse\s*Holo/i, rowText),
      };
    }

    function parseMobileRow(row) {
      const checkbox = row.querySelector('input[name="mobileCheckWant"][data-id-want], input[data-id-want]');
      const nameNode = row.querySelector('.want-name');
      const nameLink = row.querySelector('.item-body-wrapper a[href*="/Cards/"], a[href*="/Products/"]');
      const preview = row.querySelector('[data-bs-title], [data-bs-original-title], [title]');
      const previewTitle = preview?.getAttribute('data-bs-title') || preview?.getAttribute('data-bs-original-title') || preview?.getAttribute('title') || '';
      const conditionBadge = row.querySelector('.article-condition .badge, .badge');
      const rawHref = nameLink?.getAttribute('href') || '';
      const expansionContainer = getMobileFieldValueNode(row, 'Expansion') || findExpansionContainer(row);
      const productUrl = normalizeProductUrl(rawHref);
      const productIdMatch = previewTitle.match(/product-images\.s3\.cardmarket\.com\/\d+\/[^/]+\/(\d+)\//i)
        || rawHref.match(/\/(\d+)(?:[/?#]|$)/);
      const rowText = row.textContent || '';

      return {
        wantListId: wantListIdFromHref,
        idWant: checkbox?.getAttribute('data-id-want') || '',
        idProduct: productIdMatch?.[1] || '',
        productName: textOf(nameNode?.textContent) || textOf(nameLink?.textContent),
        productUrl,
        quantity: textOf(row.querySelector('.want-amount')?.textContent).replace(/\s+/g, '') || '1',
        languages: extractSelectedLanguages(row),
        minCondition: extractSelectedCondition(row) || textOf(conditionBadge?.textContent) || textOf(getMobileFieldValueNode(row, 'Min. Condition')?.textContent),
        expansions: extractSelectedExpansions(expansionContainer),
        maxPrice: '',
        isFoil: extractMobileTernaryPreference(row, 'Foil?') ?? extractBooleanPreference(row, 'foil', /\bFoil\b/i, rowText),
        isReverseHolo: extractBooleanPreference(row, 'reverse', /Reverse\s*Holo/i, rowText),
      };
    }

    function parseGenericRow(row) {
      const checkbox = row.querySelector('input[data-id-want]');
      const nameLink = row.querySelector('a[href*="/Products/Singles/"], a[href*="/Products/"]');
      const preview = row.querySelector('[data-bs-title], [data-bs-original-title], [title]');
      const previewTitle = preview?.getAttribute('data-bs-title') || preview?.getAttribute('data-bs-original-title') || preview?.getAttribute('title') || '';
      const conditionBadge = row.querySelector('.article-condition .badge, .badge, [class*="condition"] .badge');
      const rawHref = nameLink?.getAttribute('href') || '';
      const productUrl = normalizeProductUrl(rawHref);
      const productIdMatch = previewTitle.match(/product-images\.s3\.cardmarket\.com\/\d+\/[^/]+\/(\d+)\//i)
        || rawHref.match(/\/(\d+)(?:[/?#]|$)/);
      const rowText = row.textContent || '';
      const productName = textOf(nameLink?.textContent)
        || decodeHtmlAttribute(previewTitle.match(/alt=&quot;([^&]+(?:&[^;]+;)*)&quot;/i)?.[1] || '')
        || textOf(row.querySelector('.want-name, .product-name, .name')?.textContent);
      const priceInput = row.querySelector('input[name*="rice"], input[name*="Price"]');
      const quantityInput = row.querySelector('input[name*="mount"], input[name*="uantity"], input[type="number"]');
      const priceMatch = textOf(priceInput?.value || rowText).match(/(\d{1,3}(?:[.,]\d{3})*[,.]\d{2})/);

      return {
        wantListId: wantListIdFromHref,
        idWant: checkbox?.getAttribute('data-id-want') || '',
        idProduct: productIdMatch?.[1] || '',
        productName,
        productUrl,
        quantity: textOf(quantityInput?.value || row.querySelector('.want-amount')?.textContent).replace(/\s+/g, '') || '1',
        languages: extractSelectedLanguages(row),
        minCondition: extractSelectedCondition(row) || textOf(conditionBadge?.textContent),
        expansions: extractSelectedExpansions(findExpansionContainer(row) || row),
        maxPrice: priceMatch?.[1] || '',
        isFoil: extractBooleanPreference(row, 'foil', /\bFoil\b/i, rowText),
        isReverseHolo: extractBooleanPreference(row, 'reverse', /Reverse\s*Holo/i, rowText),
      };
    }

    function findExpansionContainer(row) {
      if (!row) return null;
      return row.querySelector('td.expansion, [data-label="Expansion"], [class*="expansion" i], [aria-label*="Expansion" i]') || row;
    }

    function normalizeProductUrl(rawHref) {
      if (!rawHref) return '';
      const absolute = rawHref.startsWith('http') ? rawHref : `${location.origin}${rawHref}`;
      const url = new URL(absolute);
      url.search = '';
      url.hash = '';
      return url.toString();
    }

    function extractSelectedLanguages(container) {
      if (!container) return [];
      const optionLabels = extractSelectedOptionLabels(container, /language/i);
      const iconLabels = [...container.querySelectorAll('[aria-label], [data-bs-original-title], [data-original-title], [title]')]
        .map((node) => textOf(node.getAttribute('aria-label') || node.getAttribute('data-bs-original-title') || node.getAttribute('data-original-title') || node.getAttribute('title') || ''))
        .filter((label) => languagePattern.test(label));
      const hiddenLabels = [...container.querySelectorAll('.visually-hidden')]
        .map((node) => textOf(node.textContent))
        .filter((label) => languagePattern.test(label));
      return [...new Set([...optionLabels, ...iconLabels, ...hiddenLabels].filter(Boolean))];
    }

    function extractSelectedExpansions(container) {
      if (!container) return [];
      const labels = extractSelectedOptionLabels(container, /expansion|set/i);
      const linkLabels = [...container.querySelectorAll('a[href*="/Expansions/"], .expansion-symbol, [class*="expansion" i] a[href]')]
        .map((node) => textOf(node.getAttribute('aria-label') || node.getAttribute('title') || node.textContent || ''));
      const tooltipLabels = [...container.querySelectorAll('[aria-label], [data-bs-original-title], [data-original-title], [title]')]
        .map((node) => textOf(node.getAttribute('aria-label') || node.getAttribute('data-bs-original-title') || node.getAttribute('data-original-title') || node.getAttribute('title') || ''));
      const hiddenLabels = [...container.querySelectorAll('.visually-hidden')]
        .map((node) => textOf(node.textContent));
      const visibleText = textOf(container.textContent || '');
      const textCandidates = [];
      if (visibleText && !/^any$/i.test(visibleText)) {
        textCandidates.push(...visibleText
          .split(/\s{2,}|\n|\r|\t|\s*[|,;]\s*/)
          .map((value) => textOf(value))
          .filter(Boolean));
      }
      return [...new Set([...labels, ...linkLabels, ...tooltipLabels, ...hiddenLabels, ...textCandidates].filter((label) => label && !/^any$/i.test(label)))];
    }

    function extractSelectedCondition(container) {
      return extractSelectedOptionLabels(container, /condition/i)[0] || '';
    }

    function extractDesktopTernaryPreference(row, cellIndex, nameHint) {
      const cell = row.children?.[cellIndex];
      return extractRenderedTernaryPreference(cell, nameHint);
    }

    function extractMobileTernaryPreference(row, labelText) {
      const cell = getMobileFieldValueNode(row, labelText);
      return extractRenderedTernaryPreference(cell, labelText);
    }

    function extractRenderedTernaryPreference(container, nameHint) {
      if (!container) return null;
      const labeledNode = container.querySelector('[aria-label], [data-bs-original-title], [data-original-title], [title]');
      const value = [
        textOf(container.textContent),
        textOf(labeledNode?.getAttribute('aria-label') || labeledNode?.getAttribute('data-bs-original-title') || labeledNode?.getAttribute('data-original-title') || labeledNode?.getAttribute('title')),
      ].find((entry) => entry && !new RegExp(nameHint, 'i').test(entry)) || '';
      if (/^(y|yes|true)$/i.test(value)) return true;
      if (/^(n|no|false)$/i.test(value)) return false;
      if (/^any$/i.test(value) || value === '') return null;
      return null;
    }

    function getMobileFieldValueNode(row, labelText) {
      const term = [...row.querySelectorAll('dt')].find((node) => textOf(node.textContent) === labelText);
      return term?.nextElementSibling || null;
    }

    function extractSelectedOptionLabels(container, namePattern) {
      const labels = [];
      container.querySelectorAll('select').forEach((select) => {
        const name = select.getAttribute('name') || select.getAttribute('id') || '';
        if (!namePattern.test(name)) return;
        [...select.selectedOptions].forEach((option) => {
          const label = textOf(option.textContent);
          if (label) labels.push(label);
        });
      });
      container.querySelectorAll('input[type="checkbox"], input[type="radio"]').forEach((input) => {
        const name = input.getAttribute('name') || '';
        if (!namePattern.test(name) || !input.checked) return;
        const label = findInputLabel(container, input);
        if (label) labels.push(label);
      });
      return [...new Set(labels.filter(Boolean))];
    }

    function extractBooleanPreference(container, nameHint, textPattern, sourceText) {
      const inputs = [...container.querySelectorAll('input[type="checkbox"], input[type="radio"]')]
        .filter((input) => new RegExp(nameHint, 'i').test(input.getAttribute('name') || input.getAttribute('id') || ''));
      if (inputs.length) {
        const checked = inputs.find((input) => input.checked);
        if (checked) {
          const checkedValue = textOf(checked.value);
          if (/^(1|y|yes|true|foil)$/i.test(checkedValue)) return true;
          if (/^(0|n|no|false|any)$/i.test(checkedValue)) return false;
        }
      }
      return textPattern.test(sourceText);
    }

    function findInputLabel(container, input) {
      const id = input.getAttribute('id');
      if (id) {
        const label = container.querySelector(`label[for="${CSS.escape(id)}"]`);
        if (label) return textOf(label.textContent);
      }
      return textOf(input.closest('label')?.textContent || input.parentElement?.querySelector('label')?.textContent);
    }

    function decodeHtmlAttribute(value) {
      if (!value) return '';
      const el = doc.createElement('textarea');
      el.innerHTML = value;
      return textOf(el.value);
    }
  }

  function detectCurrentUsernameLocal(doc) {
    const headerContainers = [
      doc.querySelector('header'),
      doc.querySelector('nav'),
      ...doc.querySelectorAll('[class*="header" i], [class*="nav" i], [class*="account" i], [class*="profile" i], [class*="user" i]'),
    ].filter(Boolean);

    const containerSelectors = [
      'a[href*="/Users/"]',
      'a[href*="/Account/"]',
    ];

    for (const container of headerContainers) {
      for (const selector of containerSelectors) {
        const anchor = container.querySelector(selector);
        const usernameValue = usernameFromAnchor(anchor);
        if (usernameValue) return usernameValue;
      }
    }

    const logoutLink = doc.querySelector('a[href*="logout" i], a[href*="signout" i], a[href*="logoff" i]');
    const logoutContainer = logoutLink?.closest('header, nav, [class*="header" i], [class*="nav" i], [class*="account" i], [class*="profile" i], [class*="user" i]');
    if (logoutContainer) {
      const anchor = logoutContainer.querySelector('a[href*="/Users/"]');
      const usernameValue = usernameFromAnchor(anchor);
      if (usernameValue) return usernameValue;
    }

    return '';

    function usernameFromAnchor(anchor) {
      if (!anchor) return '';
      const href = anchor.getAttribute('href') || '';
      const hrefMatch = href.match(/\/Users\/([^/?#]+)/i);
      if (hrefMatch?.[1]) return decodeURIComponent(hrefMatch[1]);
      const textValue = textOf(anchor.textContent);
      if (textValue && !/^(account|profile|my account)$/i.test(textValue)) return textValue;
      return '';
    }
  }
}
