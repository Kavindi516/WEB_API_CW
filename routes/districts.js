const express = require('express');
const router = express.Router();
const { District, GridSubstation } = require('../models');
const userAuth = require('../middleware/userAuth');

// GET /districts — list districts, scoped to the logged-in user's jurisdiction
router.get('/', userAuth, async (req, res) => {
  try {
    let filter = {};

    if (req.user.role === 'DISTRICT') {
      filter = { _id: req.user.district };
    } else if (req.user.role === 'PROVINCIAL') {
      filter = { province: req.user.province };
    }
    // NATIONAL → {} → sees all

    const districts = await District.find(filter)
      .populate('province', 'name code')
      .sort({ name: 1 });

    res.json(districts);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch districts' });
  }
});

// GET /districts/:id/substations — only substations in this district
router.get('/:id/substations', async (req, res) => {
  try {
    const district = await District.findById(req.params.id);
    if (!district) {
      return res.status(404).json({ error: 'District not found' });
    }
    const substations = await GridSubstation.find({ district: req.params.id }).sort({ name: 1 });
    res.json(substations);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not fetch substations for this district' });
  }
});

module.exports = router;