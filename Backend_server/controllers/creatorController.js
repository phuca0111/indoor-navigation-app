const { getCreatorStats } = require('../application/creator/creatorApplicationService');

async function meStats(req, res) {
  try {
    const stats = await getCreatorStats(req.user.userId);
    return res.status(200).json(stats);
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
}

module.exports = { meStats };
