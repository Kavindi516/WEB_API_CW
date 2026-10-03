const express = require('express');
const router = express.Router();
const { District, GridSubstation, SolarInstallation, GenerationReading } = require('../models');

// GET /districts/:id/generation-summary — processing resource:
// current total power + today's total energy, aggregated across every installation in the district
router.get('/:id/generation-summary', async (req, res) => {
  try {
    const district = await District.findById(req.params.id);
    if (!district) {
      return res.status(404).json({ error: 'District not found' });
    }

    // step 1: find every substation in this district
    const substations = await GridSubstation.find({ district: req.params.id }).select('_id');
    const substationIds = substations.map((s) => s._id);

    // step 2: find every installation on those substations
    const installations = await SolarInstallation.find({ substation: { $in: substationIds } }).select('_id');
    const installationIds = installations.map((i) => i._id);

    if (installationIds.length === 0) {
      return res.json({
        district: district.name,
        installationCount: 0,
        currentTotalPowerKw: 0,
        todayTotalEnergyKwh: 0,
      });
    }

    // step 3a: current total power — the LATEST reading per installation, summed
    const latestPerInstallation = await GenerationReading.aggregate([
      { $match: { installation: { $in: installationIds } } },
      { $sort: { timestamp: -1 } },
      { $group: { _id: '$installation', latestPower: { $first: '$powerKw' } } }, //newest power per installation
      { $group: { _id: null, totalPower: { $sum: '$latestPower' } } },
    ]);

    // step 3b: today's total energy — sum of all readings from today across the district
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const todayEnergy = await GenerationReading.aggregate([
      { $match: { installation: { $in: installationIds }, timestamp: { $gte: startOfToday } } },
      { $group: { _id: null, totalEnergy: { $sum: '$powerKw' } } }, // approximation: see note below
    ]);

    res.json({
      district: district.name,
      installationCount: installationIds.length,
      currentTotalPowerKw: latestPerInstallation[0]?.totalPower ?? 0,
      todayTotalEnergyKwh: todayEnergy[0]?.totalEnergy ?? 0,
      generatedAt: new Date(),
    });
  } catch (err) {
    res.status(500).json({ error: 'Could not compute district summary' });
  }
});

module.exports = router;