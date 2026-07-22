require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const { getCorsOptions, cspReportOnly } = require('./config/httpSecurity');
const { requestContext } = require('./middlewares/requestContext');
const { requestLogger } = require('./middlewares/requestLogger');
const { apiNotFound, errorHandler } = require('./middlewares/errorHandler');

const DEFAULT_BODY_LIMIT = process.env.HTTP_BODY_LIMIT || '1mb';
const MAP_BODY_LIMIT = '50mb';
const LARGE_MAP_BODY_PATHS = [
  /^\/api\/v1\/buildings\/[^/]+\/floors\/[^/]+\/draft\/?$/,
  /^\/api\/v1\/buildings\/[^/]+\/floors\/[^/]+\/publish(?:\/validate)?\/?$/,
  /^\/api\/maps\/[^/]+\/[^/]+\/(?:draft|publish)\/?$/
];

function usesLargeMapBody(req) {
  return LARGE_MAP_BODY_PATHS.some((pattern) => pattern.test(req.path));
}

function createApp() {
  const app = express();
  app.use(requestContext);
  app.use(requestLogger);
  app.use(cors(getCorsOptions()));
  app.use(helmet({
    contentSecurityPolicy: false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
  }));
  app.use(cspReportOnly);

  app.post(
    '/api/csp-report',
    express.json({ limit: '32kb', type: ['application/csp-report', 'application/reports+json'] }),
    (req, res) => res.status(204).end()
  );

  const regularJson = express.json({ limit: DEFAULT_BODY_LIMIT });
  const largeJson = express.json({ limit: MAP_BODY_LIMIT });
  const regularUrlencoded = express.urlencoded({ limit: DEFAULT_BODY_LIMIT, extended: true });
  const largeUrlencoded = express.urlencoded({ limit: MAP_BODY_LIMIT, extended: true });
  app.use((req, res, next) => (usesLargeMapBody(req) ? largeJson : regularJson)(req, res, next));
  app.use((req, res, next) => (
    usesLargeMapBody(req) ? largeUrlencoded : regularUrlencoded
  )(req, res, next));

  const noCacheHTML = (req, res, next) => {
    if (req.path.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
    next();
  };

  app.get(['/demo', '/demo/', '/demo/index.html'], (req, res) => {
    res.redirect(302, '/login');
  });
  app.get('/blog/:slug', (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.sendFile(path.join(__dirname, 'public', 'blog', 'index.html'));
  });
  app.use('/admin', noCacheHTML, express.static(path.join(__dirname, 'admin'), {
    setHeaders: (res, filepath) => {
      if (filepath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      }
    }
  }));
  app.use('/js', express.static(path.join(__dirname, 'js')));
  app.use('/utils', express.static(path.join(__dirname, 'utils')));
  app.use('/editor', express.static(path.join(__dirname, '../WebMapEditor')));
  app.use(express.static(path.join(__dirname, 'public')));

  const { getLocalRoot } = require('./services/objectStorage');
  const { requestMetrics } = require('./middlewares/requestMetrics');
  const { registerEventHandlers } = require('./services/registerEventHandlers');
  const { maintenanceMode } = require('./middlewares/maintenanceMode');
  const { mountRoutes } = require('./routes/registry');

  mountRoutes(app, {
    requestMetrics,
    registerEventHandlers,
    maintenanceMode,
    uploadRoot: getLocalRoot()
  });

  app.use(apiNotFound);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp, usesLargeMapBody };
