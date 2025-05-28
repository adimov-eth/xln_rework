import { EventEmitter } from "events";
import cors from "cors";
import express, {
	type Express,
	type Request,
	type Response,
	type NextFunction,
} from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";

export interface APIError {
	code: number;
	message: string;
	data?: any;
}

export interface APIResponse<T = any> {
	success: boolean;
	data?: T;
	error?: APIError;
	timestamp: number;
}

export class XLNRestServer extends EventEmitter {
	private app: Express;
	private server: any;
	private port: number;

	constructor(port = 8080) {
		super();
		this.port = port;
		this.app = express();
		this.setupMiddleware();
		this.setupRoutes();
		this.setupErrorHandling();
	}

	private setupMiddleware(): void {
		// Security middleware
		this.app.use(
			helmet({
				contentSecurityPolicy: {
					directives: {
						defaultSrc: ["'self'"],
						scriptSrc: ["'self'"],
						styleSrc: ["'self'", "'unsafe-inline'"],
					},
				},
			}),
		);

		// CORS
		this.app.use(
			cors({
				origin: process.env.NODE_ENV === "production" ? false : true,
				credentials: true,
			}),
		);

		// Rate limiting
		const limiter = rateLimit({
			windowMs: 15 * 60 * 1000, // 15 minutes
			max: 1000, // limit each IP to 1000 requests per windowMs
			message: "Too many requests from this IP, please try again later.",
		});
		this.app.use("/api", limiter);

		// Body parsing
		this.app.use(express.json({ limit: "10mb" }));
		this.app.use(express.urlencoded({ extended: true }));

		// Request logging
		this.app.use((req: Request, res: Response, next: NextFunction) => {
			console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
			next();
		});
	}

	private setupRoutes(): void {
		// Health check
		this.app.get("/health", (req: Request, res: Response) => {
			this.sendResponse(res, {
				status: "healthy",
				timestamp: Date.now(),
				uptime: process.uptime(),
			});
		});

		// API v1 routes
		const apiV1 = express.Router();

		// Server routes
		apiV1.get("/server/status", this.handleServerStatus.bind(this));
		apiV1.get("/server/stats", this.handleServerStats.bind(this));

		// Signer routes
		apiV1.get("/signers", this.handleGetSigners.bind(this));
		apiV1.post("/signers", this.handleCreateSigner.bind(this));
		apiV1.get("/signers/:id", this.handleGetSigner.bind(this));

		// Entity routes
		apiV1.get("/entities", this.handleGetEntities.bind(this));
		apiV1.post("/entities", this.handleCreateEntity.bind(this));
		apiV1.get("/entities/:id", this.handleGetEntity.bind(this));
		apiV1.get("/entities/:id/state", this.handleGetEntityState.bind(this));
		apiV1.post("/entities/:id/proposals", this.handleCreateProposal.bind(this));
		apiV1.post(
			"/entities/:id/proposals/:pid/vote",
			this.handleVoteProposal.bind(this),
		);

		// Channel routes
		apiV1.get("/channels", this.handleGetChannels.bind(this));
		apiV1.post("/channels", this.handleCreateChannel.bind(this));
		apiV1.get("/channels/:id", this.handleGetChannel.bind(this));
		apiV1.post("/channels/:id/update", this.handleUpdateChannel.bind(this));
		apiV1.delete("/channels/:id", this.handleCloseChannel.bind(this));

		// Depositary routes
		apiV1.post("/depositaries/:id/deposit", this.handleDeposit.bind(this));
		apiV1.post("/depositaries/:id/withdraw", this.handleWithdraw.bind(this));

		this.app.use("/api/v1", apiV1);

		// Catch-all for unknown routes
		this.app.use("*", (req: Request, res: Response) => {
			this.sendError(res, 404, "Not Found", "Route not found");
		});
	}

	private setupErrorHandling(): void {
		this.app.use(
			(error: Error, req: Request, res: Response, next: NextFunction) => {
				console.error("Unhandled error:", error);
				this.sendError(res, 500, "Internal Server Error", error.message);
			},
		);
	}

	// Server handlers
	private async handleServerStatus(req: Request, res: Response): Promise<void> {
		try {
			const result = await this.emitAPICall("server.getStatus", {});
			this.sendResponse(res, result);
		} catch (error) {
			this.sendError(res, 500, "Failed to get server status", error);
		}
	}

	private async handleServerStats(req: Request, res: Response): Promise<void> {
		try {
			const result = await this.emitAPICall("server.getStats", {});
			this.sendResponse(res, result);
		} catch (error) {
			this.sendError(res, 500, "Failed to get server stats", error);
		}
	}

	// Signer handlers
	private async handleGetSigners(req: Request, res: Response): Promise<void> {
		try {
			const result = await this.emitAPICall("signer.list", {});
			this.sendResponse(res, result);
		} catch (error) {
			this.sendError(res, 500, "Failed to get signers", error);
		}
	}

	private async handleCreateSigner(req: Request, res: Response): Promise<void> {
		try {
			const { signerId, privateKey } = req.body;
			const result = await this.emitAPICall("signer.create", {
				signerId,
				privateKey,
			});
			this.sendResponse(res, result);
		} catch (error) {
			this.sendError(res, 500, "Failed to create signer", error);
		}
	}

	private async handleGetSigner(req: Request, res: Response): Promise<void> {
		try {
			const { id } = req.params;
			const result = await this.emitAPICall("signer.get", { signerId: id });
			this.sendResponse(res, result);
		} catch (error) {
			this.sendError(res, 500, "Failed to get signer", error);
		}
	}

	// Entity handlers
	private async handleGetEntities(req: Request, res: Response): Promise<void> {
		try {
			const result = await this.emitAPICall("entity.list", {});
			this.sendResponse(res, result);
		} catch (error) {
			this.sendError(res, 500, "Failed to get entities", error);
		}
	}

	private async handleCreateEntity(req: Request, res: Response): Promise<void> {
		try {
			const { signerId, entityId, isMultiSig } = req.body;
			const result = await this.emitAPICall("entity.create", {
				signerId,
				entityId,
				isMultiSig,
			});
			this.sendResponse(res, result);
		} catch (error) {
			this.sendError(res, 500, "Failed to create entity", error);
		}
	}

	private async handleGetEntity(req: Request, res: Response): Promise<void> {
		try {
			const { id } = req.params;
			const result = await this.emitAPICall("entity.get", { entityId: id });
			this.sendResponse(res, result);
		} catch (error) {
			this.sendError(res, 500, "Failed to get entity", error);
		}
	}

	private async handleGetEntityState(
		req: Request,
		res: Response,
	): Promise<void> {
		try {
			const { id } = req.params;
			const result = await this.emitAPICall("entity.getState", {
				entityId: id,
			});
			this.sendResponse(res, result);
		} catch (error) {
			this.sendError(res, 500, "Failed to get entity state", error);
		}
	}

	private async handleCreateProposal(
		req: Request,
		res: Response,
	): Promise<void> {
		try {
			const { id } = req.params;
			const { type, data, proposer } = req.body;
			const result = await this.emitAPICall("entity.propose", {
				entityId: id,
				type,
				data,
				proposer,
			});
			this.sendResponse(res, result);
		} catch (error) {
			this.sendError(res, 500, "Failed to create proposal", error);
		}
	}

	private async handleVoteProposal(req: Request, res: Response): Promise<void> {
		try {
			const { id, pid } = req.params;
			const { voter, signature } = req.body;
			const result = await this.emitAPICall("entity.vote", {
				entityId: id,
				proposalId: pid,
				voter,
				signature,
			});
			this.sendResponse(res, result);
		} catch (error) {
			this.sendError(res, 500, "Failed to vote on proposal", error);
		}
	}

	// Channel handlers
	private async handleGetChannels(req: Request, res: Response): Promise<void> {
		try {
			const result = await this.emitAPICall("channel.list", {});
			this.sendResponse(res, result);
		} catch (error) {
			this.sendError(res, 500, "Failed to get channels", error);
		}
	}

	private async handleCreateChannel(
		req: Request,
		res: Response,
	): Promise<void> {
		try {
			const { entityId, peerEntityId, initialBalance } = req.body;
			const result = await this.emitAPICall("channel.create", {
				entityId,
				peerEntityId,
				initialBalance,
			});
			this.sendResponse(res, result);
		} catch (error) {
			this.sendError(res, 500, "Failed to create channel", error);
		}
	}

	private async handleGetChannel(req: Request, res: Response): Promise<void> {
		try {
			const { id } = req.params;
			const result = await this.emitAPICall("channel.get", { channelId: id });
			this.sendResponse(res, result);
		} catch (error) {
			this.sendError(res, 500, "Failed to get channel", error);
		}
	}

	private async handleUpdateChannel(
		req: Request,
		res: Response,
	): Promise<void> {
		try {
			const { id } = req.params;
			const { action, params } = req.body;
			const result = await this.emitAPICall("channel.update", {
				channelId: id,
				action,
				params,
			});
			this.sendResponse(res, result);
		} catch (error) {
			this.sendError(res, 500, "Failed to update channel", error);
		}
	}

	private async handleCloseChannel(req: Request, res: Response): Promise<void> {
		try {
			const { id } = req.params;
			const { cooperative } = req.body;
			const result = await this.emitAPICall("channel.close", {
				channelId: id,
				cooperative,
			});
			this.sendResponse(res, result);
		} catch (error) {
			this.sendError(res, 500, "Failed to close channel", error);
		}
	}

	// Depositary handlers
	private async handleDeposit(req: Request, res: Response): Promise<void> {
		try {
			const { id } = req.params;
			const { amount, asset } = req.body;
			const result = await this.emitAPICall("depositary.deposit", {
				depositaryId: id,
				amount,
				asset,
			});
			this.sendResponse(res, result);
		} catch (error) {
			this.sendError(res, 500, "Failed to deposit", error);
		}
	}

	private async handleWithdraw(req: Request, res: Response): Promise<void> {
		try {
			const { id } = req.params;
			const { amount, asset } = req.body;
			const result = await this.emitAPICall("depositary.withdraw", {
				depositaryId: id,
				amount,
				asset,
			});
			this.sendResponse(res, result);
		} catch (error) {
			this.sendError(res, 500, "Failed to withdraw", error);
		}
	}

	private sendResponse<T>(res: Response, data: T): void {
		const response: APIResponse<T> = {
			success: true,
			data,
			timestamp: Date.now(),
		};
		res.json(response);
	}

	private sendError(
		res: Response,
		code: number,
		message: string,
		details?: any,
	): void {
		const response: APIResponse = {
			success: false,
			error: {
				code,
				message,
				data: details,
			},
			timestamp: Date.now(),
		};
		res.status(code).json(response);
	}

	private async emitAPICall(method: string, params: any): Promise<any> {
		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				reject(new Error("API call timeout"));
			}, 30000);

			this.emit(`api:${method}`, params, (error: any, result: any) => {
				clearTimeout(timeout);
				if (error) {
					reject(error);
				} else {
					resolve(result);
				}
			});
		});
	}

	start(): Promise<void> {
		return new Promise((resolve) => {
			this.server = this.app.listen(this.port, () => {
				console.log(`XLN REST API server listening on port ${this.port}`);
				resolve();
			});
		});
	}

	stop(): Promise<void> {
		return new Promise((resolve) => {
			if (this.server) {
				this.server.close(() => {
					console.log("XLN REST API server stopped");
					resolve();
				});
			} else {
				resolve();
			}
		});
	}

	getApp(): Express {
		return this.app;
	}
}
