const express = require('express');
const router = express.Router();
const { GridSubstation } = require('../models');

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

module.exports = router;