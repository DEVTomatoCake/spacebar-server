import { route } from "@spacebar/api";
import {
	Config,
	Message,
	User,
} from "@spacebar/util";
import { Router } from "express";
const router = Router();

router.get("/2.0.json", route({}), (req, res) => {
	const { disabled } = Config.get().register;

	res.send({
		version: "2.0",
		software: {
			name: "spacebar",
			version: "0.1.0"
		},
		protocols: ["activitypub"],
		usage: {
			users: {
				total: User.count(),
				activeHalfyear: -1,
				activeMonth: -1
			},
			localPosts: Message.count(),
			localComments: 0
		},
		openRegistrations: !disabled
	});
});

export default router;
