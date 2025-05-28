import { WebSocketServer, WebSocket } from 'ws';
import { EventEmitter } from 'events';
import { Message, Transaction, MachineID } from '../types/core';
import { encodeRLP, decodeRLP } from '../utils/encoding';

export interface WSMessage {
    id: string;
    method: string;
    params: any;
    token?: string;
}

export interface WSResponse {
    id: string;
    result?: any;
    error?: {
        code: number;
        message: string;
        data?: any;
    };
}

export class XLNWebSocketServer extends EventEmitter {
    private server: WebSocketServer;
    private clients: Map<string, WebSocket>;
    private tokenAuth: Map<string, string>; // token -> clientId
    private subscriptions: Map<string, Set<string>>; // clientId -> set of event types

    constructor(port: number, host: string = 'localhost') {
        super();
        this.clients = new Map();
        this.tokenAuth = new Map();
        this.subscriptions = new Map();

        this.server = new WebSocketServer({
            port,
            host,
            perMessageDeflate: false
        });

        this.setupEventHandlers();
    }

    private setupEventHandlers(): void {
        this.server.on('connection', (ws: WebSocket, request) => {
            const clientId = this.generateClientId();
            this.clients.set(clientId, ws);
            this.subscriptions.set(clientId, new Set());

            console.log(`Client ${clientId} connected from ${request.socket.remoteAddress}`);

            ws.on('message', async (data: Buffer) => {
                try {
                    const message: WSMessage = JSON.parse(data.toString());
                    await this.handleMessage(clientId, message);
                } catch (error) {
                    this.sendError(clientId, 'invalid-request', 'Invalid JSON message', -32700);
                }
            });

            ws.on('close', () => {
                console.log(`Client ${clientId} disconnected`);
                this.clients.delete(clientId);
                this.subscriptions.delete(clientId);

                // Remove token association
                for (const [token, id] of this.tokenAuth.entries()) {
                    if (id === clientId) {
                        this.tokenAuth.delete(token);
                        break;
                    }
                }
            });

            ws.on('error', (error) => {
                console.error(`WebSocket error for client ${clientId}:`, error);
            });

            // Send connection confirmation
            this.sendResponse(clientId, 'connection', {
                clientId,
                timestamp: Date.now(),
                version: '1.0.0'
            });
        });

        this.server.on('error', (error) => {
            console.error('WebSocket server error:', error);
            this.emit('error', error);
        });
    }

    private async handleMessage(clientId: string, message: WSMessage): Promise<void> {
        try {
            // Authenticate if token provided
            if (message.token && !this.isAuthenticated(clientId)) {
                this.tokenAuth.set(message.token, clientId);
            }

            // Route message based on method
            switch (message.method) {
                case 'ping':
                    this.sendResponse(clientId, message.id, { pong: Date.now() });
                    break;

                case 'authenticate':
                    await this.handleAuthenticate(clientId, message);
                    break;

                case 'subscribe':
                    await this.handleSubscribe(clientId, message);
                    break;

                case 'unsubscribe':
                    await this.handleUnsubscribe(clientId, message);
                    break;

                case 'server.getInfo':
                    await this.handleServerInfo(clientId, message);
                    break;

                case 'server.getStats':
                    await this.handleServerStats(clientId, message);
                    break;

                case 'signer.create':
                    await this.handleSignerCreate(clientId, message);
                    break;

                case 'entity.create':
                    await this.handleEntityCreate(clientId, message);
                    break;

                case 'entity.propose':
                    await this.handleEntityPropose(clientId, message);
                    break;

                case 'entity.vote':
                    await this.handleEntityVote(clientId, message);
                    break;

                case 'channel.open':
                    await this.handleChannelOpen(clientId, message);
                    break;

                case 'channel.update':
                    await this.handleChannelUpdate(clientId, message);
                    break;

                case 'channel.close':
                    await this.handleChannelClose(clientId, message);
                    break;

                default:
                    this.sendError(clientId, message.id, 'Method not found', -32601);
            }
        } catch (error) {
            console.error(`Error handling message from ${clientId}:`, error);
            this.sendError(clientId, message.id, 'Internal error', -32603);
        }
    }

    private async handleAuthenticate(clientId: string, message: WSMessage): Promise<void> {
        const { token } = message.params;

        if (!token) {
            this.sendError(clientId, message.id, 'Token required', -32602);
            return;
        }

        // In a real implementation, validate token against database/auth service
        this.tokenAuth.set(token, clientId);
        this.sendResponse(clientId, message.id, { authenticated: true });
    }

    private async handleSubscribe(clientId: string, message: WSMessage): Promise<void> {
        const { events } = message.params;

        if (!Array.isArray(events)) {
            this.sendError(clientId, message.id, 'Events must be an array', -32602);
            return;
        }

        const subscriptions = this.subscriptions.get(clientId)!;
        for (const event of events) {
            subscriptions.add(event);
        }

        this.sendResponse(clientId, message.id, { subscribed: events });
    }

    private async handleUnsubscribe(clientId: string, message: WSMessage): Promise<void> {
        const { events } = message.params;

        if (!Array.isArray(events)) {
            this.sendError(clientId, message.id, 'Events must be an array', -32602);
            return;
        }

        const subscriptions = this.subscriptions.get(clientId)!;
        for (const event of events) {
            subscriptions.delete(event);
        }

        this.sendResponse(clientId, message.id, { unsubscribed: events });
    }

    private async handleServerInfo(clientId: string, message: WSMessage): Promise<void> {
        this.emit('api:server.getInfo', { clientId, message });
    }

    private async handleServerStats(clientId: string, message: WSMessage): Promise<void> {
        this.emit('api:server.getStats', { clientId, message });
    }

    private async handleSignerCreate(clientId: string, message: WSMessage): Promise<void> {
        this.emit('api:signer.create', { clientId, message });
    }

    private async handleEntityCreate(clientId: string, message: WSMessage): Promise<void> {
        this.emit('api:entity.create', { clientId, message });
    }

    private async handleEntityPropose(clientId: string, message: WSMessage): Promise<void> {
        this.emit('api:entity.propose', { clientId, message });
    }

    private async handleEntityVote(clientId: string, message: WSMessage): Promise<void> {
        this.emit('api:entity.vote', { clientId, message });
    }

    private async handleChannelOpen(clientId: string, message: WSMessage): Promise<void> {
        this.emit('api:channel.open', { clientId, message });
    }

    private async handleChannelUpdate(clientId: string, message: WSMessage): Promise<void> {
        this.emit('api:channel.update', { clientId, message });
    }

    private async handleChannelClose(clientId: string, message: WSMessage): Promise<void> {
        this.emit('api:channel.close', { clientId, message });
    }

    sendResponse(clientId: string, messageId: string, result: any): void {
        const client = this.clients.get(clientId);
        if (!client) return;

        const response: WSResponse = {
            id: messageId,
            result
        };

        client.send(JSON.stringify(response));
    }

    sendError(
        clientId: string,
        messageId: string,
        message: string,
        code: number,
        data?: any
    ): void {
        const client = this.clients.get(clientId);
        if (!client) return;

        const response: WSResponse = {
            id: messageId,
            error: {
                code,
                message,
                data
            }
        };

        client.send(JSON.stringify(response));
    }

    broadcast(event: string, data: any): void {
        const message = JSON.stringify({
            event,
            data,
            timestamp: Date.now()
        });

        for (const [clientId, subscriptions] of this.subscriptions.entries()) {
            if (subscriptions.has(event) || subscriptions.has('*')) {
                const client = this.clients.get(clientId);
                if (client && client.readyState === WebSocket.OPEN) {
                    client.send(message);
                }
            }
        }
    }

    sendToClient(clientId: string, event: string, data: any): void {
        const client = this.clients.get(clientId);
        if (!client || client.readyState !== WebSocket.OPEN) return;

        const message = JSON.stringify({
            event,
            data,
            timestamp: Date.now()
        });

        client.send(message);
    }

    private isAuthenticated(clientId: string): boolean {
        for (const id of this.tokenAuth.values()) {
            if (id === clientId) return true;
        }
        return false;
    }

    private generateClientId(): string {
        return 'client_' + Math.random().toString(36).substring(2, 15);
    }

    getConnectedClients(): number {
        return this.clients.size;
    }

    getSubscriptions(): Map<string, Set<string>> {
        return new Map(this.subscriptions);
    }

    close(): void {
        for (const client of this.clients.values()) {
            client.close();
        }
        this.server.close();
    }
}
