const overpassService = require('../application/overpass/overpassApplicationService');

function send(res, result) {
  return res.status(result.status || 200).json(result.body);
}

function endpoint(useCase) {
  return async (req, res) => {
    try {
      return send(
        res,
        await useCase({
          actor: req.user || null,
          params: req.params || {},
          query: req.query || {},
          body: req.body || {},
        }),
      );
    } catch (error) {
      return res.status(error.status || 500).json({
        message: error.status ? error.message : `Lỗi máy chủ: ${error.message}`,
        ...(error.code ? { code: error.code } : {}),
      });
    }
  };
}

module.exports = {
  getNearby: endpoint(overpassService.nearby),
};
