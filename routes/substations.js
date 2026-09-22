const express = require('express');
const router = express.Router();
const { GridSubstation, SolarInstallation } = require('../models');

// GET /substations — list all, with their district (and that district's province) attached
router.get('/', async (req, res) => {
  try {
    const substations = await GridSubstation.find()
      .populate({
        path: 'district',
        select: 'name code province',
        populate: { path: 'province', select: 'name code' }, // populate can go two levels deep
      })
      .sort({ name: 1 });
    res.json(substations);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch substations' });
  }
});

// GET /substations/:id/installations — only installations at this substation
router.get('/:id/installations', async (req, res) => {
  try {
    const substation = await GridSubstation.findById(req.params.id);
    if (!substation) {
      return res.status(404).json({ error: 'Substation not found' });
    }
    const installations = await SolarInstallation.find({ substation: req.params.id })
      .select('-apiKeyHash')
      .sort({ meterId: 1 });
    res.json(installations);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not fetch installations for this substation' });
  }
});

module.exports = router;