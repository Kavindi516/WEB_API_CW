const express = require('express');
const router = express.Router({ mergeParams: true });
const { SolarInstallation, GenerationReading } = require('../models');
const deviceJwtAuth = require('../middleware/deviceJwtAuth');
const userAuth = require('../middleware/userAuth');
const { installationScopeFilter } = require('../middleware/scopeByJurisdiction');
const { errorBody, sendError } = require('../utils/errors');
const {
  validateReadingParams, validateListReadings, validateCreateReading,
} = require('../validation/schemas');

// shared jurisdiction gate: the installation in the URL must be inside the user's scope
async function assertInstallationInScope(req, res) {
  const installation = await SolarInstallation.findById(req.params.id);
  if (!installation) {
    res.status(404).json(errorBody('NOT_FOUND', 'Installation not found'));
    return null;
  }
  const filter = await installationScopeFilter(req.user);
  const inScope = await SolarInstallation.findOne({ _id: req.params.id, ...filter }).select('_id');
  if (!inScope) {
    res.status(403).json(errorBody('FORBIDDEN', 'This installation is outside your jurisdiction'));
    return null;
  }
  return installation;
}

// GET /installations/:id/readings — paginated, filterable, sortable history
router.get('/', userAuth, validateListReadings, async (req, res) => {
  try {
    if (!(await assertInstallationInScope(req, res))) return;

    const { page, limit, from, to, order } = req.valid.query;
    const filter = { installation: req.params.id };

    if (from || to) {
      filter.timestamp = {};
      if (from) filter.timestamp.$gte = from;
      if (to) filter.timestamp.$lte = to;
    }

    const sort = { timestamp: order === 'asc' ? 1 : -1 };
    const skip = (page - 1) * limit;

    const [readings, total] = await Promise.all([
      GenerationReading.find(filter).sort(sort).skip(skip).limit(limit),
      GenerationReading.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(total / limit);

    // page links keep the caller's filters, so following "next" doesn't silently drop them
    const pageLink = (p) => {
      const params = new URLSearchParams({ page: p, limit });
      if (req.query.from) params.set('from', req.query.from);
      if (req.query.to) params.set('to', req.query.to);
      if (req.query.order) params.set('order', req.query.order);
      return `${req.baseUrl}?${params}`;
    };

    res.json({
      data: readings,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        nextPage: page < totalPages ? pageLink(page + 1) : null,
        prevPage: page > 1 ? pageLink(page - 1) : null,
      },
    });
  } catch (err) {
    sendError(res, err, 'FETCH_FAILED', 'Could not fetch readings');
  }
});

// GET /installations/:id/readings/:readingId — a single reading (atomic resource)
router.get('/:readingId', userAuth, validateReadingParams, async (req, res) => {
  try {
    if (!(await assertInstallationInScope(req, res))) return;

    const reading = await GenerationReading.findOne({
      _id: req.params.readingId,
      installation: req.params.id,
    });
    if (!reading) {
      return res.status(404).json(errorBody('NOT_FOUND', 'Reading not found'));
    }
    res.json(reading);
  } catch (err) {
    sendError(res, err, 'FETCH_FAILED', 'Could not fetch reading');
  }
});

// POST /installations/:id/readings — a device pushes one new reading.
// Order matters: authenticate first (device token only), then validate the payload.
router.post('/', deviceJwtAuth, validateCreateReading, async (req, res) => {
  try {
    // a still-valid token must not keep writing readings for an installation that has since been deleted
    if (!(await SolarInstallation.exists({ _id: req.params.id }))) {
      return res.status(404).json(errorBody('NOT_FOUND', 'Installation not found'));
    }

    const { timestamp, powerKw, energyKwh, voltage } = req.valid.body;

    const reading = await GenerationReading.create({
      installation: req.params.id,
      timestamp: timestamp || new Date(),
      powerKw,
      energyKwh,
      voltage,
    });

    res
      .status(201)
      .location(`${req.baseUrl}/${reading._id}`)
      .json(reading);
  } catch (err) {
    sendError(res, err, 'SAVE_FAILED', 'Could not save reading');
  }
});

module.exports = router;
