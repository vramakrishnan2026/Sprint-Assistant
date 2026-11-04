// Azure DevOps access. Requests run inside the open Azure DevOps tab,
// so they use the person's signed-in session: no tokens, nothing stored.

// Executed in the Azure DevOps page. Must stay self-contained
// (it is serialized and injected, so it cannot use anything outside itself).
async function pageFetchAll(requests, concurrency) {
  const results = new Array(requests.length);
  let next = 0;
  async function worker() {
    while (next < requests.length) {
      const i = next++;
      const r = requests[i];
      try {
        const res = await fetch(r.url, {
          method: r.method || 'GET',
          credentials: 'include',
          headers: Object.assign({
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'X-TFS-FedAuthRedirect': 'Suppress'
          }, r.headers || {}),
          body: r.body ? JSON.stringify(r.body) : undefined
        });
        const text = await res.text();
        let data = null;
        try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
        results[i] = {
          ok: res.ok && data !== null,
          status: res.status,
          etag: res.headers.get('ETag'),
          data: data,
          error: res.ok ? (data === null ? 'Response was not JSON (are you signed in?)' : null)
                        : ((data && data.message) || text.slice(0, 300))
        };
      } catch (e) {
        results[i] = { ok: false, status: 0, data: null, error: String(e) };
      }
    }
  }
  const n = Math.max(1, Math.min(concurrency || 4, requests.length));
  await Promise.all(Array.from({ length: n }, worker));
  return results;
}

const ADO = {
  // Reads organization and project from the tab's URL.
  parseUrl(url, tabId) {
    if (!url) return null;
    let u;
    try { u = new URL(url); } catch (e) { return null; }
    const segs = u.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    let org, base, project;
    if (u.hostname === 'dev.azure.com') {
      org = segs[0];
      project = segs[1];
      base = 'https://dev.azure.com/' + encodeURIComponent(org || '');
    } else if (u.hostname.endsWith('.visualstudio.com')) {
      org = u.hostname.split('.')[0];
      project = segs[0];
      base = u.origin;
    } else {
      return null;
    }
    if (!org || !project || project.startsWith('_')) return null;
    // A work item open in the tab: /_workitems/edit/123 or ?workitem=123
    let workItemId = null;
    const m = u.pathname.match(/\/_workitems\/edit\/(\d+)/i);
    if (m) workItemId = parseInt(m[1], 10);
    else if (/^\d+$/.test(u.searchParams.get('workitem') || '')) workItemId = parseInt(u.searchParams.get('workitem'), 10);
    return { tabId, org, project, base, api: base + '/' + encodeURIComponent(project), workItemId };
  },

  // Picks the context sub-page for an area path.
  // Walks from the deepest area segment up; exact name match first, then "contains" either way.
  matchContextPage(areaPath, subPages) {
    if (!areaPath || !subPages || !subPages.length) return null;
    const pages = subPages.map((p) => ({ path: p.path, name: p.path.split('/').pop().toLowerCase() }));
    const segments = areaPath.split('\\').filter(Boolean).reverse().map((s) => s.toLowerCase());
    for (const seg of segments) {
      const exact = pages.find((p) => p.name === seg);
      if (exact) return exact.path;
      const loose = pages
        .filter((p) => p.name.length >= 3 && (seg.includes(p.name) || p.name.includes(seg)))
        .sort((a, b) => b.name.length - a.name.length)[0];
      if (loose) return loose.path;
    }
    return null;
  },

  async run(ctx, requests, concurrency) {
    if (!requests.length) return [];
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId: ctx.tabId },
      func: pageFetchAll,
      args: [requests, concurrency || 4]
    });
    return injection.result;
  },

  explainError(res) {
    if (!res) return 'No response from Azure DevOps.';
    if (res.status === 401 || res.status === 403 || res.status === 203) {
      return 'Azure DevOps did not accept the request. Make sure you are signed in to Azure DevOps in this tab and have access to this project.';
    }
    if (res.status === 0) return 'Could not reach Azure DevOps: ' + res.error;
    return 'Azure DevOps returned ' + res.status + ': ' + (res.error || 'unknown error');
  },

  // "\Project\Area\Firmware\MyStat" -> "Project\Firmware\MyStat"
  nodePath(rawPath, kind) {
    const parts = (rawPath || '').split('\\').filter(Boolean);
    if (parts[1] === kind) parts.splice(1, 1);
    return { path: parts.join('\\'), depth: parts.length - 1 };
  },

  flattenAreas(root) {
    const out = [];
    const walk = (node) => {
      const p = ADO.nodePath(node.path, 'Area');
      out.push({ path: p.path, name: node.name, depth: p.depth });
      (node.children || []).forEach(walk);
    };
    if (root) walk(root);
    return out;
  },

  flattenIterations(root) {
    const out = [];
    const walk = (node, isRoot) => {
      const p = ADO.nodePath(node.path, 'Iteration');
      if (!isRoot) {
        const a = node.attributes || {};
        out.push({
          path: p.path,
          name: node.name,
          start: a.startDate ? a.startDate.slice(0, 10) : null,
          finish: a.finishDate ? a.finishDate.slice(0, 10) : null
        });
      }
      (node.children || []).forEach((c) => walk(c, false));
    };
    if (root) walk(root, true);
    return out;
  },

  wiqlEscape(s) {
    return String(s).replace(/'/g, "''");
  }
};
