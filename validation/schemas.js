const { validate, f } = require('../middleware/validate');

const id = f.objectId({ required: true });

// reading timestamps may be a little ahead of the server clock (device clock drift), but not far
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

// ---- path params only ----
const validateIdParam = validate({ params: { id } });
const validateReadingParams = validate({ params: { id, readingId: f.objectId({ required: true }) } });

// ---- POST /auth/login ----
// both must be real strings: this is what stops {"username": {"$ne": null}} style operator injection
const validateLogin = validate({
  body: {
    username: f.string({ required: true, maxLength: 100 }),
    password: f.string({ required: true, maxLength: 200 }),
  },
});

// ---- installations ----
const installationFields = {
  capacityKw: f.number({ required: true, min: 0, exclusiveMin: true }),
  latitude: f.number({ required: true, min: -90, max: 90 }),
  longitude: f.number({ required: true, min: -180, max: 180 }),
  substation: f.objectId({ required: true }),
};

const validateCreateInstallation = validate({
  body: { meterId: f.string({ required: true, trim: true, maxLength: 50 }), ...installationFields },
});
const validateReplaceInstallation = validate({ params: { id }, body: installationFields });

// ---- readings ----
const validateListReadings = validate({
  params: { id },
  query: {
    page: f.int({ min: 1, default: 1 }),
    limit: f.int({ min: 1, max: 200, default: 50 }),
    from: f.date(),
    to: f.date(),
    order: f.enum(['asc', 'desc'], { default: 'desc' }),
  },
  refine: ({ query }) =>
    query.from && query.to && query.from > query.to
      ? [{ location: 'query', field: 'from', message: "must not be later than 'to'" }]
      : [],
});

const validateCreateReading = validate({
  params: { id },
  body: {
    timestamp: f.date({ maxFutureMs: MAX_CLOCK_SKEW_MS }),
    powerKw: f.number({ required: true, min: 0 }),
    energyKwh: f.number({ required: true, min: 0 }),
    voltage: f.number({ required: true, min: 0 }),
  },
});

module.exports = {
  validateIdParam,
  validateReadingParams,
  validateLogin,
  validateCreateInstallation,
  validateReplaceInstallation,
  validateListReadings,
  validateCreateReading,
};
