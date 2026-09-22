const express = require('express');
const router = express.Router();
const { SolarInstallation } = require('../models');

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

module.exports = router;