const WORKSPACE_TAB_URL = chrome.runtime.getURL('popup.html');
const WORKSPACE_QUERY_KEY = 'workspace';
const SOURCE_TAB_BINDING_KEY = 'workspaceSourceTabBinding';

function getStorageArea() {
	return chrome.storage.local;
}

function isCardmarketUrl(url = '') {
	return /^https:\/\/(?:www\.)?cardmarket\.com\//.test(url);
}

function getWorkspaceUrl({ autoStart = '' } = {}) {
	const params = new URLSearchParams({ [WORKSPACE_QUERY_KEY]: '1' });
	if (autoStart) params.set('autoStart', autoStart);
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
	return tabs.filter((tab) => parseWorkspaceUrl(tab.url));
}

async function focusWorkspaceTab(workspaceTab, nextUrl) {
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
	if (sourceTab?.id && isCardmarketUrl(sourceTab.url || '')) {
		await saveSourceTabBinding(sourceTab);
	}

	const nextUrl = getWorkspaceUrl({ autoStart });
	const workspaceTabs = await findWorkspaceTabs();
	if (workspaceTabs.length) {
		const [primaryTab, ...duplicateTabs] = workspaceTabs;
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
	if (createdTab.windowId) {
		await chrome.windows.update(createdTab.windowId, { focused: true });
	}
}

chrome.action.onClicked.addListener(async (tab) => {
	await openOrFocusWorkspace({ sourceTab: tab || null });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	if (message?.type !== 'workspace/open') {
		return undefined;
	}

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