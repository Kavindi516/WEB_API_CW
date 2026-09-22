const express = require('express');
const router = express.Router();
const { District, GridSubstation } = require('../models');

// GET /districts — list all districts, with their province's name attached
router.get('/', async (req, res) => {
  try {
    const districts = await District.find()
      .populate('province', 'name code') // swap the raw province _id for its name+code
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