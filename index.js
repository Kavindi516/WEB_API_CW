require('dotenv').config();
const express = require('express');
const connectDB = require('./db');
const { errorBody } = require('./utils/errors'); // moved up: used by the 406 middleware below

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

connectDB();

// This is a simple "is it alive" route — good for checking deployment later too
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'SLSEA Solar Generation API' });
});

const provincesRouter = require('./routes/provinces');
app.use('/provinces', provincesRouter);

const districtsRouter = require('./routes/districts');
app.use('/districts', districtsRouter);

const substationsRouter = require('./routes/substations');
app.use('/substations', substationsRouter);

const installationsRouter = require('./routes/installations');
app.use('/installations', installationsRouter);

const readingsRouter = require('./routes/readings');
app.use('/installations/:id/readings', readingsRouter);

const authRouter = require('./routes/auth');
app.use('/auth', authRouter);

const districtSummaryRouter = require('./routes/districtSummary');
app.use('/districts', districtSummaryRouter);

const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const swaggerDocument = YAML.load('./swagger.yaml');

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// catches anything unexpected that falls through — must be registered LAST
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json(errorBody('INTERNAL_ERROR', 'Something went wrong on the server'));
});

// also handle requests to routes that don't exist at all
app.use((req, res) => {
  res.status(404).json(errorBody('NOT_FOUND', 'This route does not exist'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});