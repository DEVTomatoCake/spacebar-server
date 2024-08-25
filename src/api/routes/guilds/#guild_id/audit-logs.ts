/*
	Spacebar: A FOSS re-implementation and extension of the Discord.com backend.
	Copyright (C) 2023 Spacebar and Spacebar Contributors

	This program is free software: you can redistribute it and/or modify
	it under the terms of the GNU Affero General Public License as published
	by the Free Software Foundation, either version 3 of the License, or
	(at your option) any later version.

	This program is distributed in the hope that it will be useful,
	but WITHOUT ANY WARRANTY; without even the implied warranty of
	MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
	GNU Affero General Public License for more details.

	You should have received a copy of the GNU Affero General Public License
	along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { Router, Response, Request } from "express";
import { route } from "@spacebar/api";
import {
	AuditLog,
	AuditLogEntityType,
	Snowflake,
	User,
	Webhook,
} from "@spacebar/util";
import { HTTPError } from "lambert-server";
import { FindManyOptions, FindOperator, LessThan, MoreThan } from "typeorm";
const router = Router();

//TODO: implement audit logs
router.get(
	"/",
	route({
		query: {
			user_id: {
				type: "string",
				description: "Entries from a specific executor user ID",
			},
			target_id: {
				type: "string",
				description: "Entries from a specific target user ID",
			},
			action_type: {
				type: "number",
				description: "Entries for a specific audit log event",
			},
			before: {
				type: "string",
				description:
					"Entries with ID less than a specific audit log entry ID",
			},
			after: {
				type: "string",
				description:
					"Entries with ID greater than a specific audit log entry ID",
			},
			limit: {
				type: "number",
				description:
					"Maximum number of entries to return, defaults to 50",
			},
		},
		permission: "VIEW_AUDIT_LOG",
		responses: {
			200: {
				body: "GuildAuditLogResponse",
			},
			403: {
				body: "APIErrorResponse",
			},
			404: {
				body: "APIErrorResponse",
			},
		},
	}),
	async (req: Request, res: Response) => {
		const limit = Number(req.query.limit) || 50;
		if (limit > 1000 || limit < 1)
			throw new HTTPError("Limit must be between 1 and 1000");

		const query: FindManyOptions<AuditLog> & {
			where: { id?: FindOperator<string> | FindOperator<string>[] };
		} = {
			where: {
				guild_id: req.params.guild_id,
			},
		};

		const before = req.query.before ? `${req.query.before}` : undefined;
		const after = req.query.after ? `${req.query.after}` : undefined;
		if (after) {
			if (BigInt(after) > BigInt(Snowflake.generate()))
				throw new HTTPError(
					"after parameter must not be greater than current time",
					422,
				);

			query.where.id = MoreThan(after);
			query.order = { timestamp: "ASC" };
		} else if (before) {
			if (BigInt(before) > BigInt(Snowflake.generate()))
				throw new HTTPError(
					"before parameter must not be greater than current time",
					422,
				);

			query.where.id = LessThan(before);
		}

		const entries = await AuditLog.find({
			...query,
			take: limit,
		});

		const users: User[] = [];
		const webhooks: Webhook[] = [];
		for await (const entry of entries.filter((entry) => entry.target_id)) {
			if (
				entry.target_type == AuditLogEntityType.Member &&
				!users.some((u) => u.id == entry.target_id)
			) {
				const user = await User.findOneBy({ id: entry.target_id });
				if (user) users.push(user);
			} else if (
				entry.target_type == AuditLogEntityType.Webhook &&
				!webhooks.some((w) => w.id == entry.target_id)
			) {
				const webhook = await Webhook.findOneBy({
					id: entry.target_id,
				});
				if (webhook) webhooks.push(webhook);
			}
		}

		res.json({
			application_commands: [],
			audit_log_entries: entries,
			auto_moderation_rules: [],
			guild_scheduled_events: [],
			integrations: [],
			threads: [],
			users,
			webhooks,
		});
	},
);
export default router;
