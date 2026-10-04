const jwt = require('jsonwebtoken');
const { errorBody } = require('../utils/errors');

// Verifies a device's JWT bearer token for the write path.
// The token must (a) be a valid, unexpired JWT, (b) carry the
// 'installation-write' scope, and (c) be bound to the SAME installation
// named in the URL — i.e. per-installation authentication.
function deviceJwtAuth(req, res, next) {
  const header = req.header('Authorization'); // expects "Bearer <token>"
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json(errorBody('NO_TOKEN', 'Missing or malformed bearer token'));
  }

  const token = header.split(' ')[1];

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET); // throws if faked or expired
  } catch (err) {
    return res.status(401).json(errorBody('BAD_TOKEN', 'Invalid or expired token'));
  }

  // scope check: only tokens minted for writing readings may pass
  if (payload.scope !== 'installation-write') {
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