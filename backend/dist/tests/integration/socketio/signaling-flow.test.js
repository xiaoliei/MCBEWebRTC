import http from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { io as createClient } from 'socket.io-client';
import { createApp } from '../../../src/http/createApp.js';
import { createSocketServer } from '../../../src/signaling/createSocketServer.js';
import { StateStore } from '../../../src/domain/state/StateStore.js';
import { SessionStore } from '../../../src/domain/session/SessionStore.js';
import { ReconnectCodeStore } from '../../../src/domain/session/ReconnectCodeStore.js';
describe('socket.io signaling flow', () => {
    let server;
    let baseUrl;
    const sockets = [];
    beforeEach(async () => {
        const app = createApp({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });
        server = http.createServer(app);
        createSocketServer({
            httpServer: server,
            options: {
                bridgeToken: 'bridge-secret',
                callRadius: 8,
                tickMs: 30,
                gamePlayerTtlMs: 60_000
            },
            stores: {
                stateStore: new StateStore(),
                sessionStore: new SessionStore(),
                reconnectCodeStore: new ReconnectCodeStore()
            }
        });
        await new Promise((resolve) => {
            server.listen(0, '127.0.0.1', () => resolve());
        });
        const address = server.address();
        if (!address || typeof address === 'string') {
            throw new Error('无法获取监听地址');
        }
        baseUrl = `http://127.0.0.1:${address.port}`;
    });
    afterEach(async () => {
        for (const socket of sockets) {
            if (socket.connected) {
                socket.disconnect();
            }
        }
        sockets.length = 0;
        await new Promise((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()));
        });
    });
    it('覆盖 bridge 鉴权、client:join、presence:nearby、webrtc:offer', async () => {
        const badBridge = createClient(baseUrl, {
            auth: { clientType: 'mc-bridge', token: 'wrong-token' },
            transports: ['websocket']
        });
        sockets.push(badBridge);
        const badRejected = await waitForEvent(badBridge, 'auth:rejected');
        expect(badRejected.reason).toBe('UNAUTHORIZED');
        const bridge = createClient(baseUrl, {
            auth: { clientType: 'mc-bridge', token: 'bridge-secret' },
            transports: ['websocket']
        });
        sockets.push(bridge);
        await waitForEvent(bridge, 'auth:accepted');
        const clientA = createClient(baseUrl, { transports: ['websocket'] });
        const clientB = createClient(baseUrl, { transports: ['websocket'] });
        sockets.push(clientA, clientB);
        clientA.emit('client:join', { playerName: 'Alice' });
        clientB.emit('client:join', { playerName: 'Bob' });
        const aConnected = await waitForEvent(clientA, 'connected');
        const bConnected = await waitForEvent(clientB, 'connected');
        bridge.emit('bridge:position:update', {
            playerName: 'Alice',
            playerId: 'pa',
            position: { x: 0, y: 64, z: 0 },
            dim: 0
        });
        bridge.emit('bridge:position:update', {
            playerName: 'Bob',
            playerId: 'pb',
            position: { x: 2, y: 64, z: 1 },
            dim: 0
        });
        const aNearby = await waitForEvent(clientA, 'presence:nearby');
        expect(aNearby.players.map((item) => item.sessionId)).toContain(bConnected.sessionId);
        const offerPayload = { sdp: 'mock-offer' };
        clientA.emit('webrtc:offer', { toSessionId: bConnected.sessionId, data: offerPayload });
        const forwardedOffer = await waitForEvent(clientB, 'webrtc:offer');
        expect(forwardedOffer.fromSessionId).toBe(aConnected.sessionId);
        expect(forwardedOffer.data).toEqual(offerPayload);
    });
});
function waitForEvent(socket, event, timeoutMs = 3000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            socket.off(event, onEvent);
            reject(new Error(`等待事件超时: ${event}`));
        }, timeoutMs);
        const onEvent = (payload) => {
            clearTimeout(timer);
            socket.off(event, onEvent);
            resolve(payload);
        };
        socket.once(event, onEvent);
    });
}
