chrome.runtime.onInstalled.addListener(() => {
  // no-op on install; popup handles all navigation
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'GROQ_FETCH') {
    fetch(msg.url, msg.options)
      .then(async (res) => {
        const text = await res.text();
        let data = null;
        try {
          data = JSON.parse(text);
        } catch (e) {
          data = text;
        }
        sendResponse({ ok: res.ok, status: res.status, data });
      })
      .catch((err) => {
        sendResponse({ ok: false, status: 0, error: err.message || 'Network request failed' });
      });
    return true; // Keep channel open for async response
  }
});
