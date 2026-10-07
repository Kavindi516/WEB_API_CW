const express = require('express');
const router = express.Router();
const { Province, District } = require('../models');
const { errorBody, sendError } = require('../utils/errors');
const { validateIdParam } = require('../validation/schemas');

// GET /provinces — list all provinces
router.get('/', async (req, res) => {
  try {
    const provinces = await Province.find().sort({ name: 1 });
    res.json(provinces);
  } catch (err) {
    sendError(res, err, 'FETCH_FAILED', 'Could not fetch provinces');
  }
});

// GET /provinces/:id — a single province (atomic resource)
router.get('/:id', validateIdParam, async (req, res) => {
  try {
    const province = await Province.findById(req.params.id);
    if (!province) {
      return res.status(404).json(errorBody('NOT_FOUND', 'Province not found'));
    }
    res.json(province);
  } catch (err) {
    sendError(res, err, 'FETCH_FAILED', 'Could not fetch province');
  }
});

// GET /provinces/:id/districts — only the districts belonging to this one province
router.get('/:id/districts', validateIdParam, async (req, res) => {
  try {
    const province = await Province.findById(req.params.id);
    if (!province) {
      return res.status(404).json(errorBody('NOT_FOUND', 'Province not found'));
    }
    const districts = await District.find({ province: req.params.id }).sort({ name: 1 });
    res.json(districts);
  } catch (err) {
    sendError(res, err, 'FETCH_FAILED', 'Could not fetch districts for this province');
  }
});

module.exports = router;