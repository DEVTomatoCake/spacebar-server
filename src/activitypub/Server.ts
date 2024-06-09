import { CORS, ErrorHandler } from "@spacebar/api";
import {
	Config,
	JSONReplacer,
	Sentry,
	initDatabase,
	registerRoutes,
	setupMorganLogging,
} from "@spacebar/util";
import bodyParser from "body-parser";
import { Request, Response, Router } from "express";
import { Server, ServerOptions } from "lambert-server";
import path from "path";
import wellknown from "./well-known";

type SpacebarServerOptions = ServerOptions;

export class FederationServer extends Server {
	public declare options: SpacebarServerOptions;

	constructor(opts?: Partial<SpacebarServerOptions>) {
		// eslint-disable-next-line @typescript-eslint/ban-ts-comment
		// @ts-ignore
		super({ ...opts, errorHandler: false, jsonBody: false });
	}

	async start() {
		await initDatabase();
		await Config.init();
		await Sentry.init(this.app);

		if (!Config.get().federation.enabled) {
			return;
		}

		console.log("Federation is enabled!");

		this.app.set("json replacer", JSONReplacer);
		this.app.use(CORS);
		this.app.use(bodyParser.json({ inflate: true }));
		this.app.use(
			bodyParser.json({
				type: "application/activity+json",
			}),
		);
		this.app.use(bodyParser.urlencoded({ inflate: true, extended: true }));

		setupMorganLogging(this.app);

		const app = this.app;
		const api = Router();
		// eslint-disable-next-line @typescript-eslint/ban-ts-comment
		// @ts-ignore
		this.app = api;

		// TODO: auth
		// TODO: rate limits

		this.app.use("*", (req, res, next) => {
			res.setHeader(
				"Content-Type",
				"application/activity+json; charset=utf-8",
			);
			next();
		});

		this.routes = await registerRoutes(
			this,
			path.join(__dirname, "routes", "/"),
		);

		this.app = app;

		this.app.use("/federation", api);
		this.app.use("/.well-known", wellknown);

		this.app.use(ErrorHandler);

		Sentry.errorHandler(this.app);

		api.use("*", (req: Request, res: Response) => {
			res.status(404).json({
				message: "404 endpoint not found",
				code: 0,
			});
		});

		return super.start();
	}
}
