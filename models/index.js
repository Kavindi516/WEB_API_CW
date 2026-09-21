const mongoose = require('mongoose');
const { Schema } = mongoose;

// ---- Geographic + asset hierarchy ----

const provinceSchema = new Schema({
  name: { type: String, required: true, unique: true },
  code: { type: String, required: true, unique: true }, // e.g. "WP" — used later for jurisdiction filters
});

const districtSchema = new Schema({
  name: { type: String, required: true },
  code: { type: String, required: true, unique: true },
  province: { type: Schema.Types.ObjectId, ref: 'Province', required: true }, // child points to its parent
});

const substationSchema = new Schema({
  name: { type: String, required: true },
  code: { type: String, required: true, unique: true },
  district: { type: Schema.Types.ObjectId, ref: 'District', required: true },
});

const installationSchema = new Schema({
  meterId:    { type: String, required: true, unique: true }, // an ATTRIBUTE — not a separate Device model
  capacityKw: { type: Number, required: true },
  latitude:   { type: Number, required: true },
  longitude:  { type: Number, required: true },
  substation: { type: Schema.Types.ObjectId, ref: 'GridSubstation', required: true },
  apiKeyHash: { type: String, required: true }, // device credential lives on the installation
}, { timestamps: true });

const readingSchema = new Schema({
  installation: { type: Schema.Types.ObjectId, ref: 'SolarInstallation', required: true },
  timestamp:    { type: Date,   required: true },
  powerKw:      { type: Number, required: true }, // instantaneous power
  energyKwh:    { type: Number, required: true }, // cumulative energy
  voltage:      { type: Number, required: true },
});
readingSchema.index({ installation: 1, timestamp: -1 }); // speeds up pagination / sorting / filtering

// ---- User (permissions, not physical hierarchy) ----

const userSchema = new Schema({
  username:     { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  role:     { type: String, enum: ['NATIONAL', 'PROVINCIAL', 'DISTRICT'], required: true },
  province: { type: Schema.Types.ObjectId, ref: 'Province', default: null },
  district: { type: Schema.Types.ObjectId, ref: 'District', default: null },
});

module.exports = {
  Province:          mongoose.model('Province', provinceSchema),
  District:          mongoose.model('District', districtSchema),
  GridSubstation:    mongoose.model('GridSubstation', substationSchema),
  SolarInstallation: mongoose.model('SolarInstallation', installationSchema),
  GenerationReading: mongoose.model('GenerationReading', readingSchema),
  User:              mongoose.model('User', userSchema),
};