import { ServerMachine } from './core/machines/server';
import { XLNWebSocketServer } from './network/websocket';
import { XLNRestServer } from './network/rest';
import { TransactionValidator } from './core/transactions/validation';
import { TransactionExecutor } from './core/transactions/execution';
import { Mempool } from './core/transactions/mempool';
import { ConfigManager } from './utils/config';
import { XLNError, ErrorCode } from './utils/errors';
import { randomBytes } from 'crypto';

export class XLNNode {
    private server: ServerMachine;
    private wsServer: XLNWebSocketServer;
    private restServer: XLNRestServer;
    private validator: TransactionValidator;
    private executor: TransactionExecutor;
    private mempool: Mempool;
    private config: ConfigManager;
    private isRunning: boolean = false;
    private startTime: number = 0;

    constructor(config?: ConfigManager) {
        this.config = config || new ConfigManager();
        
        // Validate configuration
        const validation = this.config.validate();
        if (!validation.valid) {
            throw new XLNError(ErrorCode.INVALID_PARAMETER, `Invalid configuration: ${validation.errors.join(', ')}`);
        }

        // Initialize core components
        const serverConfig = this.config.getConfig();
        this.server = new ServerMachine(Buffer.from(serverConfig.id));
        this.mempool = new Mempool();
        this.validator = new TransactionValidator();
        this.executor = new TransactionExecutor(this.validator, this.mempool);

        // Initialize network servers
        this.wsServer = new XLNWebSocketServer(serverConfig.port + 1, serverConfig.host);
        this.restServer = new XLNRestServer(serverConfig.port);

        this.setupEventHandlers();
    }

    private setupEventHandlers(): void {
        // Server machine events
        this.server.on('block', (data) => {
            this.wsServer.broadcast('block', data);
        });

        this.server.on('error', (error) => {
            console.error('Server machine error:', error);
        });

        // WebSocket API handlers
        this.wsServer.on('api:server.getInfo', ({ clientId, message }) => {
            const info = {
                version: '1.0.0',
                nodeId: this.server.getId().toString('hex'),
                blockNumber: this.server.getBlockNumber(),
                signerCount: this.server.getSigners().length,
                config: this.config.getConfig()
            };
            this.wsServer.sendResponse(clientId, message.id, info);
        });

        this.wsServer.on('api:server.getStats', ({ clientId, message }) => {
            const stats = {
                mempool: this.mempool.getStatistics(),
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                connections: this.wsServer.getConnectedClients()
            };
            this.wsServer.sendResponse(clientId, message.id, stats);
        });

        this.wsServer.on('api:signer.create', async ({ clientId, message }) => {
            try {
                const { signerId, privateKey } = message.params;
                const signer = await this.server.createSigner(
                    signerId ? Buffer.from(signerId, 'hex') : randomBytes(8),
                    privateKey ? Buffer.from(privateKey, 'hex') : undefined
                );
                
                this.wsServer.sendResponse(clientId, message.id, {
                    signerId: signer.getId().toString('hex'),
                    publicKey: signer.getPublicKey().toString('hex')
                });
            } catch (error) {
                this.wsServer.sendError(clientId, message.id, 'Failed to create signer', -32603);
            }
        });

        this.wsServer.on('api:entity.create', async ({ clientId, message }) => {
            try {
                const { signerId, entityId, isMultiSig } = message.params;
                const signer = this.server.getChild(Buffer.from(signerId, 'hex'));
                
                if (!signer) {
                    this.wsServer.sendError(clientId, message.id, 'Signer not found', -32602);
                    return;
                }

                const entity = await (signer as any).createEntity(
                    entityId ? Buffer.from(entityId, 'hex') : randomBytes(8),
                    isMultiSig || false
                );
                
                this.wsServer.sendResponse(clientId, message.id, {
                    entityId: entity.getId().toString('hex'),
                    signerId: signerId,
                    isMultiSig: isMultiSig || false
                });
            } catch (error) {
                this.wsServer.sendError(clientId, message.id, 'Failed to create entity', -32603);
            }
        });

        this.wsServer.on('api:channel.open', async ({ clientId, message }) => {
            try {
                const { entityId, peerEntityId, initialBalance } = message.params;
                
                // Find the entity
                for (const signer of this.server.getSigners()) {
                    const entity = signer.getChild(Buffer.from(entityId, 'hex'));
                    if (entity) {
                        const channel = await (entity as any).createChannel(
                            Buffer.from(peerEntityId, 'hex'),
                            BigInt(initialBalance)
                        );
                        
                        this.wsServer.sendResponse(clientId, message.id, {
                            channelId: channel.getId().toString('hex'),
                            entityId,
                            peerEntityId,
                            initialBalance
                        });
                        return;
                    }
                }
                
                this.wsServer.sendError(clientId, message.id, 'Entity not found', -32602);
            } catch (error) {
                this.wsServer.sendError(clientId, message.id, 'Failed to open channel', -32603);
            }
        });

        // REST API handlers
        this.restServer.on('api:server.getStatus', (params, callback) => {
            const status = {
                status: 'running',
                version: '1.0.0',
                nodeId: this.server.getId().toString('hex'),
                blockNumber: this.server.getBlockNumber(),
                uptime: process.uptime()
            };
            callback(null, status);
        });

        this.restServer.on('api:server.getStats', (params, callback) => {
            const stats = {
                mempool: this.mempool.getStatistics(),
                memory: process.memoryUsage(),
                uptime: this.getUptime(),
                connections: this.wsServer.getConnectedClients(),
                signers: this.server.getSigners().length
            };
            callback(null, stats);
        });

        // Signer management
        this.restServer.on('api:signer.create', async (params, callback) => {
            try {
                const { signerId } = params;
                const signerIdBuffer = Buffer.from(signerId);
                const signer = await this.server.createSigner(signerIdBuffer);
                callback(null, {
                    signerId: signer.getId().toString('hex'),
                    publicKey: signer.getPublicKey().toString('hex')
                });
            } catch (error) {
                callback(error, null);
            }
        });

        this.restServer.on('api:signer.list', (params, callback) => {
            try {
                const signers = this.server.getSigners().map(signer => ({
                    signerId: signer.getId().toString('hex'),
                    publicKey: signer.getPublicKey().toString('hex')
                }));
                callback(null, { signers });
            } catch (error) {
                callback(error, null);
            }
        });

        this.restServer.on('api:signer.get', (params, callback) => {
            try {
                const { signerId } = params;
                const signer = this.server.getSigner(Buffer.from(signerId, 'hex'));
                if (!signer) {
                    callback(new Error('Signer not found'), null);
                    return;
                }
                callback(null, {
                    signerId: signer.getId().toString('hex'),
                    publicKey: signer.getPublicKey().toString('hex')
                });
            } catch (error) {
                callback(error, null);
            }
        });
    }

    async start(): Promise<void> {
        if (this.isRunning) {
            throw new XLNError(ErrorCode.INVALID_PARAMETER, 'Node is already running');
        }

        this.startTime = Date.now();

        try {
            // Start core server
            await this.server.start();

            // Start network servers
            await this.restServer.start();
            // WebSocket server starts automatically

            this.isRunning = true;
            console.log(`XLN Node started on ${this.config.getConfig().host}:${this.config.getConfig().port}`);
            console.log(`WebSocket server on port ${this.config.getConfig().port + 1}`);
            console.log(`Node ID: ${this.server.getId().toString('hex')}`);

        } catch (error) {
            throw new XLNError(ErrorCode.UNKNOWN_ERROR, `Failed to start node: ${error}`);
        }
    }

    async stop(): Promise<void> {
        if (!this.isRunning) {
            return;
        }

        try {
            // Stop network servers
            await this.restServer.stop();
            this.wsServer.close();

            // Stop core server
            await this.server.stop();

            this.isRunning = false;
            console.log('XLN Node stopped');

        } catch (error) {
            throw new XLNError(ErrorCode.UNKNOWN_ERROR, `Failed to stop node: ${error}`);
        }
    }

    getServer(): ServerMachine {
        return this.server;
    }

    getMempool(): Mempool {
        return this.mempool;
    }

    getValidator(): TransactionValidator {
        return this.validator;
    }

    private getUptime(): number {
        return this.startTime > 0 ? Date.now() - this.startTime : 0;
    }

    getExecutor(): TransactionExecutor {
        return this.executor;
    }

    getConfig(): ConfigManager {
        return this.config;
    }

    isNodeRunning(): boolean {
        return this.isRunning;
    }

    // Convenience methods for testing and development
    async createTestSigner(): Promise<any> {
        return await this.server.createSigner(randomBytes(8));
    }

    async createTestEntity(signerId?: Buffer): Promise<any> {
        let signer;
        
        if (signerId) {
            signer = this.server.getChild(signerId);
        } else {
            signer = await this.createTestSigner();
        }
        
        if (!signer) {
            throw new XLNError(ErrorCode.MACHINE_NOT_FOUND, 'Signer not found');
        }
        
        return await (signer as any).createEntity(randomBytes(8), false);
    }

    async createTestChannel(entityId?: Buffer, peerEntityId?: Buffer): Promise<any> {
        let entity;
        
        if (entityId) {
            // Find entity across all signers
            for (const signer of this.server.getSigners()) {
                entity = signer.getChild(entityId);
                if (entity) break;
            }
        } else {
            entity = await this.createTestEntity();
        }
        
        if (!entity) {
            throw new XLNError(ErrorCode.MACHINE_NOT_FOUND, 'Entity not found');
        }
        
        const peer = peerEntityId || randomBytes(8);
        return await (entity as any).createChannel(peer, BigInt(1000));
    }
}

// Export main classes and types
export * from './types/core';
export * from './core/machines/base';
export * from './core/machines/server';
export * from './core/machines/signer';
export * from './core/machines/entity';
export * from './core/machines/channel';
export * from './core/state/merkle';
export * from './core/state/storage';
export * from './core/transactions/mempool';
export * from './core/transactions/validation';
export * from './core/transactions/execution';
export * from './network/websocket';
export * from './network/rest';
export * from './utils/config';
export * from './utils/errors';
export * from './utils/constants';
export * from './utils/encoding';
export * from './crypto/hashing';

// Default export
export default XLNNode;