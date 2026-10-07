const express = require('express');
const router = express.Router();
const { District, GridSubstation } = require('../models');
const userAuth = require('../middleware/userAuth');
const { errorBody, sendError } = require('../utils/errors');
const { validateIdParam } = require('../validation/schemas');

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
    sendError(res, err, 'FETCH_FAILED', 'Could not fetch districts');
  }
});

// GET /districts/:id — a single district (atomic resource)
router.get('/:id', validateIdParam, async (req, res) => {
  try {
    const district = await District.findById(req.params.id).populate('province', 'name code');
    if (!district) {
      return res.status(404).json(errorBody('NOT_FOUND', 'District not found'));
    }
    res.json(district);
  } catch (err) {
    sendError(res, err, 'FETCH_FAILED', 'Could not fetch district');
  }
});

// GET /districts/:id/substations — only substations in this district
router.get('/:id/substations', validateIdParam, async (req, res) => {
  try {
    const district = await District.findById(req.params.id);
    if (!district) {
      return res.status(404).json(errorBody('NOT_FOUND', 'District not found'));
    }
    const substations = await GridSubstation.find({ district: req.params.id }).sort({ name: 1 });
    res.json(substations);
  } catch (err) {
    sendError(res, err, 'FETCH_FAILED', 'Could not fetch substations for this district');
  }
});

module.exports = router;