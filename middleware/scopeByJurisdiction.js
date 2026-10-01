// builds a MongoDB filter based on the logged-in user's role + jurisdiction
function scopeFilterForUser(user) {
  if (user.role === 'NATIONAL') return {}; // no restriction — sees everything
  if (user.role === 'PROVINCIAL') return { province: user.province };
  if (user.role === 'DISTRICT') return { district: user.district };
  return { _id: null }; // unknown role — matches nothing, safe default
}

module.exports = { scopeFilterForUser };