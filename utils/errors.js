// builds a consistent error response body
function errorBody(code, message, detail = null) {
  return { error: { code, message, detail } };
}

// Maps a thrown error to a consistent response. Client-caused errors become 4xx
// (malformed id -> 400, schema validation -> 400, duplicate key -> 409); anything
// else is treated as a genuine server fault -> 500.
function sendError(res, err, fallbackCode = 'INTERNAL_ERROR', fallbackMessage = 'Something went wrong on the server') {
  if (err && err.name === 'CastError') {
    return res.status(400).json(errorBody('INVALID_ID', `Malformed value for '${err.path}'`));
  }
  if (err && err.name === 'ValidationError') {
    return res.status(400).json(errorBody('VALIDATION_ERROR', err.message));
  }
  if (err && err.code === 11000) {
    return res.status(409).json(errorBody('DUPLICATE', 'A resource with that unique value already exists'));
  }
  console.error(err);
  return res.status(500).json(errorBody(fallbackCode, fallbackMessage));
}

module.exports = { errorBody, sendError };