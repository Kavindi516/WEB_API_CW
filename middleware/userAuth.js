const { errorBody } = require('../utils/errors');
const { AUDIENCE } = require('../utils/tokens');
const verifyBearer = require('./verifyBearer');

const ROLES = ['NATIONAL', 'PROVINCIAL', 'DISTRICT'];

// Protects the READ endpoints: only an SLSEA user token (from /auth/login) gets through.
// Device tokens are rejected with 403 even though they are validly signed.
function userAuth(req, res, next) {
  const payload = verifyBearer(req, res, AUDIENCE.USER);
  if (!payload) return;

  // belt and braces: a user token always carries a userId and a known role
  if (!payload.userId || !ROLES.includes(payload.role)) {
    return res.status(401).json(errorBody('BAD_TOKEN', 'Invalid or expired token'));
  }

  req.user = payload; // attach the decoded info for the route to use
  next();
}

module.exports = userAuth;
