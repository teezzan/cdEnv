"use strict";

const { MoleculerClientError } = require("moleculer").Errors;

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const DbService = require("moleculer-db");
const MongooseAdapter = require("moleculer-db-adapter-mongoose");
const User = require("../models/user.model");
const crypto = require('crypto');
const pbkdf2 = require('pbkdf2')
const uuidAPIKey = require('uuid-apikey');
const key = pbkdf2.pbkdf2Sync(process.env.AES_KEY, 'salt', 1, 32, 'sha512');
const iv = pbkdf2.pbkdf2Sync(process.env.AES_IV, 'salt', 1, 16, 'sha512');
const d_iv = pbkdf2.pbkdf2Sync(process.env.AES_DATA_IV, 'salt', 1, 16, 'sha512');
const server = `${process.env.SERVER}`;

module.exports = {
	name: "users",
	mixins: [
		DbService
	],
	adapter: new MongooseAdapter(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true }),
	model: User,

	/**
	 * Default settings
	 */
	settings: {
		cors: {
			origin: "*",
			methods: ["GET", "OPTIONS", "POST", "PUT", "DELETE"],
			allowedHeaders: [],
			exposedHeaders: [],
			credentials: false,
			maxAge: 3600
		},
		/** REST Basepath */
		rest: "/users",
		/** Secret for JWT */
		JWT_SECRET: process.env.JWT_SECRET || "jwt-conduit-secret",

		/** Public fields */
		fields: ["_id", "username", "email", "avatar", "tokens"],

		entityValidator: {
			username: { type: "string", min: 2 },
			password: { type: "string", min: 6 },
			email: { type: "email" },
			avatar: { type: "string", optional: true },
		}
	},

	/**
	 * Actions
	 */
	actions: {
		/**
		 * Register a new user
		 *
		 * @actions
		 * @param {Object} user - User entity
		 *
		 * @returns {Object} Created entity & token
		 */
		create: {
			auth: "required",
			params: {
				user: { type: "object" }
			},
			async handler(ctx) {
				let entity = ctx.params.user;
				await this.validateEntity(entity);
				if (entity.username) {
					const found = await this.adapter.findOne({ username: entity.username });
					if (found)
						throw new MoleculerClientError("Username exist!", 422, "", [{ field: "username", message: "is exist" }]);
				}

				if (entity.email) {
					const found = await this.adapter.findOne({ email: entity.email });
					if (found)
						throw new MoleculerClientError("Email exist!", 422, "", [{ field: "email", message: "is exist" }]);
				}

				entity.password = bcrypt.hashSync(entity.password, 10);

				let derivedKey = pbkdf2.pbkdf2Sync(entity.password, 'salt', 1, 32, 'sha512');
				let user_key = crypto.randomBytes(32).toString("hex")
				entity.encrypted_user_key = this.encrypt(user_key, derivedKey);

				entity.createdAt = new Date();
				console.log(entity);
				const doc = await this.adapter.insert(entity);
				const user = await this.transformDocuments(ctx, {}, doc);
				const json = await this.transformEntity(user, true, ctx.meta.token);
				await this.entityChanged("created", json, ctx);
				return json;
			}
		},
		createRegLink: {
			rest: "POST /register",
			params: {
				user: { type: "object" }
			},
			async handler(ctx) {
				let entity = ctx.params.user;
				await this.validateEntity(entity);
				if (entity.username) {
					const found = await this.adapter.findOne({ username: entity.username });
					if (found)
						throw new MoleculerClientError("Username is exist!", 422, "", [{ field: "username", message: "is exist" }]);
				}

				if (entity.email) {
					const found = await this.adapter.findOne({ email: entity.email });
					if (found)
						throw new MoleculerClientError("Email is exist!", 422, "", [{ field: "email", message: "is exist" }]);
				}

				entity.expiresAt = Date.now() + (1000 * 60 * 60 * 2);

				let cipher = this.encrypt(JSON.stringify(entity))
				let payload = { email: entity.email, url: `${server}/api/users/confirm/${cipher}` }
				if (process.env.SEND_CONFIRMATION_MAIL == 'true') {
					console.log(process.env.SEND_CONFIRMATION_MAIL);
					console.log("Sending");
					let user = await ctx.call("notification.sendMail", { user: payload });
					console.log(payload)

					return { status: "success", msg: "Awaiting Email confirmation", email: entity.email };
				}
				else {
					let user = await ctx.call("users.create", { user: entity });
					return user
				}
			}
		},
		confirmRegLink: {
			rest: "GET /confirm/:cipher",
			async handler(ctx) {
				try {

					let entity = ctx.params.cipher;
					entity = JSON.parse(this.decrypt(entity));
					if (entity.expiresAt > Date.now()) {


						if (entity.username) {
							const found = await this.adapter.findOne({ username: entity.username });
							if (found)
								entity.username = entity.username + `${this.randomint(1, 1000)}`;
						}

						if (entity.email) {
							const found = await this.adapter.findOne({ email: entity.email });
							if (found)
								throw new MoleculerClientError("Already Registered!", 422, "", [{ field: "email", message: "exist" }]);
						}
						let user = await ctx.call("users.create", { user: entity });
						user.user.token = "";
						return user
					} else {
						throw new MoleculerClientError("EXPIRED Link", 400, "", [{ field: "Link", message: "Expired" }]);

					}

				}
				catch (err) {
					console.log(err)
					throw new MoleculerClientError("Bad Confimation Link", 400, "", [{ field: "Compromised", message: "Link" }]);
				}
			}
		},
		/**
		 * Login with username & password
		 *
		 * @actions
		 * @param {Object} user - User credentials
		 *
		 * @returns {Object} Logged in user with token
		 */
		login: {
			rest: "POST /login",
			params: {
				user: {
					type: "object", props: {
						email: { type: "email" },
						password: { type: "string", min: 1 }
					}
				}
			},
			async handler(ctx) {
				const { email, password } = ctx.params.user;

				const user = await this.adapter.findOne({ email });
				if (!user)
					throw new MoleculerClientError("Email or password is invalid!", 422, "", [{ field: "email", message: "is not found" }]);

				const res = await bcrypt.compare(password, user.password);
				if (!res)
					throw new MoleculerClientError("Wrong password!", 422, "", [{ field: "email", message: "is not found" }]);

				// Transform user entity (remove password and all protected fields)
				const doc = await this.transformDocuments(ctx, {}, user);
				return await this.transformEntity(doc, true, ctx.meta.token);

			}
		},

		/**
		 * Get user by JWT token (for API GW authentication)
		 *
		 * @actions
		 * @param {String} token - JWT token
		 *
		 * @returns {Object} Resolved user
		 */
		resolveToken: {
			params: {
				token: "string"
			},
			async handler(ctx) {
				const decoded = await new this.Promise((resolve, reject) => {
					jwt.verify(ctx.params.token, this.settings.JWT_SECRET, (err, decoded) => {
						if (err)
							return reject(err);

						resolve(decoded);
					});
				});

				if (decoded.id) {
					return await this.getById(decoded.id);

				}
			}
		},

		/**
		 * Get current user entity.
		 * Auth is required!
		 *
		 * @actions
		 *
		 * @returns {Object} User entity
		 */
		me: {
			auth: "required",
			rest: "GET /me",
			async handler(ctx) {
				const user = await this.getById(ctx.meta.user._id);
				if (!user)
					throw new MoleculerClientError("User not found!", 400);

				const doc = await this.transformDocuments(ctx, {}, user);
				let raw_token = doc.tokens;
				for (let i = 0; i < raw_token.length; i++) {
					let temp = uuidAPIKey.toAPIKey(raw_token[i].key);
					temp = temp.split('-');
					for (let j = 0; j < temp.length; j++) {
						if (j > 0 && j < (temp.length - 1)) {
							temp[j] = 'X'.repeat(temp[j].length)
						}

					}
					raw_token[i].key = temp.join('-');
				}
				doc.tokens = raw_token;
				return await this.transformEntity(doc, true, ctx.meta.token);
			}
		},

		/**
		 * Update current user entity.
		 * Auth is required!
		 *
		 * @actions
		 *
		 * @param {Object} user - Modified fields
		 * @returns {Object} User entity
		 */
		updateMyself: {
			auth: "required",
			rest: "PUT /me",
			params: {
				user: {
					type: "object", props: {
						username: { type: "string", min: 2, optional: true, pattern: /^[a-zA-Z0-9]+$/ },
						password: { type: "string", min: 6, optional: true },
						email: { type: "email", optional: true },
						avatar: { type: "string", optional: true }
					}
				}
			},
			async handler(ctx) {
				const newData = ctx.params.user;
				if (newData.username) {
					const found = await this.adapter.findOne({ username: newData.username });
					if (found && found._id.toString() !== ctx.meta.user._id.toString())
						throw new MoleculerClientError("Username is exist!", 422, "", [{ field: "username", message: "is exist" }]);
				}

				if (newData.email) {
					const found = await this.adapter.findOne({ email: newData.email });
					if (found && found._id.toString() !== ctx.meta.user._id.toString())
						throw new MoleculerClientError("Email is exist!", 422, "", [{ field: "email", message: "is exist" }]);
				}
				if (newData.password) {
					newData.password = bcrypt.hashSync(newData.password, 10);
					let derivedKey = pbkdf2.pbkdf2Sync(newData.password, 'salt', 1, 32, 'sha512');
					let user_key = this.decrypt(ctx.meta.user.encrypted_user_key, ctx.meta.user.password_key, d_iv);
					newData.encrypted_user_key = this.encrypt(user_key, derivedKey, d_iv);
					// ctx.meta.user.encrypted_user_key = newData.encrypted_user_key

				}
				newData.updatedAt = new Date();
				const update = {
					"$set": newData
				};
				const doc = await this.adapter.updateById(ctx.meta.user._id, update);

				const user = await this.transformDocuments(ctx, {}, doc);
				const json = await this.transformEntity(user, true, ctx.meta.token);
				await this.entityChanged("updated", json, ctx);
				return json;
			}
		},
		generateAPIKey: {
			auth: "required",
			rest: "GET /genkey",
			async handler(ctx) {
				let Keys = uuidAPIKey.create();
				console.log(Keys)
				let user = await this.adapter.find({ query: { tokens: { $elemMatch: { key: Keys.uuid } } } });
				console.log(user);
				if (user == null) {

					const doc = await this.adapter.updateById(ctx.meta.user._id, {
						$set: {
							updatedAt: new Date()
						},
						$push: {
							tokens: {
								key: Keys.uuid
							}
						}
					});
					let response = {
						status: "Success", apiKey: Keys.apiKey
					}
					return response;
				} else {
					let Keys = uuidAPIKey.create();
					let user = await this.adapter.find({ query: { tokens: { $elemMatch: { key: Keys.uuid } } } });
					console.log(user);

					if (user.length == 0) {

						const doc = await this.adapter.updateById(ctx.meta.user._id, {
							$set: {
								updatedAt: new Date()
							},
							$push: {
								tokens: {
									key: Keys.uuid
								}
							}
						});
						let response = {
							status: "Success", apiKey: Keys.apiKey
						}
						return response;
					} else {
						throw new MoleculerClientError("Try Again", 500, "", [{ field: "timeOut", message: " Error" }]);
					}

				}
			}
		},
		deleteAPIKey: {
			auth: "required",
			rest: "POST /delkey",
			params: {
				key_id: { type: "string", min: 2 }
			},
			async handler(ctx) {
				const key_id = ctx.params.key_id;
				const user = await this.getById(ctx.meta.user._id);
				let cursor;
				if (user) {
					cursor = user.tokens.findIndex(x => x._id == key_id);
					if (cursor !== -1) {
						user.tokens.splice(cursor, 1);

						const doc = await this.adapter.updateById(ctx.meta.user._id, {
							$set: { tokens: user.tokens, updatedAt: new Date() }
						});

						const project = await this.transformDocuments(ctx, {}, doc);
						const json = await this.transformEntity(project);
						await this.entityChanged("updated", json, ctx);
						return json;
					}
					else {
						throw new MoleculerClientError("Key_id Not found", 422, "", [{ field: `${key_id}`, message: " does not exists" }]);
					}
				} else {

					throw new MoleculerClientError("Try Again", 500, "", [{ field: "timeOut", message: " Error" }]);


				}
			}
		},
		test: {
			rest: "GET /test",
			async handler(ctx) {
				let user = await this.adapter.find({ query: { tokens: { $elemMatch: { key: Keys.uuid } } } });
				console.log(user);
				if (!user)
					throw new MoleculerClientError("User not found!", 400);
				return user
			}
		},
		list: false,
		get: false,
		update: false,
		remove: false,


		// /**
		//  * Get a user profile by uuid.
		//  *
		//  * @actions
		//  *
		//  * @param {String} username - Username
		//  * @returns {Object} User entity
		//  */
		getbyuuid: {
			params: {
				uuid: { type: "string" }
			},
			async handler(ctx) {
				let user = await this.adapter.find({ query: { tokens: { $elemMatch: { key: ctx.params.uuid } } } });
				if (!user)
					throw new MoleculerClientError("User not found!", 404);
				const doc = await this.transformDocuments(ctx, {}, user[0]);
				doc.encrypted_user_key = user[0].encrypted_user_key;
				doc.password_key = pbkdf2.pbkdf2Sync(user[0].password, 'salt', 1, 32, 'sha512');

				return doc;
			}
		}


	},

	/**
	 * Methods
	 */
	methods: {
		randomint(min, max) {
			return Math.floor(Math.random() * (max - min + 1) + min);
		},
		encrypt(text, enc_key = null, enc_iv = null) {
			let cipher = crypto.createCipheriv('aes-256-cbc', enc_key !== null ? enc_key : key, enc_iv !== null ? enc_iv : iv);
			let encrypted = cipher.update(text);
			encrypted = Buffer.concat([encrypted, cipher.final()]);
			return encrypted.toString('hex');
		},

		decrypt(encryptedData, dec_key = null, dec_iv = null) {
			let encryptedText = Buffer.from(encryptedData, 'hex');
			let decipher = crypto.createDecipheriv('aes-256-cbc', dec_key !== null ? dec_key : key, dec_iv !== null ? dec_iv : iv);
			let decrypted = decipher.update(encryptedText);
			decrypted = Buffer.concat([decrypted, decipher.final()]);
			return decrypted.toString();
		},
		/**
		 * Generate a JWT token from user entity
		 *
		 * @param {Object} user
		 */
		generateJWT(user) {
			const today = new Date();
			const exp = new Date(today);
			exp.setDate(today.getDate() + 60);

			return jwt.sign({
				id: user._id,
				username: user.username,
				exp: Math.floor(exp.getTime() / 1000)
			}, this.settings.JWT_SECRET);
		},

		/**
		 * Transform returned user entity. Generate JWT token if neccessary.
		 *
		 * @param {Object} user
		 * @param {Boolean} withToken
		 */
		transformEntity(user, withToken, token) {
			if (user) {
				user.avatar = user.avatar || "https://www.gravatar.com/avatar/" + crypto.createHash("md5").update(user.email).digest("hex") + "?d=robohash";

				if (withToken)
					user.token = token || this.generateJWT(user);
			}

			return { user };
		}
	}
};
