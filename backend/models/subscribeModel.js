const mongoose = require("mongoose");

const subscribeSchema = new mongoose.Schema({
    deviceFingerprint:{
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    subscription: {
      type: Object,
      required: true,
    }
});

const subscribeModel = mongoose.model("Subscribe", subscribeSchema);

module.exports = subscribeModel;