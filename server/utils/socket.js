const {
    handlePlayerTimeout,
    countAttemptMarks,
    hasEndMark,
    stripEndMarks,
    enforceAttemptLimit,
    getSyncAndNonstopState,
    calculateWinnerScore,
    applySetterObservers,
    revertSetterObservers,
    markTeamVictory,
    updateSyncProgress,
    runStandardFlow
} = require('./gameplay');
const { createLogger } = require('./logger');

/**
 * Socket.io 连接处理与房间管理入口
 * @param {Object} io - Socket.io 实例
 * @param {Map} rooms - 房间存储映射
 */
function setupSocket(io, rooms) {
    io.on('connection', (socket) => {
        const log = createLogger('socket', socket.id);

        const isSocketStillInRoom = (socketId, roomId) => {
            if (!socketId || !roomId) return false;
            const targetSocket = io.sockets.sockets.get(socketId);
            if (!targetSocket) return false;
            const roomSet = io.sockets.adapter.rooms.get(roomId);
            return !!roomSet && roomSet.has(socketId);
        };

        const emitError = (code, message) => {
            log.warn(`${code}: ${message}`);
            socket.emit('error', { message: `${code}: ${message}` });
        };

        /**
         * 获取房间对象，不存在时发送错误消息
         * @param {string} roomId - 房间 ID
         * @param {string} code - 错误代码标签
         * @returns {Object|null} - 房间对象或 null
         */
        const getRoom = (roomId, code) => {
            const room = rooms.get(roomId);
            if (!room) {
                emitError(code, '房间不存在');
                return null;
            }
            return room;
        };

        const PLAYER_BROADCAST_COOLDOWN = 120; // ms，合并短时间内的玩家列表广播
        const broadcastPlayers = (roomId, room, extra = {}) => {
            if (!room) return;
            const now = Date.now();
            const forceImmediate = !!extra.forceImmediate;
            const sanitizedExtra = { ...extra };
            delete sanitizedExtra.forceImmediate;

            const buildPayload = (extraPayload = {}) => ({
                players: room.players,
                isPublic: room.isPublic,
                answerSetterId: room.answerSetterId,
                ...extraPayload
            });

            const emitPayload = (payload) => {
                room._lastPlayersBroadcastAt = Date.now();
                room._pendingPlayerBroadcastExtra = null;
                if (room._playerBroadcastTimer) {
                    clearTimeout(room._playerBroadcastTimer);
                    room._playerBroadcastTimer = null;
                }
                io.to(roomId).emit('updatePlayers', payload);
            };

            const mergedExtra = { ...(room._pendingPlayerBroadcastExtra || {}), ...sanitizedExtra };
            const lastAt = room._lastPlayersBroadcastAt || 0;
            const elapsed = now - lastAt;

            if (forceImmediate || elapsed >= PLAYER_BROADCAST_COOLDOWN) {
                emitPayload(buildPayload(mergedExtra));
                return;
            }

            room._pendingPlayerBroadcastExtra = mergedExtra;
            if (!room._playerBroadcastTimer) {
                const delay = Math.max(10, PLAYER_BROADCAST_COOLDOWN - elapsed);
                room._playerBroadcastTimer = setTimeout(() => {
                    room._playerBroadcastTimer = null;
                    const pendingExtra = room._pendingPlayerBroadcastExtra || {};
                    room._pendingPlayerBroadcastExtra = null;
                    emitPayload(buildPayload(pendingExtra));
                }, delay);
            }
        };

        /**
         * 广播房间的同步/血战状态
         * @param {string} roomId - 房间 ID
         * @param {Object} room - 房间对象
         */
        const broadcastState = (roomId, room) => {
            getSyncAndNonstopState(room, (eventName, data) => io.to(roomId).emit(eventName, data));
        };

/**
 * 发送当前对局快照（用于重连/旁观加入）。
 * 会将 gameStart、猜测历史、tagBan 状态按需推送给目标 socket，避免重复广播全房间。
 * @param {Object} options - 快照选项
 * @param {string} options.roomId - 房间 ID
 * @param {Object} options.room - 房间对象
 * @param {Object} options.targetSocket - 目标 socket 对象
 * @param {Object} options.playerContext - 玩家上下文（包含 isAnswerSetter 等）
 * @param {boolean} options.broadcastState - 是否广播状态给全房间
 */
        const emitGameSnapshot = ({ roomId, room, targetSocket, playerContext, broadcastState: shouldBroadcastState = false }) => {
            if (!room?.currentGame || !room.currentGame.character || !targetSocket) return;
            const isAnswerSetter = playerContext ? !!playerContext.isAnswerSetter : false;
            targetSocket.emit('updatePlayers', {
                players: room.players,
                isPublic: room.isPublic,
                answerSetterId: room.answerSetterId
            });
            targetSocket.emit('gameStart', {
                character: room.currentGame.character,
                settings: room.currentGame?.settings,
                players: room.players,
                isPublic: room.isPublic,
                hints: room.currentGame?.hints || null,
                isAnswerSetter
            });
            if (room.currentGame) {
                targetSocket.emit('guessHistoryUpdate', buildGuessHistoryPayload(room.currentGame));
            }
            targetSocket.emit('tagBanStateUpdate', {
                tagBanState: Array.isArray(room.currentGame.tagBanState) ? room.currentGame.tagBanState : []
            });
            if (shouldBroadcastState) broadcastState(roomId, room);
        };

        const buildGuessHistoryPayload = (currentGame) => ({
            guesses: Array.isArray(currentGame?.guesses) ? currentGame.guesses : [],
            teamGuesses: currentGame?.teamGuesses || {}
        });

        /**
         * 统一的标准流程入口，自动在未结算时补充玩家广播。
         * @param {string} roomId - 房间 ID
         * @param {Object} room - 房间对象
         * @param {Object} options - 流程选项（broadcastState、broadcastPlayers 等）
         * @returns {boolean} - 是否已完成结算
         */
        const runFlowAndRefresh = (roomId, room, options = {}) => {
            const { finalized } = runStandardFlow(room, roomId, io, options);
            if (!finalized && options.broadcastPlayers !== false) {
                broadcastPlayers(roomId, room);
            }
            return finalized;
        };

        log.info('connected');

        /**
         * 创建房间事件处理
         * @event createRoom
         * @param {string} roomId - 新房间 ID
         * @param {string} username - 创建者用户名
         * @param {number} [avatarId] - 头像 ID
         * @param {string} [avatarImage] - 头像图片 URL
         */
        socket.on('createRoom', ({ roomId, username, avatarId, avatarImage }) => {
            if (!username || !username.trim()) return emitError('createRoom', '用户名呢');
            if (rooms.has(roomId)) return emitError('createRoom', '房间已存在');
            if (rooms.size >= 259) return emitError('createRoom', '服务器已满，请稍后再试');

            rooms.set(roomId, {
                host: socket.id,
                isPublic: true,
                players: [{
                    id: socket.id,
                    username,
                    isHost: true,
                    score: 0,
                    ready: false,
                    guesses: '',
                    message: '',
                    team: null,
                    disconnected: false,
                    ...(avatarId !== undefined && { avatarId }),
                    ...(avatarImage !== undefined && { avatarImage })
                }],
                roomName: '',
                lastActive: Date.now()
            });

            socket.join(roomId);
            broadcastPlayers(roomId, rooms.get(roomId));
            socket.emit('roomNameUpdated', { roomName: rooms.get(roomId).roomName || '' });
            log.info(`room ${roomId} created by ${username}`);
        });

        /**
         * 加入房间事件处理
         * 若房间不存在则创建；若正在游戏中作为旁观者加入；若重连则恢复状态
         * @event joinRoom
         * @param {string} roomId - 房间 ID
         * @param {string} username - 玩家用户名
         * @param {number} [avatarId] - 头像 ID
         * @param {string} [avatarImage] - 头像图片 URL
         */
        socket.on('joinRoom', ({ roomId, username, avatarId, avatarImage }) => {
            if (!username || !username.trim()) return emitError('joinRoom', '用户名呢');
            let room = rooms.get(roomId);

            if (!room) {
                rooms.set(roomId, {
                    host: socket.id,
                    isPublic: true,
                    players: [{
                        id: socket.id,
                        username,
                        isHost: true,
                        score: 0,
                        ready: false,
                        guesses: '',
                        message: '',
                        team: null,
                        disconnected: false,
                        ...(avatarId !== undefined && { avatarId }),
                        ...(avatarImage !== undefined && { avatarImage })
                    }],
                    roomName: '',
                    lastActive: Date.now()
                });
                socket.join(roomId);
                broadcastPlayers(roomId, rooms.get(roomId));
                socket.emit('roomNameUpdated', { roomName: rooms.get(roomId).roomName || '' });
                log.info(`room ${roomId} created by ${username}`);
                return;
            }

            // if game in progress new player observer
            if (room.currentGame) {
                log.info(`[join observer] room ${roomId} in progress`);
            }

            const existingPlayerIndex = room.players.findIndex(p => p.username.toLowerCase() === username.toLowerCase());
            if (existingPlayerIndex !== -1) {
                const existingPlayer = room.players[existingPlayerIndex];
                if (existingPlayer.disconnected) {
                    const normalizeAvatarId = (id) => (id === undefined || id === null) ? '' : String(id);
                    const prevAvatarId = normalizeAvatarId(existingPlayer.avatarId);
                    const incomingAvatarId = normalizeAvatarId(avatarId);
                    if (prevAvatarId !== incomingAvatarId) {
                        log.warn(`avatar mismatch for ${username} during reconnect: expected ${prevAvatarId || '<empty>'} got ${incomingAvatarId || '<empty>'}`);
                        return emitError('joinRoom', '头像信息不一致，无法重连');
                    }
                    const previousSocketId = existingPlayer.id;
                    existingPlayer.id = socket.id;
                    existingPlayer.disconnected = false;
                    if (avatarId !== undefined) existingPlayer.avatarId = avatarId;
                    if (avatarImage !== undefined) existingPlayer.avatarImage = avatarImage;

                    // update revealer ids
                    const replaceRevealerId = (list) => {
                        if (!Array.isArray(list) || !previousSocketId) return;
                        list.forEach(entry => {
                            if (!entry || !Array.isArray(entry.revealer)) return;
                            entry.revealer = Array.from(new Set(entry.revealer.map(id => id === previousSocketId ? socket.id : id)));
                        });
                    };
                    if (room.currentGame) {
                        replaceRevealerId(room.currentGame.tagBanState);
                        replaceRevealerId(room.currentGame.tagBanStatePending);
                    }

                    socket.join(roomId);
                    broadcastPlayers(roomId, room, { forceImmediate: true });
                    socket.emit('roomNameUpdated', { roomName: room.roomName || '' });

                    if (room.currentGame && room.currentGame.character) {
                        emitGameSnapshot({ roomId, room, targetSocket: socket, playerContext: existingPlayer, broadcastState: true });
                    }
                    log.info(`${username} reconnected to room ${roomId}`);
                    return;
                }
                const staleSocket = !isSocketStillInRoom(existingPlayer.id, roomId);
                if (staleSocket) {
                    log.warn(`stale socket detected for ${username}; forcing reconnect bind`);
                    existingPlayer.disconnected = true;
                    const previousSocketId = existingPlayer.id;
                    existingPlayer.id = socket.id;
                    existingPlayer.disconnected = false;
                    if (avatarId !== undefined) existingPlayer.avatarId = avatarId;
                    if (avatarImage !== undefined) existingPlayer.avatarImage = avatarImage;

                    const replaceRevealerId = (list) => {
                        if (!Array.isArray(list) || !previousSocketId) return;
                        list.forEach(entry => {
                            if (!entry || !Array.isArray(entry.revealer)) return;
                            entry.revealer = Array.from(new Set(entry.revealer.map(id => id === previousSocketId ? socket.id : id)));
                        });
                    };
                    if (room.currentGame) {
                        replaceRevealerId(room.currentGame.tagBanState);
                        replaceRevealerId(room.currentGame.tagBanStatePending);
                    }

                    socket.join(roomId);
                    broadcastPlayers(roomId, room, { forceImmediate: true });
                    socket.emit('roomNameUpdated', { roomName: room.roomName || '' });
                    if (room.currentGame && room.currentGame.character) {
                        emitGameSnapshot({ roomId, room, targetSocket: socket, playerContext: existingPlayer, broadcastState: true });
                    }
                    log.info(`${username} rebound to room ${roomId} from stale socket`);
                    return;
                }
                return emitError('joinRoom', '换个名字吧');
            }

            if (avatarId !== undefined) {
                const isAvatarTaken = room.players.some(player => !player.disconnected && player.avatarId !== undefined && String(player.avatarId) !== '0' && String(player.avatarId) === String(avatarId));
                if (isAvatarTaken) {
                    return emitError('joinRoom', '头像已被选用');
                }
            }

            room.players.push({
                id: socket.id,
                username,
                isHost: false,
                score: 0,
                ready: false,
                guesses: '',
                message: '',
                team: room.currentGame ? '0' : null,
                joinedDuringGame: !!room.currentGame,
                disconnected: false,
                ...(avatarId !== undefined && { avatarId }),
                ...(avatarImage !== undefined && { avatarImage })
            });

            socket.join(roomId);
            broadcastPlayers(roomId, room);
            socket.emit('roomNameUpdated', { roomName: room.roomName || '' });

            if (room.currentGame && room.currentGame.character) {
                emitGameSnapshot({ roomId, room, targetSocket: socket, playerContext: { isAnswerSetter: false }, broadcastState: true });
            }

            log.info(`${username} joined room ${roomId}`);
        });

        /**
         * 准备就绪状态切换事件
         * @event toggleReady
         * @param {string} roomId - 房间 ID
         */
        socket.on('toggleReady', ({ roomId }) => {
            const room = getRoom(roomId, 'toggleReady');
            if (!room) return;
            const player = room.players.find(p => p.id === socket.id);
            if (!player) return emitError('toggleReady', '连接中断了');
            if (player.isHost) return emitError('toggleReady', '房主不需要准备');
            if (room.currentGame) return emitError('toggleReady', '游戏进行中不能更改准备状态');
            player.ready = !player.ready;
            broadcastPlayers(roomId, room, { answerSetterId: room.answerSetterId });
            log.info(`player ${player.username} ready=${player.ready}`);
        });

        /**
         * 更新游戏设置事件（仅房主可用）
         * @event updateGameSettings
         * @param {string} roomId - 房间 ID
         * @param {Object} settings - 游戏设置对象
         */
        socket.on('updateGameSettings', ({ roomId, settings }) => {
            const room = getRoom(roomId, 'updateGameSettings');
            if (!room) return;
            const player = room.players.find(p => p.id === socket.id);
            if (!player || !player.isHost) return emitError('updateGameSettings', '只有房主可以更改设置');
            room.settings = settings;
            io.to(roomId).emit('updateGameSettings', { settings });
            room.lastActive = Date.now();
            log.info(`settings updated in ${roomId}`);
        });

        /**
         * 游戏状态初始化（内部 helper）
         * @param {Object} room - 房间对象
         * @param {Object} character - 对局角色对象
         * @param {Object} settings - 游戏设置
         * @param {Array} hints - 提示列表
         * @param {string} answerSetterId - 出题人的 socket ID
         */
        const initGameState = (room, character, settings, hints, answerSetterId) => {
            // 计算初始的活跃玩家数（用于血战模式基础分计算）：仅统计“能猜测”的玩家
            // - 排除出题人
            // - 排除旁观者队伍（team==='0'）
            // - 排除临时旁观（_tempObserver）
            // - 排除断线玩家
            const initialActivePlayers = room.players.filter(p => {
                if (!p || p.disconnected) return false;
                if (p.team === '0') return false;
                if (p._tempObserver) return false;
                if (answerSetterId && p.id === answerSetterId) return false;
                return true;
            }).length;
            
            room.currentGame = {
                character,
                settings,
                guesses: [],
                teamGuesses: {},
                hints: hints || null,
                syncRound: 1,
                syncPlayersCompleted: new Set(),
                syncWinnerFound: false,
                syncWinner: null,
                syncReadyToEnd: false,
                syncRoundStartRank: 1,
                nonstopWinners: [],
                firstWinner: null,
                tagBanState: [],
                tagBanStatePending: [],
                nonstopTotalPlayers: initialActivePlayers,  // 记录初始玩家数，用于基础分计算
                _lastSyncWaitingKey: null,
                _lastSyncWaitingAt: 0
            };

            room.players.forEach(p => {
                p.guesses = '';
                // 清理上一局的临时观战/同步完成标记，避免新一局直接处于观战或死亡视角
                if (p._tempObserver) delete p._tempObserver;
                if (typeof p.syncCompletedRound === 'number') delete p.syncCompletedRound;
                p.isAnswerSetter = (p.id === answerSetterId);
                if (!p.isAnswerSetter && p.team !== '0') {
                    room.currentGame.guesses.push({ username: p.username, guesses: [] });
                }
            });
            room.players.forEach(p => {
                if (p.team && p.team !== '0' && !(p.team in room.currentGame.teamGuesses)) {
                    room.currentGame.teamGuesses[p.team] = '';
                }
            });
        };

        /**
         * 开始游戏事件处理
         * @event gameStart
         * @param {string} roomId - 房间 ID
         * @param {Object} character - 对局角色对象
         * @param {Object} settings - 游戏设置
         */
        socket.on('gameStart', ({ roomId, character, settings }) => {
            const room = getRoom(roomId, 'gameStart');
            if (!room) return;
            if (room.currentGame) return emitError('gameStart', '游戏已经在进行中');
            const allReady = room.players.every(p => p.isHost || p.ready || p.disconnected);
            if (!allReady) return emitError('gameStart', '所有玩家必须准备好才能开始游戏');
            room.players = room.players.filter(p => !p.disconnected || p.score > 0);
            initGameState(room, character, settings, null, null);
            io.to(roomId).emit('gameStart', { character, settings, players: room.players, isPublic: room.isPublic, isGameStarted: true });
            io.to(roomId).emit('tagBanStateUpdate', { tagBanState: [] });
            // 游戏开始时发送初始进度（同步模式和血战模式）
            getSyncAndNonstopState(room, (eventName, data) => {
                io.to(roomId).emit(eventName, data);
            });
            room.lastActive = Date.now();
            log.info(`game started in ${roomId}`);
        });

        /**
         * 玩家猜测事件处理
         * 处理单个猜测、队伍得分、同步进度、自动淘汰等逻辑
         * @event playerGuess
         * @param {string} roomId - 房间 ID
         * @param {Object} guessResult - 猜测结果对象 { guessData, isCorrect, isPartialCorrect }
         */
        socket.on('playerGuess', ({ roomId, guessResult }) => {
            const room = getRoom(roomId, 'playerGuess');
            if (!room) return;
            room.lastActive = Date.now();
            const player = room.players.find(p => p.id === socket.id);
            if (!player) return emitError('playerGuess', '连接中断了');
            if (!room.currentGame) return emitError('playerGuess', '游戏未开始或已结束');

            const hasEnded = ['✌','👑','💀','🏳️','🏆'].some(mark => player.guesses.includes(mark));
            // 检查是否为旁观者：team='0' 或被标记为临时观战者
            if (player.team === '0' || player._tempObserver) return emitError('playerGuess', '观战中不能猜测');
            if (hasEnded) return;

            const guessData = guessResult?.guessData;
            if (!guessData || guessData.id === undefined || guessData.id === null) {
                return emitError('playerGuess', '猜测数据无效');
            }
            const isCorrect = !!guessResult?.isCorrect;
            const isPartialCorrect = !isCorrect && !!guessResult?.isPartialCorrect;

            const settings = room.currentGame.settings || {};

            // 统一在写入猜测前检查次数上限（个人/团队/同步模式均适用）
            const preLimit = enforceAttemptLimit(room, player, io, roomId, { isCorrect: false });
            if (preLimit.exhausted) {
                socket.emit('updatePlayers', {
                    players: room.players,
                    isPublic: room.isPublic,
                    answerSetterId: room.answerSetterId
                });
                io.to(roomId).emit('guessHistoryUpdate', {
                    guesses: room.currentGame?.guesses,
                    teamGuesses: room.currentGame?.teamGuesses
                });
                broadcastPlayers(roomId, room);
                runFlowAndRefresh(roomId, room);
                return emitError('playerGuess', '已用尽可用次数');
            }

            if (settings.globalPick && !settings.syncMode && guessData) {
                const characterId = guessData.id;
                const already = room.currentGame.guesses.some(pg => pg.username !== player.username && Array.isArray(pg.guesses) && pg.guesses.some(g => g?.guessData?.id === characterId));
                if (already && (!settings.nonstopMode || !isCorrect)) {
                    return emitError('playerGuess', '【全局BP】该角色已经被其他玩家猜过了');
                }
            }

            const playerGuesses = room.currentGame.guesses.find(g => g.username === player.username);
            if (playerGuesses) {
                const entry = { playerId: socket.id, playerName: player.username, isCorrect, isPartialCorrect, guessData };
                playerGuesses.guesses.push(entry);
                room.players.forEach(target => {
                    if (target.id === socket.id || target.isAnswerSetter || target.team === '0' || target.team === player.team || target._tempObserver) {
                        io.to(target.id).emit('guessHistoryUpdate', { guesses: room.currentGame?.guesses, teamGuesses: room.currentGame?.teamGuesses });
                    }
                });
            }

            if (guessData) {
                const serialized = { ...guessData };
                if (serialized.rawTags instanceof Map) serialized.rawTags = Array.from(serialized.rawTags.entries());
                room.players.filter(p => p.id !== socket.id && ((p.team !== null && p.team === player.team && !p.isAnswerSetter) || p.team === '0' || p.isAnswerSetter)).forEach(recipient => {
                    io.to(recipient.id).emit('boardcastTeamGuess', { guessData: { ...serialized, guessrName: player.username }, playerId: socket.id, playerName: player.username });
                });
            }

            const mark = (!isCorrect && isPartialCorrect) ? '💡' : (isCorrect ? '✔' : '❌');
            if (player.team && player.team !== '0') {
                if (room.currentGame && !room.currentGame.teamGuesses) room.currentGame.teamGuesses = {};
                if (room.currentGame?.teamGuesses) {
                    room.currentGame.teamGuesses[player.team] = (room.currentGame.teamGuesses[player.team] || '') + mark;
                    room.players.filter(p => p.team === player.team && !p.isAnswerSetter && !p.disconnected).forEach(teammate => {
                        teammate.guesses = room.currentGame.teamGuesses[player.team];
                    });
                }
            } else {
                player.guesses += mark;
            }

            if (room.currentGame?.settings?.syncMode && room.currentGame?.syncPlayersCompleted) {
                if (!isCorrect) {
                    room.currentGame.syncPlayersCompleted.add(socket.id);
                    if (player.team && player.team !== '0') {
                        room.players.filter(p => p.team === player.team && p.id !== socket.id && !p.isAnswerSetter && !p.disconnected)
                            .forEach(teammate => room.currentGame.syncPlayersCompleted.add(teammate.id));
                    }
                }
                updateSyncProgress(room, roomId, io);
            }

            // 统一在写入本次尝试后检查“耗尽 => 死亡(💀)”
            // 若本次猜中，enforceAttemptLimit 会返回 pendingWin 并避免误判
            if (!room.currentGame?.settings?.nonstopMode) {
                enforceAttemptLimit(room, player, io, roomId, { isCorrect: !!isCorrect });
            }

            broadcastPlayers(roomId, room);
            if (guessData && guessData.name) {
                log.info(`guess ${guessData.name} ${isCorrect ? 'correct' : 'incorrect'}`);
            }

            // 标准流程统一判定
            runFlowAndRefresh(roomId, room);
        });

        /**
         * 标签禁用共享事件处理（tagBan 模式）
         * @event tagBanSharedMetaTags
         * @param {string} roomId - 房间 ID
         * @param {Array<string>} tags - 禁用标签列表
         */
        socket.on('tagBanSharedMetaTags', ({ roomId, tags }) => {
            const room = getRoom(roomId, 'tagBanSharedMetaTags');
            if (!room || !room.currentGame || !room.currentGame.settings?.tagBan) return;
            const player = room.players.find(p => p.id === socket.id);
            if (!player) return;
            if (!Array.isArray(tags) || !tags.length) return;

            room.currentGame.tagBanState = Array.isArray(room.currentGame.tagBanState) ? room.currentGame.tagBanState : [];
            room.currentGame.tagBanStatePending = Array.isArray(room.currentGame.tagBanStatePending) ? room.currentGame.tagBanStatePending : [];
            const targetList = room.currentGame?.settings?.syncMode ? room.currentGame.tagBanStatePending : room.currentGame.tagBanState;
            let changed = false;
            tags.forEach(tagName => {
                if (room.currentGame.tagBanState.find(entry => entry && entry.tag === tagName)) return;
                let entry = targetList.find(item => item && item.tag === tagName);
                if (!entry) {
                    entry = { tag: tagName, revealer: [] };
                    targetList.push(entry);
                    changed = true;
                }
                const existing = Array.isArray(entry.revealer) ? entry.revealer : [];
                if (!existing.length) {
                    entry.revealer = [player.id];
                    changed = true;
                } else if (room.currentGame?.settings?.syncMode && !existing.includes(player.id)) {
                    entry.revealer = [...existing, player.id];
                }
            });
            if (!changed || room.currentGame?.settings?.syncMode) return;
            io.to(roomId).emit('tagBanStateUpdate', { tagBanState: Array.isArray(room.currentGame.tagBanState) ? room.currentGame.tagBanState : [] });
        });

        /**
         * 血战模式胜利事件处理
         * @event nonstopWin
         * @param {string} roomId - 房间 ID
         * @param {boolean} isBigWin - 是否为大赢家（一猜即中）
         */
        socket.on('nonstopWin', ({ roomId, isBigWin }) => {
            const room = getRoom(roomId, 'nonstopWin');
            if (!room || !room.currentGame) return emitError('nonstopWin', '房间不存在或游戏未开始');
            room.lastActive = Date.now();
            const player = room.players.find(p => p.id === socket.id);
            if (!player) return emitError('nonstopWin', '连接中断了');

            room.currentGame.nonstopWinners = room.currentGame.nonstopWinners || [];
            if (room.currentGame.nonstopWinners.some(w => w.id === socket.id)) return;
            // 检查是否为旁观者或临时观战者
            if (player._tempObserver) return emitError('nonstopWin', '旁观者无法猜测');
            if (player.team && player.team !== '0') {
                const teammateWon = room.currentGame.nonstopWinners.some(w => {
                    const wPlayer = room.players.find(p => p.id === w.id);
                    return wPlayer && wPlayer.team === player.team;
                });
                if (teammateWon) return emitError('nonstopWin', '你的队友已经猜对了，你无法继续猜测');
            }

            const rawGuessCount = countAttemptMarks(player.guesses);
            if (!isBigWin && rawGuessCount === 1) isBigWin = true;
            player.guesses += isBigWin ? '👑' : '✌';
            room.currentGame.syncPlayersCompleted?.delete(socket.id);
            if (player.team && player.team !== '0') {
                markTeamVictory(room, roomId, player, io);
            }
            if (room.currentGame?.settings?.syncMode && room.currentGame.syncPlayersCompleted) {
                room.currentGame.syncPlayersCompleted.add(socket.id);
                if (player.team && player.team !== '0') {
                    room.players.filter(p => p.team === player.team && p.id !== socket.id && !p.isAnswerSetter && !p.disconnected)
                        .forEach(teammate => room.currentGame.syncPlayersCompleted.add(teammate.id));
                }
                updateSyncProgress(room, roomId, io);
            }

            const initialTotalPlayers = room.currentGame?.nonstopTotalPlayers || 1;
            const winnersCount = room.currentGame?.nonstopWinners?.length || 0;
            const winnerRank = winnersCount + 1;
            const rankScore = Math.max(1, initialTotalPlayers - winnersCount);
            const totalRounds = room.currentGame?.settings?.maxAttempts || 10;
            const scoreResult = calculateWinnerScore({ guesses: player.guesses, baseScore: rankScore, totalRounds });
            const score = scoreResult.totalScore;
            player.score += score;
            room.currentGame.nonstopWinners.push({ id: socket.id, username: player.username, isBigWin, team: player.team, score, bonuses: scoreResult.bonuses });

            broadcastState(roomId, room);
            broadcastPlayers(roomId, room);
            log.info(`[nonstop] ${player.username} rank=${winnerRank} score=${score}`);

            runStandardFlow(room, roomId, io);
        });

        /**
         * 游戏结束事件处理
         * 处理投降、胜利、失败、本命胜利等情况
         * @event gameEnd
         * @param {string} roomId - 房间 ID
         * @param {string} result - 结果状态（'surrender'|'win'|'bigwin'|'lose'）
         */
        socket.on('gameEnd', ({ roomId, result }) => {
            const room = getRoom(roomId, 'gameEnd');
            if (!room) return;
            room.lastActive = Date.now();
            const player = room.players.find(p => p.id === socket.id);
            if (!player) return emitError('gameEnd', '连接中断了');
            if (!room.currentGame) return emitError('gameEnd', '游戏未开始或已结束');

            const rawGuessCount = countAttemptMarks(player.guesses);
            const finalResult = (result === 'win' && rawGuessCount === 1 && !player.guesses.includes('👑')) ? 'bigwin' : result;

            // gameEnd 结果是最终裁决：先清理冲突的结束标记，避免出现“💀 + ✌”这类状态
            player.guesses = stripEndMarks(player.guesses);
            if (player.team && player.team !== '0' && room.currentGame) {
                room.currentGame.teamGuesses = room.currentGame.teamGuesses || {};
                room.currentGame.teamGuesses[player.team] = stripEndMarks(room.currentGame.teamGuesses[player.team] || '');
            }

            switch (finalResult) {
                case 'surrender':
                    player.guesses += '🏳️';
                    if (room.currentGame && player.team && player.team !== '0') {
                        if (!room.currentGame.teamGuesses) room.currentGame.teamGuesses = {};
                        room.currentGame.teamGuesses[player.team] = (room.currentGame.teamGuesses[player.team] || '') + '🏳️';
                    }
                    break;
                case 'win':
                    player.guesses += '✌';
                    if (room.currentGame && !room.currentGame.firstWinner) {
                        room.currentGame.firstWinner = { id: socket.id, username: player.username, isBigWin: false, timestamp: Date.now() };
                    }
                    if (!room.currentGame?.settings?.nonstopMode && player.team && player.team !== '0') {
                        markTeamVictory(room, roomId, player, io);
                    }
                    break;
                case 'bigwin':
                    player.guesses += '👑';
                    if (room.currentGame && (!room.currentGame.firstWinner || !room.currentGame.firstWinner.isBigWin)) {
                        room.currentGame.firstWinner = { id: socket.id, username: player.username, isBigWin: true, timestamp: Date.now() };
                    }
                    if (!room.currentGame?.settings?.nonstopMode && player.team && player.team !== '0') {
                        markTeamVictory(room, roomId, player, io);
                    }
                    break;
                default:
                    player.guesses += '💀';
                    if (player.team && player.team !== '0' && room.currentGame) {
                        if (!room.currentGame.teamGuesses) room.currentGame.teamGuesses = {};
                        room.currentGame.teamGuesses[player.team] = (room.currentGame.teamGuesses[player.team] || '') + '💀';
                        room.players.filter(p => p.team === player.team && !p.isAnswerSetter && !p.disconnected)
                            .forEach(teammate => { teammate.guesses = room.currentGame.teamGuesses[player.team]; });
                    }
            }

            if (room.currentGame?.settings?.syncMode) {
                if (!room.currentGame?.settings?.nonstopMode && (finalResult === 'win' || finalResult === 'bigwin')) {
                    room.currentGame.syncWinnerFound = true;
                    room.currentGame.syncWinner = { id: socket.id, username: player.username, isBigWin: finalResult === 'bigwin' };
                }
                if (room.currentGame.syncPlayersCompleted) {
                    room.currentGame.syncPlayersCompleted.add(socket.id);
                    if (room.currentGame?.settings?.nonstopMode && player.team && player.team !== '0') {
                        room.players.filter(p => p.team === player.team && p.id !== player.id && !p.isAnswerSetter && !p.disconnected)
                            .forEach(teammate => room.currentGame.syncPlayersCompleted.add(teammate.id));
                    }
                    broadcastPlayers(roomId, room);
                    updateSyncProgress(room, roomId, io);
                }
            }

            runFlowAndRefresh(roomId, room);
            log.info(`gameEnd ${player.username} result=${result}`);
        });

        /**
         * 进入旁观模式事件处理
         * @event enterObserverMode
         * @param {string} roomId - 房间 ID
         */
        socket.on('enterObserverMode', ({ roomId }) => {
            const room = getRoom(roomId, 'enterObserverMode');
            if (!room) return;
            room.lastActive = Date.now();
            const player = room.players.find(p => p.id === socket.id);
            if (!player) return emitError('enterObserverMode', '连接中断了');

            // 仅允许在游戏进行中进入观战；避免跨局/延迟事件污染当前局状态
            if (!room.currentGame) return emitError('enterObserverMode', '游戏未开始或已结束');

            const hasEndedMark = ['✌','👑','💀','🏳️','🏆'].some(m => player.guesses.includes(m));

            // 若已耗尽尝试次数，则应判定为死亡（💀），而不是投降（🏳️）。
            // 这可以覆盖“最后一次猜测为同作品(💡)导致 left==0 后误触发 enterObserverMode”一类边界情况。
            const maxAttempts = room.currentGame?.settings?.maxAttempts || 10;
            const countSource = (player.team && player.team !== '0')
                ? String(room.currentGame?.teamGuesses?.[player.team] || '')
                : String(player.guesses || '');
            const attemptCount = countAttemptMarks(countSource);

            if (!hasEndedMark) {
                const endMark = attemptCount >= maxAttempts ? '💀' : '🏳️';

                // 未结束且主动进入观战：默认视为投降（🏳️）
                // 但若已耗尽次数（attemptCount>=maxAttempts），改为死亡（💀）
                if (player.team && player.team !== '0') {
                    if (!room.currentGame.teamGuesses) room.currentGame.teamGuesses = {};
                    room.currentGame.teamGuesses[player.team] = (room.currentGame.teamGuesses[player.team] || '') + endMark;

                    // 同步队友的 guesses（保持与 teamGuesses 一致）
                    const updated = room.currentGame.teamGuesses[player.team];
                    room.players
                        .filter(p => p.team === player.team && !p.isAnswerSetter && !p.disconnected)
                        .forEach(teammate => {
                            teammate.guesses = updated;
                        });
                } else {
                    player.guesses += endMark;
                }
            }

            // 始终仅标记为临时观战，不修改队伍
            player._tempObserver = true;

            broadcastPlayers(roomId, room);
            runFlowAndRefresh(roomId, room);
        });

        /**
         * 请求游戏设置事件处理
         * @event requestGameSettings
         * @param {string} roomId - 房间 ID
         */
        socket.on('requestGameSettings', ({ roomId }) => {
            const room = getRoom(roomId, 'requestGameSettings');
            if (!room) return;
            if (room.settings) socket.emit('updateGameSettings', { settings: room.settings });
        });

        /**
         * 超时事件处理
         * 标记玩家超时，计入一次猜测尝试，更新队伍状态，推进同步进度
         * @event timeOut
         * @param {string} roomId - 房间 ID
         */
        socket.on('timeOut', ({ roomId }) => {
            const room = getRoom(roomId, 'timeOut');
            if (!room) return;
            const player = room.players.find(p => p.id === socket.id);
            if (!player) return emitError('timeOut', '连接中断了');
            if (!room.currentGame) return emitError('timeOut', '游戏未开始或已结束');

            // 使用 gameplay.js 中的统一超时处理函数
            const { needsSyncUpdate } = handlePlayerTimeout(room, player, io, roomId);

            // 如果需要更新同步进度，调用更新函数
            if (needsSyncUpdate) {
                updateSyncProgress(room, roomId, io);
            }

            // 广播猜测历史更新，让客户端重新计算剩余次数
            io.to(roomId).emit('guessHistoryUpdate', buildGuessHistoryPayload(room.currentGame));

            broadcastPlayers(roomId, room);
            runFlowAndRefresh(roomId, room);
        });

        /**
         * 断连事件处理
         * 处理房主转移、临时观战恢复、同步清理等
         * @event disconnect
         */
        socket.on('disconnect', () => {
            for (const [roomId, room] of rooms.entries()) {
                const idx = room.players.findIndex(p => p.id === socket.id);
                if (idx === -1) continue;
                const disconnectedPlayer = room.players[idx];
                if (room.host === socket.id) {
                    const newHost = room.players.find(p => !p.disconnected && p.id !== socket.id);
                    if (newHost) {
                        room.host = newHost.id;
                        const newHostIndex = room.players.findIndex(p => p.id === newHost.id);
                        if (newHostIndex !== -1) {
                            room.players[newHostIndex].isHost = true;
                            room.players[newHostIndex].ready = false;
                        }
                        disconnectedPlayer.isHost = false;
                        disconnectedPlayer.disconnected = true;
                        io.to(roomId).emit('hostTransferred', { oldHostName: disconnectedPlayer.username, newHostId: newHost.id, newHostName: newHost.username });
                        broadcastPlayers(roomId, room, { isPublic: room.isPublic });
                    } else {
                        rooms.delete(roomId);
                        io.to(roomId).emit('roomClosed', { message: '房主已断开连接，房间已关闭' });
                    }
                } else {
                    disconnectedPlayer.disconnected = true;
                    if (room.answerSetterId && room.answerSetterId === disconnectedPlayer.id) {
                        room.answerSetterId = null;
                        room.waitingForAnswer = false;
                        revertSetterObservers(room, roomId, io);
                        io.to(roomId).emit('waitForAnswerCanceled', { message: `指定的出题人 ${disconnectedPlayer.username} 已离开，等待被取消` });
                    }
                    broadcastPlayers(roomId, room, { isPublic: room.isPublic });
                    if (room.currentGame && room.currentGame.settings?.syncMode && room.currentGame.syncPlayersCompleted) {
                        room.currentGame.syncPlayersCompleted.delete(socket.id);
                        updateSyncProgress(room, roomId, io);
                    }
                }

                if (room.currentGame) {
                    runFlowAndRefresh(roomId, room, { broadcastState: true });
                }
                break;
            }
            log.info('disconnected');
        });

        /**
         * 房间可见性切换事件处理（仅房主可用）
         * @event toggleRoomVisibility
         * @param {string} roomId - 房间 ID
         */
        socket.on('toggleRoomVisibility', ({ roomId }) => {
            const room = getRoom(roomId, 'toggleRoomVisibility');
            if (!room) return;
            const player = room.players.find(p => p.id === socket.id);
            if (!player || !player.isHost) return emitError('toggleRoomVisibility', '只有房主可以更改房间状态');
            room.isPublic = !room.isPublic;
            broadcastPlayers(roomId, room);
        });

        /**
         * 更新房间名称事件处理（仅房主可用）
         * @event updateRoomName
         * @param {string} roomId - 房间 ID
         * @param {string} roomName - 新房间名称
         */
        socket.on('updateRoomName', ({ roomId, roomName }) => {
            const room = getRoom(roomId, 'updateRoomName');
            if (!room) return;
            const player = room.players.find(p => p.id === socket.id);
            if (!player || !player.isHost) return emitError('updateRoomName', '只有房主可以修改房名');
            let normalizedName = '';
            if (typeof roomName === 'string') normalizedName = roomName.trim().slice(0, 30);
            room.roomName = normalizedName;
            io.to(roomId).emit('roomNameUpdated', { roomName: normalizedName });
        });

        /**
         * 进入手动出题模式事件处理（仅房主可用）
         * @event enterManualMode
         * @param {string} roomId - 房间 ID
         */
        socket.on('enterManualMode', ({ roomId }) => {
            const room = getRoom(roomId, 'enterManualMode');
            if (!room) return;
            const player = room.players.find(p => p.id === socket.id);
            if (!player || !player.isHost) return emitError('enterManualMode', '只有房主可以进入出题模式');
            room.players.forEach(p => { if (!p.isHost) p.ready = true; });
            broadcastPlayers(roomId, room, { isPublic: room.isPublic });
        });

        /**
         * 设置出题人事件处理（仅房主可用）
         * @event setAnswerSetter
         * @param {string} roomId - 房间 ID
         * @param {string} setterId - 出题人的 socket ID
         */
        socket.on('setAnswerSetter', ({ roomId, setterId }) => {
            const room = getRoom(roomId, 'setAnswerSetter');
            if (!room) return;
            const player = room.players.find(p => p.id === socket.id);
            if (!player || !player.isHost) return emitError('setAnswerSetter', '只有房主可以选择出题人');
            const setter = room.players.find(p => p.id === setterId);
            if (!setter) return emitError('setAnswerSetter', '找不到选中的玩家');
            revertSetterObservers(room, roomId, io);
            room.answerSetterId = setterId;
            room.waitingForAnswer = true;
            applySetterObservers(room, roomId, setterId, io);
            io.to(roomId).emit('waitForAnswer', { answerSetterId: setterId, setterUsername: setter.username });
            broadcastPlayers(roomId, room, { answerSetterId: setterId });
            log.info(`answer setter ${setter.username}`);
        });

        /**
         * 踢出玩家事件处理（仅房主可用）
         * @event kickPlayer
         * @param {string} roomId - 房间 ID
         * @param {string} playerId - 被踢出玩家的 socket ID
         */
        socket.on('kickPlayer', ({ roomId, playerId }) => {
            const room = getRoom(roomId, 'kickPlayer');
            if (!room) return;
            const host = room.players.find(p => p.id === socket.id);
            if (!host || !host.isHost) return emitError('kickPlayer', '只有房主可以踢出玩家');
            const playerIndex = room.players.findIndex(p => p.id === playerId);
            if (playerIndex === -1) return emitError('kickPlayer', '找不到要踢出的玩家');
            const playerToKick = room.players[playerIndex];
            if (playerToKick.id === socket.id) return emitError('kickPlayer', '无法踢出自己');

            if (room.answerSetterId && room.answerSetterId === playerToKick.id) {
                room.answerSetterId = null;
                room.waitingForAnswer = false;
                revertSetterObservers(room, roomId, io);
                io.to(roomId).emit('waitForAnswerCanceled', { message: `指定的出题人 ${playerToKick.username} 已被踢出，等待已取消` });
            }

            io.to(playerId).emit('playerKicked', { playerId, username: playerToKick.username });
            room.players.splice(playerIndex, 1);
            socket.to(roomId).emit('playerKicked', { playerId, username: playerToKick.username });
            broadcastPlayers(roomId, room, { answerSetterId: room.answerSetterId });

            if (room.currentGame && room.currentGame.settings?.syncMode && room.currentGame.syncPlayersCompleted) {
                room.currentGame.syncPlayersCompleted.delete(playerId);
                updateSyncProgress(room, roomId, io);
            }
            if (room.currentGame) runFlowAndRefresh(roomId, room);

            const kickedSocket = io.sockets.sockets.get(playerId);
            if (kickedSocket) kickedSocket.leave(roomId);
            log.info(`kicked ${playerToKick.username}`);
        });

        /**
         * 设置答案事件处理（手动出题模式，仅被指定出题人可用）
         * @event setAnswer
         * @param {string} roomId - 房间 ID
         * @param {Object} character - 对局角色对象
         * @param {Array} hints - 提示列表
         */
        socket.on('setAnswer', ({ roomId, character, hints }) => {
            const room = getRoom(roomId, 'setAnswer');
            if (!room) return;
            if (room.currentGame) return emitError('setAnswer', '游戏已经在进行中');
            if (socket.id !== room.answerSetterId) return emitError('setAnswer', '你不是指定的出题人');
            room.players = room.players.filter(p => !p.disconnected || p.score > 0);
            applySetterObservers(room, roomId, room.answerSetterId, io);
            initGameState(room, character, room.settings, hints, socket.id);
            room.waitingForAnswer = false;
            room.answerSetterId = null;
            if (room.currentGame) {
                socket.emit('guessHistoryUpdate', buildGuessHistoryPayload(room.currentGame));
            }
            broadcastState(roomId, room);
            broadcastPlayers(roomId, room, { answerSetterId: null });
            io.to(roomId).emit('gameStart', { character, settings: room.settings, players: room.players, isPublic: room.isPublic, isGameStarted: true, hints, isAnswerSetter: false });
            io.to(roomId).emit('tagBanStateUpdate', { tagBanState: [] });
            socket.emit('gameStart', { character, settings: room.settings, players: room.players, isPublic: room.isPublic, isGameStarted: true, hints, isAnswerSetter: true });
            if (room.currentGame.settings?.syncMode) updateSyncProgress(room, roomId, io);
            log.info(`custom answer started ${roomId}`);
        });

        /**
         * 房主转移事件处理（仅现任房主可用）
         * @event transferHost
         * @param {string} roomId - 房间 ID
         * @param {string} newHostId - 新房主的 socket ID
         */
        socket.on('transferHost', ({ roomId, newHostId }) => {
            const room = getRoom(roomId, 'transferHost');
            if (!room) return;
            if (socket.id !== room.host) return emitError('transferHost', '只有房主可以转移权限');
            const newHost = room.players.find(p => p.id === newHostId);
            if (!newHost || newHost.disconnected) return emitError('transferHost', '无法将房主转移给该玩家');
            const currentHost = room.players.find(p => p.id === socket.id);
            room.host = newHostId;
            room.players.forEach(p => { p.isHost = p.id === newHostId; });
            newHost.ready = false;
            io.to(roomId).emit('hostTransferred', { oldHostName: currentHost.username, newHostId: newHost.id, newHostName: newHost.username });
            broadcastPlayers(roomId, room, { answerSetterId: room.answerSetterId });
        });

        /**
         * 更新玩家消息事件处理
         * @event updatePlayerMessage
         * @param {string} roomId - 房间 ID
         * @param {string} message - 玩家消息内容
         */
        socket.on('updatePlayerMessage', ({ roomId, message }) => {
            const room = getRoom(roomId, 'updatePlayerMessage');
            if (!room) return;
            const player = room.players.find(p => p.id === socket.id);
            if (!player) return emitError('updatePlayerMessage', '连接中断了');
            player.message = message;
            broadcastPlayers(roomId, room, { isPublic: room.isPublic });
        });

        /**
         * 更新玩家队伍事件处理
         * @event updatePlayerTeam
         * @param {string} roomId - 房间 ID
         * @param {string} team - 队伍 ID（'0'-'8' 或 null）
         */
        socket.on('updatePlayerTeam', ({ roomId, team }) => {
            const room = getRoom(roomId, 'updatePlayerTeam');
            if (!room) return;
            const player = room.players.find(p => p.id === socket.id);
            if (!player) return emitError('updatePlayerTeam', '连接中断了');
            if (team !== null && !(typeof team === 'string' && /^[0-8]$/.test(team))) return emitError('updatePlayerTeam', 'Invalid team value');
            player.team = team === '' ? null : team;
            broadcastPlayers(roomId, room, { isPublic: room.isPublic });
        });
    });
}

module.exports = setupSocket;
