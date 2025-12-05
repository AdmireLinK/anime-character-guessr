function setupSocket(io, rooms) {
    io.on('connection', (socket) => {
        console.log(`A user connected: ${socket.id}`);
    
        // Handle room creation
        socket.on('createRoom', ({roomId, username, avatarId, avatarImage}) => {
            // Basic validation
            if (!username || username.trim().length === 0) {
                console.log(`[ERROR][createRoom][${socket.id}] 用户名呢`);
                socket.emit('error', {message: 'createRoom: 用户名呢'});
                return;
            }
    
            if (rooms.has(roomId)) {
                console.log(`[ERROR][createRoom][${socket.id}] 房间已存在？但为什么？`);
                socket.emit('error', {message: 'createRoom: 房间已存在？但为什么？'});
                return;
            }
    
            if (rooms.size >= 259) {
                console.log(`[ERROR][createRoom][${socket.id}] 服务器已满，请稍后再试`);
                socket.emit('error', {message: 'createRoom: 服务器已满，请稍后再试'});
                return;
            }
    
            rooms.set(roomId, {
                host: socket.id,
                isPublic: true, // Default to public
                players: [{
                    id: socket.id,
                    username,
                    isHost: true,
                    score: 0,
                    ready: false,
                    guesses: '',
                    message: '',
                    team: null,
                    ...(avatarId !== undefined && { avatarId }),
                    ...(avatarImage !== undefined && { avatarImage })
                }],
                roomName: '',
                lastActive: Date.now()
            });
    
            // Join socket to room
            socket.join(roomId);
    
            // Send room data back to host
            io.to(roomId).emit('updatePlayers', {
                players: rooms.get(roomId).players,
                isPublic: rooms.get(roomId).isPublic
            });
            socket.emit('roomNameUpdated', {
                roomName: rooms.get(roomId).roomName || ''
            });
    
            console.log(`Room ${roomId} created by ${username}`);
        });
    
        // Handle room joining
        socket.on('joinRoom', ({roomId, username, avatarId, avatarImage}) => {
            // Basic validation
            if (!username || username.trim().length === 0) {
                console.log(`[ERROR][joinRoom][${socket.id}] 用户名呢`);
                socket.emit('error', {message: 'joinRoom: 用户名呢'});
                return;
            }
    
            const room = rooms.get(roomId);
    
            if (!room) {
                rooms.set(roomId, {
                    host: socket.id,
                    isPublic: true, // Default to public
                    players: [{
                        id: socket.id,
                        username,
                        isHost: true,
                        score: 0,
                        ready: false,
                        guesses: '',
                        message: '',
                        team: null,
                        ...(avatarId !== undefined && { avatarId }),
                        ...(avatarImage !== undefined && { avatarImage })
                    }],
                    roomName: '',
                    lastActive: Date.now()
                });
        
                // Join socket to room
                socket.join(roomId);
        
                io.to(roomId).emit('hostTransferred', {
                    oldHostName: username,
                    newHostId: socket.id,
                    newHostName: username
                });
    
                io.to(roomId).emit('updatePlayers', {
                    players: rooms.get(roomId).players,
                    isPublic: rooms.get(roomId).isPublic
                });
                socket.emit('roomNameUpdated', {
                    roomName: rooms.get(roomId).roomName || ''
                });
                
                console.log(`Room ${roomId} created by ${username}`);
                return;
            }
    
            // Check for existing player with same username (case-insensitive)
            const existingPlayerIndex = room.players.findIndex(
                player => player.username === username
            );
    
            if (existingPlayerIndex !== -1) {
                const existingPlayer = room.players[existingPlayerIndex];
                
                // If the existing player is disconnected, allow reconnection
                if (existingPlayer.disconnected) {
                    console.log(`Player ${username} reconnecting to room ${roomId}`);
                    
                    // Update the disconnected player's socket ID
                    room.players[existingPlayerIndex].id = socket.id;
                    room.players[existingPlayerIndex].disconnected = false;
                    
                    // Update avatar if provided
                    if (avatarId !== undefined) {
                        room.players[existingPlayerIndex].avatarId = avatarId;
                    }
                    if (avatarImage !== undefined) {
                        room.players[existingPlayerIndex].avatarImage = avatarImage;
                    }
                    
                    // Join socket to room
                    socket.join(roomId);
                    
                    // Send updated player list to all clients in room
                    io.to(roomId).emit('updatePlayers', {
                        players: room.players,
                        isPublic: room.isPublic
                    });
                    socket.emit('roomNameUpdated', {
                        roomName: room.roomName || ''
                    });
                    
                    
                    // If a game is in progress, send the current game state to the reconnecting player
                    if (room.currentGame && room.currentGame.character) {
                        socket.emit('gameStart', {
                            character: room.currentGame.character,
                            settings: room.currentGame.settings,
                            players: room.players,
                            isPublic: room.isPublic,
                            hints: room.currentGame.hints || null,
                            isAnswerSetter: existingPlayer.isAnswerSetter
                        });

                        socket.emit('guessHistoryUpdate', {
                            guesses: room.currentGame.guesses
                        });
                    }
                    
                    console.log(`${username} reconnected to room ${roomId}`);
                    return;
                } else {
                    // Username is taken by an active player
                    console.log(`[ERROR][joinRoom][${socket.id}] 换个名字吧`);
                    socket.emit('error', {message: 'joinRoom: 换个名字吧'});
                    return;
                }
            }
    
            // Check for duplicate avatarId (only for active players)
            if (avatarId !== undefined) {
                const isAvatarTaken = room.players.some(player => 
                    player.avatarId !== undefined && String(player.avatarId)!=='0' && String(player.avatarId) === String(avatarId)
                );
                if (isAvatarTaken) {
                    console.log(`[ERROR][joinRoom][${socket.id}] 头像已被选用`);
                    socket.emit('error', {message: 'joinRoom: 头像已被选用'});
                    return;
                }
            }
    
            // Add player to room
            room.players.push({
                id: socket.id,
                username,
                isHost: false,
                score: 0,
                ready: false,
                guesses: '',
                message: '',
                team: room.currentGame? '0' : null,
                ...(avatarId !== undefined && { avatarId }),
                ...(avatarImage !== undefined && { avatarImage })
            });
    
            // Join socket to room
            socket.join(roomId);
    
            // Send updated player list to all clients in room
            io.to(roomId).emit('updatePlayers', {
                players: room.players,
                isPublic: room.isPublic
            });
            socket.emit('roomNameUpdated', {
                roomName: room.roomName || ''
            });
    
            // If a game is in progress, send the current game state to the joining player (observer)
            if (room.currentGame && room.currentGame.character) {
                socket.emit('gameStart', {
                    character: room.currentGame.character,
                    settings: room.currentGame.settings,
                    players: room.players,
                    isPublic: room.isPublic,
                    hints: room.currentGame.hints || null,
                    isAnswerSetter: false
                });

                socket.emit('guessHistoryUpdate', {
                    guesses: room.currentGame.guesses
                });
            }
    
            console.log(`${username} joined room ${roomId}`);
        });
    
        // Handle ready status toggle
        socket.on('toggleReady', ({roomId}) => {
            const room = rooms.get(roomId);
    
            if (!room) {
                console.log(`[ERROR][toggleReady][${socket.id}] 房间不存在`);
                socket.emit('error', {message: 'toggleReady: 房间不存在'});
                return;
            }
    
            // Find the player
            const player = room.players.find(p => p.id === socket.id);
    
            if (!player) {
                console.log(`[ERROR][toggleReady][${socket.id}] 连接中断了`);
                socket.emit('error', {message: 'toggleReady: 连接中断了'});
                return;
            }
    
            // Don't allow host to toggle ready status
            if (player.isHost) {
                console.log(`[ERROR][toggleReady][${socket.id}] 房主不需要准备`);
                socket.emit('error', {message: 'toggleReady: 房主不需要准备'});
                return;
            }
    
            // Toggle ready status
            player.ready = !player.ready;
    
            // Notify all players in the room about the update
            io.to(roomId).emit('updatePlayers', {
                players: room.players
            });
    
            console.log(`Player ${player.username} ${player.ready ? 'is now ready' : 'is no longer ready'} in room ${roomId}`);
        });
    
        // Handle game settings update
        socket.on('updateGameSettings', ({roomId, settings}) => {
            const room = rooms.get(roomId);
            if (room) room.lastActive = Date.now();
    
            if (!room) {
                console.log(`[ERROR][updateGameSettings][${socket.id}] 房间不存在`);
                socket.emit('error', {message: 'updateGameSettings: 房间不存在'});
                return;
            }
    
            // Only allow host to update settings
            const player = room.players.find(p => p.id === socket.id);
            if (!player || !player.isHost) {
                console.log(`[ERROR][updateGameSettings][${socket.id}] 只有房主可以更改设置`);
                socket.emit('error', {message: 'updateGameSettings: 只有房主可以更改设置'});
                return;
            }
    
            // Store settings in room data
            room.settings = settings;
    
            // Broadcast settings to all clients in the room
            io.to(roomId).emit('updateGameSettings', {settings});
    
            console.log(`Game settings updated in room ${roomId}`);
        });
    
        // Handle game start
        socket.on('gameStart', ({roomId, character, settings}) => {
            const room = rooms.get(roomId);
            if (room) room.lastActive = Date.now();
    
            if (!room) {
                console.log(`[ERROR][gameStart][${socket.id}] 房间不存在`);
                socket.emit('error', {message: 'gameStart: 房间不存在'});
                return;
            }
    
            // Set room to private when game starts
            // room.isPublic = false;
    
            // Only allow host to start game
            const player = room.players.find(p => p.id === socket.id);
            if (!player || !player.isHost) {
                console.log(`[ERROR][gameStart][${socket.id}] 只有房主可以开始游戏`);
                socket.emit('error', {message: 'gameStart: 只有房主可以开始游戏'});
                return;
            }
    
            // Check if all non-disconnected players are ready
            const allReady = room.players.every(p => p.isHost || p.ready || p.disconnected);
            if (!allReady) {
                console.log(`[ERROR][gameStart][${socket.id}] 所有玩家必须准备好才能开始游戏`);
                socket.emit('error', {message: 'gameStart: 所有玩家必须准备好才能开始游戏'});
                return;
            }
    
            // Remove disconnected players with 0 score
            room.players = room.players.filter(p => !p.disconnected || p.score > 0);
    
            // 存储当前游戏状态
            room.currentGame = {
                character, // 存储加密的角色信息（供后加入的玩家使用）
                settings,
                guesses: [], // 初始化猜测记录数组
                hints: null, // 提示信息（如果使用）
                // 同步模式状态
                syncRound: 0, // 当前同步轮次
                syncPlayersCompleted: new Set(), // 已完成当前轮次猜测的玩家集合
                // 血战模式状态
                nonstopWinners: [], // 按顺序记录猜对的玩家 [{id, username, isBigWin}]
                // 普通模式胜者记录（用于并发提交时确定第一个胜者）
                firstWinner: null // {id, username, isBigWin, timestamp}
            };
    
            // Reset all players' game state
            room.players.forEach(p => {
                p.guesses = '';
                // Only keep guess history for non-answer-setter and non-observer players
                if (!p.isAnswerSetter && p.team !== '0') {
                    room.currentGame.guesses.push({username: p.username, guesses: []});
                }
            });
    
            // Broadcast game start and updated players to all clients in the room in a single event
            io.to(roomId).emit('gameStart', {
                character,
                settings,
                players: room.players,
                isPublic: room.isPublic,
                isGameStarted: true
            });
    
            console.log(`Game started in room ${roomId}`);
        });
    
        // Handle player guesses
        socket.on('playerGuess', ({roomId, guessResult}) => {
            const room = rooms.get(roomId);
            if (room) room.lastActive = Date.now();
    
            if (!room) {
                console.log(`[ERROR][playerGuess][${socket.id}] 房间不存在`);
                socket.emit('error', {message: 'playerGuess: 房间不存在'});
                return;
            }
    
            const player = room.players.find(p => p.id === socket.id);
            if (!player) {
                console.log(`[ERROR][playerGuess][${socket.id}] 连接中断了`);
                socket.emit('error', {message: 'playerGuess: 连接中断了'});
                return;
            }
    
            // Store guess in the player's guesses array using their username
            if (room.currentGame) {
                const playerGuesses = room.currentGame.guesses.find(g => g.username === player.username);
                if (playerGuesses) {
                    playerGuesses.guesses.push({
                        playerId: socket.id,
                        playerName: player.username,
                        ...guessResult
                    });
    
                    // Send real-time guess history update to the original answer setter and team 0 members
                    // room.players.filter(p => (p.isAnswerSetter || p.team === '0') && p.id !== socket.id)
                    room.players.forEach(teammate => {
                        io.to(teammate.id).emit('guessHistoryUpdate', {
                            guesses: room.currentGame.guesses
                        });
                    });
                }
            }
    
            // Team guess sharing: broadcast guessData to teammates, observers, and answerSetter (not self)
            if (guessResult.guessData && !guessResult.isCorrect) {
                // Collect all intended recipients (teammates, observers, answerSetter), not self, no duplicates
                const recipients = room.players.filter(p =>
                    p.id !== socket.id && (
                        (p.team !== null && p.team === player.team && !p.isAnswerSetter) ||
                        p.team === '0' ||
                        p.isAnswerSetter
                    )
                );
                recipients.forEach(recipient => {
                    io.to(recipient.id).emit('boardcastTeamGuess', {
                        guessData: { ...guessResult.guessData, guessrName: player.username },
                        playerId: socket.id,
                        playerName: player.username
                    });
                });
            }
    
            // Update player's guesses string
            if (!guessResult.isCorrect && guessResult.isPartialCorrect && !player.guesses.includes('💡')) {
                player.score += 1;
                player.guesses += '💡';
            }
            else{
                player.guesses += guessResult.isCorrect ? '✔' :  '❌';
            }

            // 同步模式：跟踪玩家完成状态并处理回合同步
            if (room.currentGame && room.currentGame.settings?.syncMode && room.currentGame.syncPlayersCompleted) {
                // 如果玩家猜对了，不加入同步列表（猜对的玩家会通过 gameEnd 事件结束游戏）
                if (!guessResult.isCorrect) {
                    // 标记该玩家已完成当前同步轮次
                    room.currentGame.syncPlayersCompleted.add(socket.id);
                }

                // 获取所有需要完成本轮的活跃玩家（排除观察者、出题人、已断开连接、已结束的玩家）
                const activePlayers = room.players.filter(p => 
                    !p.isAnswerSetter && 
                    p.team !== '0' && 
                    !p.disconnected &&
                    !p.guesses.includes('✌') &&
                    !p.guesses.includes('💀') &&
                    !p.guesses.includes('🏳️') &&
                    !p.guesses.includes('👑') &&
                    !p.guesses.includes('🏆')
                );

                if (activePlayers.length > 0) {
                    // 构建所有活跃玩家的同步状态
                    const syncStatus = activePlayers.map(p => ({
                        id: p.id,
                        username: p.username,
                        completed: room.currentGame.syncPlayersCompleted.has(p.id)
                    }));

                    // 检查是否所有活跃玩家都已完成猜测
                    const allCompleted = activePlayers.every(p => room.currentGame.syncPlayersCompleted.has(p.id));

                    if (allCompleted) {
                        // 仅同步模式（非血战）：如果有人猜对，本轮完成后不进入下一轮
                        if (!room.currentGame.settings.nonstopMode && room.currentGame.syncWinnerFound) {
                            console.log(`[同步模式] 房间 ${roomId}: 本轮完成，有人猜对，等待游戏结束`);
                            // 游戏结束会由 gameEnd 事件触发
                        } else {
                            // 所有玩家都已完成猜测，开始下一轮
                            room.currentGame.syncRound += 1;
                            room.currentGame.syncPlayersCompleted.clear();
                            
                            // 通知所有玩家可以开始下一轮
                            io.to(roomId).emit('syncRoundStart', {
                                round: room.currentGame.syncRound
                            });
                            console.log(`[同步模式] 房间 ${roomId}: 第 ${room.currentGame.syncRound} 轮开始 - 所有玩家已完成`);
                        }
                    } else {
                        // 通知所有玩家当前同步状态
                        io.to(roomId).emit('syncWaiting', {
                            round: room.currentGame.syncRound,
                            syncStatus: syncStatus,
                            completedCount: syncStatus.filter(s => s.completed).length,
                            totalCount: syncStatus.length
                        });
                        console.log(`[同步模式] 房间 ${roomId}: 等待中 - ${syncStatus.filter(s => s.completed).length}/${syncStatus.length} 玩家已完成`);
                        
                        // 仅同步模式（非血战）：如果有人猜对，通知等待中的玩家
                        if (!room.currentGame.settings.nonstopMode && room.currentGame.syncWinnerFound) {
                            io.to(roomId).emit('syncGameEnding', {
                                winnerUsername: room.currentGame.syncWinner?.username,
                                message: `${room.currentGame.syncWinner?.username} 已猜对！等待本轮结束...`
                            });
                        }
                    }
                }
            }
    
            // Broadcast updated players to all clients in the room
            io.to(roomId).emit('updatePlayers', {
                players: room.players
            });
    
            if (guessResult.guessData && guessResult.guessData.name) {
                console.log(`Player ${player.username} made a guess in room ${roomId}: ${guessResult.guessData.name} (${guessResult.isCorrect ? 'correct' : 'incorrect'})`);
            } else {
                console.log(`Player ${player.username} made a guess in room ${roomId} with no valid guessData.`, guessResult);
            }
        });

        // 血战模式：处理玩家猜对事件
        socket.on('nonstopWin', ({roomId, isBigWin}) => {
            const room = rooms.get(roomId);
            if (room) room.lastActive = Date.now();

            if (!room || !room.currentGame) {
                console.log(`[ERROR][nonstopWin][${socket.id}] 房间不存在或游戏未开始`);
                socket.emit('error', {message: 'nonstopWin: 房间不存在或游戏未开始'});
                return;
            }

            // 确保 nonstopWinners 数组存在
            if (!room.currentGame.nonstopWinners) {
                room.currentGame.nonstopWinners = [];
            }

            const player = room.players.find(p => p.id === socket.id);
            if (!player) {
                console.log(`[ERROR][nonstopWin][${socket.id}] 连接中断了`);
                socket.emit('error', {message: 'nonstopWin: 连接中断了'});
                return;
            }

            // 检查该玩家是否已经猜对过（防止重复提交）
            if (room.currentGame.nonstopWinners.some(w => w.id === socket.id)) {
                console.log(`[血战模式] ${player.username} 已经猜对过，忽略重复提交`);
                return;
            }

            // 血战模式：检查队友是否已经猜对，如果是则阻止（无论是否同步模式）
            if (player.team && player.team !== '0') {
                const teammateWon = room.currentGame.nonstopWinners.some(w => {
                    const winner = room.players.find(p => p.id === w.id);
                    return winner && winner.team === player.team;
                });
                if (teammateWon) {
                    console.log(`[血战模式] ${player.username} 的队友已经猜对，不能继续猜`);
                    socket.emit('error', {message: '你的队友已经猜对了，你无法继续猜测'});
                    return;
                }
            }

            // 更新玩家状态（先更新，确保后续过滤正确）
            player.guesses += isBigWin ? '👑' : '✌';

            // 血战模式：标记同队其他玩家为已完成（自动队伍胜利）
            if (player.team && player.team !== '0') {
                room.players
                    .filter(p => p.team === player.team && p.id !== socket.id && !p.isAnswerSetter && !p.disconnected)
                    .filter(p => !p.guesses.includes('✌') && !p.guesses.includes('💀') && !p.guesses.includes('🏳️') && !p.guesses.includes('👑') && !p.guesses.includes('🏆'))
                    .forEach(teammate => {
                        teammate.guesses += '🏆'; // 队友猜对，标记为队伍胜利
                        // 从同步等待中移除（如果是同步模式）
                        if (room.currentGame.syncPlayersCompleted) {
                            room.currentGame.syncPlayersCompleted.delete(teammate.id);
                        }
                        // 通知队友游戏结束
                        io.to(teammate.id).emit('teamWin', {
                            winnerName: player.username,
                            message: `队友 ${player.username} 已猜对！`
                        });
                        console.log(`[血战模式] ${teammate.username} 的队友 ${player.username} 猜对，标记为队伍胜利`);
                    });
            }

            // 获取活跃玩家（不含出题人、观察者）
            const activePlayers = room.players.filter(p => !p.isAnswerSetter && p.team !== '0' && !p.disconnected);
            
            // 获取尚未结束的玩家
            const remainingPlayers = activePlayers.filter(p => 
                !p.guesses.includes('✌') && 
                !p.guesses.includes('💀') && 
                !p.guesses.includes('🏳️') && 
                !p.guesses.includes('👑') &&
                !p.guesses.includes('🏆')
            );

            // 计算当前玩家得分：玩家总数 - 已猜对的玩家数（当前排名）
            // winnerRank 是当前玩家的排名（1-indexed），因为在 push 之前计算
            const totalPlayers = activePlayers.length;
            const winnerRank = room.currentGame.nonstopWinners.length + 1; // +1 因为还没 push
            const score = Math.max(1, totalPlayers - winnerRank + 1);
            
            // 先计算好分数，再加分和记录
            player.score += score;
            console.log(`[血战模式调试] ${player.username}(id=${socket.id}) 得分计算: totalPlayers=${totalPlayers}, winnerRank=${winnerRank}, score=${score}, newScore=${player.score}`);

            // 记录猜对的玩家（包含得分）
            room.currentGame.nonstopWinners.push({
                id: socket.id,
                username: player.username,
                isBigWin: isBigWin,
                team: player.team,
                score: score // 在 push 时就记录得分
            });

            // 广播血战模式进度（每个 winner 已经包含了正确的得分）
            io.to(roomId).emit('nonstopProgress', {
                winners: room.currentGame.nonstopWinners.map((w, idx) => ({
                    username: w.username,
                    rank: idx + 1,
                    score: w.score
                })),
                remainingCount: remainingPlayers.length,
                totalCount: totalPlayers
            });

            // 更新玩家列表（包含最新的分数）
            io.to(roomId).emit('updatePlayers', {
                players: room.players
            });

            console.log(`[血战模式] ${player.username} 第${winnerRank}个猜对，得${score}分，剩余${remainingPlayers.length}人，当前分数=${player.score}`);

            // 检查是否所有人都已结束（猜对或失败）
            if (remainingPlayers.length === 0) {
                // 游戏结束，计算出题人得分
                const answerSetter = room.players.find(p => p.isAnswerSetter);
                const winnersCount = room.currentGame.nonstopWinners.length;
                const totalPlayersCount = activePlayers.length;
                
                let message = '';
                if (answerSetter) {
                    // 玩家数系数：玩家数/2 向上取整，最小为1
                    const playerMultiplier = Math.max(1, Math.ceil(totalPlayersCount / 2));
                    
                    if (winnersCount === 0) {
                        // 无人猜中，出题人扣分（基础-2 × 系数）
                        const penalty = 2 * playerMultiplier;
                        answerSetter.score -= penalty;
                        message = `【血战模式】无人猜中！出题人 ${answerSetter.username} -${penalty}分！`;
                    } else {
                        // 根据猜对比例计算基础得分
                        const winRate = winnersCount / totalPlayersCount;
                        let baseScore = 0;
                        let scoreReason = '';
                        
                        if (winRate <= 0.25) {
                            // 猜对人数过少（≤25%），太难了
                            baseScore = 1;
                            scoreReason = '难度偏高';
                        } else if (winRate >= 0.75) {
                            // 猜对人数过多（≥75%），太简单了
                            baseScore = 1;
                            scoreReason = '难度偏低';
                        } else {
                            // 猜对人数适中（25%-75%），刚刚好
                            baseScore = 2;
                            scoreReason = '难度适中';
                        }
                        
                        const setterScore = baseScore * playerMultiplier;
                        answerSetter.score += setterScore;
                        const winnerNames = room.currentGame.nonstopWinners.map((w, i) => `${i + 1}. ${w.username}`).join('、');
                        message = `【血战模式】猜对顺序：${winnerNames}。${scoreReason}，出题人 ${answerSetter.username} +${setterScore}分！`;
                    }
                } else {
                    if (winnersCount > 0) {
                        const winnerNames = room.currentGame.nonstopWinners.map((w, i) => `${i + 1}. ${w.username}`).join('、');
                        message = `【血战模式】猜对顺序：${winnerNames}`;
                    } else {
                        message = `【血战模式】无人猜中！`;
                    }
                }

                io.to(roomId).emit('gameEnded', {
                    message,
                    guesses: room.currentGame?.guesses || []
                });

                // 重置状态
                room.players.forEach(p => {
                    p.isAnswerSetter = false;
                });
                io.to(roomId).emit('resetReadyStatus');
                room.currentGame = null;
                io.to(roomId).emit('updatePlayers', {
                    players: room.players,
                    isPublic: room.isPublic,
                    answerSetterId: null
                });

                console.log(`[血战模式] 房间 ${roomId} 游戏结束`);
            }
        });
    
        // Handle game end
        socket.on('gameEnd', ({roomId, result}) => {
            const room = rooms.get(roomId);
            if (room) room.lastActive = Date.now();
    
            if (!room) {
                console.log(`[ERROR][gameEnd][${socket.id}] 房间不存在`);
                socket.emit('error', {message: 'gameEnd: 房间不存在'});
                return;
            }
    
            const player = room.players.find(p => p.id === socket.id);
            if (!player) {
                console.log(`[ERROR][gameEnd][${socket.id}] 连接中断了`);
                socket.emit('error', {message: 'gameEnd: 连接中断了'});
                return;
            }
    
            // Update player's guesses string
            switch (result) {
                case 'surrender':
                    player.guesses += '🏳️';
                    break;
                case 'win':
                    player.guesses += '✌';
                    // 记录第一个胜者（用于并发提交时确定真正的胜者）
                    if (room.currentGame && !room.currentGame.firstWinner) {
                        room.currentGame.firstWinner = {
                            id: socket.id,
                            username: player.username,
                            isBigWin: false,
                            timestamp: Date.now()
                        };
                        console.log(`[普通模式] 第一个胜者: ${player.username}`);
                    }
                    // 非血战模式下，一人猜对后同队队友也标记为队伍胜利
                    if (!room.currentGame?.settings?.nonstopMode && player.team && player.team !== '0') {
                        room.players
                            .filter(p => p.team === player.team && p.id !== player.id && !p.isAnswerSetter && !p.disconnected)
                            .filter(p => !p.guesses.includes('✌') && !p.guesses.includes('💀') && !p.guesses.includes('🏳️') && !p.guesses.includes('👑') && !p.guesses.includes('🏆'))
                            .forEach(teammate => {
                                teammate.guesses += '🏆';
                                // 从同步等待中移除
                                if (room.currentGame?.syncPlayersCompleted) {
                                    room.currentGame.syncPlayersCompleted.delete(teammate.id);
                                }
                                // 通知队友游戏结束
                                io.to(teammate.id).emit('teamWin', {
                                    winnerName: player.username,
                                    message: `队友 ${player.username} 已猜对！`
                                });
                                console.log(`[普通/同步模式] ${teammate.username} 的队友 ${player.username} 猜对，标记为队伍胜利`);
                            });
                    }
                    break;
                case 'bigwin':
                    player.guesses += '👑';
                    // 记录第一个胜者（bigwin 优先级更高）
                    if (room.currentGame) {
                        // bigwin 会覆盖普通 win，或者作为第一个胜者
                        if (!room.currentGame.firstWinner || !room.currentGame.firstWinner.isBigWin) {
                            room.currentGame.firstWinner = {
                                id: socket.id,
                                username: player.username,
                                isBigWin: true,
                                timestamp: Date.now()
                            };
                            console.log(`[普通模式] 本命大赢家: ${player.username}`);
                        }
                    }
                    // 非血战模式下，一人猜对后同队队友也标记为队伍胜利
                    if (!room.currentGame?.settings?.nonstopMode && player.team && player.team !== '0') {
                        room.players
                            .filter(p => p.team === player.team && p.id !== player.id && !p.isAnswerSetter && !p.disconnected)
                            .filter(p => !p.guesses.includes('✌') && !p.guesses.includes('💀') && !p.guesses.includes('🏳️') && !p.guesses.includes('👑') && !p.guesses.includes('🏆'))
                            .forEach(teammate => {
                                teammate.guesses += '🏆';
                                // 从同步等待中移除
                                if (room.currentGame?.syncPlayersCompleted) {
                                    room.currentGame.syncPlayersCompleted.delete(teammate.id);
                                }
                                // 通知队友游戏结束
                                io.to(teammate.id).emit('teamWin', {
                                    winnerName: player.username,
                                    message: `队友 ${player.username} 已猜对！`
                                });
                                console.log(`[普通/同步模式] ${teammate.username} 的队友 ${player.username} 猜对，标记为队伍胜利`);
                            });
                    }
                    break;
                default:
                    player.guesses += '💀';
                    if (player.team !== null && player.team !== '0') {
                        room.players
                            .filter(p => p.team === player.team && p.id !== player.id && !p.isAnswerSetter)
                            .forEach(teammate => {
                                teammate.guesses += '💀';
                            });
                    }
            }

            // 仅同步模式（非血战）：有人猜对后，标记游戏即将结束，等待本轮完成
            if (room.currentGame && room.currentGame.settings.syncMode && !room.currentGame.settings.nonstopMode) {
                if (result === 'win' || result === 'bigwin') {
                    // 标记有人猜对，游戏将在本轮结束后结束
                    room.currentGame.syncWinnerFound = true;
                    room.currentGame.syncWinner = {
                        id: socket.id,
                        username: player.username,
                        isBigWin: result === 'bigwin'
                    };
                }
            }

            // 同步模式：将已结束游戏的玩家从同步跟踪中移除，并检查是否可以进入下一轮
            if (room.currentGame && room.currentGame.settings.syncMode && room.currentGame.syncPlayersCompleted) {
                room.currentGame.syncPlayersCompleted.delete(socket.id);
                
                // 投降/失败后立即更新玩家列表，让其他玩家看到状态变化
                io.to(roomId).emit('updatePlayers', {
                    players: room.players
                });
                
                // 获取剩余需要完成本轮的活跃玩家
                const syncActivePlayers = room.players.filter(p => 
                    !p.isAnswerSetter && 
                    p.team !== '0' && 
                    !p.disconnected &&
                    !p.guesses.includes('✌') &&
                    !p.guesses.includes('💀') &&
                    !p.guesses.includes('🏳️') &&
                    !p.guesses.includes('👑') &&
                    !p.guesses.includes('🏆')
                );

                if (syncActivePlayers.length > 0) {
                    const allCompleted = syncActivePlayers.every(p => room.currentGame.syncPlayersCompleted.has(p.id));
                    
                    if (allCompleted) {
                        // 仅同步模式（非血战）：如果有人猜对，本轮完成后直接结束游戏
                        if (!room.currentGame.settings.nonstopMode && room.currentGame.syncWinnerFound) {
                            // 游戏结束，不进入下一轮
                            console.log(`[同步模式] 房间 ${roomId}: 本轮完成，有人猜对，游戏结束`);
                            // 不在这里处理游戏结束，让后续的普通结束逻辑处理
                        } else {
                            // 所有剩余玩家都已完成，进入下一轮
                            room.currentGame.syncRound += 1;
                            room.currentGame.syncPlayersCompleted.clear();
                            io.to(roomId).emit('syncRoundStart', {
                                round: room.currentGame.syncRound
                            });
                            console.log(`[同步模式] 房间 ${roomId}: 玩家结束游戏，第 ${room.currentGame.syncRound} 轮开始`);
                        }
                    } else {
                        // 玩家结束后更新同步状态
                        const syncStatus = syncActivePlayers.map(p => ({
                            id: p.id,
                            username: p.username,
                            completed: room.currentGame.syncPlayersCompleted.has(p.id)
                        }));
                        io.to(roomId).emit('syncWaiting', {
                            round: room.currentGame.syncRound,
                            syncStatus: syncStatus,
                            completedCount: syncStatus.filter(s => s.completed).length,
                            totalCount: syncStatus.length
                        });
                        
                        // 仅同步模式（非血战）：如果有人猜对，阻止其他队开始下一轮猜测
                        if (!room.currentGame.settings.nonstopMode && room.currentGame.syncWinnerFound) {
                            // 通知等待中的玩家游戏即将结束
                            io.to(roomId).emit('syncGameEnding', {
                                winnerUsername: room.currentGame.syncWinner?.username,
                                message: `${room.currentGame.syncWinner?.username} 已猜对！等待本轮结束...`
                            });
                        }
                    }
                } else if (!room.currentGame.settings.nonstopMode && room.currentGame.syncWinnerFound) {
                    // 所有人都结束了且有人猜对，游戏结束逻辑会在后续处理
                    console.log(`[同步模式] 房间 ${roomId}: 所有玩家结束，有人猜对，游戏将结束`);
                }
            }

            // 血战模式：检查是否所有人都结束
            if (room.currentGame && room.currentGame.settings.nonstopMode) {
                const activePlayers = room.players.filter(p => !p.isAnswerSetter && p.team !== '0' && !p.disconnected);
                const remainingPlayers = activePlayers.filter(p => 
                    !p.guesses.includes('✌') && 
                    !p.guesses.includes('💀') && 
                    !p.guesses.includes('🏳️') && 
                    !p.guesses.includes('👑') &&
                    !p.guesses.includes('🏆')
                );

                // 广播血战模式进度（使用记录的实际得分）
                io.to(roomId).emit('nonstopProgress', {
                    winners: (room.currentGame.nonstopWinners || []).map((w, idx) => ({
                        username: w.username,
                        rank: idx + 1,
                        score: w.score || Math.max(1, activePlayers.length - idx) // 优先使用记录的得分
                    })),
                    remainingCount: remainingPlayers.length,
                    totalCount: activePlayers.length
                });

                // 更新玩家列表
                io.to(roomId).emit('updatePlayers', {
                    players: room.players
                });

                // 检查是否所有人都已结束
                if (remainingPlayers.length === 0) {
                    const answerSetter = room.players.find(p => p.isAnswerSetter);
                    const winnersCount = (room.currentGame.nonstopWinners || []).length;
                    const totalPlayersCount = activePlayers.length;
                    
                    let message = '';
                    if (answerSetter) {
                        // 玩家数系数：玩家数/2 向上取整，最小为1
                        const playerMultiplier = Math.max(1, Math.ceil(totalPlayersCount / 2));
                        
                        if (winnersCount === 0) {
                            // 无人猜中，出题人扣分（基础-2 × 系数）
                            const penalty = 2 * playerMultiplier;
                            answerSetter.score -= penalty;
                            message = `【血战模式】无人猜中！出题人 ${answerSetter.username} -${penalty}分！`;
                        } else {
                            // 根据猜对比例计算基础得分
                            const winRate = winnersCount / totalPlayersCount;
                            let baseScore = 0;
                            let scoreReason = '';
                            
                            if (winRate <= 0.25) {
                                // 猜对人数过少（≤25%），太难了
                                baseScore = 1;
                                scoreReason = '难度偏高';
                            } else if (winRate >= 0.75) {
                                // 猜对人数过多（≥75%），太简单了
                                baseScore = 1;
                                scoreReason = '难度偏低';
                            } else {
                                // 猜对人数适中（25%-75%），刚刚好
                                baseScore = 2;
                                scoreReason = '难度适中';
                            }
                            
                            const setterScore = baseScore * playerMultiplier;
                            answerSetter.score += setterScore;
                            const winnerNames = room.currentGame.nonstopWinners.map((w, i) => `${i + 1}. ${w.username}`).join('、');
                            message = `【血战模式】猜对顺序：${winnerNames}。${scoreReason}，出题人 ${answerSetter.username} +${setterScore}分！`;
                        }
                    } else {
                        if (winnersCount > 0) {
                            const winnerNames = room.currentGame.nonstopWinners.map((w, i) => `${i + 1}. ${w.username}`).join('、');
                            message = `【血战模式】猜对顺序：${winnerNames}`;
                        } else {
                            message = `【血战模式】无人猜中！`;
                        }
                    }

                    io.to(roomId).emit('gameEnded', {
                        message,
                        guesses: room.currentGame?.guesses || []
                    });

                    room.players.forEach(p => {
                        p.isAnswerSetter = false;
                    });
                    io.to(roomId).emit('resetReadyStatus');
                    room.currentGame = null;
                    io.to(roomId).emit('updatePlayers', {
                        players: room.players,
                        isPublic: room.isPublic,
                        answerSetterId: null
                    });

                    console.log(`[血战模式] 房间 ${roomId} 游戏结束（玩家失败导致）`);
                }
                return; // 血战模式下不执行后续的普通结束逻辑
            }
    
            // Check if all non-answer-setter players have ended their game or disconnected
            const activePlayers = room.players.filter(p => !p.isAnswerSetter && p.team !== '0');
            const allEnded = activePlayers.every(p => 
                p.guesses.includes('✌') || 
                p.guesses.includes('💀') || 
                p.guesses.includes('🏳️') || 
                p.guesses.includes('👑') ||
                p.guesses.includes('🏆') ||
                p.disconnected
            );
            
            // 使用 firstWinner 来确定真正的胜者（处理并发提交情况）
            const firstWinner = room.currentGame?.firstWinner;
            const bigwinner = firstWinner?.isBigWin 
                ? activePlayers.find(p => p.id === firstWinner.id) || activePlayers.find(p => p.guesses.includes('👑'))
                : activePlayers.find(p => p.guesses.includes('👑'));
            const winner = !bigwinner && firstWinner && !firstWinner.isBigWin
                ? activePlayers.find(p => p.id === firstWinner.id) || activePlayers.find(p => p.guesses.includes('✌'))
                : (!bigwinner ? activePlayers.find(p => p.guesses.includes('✌')) : null);
    
            const handleGameEnd = () => {
                // Get the answer setter before resetting status
                const answerSetter = room.players.find(p => p.isAnswerSetter);
                
                // 使用 firstWinner 的用户名（如果存在）
                const bigwinnerName = bigwinner?.username || firstWinner?.username;
                const winnerName = winner?.username || firstWinner?.username;
    
                // If there was an answer setter (manual mode)
                if (answerSetter) {
                    if (bigwinner) {
                        answerSetter.score -= 3;
                        io.to(roomId).emit('gameEnded', {
                            message: `本命大赢家是: ${bigwinnerName}！出题人 ${answerSetter.username} 纯在送分！`,
                            guesses: room.currentGame?.guesses || []
                        });
                    }
                    else if (winner) {
                        // If winner took many guesses
                        if (winner.guesses.length > 6) {
                            answerSetter.score += 1;
                            io.to(roomId).emit('gameEnded', {
                                message: `赢家是: ${winnerName}！出题人 ${answerSetter.username} 获得1分！`,
                                guesses: room.currentGame?.guesses || []
                            });
                        } else {
                            io.to(roomId).emit('gameEnded', {
                                message: `赢家是: ${winnerName}！`,
                                guesses: room.currentGame?.guesses || []
                            });
                        }
                    } else {
                        // Deduct point from answer setter for no winner
                        answerSetter.score -= 1;
                        io.to(roomId).emit('gameEnded', {
                            message: `已经结束咧🙄！没人猜中，出题人 ${answerSetter.username} 扣1分！`,
                            guesses: room.currentGame?.guesses || []
                        });
                    }
                } else {
                    // Normal mode end messages
                    if (bigwinner) {
                        io.to(roomId).emit('gameEnded', {
                            message: `本命大赢家是: ${bigwinnerName}！`,
                            guesses: room.currentGame?.guesses || []
                        });
                    }
                    else if (winner) {
                        io.to(roomId).emit('gameEnded', {
                            message: `赢家是: ${winnerName}！`,
                            guesses: room.currentGame?.guesses || []
                        });
                    }
                    else {
                        io.to(roomId).emit('gameEnded', {
                            message: `已经结束咧🙄！没人猜中`,
                            guesses: room.currentGame?.guesses || []
                        });
                    }
                }
    
                // Reset answer setter status for all players
                room.players.forEach(p => {
                    p.isAnswerSetter = false;
                });
    
                // Reset ready status
                io.to(roomId).emit('resetReadyStatus');
    
                // Clear current game state
                room.currentGame = null;
    
                // Broadcast updated players to ensure answer setter status is reset
                io.to(roomId).emit('updatePlayers', {
                    players: room.players,
                    isPublic: room.isPublic,
                    answerSetterId: null
                });
            };
    
            if (bigwinner) {
                bigwinner.score += 14;
                if (!bigwinner.guesses.includes('💡')) {
                    bigwinner.score += 1;
                }
                handleGameEnd();
            } else if (winner) {
                winner.score += 2;
                if (!winner.guesses.includes('💡')) {
                    winner.score += 1;
                }
                handleGameEnd();
            } else if (allEnded) {
                handleGameEnd();
            } else {
                // Just broadcast updated players for this individual player's end
                io.to(roomId).emit('updatePlayers', {
                    players: room.players
                });
            }
    
            console.log(`Player ${player.username} ended their game in room ${roomId} with result: ${result}`);
        });
    
        // Handle game settings request
        socket.on('requestGameSettings', ({roomId}) => {
            const room = rooms.get(roomId);
    
            if (!room) {
                console.log(`[ERROR][requestGameSettings][${socket.id}] 房间不存在`);
                socket.emit('error', {message: '房间不存在'});
                return;
            }
    
            // Send current settings to the requesting client
            if (room.settings) {
                socket.emit('updateGameSettings', {settings: room.settings});
                console.log(`Game settings sent to new player in room ${roomId}`);
            }
        });
    
        // Handle timeout event
        socket.on('timeOut', ({roomId}) => {
            const room = rooms.get(roomId);
    
            if (!room) {
                console.log(`[ERROR][timeOut][${socket.id}] 房间不存在`);
                socket.emit('error', {message: 'timeOut: 房间不存在'});
                return;
            }
    
            const player = room.players.find(p => p.id === socket.id);
            if (!player) {
                console.log(`[ERROR][timeOut][${socket.id}] 连接中断了`);
                socket.emit('error', {message: 'timeOut: 连接中断了'});
                return;
            }
    
            // Append ⏱️ to player's guesses
            player.guesses += '⏱️';

            // 同步模式：超时也视为完成本轮
            if (room.currentGame && room.currentGame.settings?.syncMode && room.currentGame.syncPlayersCompleted) {
                room.currentGame.syncPlayersCompleted.add(socket.id);
                
                // 获取所有需要完成本轮的活跃玩家
                const activePlayers = room.players.filter(p => 
                    !p.isAnswerSetter && 
                    p.team !== '0' && 
                    !p.disconnected &&
                    !p.guesses.endsWith('✔')
                );

                if (activePlayers.length > 0) {
                    const syncStatus = activePlayers.map(p => ({
                        id: p.id,
                        username: p.username,
                        completed: room.currentGame.syncPlayersCompleted.has(p.id)
                    }));

                    const allCompleted = activePlayers.every(p => room.currentGame.syncPlayersCompleted.has(p.id));
                    
                    if (allCompleted) {
                        room.currentGame.syncRound += 1;
                        room.currentGame.syncPlayersCompleted.clear();
                        io.to(roomId).emit('syncRoundStart', {
                            round: room.currentGame.syncRound
                        });
                        console.log(`[同步模式] 房间 ${roomId}: 超时后第 ${room.currentGame.syncRound} 轮开始`);
                    } else {
                        io.to(roomId).emit('syncWaiting', {
                            round: room.currentGame.syncRound,
                            syncStatus: syncStatus,
                            completedCount: syncStatus.filter(s => s.completed).length,
                            totalCount: syncStatus.length
                        });
                    }
                }
            }
    
            // Broadcast updated players to all clients in the room
            io.to(roomId).emit('updatePlayers', {
                players: room.players
            });
    
            console.log(`Player ${player.username} timed out in room ${roomId}`);
        });
    
        // Handle disconnection
        socket.on('disconnect', () => {
            // Find and remove player from their room
            for (const [roomId, room] of rooms.entries()) {
                const playerIndex = room.players.findIndex(p => p.id === socket.id);
                
                if (playerIndex !== -1) {
                    const disconnectedPlayer = room.players[playerIndex];
                    // disconnectedPlayer.guesses += '💀';
    
                    if (room.host === socket.id) {
                        // 找出一个新的房主（第一个没有断开连接的玩家）
                        const newHost = room.players.find(p => !p.disconnected && p.id !== socket.id);
                        
                        if (newHost) {
                            // 将房主权限转移给新玩家
                            room.host = newHost.id;
                            // 更新新房主的状态
                            const newHostIndex = room.players.findIndex(p => p.id === newHost.id);
                            if (newHostIndex !== -1) {
                                room.players[newHostIndex].isHost = true;
                            }
                            
                            // 撤销原房主的状态
                            disconnectedPlayer.isHost = false;
                            disconnectedPlayer.disconnected = true;

                            // 通知房间中的所有玩家房主已更换
                            io.to(roomId).emit('hostTransferred', {
                                oldHostName: disconnectedPlayer.username,
                                newHostId: newHost.id,
                                newHostName: newHost.username
                            });
                            
                            // 更新玩家列表
                            io.to(roomId).emit('updatePlayers', {
                                players: room.players,
                                isPublic: room.isPublic
                            });
                            
                            console.log(`Host ${disconnectedPlayer.username} disconnected. New host: ${newHost.username} in room ${roomId}.`);
                        } else {
                            // 如果没有其他玩家可以成为房主，则关闭房间
                            rooms.delete(roomId);
                            io.to(roomId).emit('roomClosed', {message: '房主已断开连接，房间已关闭'});
                            console.log(`Host ${disconnectedPlayer.username} disconnected. Room ${roomId} closed as no available players to transfer ownership.`);
                        }
                    } else {
                        // // Remove player if score is 0, otherwise mark as disconnected
                        // if (disconnectedPlayer.score === 0) {
                        //     room.players.splice(playerIndex, 1);
                        // } else {
                        //     disconnectedPlayer.disconnected = true;
                        // }
                        disconnectedPlayer.disconnected = true;
                        // Update player list for remaining players
                        io.to(roomId).emit('updatePlayers', {
                            players: room.players
                        });
                        console.log(`Player ${disconnectedPlayer.username} ${disconnectedPlayer.score === 0 ? 'removed from' : 'disconnected from'} room ${roomId}.`);

                        // 同步模式：移除断开连接的玩家，并检查是否可以进入下一轮
                        if (room.currentGame && room.currentGame.settings?.syncMode && room.currentGame.syncPlayersCompleted) {
                            room.currentGame.syncPlayersCompleted.delete(socket.id);
                            
                            // 获取所有需要完成本轮的活跃玩家
                            const activePlayers = room.players.filter(p => 
                                !p.isAnswerSetter && 
                                p.team !== '0' && 
                                !p.disconnected &&
                                !p.guesses.endsWith('✔')
                            );

                            if (activePlayers.length > 0) {
                                const allCompleted = activePlayers.every(p => room.currentGame.syncPlayersCompleted.has(p.id));
                                
                                if (allCompleted) {
                                    // 所有剩余玩家都已完成，进入下一轮
                                    room.currentGame.syncRound += 1;
                                    room.currentGame.syncPlayersCompleted.clear();
                                    io.to(roomId).emit('syncRoundStart', {
                                        round: room.currentGame.syncRound
                                    });
                                    console.log(`[同步模式] 房间 ${roomId}: 玩家断开连接，第 ${room.currentGame.syncRound} 轮开始`);
                                } else {
                                    // 玩家离开后更新同步状态
                                    const syncStatus = activePlayers.map(p => ({
                                        id: p.id,
                                        username: p.username,
                                        completed: room.currentGame.syncPlayersCompleted.has(p.id)
                                    }));
                                    io.to(roomId).emit('syncWaiting', {
                                        round: room.currentGame.syncRound,
                                        syncStatus: syncStatus,
                                        completedCount: syncStatus.filter(s => s.completed).length,
                                        totalCount: syncStatus.length
                                    });
                                }
                            }
                        }
                    }
    
                    if (room.currentGame) {
                        // Find all non-disconnected, non-answer-setter players
                        const activePlayers = room.players.filter(p => !p.disconnected && !p.isAnswerSetter && p.team !== '0');
                        // Check if all such players have ended their game
                        const allEnded = activePlayers.every(p =>
                            p.guesses.includes('✌') ||
                            p.guesses.includes('💀') ||
                            p.guesses.includes('🏳️') ||
                            p.guesses.includes('👑') ||
                            p.guesses.includes('🏆')
                        );
                        if (allEnded) {
                            // Find answer setter (if any)
                            const answerSetter = room.players.find(p => p.isAnswerSetter);
                            let message = '';
                            if (answerSetter) {
                                answerSetter.score--;
                                message = `已经结束咧🙄！没人猜中，出题人 ${answerSetter.username} 扣1分！`;
                            } else {
                                message = '已经结束咧🙄！没人猜中';
                            }
                            io.to(roomId).emit('gameEnded', {
                                message,
                                guesses: room.currentGame?.guesses || []
                            });
                            room.players.forEach(p => {
                                p.isAnswerSetter = false;
                            });
                            io.to(roomId).emit('resetReadyStatus');
                            room.currentGame = null;
                            io.to(roomId).emit('updatePlayers', {
                                players: room.players,
                                isPublic: room.isPublic,
                                answerSetterId: null
                            });
                            console.log(`Game in room ${roomId} ended because all active players finished their game (by disconnect or surrender, no winner).`);
                        }
                    }
    
                    break;
                }
            }
    
            console.log(`User ${socket.id} disconnected`);
        });
    
        // Handle room visibility toggle
        socket.on('toggleRoomVisibility', ({roomId}) => {
            const room = rooms.get(roomId);
            if (room) room.lastActive = Date.now();
    
            if (!room) {
                console.log(`[ERROR][toggleRoomVisibility][${socket.id}] 房间不存在`);
                socket.emit('error', {message: 'toggleRoomVisibility: 房间不存在'});
                return;
            }
    
            // Only allow host to toggle visibility
            const player = room.players.find(p => p.id === socket.id);
            if (!player || !player.isHost) {
                console.log(`[ERROR][toggleRoomVisibility][${socket.id}] 只有房主可以更改房间状态`);
                socket.emit('error', {message: 'toggleRoomVisibility: 只有房主可以更改房间状态'});
                return;
            }
    
            // Toggle visibility
            room.isPublic = !room.isPublic;
    
            // Notify all players in the room about the update
            io.to(roomId).emit('updatePlayers', {
                players: room.players,
                isPublic: room.isPublic
            });
    
            console.log(`Room ${roomId} visibility changed to ${room.isPublic ? 'public' : 'private'}`);
        });

        socket.on('updateRoomName', ({roomId, roomName}) => {
            const room = rooms.get(roomId);
            if (room) room.lastActive = Date.now();

            if (!room) {
                console.log(`[ERROR][updateRoomName][${socket.id}] 房间不存在`);
                socket.emit('error', {message: 'updateRoomName: 房间不存在'});
                return;
            }

            const player = room.players.find(p => p.id === socket.id);
            if (!player || !player.isHost) {
                console.log(`[ERROR][updateRoomName][${socket.id}] 只有房主可以修改房名`);
                socket.emit('error', {message: 'updateRoomName: 只有房主可以修改房名'});
                return;
            }

            let normalizedName = '';
            if (typeof roomName === 'string') {
                normalizedName = roomName.trim().slice(0, 30);
            }

            room.roomName = normalizedName;

            io.to(roomId).emit('roomNameUpdated', {
                roomName: normalizedName
            });

            console.log(`Room ${roomId} name updated to ${normalizedName || '(empty)'}`);
        });
    
        // Handle entering manual mode
        socket.on('enterManualMode', ({roomId}) => {
            const room = rooms.get(roomId);
    
            if (!room) {
                console.log(`[ERROR][enterManualMode][${socket.id}] 房间不存在`);
                socket.emit('error', {message: 'enterManualMode: 房间不存在'});
                return;
            }
    
            // Only allow host to enter manual mode
            const player = room.players.find(p => p.id === socket.id);
            if (!player || !player.isHost) {
                console.log(`[ERROR][enterManualMode][${socket.id}] 只有房主可以进入出题模式`);
                socket.emit('error', {message: 'enterManualMode: 只有房主可以进入出题模式'});
                return;
            }
    
            // Set all non-host players as ready
            room.players.forEach(p => {
                if (!p.isHost) {
                    p.ready = true;
                }
            });
    
            // Notify all players in the room about the update
            io.to(roomId).emit('updatePlayers', {
                players: room.players,
                isPublic: room.isPublic
            });
    
            console.log(`Room ${roomId} entered manual mode`);
        });
    
        // Handle setting answer setter
        socket.on('setAnswerSetter', ({roomId, setterId}) => {
            const room = rooms.get(roomId);
    
            if (!room) {
                console.log(`[ERROR][setAnswerSetter][${socket.id}] 房间不存在`);
                socket.emit('error', {message: 'setAnswerSetter: 房间不存在'});
                return;
            }
    
            // Only allow host to set answer setter
            const player = room.players.find(p => p.id === socket.id);
            if (!player || !player.isHost) {
                console.log(`[ERROR][setAnswerSetter][${socket.id}] 只有房主可以选择出题人`);
                socket.emit('error', {message: 'setAnswerSetter: 只有房主可以选择出题人'});
                return;
            }
    
            // Find the selected player
            const setter = room.players.find(p => p.id === setterId);
            if (!setter) {
                console.log(`[ERROR][setAnswerSetter][${socket.id}] 找不到选中的玩家`);
                socket.emit('error', {message: 'setAnswerSetter: 找不到选中的玩家'});
                return;
            }
    
            // Update room state
            room.isPublic = false;
            room.answerSetterId = setterId;
            room.waitingForAnswer = true;
    
            // Notify all players in the room about the update
            io.to(roomId).emit('updatePlayers', {
                players: room.players,
                isPublic: room.isPublic,
                answerSetterId: setterId
            });
    
            // Emit waitForAnswer event
            io.to(roomId).emit('waitForAnswer', {
                answerSetterId: setterId,
                setterUsername: setter.username
            });
    
            console.log(`Answer setter set to ${setter.username} in room ${roomId}`);
        });
    
        // Handle kicking players from room
        socket.on('kickPlayer', ({roomId, playerId}) => {
            const room = rooms.get(roomId);
            if (room) room.lastActive = Date.now();
    
            if (!room) {
                console.log(`[ERROR][kickPlayer][${socket.id}] 房间不存在`);
                socket.emit('error', {message: 'kickPlayer: 房间不存在'});
                return;
            }
    
            // 只允许房主踢出玩家
            const host = room.players.find(p => p.id === socket.id);
            if (!host || !host.isHost) {
                console.log(`[ERROR][kickPlayer][${socket.id}] 只有房主可以踢出玩家`);
                socket.emit('error', {message: 'kickPlayer: 只有房主可以踢出玩家'});
                return;
            }
    
            // 找到要踢出的玩家
            const playerIndex = room.players.findIndex(p => p.id === playerId);
            if (playerIndex === -1) {
                console.log(`[ERROR][kickPlayer][${socket.id}] 找不到要踢出的玩家`);
                socket.emit('error', {message: 'kickPlayer: 找不到要踢出的玩家'});
                return;
            }
    
            const playerToKick = room.players[playerIndex];
            
            // 防止房主踢出自己
            if (playerToKick.id === socket.id) {
                console.log(`[ERROR][kickPlayer][${socket.id}] 无法踢出自己`);
                socket.emit('error', {message: 'kickPlayer: 无法踢出自己'});
                return;
            }
    
            // 保存玩家信息用于通知
            const kickedPlayerUsername = playerToKick.username;
            
            // 从房间中移除玩家前先通知被踢玩家
            io.to(playerId).emit('playerKicked', {
                playerId: playerId,
                username: kickedPlayerUsername
            });
            
            // 延迟一小段时间确保通知送达
            setTimeout(() => {
                try {
                    // 从房间中移除玩家
                    room.players.splice(playerIndex, 1);
                    
                    // 通知房间内其他玩家
                    socket.to(roomId).emit('playerKicked', {
                        playerId: playerId,
                        username: kickedPlayerUsername
                    });
                    
                    // 更新玩家列表
                    io.to(roomId).emit('updatePlayers', {
                        players: room.players,
                        isPublic: room.isPublic
                    });
                    
                    // 将被踢玩家从房间中移除
                    const kickedSocket = io.sockets.sockets.get(playerId);
                    if (kickedSocket) {
                        kickedSocket.leave(roomId);
                    }
                    
                    console.log(`Player ${kickedPlayerUsername} kicked from room ${roomId}`);
                } catch (error) {
                    console.error(`Error kicking player ${kickedPlayerUsername}:`, error);
                }
            }, 300);
        });
    
        // Handle answer setting from designated player
        socket.on('setAnswer', ({roomId, character, hints}) => {
            const room = rooms.get(roomId);
            if (room) room.lastActive = Date.now();
    
            if (!room) {
                console.log(`[ERROR][setAnswer][${socket.id}] 房间不存在`);
                socket.emit('error', {message: 'setAnswer: 房间不存在'});
                return;
            }
    
            // Only allow designated answer setter to set answer
            if (socket.id !== room.answerSetterId) {
                console.log(`[ERROR][setAnswer][${socket.id}] 你不是指定的出题人`);
                socket.emit('error', {message: 'setAnswer: 你不是指定的出题人'});
                return;
            }
    
            // Remove disconnected players with 0 score
            room.players = room.players.filter(p => !p.disconnected || p.score > 0);

            // Store current game state in room data
            room.currentGame = {
                character, // store encrypted character for late joiners
                settings: room.settings,
                guesses: [], // Initialize guesses as an array of objects
                hints: hints || null,
                // 同步模式状态
                syncRound: 0, // 当前同步轮次
                syncPlayersCompleted: new Set(), // 已完成当前轮次猜测的玩家集合
                // 血战模式状态
                nonstopWinners: [], // 按顺序记录猜对的玩家 [{id, username, isBigWin}]
                // 普通模式胜者记录（用于并发提交时确定第一个胜者）
                firstWinner: null // {id, username, isBigWin, timestamp}
            };            // Reset all players' game state and mark the answer setter
            room.players.forEach(p => {
                p.guesses = '';
                p.isAnswerSetter = (p.id === socket.id); // Mark the answer setter
                // Only keep guess history for non-answer-setter and non-observer players
                if (!p.isAnswerSetter && p.team !== '0') {
                    room.currentGame.guesses.push({username: p.username, guesses: []});
                }
            });
    
            // Reset room state
            room.waitingForAnswer = false;
            room.answerSetterId = null;
    
            // Send initial empty guess history to answer setter
            socket.emit('guessHistoryUpdate', {
                guesses: room.currentGame.guesses
            });
    
            // Broadcast game start to all clients in the room
            io.to(roomId).emit('gameStart', {
                character,
                settings: room.settings,
                players: room.players,
                isPublic: room.isPublic,
                isGameStarted: true,
                hints: hints,
                isAnswerSetter: false
            });
    
            // Send special game start event to answer setter
            socket.emit('gameStart', {
                character,
                settings: room.settings,
                players: room.players,
                isPublic: room.isPublic,
                isGameStarted: true,
                hints: hints,
                isAnswerSetter: true
            });
    
            console.log(`Game started in room ${roomId} with custom answer`);
        });
    
        // 添加手动转移房主的功能
        socket.on('transferHost', ({roomId, newHostId}) => {
            const room = rooms.get(roomId);
            if (room) room.lastActive = Date.now();
    
            if (!room) {
                console.log(`[ERROR][transferHost][${socket.id}] 房间不存在`);
                socket.emit('error', {message: 'transferHost: 房间不存在'});
                return;
            }
    
            // 只允许当前房主转移权限
            if (socket.id !== room.host) {
                console.log(`[ERROR][transferHost][${socket.id}] 只有房主可以转移权限`);
                socket.emit('error', {message: 'transferHost: 只有房主可以转移权限'});
                return;
            }
    
            // 确认新房主在房间内
            const newHost = room.players.find(p => p.id === newHostId);
            if (!newHost || newHost.disconnected) {
                console.log(`[ERROR][transferHost][${socket.id}] 无法将房主转移给该玩家`);
                socket.emit('error', {message: 'transferHost: 无法将房主转移给该玩家'});
                return;
            }
    
            // 找到当前房主
            const currentHost = room.players.find(p => p.id === socket.id);
    
            // 更新房主信息
            room.host = newHostId;
    
            // 更新玩家状态
            room.players.forEach(p => {
                p.isHost = p.id === newHostId;
            });
    
            // 通知所有玩家房主已更换
            io.to(roomId).emit('hostTransferred', {
                oldHostName: currentHost.username,
                newHostId: newHost.id,
                newHostName: newHost.username
            });
    
            // 更新玩家列表
            io.to(roomId).emit('updatePlayers', {
                players: room.players,
                isPublic: room.isPublic
            });
    
            console.log(`Host transferred from ${currentHost.username} to ${newHost.username} in room ${roomId}.`);
        });
    
        // Handle player message update
        socket.on('updatePlayerMessage', ({ roomId, message }) => {
            const room = rooms.get(roomId);
            if (!room) {
                console.log(`[ERROR][updatePlayerMessage][${socket.id}] 房间不存在`);
                socket.emit('error', { message: 'updatePlayerMessage: 房间不存在' });
                return;
            }
    
            // Find the player
            const player = room.players.find(p => p.id === socket.id);
            if (!player) {
                console.log(`[ERROR][updatePlayerMessage][${socket.id}] 连接中断了`);
                socket.emit('error', { message: 'updatePlayerMessage: 连接中断了' });
                return;
            }
    
            // Update the player's message
            player.message = message;
    
            // Broadcast updated players to all clients in the room
            io.to(roomId).emit('updatePlayers', {
                players: room.players,
                isPublic: room.isPublic
            });
    
            console.log(`Player ${player.username} updated their message in room ${roomId}: ${message}`);
        });
    
        // Handle player team update
        socket.on('updatePlayerTeam', ({ roomId, team }) => {
            const room = rooms.get(roomId);
            if (!room) {
                console.log(`[ERROR][updatePlayerTeam][${socket.id}] 房间不存在`);
                socket.emit('error', { message: 'updatePlayerTeam: 房间不存在' });
                return;
            }
            // Only allow the player themselves to update their team
            const player = room.players.find(p => p.id === socket.id);
            if (!player) {
                console.log(`[ERROR][updatePlayerTeam][${socket.id}] 连接中断了`);
                socket.emit('error', { message: 'updatePlayerTeam: 连接中断了' });
                return;
            }
            // Accept only null or 0-8 as valid team values
            if (team !== null && !(typeof team === 'string' && /^[0-8]$/.test(team))) {
                console.log(`[ERROR][updatePlayerTeam][${socket.id}] Invalid team value`);
                socket.emit('error', { message: 'updatePlayerTeam: Invalid team value' });
                return;
            }
            player.team = team === '' ? null : team;
            io.to(roomId).emit('updatePlayers', {
                players: room.players,
                isPublic: room.isPublic
            });
            console.log(`Player ${player.username} joined team ${player.team} in room ${roomId}`);
        });
    });
}

module.exports = setupSocket; 