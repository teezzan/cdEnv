"use strict";

let mongoose = require("mongoose");
let Schema = mongoose.Schema;

let EnvSchema = new Schema({
	title: {
		type: String,
		trim: true,
		required: "Please fill in title"
	},
	author: {
		type: Schema.Types.ObjectId,
		ref: "User",
		required: "Please fill in an author ID",
	},
	team: [],
	keys: [{
		key_name: { type: String },
		value: { type: String }
	}]
}, {
	timestamps: true
});

module.exports = mongoose.model("Env", EnvSchema);
