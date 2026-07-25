const { getCreatorStats } = require('../application/creator/creatorApplicationService');

async function meStats(req, res) {
  try {
    const stats = await getCreatorStats(req.user.userId, {
      // BUILDING_ADMIN: tòa được gán (không phải owner/created_by)
      assignedBuildingIds: req.user.member_building_ids || []
    });
    return res.status(200).json(stats);
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
}

module.exports = { meStats };
