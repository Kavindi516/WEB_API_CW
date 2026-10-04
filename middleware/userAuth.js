const jwt = require('jsonwebtoken');
const { errorBody } = require('../utils/errors');

function userAuth(req, res, next) {
  const header = req.header('Authorization'); // expects: "Bearer <token>"
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json(errorBody('NO_TOKEN', 'Missing or malformed token'));
  }

  const token = header.split(' ')[1];

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET); // throws if faked or expired
    req.user = payload; // attach the decoded info for the route to use
    next();
  } catch (err) {
    return res.status(401).json(errorBody('BAD_TOKEN', 'Invalid or expired token'));
  }
}

module.exports = userAuth;