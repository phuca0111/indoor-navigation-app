/**
 * B6 — pure helpers cho Cmd+K command palette (dễ unit test).
 */

function filterCommandItems(items, query, limit = 12) {
  const rows = Array.isArray(items) ? items : [];
  const q = String(query || '').trim().toLowerCase();
  const matched = !q
    ? rows
    : rows.filter((item) => {
      const label = String(item.label || '').toLowerCase();
      const tab = String(item.tab || '').toLowerCase();
      return label.includes(q) || tab.includes(q);
    });
  return matched.slice(0, Math.max(1, Number(limit) || 12));
}

function collectTabCommandsFromButtons(buttons) {
  const list = Array.from(buttons || []);
  const out = [];
  list.forEach((btn) => {
    if (!btn || btn.disabled) return;
    const style = btn.style?.display;
    if (style === 'none') return;
    const tab = btn.getAttribute?.('data-tab') || '';
    const label = String(btn.textContent || '').replace(/\s+/g, ' ').trim();
    if (!tab || !label) return;
    out.push({ tab, label });
  });
  return out;
}

module.exports = {
  filterCommandItems,
  collectTabCommandsFromButtons
};
