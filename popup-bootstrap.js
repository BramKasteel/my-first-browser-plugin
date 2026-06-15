extractItemsButton.addEventListener('click', handleExtractItems);
heroFeedbackButton?.addEventListener('click', () => {
  const codes = Array.isArray(window.APP_CONFIG?.feedbackEmailCharCodes)
    ? window.APP_CONFIG.feedbackEmailCharCodes
    : [];
  const emailAddress = codes.map((code) => String.fromCharCode(code)).join('');
  if (!emailAddress) {
    appendStatus('Feedback address missing from config.', 'bad');
    return;
  }

  if (heroFeedbackRevealEl) {
    heroFeedbackRevealEl.textContent = emailAddress;
    heroFeedbackRevealEl.hidden = false;
    heroFeedbackButton.hidden = true;
    appendStatus('Feedback address revealed in popup.', 'good');
    return;
  }

  appendStatus('Feedback address available: ' + emailAddress, 'good');
});
heroDonateButton?.addEventListener('click', () => {
  const donationUrl = textOf(window.APP_CONFIG?.donationUrl);
  if (!donationUrl) {
    appendStatus('Donation link missing from config.', 'bad');
    return;
  }

  appendStatus('Opening donation page in new tab.', 'good');
  if (globalThis.chrome?.tabs?.create) {
    globalThis.chrome.tabs.create({ url: donationUrl });
    return;
  }

  window.open(donationUrl, '_blank', 'noopener');
});
confirmWantListButton?.addEventListener('click', () => {
  if (!hasLoadedWantItems() || getWantListSelectionPolicy().isBlocked) return;
  setActiveWorkflowStep('sellers', { force: true });
});
scrapeAllItemsButton.addEventListener('click', handleScrapeAllItems);
optimizeOrderButton.addEventListener('click', handleOptimizeOrder);
fillCartButton.addEventListener('click', handleFillCart);
postFillReoptimizeButton?.addEventListener('click', () => {
  handlePostFillReoptimize().catch((error) => {
    appendStatus(error.message, 'bad');
  });
});
workflowStepButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const stepName = button.dataset.workflowStep || 'source';
    setActiveWorkflowStep(stepName);
  });
});
resultTabButtons.forEach((button) => {
  button.addEventListener('click', () => {
    setActiveResultTab(button.dataset.resultTab || 'overview');
  });
});
resultPanelToggleButton?.addEventListener('click', () => {
  setResultPanelExpanded(!isResultPanelExpanded);
});
wantListSelectEl?.addEventListener('change', () => {
  selectedWantListId = textOf(wantListSelectEl.value);
  saveSellerSettings();
  syncExtractButton();
  renderWorkflow();
  refreshWantListWarning().catch(() => {
    renderWantListWarning('Could not inspect current tab. Open Cardmarket page and retry.');
  });
  if (selectedWantListId) {
    handleExtractItems().catch((error) => {
      appendStatus(error.message, 'bad');
    });
  }
});
sellerReputationFilterEl.addEventListener('change', () => {
  renderSellerFilterState();
  saveSellerSettings();
});
sellerDeliveryTimeFilterEl.addEventListener('change', () => {
  renderSellerFilterState();
  saveSellerSettings();
});
sellerTypeFilterEl.addEventListener('change', () => {
  renderSellerFilterState();
  saveSellerSettings();
});
sellerBargainsCheckboxEl?.addEventListener('change', () => {
  setIncludeBargainsFromOtherCountries(sellerBargainsCheckboxEl.checked);
  saveSellerSettings();
});
buyerCountrySelectEl.addEventListener('change', () => {
  saveSellerSettings();
  refreshOptimizerPayloadFromCurrentState();
});
sellerCountryFilterInputEl?.addEventListener('input', () => {
  renderSellerCountryFilterList(selectedSellerCountries);
});
sellerCountryFilterInputEl?.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return;

  const firstMatchButton = sellerLocationFilterListEl.querySelector('button[data-country-option]');
  if (!(firstMatchButton instanceof HTMLButtonElement) || firstMatchButton.disabled) return;

  event.preventDefault();
  firstMatchButton.click();
});
sellerLocationFilterListEl.addEventListener('click', (event) => {
  const optionButton = event.target instanceof HTMLElement
    ? event.target.closest('button[data-country-option]')
    : null;
  if (!(optionButton instanceof HTMLButtonElement)) return;

  const country = normalizeCountryName(optionButton.dataset.countryOption || '');
  if (!country || selectedSellerCountries.includes(country)) return;

  setSelectedSellerCountries(clampSellerCountriesToPolicy([...selectedSellerCountries, country]));
  if (sellerCountryFilterInputEl) {
    sellerCountryFilterInputEl.value = '';
  }
  saveSellerSettings();
});
selectedSellerCountriesEl.addEventListener('click', (event) => {
  const removeButton = event.target instanceof HTMLElement
    ? event.target.closest('button[data-country-remove]')
    : null;
  if (!(removeButton instanceof HTMLButtonElement)) return;

  const country = normalizeCountryName(removeButton.dataset.countryRemove || '');
  if (!country) return;

  setSelectedSellerCountries(selectedSellerCountries.filter((value) => value !== country));
  if (sellerCountryFilterInputEl) sellerCountryFilterInputEl.focus();
  saveSellerSettings();
});
window.addEventListener('focus', () => {
  refreshWantLists({ quiet: true }).catch(() => {});
  refreshWantListWarning().catch(() => {
    renderWantListWarning('Could not inspect current tab. Open Cardmarket page and retry.');
  });
});

function initializePopupWorkspace() {
  renderSummary([
    { label: 'Status', value: 'Ready for want-list loading' },
    { label: 'Current scope', value: 'Select a wants list to continue.' },
  ]);
  finishRun('Idle. Start extract, scrape, or probe.');
  renderItems([], 0);
  renderOptimizationResult(null);
  renderSellers([], 0);
  renderPayload(null);
  renderFrontendPayload(null);
  renderOptimizerInputContext();
  renderBuyerCountryOptions();
  renderPostFillScreen();
  setResultPanelExpanded(false);
  setActiveResultTab('overview');
  installE2eTestApi();
  renderSellerCountryFilterList();
  renderWantListOptions();
  syncExtractButton();
  syncSellerScrapeButton();
  syncOptimizeButton();
  syncFillCartButton();
  syncPostFillReoptimizeButton();
  renderStepActivity();
  renderWorkflow();
  scrapeAllItemsButton.textContent = 'Scrape sellers';
  appendStatus(isDetached
    ? 'Batch scrape workspace loaded. It stays open while you click back into Cardmarket.'
    : 'Popup loaded. Dedicated plugin window could not be opened, so staying in popup mode.');
}

if (!isDetached) {
  renderSummary([
    { label: 'Status', value: 'Opening dedicated plugin window' },
    { label: 'Current scope', value: 'Popup should move into separate window automatically.' },
  ]);
  finishRun('Opening dedicated plugin window.');
  appendStatus('Popup loaded. Opening dedicated plugin window so long scrapes keep running.');
  autoDetachDefaultPopup().then((openedDetachedWindow) => {
    if (!openedDetachedWindow) {
      initializePopupWorkspace();
      loadSellerSettings()
        .then(() => refreshWantLists({ quiet: true }))
        .then(() => refreshWantListWarning())
        .catch((error) => {
          appendStatus(error?.message || 'Could not load want lists in popup fallback mode.', 'bad');
        });
    }
  });
} else {
  initializePopupWorkspace();
  loadSellerSettings()
    .then(() => refreshWantLists({ quiet: true }))
    .then(() => {
      if (!restoredWantListId || selectedWantListId !== restoredWantListId || !hasSelectedWantList() || hasLoadedWantItems()) {
        return null;
      }

      return handleExtractItems();
    })
    .then(() => refreshWantListWarning())
    .catch((error) => {
      const message = error?.message || '';
      if (/want list|wants overview|cardmarket/i.test(message)) {
        appendStatus('Could not load Cardmarket want lists. Open Cardmarket tab; popup retries automatically.', 'bad');
        return;
      }
      appendStatus('Could not load saved seller scrape settings. Using safe defaults.', 'bad');
    })
    .finally(() => {
      if (isDetached && autoStartMode === 'scrapeAll') {
        loadDetachedBatchState().then((items) => {
          latestExtractedItems = items;
          syncSellerScrapeButton();
          renderWorkflow();
          if (!latestExtractedItems.length) {
            appendStatus('Batch scrape workspace could not auto-start because no extracted items were passed from popup.', 'bad');
            return;
          }

          renderItems(latestExtractedItems.slice(0, 8), latestExtractedItems.length);
          renderSellers([], 0, latestExtractedItems[0]?.productName || 'the first item');
          setActiveWorkflowStep('sellers', { force: true });
          handleScrapeAllItems().catch((error) => {
            appendStatus(error.message, 'bad');
          });
        }).catch(() => {
          appendStatus('Batch scrape workspace could not load extracted items for auto-start.', 'bad');
        });
      }
    });
}
