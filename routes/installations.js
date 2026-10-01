const express = require('express');
const router = express.Router();
const { SolarInstallation, GenerationReading } = require('../models');

// GET /installations — list all installations, with their substation attached
// deliberately NOT returning apiKeyHash — that field should never leave the server
router.get('/', async (req, res) => {
  try {
    const installations = await SolarInstallation.find()
      .select('-apiKeyHash') // exclude this field from the response
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

    // find just the single newest reading for this installation
    const latestReading = await GenerationReading.findOne({ installation: installation._id })
      .sort({ timestamp: -1 }); // -1 = descending, so "first" = newest

    res.json({
      ...installation.toObject(), // spread the installation's own fields
      latestReading: latestReading || null, // attach the extra related data
    });
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch installation' });
  }
});

module.exports = router;