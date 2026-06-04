extractItemsButton.addEventListener('click', handleExtractItems);
confirmWantListButton?.addEventListener('click', () => {
  if (!hasLoadedWantItems() || getWantListSelectionPolicy().isBlocked) return;
  setActiveWorkflowStep('sellers', { force: true });
});
scrapeAllItemsButton.addEventListener('click', handleScrapeAllItems);
optimizeOrderButton.addEventListener('click', handleOptimizeOrder);
fillCartButton.addEventListener('click', handleFillCart);
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
buyerCountrySelectEl.addEventListener('change', () => {
  saveSellerSettings();
  refreshOptimizerPayloadFromCurrentState();
});
sellerLocationFilterListEl.addEventListener('change', (event) => {
  if (event.target instanceof HTMLInputElement && event.target.name === 'sellerCountryFilter') {
    const country = normalizeCountryName(event.target.value);
    if (event.target.checked && country && !selectedSellerCountries.includes(country)) {
      setSelectedSellerCountries(clampSellerCountriesToPolicy([...selectedSellerCountries, country]));
    }
    saveSellerSettings();
  }
});
selectedSellerCountriesEl.addEventListener('click', (event) => {
  const removeButton = event.target instanceof HTMLElement
    ? event.target.closest('button[data-country-remove]')
    : null;
  if (!(removeButton instanceof HTMLButtonElement)) return;

  const country = normalizeCountryName(removeButton.dataset.countryRemove || '');
  if (!country) return;

  setSelectedSellerCountries(selectedSellerCountries.filter((value) => value !== country));
  saveSellerSettings();
});
window.addEventListener('focus', () => {
  refreshWantLists({ quiet: true }).catch(() => {});
  refreshWantListWarning().catch(() => {
    renderWantListWarning('Could not inspect current tab. Open Cardmarket page and retry.');
  });
});

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
installE2eTestApi();
renderSellerCountryFilterList();
renderWantListOptions();
syncExtractButton();
syncSellerScrapeButton();
syncOptimizeButton();
syncFillCartButton();
renderStepActivity();
renderWorkflow();
scrapeAllItemsButton.textContent = 'Scrape sellers';
appendStatus(isDetached
  ? 'Batch scrape workspace loaded. It stays open while you click back into Cardmarket.'
  : 'Popup loaded. Opening dedicated plugin window so long scrapes keep running.');

if (!isDetached) {
  autoDetachDefaultPopup();
} else {
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
