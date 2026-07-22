const {
  filterCommandItems,
  collectTabCommandsFromButtons
} = require('../../utils/adminCommandPalette');

describe('B6 — admin command palette helpers', () => {
  test('filter theo label/tab', () => {
    const items = [
      { tab: 'finance', label: 'Thu – Chi' },
      { tab: 'analytics', label: 'Phân tích' },
      { tab: 'buildings', label: 'Tòa nhà' }
    ];
    expect(filterCommandItems(items, 'phân').map((i) => i.tab)).toEqual(['analytics']);
    expect(filterCommandItems(items, 'build').map((i) => i.tab)).toEqual(['buildings']);
    expect(filterCommandItems(items, '').length).toBe(3);
  });

  test('collect bỏ tab ẩn/disabled', () => {
    const buttons = [
      { disabled: false, style: { display: '' }, getAttribute: () => 'finance', textContent: 'Thu – Chi' },
      { disabled: true, style: { display: '' }, getAttribute: () => 'cms', textContent: 'CMS' },
      { disabled: false, style: { display: 'none' }, getAttribute: () => 'logs', textContent: 'Nhật ký' },
      { disabled: false, style: { display: '' }, getAttribute: () => 'analytics', textContent: '  Phân tích  ' }
    ];
    expect(collectTabCommandsFromButtons(buttons)).toEqual([
      { tab: 'finance', label: 'Thu – Chi' },
      { tab: 'analytics', label: 'Phân tích' }
    ]);
  });
});
