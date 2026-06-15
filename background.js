const WORKSPACE_TAB_URL = chrome.runtime.getURL('popup.html');
const WORKSPACE_QUERY_KEY = 'workspace';
const SOURCE_TAB_BINDING_KEY = 'workspaceSourceTabBinding';

function getStorageArea() {
	return chrome.storage.session || chrome.storage.local;
}

function isCardmarketUrl(url = '') {
	return /^https:\/\/www\.cardmarket\.com\//.test(url);
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

async function findWorkspaceWindow() {
	const windows = await chrome.windows.getAll({ populate: true, windowTypes: ['normal', 'popup'] });
	return windows
		.map((popupWindow) => {
			const workspaceTab = popupWindow.tabs?.find((tab) => parseWorkspaceUrl(tab.url));
			if (!workspaceTab) return null;
			return { popupWindow, workspaceTab };
		})
		.filter(Boolean);
}

async function focusWorkspace(entry, nextUrl) {
	const currentUrl = entry.workspaceTab.url || '';
	if (currentUrl !== nextUrl && entry.workspaceTab.id) {
		await chrome.tabs.update(entry.workspaceTab.id, { url: nextUrl });
	}

	await chrome.windows.update(entry.popupWindow.id, { focused: true });
	if (entry.workspaceTab.id) {
		await chrome.tabs.update(entry.workspaceTab.id, { active: true });
	}
}

async function openOrFocusWorkspace({ sourceTab = null, autoStart = '' } = {}) {
	if (sourceTab?.id && isCardmarketUrl(sourceTab.url || '')) {
		await saveSourceTabBinding(sourceTab);
	}

	const nextUrl = getWorkspaceUrl({ autoStart });
	const workspaceWindows = await findWorkspaceWindow();
	if (workspaceWindows.length) {
		const [primaryWindow, ...duplicateWindows] = workspaceWindows;
		await Promise.all(duplicateWindows.map(({ popupWindow }) => chrome.windows.remove(popupWindow.id)));
		await focusWorkspace(primaryWindow, nextUrl);
		return;
	}

	await chrome.windows.create({
		url: nextUrl,
		type: 'normal',
		width: 460,
		height: 920,
		focused: true,
	});
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