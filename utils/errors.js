// builds a consistent error response body
function errorBody(code, message, detail = null) {
  return { error: { code, message, detail } };
}

// Maps a thrown error to { status, body }. Client-caused errors become 4xx
// (bad JSON -> 400, oversized body -> 413, malformed id -> 400, schema validation -> 400,
// duplicate key -> 409); anything else is a genuine server fault -> 500 (unexpected: true).
function describeError(err, fallbackCode = 'INTERNAL_ERROR', fallbackMessage = 'Something went wrong on the server') {
  // body-parser (express.json) failures
  if (err && err.type === 'entity.parse.failed') {
    return { status: 400, body: errorBody('INVALID_JSON', 'Request body is not valid JSON') };
  }
  if (err && err.type === 'entity.too.large') {
    return { status: 413, body: errorBody('PAYLOAD_TOO_LARGE', 'Request body is too large') };
  }
  // mongoose
  if (err && err.name === 'CastError') {
    return { status: 400, body: errorBody('INVALID_ID', `Malformed value for '${err.path}'`) };
  }
  if (err && err.name === 'ValidationError') {
    return { status: 400, body: errorBody('VALIDATION_ERROR', err.message) };
  }
  if (err && err.code === 11000) {
    return { status: 409, body: errorBody('DUPLICATE', 'A resource with that unique value already exists') };
  }
  // any other client error raised by a library (e.g. unsupported charset -> 415)
  if (err && Number.isInteger(err.status) && err.status >= 400 && err.status < 500) {
    return { status: err.status, body: errorBody('BAD_REQUEST', 'The request could not be processed') };
  }
  return { status: 500, body: errorBody(fallbackCode, fallbackMessage), unexpected: true };
}

function sendError(res, err, fallbackCode, fallbackMessage) {
  const { status, body, unexpected } = describeError(err, fallbackCode, fallbackMessage);
  if (unexpected) console.error(err);
  return res.status(status).json(body);
}

module.exports = { errorBody, describeError, sendError };
