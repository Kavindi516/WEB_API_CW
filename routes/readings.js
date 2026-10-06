const express = require('express');
const router = express.Router({ mergeParams: true }); // mergeParams lets this router see :id from its parent
const { SolarInstallation, GenerationReading } = require('../models');
const deviceJwtAuth = require('../middleware/deviceJwtAuth');
const { errorBody } = require('../utils/errors');

// GET /installations/:id/readings — paginated, filterable, sortable history
router.get('/', async (req, res) => {
  try {
    const installation = await SolarInstallation.findById(req.params.id);
    if (!installation) {
      return res.status(404).json(errorBody('NOT_FOUND', 'Installation not found'));
    }

    // ---- 1. build the filter ----
    const filter = { installation: req.params.id };

    if (req.query.from || req.query.to) {
      filter.timestamp = {};
      if (req.query.from) filter.timestamp.$gte = new Date(req.query.from); // $gte = greater than or equal
      if (req.query.to) filter.timestamp.$lte = new Date(req.query.to);     // $lte = less than or equal
    }

    // ---- 2. sorting ----
    const sortDir = req.query.order === 'asc' ? 1 : -1; // default newest-first
    const sort = { timestamp: sortDir };

    // ---- 3. pagination ----
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50)); // cap at 200 so nobody requests everything at once
    const skip = (page - 1) * limit;

    // ---- 4. run the query + get a total count, in parallel ----
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
    res.status(500).json(errorBody('FETCH_FAILED', 'Could not fetch readings'));
  }
});

// GET /installations/:id/readings/:readingId — a single reading (atomic resource)
router.get('/:readingId', async (req, res) => {
  try {
    const reading = await GenerationReading.findOne({
      _id: req.params.readingId,
      installation: req.params.id, // must belong to the installation in the URL
    });
    if (!reading) {
      return res.status(404).json(errorBody('NOT_FOUND', 'Reading not found'));
    }
    res.json(reading);
  } catch (err) {
    res.status(500).json(errorBody('FETCH_FAILED', 'Could not fetch reading'));
  }
});

// POST /installations/:id/readings — a device pushes one new reading
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
      .location(`${req.baseUrl}/${reading._id}`) // tells the client where the new resource now lives
      .json(reading);
  } catch (err) {
    res.status(500).json(errorBody('SAVE_FAILED', 'Could not save reading'));
  }
});

module.exports = router;