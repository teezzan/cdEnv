"use strict";

let mongoose = require("mongoose");
let Schema = mongoose.Schema;

let UserSchema = new Schema({
	username: {
		type: String,
		unique: true,
		index: true,
		lowercase: true,
		required: "Please fill in a username",
		trim: true
	},
	password: {
		type: String,
		required: "Please fill in a password"
	},
	encrypted_user_key: {
		type: String,
		required: "Please fill"
	},
	email: {
		type: String,
		trim: true,
		unique: true,
		index: true,
		lowercase: true,
		required: "Please fill in an email"
	},
	avatar: {
		type: String
	},
	tokens: [{
		key: { type: String },
		key_name: { type: String }
	}]
}, {
	timestamps: true
});


module.exports = mongoose.model("User", UserSchema);
