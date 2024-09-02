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
	TakeoutResponse,
	TakeoutStatus,
	Member,
	Message,
	PrivateUserProjection,
	Application,
	ChannelTypeString,
	getRights,
	JSZipType,
	Config,
	Note,
	RelationshipTypeString,
} from "@spacebar/util";
import { storage } from "../../../../cdn/util/Storage";

import { Request, Response, Router } from "express";
import { promises as fs } from "node:fs";
import path from "node:path";
import { HTTPError } from "lambert-server";

type IndexStructure = {
	[key: string]: string;
};

let JSZip: JSZipType | undefined = undefined;
try {
	JSZip = require("jszip") as JSZipType;
} catch {
	// empty
}

const router = Router();

router.get(
	"/",
	route({
		responses: {
			200: {
				body: "TakeoutResponse",
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
		let zip: JSZipType;
		try {
			JSZip = require("jszip");
			// @ts-expect-error Missing types for constructor
			zip = new JSZip();
		} catch (e) {
			console.error(
				'[Takeout] Failed to import JSZip. Install the NPM package "jszip" for takeouts to work.',
				e,
			);
			throw new HTTPError(
				'The NPM package "jszip" has to be installed for takeouts to work.',
				500,
			);
		}

		if (req.params.id != "@me") {
			const rights = await getRights(req.user_id);
			rights.hasThrow("MANAGE_USERS");

			req.user_id = req.params.id;
		}

		const user = await User.findOneOrFail({
			where: { id: req.user_id },
			select: PrivateUserProjection,
			relations: ["settings", "relationships", "connected_accounts"],
		});

		const takeoutId = Snowflake.generate();
		res.send({
			harvest_id: takeoutId,
			user_id: req.user_id,
			status: TakeoutStatus.RUNNING,
			created_at: new Date(),
			polled_at: new Date(),
		} as TakeoutResponse);

		const takeoutPath = path.join(process.cwd(), "takeout", takeoutId);
		await fs.mkdir(takeoutPath, { recursive: true });

		const { instanceName } = Config.get().general;
		await fs.writeFile(
			path.join(takeoutPath, "README.txt"),
			"Takeout for " +
				user.username +
				" (" +
				user.id +
				') on instance "' +
				instanceName +
				'"\n\n' +
				"Generated by Spacebar (https://spacebar.chat) at " +
				new Date().toISOString() +
				".",
		);

		await fs.mkdir(path.join(takeoutPath, "account"));

		const notes = await Note.find({
			where: { owner_id: req.user_id },
		});
		const members = await Member.find({
			where: { id: req.user_id },
			select: ["guild_id", "settings"],
			relations: ["guild"],
		});

		const transformedUser = {
			id: user.id,
			username: user.username, // TODO: Pomelo global_name
			discriminator: user.discriminator,
			avatar_hash: user.avatar,
			email: user.email,
			phone: user.phone,
			verified: user.verified,
			flags: user.flags,
			settings: {
				settings: {
					versions: {
						clientVersion: 20,
						dataVersion: 4889,
					},
					inbox: {},
					guilds: {
						guilds: {},
					},
					userContent: {},
					voiceAndVideo: {
						blur: {},
						afkTimeout: user.settings.afk_timeout,
						streamNotificationsEnabled:
							user.settings.stream_notifications_enabled,
						nativePhoneIntegrationEnabled:
							user.settings.native_phone_integration_enabled,
						soundboardSettings: {},
					},
					textAndImages: {
						gifAutoPlay: user.settings.gif_auto_play,
						animateEmoji: user.settings.animate_emoji,
						animateStickers: user.settings.animate_stickers,
						enableTtsCommand: user.settings.enable_tts_command,
						messageDisplayCompact:
							user.settings.message_display_compact,
						explicitContentFilter:
							user.settings.explicit_content_filter,
						convertEmoticons: user.settings.convert_emoticons,
						explicitContentSettings: {},
					},
					notifications: {},
					privacy: {
						restrictedGuildIds: user.settings.restricted_guilds,
						detectPlatformAccounts:
							user.settings.detect_platform_accounts,
						contactSyncEnabled: user.settings.contact_sync_enabled,
						friendSourceFlags: user.settings.friend_source_flags,
						friendDiscoveryFlags:
							user.settings.friend_discovery_flags,
					},
					debug: {},
					gameLibrary: {
						disableGamesTab: user.settings.disable_games_tab,
					},
					status: {
						status: user.settings.status,
						customStatus: {
							text: user.settings.custom_status?.text,
							emojiId: user.settings.custom_status?.emoji_id,
							emojiName: user.settings.custom_status?.emoji_name,
							expiresAt: user.settings.custom_status?.expires_at,
						},
						showCurrentGame: user.settings.show_current_game,
					},
					localization: {
						locale: user.settings.locale,
						timezoneOffset: user.settings.timezone_offset,
					},
					appearance: {
						theme: user.settings.theme,
						developerMode: user.settings.developer_mode,
					},
					guildFolders: {
						folders: user.settings.guild_folders.map((folder) => ({
							...folder,
							guildIds: folder.guild_ids,
							guild_ids: undefined,
						})),
						guildPositions: user.settings.guild_positions,
					},
					audioContextSettings: {},
					communities: {},
					clips: {},
				},
				frecency: {},
			},
			connections: user.connected_accounts,
			relationships: user.relationships.map((relationship) => ({
				...relationship,
				type: RelationshipTypeString[relationship.type],
			})),
			guild_settings: members.map((member) => member.settings),
			payments: [],
			notes,
		};
		await fs.writeFile(
			path.join(takeoutPath, "account", "user.json"),
			JSON.stringify(transformedUser, null, "\t"),
		);

		if (user.avatar) {
			const avatarFile = await storage.get(
				"avatars/" + user.id + "/" + user.avatar,
			);
			if (avatarFile)
				await fs.writeFile(
					path.join(takeoutPath, "account", "avatar.png"),
					avatarFile,
				);
		}
		if (user.banner) {
			const bannerFile = await storage.get(
				"banners/" + user.id + "/" + user.banner,
			);
			if (bannerFile)
				await fs.writeFile(
					path.join(takeoutPath, "account", "banner.png"),
					bannerFile,
				);
		}

		const applications = await Application.find({
			where: { owner_id: req.user_id },
			relations: ["bot"],
		});
		if (applications.length > 0) {
			await fs.mkdir(path.join(takeoutPath, "account", "applications"));
			for await (const app of applications) {
				const appPath = path.join(
					takeoutPath,
					"account",
					"applications",
					app.id,
				);
				await fs.mkdir(appPath);
				await fs.writeFile(
					path.join(appPath, "application.json"),
					JSON.stringify(app, null, "\t"),
				);

				if (app.icon) {
					const iconFile = await storage.get(
						"app-icons/" + app.id + "/" + app.icon,
					);
					if (iconFile)
						await fs.writeFile(
							path.join(appPath, "icon.png"),
							iconFile,
						);
				}
				if (app.cover_image) {
					const coverImageFile = await storage.get(
						"app-icons/" + app.id + "/" + app.cover_image,
					);
					if (coverImageFile)
						await fs.writeFile(
							path.join(appPath, "cover_image.png"),
							coverImageFile,
						);
				}
				if (app.bot && app.bot.avatar) {
					const botAvatarFile = await storage.get(
						"avatars/" + app.bot.id + "/" + app.bot.avatar,
					);
					if (botAvatarFile)
						await fs.writeFile(
							path.join(appPath, "bot_avatar.png"),
							botAvatarFile,
						);
				}
			}
		}

		const messages = await Message.find({
			where: { author_id: req.user_id },
			relations: [
				"channel",
				"channel.recipients",
				"guild",
				"attachments",
			],
		});
		await fs.mkdir(path.join(takeoutPath, "messages"));

		let channelIndex: IndexStructure = {};
		const channelMessages = new Map();
		for await (const msg of messages) {
			if (!msg.channel_id) continue;

			if (!channelIndex[msg.channel_id]) {
				await fs.mkdir(
					path.join(takeoutPath, "messages", "c" + msg.channel_id),
				);

				if (msg.guild_id && msg.guild)
					channelIndex[msg.channel_id] =
						(members.some(
							(member) => member.guild_id == msg.guild_id,
						)
							? msg.channel.name
							: "Unknown channel") +
						" in " +
						msg.guild.name;
				else if (msg.channel.recipients) {
					const recipients: Promise<User | null>[] = [];
					msg.channel.recipients.forEach((recipient) => {
						if (recipient.id != req.user_id)
							recipients.push(
								User.findOne({
									where: { id: recipient.id },
									select: ["username", "discriminator"],
								}),
							);
					});
					await Promise.all(recipients);

					const userList = recipients
						.filter(Boolean)
						// @ts-expect-error I hate TS
						.map((user) => user.username + "#" + user.discriminator)
						.join(", ");
					channelIndex[msg.channel_id] =
						"Direct Message with " +
						(userList.length > 0
							? userList
							: "Unknown Participant");
				} else channelIndex[msg.channel_id] = "Unknown channel";

				const transformedChannel = {
					id: msg.channel_id,
					type: ChannelTypeString[msg.channel.type],
					name: msg.channel.name,
				};
				if (msg.guild)
					// @ts-expect-error "guild" property is fine
					transformedChannel.guild = {
						id: msg.guild.id,
						name: msg.guild.name,
					};

				await fs.writeFile(
					path.join(
						takeoutPath,
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
				Contents: msg.content || "",
				Attachments:
					msg.attachments && msg.attachments.length > 0
						? JSON.stringify(msg.attachments)
						: "",
			};
			if (channelMessages.has(msg.channel_id))
				channelMessages.get(msg.channel_id).push(transformedMsg);
			else channelMessages.set(msg.channel_id, [transformedMsg]);
		}

		await fs.writeFile(
			path.join(takeoutPath, "messages", "index.json"),
			JSON.stringify(channelIndex, null, "\t"),
		);
		channelIndex = {};

		for await (const [channelId, messages] of channelMessages) {
			await fs.writeFile(
				path.join(
					takeoutPath,
					"messages",
					"c" + channelId,
					"messages.json",
				),
				JSON.stringify(messages, null, "\t"),
			);
		}
		channelMessages.clear();

		await fs.mkdir(path.join(takeoutPath, "servers"));
		let guildIndex: IndexStructure = {};
		for await (const member of members) {
			guildIndex[member.guild_id] = member.guild.name;

			const guildPath = path.join(
				takeoutPath,
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

		await fs.writeFile(
			path.join(takeoutPath, "servers", "index.json"),
			JSON.stringify(guildIndex, null, "\t"),
		);
		guildIndex = {};

		const date = new Date();
		await fs.mkdir(path.join(takeoutPath, "activity", "analytics"), {
			recursive: true,
		});
		await fs.writeFile(
			path.join(
				takeoutPath,
				"activity",
				"analytics",
				"events-" + date.getFullYear() + "-00000-of-00001.json",
			),
			JSON.stringify([], null, "\t"),
		);
		await fs.mkdir(path.join(takeoutPath, "activity", "tns"));
		await fs.writeFile(
			path.join(
				takeoutPath,
				"activity",
				"tns",
				"events-" + date.getFullYear() + "-00000-of-00001.json",
			),
			JSON.stringify([], null, "\t"),
		);

		const files = await fs.readdir(takeoutPath, {
			withFileTypes: true,
			recursive: true,
		});
		const promises = [];
		for await (const file of files) {
			if (!file.isFile()) continue;
			promises.push(
				fs
					.readFile(path.join(file.parentPath, file.name))
					.then((data) =>
						zip.file(
							path
								.join(file.parentPath, file.name)
								.replace(takeoutPath, "")
								.slice(path.sep.length)
								.replaceAll(path.sep, "/"),
							data,
						),
					),
			);
		}
		await Promise.all(promises);

		const buffer = await zip.generateAsync({ type: "nodebuffer" });
		await storage.set("takeouts/" + takeoutId + ".zip", buffer);

		await fs.rm(takeoutPath, { recursive: true });
	},
);

export default router;
