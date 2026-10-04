const crypto = require('crypto');
const { SolarInstallation } = require('../models');
const { errorBody } = require('../utils/errors');

const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');

// checks that the request carries a valid device API key,
// AND that the key belongs to the SAME installation named in the URL
async function deviceAuth(req, res, next) {
  const apiKey = req.header('x-api-key'); // custom header devices must send

  if (!apiKey) {
    return res.status(401).json(errorBody('NO_API_KEY', 'Missing API key'));
  }

  const installation = await SolarInstallation.findById(req.params.id);
  if (!installation) {
    return res.status(404).json(errorBody('NOT_FOUND', 'Installation not found'));
  }

  const providedHash = sha256(apiKey);
  if (providedHash !== installation.apiKeyHash) {
    return res.status(403).json(errorBody('INVALID_API_KEY', 'Invalid API key for this installation'));
  }

  req.installation = installation; // hand the route the installation, so it doesn't re-fetch it
  next(); // all good — let the real route run
}

module.exports = deviceAuth;