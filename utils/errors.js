// builds a consistent error response body
function errorBody(code, message, detail = null) {
  return { error: { code, message, detail } };
}

module.exports = { errorBody };