void chrome.runtime?.id;

const DETACHED_TARGET_TAB_KEY = 'detachedTargetTabId';

function getDetachedPopupUrl(tabId) {
	const params = new URLSearchParams({ detached: '1' });
	if (Number.isInteger(tabId)) {
		params.set('tabId', String(tabId));
	}
	return `${chrome.runtime.getURL('popup.html')}?${params.toString()}`;
}

function parseDetachedPopupUrl(url) {
	if (!url) return null;

	try {
		const parsed = new URL(url);
		const popupUrl = new URL(chrome.runtime.getURL('popup.html'));
		if (parsed.origin !== popupUrl.origin || parsed.pathname !== popupUrl.pathname) {
			return null;
		}
		if (parsed.searchParams.get('detached') !== '1') {
			return null;
		}
		return parsed;
	} catch {
		return null;
	}
}

async function findDetachedPopupWindows() {
	const windows = await chrome.windows.getAll({ populate: true, windowTypes: ['popup'] });
	return windows
		.map((popupWindow) => {
			const popupTab = popupWindow.tabs?.find((tab) => parseDetachedPopupUrl(tab.url));
			if (!popupTab) return null;
			return { popupWindow, popupTab };
		})
		.filter(Boolean);
}

async function focusDetachedPopup(entry, nextUrl) {
	const currentUrl = entry.popupTab.url || '';
	if (currentUrl !== nextUrl && entry.popupTab.id) {
		await chrome.tabs.update(entry.popupTab.id, { url: nextUrl });
	}

	await chrome.windows.update(entry.popupWindow.id, { focused: true });
	if (entry.popupTab.id) {
		await chrome.tabs.update(entry.popupTab.id, { active: true });
	}
}

async function openDetachedPopupForTab(tab) {
	const targetTabId = Number.isInteger(tab?.id) ? tab.id : null;
	const detachedPopupUrl = getDetachedPopupUrl(targetTabId);

	const storageArea = chrome.storage.session || chrome.storage.local;
	await storageArea.set({
		[DETACHED_TARGET_TAB_KEY]: targetTabId,
	});

	const detachedWindows = await findDetachedPopupWindows();
	if (detachedWindows.length) {
		const [primaryWindow, ...duplicateWindows] = detachedWindows;
		await Promise.all(duplicateWindows.map(({ popupWindow }) => chrome.windows.remove(popupWindow.id)));
		await focusDetachedPopup(primaryWindow, detachedPopupUrl);
		return;
	}

	const createdWindow = await chrome.windows.create({
		url: detachedPopupUrl,
		type: 'popup',
		width: 460,
		height: 920,
		focused: true,
	});

	if (createdWindow?.id) {
		await chrome.windows.update(createdWindow.id, { focused: true });
	}

	const createdTabId = createdWindow?.tabs?.[0]?.id;
	if (createdTabId) {
		await chrome.tabs.update(createdTabId, { active: true });
	}
}

chrome.action.onClicked.addListener((tab) => {
	openDetachedPopupForTab(tab).catch((error) => {
		console.error('Could not open detached popup window:', error);
	});
});