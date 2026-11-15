// Answers fetched ahead of time (presenter mode, tour.ts), kept for the session so a scene
// shown again is ready at once. `cachedFetch` is a drop-in for `fetch(url, { signal })`:
// a prefetched answer is served from memory, anything else goes to the network. Only
// successful answers are kept; a failed prefetch is forgotten and the next call fetches.

type Stored = { status: number; body: string; type: string };
const store = new Map<string, Promise<Stored>>();

export function prefetch(url: string) {
  if (store.has(url)) return;
  const p = fetch(url).then(async (r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return { status: r.status, body: await r.text(), type: r.headers.get("content-type") ?? "application/json" };
  });
  p.catch(() => store.delete(url));
  store.set(url, p);
}

/** Warms the browser's HTTP cache (tiles sent with Cache-Control), nothing kept here. */
export function warm(url: string) {
  fetch(url).catch(() => {});
}

export function cachedFetch(url: string, init?: { signal?: AbortSignal }): Promise<Response> {
  const hit = store.get(url);
  if (!hit) return fetch(url, init);
  return new Promise((resolve, reject) => {
    const signal = init?.signal;
    const abort = () => reject(new DOMException("The operation was aborted.", "AbortError"));
    if (signal?.aborted) return abort();
    signal?.addEventListener("abort", abort, { once: true });
    hit.then(
      (s) => resolve(new Response(s.body, { status: s.status, headers: { "content-type": s.type } })),
      () => fetch(url, init).then(resolve, reject),
    );
  });
}
