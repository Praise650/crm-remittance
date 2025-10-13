// backend/models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: {
      type: String,
      required: true,
      enum: [
        'super_admin',
        'administrator',
        'accountant',
        'zonal_coordinator',
        'national_coordinator',
        'assistant_national_coordinator_secondary_school_outreach',
        'fellowship_president_rcf',
        'fellowship_president_rccf',
      ],
      default: 'fellowship_president_rcf',
    },
    fellowship: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Fellowship',
      unique: true,
      sparse: true,
      required: function () {
        return this.role.includes('fellowship_president');
      },
    },
    zone: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Zone',
      unique: true,
      sparse: true,
      required: function () {
        return this.role === 'zonal_coordinator';
      },
    },
    profilePicture: {
      type: String,
      default: '/uploads/default-profile.png',
    },
  },
  { timestamps: true }
);

// --- Password Hashing Middleware ---
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// --- Password Matching Method ---
userSchema.methods.matchPassword = async function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};

// ✅ Fix: Only compile model if not already compiled
const User = mongoose.models.User || mongoose.model('User', userSchema);

module.exports = User;
