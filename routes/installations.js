const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { SolarInstallation, GenerationReading, GridSubstation } = require('../models'); 
const { errorBody } = require('../utils/errors');
const userAuth = require('../middleware/userAuth');
const { installationScopeFilter } = require('../middleware/scopeByJurisdiction');
const jwt = require('jsonwebtoken');
const deviceAuth = require('../middleware/deviceAuth');

const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');

// GET /installations — scoped by the logged-in user's jurisdiction
router.get('/', userAuth, async (req, res) => {
  try {
    const filter = await installationScopeFilter(req.user);

    const installations = await SolarInstallation.find(filter)
      .select('-apiKeyHash')
      .populate('substation', 'name code')
      .sort({ meterId: 1 });

    res.json(installations);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch installations' });
  }
});

// GET /installations/:id/last-reading — operational view: just the newest reading
router.get('/:id/last-reading', async (req, res) => {
  try {
    const installation = await SolarInstallation.findById(req.params.id);
    if (!installation) {
      return res.status(404).json({ error: 'Installation not found' });
    }

    const reading = await GenerationReading.findOne({ installation: req.params.id })
      .sort({ timestamp: -1 });

    if (!reading) {
      return res.status(404).json({ error: 'No readings yet for this installation' });
    }

    res.json(reading);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch last reading' });
  }
});

// GET /installations/:id — composite: the installation + its latest reading
router.get('/:id', async (req, res) => {
  try {
    const installation = await SolarInstallation.findById(req.params.id)
      .select('-apiKeyHash')
      .populate({
        path: 'substation',
        select: 'name code district',
        populate: { path: 'district', select: 'name code province', populate: { path: 'province', select: 'name code' } },
      });

    if (!installation) {
      return res.status(404).json({ error: 'Installation not found' });
    }

    const latestReading = await GenerationReading.findOne({ installation: installation._id })
      .sort({ timestamp: -1 });

    const payload = {
      ...installation.toObject(),
      latestReading: latestReading || null,
    };

    const body = JSON.stringify(payload);
    const etag = require('etag')(body); // fingerprint of this exact response body

    res.set('ETag', etag);
    res.set('Last-Modified', installation.updatedAt.toUTCString()); // used as If-Unmodified-Since on PUT

    // conditional GET: if the client already holds this exact version, send nothing
    const ifNoneMatch = req.headers['if-none-match'];
    if (ifNoneMatch && ifNoneMatch === etag) {
      return res.status(304).end();
    }

    res.type('application/json').send(body);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch installation' });
  }
});

// POST /installations/:id/token — bootstrap: a device presents its long-lived
// API key (x-api-key) and receives a short-lived, installation-scoped JWT.
// deviceAuth verifies the key belongs to THIS installation before we sign anything.
router.post('/:id/token', deviceAuth, async (req, res) => {
  const token = jwt.sign(
    { installationId: req.params.id, scope: 'installation-write' },
    process.env.JWT_SECRET,
    { expiresIn: '1h' } // short-lived access token; the API key stays the long-lived secret
  );
  res.json({ token, tokenType: 'Bearer', expiresIn: 3600, scope: 'installation-write' });
});

// POST /installations — provision a new solar installation.
// Generates the device's API key, stores only its hash, and returns the plain
// key ONCE in the response (the device then uses it at /installations/{id}/token).
router.post('/', async (req, res) => {
  try {
    const { meterId, capacityKw, latitude, longitude, substation } = req.body;

    if (!meterId || capacityKw === undefined || latitude === undefined ||
        longitude === undefined || !substation) {
      return res.status(400).json(
        errorBody('MISSING_FIELDS', 'meterId, capacityKw, latitude, longitude and substation are required')
      );
    }

    // the substation must exist, so we never orphan an installation
    const sub = await GridSubstation.findById(substation);
    if (!sub) {
      return res.status(400).json(errorBody('INVALID_SUBSTATION', 'substation does not exist'));
    }

    const apiKey = crypto.randomBytes(24).toString('hex'); // device secret, shown once
    const installation = await SolarInstallation.create({
      meterId, capacityKw, latitude, longitude, substation,
      apiKeyHash: sha256(apiKey), // we store only the hash
    });

    const safe = installation.toObject();
    delete safe.apiKeyHash; // never expose the stored hash

    res
      .status(201)
      .location(`${req.baseUrl}/${installation._id}`)
      .json({ ...safe, apiKey }); // apiKey returned once so the device can authenticate
  } catch (err) {
    if (err.code === 11000) { // duplicate meterId (unique index)
      return res.status(409).json(errorBody('DUPLICATE_METER', 'An installation with this meterId already exists'));
    }
    res.status(500).json(errorBody('CREATE_FAILED', 'Could not create installation'));
  }
});

// PUT /installations/:id — fully replace an installation's editable fields (idempotent)
router.put('/:id', async (req, res) => {
  try {
    const { capacityKw, latitude, longitude, substation } = req.body;

    if (capacityKw === undefined || latitude === undefined || longitude === undefined || !substation) {
      return res.status(400).json(
        errorBody('MISSING_FIELDS', 'capacityKw, latitude, longitude and substation are required')
      );
    }

    const existing = await SolarInstallation.findById(req.params.id);
    if (!existing) {
      return res.status(404).json(errorBody('NOT_FOUND', 'Installation not found'));
    }

    // optimistic concurrency: if the client sent If-Unmodified-Since, only proceed
    // when the resource has NOT changed since they last fetched it.
    const ifUnmodifiedSince = req.header('If-Unmodified-Since');
    if (ifUnmodifiedSince) {
      const since = new Date(ifUnmodifiedSince);
      const lastModifiedSec = Math.floor(existing.updatedAt.getTime() / 1000); // Last-Modified is second-precision
      const sinceSec = Math.floor(since.getTime() / 1000);
      if (isNaN(since.getTime()) || lastModifiedSec > sinceSec) {
        return res.status(412).json(
          errorBody('PRECONDITION_FAILED', 'Installation has changed since you last fetched it; re-fetch and retry')
        );
      }
    }

    const updated = await SolarInstallation.findByIdAndUpdate(
      req.params.id,
      { capacityKw, latitude, longitude, substation }, // meterId and apiKeyHash are NOT editable here
      { new: true, runValidators: true }
    ).select('-apiKeyHash');

    res.set('Last-Modified', updated.updatedAt.toUTCString());
    res.json(updated);
  } catch (err) {
    res.status(500).json(errorBody('UPDATE_FAILED', 'Could not update installation'));
  }
});

// DELETE /installations/:id — remove an installation
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await SolarInstallation.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Installation not found' });
    }
    res.status(204).send(); // 204 = success, nothing to return
  } catch (err) {
    res.status(500).json({ error: 'Could not delete installation' });
  }
});


module.exports = router;