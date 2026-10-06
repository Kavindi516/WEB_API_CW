const { errorBody } = require('../utils/errors');

// Administrative mutations (provision / edit / delete an installation) may only
// be performed by a NATIONAL-role user. Must run AFTER userAuth, which verifies
// the JWT and sets req.user.
function requireNational(req, res, next) {
  if (!req.user || req.user.role !== 'NATIONAL') {
    return res.status(403).json(errorBody('FORBIDDEN', 'National-role access required'));
  }
  next();
}

module.exports = requireNational;