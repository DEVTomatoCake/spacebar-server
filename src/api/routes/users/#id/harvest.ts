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

import { route } from "@spacebar/api";
import {
	Snowflake,
	User,
	HarvestResponse,
	HarvestStatus,
	Member,
	Message,
	PrivateUserProjection,
	Application,
	ChannelTypeString,
	getRights,
} from "@spacebar/util";
import { storage } from "../../../../cdn/util/Storage";

import { Request, Response, Router } from "express";
import { promises as fs } from "node:fs";
import path from "node:path";

const router = Router();

router.get(
	"/",
	route({
		responses: {
			200: {
				body: "HarvestResponse",
			},
			401: {
				body: "APIErrorResponse",
			},
			404: {
				body: "APIErrorResponse",
			},
		},
	}),
	async (req: Request, res: Response) => {
		if (req.params.id != "@me") {
			const rights = await getRights(req.user_id);
			rights.hasThrow("MANAGE_USERS");

			req.user_id = req.params.id;
		}

		const user = await User.findOneOrFail({
			where: { id: req.user_id },
			select: PrivateUserProjection,
			relations: ["settings", "relationships"],
		});

		const harvestId = Snowflake.generate();
		res.send({
			harvest_id: harvestId,
			user_id: req.user_id,
			status: HarvestStatus.RUNNING,
			created_at: new Date(),
			polled_at: new Date(),
		} as HarvestResponse);

		// TODO: remove
		await fs.rm(path.join(process.cwd(), "harvest"), { recursive: true });

		const harvestPath = path.join(process.cwd(), "harvest", harvestId);
		await fs.mkdir(harvestPath, { recursive: true });

		await fs.mkdir(path.join(harvestPath, "account"));
		await fs.writeFile(
			path.join(harvestPath, "account", "user.json"),
			JSON.stringify(user, null, "\t"),
		);

		if (user.avatar) {
			const avatarFile = await storage.get(
				"avatars/" + user.id + "/" + user.avatar,
			);
			if (avatarFile)
				await fs.writeFile(
					path.join(harvestPath, "account", "avatar.png"),
					avatarFile,
				);
		}
		if (user.banner) {
			const bannerFile = await storage.get(
				"banners/" + user.id + "/" + user.banner,
			);
			if (bannerFile)
				await fs.writeFile(
					path.join(harvestPath, "account", "banner.png"),
					bannerFile,
				);
		}

		const applications = await Application.find({
			where: { owner_id: req.user_id },
			relations: ["bot"],
		});
		if (applications.length > 0) {
			await fs.mkdir(path.join(harvestPath, "account", "applications"));
			for await (const app of applications) {
				await fs.mkdir(
					path.join(harvestPath, "account", "applications", app.id),
				);
				await fs.writeFile(
					path.join(
						harvestPath,
						"account",
						"applications",
						app.id,
						"application.json",
					),
					JSON.stringify(app, null, "\t"),
				);

				if (app.icon) {
					const iconFile = await storage.get(
						"applications/" + app.id + "/" + app.icon,
					);
					if (iconFile)
						await fs.writeFile(
							path.join(
								harvestPath,
								"account",
								"applications",
								app.id,
								"icon.png",
							),
							iconFile,
						);
				}
				if (app.bot && app.bot.avatar) {
					const botAvatarFile = await storage.get(
						"avatars/" + app.bot.id + "/" + app.bot.avatar,
					);
					if (botAvatarFile)
						await fs.writeFile(
							path.join(
								harvestPath,
								"account",
								"applications",
								app.id,
								"bot_avatar.png",
							),
							botAvatarFile,
						);
				}
			}
		}

		const messages = await Message.find({
			where: { author_id: req.user_id },
			relations: ["channel"],
		});
		await fs.mkdir(path.join(harvestPath, "messages"));

		const channelDirs = new Set();
		const channelMessages = new Map();
		for await (const msg of messages) {
			if (!channelDirs.has(msg.channel_id)) {
				await fs.mkdir(
					path.join(harvestPath, "messages", "c" + msg.channel_id),
				);
				channelDirs.add(msg.channel_id);

				const transformedChannel = {
					id: msg.channel_id,
					type: ChannelTypeString[msg.channel.type],
					name: msg.channel.name,
					guild: msg.guild
						? {
								id: msg.channel.guild_id,
								name: msg.guild.name,
						  }
						: null,
				};
				await fs.writeFile(
					path.join(
						harvestPath,
						"messages",
						"c" + msg.channel_id,
						"channel.json",
					),
					JSON.stringify(transformedChannel, null, "\t"),
				);
			}

			const transformedMsg = {
				ID: msg.id,
				Timestamp: msg.timestamp.toISOString(),
				Contents: msg.content,
				Attachments: msg.attachments,
			};
			if (channelMessages.has(msg.channel_id))
				channelMessages.get(msg.channel_id).push(transformedMsg);
			else channelMessages.set(msg.channel_id, [transformedMsg]);
		}
		channelDirs.clear();

		for await (const [channelId, messages] of channelMessages) {
			await fs.writeFile(
				path.join(
					harvestPath,
					"messages",
					"c" + channelId,
					"messages.json",
				),
				JSON.stringify(messages, null, "\t"),
			);
		}
		channelMessages.clear();

		const members = await Member.find({
			where: { id: req.user_id },
			relations: ["guild"],
		});
		await fs.mkdir(path.join(harvestPath, "servers"));
		for await (const member of members) {
			const guildPath = path.join(
				harvestPath,
				"servers",
				member.guild_id,
			);
			await fs.mkdir(guildPath);

			if (member.guild.owner_id == member.id) {
				await fs.writeFile(
					path.join(guildPath, "guild.json"),
					JSON.stringify(member.guild, null, "\t"),
				);

				if (member.guild.icon) {
					const iconFile = await storage.get(
						"icons/" + member.guild.id + "/" + member.guild.icon,
					);
					if (iconFile)
						await fs.writeFile(
							path.join(guildPath, "icon.png"),
							iconFile,
						);
				}
				if (member.guild.banner) {
					const bannerFile = await storage.get(
						"banners/" +
							member.guild.id +
							"/" +
							member.guild.banner,
					);
					if (bannerFile)
						await fs.writeFile(
							path.join(guildPath, "banner.png"),
							bannerFile,
						);
				}
				if (member.guild.splash) {
					const splashFile = await storage.get(
						"splashes/" +
							member.guild.id +
							"/" +
							member.guild.splash,
					);
					if (splashFile)
						await fs.writeFile(
							path.join(guildPath, "splash.png"),
							splashFile,
						);
				}
				if (member.guild.discovery_splash) {
					const discoverySplashFile = await storage.get(
						"splashes/" +
							member.guild.id +
							"/" +
							member.guild.discovery_splash,
					);
					if (discoverySplashFile)
						await fs.writeFile(
							path.join(guildPath, "discovery_splash.png"),
							discoverySplashFile,
						);
				}
			} else {
				const transformedGuild = {
					id: member.guild.id,
					name: member.guild.name,
				};
				await fs.writeFile(
					path.join(guildPath, "guild.json"),
					JSON.stringify(transformedGuild, null, "\t"),
				);
			}
		}
	},
);

export default router;
