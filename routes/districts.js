const express = require('express');
const router = express.Router();
const { District } = require('../models');

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

module.exports = router;