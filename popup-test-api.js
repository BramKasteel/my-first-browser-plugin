function getPopupSnapshot() {
  return {
    isDetached,
    isBusy: isUiBusy,
    runState: {
      active: isRunActive,
      message: textOf(runStatusTextEl.textContent),
      tone: getRunStatusTone(),
    },
    workflow: {
      activeStep: activeWorkflowStep,
      history: [...workflowHistory],
    },
    resultsPanel: {
      activeTab: activeResultTab,
      panelExpanded: isResultPanelExpanded,
    },
    wantLists: {
      selectedWantListId,
      available: availableWantLists.map((entry) => ({ ...entry })),
    },
    wantListConstraints: getWantListSelectionPolicy(),
    extractedItems: {
      count: latestExtractedItems.length,
      distinctCount: getLoadedWantDistinctItemCount(),
      sample: latestExtractedItems.slice(0, 3),
    },
    sellerFilters: getCurrentSellerFilterState(),
    controls: {
      confirmWantListDisabled: !!confirmWantListButton?.disabled,
      scrapeAllItemsDisabled: !!scrapeAllItemsButton?.disabled,
    },
    frontendPayload: latestFrontendPayload,
    optimizerPayload: latestExtractPayload,
    optimizeContext: getOptimizeContextSnapshot(),
    optimizationResult: latestOptimizationResult,
    stepActivity: activeStepActivity ? { ...activeStepActivity } : null,
    summary: readSummaryRows(),
    statusLog: readStatusLogEntries(),
  };
}

function installE2eTestApi() {
  if (!isE2e) return;

  window.__cmOptimizerTestApi = {
    getSnapshot: () => getPopupSnapshot(),
    getStorage: async (keys = null) => {
      const storageArea = await getStorageArea();
      if (keys == null) return storageArea.get(null);
      return storageArea.get(keys);
    },
    setStorage: async (values) => {
      const storageArea = await getStorageArea();
      await storageArea.set(values || {});
      return storageArea.get(null);
    },
    clearStorage: async () => {
      const storageArea = await getStorageArea();
      await storageArea.clear();
      return true;
    },
  };
}
