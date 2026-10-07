const { District, GridSubstation } = require('../models');

async function installationScopeFilter(user) {
  if (user.role === 'NATIONAL') {
    return {};
  }

  if (user.role === 'DISTRICT') {
    const substations = await GridSubstation.find({ district: user.district }).select('_id');
    const substationIds = substations.map((s) => s._id);
    return { substation: { $in: substationIds } }; // $in = "matches any of these"
  }

  if (user.role === 'PROVINCIAL') {
    const districts = await District.find({ province: user.province }).select('_id');
    const districtIds = districts.map((d) => d._id);
    const substations = await GridSubstation.find({ district: { $in: districtIds } }).select('_id');
    const substationIds = substations.map((s) => s._id);
    return { substation: { $in: substationIds } };
  }

  return { _id: null }; // unknown role, matches nothing
}

// Is this district inside the user's jurisdiction?
function districtInScope(user, district) {
  if (user.role === 'NATIONAL') return true;
  if (user.role === 'PROVINCIAL') return String(district.province) === String(user.province);
  if (user.role === 'DISTRICT') return String(district._id) === String(user.district);
  return false;
}

module.exports = { installationScopeFilter, districtInScope };