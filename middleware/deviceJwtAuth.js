const { errorBody } = require('../utils/errors');
const { AUDIENCE, DEVICE_SCOPE } = require('../utils/tokens');
const verifyBearer = require('./verifyBearer');

// Protects the WRITE path. The token must (a) be a valid, unexpired DEVICE token
// (user tokens are rejected with 403), (b) carry the 'installation-write' scope, and
// (c) be bound to the SAME installation named in the URL — per-installation authentication.
function deviceJwtAuth(req, res, next) {
  const payload = verifyBearer(req, res, AUDIENCE.DEVICE);
  if (!payload) return;

  // scope check: only tokens minted for writing readings may pass
  if (payload.scope !== DEVICE_SCOPE) {
    return res.status(403).json(errorBody('WRONG_SCOPE', 'Token lacks installation-write scope'));
  }

  // per-installation check: the token must be bound to THIS installation
  if (payload.installationId !== req.params.id) {
    return res.status(403).json(errorBody('WRONG_INSTALLATION', 'Token is not valid for this installation'));
  }

  req.device = payload; // hand the decoded token to the route
  next();
}

module.exports = deviceJwtAuth;
