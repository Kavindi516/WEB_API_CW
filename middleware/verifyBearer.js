const { JsonWebTokenError } = require('jsonwebtoken');
const { errorBody } = require('../utils/errors');
const { AUDIENCE, readBearerToken, verifyToken } = require('../utils/tokens');

const WRONG_TYPE_MESSAGE = {
  [AUDIENCE.USER]: 'This endpoint requires an SLSEA user token; device tokens are not accepted',
  [AUDIENCE.DEVICE]: 'This endpoint requires a device token; user tokens are not accepted',
};

// Shared by userAuth and deviceJwtAuth. Returns the decoded payload when the request carries
// a valid bearer token of the EXPECTED kind; otherwise sends the error response and returns null.
//   401 -> no token, or a token that is forged / expired / not one of ours
//   403 -> a genuine token, but issued for the other audience (device token on a user
//          endpoint, or a user token on a device endpoint)
function verifyBearer(req, res, expectedAudience) {
  const token = readBearerToken(req);
  if (!token) {
    res.status(401).json(errorBody('NO_TOKEN', 'Missing or malformed bearer token'));
    return null;
  }

  let payload;
  try {
    payload = verifyToken(token);
  } catch (err) {
    // only a bad TOKEN is the client's fault; anything else (e.g. JWT_SECRET missing) is a server
    // fault and must surface as a 500, not be disguised as "invalid token"
    if (!(err instanceof JsonWebTokenError)) throw err;
    res.status(401).json(errorBody('BAD_TOKEN', 'Invalid or expired token'));
    return null;
  }

  if (payload.aud !== expectedAudience) {
    if (Object.values(AUDIENCE).includes(payload.aud)) {
      res.status(403).json(errorBody('WRONG_TOKEN_TYPE', WRONG_TYPE_MESSAGE[expectedAudience]));
    } else {
      res.status(401).json(errorBody('BAD_TOKEN', 'Invalid or expired token')); // e.g. pre-audience legacy token
    }
    return null;
  }

  return payload;
}

module.exports = verifyBearer;
