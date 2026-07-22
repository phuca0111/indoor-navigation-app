const { globalSearch } = require('../application/read/searchReadQueryService');

async function search(req, res) {
  try {
    const query = String(req.query.q || '').trim();
    if (query.length < 2) {
      return res.status(400).json({ message: 'Từ khóa cần ít nhất 2 ký tự.' });
    }
    const result = await globalSearch(req.user, query, req.query.limit, {
      cursor: req.query.cursor,
      types: String(req.query.types || '').split(',').map((item) => item.trim()).filter(Boolean),
      withMeta: true
    });
    return res.json({ query, items: result.items, next_cursor: result.next_cursor });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ message: error.message || 'Lỗi tìm kiếm.' });
  }
}

module.exports = { search };
