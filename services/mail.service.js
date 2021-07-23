"use strict";

const MailService = require("moleculer-mail");

module.exports = {
	name: "mail",
	mixins: [MailService],
	settings: {
		from: "sender@jufopay.com",
		transport: {
			service: "gmail",
			auth: {
				user: process.env.MAIL_USER,
				pass: process.env.MAIL_PASS
			}
		}
	}
};
