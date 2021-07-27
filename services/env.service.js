"use strict";

const { MoleculerClientError } = require("moleculer").Errors;

const DbService = require("moleculer-db");
const MongooseAdapter = require("moleculer-db-adapter-mongoose");
const Project = require("../models/environment.model");
const uuidAPIKey = require('uuid-apikey');
const crypto = require('crypto');
const pbkdf2 = require('pbkdf2');
const key = pbkdf2.pbkdf2Sync(process.env.AES_KEY, 'salt', 1, 32, 'sha512');
const iv = pbkdf2.pbkdf2Sync(process.env.AES_IV, 'salt', 1, 16, 'sha512');
const d_iv = pbkdf2.pbkdf2Sync(process.env.AES_DATA_IV, 'salt', 1, 16, 'sha512');


module.exports = {
	name: "env",
	mixins: [
		DbService
	],
	adapter: new MongooseAdapter(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true }),
	model: Project,

	/**
	 * Default settings
	 */
	settings: {
		/** REST Basepath */
		rest: "/env",
		cors: {
			origin: "*",
			methods: ["GET", "OPTIONS", "POST", "PUT", "DELETE"],
			allowedHeaders: [],
			exposedHeaders: [],
			credentials: false,
			maxAge: 3600
		},

		/** Public fields */
		fields: ["_id", "title", "author", "keys"],

		/** Validator schema for entity */
		entityValidator: {
			title: { type: "string", min: 2 },
			author: { type: "string", optional: true },
			key: { type: "string", optional: true },

		},

		populates: {
			"author": {
				action: "users.get",
				params: {
					fields: ["_id", "username", "email"]
				}
			}
		},
	},

	/**
	 * Actions
	 */
	actions: {

		create: {
			auth: "required",
			rest: "POST /",
			params: {
				env: { type: "object" }
			},
			async handler(ctx) {
				let entity = ctx.params.env;
				console.log("got here")
				console.log(entity);
				await this.validateEntity(entity);
				if (entity.title) {
					const found = await this.adapter.findOne({ title: entity.title, author: ctx.meta.user._id });
					if (found)
						throw new MoleculerClientError("Title exist!", 422, "", [{ field: "title", message: "is exist" }]);
				}
				//

				entity.author = ctx.meta.user._id;
				entity.createdAt = new Date();


				const doc = await this.adapter.insert(entity);
				const env = await this.transformDocuments(ctx, {}, doc);
				const json = await this.transformEntity(ctx, env);
				await this.entityChanged("created", json, ctx);
				return json;
			}
		},
		updateEnv: {
			auth: "required",
			rest: "PUT /updateEnv",
			params: {
				env: {
					type: "object", props: {
						_id: { type: "string", min: 2 },
						title: { type: "string", min: 2, optional: true }
					}
				}
			},
			async handler(ctx) {
				const newData = ctx.params.env;
				const repo = await this.adapter.findOne({ _id: newData._id, author: ctx.meta.user._id });

				if (repo && repo.author.toString() !== ctx.meta.user._id.toString())
					throw new MoleculerClientError("UnAuthorized", 422, "", [{ field: "Auth", message: "failed" }]);

				if (repo) {
					newData.updatedAt = new Date();
					const update = {
						"$set": newData
					};
					const doc = await this.adapter.updateById(newData._id, update);

					const project = await this.transformDocuments(ctx, {}, doc);
					const json = await this.transformEntity(ctx, project, ctx.params.decrypt);
					await this.entityChanged("updated", json, ctx);
					return json;
				}
				else {
					throw new MoleculerClientError("Repo not found!", 422, "", [{ field: "_id", message: " does not exist" }]);
				}
			}
		},
		getUserEnvs: {
			auth: "required",
			rest: "GET /userenvs",
			async handler(ctx) {
				try {
					const doc = await this.adapter.find({ query: { author: ctx.meta.user._id } });
					const project = await this.transformDocuments(ctx, {}, doc);
					const json = await this.transformEntity(ctx, project, ctx.params.decrypt);
					await this.entityChanged("found", json, ctx);
					return json;
				}
				catch (err) {
					console.log(err)
					throw new MoleculerClientError("invalid ID!", 422, "", [{ field: "_id", message: " does not exist" }]);

				}
			}
		},
		
		getEnvViaApi: {
			rest: "POST /env",
			params: {
				env_name: { type: "string", min: 2 },
				api_key: { type: "string", min: 2 },
			},
			async handler(ctx) {
				try {
					let valid = uuidAPIKey.isAPIKey(ctx.params.api_key);
					if (valid) {
						let uuid = uuidAPIKey.toUUID(ctx.params.api_key);
						let user = await ctx.call("users.getbyuuid", { uuid });
						const doc = await this.adapter.find({ query: { author: user._id, title: ctx.params.env_name } });
						ctx.meta.user = user;

						//serial decryption
						const project = await this.transformDocuments(ctx, {}, doc[0]);
						const json = await this.transformEntity(ctx, project, "true");
						await this.entityChanged("found", json, ctx);
						return json;
					} else {
						throw new MoleculerClientError("invalid API_KEY", 422, "", [{ field: "API_KEY", message: " Invalid" }]);

					}

				}
				catch (err) {
					console.log(err)
					throw new MoleculerClientError("invalid ID!", 422, "", [{ field: "_id", message: " does not exist" }]);

				}
			}
		},
		addKey: {
			auth: "required",
			rest: "POST /addKey",
			params: {
				env: {
					type: "object", props: {
						env_id: { type: "string", min: 2 },
						key_name: { type: "string", min: 2 },
						value: { type: "string", min: 2 }
					}
				}
			},
			async handler(ctx) {
				const newData = ctx.params.env;

				const env = await this.adapter.findOne({ _id: newData.env_id, author: ctx.meta.user._id });

				if (env && env.author.toString() !== ctx.meta.user._id.toString())
					throw new MoleculerClientError("UnAuthorized", 422, "", [{ field: "Auth", message: "failed" }]);
				// console.log("env => ", env);
				let cursor;
				if (env) {
					newData.key_name = newData.key_name.split(' ').join('_').toUpperCase();
					cursor = env.keys.findIndex(x => x.key_name == newData.key_name)

				}

				if (env && cursor == -1) {
					let user_key = this.decrypt(ctx.meta.user.encrypted_user_key, ctx.meta.user.password_key, iv);
					console.log(Buffer.from(user_key, 'hex'));
					newData.value = this.encrypt(newData.value, Buffer.from(user_key, 'hex'), d_iv);
					const update = {
						"set": { updatedAt: new Date() },
						"$push": {
							keys: {
								key_name: newData.key_name,
								value: newData.value
							}
						}
					};
					const doc = await this.adapter.updateById(newData.env_id, update);

					const project = await this.transformDocuments(ctx, {}, doc);
					const json = await this.transformEntity(ctx, project, ctx.params.decrypt);
					await this.entityChanged("updated", json, ctx);
					return json;
				}
				else {
					if (!env) {
						throw new MoleculerClientError("env not found!", 422, "", [{ field: "_id", message: " does not exist" }]);
					}
					else {
						throw new MoleculerClientError("Key_name Exists", 422, "", [{ field: `${newData.key_name}`, message: " exists" }]);
					}
				}

			}
		},
		updateKey: {
			auth: "required",
			rest: "PUT /updateKey",
			params: {
				env: {
					type: "object", props: {
						env_id: { type: "string", min: 2 },
						key_id: { type: "string", min: 2 },
						key_name: { type: "string", min: 2 },
						value: { type: "string", min: 2 }
					}
				}
			},
			async handler(ctx) {
				const newData = ctx.params.env;

				const env = await this.adapter.findOne({ _id: newData.env_id, author: ctx.meta.user._id });
				if (env && env.author.toString() !== ctx.meta.user._id.toString())
					throw new MoleculerClientError("UnAuthorized", 422, "", [{ field: "Auth", message: "failed" }]);
				// console.log("env => ", env);
				let cursor;
				if (env) {
					newData.key_name = newData.key_name.split(' ').join('_').toUpperCase();

					let user_key = this.decrypt(ctx.meta.user.encrypted_user_key, ctx.meta.user.password_key, iv);
					newData.value = this.encrypt(newData.value, Buffer.from(user_key, 'hex'), d_iv);

					cursor = env.keys.findIndex(x => x.key_name == newData.key_name);
					if (cursor !== -1 && env.keys[cursor]._id == newData.key_id) {
						env.updatedAt = new Date();
						env.keys[cursor].value = newData.value;
						console.log("cursor data final", env.keys[cursor]);


						const doc = await this.adapter.updateById(newData.env_id, {
							$set: { keys: env.keys, updatedAt: new Date() }
						});

						const project = await this.transformDocuments(ctx, {}, doc);
						const json = await this.transformEntity(ctx, project, ctx.params.decrypt);
						await this.entityChanged("updated", json, ctx);
						return json;
					}
					else if (cursor === -1) {
						let newcursor = env.keys.findIndex(x => x._id == newData.key_id)
						if (newcursor !== -1) {
							let user_key = this.decrypt(ctx.meta.user.encrypted_user_key, ctx.meta.user.password_key, iv);
							newData.value = this.encrypt(newData.value, Buffer.from(user_key, 'hex'), d_iv);

							env.updatedAt = new Date();
							env.keys[newcursor].key_name = newData.key_name;
							env.keys[newcursor].value = newData.value;

							const doc = await this.adapter.updateById(newData.env_id, {
								$set: { keys: env.keys, updatedAt: new Date() }
							});
							const project = await this.transformDocuments(ctx, {}, doc);
							const json = await this.transformEntity(ctx, project, ctx.params.decrypt);
							await this.entityChanged("updated", json, ctx);
							return json;
						} else {
							throw new MoleculerClientError("key_id not found", 422, "", [{ field: `${newData.key_id}`, message: " not found" }]);

						}

					}
					else {
						throw new MoleculerClientError("Key_name Exists", 422, "", [{ field: `${newData.key_name}`, message: " exists" }]);
					}
				}
				else {
					throw new MoleculerClientError("env not found!", 422, "", [{ field: "_id", message: " does not exist" }]);
				}

			}
		},
		deleteKey: {
			auth: "required",
			rest: "POST /deleteKey",
			params: {
				env: {
					type: "object", props: {
						env_id: { type: "string", min: 2 },
						key_id: { type: "string", min: 2 }
					}
				}
			},
			async handler(ctx) {
				const newData = ctx.params.env;

				const env = await this.adapter.findOne({ _id: newData.env_id, author: ctx.meta.user._id });
				if (env && env.author.toString() !== ctx.meta.user._id.toString())
					throw new MoleculerClientError("UnAuthorized", 422, "", [{ field: "Auth", message: "failed" }]);
				// console.log("env => ", env);
				let cursor;
				if (env) {
					cursor = env.keys.findIndex(x => x._id == newData.key_id);
					console.log("cursor ", cursor);
					console.log("cursordata init", env.keys[cursor]);
					if (cursor !== -1) {
						env.keys.splice(cursor, 1);

						const doc = await this.adapter.updateById(newData.env_id, {
							$set: { keys: env.keys, updatedAt: new Date() }
						});

						const project = await this.transformDocuments(ctx, {}, doc);
						const json = await this.transformEntity(ctx, project, ctx.params.decrypt);
						await this.entityChanged("updated", json, ctx);
						return json;
					}
					else {
						throw new MoleculerClientError("Key_id Not found", 422, "", [{ field: `${newData.key_id}`, message: " does not exists" }]);
					}
				}
				else {
					throw new MoleculerClientError("env not found!", 422, "", [{ field: "_id", message: " does not exist" }]);
				}

			}
		},
		get: {
			rest: "GET /:id",
			auth: "required",
			async handler(ctx) {
				try {
					const doc = await this.adapter.find({ query: { author: ctx.meta.user._id, _id: ctx.params.id } });
					const project = await this.transformDocuments(ctx, {}, doc[0]);
					const json = await this.transformEntity(ctx, project, ctx.params.decrypt);
					await this.entityChanged("found", json, ctx);
					return json;
				}
				catch (err) {
					console.log(err)
					throw new MoleculerClientError("invalid ID!", 422, "", [{ field: "_id", message: " does not exist" }]);

				}
			}
		},
		list: false,
		update: false,
		remove:{
			auth: "required",
			rest: "DELETE /:id",
			async handler(ctx) {
				const repo = await this.adapter.findOne({ _id: ctx.params.id, author: ctx.meta.user._id });

				if (repo && repo.author.toString() !== ctx.meta.user._id.toString())
					throw new MoleculerClientError("UnAuthorized", 422, "", [{ field: "Auth", message: "failed" }]);

				if (repo) {
					await this.adapter.removeById(ctx.params.id);
					return {status: "Success"};
				}
				else {
					throw new MoleculerClientError("Repo not found!", 422, "", [{ field: "_id", message: " does not exist" }]);
				}
			}
		},
		addUser: {
			auth: "required",
			rest: "POST /addUser",
			params: {
				env: {
					type: "object", props: {
						env_id: { type: "string", min: 2 },
						email: { type: "string", min: 2 }
					}
				}
			},
			async handler(ctx) {
				const newData = ctx.params.env;
				let cursor;

				const env = await this.adapter.findOne({ _id: newData.env_id, author: ctx.meta.user._id });

				if (env && env.author.toString() !== ctx.meta.user._id.toString())
					throw new MoleculerClientError("UnAuthorized", 422, "", [{ field: "Auth", message: "failed" }]);

				let user = await ctx.call("users.list", { query: { email: ctx.params.env.email } });
				user = user.rows[0];
				if (!user)
					throw new MoleculerClientError("User Not found", 422, "", [{ field: "email", message: "Not found" }]);

				const update = {
					"set": { updatedAt: new Date() },
					"$addToSet": {
						team: {
							user: user._id
						}
					}
				};
				const doc = await this.adapter.updateById(newData.env_id, update);
				console.log(doc);
				const project = await this.transformDocuments(ctx, {}, doc);
				const json = await this.transformEntity(ctx, project, ctx.params.decrypt);
				await this.entityChanged("updated", json, ctx);
				return json;

			}
		},


	},

	/**
	 * Methods
	 */
	methods: {
		encrypt(text, enc_key, enc_iv) {
			let cipher = crypto.createCipheriv('aes-256-cbc', enc_key, enc_iv);
			let encrypted = cipher.update(text);
			encrypted = Buffer.concat([encrypted, cipher.final()]);
			return encrypted.toString('hex');
		},

		decrypt(encryptedData, dec_key, dec_iv) {
			let encryptedText = Buffer.from(encryptedData, 'hex');
			let decipher = crypto.createDecipheriv('aes-256-cbc', dec_key, dec_iv);
			let decrypted = decipher.update(encryptedText);
			decrypted = Buffer.concat([decrypted, decipher.final()]);
			return decrypted.toString();
		},

		/**
		 * Transform returned env entity.
		 * @param {Context} ctx
		 * @param {Object} project
		 */
		transformEntity(ctx, env, decrypt = false) {

			let user_key = this.decrypt(ctx.meta.user.encrypted_user_key, ctx.meta.user.password_key, iv);

			if (!decrypt || decrypt == undefined || decrypt != "true") {
				if (Array.isArray(env)) {
					return { envs: env }
				}
				else {
					return { env }
				}
			}

			if (Array.isArray(env)) {
				let envs = env

				envs.forEach(env => {
					env.keys.forEach(key => {
						key.value = this.decrypt(key.value, Buffer.from(user_key, 'hex'), d_iv);
						return key
					})
					return env;
				});
				return { envs };
			}
			else {
				env.keys.forEach(key => {
					key.value = this.decrypt(key.value, Buffer.from(user_key, 'hex'), d_iv);
					return key
				})
				return { env };
			}


		},

		/**
		 * Returns the week number for this date.  dowOffset is the day of week the week
		 * "starts" on for your locale - it can be from 0 to 6. If dowOffset is 1 (Monday),
		 * the week returned is the ISO 8601 week number.
		 * @param int dowOffset
		 * @return int
		 */
		getWeekyear() {
			Date.prototype.getWeek = function (dowOffset) {
				/*getWeek() was developed by Nick Baicoianu at MeanFreePath: http://www.meanfreepath.com */

				dowOffset = typeof (dowOffset) == 'int' ? dowOffset : 0; //default dowOffset to zero
				var newYear = new Date(this.getFullYear(), 0, 1);
				var day = newYear.getDay() - dowOffset; //the day of week the year begins on
				day = (day >= 0 ? day : day + 7);
				var daynum = Math.floor((this.getTime() - newYear.getTime() -
					(this.getTimezoneOffset() - newYear.getTimezoneOffset()) * 60000) / 86400000) + 1;
				var weeknum;
				//if the year starts before the middle of a week
				if (day < 4) {
					weeknum = Math.floor((daynum + day - 1) / 7) + 1;
					if (weeknum > 52) {
						nYear = new Date(this.getFullYear() + 1, 0, 1);
						nday = nYear.getDay() - dowOffset;
						nday = nday >= 0 ? nday : nday + 7;
						/*if the next year starts before the middle of
						  the week, it is week #1 of that year*/
						weeknum = nday < 4 ? 1 : 53;
					}
				}
				else {
					weeknum = Math.floor((daynum + day - 1) / 7);
				}
				return weeknum;
			}
			var out = {};
			var mydate = new Date();
			out.week = mydate.getWeek()
			out.year = mydate.getFullYear()
			return out;
		}
	}
};
