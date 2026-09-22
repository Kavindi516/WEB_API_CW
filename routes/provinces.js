const express = require('express');
const router = express.Router();
const { Province } = require('../models');

// GET /provinces — list all provinces
router.get('/', async (req, res) => {
  try {
    const provinces = await Province.find().sort({ name: 1 });
    res.json(provinces);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch provinces' });
  }
});

module.exports = router;