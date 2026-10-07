const path = require('path');
const express = require('express');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const { errorBody, sendError } = require('./utils/errors');

// The Express app on its own — no database connection, no listen(). index.js starts it;
// the tests import it directly.
const app = express();
app.set('etag', false);
app.use(express.json()); // lets Express read JSON bodies later, for POST requests

// Content negotiation: this API only produces JSON. If a client explicitly
// asks for something it cannot accept, reject with 406 Not Acceptable.
app.use((req, res, next) => {
  if (req.path.startsWith('/api-docs')) return next(); // Swagger UI serves HTML/assets
  if (req.headers.accept && !req.accepts('application/json')) {
    return res.status(406).json(errorBody('NOT_ACCEPTABLE', 'This API only produces application/json'));
  }
  next();
});

// This is a simple "is it alive" route — good for checking deployment later too
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'SLSEA Solar Generation API' });
});

app.use('/provinces', require('./routes/provinces'));
app.use('/districts', require('./routes/districts'));
app.use('/substations', require('./routes/substations'));
app.use('/installations', require('./routes/installations'));
app.use('/installations/:id/readings', require('./routes/readings'));
app.use('/auth', require('./routes/auth'));
app.use('/districts', require('./routes/districtSummary'));

const swaggerDocument = YAML.load(path.join(__dirname, 'swagger.yaml'));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// requests to routes that don't exist at all
app.use((req, res) => {
  res.status(404).json(errorBody('NOT_FOUND', 'This route does not exist'));
});

// catches anything thrown or passed to next(err) — must be registered LAST.
// Bad JSON bodies, oversized bodies etc. become proper 4xx answers; only real faults are 500.
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  sendError(res, err);
});

module.exports = app;
