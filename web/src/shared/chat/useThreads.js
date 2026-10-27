// Thread storage shared by the Guard panel and the chat: localStorage with a
// debounced writer, a flush on pagehide, import/export and a 'repair' hook.
import { useCallback, useEffect, useRef, useState } from 'react';

export default function useThreads(key, { repair, extra = {} } = {}) {
  const [data, setData] = useState(() => {
    let threads = [], activeId = null, ext = { ...extra };
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const p = JSON.parse(raw);
        threads = Array.isArray(p.threads) ? p.threads.filter(t => t && t.id && Array.isArray(t.messages)) : [];
        if (repair) repair(threads);
        activeId = threads.some(t => t.id === p.activeThreadId) ? p.activeThreadId : null;
        Object.keys(extra).forEach(k => { if (p[k] !== undefined) ext[k] = p[k]; });
      }
    } catch (e) { console.warn(e); }
    return { threads, activeId, ext };
  });
  const latest = useRef(data); latest.current = data;
  const timer = useRef(0);
  const onFull = useRef(null);

  const write = useCallback(() => {
    const d = latest.current;
    try {
      localStorage.setItem(key, JSON.stringify({ threads: d.threads, activeThreadId: d.activeId, ...d.ext }));
    } catch (e) { onFull.current && onFull.current(e); }
  }, [key]);

  useEffect(() => { clearTimeout(timer.current); timer.current = setTimeout(write, 120); }, [data]);
  useEffect(() => {
    const flush = () => { clearTimeout(timer.current); write(); };
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, [write]);

  const api = {
    threads: data.threads,
    activeId: data.activeId,
    ext: data.ext,
    active: data.threads.find(t => t.id === data.activeId) || null,
    get: () => latest.current,
    onStorageFull: fn => { onFull.current = fn; },
    setActive: id => setData(d => ({ ...d, activeId: id })),
    setExt: (k, v) => setData(d => ({ ...d, ext: { ...d.ext, [k]: v } })),
    add: thread => setData(d => ({ ...d, threads: [thread, ...d.threads], activeId: thread.id })),
    update: (id, fn) => setData(d => ({ ...d, threads: d.threads.map(t => (t.id === id ? fn(t) : t)) })),
    remove: id => setData(d => ({ ...d, threads: d.threads.filter(t => t.id !== id), activeId: d.activeId === id ? null : d.activeId })),
    restore: (thread, makeActive) => setData(d => (d.threads.some(t => t.id === thread.id) ? d : { ...d, threads: [...d.threads, thread], activeId: makeActive ? thread.id : d.activeId })),
    clear: () => setData(d => ({ ...d, threads: [], activeId: null })),
    merge: list => {
      const have = new Set(latest.current.threads.map(t => t.id));
      const add = list.filter(t => t && typeof t.id === 'string' && Array.isArray(t.messages) && !have.has(t.id));
      if (add.length) setData(d => ({ ...d, threads: [...d.threads, ...add.filter(t => !d.threads.some(x => x.id === t.id))] }));
      return add.length;
    },
    findMessage: id => {
      for (const t of latest.current.threads) { const m = t.messages.find(x => x.id === id); if (m) return { thread: t, msg: m }; }
      return null;
    }
  };
  return api;
}

export function groupThreads(list) {
  const now = Date.now(), day = 86400000;
  const groups = [['امروز', []], ['۷ روز گذشته', []], ['قدیمی‌تر', []]];
  list.forEach(t => {
    const age = now - (t.updatedAt || t.createdAt || now);
    groups[age < day ? 0 : age < day * 7 ? 1 : 2][1].push(t);
  });
  return groups.filter(g => g[1].length);
}
