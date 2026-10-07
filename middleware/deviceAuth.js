const crypto = require('crypto');
const { SolarInstallation } = require('../models');
const { errorBody, sendError } = require('../utils/errors');

const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');

// constant-time comparison of two hex digests, so response timing can't leak how much of a key matched
function sameHash(a, b) {
  const bufA = Buffer.from(String(a), 'hex');
  const bufB = Buffer.from(String(b), 'hex');
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

// checks that the request carries a valid device API key,
// AND that the key belongs to the SAME installation named in the URL
async function deviceAuth(req, res, next) {
  try {
    const apiKey = req.header('x-api-key'); // custom header devices must send

    if (!apiKey) {
      return res.status(401).json(errorBody('NO_API_KEY', 'Missing API key'));
    }

    const installation = await SolarInstallation.findById(req.params.id);
    if (!installation) {
      return res.status(404).json(errorBody('NOT_FOUND', 'Installation not found'));
    }

    if (!sameHash(sha256(apiKey), installation.apiKeyHash)) {
      return res.status(403).json(errorBody('INVALID_API_KEY', 'Invalid API key for this installation'));
    }

    req.installation = installation; // hand the route the installation, so it doesn't re-fetch it
    next(); // all good — let the real route run
  } catch (err) {
    sendError(res, err, 'AUTH_FAILED', 'Could not verify API key');
  }
}

module.exports = deviceAuth;
