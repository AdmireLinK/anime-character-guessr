const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { Server } = require('socket.io');
const { io: Client } = require('socket.io-client');
const CryptoJS = require('crypto-js');

const setupSocket = require('../utils/socket');

const AES_SECRET = process.env.AES_SECRET || process.env.VITE_AES_SECRET || 'My-Secret-Key';

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function waitForEvent(socket, eventName, predicate = null, timeout = 8000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            socket.off(eventName, handler);
            reject(new Error(`Timeout waiting for event: ${eventName}`));
        }, timeout);

        const handler = (payload) => {
            if (!predicate || predicate(payload)) {
                clearTimeout(timer);
                socket.off(eventName, handler);
                resolve(payload);
            }
        };

        socket.on(eventName, handler);
    });
}

async function waitUntil(fn, timeout = 8000, interval = 25) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        if (fn()) return;
        await sleep(interval);
    }
    throw new Error('waitUntil timeout');
}

function encryptedCharacter(id) {
    const payload = {
        id,
        name: `char-${id}`,
        nameCn: `角色-${id}`,
        appearanceIds: [1, 2, 3]
    };
    return CryptoJS.AES.encrypt(JSON.stringify(payload), AES_SECRET).toString();
}

test('12-player multi-round multiplayer integration across normal/sync/nonstop modes', { timeout: 90000 }, async () => {
    const rooms = new Map();
    const httpServer = http.createServer();
    const io = new Server(httpServer, {
        cors: {
            origin: '*',
            methods: ['GET', 'POST']
        }
    });
    setupSocket(io, rooms);

    await new Promise(resolve => httpServer.listen(0, '127.0.0.1', resolve));
    const port = httpServer.address().port;
    const roomId = 'integration-room';

    const sockets = [];
    const errors = [];
    const players = [];
    let gameEndedCount = 0;

    const connectPlayer = async (username) => {
        const socket = Client(`http://127.0.0.1:${port}`, {
            transports: ['websocket'],
            reconnection: false,
            forceNew: true
        });

        await waitForEvent(socket, 'connect');
        socket.on('error', (payload) => {
            errors.push({ username, payload });
        });
        socket.on('gameEnded', () => {
            gameEndedCount += 1;
        });
        sockets.push(socket);
        players.push({ username, socket });
        return socket;
    };

    try {
        const host = await connectPlayer('host');
        host.emit('createRoom', { roomId, username: 'host' });

        for (let i = 1; i <= 11; i += 1) {
            const username = `p${i}`;
            const socket = await connectPlayer(username);
            socket.emit('joinRoom', { roomId, username });
        }

        await waitUntil(() => {
            const room = rooms.get(roomId);
            return !!room && room.players.length === 12;
        });

        const getSocketByName = (name) => players.find(p => p.username === name)?.socket;
        const getPlayerStateByName = (name) => (rooms.get(roomId)?.players || []).find(p => p.username === name);

        const ensureAllReady = async () => {
            const room = rooms.get(roomId);
            assert.ok(room, 'room should exist when checking readiness');
            for (const p of room.players) {
                if (p.username === 'host') continue;
                if (p.disconnected) continue;
                if (!p.ready) {
                    getSocketByName(p.username).emit('toggleReady', { roomId });
                    await sleep(30);
                }
            }
            await waitUntil(() => {
                const latestRoom = rooms.get(roomId);
                if (!latestRoom) return false;
                return latestRoom.players
                    .filter(p => !p.isHost && !p.disconnected)
                    .every(p => p.ready);
            });
        };

        // 设置一个观战者用于覆盖旁观逻辑
        getSocketByName('p11').emit('updatePlayerTeam', { roomId, team: '0' });
        await sleep(120);

        const startRound = async (settings, answerId) => {
            await ensureAllReady();
            host.emit('updateGameSettings', { roomId, settings });
            const startWait = waitForEvent(host, 'gameStart');
            host.emit('gameStart', {
                roomId,
                settings,
                character: encryptedCharacter(answerId)
            });
            await startWait;
            await sleep(150);
        };

        const roundBaseSettings = {
            maxAttempts: 2,
            syncMode: false,
            nonstopMode: false,
            globalPick: false,
            tagBan: false
        };

        // Round 1: 普通模式（正确/错误/超时/同作品）
        await startRound(roundBaseSettings, 101);
        getSocketByName('p1').emit('playerGuess', {
            roomId,
            guessResult: { isPartialCorrect: true, guessData: { id: 999, name: 'wrong-partial' } }
        });
        getSocketByName('p2').emit('playerGuess', {
            roomId,
            guessResult: { isPartialCorrect: false, guessData: { id: 998, name: 'wrong' } }
        });
        getSocketByName('p3').emit('timeOut', { roomId });
        const end1Baseline = gameEndedCount;
        getSocketByName('p4').emit('playerGuess', {
            roomId,
            guessResult: { isPartialCorrect: false, guessData: { id: 101, name: 'correct' } }
        });
        getSocketByName('p4').emit('gameEnd', { roomId, result: 'win' });

        await waitUntil(() => gameEndedCount >= end1Baseline + 1, 12000);

        // Round 2: 同步模式（多人完成后结算）
        await startRound({ ...roundBaseSettings, syncMode: true }, 202);
        getSocketByName('p1').emit('playerGuess', {
            roomId,
            guessResult: { isPartialCorrect: true, guessData: { id: 997, name: 'sync-partial' } }
        });
        getSocketByName('p2').emit('timeOut', { roomId });
        getSocketByName('p3').emit('playerGuess', {
            roomId,
            guessResult: { isPartialCorrect: false, guessData: { id: 202, name: 'sync-correct' } }
        });
        const end2Baseline = gameEndedCount;
        getSocketByName('p3').emit('gameEnd', { roomId, result: 'win' });

        for (const p of ['host', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10']) {
            const s = getSocketByName(p);
            if (s) s.emit('timeOut', { roomId });
            await sleep(20);
        }

        await waitUntil(() => gameEndedCount >= end2Baseline + 1, 15000);

        // Round 3: 血战模式（赢家 + 其余主动观战结束）
        await startRound({ ...roundBaseSettings, nonstopMode: true, syncMode: false }, 303);
        getSocketByName('p1').emit('playerGuess', {
            roomId,
            guessResult: { isPartialCorrect: true, guessData: { id: 996, name: 'nonstop-partial' } }
        });
        getSocketByName('p2').emit('timeOut', { roomId });
        getSocketByName('p3').emit('playerGuess', {
            roomId,
            guessResult: { isPartialCorrect: false, guessData: { id: 303, name: 'nonstop-correct' } }
        });
        getSocketByName('p3').emit('nonstopWin', { roomId, isBigWin: false });
        const end3Baseline = gameEndedCount;

        for (const p of ['host', 'p1', 'p2', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10']) {
            const s = getSocketByName(p);
            if (s) s.emit('enterObserverMode', { roomId });
            await sleep(20);
        }

        await waitUntil(() => gameEndedCount >= end3Baseline + 1, 15000);

        const room = rooms.get(roomId);
        assert.ok(room, 'room should still exist after integration rounds');
        assert.equal(errors.length, 0, `unexpected socket errors: ${JSON.stringify(errors)}`);
        assert.ok(gameEndedCount >= 3, `expected at least 3 gameEnded events, got ${gameEndedCount}`);
        assert.ok(room.players.some(p => (p.score || 0) !== 0), 'at least one player should gain/lose score after multiple rounds');
        assert.equal(getPlayerStateByName('p11')?.team, '0', 'observer team should remain observer');
    } finally {
        for (const socket of sockets) {
            try {
                socket.disconnect();
            } catch (_e) {
                // ignore
            }
        }
        await new Promise(resolve => io.close(resolve));
        await new Promise(resolve => httpServer.close(resolve));
    }
});