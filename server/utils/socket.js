/**
 * 获取同步模式和血战模式状态
 * @param {Object} room - 房间对象
 * @param {Function} emitCallback - 发送状态的回调函数，接收 (eventName, data) 参数
 */
function getSyncAndNonstopState(room, emitCallback) {
    if (!room?.currentGame) return;

    const isEnded = p => (
        p.guesses.includes('✌') ||
        p.guesses.includes('💀') ||
        p.guesses.includes('🏳️') ||
        p.guesses.includes('👑') ||
        p.guesses.includes('🏆')
    );

    if (room.currentGame?.settings?.syncMode) {
        const syncPlayers = room.players.filter(p => !p.isAnswerSetter && p.team !== '0' && !p.disconnected && !isEnded(p));
        const syncStatus = syncPlayers.map(p => ({
            id: p.id,
            username: p.username,
            completed: room.currentGame.syncPlayersCompleted ? room.currentGame.syncPlayersCompleted.has(p.id) : false
        }));
        
        if (emitCallback) {
            emitCallback('syncWaiting', {
                round: room.currentGame.syncRound,
                syncStatus,
                completedCount: syncStatus.filter(s => s.completed).length,
                totalCount: syncStatus.length
            });

            if (room.currentGame.syncWinnerFound && !room.currentGame?.settings?.nonstopMode) {
                emitCallback('syncGameEnding', {
                    winnerUsername: room.currentGame.syncWinner?.username,
                    message: `${room.currentGame.syncWinner?.username} 已猜对！等待本轮结束...`
                });
            }
        }
    }

    if (room.currentGame.settings?.nonstopMode) {
        const activePlayers = room.players.filter(p => !p.isAnswerSetter && p.team !== '0' && !p.disconnected);
        const remainingPlayers = activePlayers.filter(p => 
            !p.guesses.includes('✌') &&
            !p.guesses.includes('💀') &&
            !p.guesses.includes('🏳️') &&
            !p.guesses.includes('👑') &&
            !p.guesses.includes('🏆')
        );
        
        if (emitCallback) {
            emitCallback('nonstopProgress', {
                winners: (room.currentGame.nonstopWinners || []).map((w, idx) => ({ username: w.username, rank: idx + 1, score: w.score })),
                remainingCount: remainingPlayers.length,
                totalCount: activePlayers.length
            });
        }
    }
}

/**
 * 计算玩家胜利得分
 * @param {Object} options - 计算选项
 * @param {string} options.guesses - 玩家的猜测记录字符串
 * @param {number} options.baseScore - 基础得分（普通/同步模式为 2，血战模式根据排名计算）
 * @param {number} options.totalRounds - 总猜测轮数上限（用于计算快速猜对奖励，默认10）
 * @returns {Object} - { totalScore, guessCount, isBigWin, bonuses: { bigWin, quickGuess } }
 */
function calculateWinnerScore({ guesses, baseScore = 0, totalRounds = 10 }) {
    // 判断是否为 bigwin
    const isBigWin = guesses.includes('👑');
    
    // 计算猜测轮数（去掉提示标记和结束标记）
    // 注意：💡 视为一次有效尝试，不能从计数中剔除
    // 使用 Array.from 正确计算emoji字符数
    const cleaned = guesses.replace(/[✌👑💀🏳️🏆]/g, '');
    const guessCount = Array.from(cleaned).length;
    
    let totalScore = baseScore;
    const bonuses = {
        bigWin: 0,
        quickGuess: 0
    };
    
    // bigwin 奖励（额外 +12 分）
    if (isBigWin) {
        bonuses.bigWin = 12;
        totalScore += bonuses.bigWin;
    }
    
    // 快速猜对奖励
    if (!isBigWin) {
        if (guessCount >= 2 && guessCount <= 3) {
            bonuses.quickGuess = 2;
        } else {
            const halfRounds = Math.ceil(totalRounds / 2);
            if (guessCount >= 4 && guessCount <= halfRounds) {
                bonuses.quickGuess = 1;
            }
        }
    }
    totalScore += bonuses.quickGuess;
    
    return { totalScore, guessCount, isBigWin, bonuses };
}

/**
 * 计算出题人得分（普通/同步模式）
 * @param {Object} options - 计算选项
 * @param {string} options.winnerGuesses - 胜者的猜测记录字符串（用于判断是否 bigwin，无胜者时传空字符串）
 * @param {number} options.winnerGuessCount - 胜者猜测次数（无胜者时传0）
 * @param {number} options.bigWinnerScore - bigwinner 的得分（用于计算扣分，默认0）
 * @param {number} options.totalRounds - 总猜测轮数上限（默认10）
 * @returns {Object} - { score, reason }
 */
function calculateSetterScore({ winnerGuesses = '', winnerGuessCount = 0, bigWinnerScore = 0, totalRounds = 10 }) {
    const hasWinner = winnerGuessCount > 0;
    const hasBigWinner = winnerGuesses.includes('👑');
    
    if (hasBigWinner) {
        // bigwinner 扣分为 bigwinner 得分的 1/2，向下取整，最少扣1分
        const penalty = Math.max(1, Math.floor(bigWinnerScore / 2));
        return { score: -penalty, reason: '纯在送分' };
    }
    
    if (hasWinner) {
        // 前三轮猜对太简单
        if (winnerGuessCount <= 3) {
            return { score: -1, reason: '太简单了' };
        } else if (winnerGuessCount > totalRounds / 2) {
            // 超过一半轮数才猜对，难度适中
            return { score: 1, reason: '难度适中' };
        }
        return { score: 0, reason: '' };
    }
    
    // 无人猜中
    return { score: -1, reason: '没人猜中' };
}

/**
 * 计算血战模式出题人得分
 * @param {Object} options - 计算选项
 * @param {boolean} options.hasBigWinner - 是否有本命大赢家
 * @param {number} options.bigWinnerScore - bigwinner 的得分（用于计算扣分）
 * @param {number} options.winnersCount - 猜对的玩家数量
 * @param {number} options.totalPlayersCount - 总活跃玩家数量
 * @returns {Object} - { score, reason }
 */
function calculateNonstopSetterScore({ hasBigWinner = false, bigWinnerScore = 0, winnersCount = 0, totalPlayersCount = 1 }) {
    const TotalPlayers = Math.max(1, totalPlayersCount);
    // 玩家数系数：玩家数/2 向上取整，最小为1
    const playerMultiplier = Math.max(1, Math.ceil(TotalPlayers / 2));
    
    if (hasBigWinner) {
        // 有 bigwinner，扣分为 bigwinner 得分的 1/2，向下取整，最少扣1分
        const penalty = Math.max(1, Math.floor(bigWinnerScore / 2));
        return { score: -penalty, reason: '纯在送分' };
    }
    
    if (winnersCount === 0) {
        // 无人猜中，出题人扣分（基础-2 × 系数）
        const penalty = 2 * playerMultiplier;
        return { score: -penalty, reason: '无人猜中' };
    }
    
    // 根据猜对比例计算基础得分
    const winRate = winnersCount / TotalPlayers;
    let baseScore = 0;
    let reason = '';
    
    if (winRate <= 0.25) {
        // 猜对人数过少（≤25%），太难了
        baseScore = 1;
        reason = '难度偏高';
    } else if (winRate >= 0.75) {
        // 猜对人数过多（≥75%），太简单了
        baseScore = 1;
        reason = '难度偏低';
    } else {
        // 猜对人数适中（25%-75%），刚刚好
        baseScore = 2;
        reason = '难度适中';
    }
    
    const score = baseScore * playerMultiplier;
    return { score, reason };
}

/**
 * 结算阶段：根据猜测历史计算“作品分(💡)”应归属给谁。
 * 规则：每个队伍最多 1 分；无队伍玩家各自独立；优先给“最早在自己记录里出现💡的玩家”（无全局时间戳时的稳定近似）。
 * 注意：该函数只负责确定归属，不负责加分。
 * @param {Object} room
 * @returns {Set<string>} playerId 集合
 */
function computePartialAwardeesFromGuessHistory(room) {
    const awardees = new Set();
    if (!room?.currentGame || !Array.isArray(room.currentGame.guesses)) {
        return awardees;
    }

    const playersById = new Map((room.players || []).map(p => [p.id, p]));
    const firstPartialIndexByPlayer = new Map();

    // room.currentGame.guesses: [{ username, guesses: [{ playerId, isPartialCorrect, isCorrect, ... }, ...] }, ...]
    room.currentGame.guesses.forEach(playerGuesses => {
        const list = Array.isArray(playerGuesses?.guesses) ? playerGuesses.guesses : [];
        list.forEach((g, idx) => {
            if (!g || !g.playerId) return;
            if (g.isPartialCorrect && !g.isCorrect) {
                if (!firstPartialIndexByPlayer.has(g.playerId)) {
                    firstPartialIndexByPlayer.set(g.playerId, idx);
                }
            }
        });
    });

    // 每个队伍/个人选一个最佳归属
    const bestByGroup = new Map();
    firstPartialIndexByPlayer.forEach((idx, playerId) => {
        const p = playersById.get(playerId);
        if (!p) return;
        if (p.isAnswerSetter) return;
        if (p.team === '0') return; // 观察者不计入

        const groupKey = p.team ? `team:${p.team}` : `solo:${playerId}`;
        const current = bestByGroup.get(groupKey);
        const username = String(p.username || '');
        if (!current || idx < current.idx || (idx === current.idx && username.localeCompare(current.username) < 0)) {
            bestByGroup.set(groupKey, { playerId, idx, username });
        }
    });

    bestByGroup.forEach(v => awardees.add(v.playerId));
    return awardees;
}

// Team utilities: append marks to teammates and notify team win
function appendMarkToTeam(room, teamId, mark) {
    if (!room || !room.currentGame) return;
    room.players
        .filter(p => p.team === teamId && p.team !== '0' && !p.isAnswerSetter && !p.disconnected)
        .forEach(teammate => {
            teammate.guesses += mark;
        });
}

function applySetterObservers(room, roomId, setterId, io) {
    if (!room) return;
    const setter = room.players.find(p => p.id === setterId);
    if (!setter || !setter.team || setter.team === '0') return;

    room.players.forEach(p => {
        if (p.team === setter.team && p.id !== setterId && !p.isAnswerSetter && !p.disconnected) {
            if (p._prevTeam === undefined) p._prevTeam = p.team;
            p.team = '0';
            p.ready = false;
            p._tempObserver = true;
        }
    });

    io.to(roomId).emit('updatePlayers', { players: room.players,
                    answerSetterId: room.answerSetterId });
}

function revertSetterObservers(room, roomId, io) {
    if (!room) return;
    let changed = false;
    room.players.forEach(p => {
        if (p._tempObserver) {
            p.team = (p._prevTeam !== undefined) ? p._prevTeam : null;
            delete p._prevTeam;
            delete p._tempObserver;
            // p.ready = false; // Keep ready status
            changed = true;
        }
    });
    if (changed && io) {
        io.to(roomId).emit('updatePlayers', { players: room.players });
    }
}

function markTeamVictory(room, roomId, player, io) {
    if (!room || !room.currentGame || !player) return;
    // ensure teamGuesses is updated so later re-joiners can see the team victory
    if (room.currentGame) {
        room.currentGame.teamGuesses = room.currentGame.teamGuesses || {};
    }
    const teamId = player.team;
    if (teamId && teamId !== '0') {
        if (!String(room.currentGame.teamGuesses[teamId] || '').includes('🏆')) {
            room.currentGame.teamGuesses[teamId] = (room.currentGame.teamGuesses[teamId] || '') + '🏆';
        }
    }

    // mark teammates as spectators and winners
    const teamMembers = room.players.filter(p => p.team === player.team && p.id !== player.id && !p.isAnswerSetter && !p.disconnected);
    teamMembers.forEach(teammate => {
        // append 🏆 if not present
        if (!teammate.guesses.includes('🏆')) {
            teammate.guesses += '🏆';
        }
        // set teammate to observer to prevent further guessing, but mark as temp so it can be reverted
        if (teammate._prevTeam === undefined) teammate._prevTeam = teammate.team;
        // teammate.team = '0'; // Keep original team for scoring
        teammate._tempObserver = true;
        // teammate.ready = false; // Keep ready status
        if (room.currentGame.syncPlayersCompleted) {
            room.currentGame.syncPlayersCompleted.delete(teammate.id);
        }
        io.to(teammate.id).emit('teamWin', {
            winnerName: player.username,
            message: `队友 ${player.username} 已猜对！`
        });
        console.log(`[TEAM WIN] ${teammate.username} 的队友 ${player.username} 猜对，标记为队伍胜利并设为观战`);
    });

    // Also set the winner to observer (consistent behavior), mark as temp
    // 只有在非血战模式且开启了同步模式下，才将胜者转为旁观，防止其继续猜测
    if (!room.currentGame?.settings?.nonstopMode && room.currentGame?.settings?.syncMode) {
        if (player && (!player.team || player.team !== '0')) {
            if (player._prevTeam === undefined) player._prevTeam = player.team;
            // player.team = '0'; // Keep original team for scoring
            player._tempObserver = true;
            // player.ready = false; // Keep ready status
        }
    }

    // Broadcast updated player list
    io.to(roomId).emit('updatePlayers', { players: room.players });
}

// 同步模式：统一处理进度更新与轮次推进，支持血战模式
function updateSyncProgress(room, roomId, io) {
    if (!io) return;
    if (!room?.currentGame || !room.currentGame?.settings?.syncMode || !room.currentGame.syncPlayersCompleted) return;

    // 只保留本轮需要同步的活跃玩家（未结束）
    const isEnded = p => (
        p.guesses.includes('✌') ||
        p.guesses.includes('💀') ||
        p.guesses.includes('🏳️') ||
        p.guesses.includes('👑') ||
        p.guesses.includes('🏆')
    );
    const syncPlayers = room.players.filter(p =>
        !p.isAnswerSetter &&
        p.team !== '0' &&
        !p.disconnected &&
        !isEnded(p)
    );

    if (syncPlayers.length === 0) {
        return;
    }

    // 只在本轮将本轮超时玩家视为完成
    syncPlayers.forEach(p => {
        if (typeof p.syncCompletedRound === 'number' && p.syncCompletedRound === room.currentGame.syncRound) {
            room.currentGame.syncPlayersCompleted.add(p.id);
        }
    });

    const syncStatus = syncPlayers.map(p => ({
        id: p.id,
        username: p.username,
        completed: room.currentGame.syncPlayersCompleted.has(p.id)
    }));

    const allCompleted = syncStatus.every(s => s.completed);
    let pendingBanBroadcast = null;

    if (allCompleted) {
        if (room.currentGame?.settings?.syncMode && Array.isArray(room.currentGame.tagBanStatePending) && room.currentGame.tagBanStatePending.length) {
            const currentState = Array.isArray(room.currentGame.tagBanState) ? room.currentGame.tagBanState : [];
            const existingTags = new Set(
                currentState
                    .filter(item => item && typeof item.tag === 'string')
                    .map(item => item.tag)
            );

            const pendingNewEntries = room.currentGame.tagBanStatePending
                .filter(entry => entry && typeof entry.tag === 'string')
                .map(entry => {
                    const tagName = entry.tag.trim();
                    if (!tagName || existingTags.has(tagName)) {
                        return null;
                    }
                    existingTags.add(tagName);
                    const revealers = Array.isArray(entry.revealer)
                        ? Array.from(new Set(entry.revealer.filter(Boolean)))
                        : [];
                    return { tag: tagName, revealer: revealers };
                })
                .filter(Boolean);

            if (pendingNewEntries.length) {
                const updatedState = currentState.concat(pendingNewEntries);
                room.currentGame.tagBanState = updatedState;
                pendingBanBroadcast = updatedState;
            } else {
                room.currentGame.tagBanState = currentState;
            }

            room.currentGame.tagBanStatePending = [];
        }

        if (pendingBanBroadcast) {
            io.to(roomId).emit('tagBanStateUpdate', {
                tagBanState: pendingBanBroadcast
            });
            pendingBanBroadcast = null;
        }

        // 非血战同步模式：有人猜对则在本轮结束后结束游戏，不再开启新一轮
        if (!room.currentGame?.settings?.nonstopMode && room.currentGame?.syncWinnerFound) {
            if (pendingBanBroadcast) {
                io.to(roomId).emit('tagBanStateUpdate', { tagBanState: pendingBanBroadcast });
                pendingBanBroadcast = null;
            }
            room.currentGame.syncReadyToEnd = true;
            io.to(roomId).emit('syncWaiting', {
                round: room.currentGame.syncRound,
                syncStatus,
                completedCount: syncStatus.length,
                totalCount: syncStatus.length
            });
            io.to(roomId).emit('syncGameEnding', {
                winnerUsername: room.currentGame.syncWinner?.username,
                message: `${room.currentGame.syncWinner?.username} 已猜对！等待本轮结束...`
            });
            finalizeStandardGame(room, roomId, io, { force: true });
            return;
        }

        // 开启下一同步轮次
        room.currentGame.syncReadyToEnd = false;
        room.currentGame.syncRound += 1;
        room.currentGame.syncPlayersCompleted.clear();
        // 清理所有玩家的超时完成标记，确保新一轮不会被误判
        room.players.forEach(p => {
            if (typeof p.syncCompletedRound === 'number') {
                delete p.syncCompletedRound;
            }
        });

        // 同步+血战：记录本轮开始的排名基线，确保同轮玩家基础分一致
        if (room.currentGame?.settings?.nonstopMode) {
            room.currentGame.syncRoundStartRank = room.currentGame.nonstopWinners.length + 1;
        }


        // 下一轮：只保留未结束玩家
        const nextSyncPlayers = room.players.filter(p =>
            !p.isAnswerSetter &&
            p.team !== '0' &&
            !p.disconnected &&
            !isEnded(p)
        );

        // 下一轮初始化完成状态（通常为空集合）
        const nextSyncStatus = nextSyncPlayers.map(p => ({
            id: p.id,
            username: p.username,
            completed: room.currentGame.syncPlayersCompleted.has(p.id)
        }));

        io.to(roomId).emit('syncRoundStart', {
            round: room.currentGame.syncRound
        });

        io.to(roomId).emit('syncWaiting', {
            round: room.currentGame.syncRound,
            syncStatus: nextSyncStatus,
            completedCount: nextSyncStatus.filter(s => s.completed).length,
            totalCount: nextSyncStatus.length
        });
    } else {
        io.to(roomId).emit('syncWaiting', {
            round: room.currentGame.syncRound,
            syncStatus,
            completedCount: syncStatus.filter(s => s.completed).length,
            totalCount: syncStatus.length
        });

        // 非血战同步模式：有人已猜对，提示等待本轮结束
        if (!room.currentGame?.settings?.nonstopMode && room.currentGame?.syncWinnerFound) {
            io.to(roomId).emit('syncGameEnding', {
                winnerUsername: room.currentGame.syncWinner?.username,
                message: `${room.currentGame.syncWinner?.username} 已猜对！等待本轮结束...`
            });
        }
    }
}

/**
 * 生成游戏结束统计详情
 * @param {Object} options - 生成选项
 * @param {Array} options.players - 房间玩家列表
 * @param {Object} options.scoreChanges - 本轮得分变化 { odlayerId: { score, breakdown, result } }
 * @param {Object} options.setterInfo - 出题人信息 { username, score, reason } 或 null
 * @param {boolean} options.isNonstopMode - 是否为血战模式
 * @returns {Array} - 统计详情数组
 */
function generateScoreDetails({ players, scoreChanges, setterInfo, isNonstopMode = false }) {
    // 收集活跃玩家（排除观察者）
    const activePlayers = players.filter(p => p.team !== '0');
    
    // 按队伍分组
    const teamMap = new Map();
    const noTeamPlayers = [];
    
    activePlayers.forEach(p => {
        if (p.isAnswerSetter) return; // 出题人单独处理
        
        const change = scoreChanges[p.id] || { score: 0, breakdown: {}, result: '' };
        const playerInfo = {
            id: p.id,
            username: p.username,
            team: p.team,
            score: change.score,
            breakdown: change.breakdown,
            result: change.result
        };
        
        if (p.team && p.team !== '' && p.team !== '0') {
            if (!teamMap.has(p.team)) {
                teamMap.set(p.team, []);
            }
            teamMap.get(p.team).push(playerInfo);
        } else {
            noTeamPlayers.push(playerInfo);
        }
    });
    
    const details = [];
    
    // 处理队伍
    teamMap.forEach((members, teamId) => {
        if (members.length > 1) {
            // 多人队伍，显示团队总分
            const teamScore = members.reduce((sum, m) => sum + (m.score || 0), 0);
            details.push({
                type: 'team',
                teamId,
                teamScore,
                members
            });
        } else {
            // 单人队伍，作为个人显示
            noTeamPlayers.push(members[0]);
        }
    });
    
    // 添加无队伍玩家
    noTeamPlayers.forEach(p => {
        details.push({
            type: 'player',
            ...p
        });
    });
    
    // 添加出题人
    if (setterInfo) {
        details.push({
            type: 'setter',
            username: setterInfo.username,
            score: setterInfo.score,
            reason: setterInfo.reason
        });
    }
    
    return details;
}

/**
 * 结算普通/同步模式的游戏结果，可用于玩家事件或同步流程强制结束
 * @param {Object} room
 * @param {string} roomId
 * @param {import('socket.io').Server} io
 * @param {Object} options
 * @param {boolean} options.force - 是否强制结算（绕过同步等待）
 * @returns {boolean} 是否已经结算完成
 */
function finalizeStandardGame(room, roomId, io, { force = false } = {}) {
    if (!room?.currentGame || room.currentGame?.settings?.nonstopMode) {
        return false;
    }

    if (room.currentGame?.settings?.syncMode) {
        const pendingList = Array.isArray(room.currentGame.tagBanStatePending)
            ? room.currentGame.tagBanStatePending
            : [];
        let tagBanChanged = false;
        if (pendingList.length) {
            if (!Array.isArray(room.currentGame.tagBanState)) {
                room.currentGame.tagBanState = [];
            }
            pendingList.forEach(entry => {
                if (!entry || typeof entry.tag !== 'string') return;
                const tagName = entry.tag.trim();
                if (!tagName) return;
                const revealerList = Array.isArray(entry.revealer) ? entry.revealer.filter(Boolean) : [];
                let targetEntry = room.currentGame.tagBanState.find(item => item && item.tag === tagName);
                if (!targetEntry) {
                    targetEntry = { tag: tagName, revealer: [] };
                    room.currentGame.tagBanState.push(targetEntry);
                    tagBanChanged = true;
                }
                const existingSet = new Set(Array.isArray(targetEntry.revealer) ? targetEntry.revealer : []);
                const initialSize = existingSet.size;
                revealerList.forEach(id => existingSet.add(id));
                const mergedRevealers = Array.from(existingSet);
                if (!Array.isArray(targetEntry.revealer) || mergedRevealers.length !== initialSize) {
                    targetEntry.revealer = mergedRevealers;
                    tagBanChanged = true;
                }
            });
            room.currentGame.tagBanStatePending = [];
            if (tagBanChanged) {
                io.to(roomId).emit('tagBanStateUpdate', {
                    tagBanState: Array.isArray(room.currentGame.tagBanState) ? room.currentGame.tagBanState : []
                });
            }
        }
    }

    const activePlayers = room.players.filter(p => !p.isAnswerSetter && (p.team !== '0' || p._tempObserver));
    const allEnded = activePlayers.every(p =>
        p.guesses.includes('✌') ||
        p.guesses.includes('💀') ||
        p.guesses.includes('🏳️') ||
        p.guesses.includes('👑') ||
        p.guesses.includes('🏆') ||
        p.disconnected
    );

    if (!room.currentGame) {
        console.log(`[ERROR][finalizeStandardGame][${roomId}] 游戏未开始或已结束`);
        return false;
    }

    const firstWinner = room.currentGame.firstWinner;
    const syncMode = room.currentGame?.settings?.syncMode && !room.currentGame?.settings?.nonstopMode;

    // 同步模式：允许同轮多名胜者；普通模式保持单胜者
    let actualWinners = [];
    if (syncMode) {
        actualWinners = activePlayers.filter(p => p.guesses.includes('✌') || p.guesses.includes('👑'));
    } else {
        const answerId = room.currentGame?.character?.id;
        let bigwinner = firstWinner?.isBigWin
            ? activePlayers.find(p => p.id === firstWinner.id) || activePlayers.find(p => p.guesses.includes('👑'))
            : activePlayers.find(p => p.guesses.includes('👑'));
        if (!bigwinner && answerId) {
            const avatarBigWinner = activePlayers.find(p => (p.guesses.includes('✌') || p.guesses.includes('👑')) && String(p.avatarId) === String(answerId));
            if (avatarBigWinner) {
                bigwinner = avatarBigWinner;
                if (!avatarBigWinner.guesses.includes('👑')) avatarBigWinner.guesses = avatarBigWinner.guesses.replace('✌','') + '👑';
            }
        }
        let winner = !bigwinner && firstWinner && !firstWinner.isBigWin
            ? activePlayers.find(p => p.id === firstWinner.id) || activePlayers.find(p => p.guesses.includes('✌'))
            : (!bigwinner ? activePlayers.find(p => p.guesses.includes('✌')) : null);
        const actualWinner = bigwinner || winner;
        if (actualWinner) actualWinners = [actualWinner];
    }

    const actualWinner = actualWinners[0] || null;
    const totalRounds = room.currentGame?.settings?.maxAttempts || 10;
    const shouldWaitForSyncRound = syncMode && actualWinner && !allEnded && !room.currentGame.syncReadyToEnd && !force;

    if (actualWinner && shouldWaitForSyncRound) {
        io.to(roomId).emit('updatePlayers', {
            players: room.players
        });
        return false;
    }

    if (!actualWinner && !allEnded) {
        return false;
    }

    const answerSetter = room.players.find(p => p.isAnswerSetter);

    // 结算阶段统一计算作品分（每队/个人最多+1）
    const partialAwardees = computePartialAwardeesFromGuessHistory(room);

    // 计算胜者得分
    const winnerScoreResults = {};
    let primaryWinner = actualWinners.find(p => p.id === firstWinner?.id) || actualWinners[0] || null;
    let sharedScoreResult = null;
    let sharedDetailResult = null;

    if (syncMode && primaryWinner) {
        // 同步模式：所有胜者同分，使用代表胜者计算
        sharedScoreResult = calculateWinnerScore({
            guesses: primaryWinner.guesses,
            baseScore: 2, // 统一基础分 2，bigwin 额外 +12 => 总 14
            totalRounds
        });
        sharedDetailResult = calculateWinnerScore({ guesses: primaryWinner.guesses, baseScore: 0, totalRounds });
        actualWinners.forEach(w => {
            w.score += sharedScoreResult.totalScore;
            winnerScoreResults[w.id] = {
                totalScore: sharedScoreResult.totalScore,
                guessCount: sharedDetailResult.guessCount,
                bonuses: sharedScoreResult.bonuses
            };
        });
    } else {
        // 非同步模式：逐个胜者计分
        actualWinners.forEach(w => {
            const baseScore = 2; // 统一基础分 2，bigwin 额外 +12 => 总 14
            const scoreResult = calculateWinnerScore({ guesses: w.guesses, baseScore, totalRounds });
            w.score += scoreResult.totalScore;
            winnerScoreResults[w.id] = scoreResult;
        });
        primaryWinner = primaryWinner || actualWinners[0] || null;
        sharedDetailResult = primaryWinner ? calculateWinnerScore({ guesses: primaryWinner.guesses, baseScore: 0, totalRounds }) : null;
    }

    // 给非胜者发放作品分（胜者/大赢家不叠加作品分）
    const winnerIdSet = new Set((actualWinners || []).map(w => w.id));
    (room.players || []).forEach(p => {
        if (!p || p.isAnswerSetter) return;
        if (p.team === '0') return;
        if (winnerIdSet.has(p.id)) return;
        if (partialAwardees.has(p.id)) {
            p.score += 1;
        }
    });

    const winnerGuessCount = sharedDetailResult?.guessCount || 0;

    // 出题人扣分用的 bigwinner 分数：同步模式取代表胜者分数是否为本命，否则取最大本命分
    let bigWinnerActualScore = 0;
    if (syncMode && primaryWinner && primaryWinner.guesses.includes('👑') && sharedScoreResult) {
        bigWinnerActualScore = sharedScoreResult.totalScore;
    } else {
        actualWinners.filter(p => p.guesses.includes('👑')).forEach(p => {
            const res = calculateWinnerScore({ guesses: p.guesses, baseScore: 2, totalRounds }).totalScore;
            bigWinnerActualScore = Math.max(bigWinnerActualScore, res);
        });
    }

        const scoreChanges = buildScoreChanges({
            players: room.players,
            actualWinners,
            winnerScoreResults,
            partialAwardees,
            isNonstopMode: false
        });

    if (answerSetter) {
        const setterResult = calculateSetterScore({
            winnerGuesses: primaryWinner?.guesses || '',
            winnerGuessCount,
            bigWinnerScore: bigWinnerActualScore,
            totalRounds
        });

        answerSetter.score += setterResult.score;

        const scoreDetails = generateScoreDetails({
            players: room.players,
            scoreChanges,
            setterInfo: { username: answerSetter.username, score: setterResult.score, reason: setterResult.reason },
            isNonstopMode: false
        });

        io.to(roomId).emit('gameEnded', {
            guesses: room.currentGame?.guesses || [],
            scoreDetails
        });
    } else {
        const scoreDetails = generateScoreDetails({
            players: room.players,
            scoreChanges,
            setterInfo: null,
            isNonstopMode: false
        });

        io.to(roomId).emit('gameEnded', {
            guesses: room.currentGame?.guesses || [],
            scoreDetails
        });
    }

    // Revert any teammates that were temporarily set as observers when a setter was chosen
    revertSetterObservers(room, roomId, io);

    room.players.forEach(p => {
        p.isAnswerSetter = false;
    });

    // Players who joined during the previous game should no longer be spectators by default
    // and must explicitly ready up to participate in the next game.
    room.players.forEach(p => {
        if (p.joinedDuringGame) {
            p.team = null;
            p.joinedDuringGame = false;
            p.ready = false;
        }
    });

    // io.to(roomId).emit('resetReadyStatus'); // Keep ready status
    room.currentGame = null;
    io.to(roomId).emit('updatePlayers', {
        players: room.players,
        isPublic: room.isPublic,
        answerSetterId: null
    });

    console.log(`[普通模式] 房间 ${roomId} 游戏结束${force ? '（同步强制结算）' : ''}`);
    return true;
}

/**
 * 生成玩家得分变化详情（统一处理血战模式和普通模式）
 * @param {Object} options - 生成选项
 * @param {Array} options.players - 房间玩家列表
 * @param {Object} options.actualWinner - 实际胜者玩家对象（普通模式），可为 null
 * @param {Object} options.winnerScoreResult - 胜者得分计算结果（普通模式）
 * @param {Array} options.nonstopWinners - 血战模式胜者列表 [{ id, username, score, ... }]
 * @param {boolean} options.isNonstopMode - 是否为血战模式
 * @returns {Object} - scoreChanges 对象 { playerId: { score, breakdown, result } }
 */
function buildScoreChanges({ players, actualWinner, actualWinners, winnerScoreResult, winnerScoreResults, nonstopWinners, partialAwardees, isNonstopMode }) {
    const scoreChanges = {};
    const activePlayers = players.filter(p => !p.isAnswerSetter && (p.team !== '0' || p._tempObserver));
    
    if (isNonstopMode) {
        // 血战模式：根据 nonstopWinners 列表生成得分
        const winners = nonstopWinners || [];
        const winnerIds = new Set(winners.map(w => w.id));
        
        winners.forEach((w, idx) => {
            const winnerPlayer = players.find(p => p.id === w.id);
            const isBigWin = winnerPlayer && winnerPlayer.guesses.includes('👑');

            // 基础分取排名分：totalScore - 奖励
            const bonuses = w.bonuses || {};
            const bigWinBonus = bonuses.bigWin || (isBigWin ? 12 : 0);
            const quickGuessBonus = bonuses.quickGuess || 0;
            const baseScore = Math.max(0, (w.score ?? 0) - bigWinBonus - quickGuessBonus);

            scoreChanges[w.id] = {
                score: w.score,
                breakdown: {
                    rank: idx + 1,
                    base: baseScore,
                    ...(bigWinBonus ? { bigWin: bigWinBonus } : {}),
                    ...(quickGuessBonus ? { quickGuess: quickGuessBonus } : {})
                },
                result: isBigWin ? 'bigwin' : 'win'
            };
        });
        
        // 标记失败的玩家（作品分在结算阶段统一发放）
        activePlayers.filter(p => !winnerIds.has(p.id)).forEach(p => {
            const lastChar = p.guesses.slice(-1);
            const hasPartial = !!partialAwardees && partialAwardees.has(p.id);
            scoreChanges[p.id] = {
                score: hasPartial ? 1 : 0,
                breakdown: hasPartial ? { partial: 1 } : {},
                result: lastChar === '💀' ? 'lose' : lastChar === '🏳️' ? 'surrender' : ''
            };
        });
    } else {
        // 普通/同步模式：支持多名胜者（同步模式），否则单胜者
        const winnerList = actualWinners && actualWinners.length ? actualWinners : (actualWinner ? [actualWinner] : []);
        const winnerIdSet = new Set(winnerList.map(w => w.id));

        activePlayers.forEach(p => {
            if (winnerIdSet.has(p.id)) {
                const res = (winnerScoreResults && winnerScoreResults[p.id]) || winnerScoreResult;
                scoreChanges[p.id] = {
                    score: res?.totalScore || 0,
                    breakdown: {
                        base: 2,
                        ...res?.bonuses
                    },
                    result: p.guesses.includes('👑') ? 'bigwin' : 'win'
                };
            } else {
                const lastChar = p.guesses.slice(-1);
                const hasPartial = !!partialAwardees && partialAwardees.has(p.id);
                scoreChanges[p.id] = {
                    score: hasPartial ? 1 : 0,
                    breakdown: hasPartial ? { partial: 1 } : {},
                    result: { '🏆': 'teamwin', '💀': 'lose', '🏳️': 'surrender' }[lastChar] || ''
                };
            }
        });
    }
    
    return scoreChanges;
}

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
                    disconnected: false,
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
                        disconnected: false,
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

            // Check if game is in progress - if so, only allow joining as observer
            if (room.currentGame) {
                console.log(`[INFO][joinRoom][${socket.id}] 房间 ${roomId} 游戏进行中，新玩家只能观战`);
            }
    
            // Check for existing player with same username (case-insensitive)
            const existingPlayerIndex = room.players.findIndex(
                player => player.username.toLowerCase() === username.toLowerCase()
            );
    
            if (existingPlayerIndex !== -1) {
                const existingPlayer = room.players[existingPlayerIndex];
                
                // If the existing player is disconnected, allow reconnection
                if (existingPlayer.disconnected) {
                    console.log(`Player ${username} reconnecting to room ${roomId}`);
                    
                    // Update the disconnected player's socket ID
                    const previousSocketId = room.players[existingPlayerIndex].id;
                    room.players[existingPlayerIndex].id = socket.id;
                    room.players[existingPlayerIndex].disconnected = false;
                    
                    // Update avatar if provided
                    if (avatarId !== undefined) {
                        room.players[existingPlayerIndex].avatarId = avatarId;
                    }
                    if (avatarImage !== undefined) {
                        room.players[existingPlayerIndex].avatarImage = avatarImage;
                    }
                    
                    if (room.currentGame) {
                        const replaceRevealerId = (list) => {
                            if (!Array.isArray(list) || !previousSocketId) return;
                            list.forEach(entry => {
                                if (!entry || !Array.isArray(entry.revealer)) return;
                                let updated = false;
                                const merged = [];
                                entry.revealer.forEach(id => {
                                    const nextId = id === previousSocketId ? socket.id : id;
                                    if (!merged.includes(nextId)) {
                                        merged.push(nextId);
                                    }
                                    if (nextId !== id) {
                                        updated = true;
                                    }
                                });
                                if (updated) {
                                    entry.revealer = merged;
                                }
                            });
                        };
                        replaceRevealerId(room.currentGame.tagBanState);
                        replaceRevealerId(room.currentGame.tagBanStatePending);
                    }
                    
                    // Join socket to room
                    socket.join(roomId);
                    
                    // Send updated player list to all clients in room
                    io.to(roomId).emit('updatePlayers', {
                    players: room.players,
                    isPublic: room.isPublic,
                    answerSetterId: room.answerSetterId
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
                            guesses: room.currentGame.guesses,
                            teamGuesses: room.currentGame.teamGuesses
                        });

                        socket.emit('tagBanStateUpdate', {
                            tagBanState: Array.isArray(room.currentGame.tagBanState) ? room.currentGame.tagBanState : []
                        });

                        getSyncAndNonstopState(room, (eventName, data) => {
                            socket.emit(eventName, data);
                        });

                        // If their team already won while they were disconnected, backfill their guess string and notify
                        if (existingPlayer.team && existingPlayer.team !== '0') {
                            const teamId = existingPlayer.team;
                            // Determine if team has won: check teamGuesses, room players, or nonstopWinners
                            const teamGuessesStr = room.currentGame.teamGuesses && room.currentGame.teamGuesses[teamId] ? String(room.currentGame.teamGuesses[teamId]) : '';
                            const teammateHasWin = room.players.some(p => p.team === teamId && (p.guesses.includes('✌') || p.guesses.includes('👑') || p.guesses.includes('🏆')));
                            const nonstopTeamWinner = Array.isArray(room.currentGame.nonstopWinners) && room.currentGame.nonstopWinners.some(w => w.team === teamId);

                            if (teamGuessesStr.includes('🏆') || teammateHasWin || nonstopTeamWinner) {
                                // ensure teamGuesses contains the marker
                                if (room.currentGame) {
                                    room.currentGame.teamGuesses = room.currentGame.teamGuesses || {};
                                    if (!String(room.currentGame.teamGuesses[teamId] || '').includes('🏆')) {
                                        room.currentGame.teamGuesses[teamId] = (room.currentGame.teamGuesses[teamId] || '') + '🏆';
                                    }
                                }

                                // backfill player's guesses and remove from sync waiting if present
                                existingPlayer.guesses = room.currentGame.teamGuesses[teamId];
                                if (room.currentGame.syncPlayersCompleted) {
                                    room.currentGame.syncPlayersCompleted.delete(existingPlayer.id);
                                }

                                // notify rejoined player and update everyone
                                socket.emit('teamWin', {
                                    winnerName: (room.players.find(p => p.team === teamId && (p.guesses.includes('✌') || p.guesses.includes('👑') || p.guesses.includes('🏆')))?.username) ||
                                        ((room.currentGame.nonstopWinners && room.currentGame.nonstopWinners.find(w => w.team === teamId))?.username) || '队友',
                                    message: `队友 已猜对！正在为你标记为队伍胜利`
                                });

                                io.to(roomId).emit('updatePlayers', { players: room.players });
                            }
                        }
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
                    !player.disconnected &&
                    player.avatarId !== undefined && 
                    String(player.avatarId) !== '0' && 
                    String(player.avatarId) === String(avatarId)
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
                team: room.currentGame ? '0' : null, // joiners during an active game become observers
                joinedDuringGame: !!room.currentGame, // mark that this player joined during an on-going game
                disconnected: false,
                ...(avatarId !== undefined && { avatarId }),
                ...(avatarImage !== undefined && { avatarImage })
            });
    
            // Join socket to room
            socket.join(roomId);
    
            // Send updated player list to all clients in room
            io.to(roomId).emit('updatePlayers', {
                    players: room.players,
                    isPublic: room.isPublic,
                    answerSetterId: room.answerSetterId
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
                    guesses: room.currentGame.guesses,
                    teamGuesses: room.currentGame.teamGuesses
                });

                socket.emit('tagBanStateUpdate', {
                    tagBanState: Array.isArray(room.currentGame.tagBanState) ? room.currentGame.tagBanState : []
                });

                getSyncAndNonstopState(room, (eventName, data) => {
                    socket.emit(eventName, data);
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

            // Don't allow toggling ready status if game is in progress
            if (room.currentGame) {
                console.log(`[ERROR][toggleReady][${socket.id}] 游戏进行中不能更改准备状态`);
                socket.emit('error', {message: 'toggleReady: 游戏进行中不能更改准备状态'});
                return;
            }
    
            // Toggle ready status
            player.ready = !player.ready;
    
            // Notify all players in the room about the update
            io.to(roomId).emit('updatePlayers', {
                players: room.players,
                answerSetterId: room.answerSetterId
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
                teamGuesses: {}, // 团队共享的猜测记录字符串（按 teamId 存储）
                hints: null, // 提示信息（如果使用）
                // 同步模式状态
                syncRound: 1, // 当前同步轮次，从第一轮开始
                syncPlayersCompleted: new Set(), // 已完成当前轮次猜测的玩家集合
                syncWinnerFound: false, // 当前轮是否已有玩家猜对（普通同步模式）
                syncWinner: null, // 记录猜对的玩家信息
                syncReadyToEnd: false, // 当前轮已完成且准备结算（纯同步模式）
                syncRoundStartRank: 1, // 同步模式+血战模式：当前轮开始时的排名（用于确保同轮玩家得分一致）
                // 血战模式状态
                nonstopWinners: [], // 按顺序记录猜对的玩家 [{id, username, isBigWin}]
                // 普通模式胜者记录（用于并发提交时确定第一个胜者）
                firstWinner: null, // {id, username, isBigWin, timestamp}
                // tagBan：记录共享标签的揭示者列表
                tagBanState: [],
                tagBanStatePending: []
            };
    
            // Reset all players' game state
            room.players.forEach(p => {
                p.guesses = '';
                // Only keep guess history for non-answer-setter and non-observer players
                if (!p.isAnswerSetter && p.team !== '0') {
                    room.currentGame.guesses.push({username: p.username, guesses: []});
                }
            });
            // Initialize team shared guess strings
            if (room.currentGame) {
                room.currentGame.teamGuesses = room.currentGame.teamGuesses || {};
                room.players.forEach(p => {
                    if (p.team && p.team !== '0' && !(p.team in room.currentGame.teamGuesses)) {
                        room.currentGame.teamGuesses[p.team] = '';
                    }
                });
            }
    
            // Broadcast game start and updated players to all clients in the room in a single event
            io.to(roomId).emit('gameStart', {
                character,
                settings,
                players: room.players,
                isPublic: room.isPublic,
                isGameStarted: true
            });

            io.to(roomId).emit('tagBanStateUpdate', {
                tagBanState: Array.isArray(room.currentGame.tagBanState) ? room.currentGame.tagBanState : []
            });

            // 同步模式：开局同步初始等待状态
            if (room.currentGame.settings?.syncMode) {
                updateSyncProgress(room, roomId, io);
            }
    
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

            // Prevent ended players (including team winners) and spectators from guessing
            const hasEnded = player.guesses.includes('✌') || player.guesses.includes('👑') || player.guesses.includes('💀') || player.guesses.includes('🏳️') || player.guesses.includes('🏆');
            if (player.team === '0') {
                socket.emit('error', { message: 'playerGuess: 观战中不能猜测' });
                return;
            }
            if (hasEnded) {
                console.log(`[INFO][playerGuess][${socket.id}] 玩家已结束本轮，忽略猜测`);
                return;
            }
    
            // Reject guesses from spectators
            if (player.team === '0') {
                socket.emit('error', { message: 'playerGuess: 观战中不能猜测' });
                return;
            }

            // Check globalPick mode: reject if character already guessed by others
            const settings = room.currentGame?.settings || {};
            if (settings.globalPick && !settings.syncMode && guessResult.guessData) {
                const characterId = guessResult.guessData.id;
                const isCorrectAnswer = guessResult.isCorrect;
                const isPartialCorrect = guessResult.isPartialCorrect;

                // Check if any other player has already guessed this character
                const alreadyGuessed = room.currentGame.guesses.some(playerGuesses => {
                    if (playerGuesses.username === player.username) return false;
                    return Array.isArray(playerGuesses.guesses) && playerGuesses.guesses.some(guessEntry =>
                        guessEntry?.guessData?.id === characterId
                    );
                });

                if (alreadyGuessed) {
                    // Allow only if it's the correct answer in nonstop mode
                    if (!settings.nonstopMode || !isCorrectAnswer) {
                        socket.emit('error', { message: '【全局BP】该角色已经被其他玩家猜过了' });
                        return;
                    }
                }
            }

            // Store guess in the player's guesses array using their username
            if (room.currentGame) {
                const playerGuesses = room.currentGame.guesses.find(g => g.username === player.username);
                if (playerGuesses) {
                    const guessEntry = {
                        playerId: socket.id,
                        playerName: player.username,
                        ...guessResult
                    };
                    playerGuesses.guesses.push(guessEntry);

                    // Send real-time guess history update to all relevant players (self, teammates, answer setter, observers, temp observers)
                    room.players.forEach(targetPlayer => {
                        if (targetPlayer.id === socket.id || targetPlayer.isAnswerSetter || targetPlayer.team === '0' || targetPlayer.team === player.team || targetPlayer._tempObserver) {
                            io.to(targetPlayer.id).emit('guessHistoryUpdate', {
                                guesses: room.currentGame.guesses,
                                teamGuesses: room.currentGame.teamGuesses
                            });
                        }
                    });
                }
            }
    
            // Team guess sharing: broadcast guessData to teammates, observers, and answerSetter (not self)
            if (guessResult.guessData) {
                // rawTags 需要可序列化传输
                const serializedGuessData = { ...guessResult.guessData };
                if (serializedGuessData.rawTags instanceof Map) {
                    serializedGuessData.rawTags = Array.from(serializedGuessData.rawTags.entries());
                }

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
                        guessData: { ...serializedGuessData, guessrName: player.username },
                        playerId: socket.id,
                        playerName: player.username
                    });
                });
            }
    
            // Update player's guesses string (team members share the same guess string)
            // 作品分(💡)仅记录，计分在结算阶段统一处理，避免漏记/重复/同步状态扰动
            let mark;
            if (!guessResult.isCorrect && guessResult.isPartialCorrect) {
                mark = '💡';
            } else {
                mark = guessResult.isCorrect ? '✔' : '❌';
            }

            if (!room.currentGame) {
                console.log(`[INFO][playerGuess][${socket.id}] 游戏未开始或已结束，忽略猜测`);
                return;
            }

            if (player.team && player.team !== '0') {
                // ensure teamGuesses exists and append mark
                room.currentGame.teamGuesses = room.currentGame.teamGuesses || {};
                room.currentGame.teamGuesses[player.team] = (room.currentGame.teamGuesses[player.team] || '') + mark;
                // set team members' guesses to the shared team string (including current player)
                room.players
                    .filter(p => p.team === player.team && !p.isAnswerSetter && !p.disconnected)
                    .forEach(teammate => {
                        teammate.guesses = room.currentGame.teamGuesses[player.team];
                    });

                // 在同步模式下，若团队的有效猜测次数已达最大轮数，立即将整队标记为已结束并禁止继续猜测
                if (room.currentGame?.settings?.syncMode) {
                    const maxAttempts = room.currentGame?.settings?.maxAttempts || 10;
                    // 统计团队有效尝试次数（去除特殊结尾标记）
                    const cleanedTeam = String(room.currentGame.teamGuesses[player.team] || '').replace(/[✌👑💀🏳️🏆]/g, '');
                    const teamAttemptCount = Array.from(cleanedTeam).length;
                    if (teamAttemptCount >= maxAttempts) {
                        // 标记队伍中所有活跃成员为完成（追加失败标记，若尚未标记）
                        room.players
                            .filter(p => p.team === player.team && !p.isAnswerSetter && !p.disconnected)
                            .forEach(teammate => {
                                const hasEnded = teammate.guesses.includes('✌') || teammate.guesses.includes('👑') || teammate.guesses.includes('🏆') || teammate.guesses.includes('💀') || teammate.guesses.includes('🏳️');
                                if (!hasEnded) {
                                    teammate.guesses += '💀';
                                }
                                if (room.currentGame.syncPlayersCompleted) {
                                    room.currentGame.syncPlayersCompleted.add(teammate.id);
                                }
                            });

                        // 更新同步进度（会触发轮次推进或结算）
                        updateSyncProgress(room, roomId, io);
                    }
                }
            } else {
                player.guesses += mark;
            }

            // 同步模式：标记完成并统一更新进度
            if (room.currentGame && room.currentGame.settings?.syncMode && room.currentGame.syncPlayersCompleted) {
                if (!guessResult.isCorrect) {
                    room.currentGame.syncPlayersCompleted.add(socket.id);
                    // if team, also mark teammates as completed for this round if appropriate (votes/attempts are shared)
                    if (player.team && player.team !== '0') {
                        room.players
                            .filter(p => p.team === player.team && p.id !== socket.id && !p.isAnswerSetter && !p.disconnected)
                            .forEach(teammate => {
                                room.currentGame.syncPlayersCompleted.add(teammate.id);
                            });
                    }
                }
                updateSyncProgress(room, roomId, io);
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

        socket.on('tagBanSharedMetaTags', ({ roomId, tags }) => {
            const room = rooms.get(roomId);
            if (room) room.lastActive = Date.now();
            if (!room || !room.currentGame || !room.currentGame.settings?.tagBan) {
                return;
            }

            const player = room.players.find(p => p.id === socket.id);
            if (!player) {
                return;
            }

            if (!Array.isArray(tags) || !tags.length) {
                return;
            }
            
            if (!Array.isArray(room.currentGame.tagBanState)) {
                room.currentGame.tagBanState = [];
            }
            if (!Array.isArray(room.currentGame.tagBanStatePending)) {
                room.currentGame.tagBanStatePending = [];
            }

            const targetList = room.currentGame?.settings?.syncMode
                ? room.currentGame.tagBanStatePending
                : room.currentGame.tagBanState;

            let changed = false;
            tags.forEach(tagName => {
                if (room.currentGame.tagBanState.find(entry => entry && entry.tag === tagName)) {
                    return;
                }
                let entry = targetList.find(item => item && item.tag === tagName);
                if (!entry) {
                    entry = { tag: tagName, revealer: [] };
                    targetList.push(entry);
                    changed = true;
                }
                const existingRevealers = Array.isArray(entry.revealer) ? entry.revealer : [];
                if (!existingRevealers.length) {
                    entry.revealer = [player.id];
                    changed = true;
                } else if (room.currentGame?.settings?.syncMode && !existingRevealers.includes(player.id)) {
                    entry.revealer = [...existingRevealers, player.id];
                }
            });

            if (!changed || room.currentGame?.settings?.syncMode) {
                return;
            }

            io.to(roomId).emit('tagBanStateUpdate', {
                tagBanState: Array.isArray(room.currentGame.tagBanState) ? room.currentGame.tagBanState : []
            });
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

            // 自动识别首猜即中为大赢家
            const rawGuessCount = Array.from(player.guesses.replace(/[✌👑💀🏳️🏆]/g, '')).length;
            if (!isBigWin && rawGuessCount === 1) {
                isBigWin = true;
            }

            // 更新玩家状态（先更新，确保后续过滤正确）
            player.guesses += isBigWin ? '👑' : '✌';

            // 同步模式：胜者不再参与当前同步轮次
            if (room.currentGame.syncPlayersCompleted) {
                room.currentGame.syncPlayersCompleted.delete(socket.id);
            }

            // Mark teammates as team winners (automatic team victory)
            if (player.team && player.team !== '0') {
                markTeamVictory(room, roomId, player, io);
            }

            // 同步+血战：胜者所在队伍本轮视为已完成，不再参与后续轮次
            if (room.currentGame?.settings?.syncMode && room.currentGame.syncPlayersCompleted) {
                room.currentGame.syncPlayersCompleted.add(socket.id);
                if (player.team && player.team !== '0') {
                    room.players
                        .filter(p => p.team === player.team && p.id !== socket.id && !p.isAnswerSetter && !p.disconnected)
                        .forEach(teammate => {
                            room.currentGame.syncPlayersCompleted.add(teammate.id);
                        });
                }
                updateSyncProgress(room, roomId, io);
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
            // 同步+血战模式：使用本轮开始时的排名确保同轮玩家得分一致
            // 非同步血战模式：使用实时排名
            const totalPlayers = activePlayers.length;
            let winnerRank, rankScore;
            if (room.currentGame?.settings?.syncMode) {
                // 同步+血战：本轮所有猜中玩家基础分一致
                winnerRank = room.currentGame.syncRoundStartRank;
                rankScore = Math.max(1, totalPlayers - winnerRank + 1);
            } else {
                // 非同步血战：实时排名
                winnerRank = room.currentGame.nonstopWinners.length + 1;
                rankScore = Math.max(1, totalPlayers - winnerRank + 1);
            }
            
            // 获取总轮数上限
            const totalRounds = room.currentGame?.settings?.maxAttempts || 10;
            
            // 使用统一的得分计算函数
            const scoreResult = calculateWinnerScore({
                guesses: player.guesses,
                baseScore: rankScore,
                totalRounds: totalRounds
            });
            const score = scoreResult.totalScore;
            
            // 先计算好分数，再加分和记录
            // 作品分(💡)不再在游戏过程中即时加分，因此胜者不需要扣除
            player.score += score;
            console.log(`[血战模式调试] ${player.username}(id=${socket.id}) 得分计算: totalPlayers=${totalPlayers}, winnerRank=${winnerRank}, guessCount=${scoreResult.guessCount}, isBigWin=${isBigWin}, bonuses=${JSON.stringify(scoreResult.bonuses)}, score=${score}, newScore=${player.score}`);

            // 记录猜对的玩家（包含得分和奖励明细，便于前端展示）
            room.currentGame.nonstopWinners.push({
                id: socket.id,
                username: player.username,
                isBigWin: isBigWin,
                team: player.team,
                score: score, // 总分
                bonuses: scoreResult.bonuses
            });

            getSyncAndNonstopState(room, (eventName, data) => {
                io.to(roomId).emit(eventName, data);
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

                // 结算阶段统一计算作品分（每队/个人最多+1，胜者不叠加）
                const partialAwardees = computePartialAwardeesFromGuessHistory(room);
                const winnerIds = new Set((room.currentGame.nonstopWinners || []).map(w => w.id));
                (room.players || []).forEach(p => {
                    if (!p || p.isAnswerSetter) return;
                    if (p.team === '0') return;
                    if (winnerIds.has(p.id)) return;
                    if (partialAwardees.has(p.id)) {
                        p.score += 1;
                    }
                });
                
                // 检查是否有 bigwinner 并获取其得分
                const bigWinnerData = (room.currentGame.nonstopWinners || []).find(w => {
                    const winnerPlayer = room.players.find(p => p.id === w.id);
                    return winnerPlayer && winnerPlayer.guesses.includes('👑');
                });
                const hasBigWinner = !!bigWinnerData;
                const bigWinnerScore = bigWinnerData?.score || 0;

                // 生成得分详情
                const scoreChanges = buildScoreChanges({
                    isNonstopMode: true,
                    nonstopWinners: room.currentGame.nonstopWinners,
                    partialAwardees,
                    players: room.players
                });

                if (answerSetter) {
                    // 使用统一函数计算出题人得分
                    const setterResult = calculateNonstopSetterScore({
                        hasBigWinner,
                        bigWinnerScore,
                        winnersCount,
                        totalPlayersCount
                    });
                    
                    answerSetter.score += setterResult.score;
                    
                    const scoreDetails = generateScoreDetails({
                        players: room.players,
                        scoreChanges,
                        setterInfo: { username: answerSetter.username, score: setterResult.score, reason: setterResult.reason },
                        isNonstopMode: true
                    });
                    
                    io.to(roomId).emit('gameEnded', {
                        guesses: room.currentGame?.guesses || [],
                        scoreDetails
                    });
                } else {
                    const scoreDetails = generateScoreDetails({
                        players: room.players,
                        scoreChanges,
                        setterInfo: null,
                        isNonstopMode: true
                    });
                    
                    io.to(roomId).emit('gameEnded', {
                        guesses: room.currentGame?.guesses || [],
                        scoreDetails
                    });
                }

                // 重置状态
                // Revert teammates that were temporarily set as observers
                revertSetterObservers(room, roomId, io);
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
    
            // 自动识别首猜即中为大赢家
            const rawGuessCount = Array.from(player.guesses.replace(/[✌👑💀🏳️🏆]/g, '')).length;
            const shouldAutoBigWin = result === 'win' && rawGuessCount === 1 && !player.guesses.includes('👑');
            const finalResult = shouldAutoBigWin ? 'bigwin' : result;

            // Update player's guesses string
            switch (finalResult) {
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
                        if (!room.currentGame?.settings?.nonstopMode) {
                            // 检查是否所有活跃玩家（非出题人、非旁观）都已经结束
                            const activePlayers = room.players.filter(p => !p.disconnected && !p.isAnswerSetter && p.team !== '0');
                            const allEnded = activePlayers.every(p =>
                                p.guesses.includes('✌') ||
                                p.guesses.includes('💀') ||
                                p.guesses.includes('🏳️') ||
                                p.guesses.includes('👑') ||
                                p.guesses.includes('🏆')
                            );

                            if (allEnded) {
                                // 所有人结束，触发游戏结束
                                finalizeStandardGame(room, roomId, io);
                            } else if (player.team && player.team !== '0') {
                                // 队友胜利
                                markTeamVictory(room, roomId, player, io);
                            }
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
                        if (!room.currentGame?.settings?.nonstopMode) {
                            // 检查是否所有活跃玩家（非出题人、非旁观）都已经结束
                            const activePlayers = room.players.filter(p => !p.disconnected && !p.isAnswerSetter && p.team !== '0');
                            const allEnded = activePlayers.every(p =>
                                p.guesses.includes('✌') ||
                                p.guesses.includes('💀') ||
                                p.guesses.includes('🏳️') ||
                                p.guesses.includes('👑') ||
                                p.guesses.includes('🏆')
                            );

                            if (allEnded) {
                                // 所有人结束，触发游戏结束
                                finalizeStandardGame(room, roomId, io);
                            } else if (player.team && player.team !== '0') {
                                // 队友胜利
                                markTeamVictory(room, roomId, player, io);
                            }
                        }
                    break;
                default:
                    player.guesses += '💀';
                        if (player.team !== null && player.team !== '0') {
                            if (room.currentGame) {
                                room.currentGame.teamGuesses = room.currentGame.teamGuesses || {};
                                room.currentGame.teamGuesses[player.team] = (room.currentGame.teamGuesses[player.team] || '') + '💀';
                                room.players
                                    .filter(p => p.team === player.team && !p.isAnswerSetter && !p.disconnected)
                                    .forEach(teammate => {
                                        teammate.guesses = room.currentGame.teamGuesses[player.team];
                                    });
                            }
                        }
            }

            // 仅同步模式（非血战）：有人猜对后，标记游戏即将结束，等待本轮完成
            if (room.currentGame?.settings?.syncMode && !room.currentGame?.settings?.nonstopMode) {
                if (finalResult === 'win' || finalResult === 'bigwin') {
                    // 标记有人猜对，游戏将在本轮结束后结束
                    room.currentGame.syncWinnerFound = true;
                    room.currentGame.syncWinner = {
                        id: socket.id,
                        username: player.username,
                        isBigWin: finalResult === 'bigwin'
                    };
                }
            }

            // 同步模式：已结束玩家/队伍标记完成并更新进度
            if (room.currentGame?.settings?.syncMode && room.currentGame?.syncPlayersCompleted) {
                // 纯同步：赢家也视为完成；失败/投降同样完成
                if (!room.currentGame?.settings?.nonstopMode) {
                    room.currentGame.syncPlayersCompleted.add(socket.id);
                } else {
                    // 同步+血战：本轮胜者及其队伍本轮完成，不再进入下一轮
                    room.currentGame.syncPlayersCompleted.add(socket.id);
                    if (player.team && player.team !== '0') {
                        room.players
                            .filter(p => p.team === player.team && p.id !== player.id && !p.isAnswerSetter && !p.disconnected)
                            .forEach(teammate => {
                                room.currentGame.syncPlayersCompleted.add(teammate.id);
                            });
                    }
                }

                // 状态变更后立即同步玩家列表
                io.to(roomId).emit('updatePlayers', {
                    players: room.players
                });

                updateSyncProgress(room, roomId, io);
            }

            // 血战模式：检查是否所有人都结束
            if (room.currentGame?.settings?.nonstopMode) {
                getSyncAndNonstopState(room, (eventName, data) => {
                    io.to(roomId).emit(eventName, data);
                });

                // 更新玩家列表
                io.to(roomId).emit('updatePlayers', {
                    players: room.players
                });

                const activePlayers = room.players.filter(p => !p.isAnswerSetter && p.team !== '0' && !p.disconnected);
                const remainingPlayers = activePlayers.filter(p => 
                    !p.guesses.includes('✌') && 
                    !p.guesses.includes('💀') && 
                    !p.guesses.includes('🏳️') && 
                    !p.guesses.includes('👑') &&
                    !p.guesses.includes('🏆')
                );

                // 检查是否所有人都已结束
                if (remainingPlayers.length === 0) {
                    const answerSetter = room.players.find(p => p.isAnswerSetter);
                    const winnersCount = (room.currentGame.nonstopWinners || []).length;
                    const totalPlayersCount = activePlayers.length;

                    // 结算阶段统一计算作品分（每队/个人最多+1，胜者不叠加）
                    const partialAwardees = computePartialAwardeesFromGuessHistory(room);
                    const winnerIds = new Set((room.currentGame.nonstopWinners || []).map(w => w.id));
                    (room.players || []).forEach(p => {
                        if (!p || p.isAnswerSetter) return;
                        if (p.team === '0') return;
                        if (winnerIds.has(p.id)) return;
                        if (partialAwardees.has(p.id)) {
                            p.score += 1;
                        }
                    });
                    
                    // 检查是否有 bigwinner 并获取其得分
                    const bigWinnerData = (room.currentGame.nonstopWinners || []).find(w => {
                        const winnerPlayer = room.players.find(p => p.id === w.id);
                        return winnerPlayer && winnerPlayer.guesses.includes('👑');
                    });
                    const hasBigWinner = !!bigWinnerData;
                    const bigWinnerScore = bigWinnerData?.score || 0;

                    // 生成得分详情
                    const scoreChanges = buildScoreChanges({
                        isNonstopMode: true,
                        nonstopWinners: room.currentGame.nonstopWinners || [],
                        partialAwardees,
                        players: room.players
                    });

                    if (answerSetter) {
                        // 使用统一函数计算出题人得分
                        const setterResult = calculateNonstopSetterScore({
                            hasBigWinner,
                            bigWinnerScore,
                            winnersCount,
                            totalPlayersCount
                        });
                        
                        answerSetter.score += setterResult.score;
                        
                        const scoreDetails = generateScoreDetails({
                            players: room.players,
                            scoreChanges,
                            setterInfo: { username: answerSetter.username, score: setterResult.score, reason: setterResult.reason },
                            isNonstopMode: true
                        });
                        
                        io.to(roomId).emit('gameEnded', {
                            guesses: room.currentGame?.guesses || [],
                            scoreDetails
                        });
                    } else {
                        const scoreDetails = generateScoreDetails({
                            players: room.players,
                            scoreChanges,
                            setterInfo: null,
                            isNonstopMode: true
                        });
                        
                        io.to(roomId).emit('gameEnded', {
                            guesses: room.currentGame?.guesses || [],
                            scoreDetails
                        });
                    }

                    // Revert teammates that were temporarily set as observers
                    revertSetterObservers(room, roomId, io);
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
    
            const gameFinished = finalizeStandardGame(room, roomId, io);
            if (!gameFinished) {
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

            if (!room.currentGame) {
                console.log(`[ERROR][timeOut][${socket.id}] 游戏未开始或已结束`);
                socket.emit('error', {message: 'timeOut: 游戏未开始或已结束'});
                return;
            }
    
            // Append ⏱️ to player's guesses
            player.guesses += '⏱️';

            // 团队模式：更新团队猜测记录并检查是否达到最大尝试次数
            if (player.team && player.team !== '0') {
                room.currentGame.teamGuesses = room.currentGame.teamGuesses || {};
                room.currentGame.teamGuesses[player.team] = (room.currentGame.teamGuesses[player.team] || '') + '⏱️';
                room.players
                    .filter(p => p.team === player.team && !p.isAnswerSetter && !p.disconnected)
                    .forEach(teammate => {
                        teammate.guesses = room.currentGame.teamGuesses[player.team];
                    });

                // 通知队友重置计时器，避免多次超时
                room.players
                    .filter(p => p.team === player.team && p.id !== socket.id && !p.isAnswerSetter && !p.disconnected)
                    .forEach(teammate => {
                        io.to(teammate.id).emit('resetTimer');
                    });

                // 在同步模式下，若团队的有效猜测次数已达最大轮数，立即将整队标记为已结束并禁止继续猜测
                if (room.currentGame?.settings?.syncMode) {
                    const maxAttempts = room.currentGame?.settings?.maxAttempts || 10;
                    const cleanedTeam = String(room.currentGame.teamGuesses[player.team] || '').replace(/[✌👑💀🏳️🏆]/g, '');
                    const teamAttemptCount = Array.from(cleanedTeam).length;
                    if (teamAttemptCount >= maxAttempts) {
                        room.players
                            .filter(p => p.team === player.team && !p.isAnswerSetter && !p.disconnected)
                            .forEach(teammate => {
                                const hasEnded = teammate.guesses.includes('✌') || teammate.guesses.includes('👑') || teammate.guesses.includes('🏆') || teammate.guesses.includes('💀') || teammate.guesses.includes('🏳️');
                                if (!hasEnded) {
                                    teammate.guesses += '💀';
                                }
                                if (room.currentGame.syncPlayersCompleted) {
                                    room.currentGame.syncPlayersCompleted.add(teammate.id);
                                }
                            });
                        updateSyncProgress(room, roomId, io);
                    }
                }
            }

            // 同步模式：超时也视为完成本轮
            if (room.currentGame.settings?.syncMode && room.currentGame.syncPlayersCompleted) {
                const hasEnded = player.guesses.includes('✌') || player.guesses.includes('💀') || player.guesses.includes('🏳️') || player.guesses.includes('👑') || player.guesses.includes('🏆');
                if (!hasEnded) {
                    room.currentGame.syncPlayersCompleted.add(socket.id);
                    player.syncCompletedRound = room.currentGame.syncRound;
                }
                updateSyncProgress(room, roomId, io);
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
                                // 新房主可能之前已准备（ready=true），但房主无法取消准备，会导致无法更换队伍
                                room.players[newHostIndex].ready = false;
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

                        // If the disconnected player was the designated answer setter waiting to set the answer,
                        // clear the waiting state so the room won't be blocked.
                        if (room.answerSetterId && room.answerSetterId === disconnectedPlayer.id) {
                            room.answerSetterId = null;
                            room.waitingForAnswer = false;
                            // revert any teammates that were set to observers due to setter selection
                            revertSetterObservers(room, roomId, io);
                            io.to(roomId).emit('waitForAnswerCanceled', { message: `指定的出题人 ${disconnectedPlayer.username} 已离开，等待被取消` });
                            console.log(`[INFO] 指定出题人 ${disconnectedPlayer.username} 在房间 ${roomId} 离开，已取消等待状态`);
                        }

                        // Update player list for remaining players
                        io.to(roomId).emit('updatePlayers', {
                            players: room.players
                        });
                        console.log(`Player ${disconnectedPlayer.username} ${disconnectedPlayer.score === 0 ? 'removed from' : 'disconnected from'} room ${roomId}.`);

                        // 同步模式：移除断开连接的玩家，并检查是否可以进入下一轮
                        if (room.currentGame && room.currentGame.settings?.syncMode && room.currentGame.syncPlayersCompleted) {
                            room.currentGame.syncPlayersCompleted.delete(socket.id);
                            // 统一用 updateSyncProgress 处理所有同步队列推进逻辑，避免边界遗漏
                            updateSyncProgress(room, roomId, io);
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
                            const isNonstopMode = room.currentGame?.settings?.nonstopMode;

                            if (isNonstopMode) {
                                const answerSetter = room.players.find(p => p.isAnswerSetter);
                                const winnersCount = (room.currentGame.nonstopWinners || []).length;
                                const totalPlayersCount = activePlayers.length;

                                const partialAwardees = computePartialAwardeesFromGuessHistory(room);
                                const winnerIds = new Set((room.currentGame.nonstopWinners || []).map(w => w.id));
                                (room.players || []).forEach(p => {
                                    if (!p || p.isAnswerSetter) return;
                                    if (p.team === '0') return;
                                    if (winnerIds.has(p.id)) return;
                                    if (partialAwardees.has(p.id)) {
                                        p.score += 1;
                                    }
                                });
                                
                                const bigWinnerData = (room.currentGame.nonstopWinners || []).find(w => {
                                    const winnerPlayer = room.players.find(p => p.id === w.id);
                                    return winnerPlayer && winnerPlayer.guesses.includes('👑');
                                });
                                const hasBigWinner = !!bigWinnerData;
                                const bigWinnerScore = bigWinnerData?.score || 0;

                                const scoreChanges = buildScoreChanges({
                                    isNonstopMode: true,
                                    nonstopWinners: room.currentGame.nonstopWinners || [],
                                    partialAwardees,
                                    players: room.players
                                });

                                if (answerSetter) {
                                    const setterResult = calculateNonstopSetterScore({
                                        hasBigWinner,
                                        bigWinnerScore,
                                        winnersCount,
                                        totalPlayersCount
                                    });
                                    
                                    answerSetter.score += setterResult.score;
                                    
                                    const scoreDetails = generateScoreDetails({
                                        players: room.players,
                                        scoreChanges,
                                        setterInfo: { username: answerSetter.username, score: setterResult.score, reason: setterResult.reason },
                                        isNonstopMode: true
                                    });
                                    
                                    io.to(roomId).emit('gameEnded', {
                                        guesses: room.currentGame?.guesses || [],
                                        scoreDetails
                                    });
                                } else {
                                    const scoreDetails = generateScoreDetails({
                                        players: room.players,
                                        scoreChanges,
                                        setterInfo: null,
                                        isNonstopMode: true
                                    });
                                    
                                    io.to(roomId).emit('gameEnded', {
                                        guesses: room.currentGame?.guesses || [],
                                        scoreDetails
                                    });
                                }

                                revertSetterObservers(room, roomId, io);
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

                                console.log(`[血战模式] 房间 ${roomId} 游戏结束（玩家断开连接导致）`);
                            } else {
                                const answerSetter = room.players.find(p => p.isAnswerSetter);

                                const partialAwardees = computePartialAwardeesFromGuessHistory(room);
                                (room.players || []).forEach(p => {
                                    if (!p || p.isAnswerSetter) return;
                                    if (p.team === '0') return;
                                    if (partialAwardees.has(p.id)) {
                                        p.score += 1;
                                    }
                                });
                                
                                const scoreChanges = buildScoreChanges({
                                    isNonstopMode: false,
                                    actualWinners: [],
                                    winnerScoreResults: {},
                                    partialAwardees,
                                    players: room.players
                                });

                                room.players.forEach(p => {
                                    if (p.joinedDuringGame) {
                                        p.joinedDuringGame = false;
                                        p.team = null;
                                        p.ready = false;
                                    }
                                });
                                
                                if (answerSetter) {
                                    answerSetter.score--;
                                    
                                    const scoreDetails = generateScoreDetails({
                                        players: room.players,
                                        scoreChanges,
                                        setterInfo: { username: answerSetter.username, score: -1, reason: '没人猜中' },
                                        isNonstopMode: false
                                    });
                                    
                                    io.to(roomId).emit('gameEnded', {
                                        guesses: room.currentGame?.guesses || [],
                                        scoreDetails
                                    });
                                } else {
                                    const scoreDetails = generateScoreDetails({
                                        players: room.players,
                                        scoreChanges,
                                        setterInfo: null,
                                        isNonstopMode: false
                                    });
                                    
                                    io.to(roomId).emit('gameEnded', {
                                        guesses: room.currentGame?.guesses || [],
                                        scoreDetails
                                    });
                                }
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
                isPublic: room.isPublic,
                answerSetterId: room.answerSetterId
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
    
            // Revert any previous setter observers (e.g. if changing setter)
            revertSetterObservers(room, roomId, io);

            // Update room state
            room.answerSetterId = setterId;
            room.waitingForAnswer = true;
    
            // Make the setter's teammates observers from the setter's vantage
            applySetterObservers(room, roomId, setterId, io);

    
            // Emit waitForAnswer event
        io.to(roomId).emit('waitForAnswer', {
            answerSetterId: setterId,
            setterUsername: setter.username
        });

        // Explicitly emit updatePlayers to ensure all clients see the change immediately
        io.to(roomId).emit('updatePlayers', {
            players: room.players,
            isPublic: room.isPublic,
            answerSetterId: setterId
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

            // If the kicked player was the designated answer setter waiting to set the answer, clear waiting state
            if (room.answerSetterId && room.answerSetterId === playerToKick.id) {
                room.answerSetterId = null;
                room.waitingForAnswer = false;
                // revert teammates temporarily set to observers
                revertSetterObservers(room, roomId, io);
                io.to(roomId).emit('waitForAnswerCanceled', { message: `指定的出题人 ${kickedPlayerUsername} 已被踢出，等待已取消` });
                console.log(`[INFO] 被踢的指定出题人 ${kickedPlayerUsername} 在房间 ${roomId}，已取消等待状态`);
            }
            
            // 从房间中移除玩家前先通知被踢玩家
            io.to(playerId).emit('playerKicked', {
                playerId: playerId,
                username: kickedPlayerUsername
            });

            try {
                // 立即移除，避免延迟期间触发 disconnect 导致玩家被标记为 disconnected 而残留
                const latestIndex = room.players.findIndex(p => p.id === playerId);
                if (latestIndex !== -1) {
                    room.players.splice(latestIndex, 1);
                }

                // 通知房间内其他玩家
                socket.to(roomId).emit('playerKicked', {
                    playerId: playerId,
                    username: kickedPlayerUsername
                });

                // 更新玩家列表
                io.to(roomId).emit('updatePlayers', {
                    players: room.players,
                    isPublic: room.isPublic,
                    answerSetterId: room.answerSetterId
                });

                // 同步模式：从等待队列移除被踢玩家
                if (room.currentGame && room.currentGame.settings?.syncMode && room.currentGame.syncPlayersCompleted) {
                    room.currentGame.syncPlayersCompleted.delete(playerId);
                    updateSyncProgress(room, roomId, io);
                }

                // 血战模式：检查是否所有人都结束
                if (room.currentGame && room.currentGame.settings?.nonstopMode) {
                    const activePlayers = room.players.filter(p => !p.isAnswerSetter && p.team !== '0' && !p.disconnected);
                    const remainingPlayers = activePlayers.filter(p => 
                        !p.guesses.includes('✌') && 
                        !p.guesses.includes('💀') && 
                        !p.guesses.includes('🏳️') && 
                        !p.guesses.includes('👑') &&
                        !p.guesses.includes('🏆')
                    );

                    if (remainingPlayers.length === 0) {
                        const answerSetter = room.players.find(p => p.isAnswerSetter);
                        const winnersCount = (room.currentGame.nonstopWinners || []).length;
                        const totalPlayersCount = activePlayers.length;

                        const partialAwardees = computePartialAwardeesFromGuessHistory(room);
                        const winnerIds = new Set((room.currentGame.nonstopWinners || []).map(w => w.id));
                        (room.players || []).forEach(p => {
                            if (!p || p.isAnswerSetter) return;
                            if (p.team === '0') return;
                            if (winnerIds.has(p.id)) return;
                            if (partialAwardees.has(p.id)) {
                                p.score += 1;
                            }
                        });
                        
                        const bigWinnerData = (room.currentGame.nonstopWinners || []).find(w => {
                            const winnerPlayer = room.players.find(p => p.id === w.id);
                            return winnerPlayer && winnerPlayer.guesses.includes('👑');
                        });
                        const hasBigWinner = !!bigWinnerData;
                        const bigWinnerScore = bigWinnerData?.score || 0;

                        const scoreChanges = buildScoreChanges({
                            isNonstopMode: true,
                            nonstopWinners: room.currentGame.nonstopWinners || [],
                            partialAwardees,
                            players: room.players
                        });

                        if (answerSetter) {
                            const setterResult = calculateNonstopSetterScore({
                                hasBigWinner,
                                bigWinnerScore,
                                winnersCount,
                                totalPlayersCount
                            });
                            
                            answerSetter.score += setterResult.score;
                            
                            const scoreDetails = generateScoreDetails({
                                players: room.players,
                                scoreChanges,
                                setterInfo: { username: answerSetter.username, score: setterResult.score, reason: setterResult.reason },
                                isNonstopMode: true
                            });
                            
                            io.to(roomId).emit('gameEnded', {
                                guesses: room.currentGame?.guesses || [],
                                scoreDetails
                            });
                        } else {
                            const scoreDetails = generateScoreDetails({
                                players: room.players,
                                scoreChanges,
                                setterInfo: null,
                                isNonstopMode: true
                            });
                            
                            io.to(roomId).emit('gameEnded', {
                                guesses: room.currentGame?.guesses || [],
                                scoreDetails
                            });
                        }

                        revertSetterObservers(room, roomId, io);
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

                        console.log(`[血战模式] 房间 ${roomId} 游戏结束（玩家被踢出导致）`);
                    }
                }

                // 将被踢玩家从房间中移除（仅离开房间，不强制断开连接）
                const kickedSocket = io.sockets.sockets.get(playerId);
                if (kickedSocket) {
                    kickedSocket.leave(roomId);
                }

                console.log(`Player ${kickedPlayerUsername} kicked from room ${roomId}`);
            } catch (error) {
                console.error(`Error kicking player ${kickedPlayerUsername}:`, error);
            }
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
                teamGuesses: {}, // Team shared guess strings by teamId
                hints: hints || null,
                // 同步模式状态
                syncRound: 1, // 当前同步轮次，从第一轮开始
                syncPlayersCompleted: new Set(), // 已完成当前轮次猜测的玩家集合
                syncWinnerFound: false,
                syncWinner: null,
                syncReadyToEnd: false,
                syncRoundStartRank: 1,
                // 血战模式状态
                nonstopWinners: [], // 按顺序记录猜对的玩家 [{id, username, isBigWin}]
                // 普通模式胜者记录（用于并发提交时确定第一个胜者）
                firstWinner: null, // {id, username, isBigWin, timestamp}
                // tagBan：记录共享标签的揭示者列表
                tagBanState: [],
                tagBanStatePending: []
            };

            // Make teammates observers from the setter's vantage before reset
            applySetterObservers(room, roomId, room.answerSetterId, io);

            // Reset all players' game state and mark the answer setter
            room.players.forEach(p => {
                p.guesses = '';
                p.isAnswerSetter = (p.id === socket.id); // Mark the answer setter
                // Only keep guess history for non-answer-setter and non-observer players
                if (!p.isAnswerSetter && p.team !== '0') {
                    room.currentGame.guesses.push({username: p.username, guesses: []});
                }
            });
            // Initialize team shared guess strings
            if (room.currentGame) {
                room.currentGame.teamGuesses = room.currentGame.teamGuesses || {};
                room.players.forEach(p => {
                    if (p.team && p.team !== '0' && !(p.team in room.currentGame.teamGuesses)) {
                        room.currentGame.teamGuesses[p.team] = '';
                    }
                });
            }
    
            // Reset room state
            room.waitingForAnswer = false;
            room.answerSetterId = null;
    
            // Send initial empty guess history to answer setter
            socket.emit('guessHistoryUpdate', {
                guesses: room.currentGame.guesses,
                teamGuesses: room.currentGame.teamGuesses
            });

            getSyncAndNonstopState(room, (eventName, data) => {
                io.to(roomId).emit(eventName, data);
            });

            // Explicitly clear answerSetterId for all clients
            io.to(roomId).emit('updatePlayers', {
                players: room.players,
                isPublic: room.isPublic,
                answerSetterId: null
            });

            io.to(roomId).emit('gameStart', {
                character,
                settings: room.settings,
                players: room.players,
                isPublic: room.isPublic,
                isGameStarted: true,
                hints: hints,
                isAnswerSetter: false
            });

            io.to(roomId).emit('tagBanStateUpdate', {
                tagBanState: Array.isArray(room.currentGame.tagBanState) ? room.currentGame.tagBanState : []
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

            // 同步模式：开局同步初始等待状态
            if (room.currentGame.settings?.syncMode) {
                updateSyncProgress(room, roomId, io);
            }
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

            // 新房主可能之前已准备（ready=true），但房主无法取消准备，会导致无法更换队伍
            newHost.ready = false;
    
            // 通知所有玩家房主已更换
            io.to(roomId).emit('hostTransferred', {
                oldHostName: currentHost.username,
                newHostId: newHost.id,
                newHostName: newHost.username
            });
    
            // 更新玩家列表
            io.to(roomId).emit('updatePlayers', {
                players: room.players,
                isPublic: room.isPublic,
                answerSetterId: room.answerSetterId
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