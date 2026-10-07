const express = require('express');
const router = express.Router();
const { GridSubstation, SolarInstallation } = require('../models');
const { errorBody, sendError } = require('../utils/errors');
const { validateIdParam } = require('../validation/schemas');

// GET /substations — list all, with district (and that district's province) attached
router.get('/', async (req, res) => {
  try {
    const substations = await GridSubstation.find()
      .populate({
        path: 'district',
        select: 'name code province',
        populate: { path: 'province', select: 'name code' },
      })
      .sort({ name: 1 });
    res.json(substations);
  } catch (err) {
    sendError(res, err, 'FETCH_FAILED', 'Could not fetch substations');
  }
});

// GET /substations/:id — a single substation (atomic resource)
router.get('/:id', validateIdParam, async (req, res) => {
  try {
    const substation = await GridSubstation.findById(req.params.id)
      .populate({
        path: 'district',
        select: 'name code province',
        populate: { path: 'province', select: 'name code' },
      });
    if (!substation) {
      return res.status(404).json(errorBody('NOT_FOUND', 'Substation not found'));
    }
    res.json(substation);
  } catch (err) {
    sendError(res, err, 'FETCH_FAILED', 'Could not fetch substation');
  }
});

// GET /substations/:id/installations — only installations at this substation
router.get('/:id/installations', validateIdParam, async (req, res) => {
  try {
    const substation = await GridSubstation.findById(req.params.id);
    if (!substation) {
      return res.status(404).json(errorBody('NOT_FOUND', 'Substation not found'));
    }
    const installations = await SolarInstallation.find({ substation: req.params.id })
      .select('-apiKeyHash')
      .sort({ meterId: 1 });
    res.json(installations);
  } catch (err) {
    sendError(res, err, 'FETCH_FAILED', 'Could not fetch installations for this substation');
  }
});

module.exports = router;