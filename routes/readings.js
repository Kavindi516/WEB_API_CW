const express = require('express');
const router = express.Router({ mergeParams: true });
const { SolarInstallation, GenerationReading } = require('../models');
const deviceJwtAuth = require('../middleware/deviceJwtAuth');
const userAuth = require('../middleware/userAuth');
const { installationScopeFilter } = require('../middleware/scopeByJurisdiction');
const { errorBody, sendError } = require('../utils/errors');

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
router.get('/', userAuth, async (req, res) => {
  try {
    if (!(await assertInstallationInScope(req, res))) return;

    const filter = { installation: req.params.id };

    if (req.query.from || req.query.to) {
      filter.timestamp = {};
      if (req.query.from) filter.timestamp.$gte = new Date(req.query.from);
      if (req.query.to) filter.timestamp.$lte = new Date(req.query.to);
    }

    const sortDir = req.query.order === 'asc' ? 1 : -1;
    const sort = { timestamp: sortDir };

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
    const skip = (page - 1) * limit;

    const [readings, total] = await Promise.all([
      GenerationReading.find(filter).sort(sort).skip(skip).limit(limit),
      GenerationReading.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(total / limit);

    res.json({
      data: readings,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        nextPage: page < totalPages ? `${req.baseUrl}?page=${page + 1}&limit=${limit}` : null,
        prevPage: page > 1 ? `${req.baseUrl}?page=${page - 1}&limit=${limit}` : null,
      },
    });
  } catch (err) {
    sendError(res, err, 'FETCH_FAILED', 'Could not fetch readings');
  }
});

// GET /installations/:id/readings/:readingId — a single reading (atomic resource)
router.get('/:readingId', userAuth, async (req, res) => {
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

// POST /installations/:id/readings — a device pushes one new reading (device-authed, unchanged)
router.post('/', deviceJwtAuth, async (req, res) => {
  try {
    const { timestamp, powerKw, energyKwh, voltage } = req.body;

    if (powerKw === undefined || energyKwh === undefined || voltage === undefined) {
      return res.status(400).json(
        errorBody('MISSING_FIELDS', 'powerKw, energyKwh and voltage are required')
      );
    }

    const reading = await GenerationReading.create({
      installation: req.params.id,
      timestamp: timestamp ? new Date(timestamp) : new Date(),
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