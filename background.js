const WORKSPACE_TAB_URL = chrome.runtime.getURL('popup.html');
const WORKSPACE_QUERY_KEY = 'workspace';
const SOURCE_TAB_BINDING_KEY = 'workspaceSourceTabBinding';

function bgLog(message, details = undefined) {
	if (details === undefined) {
		console.info(`[CM Optimizer bg] ${message}`);
		return;
	}
	console.info(`[CM Optimizer bg] ${message}`, details);
}

function getStorageArea() {
	return chrome.storage.local;
}

function isCardmarketUrl(url = '') {
	return /^https:\/\/(?:www\.)?cardmarket\.com\//.test(url);
}

function getWorkspaceUrl({ autoStart = '', sourceTab = null } = {}) {
	const params = new URLSearchParams({ [WORKSPACE_QUERY_KEY]: '1' });
	if (autoStart) params.set('autoStart', autoStart);
	if (sourceTab?.id && isCardmarketUrl(sourceTab.url || '')) {
		params.set('tabId', String(sourceTab.id));
	}
	return `${WORKSPACE_TAB_URL}?${params.toString()}`;
}

function parseWorkspaceUrl(url) {
	if (!url) return null;

	try {
		const parsed = new URL(url);
		const workspaceUrl = new URL(WORKSPACE_TAB_URL);
		if (parsed.origin !== workspaceUrl.origin || parsed.pathname !== workspaceUrl.pathname) {
			return null;
		}
		if (parsed.searchParams.get(WORKSPACE_QUERY_KEY) !== '1') {
			return null;
		}
		return parsed;
	} catch {
		return null;
	}
}

async function saveSourceTabBinding(tab) {
	if (!tab?.id || !isCardmarketUrl(tab.url || '')) return;
	bgLog('Saving source tab binding.', { id: tab.id, url: tab.url, title: tab.title || '' });

	const storageArea = getStorageArea();
	await storageArea.set({
		[SOURCE_TAB_BINDING_KEY]: {
			tabId: tab.id,
			title: String(tab.title || '').trim(),
			url: String(tab.url || '').trim(),
			updatedAt: new Date().toISOString(),
		},
	});
}

async function findWorkspaceTabs() {
	const tabs = await chrome.tabs.query({});
	const matches = tabs.filter((tab) => parseWorkspaceUrl(tab.url));
	bgLog('Scanned tabs for workspace.', { totalTabs: tabs.length, workspaceTabs: matches.map((tab) => ({ id: tab.id, windowId: tab.windowId, url: tab.url })) });
	return matches;
}

async function focusWorkspaceTab(workspaceTab, nextUrl) {
	bgLog('Focusing existing workspace tab.', { id: workspaceTab.id, windowId: workspaceTab.windowId, nextUrl });
	const currentUrl = workspaceTab.url || '';
	if (currentUrl !== nextUrl && workspaceTab.id) {
		await chrome.tabs.update(workspaceTab.id, { url: nextUrl });
	}

	if (workspaceTab.windowId) {
		await chrome.windows.update(workspaceTab.windowId, { focused: true });
	}
	if (workspaceTab.id) {
		await chrome.tabs.update(workspaceTab.id, { active: true });
	}
}

async function openOrFocusWorkspace({ sourceTab = null, autoStart = '' } = {}) {
	bgLog('openOrFocusWorkspace called.', {
		autoStart,
		sourceTab: sourceTab ? { id: sourceTab.id, windowId: sourceTab.windowId, index: sourceTab.index, url: sourceTab.url || '', title: sourceTab.title || '' } : null,
	});
	if (sourceTab?.id && isCardmarketUrl(sourceTab.url || '')) {
		await saveSourceTabBinding(sourceTab);
	}

	const nextUrl = getWorkspaceUrl({ autoStart, sourceTab });
	const workspaceTabs = await findWorkspaceTabs();
	if (workspaceTabs.length) {
		const [primaryTab, ...duplicateTabs] = workspaceTabs;
		bgLog('Reusing existing workspace tab.', { primaryTabId: primaryTab.id, duplicateTabIds: duplicateTabs.map((tab) => tab.id) });
		await Promise.all(duplicateTabs.map((tab) => tab.id ? chrome.tabs.remove(tab.id) : Promise.resolve()));
		await focusWorkspaceTab(primaryTab, nextUrl);
		return;
	}

	const createProperties = {
		url: nextUrl,
		active: true,
	};
	if (sourceTab?.windowId) {
		createProperties.windowId = sourceTab.windowId;
		if (typeof sourceTab.index === 'number') {
			createProperties.index = sourceTab.index + 1;
		}
	}

	const createdTab = await chrome.tabs.create(createProperties);
	bgLog('Created workspace tab.', { id: createdTab.id, windowId: createdTab.windowId, url: createdTab.url || nextUrl });
	if (createdTab.windowId) {
		await chrome.windows.update(createdTab.windowId, { focused: true });
	}
}

chrome.action.onClicked.addListener(async (tab) => {
	bgLog('chrome.action.onClicked fired.', tab ? { id: tab.id, windowId: tab.windowId, index: tab.index, url: tab.url || '', title: tab.title || '' } : null);
	await openOrFocusWorkspace({ sourceTab: tab || null });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	if (message?.type !== 'workspace/open') {
		return undefined;
	}

	bgLog('Received runtime workspace/open message.', {
		message: {
			autoStart: String(message?.autoStart || ''),
			sourceTabId: message?.sourceTabId || null,
			sourceTabUrl: message?.sourceTabUrl || '',
		},
		senderTab: sender.tab ? { id: sender.tab.id, windowId: sender.tab.windowId, url: sender.tab.url || '' } : null,
	});

	openOrFocusWorkspace({
		sourceTab: message?.sourceTabId && isCardmarketUrl(message?.sourceTabUrl || '')
			? {
				id: message.sourceTabId,
				url: message.sourceTabUrl,
				title: message.sourceTabTitle || '',
			}
			: (sender.tab && isCardmarketUrl(sender.tab.url || '') ? sender.tab : null),
		autoStart: String(message?.autoStart || ''),
	}).then(() => sendResponse({ ok: true }))
		.catch((error) => sendResponse({ ok: false, error: error.message }));

	return true;
});