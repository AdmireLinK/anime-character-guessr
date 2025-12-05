import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { io } from 'socket.io-client';
import { getRandomCharacter, getCharacterAppearances, generateFeedback } from '../utils/bangumi';
import SettingsPopup from '../components/SettingsPopup';
import SearchBar from '../components/SearchBar';
import GuessesTable from '../components/GuessesTable';
import Timer from '../components/Timer';
import PlayerList from '../components/PlayerList';
import GameEndPopup from '../components/GameEndPopup';
import SetAnswerPopup from '../components/SetAnswerPopup';
import GameSettingsDisplay from '../components/GameSettingsDisplay';
import Leaderboard from '../components/Leaderboard';
import Roulette from '../components/Roulette';
import Image from '../components/Image';
import '../styles/Multiplayer.css';
import '../styles/game.css';
import CryptoJS from 'crypto-js';
import axios from 'axios';
const secret = import.meta.env.VITE_AES_SECRET || 'My-Secret-Key';
const SOCKET_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3000';

const Multiplayer = () => {
  const navigate = useNavigate();
  const { roomId } = useParams();
  const [isHost, setIsHost] = useState(false);
  const [players, setPlayers] = useState([]);
  const [roomUrl, setRoomUrl] = useState('');
  // 从 cookie 读取保存的用户名
  const getSavedUsername = () => {
    const match = document.cookie.match(/(?:^|; )multiplayerUsername=([^;]*)/);
    return match ? decodeURIComponent(match[1]) : '';
  };
  const [username, setUsername] = useState(getSavedUsername);
  const [isJoined, setIsJoined] = useState(false);
  const [socket, setSocket] = useState(null);
  const socketRef = useRef(null);
  const [error, setError] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [isPublic, setIsPublic] = useState(true);
  const [roomName, setRoomName] = useState('');
  const [isManualMode, setIsManualMode] = useState(false);
  const [answerSetterId, setAnswerSetterId] = useState(null);
  const [waitingForAnswer, setWaitingForAnswer] = useState(false);
  const [roomList, setRoomList] = useState([]);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [roomListExpanded, setRoomListExpanded] = useState(false);
  const [roomListPage, setRoomListPage] = useState(0);
  const ROOMS_PER_PAGE = 10;
  const roomListExpandedRef = useRef(false);
  const isFirstLoadRoomsRef = useRef(true);
  const [gameSettings, setGameSettings] = useState({
    startYear: new Date().getFullYear()-5,
    endYear: new Date().getFullYear(),
    topNSubjects: 20,
    useSubjectPerYear: false,
    metaTags: ["", "", ""],
    useIndex: false,
    indexId: null,
    addedSubjects: [],
    mainCharacterOnly: true,
    characterNum: 6,
    maxAttempts: 10,
    enableHints: false,
    includeGame: false,
    timeLimit: 60,
    subjectSearch: true,
    characterTagNum: 6,
    subjectTagNum: 6,
    commonTags: true,
    useHints: [],
    useImageHint: 0,
    imgHint: null,
    syncMode: false,
    nonstopMode: false  // 血战模式
  });

  // Game state
  const [isGameStarted, setIsGameStarted] = useState(false);
  const [guesses, setGuesses] = useState([]);
  const [guessesLeft, setGuessesLeft] = useState(10);
  const [isGuessing, setIsGuessing] = useState(false);
  const answerCharacterRef = useRef(null);
  const gameSettingsRef = useRef(gameSettings);
  const [answerCharacter, setAnswerCharacter] = useState(null);
  const [hints, setHints] = useState([]);
  const [useImageHint, setUseImageHint] = useState(0);
  const [imgHint, setImgHint] = useState(null);
  const [shouldResetTimer, setShouldResetTimer] = useState(false);
  const [gameEnd, setGameEnd] = useState(false);
  const timeUpRef = useRef(false);
  const gameEndedRef = useRef(false);
  const [scoreDetails, setScoreDetails] = useState(null);
  const [globalGameEnd, setGlobalGameEnd] = useState(false);
  const [guessesHistory, setGuessesHistory] = useState([]);
  const [showNames, setShowNames] = useState(true);
  const [showCharacterPopup, setShowCharacterPopup] = useState(false);
  const [showSetAnswerPopup, setShowSetAnswerPopup] = useState(false);
  const [isAnswerSetter, setIsAnswerSetter] = useState(false);
  const [kickNotification, setKickNotification] = useState(null);
  const [answerViewMode, setAnswerViewMode] = useState('simple'); // 'simple' or 'detailed'
  const [isGuessTableCollapsed, setIsGuessTableCollapsed] = useState(false); // 折叠猜测表格（只显示最新3个）
  const [waitingForSync, setWaitingForSync] = useState(false); // 同步模式：等待其他玩家
  const [syncStatus, setSyncStatus] = useState({}); // 同步模式：各玩家状态
  const [nonstopProgress, setNonstopProgress] = useState(null); // 血战模式：进度信息
  const [isObserver, setIsObserver] = useState(false); // 当前玩家是否为旁观者

  useEffect(() => {
    // Initialize socket connection
    const newSocket = io(SOCKET_URL);
    setSocket(newSocket);
    socketRef.current = newSocket;

    // 用于追踪事件是否已经被处理
    const kickEventProcessed = {}; 

    // Socket event listeners
    newSocket.on('updatePlayers', ({ players, isPublic, answerSetterId }) => {
      setPlayers(players);
      if (isPublic !== undefined) {
        setIsPublic(isPublic);
      }
      if (answerSetterId !== undefined) {
        setAnswerSetterId(answerSetterId);
      }
    });

    newSocket.on('roomNameUpdated', ({ roomName: updatedRoomName }) => {
      setRoomName(updatedRoomName || '');
    });

    newSocket.on('waitForAnswer', ({ answerSetterId }) => {
      setWaitingForAnswer(true);
      setIsManualMode(false);
      // Show popup if current user is the answer setter
      if (answerSetterId === newSocket.id) {
        setShowSetAnswerPopup(true);
      }
    });

    // 同步模式：等待其他玩家
    newSocket.on('syncWaiting', ({ round, syncStatus, completedCount, totalCount }) => {
      setSyncStatus({ round, syncStatus, completedCount, totalCount });
      // 只有当前玩家自己已完成猜测时才进入等待状态
      const myStatus = syncStatus?.find(p => p.id === newSocket.id);
      const iAmCompleted = myStatus?.completed || false;
      setWaitingForSync(iAmCompleted && completedCount < totalCount);
    });

    // 同步模式：收到服务端通知，开始下一轮
    newSocket.on('syncRoundStart', ({ round }) => {
      setWaitingForSync(false);  // 解除等待状态
      setSyncStatus({});  // 清空同步状态
      setShouldResetTimer(true);  // 触发计时器重置
      setTimeout(() => setShouldResetTimer(false), 100);  // 短暂延迟后取消重置标志
      console.log(`[同步模式] 第 ${round} 轮开始`);
    });

    // 血战模式：进度更新
    newSocket.on('nonstopProgress', (progress) => {
      setNonstopProgress(progress);
      console.log(`[血战模式] 进度更新: ${progress.winners?.length || 0}人猜对，剩余${progress.remainingCount}人`);
    });

    // 血战模式+同步模式：队友猜对通知
    newSocket.on('teamWin', ({ winnerName, message }) => {
      console.log(`[血战模式+同步模式] 队友猜对: ${winnerName}`);
      // 显示通知
      showKickNotification(message, 'info');
      // 标记游戏结束
      setGameEnd(true);
      gameEndedRef.current = true;
    });

    newSocket.on('gameStart', ({ character, settings, players, isPublic, hints = null, isAnswerSetter: isAnswerSetterFlag }) => {
      const decryptedCharacter = JSON.parse(CryptoJS.AES.decrypt(character, secret).toString(CryptoJS.enc.Utf8));
      decryptedCharacter.rawTags = new Map(decryptedCharacter.rawTags);
      setAnswerCharacter(decryptedCharacter);
      answerCharacterRef.current = decryptedCharacter;
      setGameSettings(settings);
      
      // Calculate guesses left based on current player's guess history
      const currentPlayer = players?.find(p => p.id === newSocket.id);
      const guessesMade = currentPlayer?.guesses?.length || 0;
      const remainingGuesses = Math.max(0, settings.maxAttempts - guessesMade);
      setGuessesLeft(remainingGuesses);
      
      // 检查当前玩家是否为旁观者
      const observerFlag = currentPlayer?.team === '0';
      setIsObserver(observerFlag);
      
      // 检查当前玩家是否已经结束游戏（重连时恢复状态）
      const playerGuesses = currentPlayer?.guesses || '';
      const hasGameEnded = playerGuesses.includes('✌') || 
                          playerGuesses.includes('👑') || 
                          playerGuesses.includes('💀') || 
                          playerGuesses.includes('🏳️') ||
                          playerGuesses.includes('🏆');
      
      if (hasGameEnded) {
        // 玩家已经结束游戏，恢复结束状态
        gameEndedRef.current = true;
        setGameEnd(true);
      } else {
        gameEndedRef.current = false;
        setGameEnd(false);
      }
      
      setIsAnswerSetter(isAnswerSetterFlag);
      if (players) {
        setPlayers(players);
      }
      if (isPublic !== undefined) {
        setIsPublic(isPublic);
      }

      setGuessesHistory([]);

      // Prepare hints if enabled
      let hintTexts = [];
      if (Array.isArray(settings.useHints) && settings.useHints.length > 0 && hints) {
        hintTexts = hints;
      } else if (Array.isArray(settings.useHints) && settings.useHints.length > 0 && decryptedCharacter && decryptedCharacter.summary) {
        // Automatic mode - generate hints from summary
        const sentences = decryptedCharacter.summary.replace('[mask]', '').replace('[/mask]','')
          .split(/[。、，。！？ ""]/).filter(s => s.trim());
        if (sentences.length > 0) {
          const selectedIndices = new Set();
          while (selectedIndices.size < Math.min(settings.useHints.length, sentences.length)) {
            selectedIndices.add(Math.floor(Math.random() * sentences.length));
          }
          hintTexts = Array.from(selectedIndices).map(i => "……"+sentences[i].trim()+"……");
        }
      }
      setHints(hintTexts);
      setUseImageHint(settings.useImageHint);
      setImgHint(settings.useImageHint > 0 ? decryptedCharacter.image : null);
      setGlobalGameEnd(false);
      setScoreDetails(null);
      setIsGameStarted(true);
      setGuesses([]);
      // 重置同步模式状态
      setWaitingForSync(false);
      setSyncStatus({});
      // 重置血战模式状态
      setNonstopProgress(null);
    });

    newSocket.on('guessHistoryUpdate', ({ guesses }) => {
      setGuessesHistory(guesses);
    });

    newSocket.on('roomClosed', ({ message }) => {
      alert(message || '房主已断开连接，房间已关闭。');
      setError('房间已关闭');
      navigate('/multiplayer');
    });

    newSocket.on('hostTransferred', ({ oldHostName, newHostId, newHostName }) => {
      // 如果当前用户是新房主，则更新状态
      if (newHostId === newSocket.id) {
        setIsHost(true);
        if (oldHostName === newHostName) {
          showKickNotification(`原房主已断开连接，你已成为新房主！`, 'host');
        } else {
          showKickNotification(`房主 ${oldHostName} 已将房主权限转移给你！`, 'host');
        }
      } else {
        showKickNotification(`房主权限已从 ${oldHostName} 转移给 ${newHostName}`, 'host');
      }
    });

    newSocket.on('error', ({ message }) => {
      alert(`错误: ${message}`);
      setError(message);
      setIsJoined(false);
      if (message && message.includes('头像被用了😭😭😭')) {
        sessionStorage.removeItem('avatarId');
        sessionStorage.removeItem('avatarImage');
      }
    });

    newSocket.on('updateGameSettings', ({ settings }) => {
      console.log('Received game settings:', settings);
      setGameSettings(settings);
    });

    newSocket.on('gameEnded', ({ guesses, scoreDetails }) => {
      setScoreDetails(scoreDetails || null);
      setGlobalGameEnd(true);
      setGuessesHistory(guesses);
      setIsGameStarted(false);
      setIsObserver(false); // 重置旁观者状态，下一局开始时会重新判断
    });

    newSocket.on('resetReadyStatus', () => {
      setPlayers(prevPlayers => prevPlayers.map(player => ({
        ...player,
        ready: player.isHost ? player.ready : false
      })));
    });

    newSocket.on('playerKicked', ({ playerId, username }) => {
      // 使用唯一标识确保同一事件不会处理多次
      const eventId = `${playerId}-${Date.now()}`;
      if (kickEventProcessed[eventId]) return;
      kickEventProcessed[eventId] = true;
      
      if (playerId === newSocket.id) {
        // 如果当前玩家被踢出，显示通知并重定向到多人游戏大厅
        showKickNotification('你已被房主踢出房间', 'kick');
        setIsJoined(false); 
        setGameEnd(true); 
        setTimeout(() => {
          navigate('/multiplayer');
        }, 100); // 延长延迟时间确保通知显示后再跳转
      } else {
        showKickNotification(`玩家 ${username} 已被踢出房间`, 'kick');
        setPlayers(prevPlayers => prevPlayers.filter(p => p.id !== playerId));
      }
    });

    // Listen for team guess broadcasts
    newSocket.on('boardcastTeamGuess', ({ guessData, playerId, playerName }) => {
      if (guessData.rawTags) {
        guessData.rawTags = new Map(guessData.rawTags);
      }
    
      const feedback = generateFeedback(guessData, answerCharacterRef.current, gameSettingsRef.current);
    
      const newGuess = {
        id: guessData.id,
        icon: guessData.image,
        name: guessData.name,
        nameCn: guessData.nameCn,
        nameEn: guessData.nameEn,
        gender: guessData.gender,
        genderFeedback: feedback.gender.feedback,
        latestAppearance: guessData.latestAppearance,
        latestAppearanceFeedback: feedback.latestAppearance.feedback,
        earliestAppearance: guessData.earliestAppearance,
        earliestAppearanceFeedback: feedback.earliestAppearance.feedback,
        highestRating: guessData.highestRating,
        ratingFeedback: feedback.rating.feedback,
        appearancesCount: guessData.appearances.length,
        appearancesCountFeedback: feedback.appearancesCount.feedback,
        popularity: guessData.popularity,
        popularityFeedback: feedback.popularity.feedback,
        appearanceIds: guessData.appearanceIds,
        sharedAppearances: feedback.shared_appearances,
        metaTags: feedback.metaTags.guess,
        sharedMetaTags: feedback.metaTags.shared,
        isAnswer: false,
        playerId,
        playerName,
        guessrName: guessData.guessrName || playerName // prefer guessData.guessrName if present
      };
    
      setGuesses(prev => [...prev, newGuess]);
      
      // 只有正在参与游戏的玩家（非旁观者、非出题人）才需要减少猜测次数和触发游戏结束
      // 旁观者和出题人只是接收猜测信息用于显示，不参与游戏逻辑
      setPlayers(currentPlayers => {
        const currentPlayer = currentPlayers.find(p => p.id === newSocket.id);
        const isObserver = currentPlayer?.team === '0';
        const isAnswerSetterPlayer = currentPlayer?.isAnswerSetter;
        
        if (!isObserver && !isAnswerSetterPlayer) {
          setGuessesLeft(prev => {
            const newGuessesLeft = prev - 1;
            if (newGuessesLeft <= 0) {
              setTimeout(() => {
                handleGameEnd(false);
              }, 100);
            }
            return newGuessesLeft;
          });
          setShouldResetTimer(true);
          setTimeout(() => setShouldResetTimer(false), 100);
        }
        
        return currentPlayers; // 不修改 players 状态
      });
    });

    return () => {
      // 清理事件监听和连接
      newSocket.off('playerKicked');
      newSocket.off('hostTransferred');
      newSocket.off('updatePlayers');
      newSocket.off('waitForAnswer');
      newSocket.off('gameStart');
      newSocket.off('guessHistoryUpdate');
      newSocket.off('roomClosed');
      newSocket.off('error');
      newSocket.off('updateGameSettings');
      newSocket.off('gameEnded');
      newSocket.off('resetReadyStatus');
      newSocket.off('boardcastTeamGuess');
      newSocket.off('syncWaiting');
      newSocket.off('syncRoundStart');
      newSocket.off('nonstopProgress');
      newSocket.off('teamWin');
      newSocket.off('roomNameUpdated');
      newSocket.disconnect();
    };
  }, [navigate]);

  useEffect(() => {
    if (!roomId) {
      // Create new room if no roomId in URL
      const newRoomId = uuidv4();
      setIsHost(true);
      navigate(`/multiplayer/${newRoomId}`);
    } else {
      // Set room URL for sharing
      setRoomUrl(window.location.href);
      
      // 检查是否有待加入的房间（从房间列表点击加入）
      const pendingUsername = sessionStorage.getItem('pendingUsername');
      const pendingRoomId = sessionStorage.getItem('pendingRoomId');
      
      if (pendingUsername && pendingRoomId === roomId) {
        // 清除 sessionStorage
        sessionStorage.removeItem('pendingUsername');
        sessionStorage.removeItem('pendingRoomId');
        
        // 设置用户名并自动加入
        setUsername(pendingUsername);
        setIsHost(false);
        
        // 保存用户名到 cookie，有效期 30 天
        const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toUTCString();
        document.cookie = `multiplayerUsername=${encodeURIComponent(pendingUsername)}; expires=${expires}; path=/`;
        
        // 延迟执行加入，确保 socket 已连接
        setTimeout(() => {
          const avatarId = sessionStorage.getItem('avatarId');
          const avatarImage = sessionStorage.getItem('avatarImage');
          const avatarPayload = avatarId !== null ? { avatarId, avatarImage } : {};
          
          socketRef.current?.emit('joinRoom', { roomId, username: pendingUsername, ...avatarPayload });
          socketRef.current?.emit('requestGameSettings', { roomId });
          setIsJoined(true);
        }, 100);
      }
    }
  }, [roomId, navigate]);

  useEffect(() => {
    console.log('Game Settings:', gameSettings);
    if (isHost && isJoined) {
      socketRef.current?.emit('updateGameSettings', { roomId, settings: gameSettings });
    }
  }, [showSettings]);

  useEffect(() => {
    gameSettingsRef.current = gameSettings;
  }, [gameSettings]);

  // 房间列表自动刷新：展开时每5秒刷新一次
  useEffect(() => {
    if (!roomListExpanded || isJoined) {
      return;
    }
    
    const intervalId = setInterval(() => {
      if (roomListExpandedRef.current && !isJoined) {
        fetchRoomList();
      }
    }, 5000);
    
    return () => clearInterval(intervalId);
  }, [roomListExpanded, isJoined]);

  const handleJoinRoom = () => {
    if (!username.trim()) {
      alert('请输入用户名');
      setError('请输入用户名');
      return;
    }

    setError('');
    // Only declare these variables once
    const avatarId = sessionStorage.getItem('avatarId');
    const avatarImage = sessionStorage.getItem('avatarImage');
    const avatarPayload = avatarId !== null ? { avatarId, avatarImage } : {};
    if (isHost) {
      socketRef.current?.emit('createRoom', { roomId, username, ...avatarPayload });
      socketRef.current?.emit('updateGameSettings', { roomId, settings: gameSettings });
    } else {
      socketRef.current?.emit('joinRoom', { roomId, username, ...avatarPayload });
      socketRef.current?.emit('requestGameSettings', { roomId });
    }
    // 保存用户名到 cookie，有效期 30 天
    const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toUTCString();
    document.cookie = `multiplayerUsername=${encodeURIComponent(username)}; expires=${expires}; path=/`;
    setIsJoined(true);
  };

  const handleReadyToggle = () => {
    socketRef.current?.emit('toggleReady', { roomId });
  };

  const handleSettingsChange = (key, value) => {
    setGameSettings(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const copyRoomUrl = () => {
    navigator.clipboard.writeText(roomUrl);
  };

  const handleGameEnd = (isWin) => {
    if (gameEndedRef.current) return;
    
    // 血战模式下，猜对不结束游戏，只发送 nonstopWin 事件
    if (isWin && gameSettings.nonstopMode) {
      socketRef.current?.emit('nonstopWin', {
        roomId,
        isBigWin: answerCharacter && sessionStorage.getItem('avatarId') == answerCharacter.id
      });
      // 血战模式下猜对后进入观战状态，但不设置 gameEnd
      setGameEnd(true);
      setWaitingForSync(false); // 重置同步等待状态
      gameEndedRef.current = true;
      return;
    }
    
    gameEndedRef.current = true;
    setGameEnd(true);
    setWaitingForSync(false); // 重置同步等待状态
    // Emit game end event to server
    if (answerCharacter && sessionStorage.getItem('avatarId') == answerCharacter.id) {
      socketRef.current?.emit('gameEnd', {
        roomId,
        result: isWin ? 'bigwin' : 'lose'
      });
    }
    else {
      socketRef.current?.emit('gameEnd', {
        roomId,
        result: isWin ? 'win' : 'lose'
      });
    }
  };

  const handleCharacterSelect = async (character) => {
    if (isGuessing || !answerCharacter || gameEnd) return;

    // 旁观者和出题人不能猜测
    if (isObserver || isAnswerSetter) {
      return;
    }

    // 同步模式：等待其他玩家时不能猜测
    if (waitingForSync) {
      alert('【同步模式】请等待其他玩家完成本轮猜测');
      return;
    }

    if (gameSettings.globalPick) {
      console.log(guessesHistory);
      const duplicateInHistory = guessesHistory.filter(playerHistory => playerHistory.username !== username).some(playerHistory =>
        Array.isArray(playerHistory.guesses) &&
        playerHistory.guesses.some(guessEntry => guessEntry?.guessData?.id === character.id)
      );
      if (duplicateInHistory) {
        // 血战模式下，如果该角色是正确答案（别人猜对了），允许当前玩家继续猜
        const isCorrectAnswer = character.id === answerCharacter?.id;
        if (gameSettings.nonstopMode && isCorrectAnswer) {
          // 血战模式下允许多人猜正确答案
          console.log('【全局BP】血战模式下允许猜正确答案');
        } else {
          alert('【全局BP】已经被别人猜过了！请尝试其他角色');
          return;
        }
      }
    }

    setIsGuessing(true);
    setShouldResetTimer(true);

    try {
      const appearances = await getCharacterAppearances(character.id, gameSettings);

      const guessData = {
        ...character,
        ...appearances
      };
      const isCorrect = guessData.id === answerCharacter.id;
      // Send guess result to server
      guessData.rawTags = Array.from(appearances.rawTags?.entries?.() || []);
      if (!guessData || !guessData.id || !guessData.name) {
        console.warn('Invalid guessData, not emitting');
        return;
      }
      let tempFeedback = generateFeedback(guessData, answerCharacter, gameSettings);
      setGuessesLeft(prev => prev - 1);
      socketRef.current?.emit('playerGuess', {
        roomId,
        guessResult: {
          isCorrect,
          isPartialCorrect: tempFeedback.shared_appearances.count > 0,
          guessData
        }
      });
      guessData.rawTags = new Map(guessData.rawTags);
      const feedback = generateFeedback(guessData, answerCharacter, gameSettings);
      if (isCorrect) {
        setGuesses(prevGuesses => [...prevGuesses, {
          id: guessData.id,
          icon: guessData.image,
          name: guessData.name,
          nameCn: guessData.nameCn,
          nameEn: guessData.nameEn,
          gender: guessData.gender,
          genderFeedback: 'yes',
          latestAppearance: guessData.latestAppearance,
          latestAppearanceFeedback: '=',
          earliestAppearance: guessData.earliestAppearance,
          earliestAppearanceFeedback: '=',
          highestRating: guessData.highestRating,
          ratingFeedback: '=',
          appearancesCount: guessData.appearances.length,
          appearancesCountFeedback: '=',
          popularity: guessData.popularity,
          popularityFeedback: '=',
          appearanceIds: guessData.appearanceIds,
          sharedAppearances: {
            first: appearances.appearances[0] || '',
            count: appearances.appearances.length
          },
          metaTags: guessData.metaTags,
          sharedMetaTags: guessData.metaTags,
          isAnswer: true
        }]);
        handleGameEnd(true);
      } else if (guessesLeft <= 1) {
        setGuesses(prevGuesses => [...prevGuesses, {
          id: guessData.id,
          icon: guessData.image,
          name: guessData.name,
          nameCn: guessData.nameCn,
          nameEn: guessData.nameEn,
          gender: guessData.gender,
          genderFeedback: feedback.gender.feedback,
          latestAppearance: guessData.latestAppearance,
          latestAppearanceFeedback: feedback.latestAppearance.feedback,
          earliestAppearance: guessData.earliestAppearance,
          earliestAppearanceFeedback: feedback.earliestAppearance.feedback,
          highestRating: guessData.highestRating,
          ratingFeedback: feedback.rating.feedback,
          appearancesCount: guessData.appearances.length,
          appearancesCountFeedback: feedback.appearancesCount.feedback,
          popularity: guessData.popularity,
          popularityFeedback: feedback.popularity.feedback,
          appearanceIds: guessData.appearanceIds,
          sharedAppearances: feedback.shared_appearances,
          metaTags: feedback.metaTags.guess,
          sharedMetaTags: feedback.metaTags.shared,
          isAnswer: false
        }]);
        handleGameEnd(false);
      } else {
        setGuesses(prevGuesses => [...prevGuesses, {
          id: guessData.id,
          icon: guessData.image,
          name: guessData.name,
          nameCn: guessData.nameCn,
          nameEn: guessData.nameEn,
          gender: guessData.gender,
          genderFeedback: feedback.gender.feedback,
          latestAppearance: guessData.latestAppearance,
          latestAppearanceFeedback: feedback.latestAppearance.feedback,
          earliestAppearance: guessData.earliestAppearance,
          earliestAppearanceFeedback: feedback.earliestAppearance.feedback,
          highestRating: guessData.highestRating,
          ratingFeedback: feedback.rating.feedback,
          appearancesCount: guessData.appearances.length,
          appearancesCountFeedback: feedback.appearancesCount.feedback,
          popularity: guessData.popularity,
          popularityFeedback: feedback.popularity.feedback,
          appearanceIds: guessData.appearanceIds,
          sharedAppearances: feedback.shared_appearances,
          metaTags: feedback.metaTags.guess,
          sharedMetaTags: feedback.metaTags.shared,
          isAnswer: false
        }]);
      }
    } catch (error) {
      console.error('Error processing guess:', error);
      alert('出错了，请重试');
    } finally {
      setIsGuessing(false);
      setShouldResetTimer(false);
    }
  };

  const handleTimeUp = () => {
    if (timeUpRef.current || gameEnd || gameEndedRef.current) return;
    timeUpRef.current = true;

    const newGuessesLeft = guessesLeft - 1;

    setGuessesLeft(newGuessesLeft);

    // Always emit timeout
    socketRef.current?.emit('timeOut', { roomId });

    if (newGuessesLeft <= 0) {
      setTimeout(() => {
        handleGameEnd(false);
      }, 100);
    }

    setShouldResetTimer(true);
    setTimeout(() => {
      setShouldResetTimer(false);
      timeUpRef.current = false;
    }, 100);
  };

  const handleSurrender = () => {
    if (gameEnd || gameEndedRef.current) return;
    gameEndedRef.current = true;
    setGameEnd(true);
    // 重置同步等待状态
    setWaitingForSync(false);
    // Emit game end event with surrender result
    socketRef.current?.emit('gameEnd', {
      roomId,
      result: 'surrender'
    });
  };

  const handleStartGame = async () => {
    if (isHost) {
      try {
        if (gameSettings.addedSubjects.length > 0) {
          await axios.post(SOCKET_URL + '/api/subject-added', {
            addedSubjects: gameSettings.addedSubjects
          });
        }
      } catch (error) {
        console.error('Failed to update subject count:', error);
      }
      try {
        const character = await getRandomCharacter(gameSettings);
        character.rawTags = Array.from(character.rawTags.entries());
        const encryptedCharacter = CryptoJS.AES.encrypt(JSON.stringify(character), secret).toString();
        socketRef.current?.emit('gameStart', {
          roomId,
          character: encryptedCharacter,
          settings: gameSettings
        });

        // Update local state
        setAnswerCharacter(character);
        setGuessesLeft(gameSettings.maxAttempts);

        // Prepare hints if enabled
        let hintTexts = [];
        if (Array.isArray(gameSettings.useHints) && gameSettings.useHints.length > 0 && character.summary) {
          const sentences = character.summary.replace('[mask]', '').replace('[/mask]','')
            .split(/[。、，。！？ ""]/).filter(s => s.trim());
          if (sentences.length > 0) {
            const selectedIndices = new Set();
            while (selectedIndices.size < Math.min(gameSettings.useHints.length, sentences.length)) {
              selectedIndices.add(Math.floor(Math.random() * sentences.length));
            }
            hintTexts = Array.from(selectedIndices).map(i => "……"+sentences[i].trim()+"……");
          }
        }
        setHints(hintTexts);
        setUseImageHint(gameSettings.useImageHint);
        setImgHint(gameSettings.useImageHint > 0 ? character.image : null);
        setGlobalGameEnd(false);
        setScoreDetails(null);
        setIsGameStarted(true);
        setGameEnd(false);
        setGuesses([]);
      } catch (error) {
        console.error('Failed to initialize game:', error);
        alert('游戏初始化失败，请重试');
      }
    }
  };

  const handleManualMode = () => {
    if (isManualMode) {
      setAnswerSetterId(null);
      setIsManualMode(false);
    } else {
      // Set all players as ready when entering manual mode
      socketRef.current?.emit('enterManualMode', { roomId });
      setIsManualMode(true);
    }
  };

  const handleSetAnswerSetter = (setterId) => {
    if (!isHost || !isManualMode) return;
    socketRef.current?.emit('setAnswerSetter', { roomId, setterId });
  };

  const handleVisibilityToggle = () => {
    socketRef.current?.emit('toggleRoomVisibility', { roomId });
  };

  const handleRoomNameChange = (event) => {
    setRoomName(event.target.value);
  };

  const handleRoomNameBlur = () => {
    if (!isHost || !socketRef.current) return;
    const trimmed = roomName.trim();
    if (trimmed !== roomName) {
      setRoomName(trimmed);
    }
    socketRef.current.emit('updateRoomName', { roomId, roomName: trimmed });
  };

  const handleRoomNameKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.currentTarget.blur();
    }
  };

  const handleSetAnswer = async ({ character, hints }) => {
    try {
      character.rawTags = Array.from(character.rawTags.entries());
      const encryptedCharacter = CryptoJS.AES.encrypt(JSON.stringify(character), secret).toString();
      socketRef.current?.emit('setAnswer', {
        roomId,
        character: encryptedCharacter,
        hints
      });
      setShowSetAnswerPopup(false);
    } catch (error) {
      console.error('Failed to set answer:', error);
      alert('设置答案失败，请重试');
    }
  };

  const handleKickPlayer = (playerId) => {
    if (!isHost || !socketRef.current) return;
    
    // 确认当前玩家是房主
    const currentPlayer = players.find(p => p.id === socketRef.current.id);
    if (!currentPlayer || !currentPlayer.isHost) {
      alert('只有房主可以踢出玩家');
      return;
    }
    
    // 防止房主踢出自己
    if (playerId === socketRef.current.id) {
      alert('房主不能踢出自己');
      return;
    }
    
    // 确认后再踢出
    if (window.confirm('确定要踢出该玩家吗？')) {
      try {
        socketRef.current.emit('kickPlayer', { roomId, playerId });
      } catch (error) {
        console.error('踢出玩家失败:', error);
        alert('踢出玩家失败，请重试');
      }
    }
  };

  const handleTransferHost = (playerId) => {
    if (!isHost || !socketRef.current) return;
    
    // 确认后再转移房主
    if (window.confirm('确定要将房主权限转移给该玩家吗？')) {
      socketRef.current.emit('transferHost', { roomId, newHostId: playerId });
      setIsHost(false);
    }
  };

  // Add handleQuickJoin function
  const handleQuickJoin = async () => {
    try {
      const response = await axios.get(`${SOCKET_URL}/quick-join`);
      window.location.href = response.data.url;
    } catch (error) {
      if (error.response && error.response.status === 404) {
        alert(error.response.data.error || '没有可用的公开房间');
      } else {
        alert('快速加入失败，请重试');
      }
    }
  };

  // 获取房间列表（静默刷新，避免页面抖动）
  const fetchRoomList = async () => {
    // 只有首次加载时显示 loading 状态
    if (isFirstLoadRoomsRef.current) {
      setLoadingRooms(true);
    }
    try {
      const response = await axios.get(`${SOCKET_URL}/list-rooms`);
      // 只显示公开房间
      const publicRooms = response.data.filter(room => room.isPublic);
      setRoomList(publicRooms);
      isFirstLoadRoomsRef.current = false;
    } catch (error) {
      console.error('获取房间列表失败:', error);
    } finally {
      setLoadingRooms(false);
    }
  };

  // 加入指定房间
  const handleJoinSpecificRoom = (targetRoomId) => {
    if (!username.trim()) {
      alert('请输入用户名');
      setError('请输入用户名');
      return;
    }
    
    // 将用户名保存到 sessionStorage，以便页面刷新后自动填充
    sessionStorage.setItem('pendingUsername', username);
    sessionStorage.setItem('pendingRoomId', targetRoomId);
    
    // 使用完整页面刷新，确保重置所有状态和 socket 连接
    window.location.href = `/multiplayer/${targetRoomId}`;
  };

  // 创建一个函数显示踢出通知
  const showKickNotification = (message, type = 'kick') => {
    setKickNotification({ message, type });
    setTimeout(() => {
      setKickNotification(null);
    }, 5000); // 5秒后自动关闭通知
  };

  // Handle player message change
  const handleMessageChange = (newMessage) => {
    setPlayers(prevPlayers => prevPlayers.map(p =>
      p.id === socketRef.current?.id ? { ...p, message: newMessage } : p
    ));
    // Emit to server for sync
    socketRef.current?.emit('updatePlayerMessage', { roomId, message: newMessage });
  };

  // Handle player team change
  const handleTeamChange = (playerId, newTeam) => {
    if (!socketRef.current) return;
    setPlayers(prevPlayers => prevPlayers.map(p =>
      p.id === playerId ? { ...p, team: newTeam || null } : p
    ));
    // Emit to server for sync
    socketRef.current.emit('updatePlayerTeam', { roomId, team: newTeam || null });
  };

  if (!roomId) {
    return <div>Loading...</div>;
  }

  return (
    <div className="multiplayer-container">
      {/* 添加踢出通知 */}
      {kickNotification && (
        <div className={`kick-notification ${kickNotification.type === 'host' ? 'host-notification' : kickNotification.type === 'reconnect' ? 'reconnect-notification' : ''}`}>
          <div className="kick-notification-content">
            <i className={`fas ${kickNotification.type === 'host' ? 'fa-crown' : kickNotification.type === 'reconnect' ? 'fa-wifi' : 'fa-exclamation-circle'}`}></i>
            <span>{kickNotification.message}</span>
          </div>
        </div>
      )}
      <a
          href="/"
          className="social-link floating-back-button"
          title="Back"
          onClick={(e) => {
            e.preventDefault();
            navigate('/');
          }}
      >
        <i className="fas fa-angle-left"></i>
      </a>
      {!isJoined ? (
        <>
          <div className="join-container">
            <h2>{isHost ? '创建房间' : '加入房间'}</h2>
            {isHost && !isJoined && (
              <button onClick={handleQuickJoin} className="join-button quick-join-btn">快速加入</button>
            )}
            <input
              type="text"
              placeholder="输入用户名"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="username-input"
              maxLength={20}
            />
            <button onClick={handleJoinRoom} className="join-button">
              {isHost ? '创建' : '加入'}
            </button>
            {error && <p className="error-message">{error}</p>}
          </div>
          
          {/* 房间列表 - 使用与 Leaderboard 一致的样式 */}
          <div className="leaderboard-container room-list-wrapper">
            <div className="leaderboard-header" onClick={() => {
              const newExpanded = !roomListExpanded;
              setRoomListExpanded(newExpanded);
              roomListExpandedRef.current = newExpanded;
              if (newExpanded) {
                fetchRoomList();
              }
            }}>
              <h3>公开房间 {roomList.length > 0 && `(${roomList.length})`}</h3>
              <span className={`expand-icon ${roomListExpanded ? 'expanded' : ''}`}>{roomListExpanded ? '▼' : '▶'}</span>
            </div>
            {roomListExpanded && (
              <div className="leaderboard-content">
                {loadingRooms ? (
                  <div className="leaderboard-loading">加载中...</div>
                ) : roomList.length === 0 ? (
                  <div className="leaderboard-empty">暂无公开房间</div>
                ) : (
                  <>
                    <div className="leaderboard-list">
                      {roomList.slice(roomListPage * ROOMS_PER_PAGE, (roomListPage + 1) * ROOMS_PER_PAGE).map(room => (
                        <div key={room.id} className="leaderboard-list-item room-item">
                          <div className="room-info">
                            <span className="room-players-count">
                              <i className="fas fa-users"></i> {room.displayRoomName || room.roomName || `${room.hostName || ''}的房间`} {room.playerCount}人
                              {room.isGameStarted && <span className="room-status-badge">游戏中</span>}
                            </span>
                            <span className="room-players-names">
                              {room.players.slice(0, 3).join(', ')}
                              {room.players.length > 3 && '...'}
                            </span>
                          </div>
                          <button 
                            className={`join-room-btn ${room.isGameStarted ? 'spectate-btn' : ''}`}
                            onClick={() => handleJoinSpecificRoom(room.id)}
                          >
                            {room.isGameStarted ? '观战' : '加入'}
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="room-list-footer">
                      <div className="room-list-pagination">
                        <button
                          className="pagination-btn"
                          disabled={roomListPage === 0}
                          onClick={() => setRoomListPage(prev => Math.max(0, prev - 1))}
                        >
                          ◀
                        </button>
                        <span className="pagination-info">
                          {roomListPage + 1} / {Math.max(1, Math.ceil(roomList.length / ROOMS_PER_PAGE))}
                        </span>
                        <button
                          className="pagination-btn"
                          disabled={(roomListPage + 1) * ROOMS_PER_PAGE >= roomList.length}
                          onClick={() => setRoomListPage(prev => prev + 1)}
                        >
                          ▶
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
          
          <Roulette />
          <Leaderboard />
        </>
      ) : (
        <>
          <PlayerList 
            players={players} 
            socket={socketRef.current} 
            isGameStarted={isGameStarted}
            handleReadyToggle={handleReadyToggle}
            onAnonymousModeChange={setShowNames}
            isManualMode={isManualMode}
            isHost={isHost}
            answerSetterId={answerSetterId}
            onSetAnswerSetter={handleSetAnswerSetter}
            onKickPlayer={handleKickPlayer}
            onTransferHost={handleTransferHost}
            onMessageChange={handleMessageChange}
            onTeamChange={handleTeamChange}
          />
          <div className="anonymous-mode-info">
            匿名模式？点表头"名"切换。<br/>
            沟通玩法？点自己名字编辑短信息。
          </div>

          {!isGameStarted && !globalGameEnd && (
            <>
              {isHost && !waitingForAnswer && (
                <div className="host-controls">
                  <div className="room-url-container">
                    {isPublic && (
                      <input
                        type="text"
                        value={roomName}
                        placeholder="房间名（可选）"
                        maxLength={15}
                        className="room-name-input"
                        onChange={handleRoomNameChange}
                        onBlur={handleRoomNameBlur}
                        onKeyDown={handleRoomNameKeyDown}
                      />
                    )}
                    <input
                      type="text"
                      value={roomUrl}
                      readOnly
                      className="room-url-input"
                    />
                    <button onClick={copyRoomUrl} className="copy-button">复制</button>
                  </div>
                </div>
              )}
              {isHost && !waitingForAnswer && (
                <div className="host-game-controls">
                  <div className="button-group">
                    <div className="button-row">
                      <button
                        onClick={() => setShowSettings(true)}
                        className="settings-button"
                      >
                        设置
                      </button>
                      <button
                        onClick={handleVisibilityToggle}
                        className="visibility-button"
                      >
                        {isPublic ? '🔓公开' : '🔒私密'}
                      </button>
                      <button
                        onClick={handleStartGame}
                        className="start-game-button"
                        disabled={players.length < 2 || players.some(p => !p.isHost && !p.ready && !p.disconnected) || players.every(p => p.team === '0')}
                      >
                        开始
                      </button>
                      <button
                        onClick={handleManualMode}
                        className={`manual-mode-button ${isManualMode ? 'active' : ''}`}
                        disabled={players.length < 2 || players.some(p => !p.isHost && !p.ready && !p.disconnected) || players.every(p => p.team === '0')}
                      >
                        有人想出题？
                      </button>
                    </div>
                  </div>
                </div>
              )}
              {!isHost && (
                <>
                  {/* 调试信息*/}
                  {/* <pre style={{ fontSize: '12px', color: '#666', padding: '5px', background: '#f5f5f5' }}>
                    {JSON.stringify({...gameSettings, __debug: '显示原始数据用于调试'}, null, 2)}
                  </pre> */}
                  <GameSettingsDisplay settings={gameSettings} />
                </>
              )}
            </>
          )}

          {isGameStarted && !globalGameEnd && (
            // In game
            <div className="container">
              {!isAnswerSetter && !isObserver ? (
                // Regular player view
                <>
                  <SearchBar
                    onCharacterSelect={handleCharacterSelect}
                    isGuessing={isGuessing || waitingForSync}
                    gameEnd={gameEnd}
                    subjectSearch={gameSettings.subjectSearch}
                  />
                  {/* 同步模式等待提示 */}
                  {gameSettings.syncMode && (
                    <div className="sync-waiting-banner">
                      <span>⏳ 同步模式 - 第 {syncStatus.round || 1} 轮 ({syncStatus.completedCount || 0}/{syncStatus.totalCount || players.filter(p => !p.isAnswerSetter && p.team !== '0' && !p.disconnected).length})</span>
                      <div className="sync-status">
                        {syncStatus.syncStatus && syncStatus.syncStatus.map((player) => (
                          <span key={player.id} className={`sync-player ${player.completed ? 'done' : 'waiting'}`}>
                            {player.username}: {player.completed ? '✓' : '...'}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* 血战模式进度显示 */}
                  {gameSettings.nonstopMode && (
                    <div className="nonstop-progress-banner">
                      <span>🔥 血战模式 - 剩余 {nonstopProgress?.remainingCount ?? players.filter(p => !p.isAnswerSetter && p.team !== '0' && !p.disconnected).length}/{nonstopProgress?.totalCount ?? players.filter(p => !p.isAnswerSetter && p.team !== '0' && !p.disconnected).length} 人</span>
                      {nonstopProgress?.winners && nonstopProgress.winners.length > 0 && (
                        <div className="nonstop-winners">
                          {nonstopProgress.winners.map((winner) => (
                            <span key={winner.username} className="nonstop-winner">
                              #{winner.rank} {winner.username} (+{winner.score}分)
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {gameSettings.timeLimit && !gameEnd && !waitingForSync && (
                    <Timer
                      timeLimit={gameSettings.timeLimit}
                      onTimeUp={handleTimeUp}
                      isActive={!isGuessing && !waitingForSync}
                      reset={shouldResetTimer}
                    />
                  )}
                  <div className="game-info">
                    <div className="guesses-left">
                      <span>剩余猜测次数: {guessesLeft}</span>
                      <button
                        className="surrender-button"
                        onClick={handleSurrender}
                      >
                        投降 🏳️
                      </button>
                    </div>
                    {Array.isArray(gameSettings.useHints) && gameSettings.useHints.length > 0 && hints && hints.length > 0 && (
                      <div className="hints">
                        {gameSettings.useHints.map((val, idx) => (
                          guessesLeft <= val && hints[idx] && (
                            <div className="hint" key={idx}>提示{idx+1}: {hints[idx]}</div>
                          )
                        ))}
                      </div>
                    )}
                    {guessesLeft <= useImageHint && imgHint &&(
                      <div className="hint-container">
                        <Image src={imgHint} style={{height: '200px', filter: `blur(${guessesLeft}px)`}} alt="提示" />
                      </div>
                    )}
                  </div>
                  <GuessesTable
                    guesses={guesses}
                    gameSettings={gameSettings}
                    answerCharacter={answerCharacter}
                  />
                </>
              ) : (
                // Answer setter view
                <div className="answer-setter-view">
                  <div className="selected-answer">
                    <Image src={answerCharacter.imageGrid} alt={answerCharacter.name} className="answer-image" />
                    <div className="answer-info">
                      <div>{answerCharacter.name}</div>
                      <div>{answerCharacter.nameCn}</div>
                    </div>
                  </div>
                  {/* 血战模式进度显示（出题人视角）  */}
                  {gameSettings.nonstopMode && (
                    <div className="nonstop-progress-banner">
                      <span>🔥 血战模式 - 剩余 {nonstopProgress?.remainingCount ?? players.filter(p => !p.isAnswerSetter && p.team !== '0' && !p.disconnected).length}/{nonstopProgress?.totalCount ?? players.filter(p => !p.isAnswerSetter && p.team !== '0' && !p.disconnected).length} 人</span>
                      {nonstopProgress?.winners && nonstopProgress.winners.length > 0 && (
                        <div className="nonstop-winners">
                          {nonstopProgress.winners.map((winner) => (
                            <span key={winner.username} className="nonstop-winner">
                              #{winner.rank} {winner.username} (+{winner.score}分)
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {/* 同步模式进度显示（出题人/旁观者视角） */}
                  {gameSettings.syncMode && (
                    <div className="sync-waiting-banner">
                      <span>⏳ 同步模式 - 第 {syncStatus.round || 1} 轮 ({syncStatus.completedCount || 0}/{syncStatus.totalCount || players.filter(p => !p.isAnswerSetter && p.team !== '0' && !p.disconnected).length})</span>
                      <div className="sync-status">
                        {syncStatus.syncStatus && syncStatus.syncStatus.map((player) => (
                          <span key={player.id} className={`sync-player ${player.completed ? 'done' : 'waiting'}`}>
                            {player.username}: {player.completed ? '✓' : '...'}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Switch for 简单/详细 */}
                  <div style={{ margin: '10px 0', textAlign: 'center', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
                    <button
                      className={answerViewMode === 'simple' ? 'active' : ''}
                      style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #ccc', background: answerViewMode === 'simple' ? '#e0e0e0' : '#fff', cursor: 'pointer', color: 'inherit' }}
                      onClick={() => setAnswerViewMode('simple')}
                    >
                      简单
                    </button>
                    <button
                      className={answerViewMode === 'detailed' ? 'active' : ''}
                      style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #ccc', background: answerViewMode === 'detailed' ? '#e0e0e0' : '#fff', cursor: 'pointer', color: 'inherit'}}
                      onClick={() => setAnswerViewMode('detailed')}
                    >
                      详细
                    </button>
                    <div className="settings-row" style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '8px' }}>
                      <label style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => setIsGuessTableCollapsed(!isGuessTableCollapsed)}>
                        只显示最新3条
                      </label>
                      <input
                        type="checkbox"
                        checked={isGuessTableCollapsed}
                        onChange={(e) => setIsGuessTableCollapsed(e.target.checked)}
                      />
                    </div>
                  </div>
                  {answerViewMode === 'simple' ? (
                    <div className="guess-history-table">
                      <table>
                        <thead>
                          <tr>
                            {guessesHistory.map((playerGuesses, index) => (
                              <th key={playerGuesses.username}>
                                {showNames ? playerGuesses.username : `玩家${index + 1}`}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {(() => {
                            // 折叠时每个玩家只显示最新3条，需要计算每个玩家的显示范围
                            const collapsedLimit = 3;
                            const displayData = guessesHistory.map(playerGuesses => {
                              const total = playerGuesses.guesses.length;
                              const startIdx = isGuessTableCollapsed ? Math.max(0, total - collapsedLimit) : 0;
                              return {
                                username: playerGuesses.username,
                                displayGuesses: playerGuesses.guesses.slice(startIdx)
                              };
                            });
                            const maxDisplayRows = Math.max(...displayData.map(d => d.displayGuesses.length), 0);
                            return Array.from({ length: maxDisplayRows }).map((_, rowIndex) => (
                              <tr key={rowIndex}>
                                {displayData.map(playerData => (
                                  <td key={playerData.username}>
                                    {playerData.displayGuesses[rowIndex] && (
                                      <>
                                        <Image className="character-icon" src={playerData.displayGuesses[rowIndex].guessData.image} alt={playerData.displayGuesses[rowIndex].guessData.name} />
                                        <div className="character-name">{playerData.displayGuesses[rowIndex].guessData.name}</div>
                                        <div className="character-name-cn">{playerData.displayGuesses[rowIndex].guessData.nameCn}</div>
                                      </>
                                    )}
                                  </td>
                                ))}
                              </tr>
                            ));
                          })()}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div style={{ marginTop: 12 }}>
                      <GuessesTable
                        guesses={guesses}
                        gameSettings={gameSettings}
                        answerCharacter={answerCharacter}
                        collapsedCount={isGuessTableCollapsed ? 3 : 0}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {!isGameStarted && globalGameEnd && (
            // After game ends
            <div className="game-end-view-container">
              {isHost && (
                <>
                  <div className="host-controls">
                    <div className="room-url-container">
                      {isPublic && (
                        <input
                          type="text"
                          value={roomName}
                          placeholder="房间名（可选）"
                          maxLength={15}
                          className="room-name-input"
                          onChange={handleRoomNameChange}
                          onBlur={handleRoomNameBlur}
                          onKeyDown={handleRoomNameKeyDown}
                        />
                      )}
                      <input
                        type="text"
                        value={roomUrl}
                        readOnly
                        className="room-url-input"
                      />
                      <button onClick={copyRoomUrl} className="copy-button">复制</button>
                    </div>
                  </div>
                  <div className="host-game-controls">
                    <div className="button-group">
                      <div className="button-row">
                        <button
                          onClick={() => setShowSettings(true)}
                          className="settings-button"
                        >
                          设置
                        </button>
                        <button
                          onClick={handleVisibilityToggle}
                          className="visibility-button"
                        >
                          {isPublic ? '🔓公开' : '🔒私密'}
                        </button>
                        <button
                          onClick={handleStartGame}
                          className="start-game-button"
                          disabled={players.length < 2 || players.some(p => !p.isHost && !p.ready && !p.disconnected)}
                        >
                          开始
                        </button>
                        <button
                          onClick={handleManualMode}
                          className={`manual-mode-button ${isManualMode ? 'active' : ''}`}
                          disabled={players.length < 2 || players.some(p => !p.isHost && !p.ready && !p.disconnected)}
                        >
                          有人想出题？
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              )}
              <div className="game-end-message-table-wrapper">
                <table className="game-end-message-table">
                  <thead>
                    <tr>
                      <th className="game-end-header-cell">
                        <div className="game-end-header-content">
                          <div className="mode-tags">
                            {!gameSettings.nonstopMode && !gameSettings.syncMode && (
                              <span className="mode-tag normal">普通模式</span>
                            )}
                            {gameSettings.nonstopMode && (
                              <span className="mode-tag nonstop">血战模式</span>
                            )}
                            {gameSettings.syncMode && (
                              <span className="mode-tag sync">同步模式</span>
                            )}
                          </div>
                          <span className="answer-label">答案是</span>
                          {(() => {
                            // 判断当前玩家是否猜对
                            const currentPlayer = players.find(p => p.id === socket?.id);
                            const playerGuesses = currentPlayer?.guesses || '';
                            const isCurrentPlayerWin = playerGuesses.includes('✌') || playerGuesses.includes('👑') || playerGuesses.includes('🏆');
                            const isCurrentPlayerLose = playerGuesses.includes('💀') || playerGuesses.includes('🏳️');
                            const answerButtonClass = isCurrentPlayerWin ? 'answer-character-button win' : isCurrentPlayerLose ? 'answer-character-button lose' : 'answer-character-button';
                            return (
                              <button
                                className={answerButtonClass}
                                onClick={() => setShowCharacterPopup(true)}
                              >
                                {answerCharacter.nameCn || answerCharacter.name}
                              </button>
                            );
                          })()}
                          {/* 出题人信息（如果存在） */}
                          {(() => {
                            const setterInfo = scoreDetails?.find(item => item.type === 'setter');
                            if (!setterInfo) return null;
                            const scoreText = setterInfo.score >= 0 ? `+${setterInfo.score}分` : `${setterInfo.score}分`;
                            const boxClass = setterInfo.score > 0 ? 'player-score-box positive' : setterInfo.score < 0 ? 'player-score-box negative' : 'player-score-box';
                            const scoreClass = setterInfo.score > 0 ? 'positive' : setterInfo.score < 0 ? 'negative' : '';
                            return (
                              <span className="setter-info-inline">
                                ，出题人
                                <span className={boxClass}>
                                  <span className="player-name">{showNames ? setterInfo.username : '**'}</span>
                                  <span className={`score-value ${scoreClass}`}>
                                    {scoreText}
                                  </span>
                                  {setterInfo.reason && <span className="score-breakdown">{setterInfo.reason}</span>}
                                </span>
                              </span>
                            );
                          })()}
                          {scoreDetails && scoreDetails.length > 0 && (
                            <span className="score-details-title">，得分详情：</span>
                          )}
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="game-end-body-cell">
                        {/* 详细得分统计列表 */}
                        {scoreDetails && scoreDetails.length > 0 && (
                          <div className="score-details-list">
                            {(() => {
                              // 过滤出非出题人的条目，按得分降序排序
                              const sortedDetails = scoreDetails
                                .filter(item => item.type !== 'setter')
                                .sort((a, b) => {
                                  const scoreA = a.type === 'team' ? a.teamScore : a.score;
                                  const scoreB = b.type === 'team' ? b.teamScore : b.score;
                                  return scoreB - scoreA;
                                });
                              
                              return sortedDetails.map((item, idx) => {
                                const rank = idx + 1;
                                if (item.type === 'team') {
                                  // 团队得分 - 圆角矩形包裹
                                  const scoreText = item.teamScore >= 0 ? `+${item.teamScore}分` : `${item.teamScore}分`;
                                  const teamClass = item.teamScore > 0 ? 'team-box positive' : item.teamScore < 0 ? 'team-box negative' : 'team-box';
                                  return (
                                    <div key={`team-${item.teamId}`} className={teamClass}>
                                      <div className="team-header">
                                        <span className="player-rank">{rank}.</span>
                                        <span className="player-name">{showNames ? `队伍${item.teamId}` : `队伍${rank}`}</span>
                                        <span className={`score-value ${item.teamScore > 0 ? 'positive' : item.teamScore < 0 ? 'negative' : ''}`}>
                                          {scoreText}
                                        </span>
                                      </div>
                                      <div className="team-members">
                                        {item.members.map((m, mIdx) => {
                                          const memberScore = m.score >= 0 ? `+${m.score}分` : `${m.score}分`;
                                          const hasReason = m.breakdown && (m.breakdown.bigWin || m.breakdown.quickGuess || m.breakdown.rank || m.breakdown.partial);
                                          const reasonParts = [];
                                          if (m.breakdown?.bigWin) reasonParts.push('大赢家');
                                          if (m.breakdown?.quickGuess) reasonParts.push('好快的猜');
                                          if (m.breakdown?.partial) reasonParts.push('作品分');
                                          if (m.breakdown?.rank) reasonParts.push(`第${m.breakdown.rank}名`);
                                          const reasonText = reasonParts.join(' ');
                                          return (
                                            <span key={m.id} className="member-item">
                                              <span className="member-name">{showNames ? m.username : `成员${mIdx + 1}`}</span>
                                              <span className={`member-score ${m.score > 0 ? 'positive' : m.score < 0 ? 'negative' : ''}`}>
                                                {memberScore}
                                              </span>
                                              {hasReason && <span className="member-reason">{reasonText}</span>}
                                            </span>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  );
                                } else {
                                  // 个人得分 - 单行圆角矩形显示
                                  const scoreText = item.score >= 0 ? `+${item.score}分` : `${item.score}分`;
                                  const scoreClass = item.score > 0 ? 'positive' : item.score < 0 ? 'negative' : '';
                                  const boxClass = item.score > 0 ? 'player-score-box positive' : item.score < 0 ? 'player-score-box negative' : 'player-score-box';
                                  
                                  // 构建得分明细
                                  const breakdownParts = [];
                                  if (item.breakdown?.base) breakdownParts.push(`基础${item.breakdown.base > 0 ? '+' : ''}${item.breakdown.base}`);
                                  if (item.breakdown?.bigWin) breakdownParts.push(`大赢家+${item.breakdown.bigWin}`);
                                  if (item.breakdown?.quickGuess) breakdownParts.push(`好快的猜+${item.breakdown.quickGuess}`);
                                  if (item.breakdown?.partial) breakdownParts.push(`作品分+${item.breakdown.partial}`);
                                  if (item.breakdown?.rank) breakdownParts.push(`第${item.breakdown.rank}名`);
                                  const breakdownText = breakdownParts.length > 0 ? breakdownParts.join(' ') : '';
                                  
                                  return (
                                    <span key={item.id || idx} className={boxClass}>
                                      <span className="player-rank">{rank}.</span>
                                      <span className="player-name">{showNames ? item.username : `玩家${rank}`}</span>
                                      <span className={`score-value ${scoreClass}`}>{scoreText}</span>
                                      {breakdownText && <span className="score-breakdown">{breakdownText}</span>}
                                    </span>
                                  );
                                }
                              });
                            })()}
                          </div>
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="game-end-container">
                {!isHost && (
                  <>
                    {/* 调试信息*/}
                    {/* <pre style={{ fontSize: '12px', color: '#666', padding: '5px', background: '#f5f5f5' }}>
                      {JSON.stringify({...gameSettings, __debug: '显示原始数据用于调试'}, null, 2)}
                    </pre> */}
                    <GameSettingsDisplay settings={gameSettings} />
                  </>
                )}
                <div className="guess-history-table">
                  <table>
                    <thead>
                      <tr>
                        {guessesHistory.map((playerGuesses, index) => (
                          <th key={playerGuesses.username}>
                            {showNames ? playerGuesses.username : `玩家${index + 1}`}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: Math.max(...guessesHistory.map(g => g.guesses.length)) }).map((_, rowIndex) => (
                        <tr key={rowIndex}>
                          {guessesHistory.map(playerGuesses => (
                            <td key={playerGuesses.username}>
                              {playerGuesses.guesses[rowIndex] && (
                                <>
                                  <Image className="character-icon" src={playerGuesses.guesses[rowIndex].guessData.image} alt={playerGuesses.guesses[rowIndex].guessData.name} />
                                  <div className="character-name">{playerGuesses.guesses[rowIndex].guessData.name}</div>
                                  <div className="character-name-cn">{playerGuesses.guesses[rowIndex].guessData.nameCn}</div>
                                </>
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {showSettings && (
            <SettingsPopup
              gameSettings={gameSettings}
              onSettingsChange={handleSettingsChange}
              onClose={() => setShowSettings(false)}
              hideRestart={true}
              isMultiplayer={true}
            />
          )}

          {globalGameEnd && showCharacterPopup && answerCharacter && (
            <GameEndPopup
              result={guesses.some(g => g.isAnswer) ? 'win' : 'lose'}
              answer={answerCharacter}
              onClose={() => setShowCharacterPopup(false)}
            />
          )}

          {showSetAnswerPopup && (
            <SetAnswerPopup
              onSetAnswer={handleSetAnswer}
              gameSettings={gameSettings}
            />
          )}
        </>

      )}
    </div>
  );
};

export default Multiplayer;