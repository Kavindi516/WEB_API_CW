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

    res.json({
      ...installation.toObject(),
      latestReading: latestReading || null,
    });
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch installation' });
  }
});

module.exports = router;