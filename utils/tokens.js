const jwt = require('jsonwebtoken');

// Two kinds of token exist and they must never be interchangeable:
//   - USER tokens   (audience 'slsea-user')   -> read endpoints, jurisdiction-scoped
//   - DEVICE tokens (audience 'slsea-device') -> write readings for ONE installation
// The audience claim is what keeps them apart. Each middleware only accepts its own.
const ISSUER = 'slsea-api';
const ALGORITHM = 'HS256'; // pinned, so a token can't pick its own algorithm (e.g. "none")
const AUDIENCE = { USER: 'slsea-user', DEVICE: 'slsea-device' };
const DEVICE_SCOPE = 'installation-write';

function secret() {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is not set');
  return process.env.JWT_SECRET;
}

function signUserToken(user) {
  return jwt.sign(
    { userId: user._id, role: user.role, province: user.province, district: user.district },
    secret(),
    { expiresIn: '8h', algorithm: ALGORITHM, issuer: ISSUER, audience: AUDIENCE.USER }
  );
}

function signDeviceToken(installationId) {
  return jwt.sign(
    { installationId: String(installationId), scope: DEVICE_SCOPE },
    secret(),
    { expiresIn: '1h', algorithm: ALGORITHM, issuer: ISSUER, audience: AUDIENCE.DEVICE }
  );
}

// Checks signature, expiry, issuer and algorithm. The audience is checked by the caller
// so it can tell "wrong kind of token" (403) apart from "not a valid token" (401).
function verifyToken(token) {
  return jwt.verify(token, secret(), { algorithms: [ALGORITHM], issuer: ISSUER });
}

// "Authorization: Bearer <token>" -> the token, or null if the header is missing/malformed
function readBearerToken(req) {
  const match = /^Bearer (\S+)$/.exec(req.header('Authorization') || '');
  return match ? match[1] : null;
}

module.exports = { AUDIENCE, DEVICE_SCOPE, signUserToken, signDeviceToken, verifyToken, readBearerToken };
