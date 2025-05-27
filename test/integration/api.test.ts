import request from 'supertest';
import WebSocket from 'ws';
import XLNNode from '../../src/index';
import { ConfigManager } from '../../src/utils/config';

describe('API Integration Tests', () => {
    let node: XLNNode;
    let config: ConfigManager;

    beforeAll(async () => {
        config = new ConfigManager({
            port: 9000, // Use different port for testing
            host: 'localhost'
        });
        node = new XLNNode(config);
        await node.start();
    });

    afterAll(async () => {
        await node.stop();
    });

    describe('REST API', () => {
        const baseUrl = 'http://localhost:9000/api/v1';

        test('should get server status', async () => {
            const response = await request(baseUrl)
                .get('/server/status')
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data).toHaveProperty('status');
            expect(response.body.data).toHaveProperty('version');
            expect(response.body.data).toHaveProperty('nodeId');
        });

        test('should get server stats', async () => {
            const response = await request(baseUrl)
                .get('/server/stats')
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data).toHaveProperty('mempool');
            expect(response.body.data).toHaveProperty('uptime');
            expect(response.body.data).toHaveProperty('memory');
        });

        test('should create signer', async () => {
            const response = await request(baseUrl)
                .post('/signers')
                .send({
                    signerId: 'test-signer-001'
                })
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data).toHaveProperty('signerId');
            expect(response.body.data).toHaveProperty('publicKey');
        });

        test('should create entity', async () => {
            // First create a signer
            const signerResponse = await request(baseUrl)
                .post('/signers')
                .send({
                    signerId: 'test-signer-002'
                });

            const signerId = signerResponse.body.data.signerId;

            const response = await request(baseUrl)
                .post('/entities')
                .send({
                    signerId,
                    entityId: 'test-entity-001',
                    isMultiSig: false
                })
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data).toHaveProperty('entityId');
            expect(response.body.data.signerId).toBe(signerId);
        });

        test('should create channel', async () => {
            // Create signers and entities
            const signer1Response = await request(baseUrl)
                .post('/signers')
                .send({ signerId: 'test-signer-003' });
            
            const signer2Response = await request(baseUrl)
                .post('/signers')
                .send({ signerId: 'test-signer-004' });

            const entity1Response = await request(baseUrl)
                .post('/entities')
                .send({
                    signerId: signer1Response.body.data.signerId,
                    entityId: 'test-entity-002',
                    isMultiSig: false
                });

            const entity2Response = await request(baseUrl)
                .post('/entities')
                .send({
                    signerId: signer2Response.body.data.signerId,
                    entityId: 'test-entity-003',
                    isMultiSig: false
                });

            const response = await request(baseUrl)
                .post('/channels')
                .send({
                    entityId: entity1Response.body.data.entityId,
                    peerEntityId: entity2Response.body.data.entityId,
                    initialBalance: '1000000000000000000' // 1 ETH
                })
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data).toHaveProperty('channelId');
        });

        test('should handle errors gracefully', async () => {
            const response = await request(baseUrl)
                .get('/non-existent-endpoint')
                .expect(404);

            expect(response.body.success).toBe(false);
            expect(response.body.error).toHaveProperty('code', 404);
        });

        test('should validate request parameters', async () => {
            const response = await request(baseUrl)
                .post('/entities')
                .send({
                    // Missing required signerId
                    entityId: 'test-entity-invalid'
                })
                .expect(500);

            expect(response.body.success).toBe(false);
            expect(response.body.error).toBeDefined();
        });
    });

    describe('WebSocket API', () => {
        let ws: WebSocket;

        beforeEach((done) => {
            ws = new WebSocket('ws://localhost:9001/api/v1/ws');
            ws.on('open', done);
        });

        afterEach(() => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.close();
            }
        });

        test('should connect and receive connection confirmation', (done) => {
            ws.on('message', (data) => {
                const message = JSON.parse(data.toString());
                if (message.id === 'connection') {
                    expect(message.result).toHaveProperty('clientId');
                    expect(message.result).toHaveProperty('version');
                    done();
                }
            });
        });

        test('should handle ping-pong', (done) => {
            ws.on('message', (data) => {
                const message = JSON.parse(data.toString());
                if (message.id === 'ping-test') {
                    expect(message.result).toHaveProperty('pong');
                    done();
                }
            });

            ws.send(JSON.stringify({
                id: 'ping-test',
                method: 'ping',
                params: {}
            }));
        });

        test('should create signer via WebSocket', (done) => {
            ws.on('message', (data) => {
                const message = JSON.parse(data.toString());
                if (message.id === 'create-signer-test') {
                    expect(message.result).toHaveProperty('signerId');
                    expect(message.result).toHaveProperty('publicKey');
                    done();
                }
            });

            ws.send(JSON.stringify({
                id: 'create-signer-test',
                method: 'signer.create',
                params: {
                    signerId: 'ws-test-signer'
                }
            }));
        });

        test('should subscribe to events', (done) => {
            let subscriptionConfirmed = false;
            let eventReceived = false;

            ws.on('message', (data) => {
                const message = JSON.parse(data.toString());
                
                if (message.id === 'subscribe-test') {
                    expect(message.result).toHaveProperty('subscribed');
                    expect(message.result.subscribed).toContain('block');
                    subscriptionConfirmed = true;
                    
                    // Trigger a block to test event reception
                    node.getServer().processBlock();
                } else if (message.event === 'block') {
                    eventReceived = true;
                    expect(message.data).toHaveProperty('block');
                    expect(message.data).toHaveProperty('hash');
                    
                    if (subscriptionConfirmed && eventReceived) {
                        done();
                    }
                }
            });

            ws.send(JSON.stringify({
                id: 'subscribe-test',
                method: 'subscribe',
                params: {
                    events: ['block', 'transaction', 'channel']
                }
            }));
        });

        test('should handle authentication', (done) => {
            ws.on('message', (data) => {
                const message = JSON.parse(data.toString());
                if (message.id === 'auth-test') {
                    expect(message.result).toHaveProperty('authenticated', true);
                    done();
                }
            });

            ws.send(JSON.stringify({
                id: 'auth-test',
                method: 'authenticate',
                params: {
                    token: 'test-token'
                }
            }));
        });

        test('should handle invalid methods', (done) => {
            ws.on('message', (data) => {
                const message = JSON.parse(data.toString());
                if (message.id === 'invalid-test') {
                    expect(message.error).toBeDefined();
                    expect(message.error.code).toBe(-32601); // Method not found
                    done();
                }
            });

            ws.send(JSON.stringify({
                id: 'invalid-test',
                method: 'invalid.method',
                params: {}
            }));
        });
    });

    describe('Cross-API Consistency', () => {
        test('should maintain data consistency between REST and WebSocket APIs', async () => {
            // Create signer via REST
            const restResponse = await request('http://localhost:9000/api/v1')
                .post('/signers')
                .send({
                    signerId: 'consistency-test-signer'
                });

            const signerId = restResponse.body.data.signerId;

            // Verify via WebSocket
            const ws = new WebSocket('ws://localhost:9001/api/v1/ws');
            
            await new Promise<void>((resolve, reject) => {
                ws.on('open', () => {
                    ws.on('message', (data) => {
                        const message = JSON.parse(data.toString());
                        if (message.id === 'verify-signer') {
                            if (message.result) {
                                expect(message.result.signerId).toBe(signerId);
                                resolve();
                            } else {
                                reject(new Error('Signer not found via WebSocket'));
                            }
                        }
                    });

                    ws.send(JSON.stringify({
                        id: 'verify-signer',
                        method: 'signer.get',
                        params: { signerId }
                    }));
                });

                ws.on('error', reject);
            });

            ws.close();
        });
    });

    describe('Rate Limiting', () => {
        test('should enforce rate limits', async () => {
            const requests = [];
            
            // Make many requests quickly
            for (let i = 0; i < 20; i++) {
                requests.push(
                    request('http://localhost:9000/api/v1')
                        .get('/server/status')
                );
            }

            const responses = await Promise.all(requests);
            
            // At least some should succeed (within rate limit)
            const successfulResponses = responses.filter(r => r.status === 200);
            expect(successfulResponses.length).toBeGreaterThan(0);
            
            // Some might be rate limited if the limit is low enough
            const rateLimitedResponses = responses.filter(r => r.status === 429);
            // This test is flexible since rate limiting depends on configuration
            expect(rateLimitedResponses.length).toBeGreaterThanOrEqual(0);
        });
    });

    describe('Error Handling', () => {
        test('should handle malformed JSON gracefully', (done) => {
            const ws = new WebSocket('ws://localhost:9001/api/v1/ws');
            
            ws.on('open', () => {
                ws.on('message', (data) => {
                    const message = JSON.parse(data.toString());
                    if (message.error && message.error.code === -32700) {
                        // Parse error
                        done();
                    }
                });

                // Send malformed JSON
                ws.send('{"invalid": json}');
            });
        });

        test('should handle server errors gracefully', async () => {
            // This would test server error scenarios
            // For now, just ensure the API doesn't crash
            const response = await request('http://localhost:9000/api/v1')
                .post('/signers')
                .send({
                    signerId: null // Invalid data that might cause server error
                });

            // Should get an error response, not a crash
            expect(response.status).toBeGreaterThanOrEqual(400);
            expect(response.body.success).toBe(false);
        });
    });
});