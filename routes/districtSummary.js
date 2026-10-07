const express = require('express');
const router = express.Router();
const { District, GridSubstation, SolarInstallation, GenerationReading } = require('../models');
const { errorBody, sendError } = require('../utils/errors');

// GET /districts/:id/generation-summary — processing resource:
// current total power + today's total energy, aggregated across every installation in the district
router.get('/:id/generation-summary', async (req, res) => {
  try {
    const district = await District.findById(req.params.id);
    if (!district) {
      return res.status(404).json(errorBody('NOT_FOUND', 'District not found'));
    }

    // step 1: every substation in this district
    const substations = await GridSubstation.find({ district: req.params.id }).select('_id');
    const substationIds = substations.map((s) => s._id);

    // step 2: every installation on those substations
    const installations = await SolarInstallation.find({ substation: { $in: substationIds } }).select('_id');
    const installationIds = installations.map((i) => i._id);

    if (installationIds.length === 0) {
      return res.json({
        district: district.name,
        installationCount: 0,
        currentTotalPowerKw: 0,
        todayTotalEnergyKwh: 0,
        generatedAt: new Date(),
      });
    }

    // step 3a: current total power — latest reading per installation, summed
    const latestPerInstallation = await GenerationReading.aggregate([
      { $match: { installation: { $in: installationIds } } },
      { $sort: { timestamp: -1 } },
      { $group: { _id: '$installation', latestPower: { $first: '$powerKw' } } },
      { $group: { _id: null, totalPower: { $sum: '$latestPower' } } },
    ]);

    // step 3b: today's energy — delta of the cumulative energy meter across today
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const todayEnergy = await GenerationReading.aggregate([
      { $match: { installation: { $in: installationIds }, timestamp: { $gte: startOfToday } } },
      { $sort: { timestamp: 1 } },
      { $group: {
          _id: '$installation',
          firstEnergyToday: { $first: '$energyKwh' },
          lastEnergyToday: { $last: '$energyKwh' },
      } },
      { $group: {
          _id: null,
          totalEnergy: { $sum: { $subtract: ['$lastEnergyToday', '$firstEnergyToday'] } },
      } },
    ]);

    res.json({
      district: district.name,
      installationCount: installationIds.length,
      currentTotalPowerKw: latestPerInstallation[0]?.totalPower ?? 0,
      todayTotalEnergyKwh: todayEnergy[0]?.totalEnergy ?? 0,
      generatedAt: new Date(),
    });
  } catch (err) {
    sendError(res, err, 'SUMMARY_FAILED', 'Could not compute district summary');
  }
});

module.exports = router;