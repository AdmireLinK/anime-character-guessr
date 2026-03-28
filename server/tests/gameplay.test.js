const test = require('node:test');
const assert = require('node:assert/strict');

const {
    enforceAttemptLimit,
    handlePlayerTimeout,
    countAttemptMarks
} = require('../utils/gameplay');

function createMockIo() {
    return {
        events: [],
        to(target) {
            return {
                emit: (eventName, payload) => {
                    this.events.push({ target, eventName, payload });
                }
            };
        }
    };
}

test('countAttemptMarks should count only attempt marks', () => {
    const marks = '✔❌💡⏱️✌🏳️';
    assert.equal(countAttemptMarks(marks), 4);
});

test('enforceAttemptLimit should apply death when solo player reaches max attempts', () => {
    const io = createMockIo();
    const room = {
        currentGame: {
            settings: { maxAttempts: 3, syncMode: false }
        },
        players: []
    };
    const player = {
        id: 'p1',
        username: 'solo',
        guesses: '✔❌❌',
        team: null,
        isAnswerSetter: false,
        disconnected: false
    };
    room.players = [player];

    const result = enforceAttemptLimit(room, player, io, 'room-a', { isCorrect: false });

    assert.equal(result.exhausted, true);
    assert.equal(result.appliedDeath, true);
    assert.ok(player.guesses.includes('💀'));
    assert.equal(countAttemptMarks(player.guesses), 3);
});

test('enforceAttemptLimit should sync death mark to all active teammates', () => {
    const io = createMockIo();
    const room = {
        currentGame: {
            settings: { maxAttempts: 2, syncMode: false },
            teamGuesses: { '1': '✔❌' }
        },
        players: [
            { id: 'a', username: 'a', team: '1', guesses: '✔❌', isAnswerSetter: false, disconnected: false },
            { id: 'b', username: 'b', team: '1', guesses: '✔❌', isAnswerSetter: false, disconnected: false }
        ]
    };

    const result = enforceAttemptLimit(room, room.players[0], io, 'room-a', { isCorrect: false });

    assert.equal(result.exhausted, true);
    assert.equal(room.currentGame.teamGuesses['1'], '✔❌💀');
    assert.equal(room.players[0].guesses, '✔❌💀');
    assert.equal(room.players[1].guesses, '✔❌💀');
});

test('handlePlayerTimeout should append timeout and then apply death at max', () => {
    const io = createMockIo();
    const room = {
        currentGame: {
            settings: { maxAttempts: 2, syncMode: false }
        },
        players: []
    };
    const player = {
        id: 'p1',
        username: 'solo',
        guesses: '✔',
        team: null,
        isAnswerSetter: false,
        disconnected: false
    };
    room.players = [player];

    const result = handlePlayerTimeout(room, player, io, 'room-timeout');

    assert.equal(result.needsSyncUpdate, false);
    assert.ok(player.guesses.includes('💀'));
    assert.equal(countAttemptMarks(player.guesses), 2);
    assert.ok(io.events.some(e => e.eventName === 'resetTimer') === false);
});