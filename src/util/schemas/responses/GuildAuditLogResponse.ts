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

import { AuditLog, User, Webhook } from "@spacebar/util";

// Types for the other ones are missing
/* eslint-disable @typescript-eslint/no-explicit-any */

export interface GuildAuditLogResponse {
	application_commands: any[];
	audit_log_entries: AuditLog[];
	auto_moderation_rules: any[];
	guild_scheduled_events: any[];
	integrations: any[];
	threads: any[];
	users: User[];
	webhooks: Webhook[];
}
