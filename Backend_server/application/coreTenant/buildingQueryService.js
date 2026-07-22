const legacyQueries = require('../../services/legacyBuildingHttpService');
const { invokeLegacyHandler } = require('./legacyHttpAdapter');

async function listBuildings(input) {
  return invokeLegacyHandler(legacyQueries.getBuildings, input);
}

async function getBuilding(input) {
  return invokeLegacyHandler(legacyQueries.getBuildingById, input);
}

async function checkLocation(input) {
  return invokeLegacyHandler(legacyQueries.checkLocation, input);
}

module.exports = { listBuildings, getBuilding, checkLocation };
