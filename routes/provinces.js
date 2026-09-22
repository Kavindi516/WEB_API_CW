const express = require('express');
const router = express.Router();
const { Province, District } = require('../models');

// GET /provinces — list all provinces
router.get('/', async (req, res) => {
  try {
    const provinces = await Province.find().sort({ name: 1 });
    res.json(provinces);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not fetch provinces' });
  }
});

// GET /provinces/:id/districts — only the districts belonging to this one province
router.get('/:id/districts', async (req, res) => {
  try {
    const province = await Province.findById(req.params.id);
    if (!province) {
      return res.status(404).json({ error: 'Province not found' });
    }
    const districts = await District.find({ province: req.params.id }).sort({ name: 1 });
    res.json(districts);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not fetch districts for this province' });
  }
});

module.exports = router;