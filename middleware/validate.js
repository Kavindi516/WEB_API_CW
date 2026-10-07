const { errorBody } = require('../utils/errors');

// A small, dependency-free validation layer. A route declares what it accepts:
//
//   validate({
//     params: { id: f.objectId({ required: true }) },
//     query:  { page: f.int({ min: 1, default: 1 }) },
//     body:   { powerKw: f.number({ required: true, min: 0 }) },
//   })
//
// The middleware checks types and ranges BEFORE any database work. On success the cleaned,
// correctly-typed values are put on req.valid.{params,query,body} (unknown body fields are
// dropped, so a client can never smuggle extra fields into a write). On failure it answers 400
// with every problem listed in error.detail.

const OBJECT_ID = /^[a-f\d]{24}$/i;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})(T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})?)?$/;
const JSON_CONTENT_TYPE = /^application\/(?:[\w.+-]+\+)?json\s*(;|$)/i;

// ---- field builders -------------------------------------------------------------------------
const f = {
  objectId: (opts = {}) => ({ type: 'objectId', ...opts }),
  string: (opts = {}) => ({ type: 'string', ...opts }),     // opts: minLength, maxLength, trim
  number: (opts = {}) => ({ type: 'number', ...opts }),     // opts: min, max, exclusiveMin (JSON numbers only)
  int: (opts = {}) => ({ type: 'int', ...opts }),           // opts: min, max (accepts "12" from a query string)
  date: (opts = {}) => ({ type: 'date', ...opts }),         // ISO-8601 string -> Date. opts: maxFutureMs
  enum: (values, opts = {}) => ({ type: 'enum', values, ...opts }),
};

const ok = (value) => ({ value });
const fail = (message) => ({ error: message });

function checkField(spec, raw) {
  switch (spec.type) {
    case 'objectId':
      return typeof raw === 'string' && OBJECT_ID.test(raw) ? ok(raw) : fail('must be a 24-character hex ObjectId');

    case 'string': {
      if (typeof raw !== 'string') return fail('must be a string');
      const value = spec.trim ? raw.trim() : raw;
      const min = spec.minLength ?? 1; // an empty string is never a useful value
      if (value.length < min) return fail(min === 1 ? 'must not be empty' : `must be at least ${min} characters`);
      if (spec.maxLength !== undefined && value.length > spec.maxLength) {
        return fail(`must be at most ${spec.maxLength} characters`);
      }
      return ok(value);
    }

    case 'number': {
      if (typeof raw !== 'number' || !Number.isFinite(raw)) return fail('must be a number');
      if (spec.min !== undefined && (spec.exclusiveMin ? raw <= spec.min : raw < spec.min)) {
        return fail(spec.exclusiveMin ? `must be greater than ${spec.min}` : `must be at least ${spec.min}`);
      }
      if (spec.max !== undefined && raw > spec.max) return fail(`must be at most ${spec.max}`);
      return ok(raw);
    }

    case 'int': {
      const n = typeof raw === 'string' && /^\d{1,15}$/.test(raw) ? Number(raw) : raw;
      if (!Number.isSafeInteger(n)) return fail('must be an integer');
      if (spec.min !== undefined && n < spec.min) return fail(`must be at least ${spec.min}`);
      if (spec.max !== undefined && n > spec.max) return fail(`must be at most ${spec.max}`);
      return ok(n);
    }

    case 'date': {
      const m = typeof raw === 'string' ? ISO_DATE.exec(raw) : null;
      if (!m) return fail('must be an ISO-8601 date or date-time (e.g. 2025-06-01 or 2025-06-01T10:30:00Z)');
      const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
      const probe = new Date(Date.UTC(y, mo - 1, d)); // catches impossible days like 2025-02-30
      if (probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) return fail('is not a real calendar date');
      const value = new Date(raw);
      if (Number.isNaN(value.getTime())) return fail('is not a valid date');
      if (spec.maxFutureMs !== undefined && value.getTime() > Date.now() + spec.maxFutureMs) {
        return fail('must not be in the future');
      }
      return ok(value);
    }

    case 'enum':
      return spec.values.includes(raw) ? ok(raw) : fail(`must be one of: ${spec.values.join(', ')}`);

    default:
      throw new Error(`Unknown validation type '${spec.type}'`);
  }
}

const isPlainObject = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

// validates one location (params / query / body) against its field specs
function checkLocation(location, specs, source, errors) {
  const clean = {};
  const input = source === undefined ? {} : source; // express 5: req.body is undefined when no body was sent

  if (!isPlainObject(input)) {
    errors.push({ location, field: null, message: 'must be a JSON object' });
    return clean;
  }

  for (const [field, spec] of Object.entries(specs)) {
    const raw = Object.prototype.hasOwnProperty.call(input, field) ? input[field] : undefined;
    const absent = raw === undefined || (location === 'query' && raw === '');

    if (absent) {
      if (spec.required) errors.push({ location, field, message: 'is required' });
      else if (spec.default !== undefined) clean[field] = spec.default;
      continue;
    }

    const result = checkField(spec, raw);
    if (result.error) errors.push({ location, field, message: result.error });
    else clean[field] = result.value;
  }
  return clean;
}

function validate({ params, query, body, refine } = {}) {
  return (req, res, next) => {
    // a body is only readable when sent as JSON; anything else is 415, not a pile of "required" errors
    const contentType = req.headers['content-type'];
    if (body && contentType && !JSON_CONTENT_TYPE.test(contentType)) {
      return res.status(415).json(
        errorBody('UNSUPPORTED_MEDIA_TYPE', 'Request body must be sent as application/json')
      );
    }

    const errors = [];
    const valid = {};
    if (params) valid.params = checkLocation('params', params, req.params, errors);
    if (query) valid.query = checkLocation('query', query, req.query, errors);
    if (body) valid.body = checkLocation('body', body, req.body, errors);

    // cross-field rules (e.g. from <= to) only make sense once every field is individually valid
    if (errors.length === 0 && refine) errors.push(...refine(valid));

    if (errors.length > 0) {
      // a bad path id keeps the long-standing INVALID_ID code; everything else is VALIDATION_ERROR
      const onlyParams = errors.every((e) => e.location === 'params');
      return res.status(400).json(
        onlyParams
          ? errorBody('INVALID_ID', 'Malformed resource identifier', errors)
          : errorBody('VALIDATION_ERROR', 'Request validation failed', errors)
      );
    }

    req.valid = valid;
    next();
  };
}

module.exports = { validate, f, checkField };
