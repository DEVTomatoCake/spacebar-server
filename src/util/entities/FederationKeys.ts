import { Column, Entity, PrimaryColumn } from "typeorm";
import { BaseClassWithoutId } from "./BaseClass";

import crypto from "crypto";
import { promisify } from "util";
const generateKeyPair = promisify(crypto.generateKeyPair);

export enum ActorType {
	USER = "users",
	CHANNEL = "channels",
	GUILD = "guilds",
}

@Entity("federation_keys")
export class FederationKey extends BaseClassWithoutId {
	/** The ID of this actor. */
	@PrimaryColumn()
	actorId: string;

	/** The type of this actor. I.e. User, Channel, Guild */
	@Column()
	type: ActorType;

	/** The domain of this actor. I.e. spacebar.chat */
	@Column()
	domain: string;

	/** The federated preferred username of remote users. Local usernames are null. */
	@Column({ nullable: true, type: String })
	username: string | null;

	/** The remote ID ( actor URL ) of this user */
	@Column()
	federatedId: string;

	/** The inbox of the remote user */
	@Column()
	inbox: string;

	/** The outbox of the remote user */
	@Column()
	outbox: string;

	/** The following collection of this user */
	@Column()
	following: string;

	/** The followers collection of this user */
	@Column()
	followers: string;

	/** The public key of this actor. Public keys of remote actors are cached. */
	@Column()
	publicKey: string;

	/** Will only have a private key if this actor is ours */
	@Column({ nullable: true, type: String })
	privateKey: string | null;

	/** Create a new FederationKey for an actor */
	static generateSigningKeys = async (actorId: string, type: ActorType) => {
		const existing = await FederationKey.findOne({ where: { actorId } });
		if (existing) return existing;

		// Lazy loading config to prevent circular dep
		const { Config } = await import("../util/Config");

		const { accountDomain, host } = Config.get().federation;

		const keys = FederationKey.create({
			actorId,
			type,
			federatedId: `https://${host}/federation/${type}/${actorId}`,
			inbox: `https://${host}/federation/${type}/${actorId}/inbox`,
			outbox: `https://${host}/federation/${type}/${actorId}/outbox`,
			followers: `https://${host}/federation/${type}/${actorId}/followers`,
			following: `https://${host}/federation/${type}/${actorId}/following`,
			domain: accountDomain,
			...(await generateKeyPair("rsa", {
				modulusLength: 4096,
				publicKeyEncoding: {
					type: "spki",
					format: "pem",
				},
				privateKeyEncoding: {
					type: "pkcs8",
					format: "pem",
				},
			})),
		});

		return await keys.save();
	};
}
