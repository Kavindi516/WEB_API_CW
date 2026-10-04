const express = require('express');
const router = express.Router();
const { SolarInstallation, GenerationReading } = require('../models');
const userAuth = require('../middleware/userAuth');
const { installationScopeFilter } = require('../middleware/scopeByJurisdiction');

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

// PUT /installations/:id — fully replace an installation's editable fields (idempotent)
router.put('/:id', async (req, res) => {
  try {
    const { capacityKw, latitude, longitude, substation } = req.body;

    if (capacityKw === undefined || latitude === undefined || longitude === undefined || !substation) {
      return res.status(400).json({
        error: { code: 'MISSING_FIELDS', message: 'capacityKw, latitude, longitude and substation are required' },
      });
    }

    const updated = await SolarInstallation.findByIdAndUpdate(
      req.params.id,
      { capacityKw, latitude, longitude, substation }, // meterId and apiKeyHash are NOT editable here
      { new: true, runValidators: true } // return the updated doc, and re-check schema rules
    ).select('-apiKeyHash');

    if (!updated) {
      return res.status(404).json({ error: 'Installation not found' });
    }

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Could not update installation' });
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