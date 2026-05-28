import React, { useState, useEffect } from 'react';
import Image from './Image';

const PLAYER_LIST_TEXT = {
  zh: {
    none: '无',
    spectate: '旁观',
    host: '房主',
    disconnected: '已断开',
    settingAnswer: '出题中',
    ready: '已准备',
    choose: '选择',
    cancelReady: '取消准备',
    readyButton: '准备',
    notReady: '未准备',
    team: '队',
    name: '名',
    anonymousName: '无名',
    score: '分',
    guesses: '猜',
    actions: '操作',
    messagePlaceholder: '请友好交流（比心）',
    answerSetter: '出题者',
    kick: '踢出',
    transferHost: '转移房主'
  },
  en: {
    none: 'None',
    spectate: 'Spectator',
    host: 'Host',
    disconnected: 'Disconnected',
    settingAnswer: 'Setting Answer',
    ready: 'Ready',
    choose: 'Select',
    cancelReady: 'Cancel',
    readyButton: 'Ready',
    notReady: 'Unready',
    team: 'Team',
    name: 'Name',
    anonymousName: 'Anon',
    score: 'Score',
    guesses: 'Guesses',
    actions: 'Actions',
    messagePlaceholder: 'Say something nice :)',
    answerSetter: 'AnswerSetter',
    kick: 'Kick',
    transferHost: 'Transfer Host'
  }
};

const PlayerList = ({ players, socket, isGameStarted, handleReadyToggle, onAnonymousModeChange, isManualMode, isHost, answerSetterId, onSetAnswerSetter, onKickPlayer, onTransferHost, onMessageChange, onTeamChange, locale = 'zh' }) => {
  const text = PLAYER_LIST_TEXT[locale] || PLAYER_LIST_TEXT.zh;
  const [showNames, setShowNames] = useState(true);
  const [waitingForAnswer, setWaitingForAnswer] = useState(false);
  const [activeMenu, setActiveMenu] = useState(null);
  const [editingMessagePlayerId, setEditingMessagePlayerId] = useState(null);
  const [messageDraft, setMessageDraft] = useState("");

  const teamOptions = [
    { value: '', label: text.none },
    { value: '0', label: text.spectate },
    ...Array.from({ length: 8 }, (_, i) => ({ value: (i + 1).toString(), label: (i + 1).toString() }))
  ];

  // Add socket event listener for waitForAnswer
 useEffect(() => {
    if (socket) {
      socket.on('waitForAnswer', () => {
        setWaitingForAnswer(true);
      });

      // Reset waiting state when game starts
      socket.on('gameStart', () => {
        setWaitingForAnswer(false);
      });
    }
  }, [socket]);

  // Add click outside handler to close menu
  useEffect(() => {
    function handleClickOutside(event) {
      if (activeMenu && !event.target.closest('.player-actions')) {
        setActiveMenu(null);
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [activeMenu]);

  const handleShowNamesToggle = () => {
    const newShowNames = !showNames;
    setShowNames(newShowNames);
    if (onAnonymousModeChange) {
      onAnonymousModeChange(newShowNames);
    }
  };

  const getStatusDisplay = (player) => {
    const host = <span><i className={`fas fa-crown`}></i>{text.host}</span>
    if (player.disconnected) {
      return renderStyledSpan(text.disconnected,'red');
    }

    // Use answerSetterId prop as the primary source of truth for "waiting for answer" state
    // This ensures late joiners or refreshed clients see the correct status
    if ((waitingForAnswer || answerSetterId) && !isGameStarted) {
      if (player.id === answerSetterId) {
        return renderStyledSpan(text.settingAnswer,'orange');
      }
      if (player.isHost) {
        return host;
      }
      return renderStyledSpan(text.ready,'green');
    }

    if (isManualMode && !isGameStarted && isHost) {
      if (player.id === answerSetterId) {
        return <button className="ready-button ready">{text.settingAnswer}</button>;
      }
      return <button className="ready-button">{text.choose}</button>;
    }

    if (player.isHost) {
      return host;
    }

    if (player.id === socket?.id && !isGameStarted) {
      return (
        <button 
          onClick={handleReadyToggle}
          className={`ready-button ${player.ready ? 'ready' : ''}`}
        >
          {player.ready ? text.cancelReady : text.readyButton}
        </button>
      );
    }

    return player.ready ? renderStyledSpan(text.ready,'green') : renderStyledSpan(text.notReady);
  };

  const renderStyledSpan = (text, color = "inherit") => (
    <span style={{ color }}>{text}</span>
  );

  const handlePlayerClick = (player) => {
    if (isHost && isManualMode && !isGameStarted && !waitingForAnswer) {
      onSetAnswerSetter(player.id);
    }
  };

  const handleKickClick = (e, playerId) => {
    e.stopPropagation(); // 阻止事件冒泡，防止触发行点击事件
    if (onKickPlayer) {
      onKickPlayer(playerId);
    }
  };

  const handleTransferHostClick = (e, playerId) => {
    e.stopPropagation(); // 阻止事件冒泡，防止触发行点击事件
    if (onTransferHost) {
      onTransferHost(playerId);
    }
  };

  const handleTeamChange = (playerId, newTeam) => {
    if (onTeamChange) {
      onTeamChange(playerId, newTeam);
    }
  };

  return (
    <div className="players-list">
      <table className="score-table">
        <thead>
          <tr>
            <th></th>
            <th>{text.team}</th>
            <th></th>
            <th>
              <button className='table-head-name-button'
                onClick={handleShowNamesToggle}>
                {showNames ? text.name : text.anonymousName}
              </button>
            </th>
            <th>{text.score}</th>
            <th>{text.guesses}</th>
            {isHost && <th><span style={{ width: "100px",display:"block" }}>{text.actions}</span></th>}
          </tr>
        </thead>
        <tbody>
          {players.map((player) => (
            <tr 
              key={player.id}
              onClick={() => handlePlayerClick(player)}
              style={{
                cursor: isHost && isManualMode && !isGameStarted && !waitingForAnswer ? 'pointer' : 'default'
              }}
            >
              <td>
                {getStatusDisplay(player)}
              </td>
              <td>
                {socket?.id === player.id && !player.ready && !isGameStarted ? (
                  <select
                    value={player.team || ''}
                    onChange={e => handleTeamChange(player.id, e.target.value)}
                    style={{ minWidth: '40px', background: 'inherit', color: 'inherit' }}
                  >
                    {teamOptions.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                ) : (
                  <span>{player.team === '0' ? text.spectate : (player.team ? player.team : text.none)}</span>
                )}
              </td>
              <td>
                {player.avatarId && player.avatarImage && (
                  <Image 
                    src={player.avatarImage} 
                    className="player-avatar" 
                    alt={player.memo ? player.memo : player.avatarName ? player.avatarName : player.username || 'avatar'} />
                )}
              </td>
              <td>
                {socket?.id === player.id && editingMessagePlayerId === player.id ? (
                  <input
                    type="text"
                    value={messageDraft}
                    placeholder={text.messagePlaceholder}
                    autoFocus
                    maxLength={15}
                    style={{ width: '90%' }}
                    onChange={e => setMessageDraft(e.target.value)}
                    onBlur={() => {
                      setEditingMessagePlayerId(null);
                      if (onMessageChange) onMessageChange(messageDraft);
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        setEditingMessagePlayerId(null);
                        if (onMessageChange) onMessageChange(messageDraft);
                      }
                    }}
                  />
                ) : (
                  <span
                    style={{
                      backgroundColor: !showNames && player.id !== socket?.id ? '#000' : 'transparent',
                      color: !showNames && player.id !== socket?.id ? '#000' : 'inherit',
                      padding: !showNames && player.id !== socket?.id ? '2px 4px' : '0',
                      cursor: socket?.id === player.id ? 'pointer' : 'default',
                    }}
                    onClick={() => {
                      if (socket?.id === player.id) {
                        setEditingMessagePlayerId(player.id);
                        setMessageDraft(player.message || "");
                      }
                    }}
                  >
                    {player.username}
                    {player.message && (
                      <span>
                        : "{player.message}"
                      </span>
                    )}
                  </span>
                )}
              </td>
              <td>{player.score}</td>
              <td>{isGameStarted && player.isAnswerSetter ? text.answerSetter : player.guesses || ''}</td>
              {isHost && player.id !== socket?.id && (
                <td>
                  <div className="player-actions" style={{ position: 'relative' }}>
                    <button 
                      className="action-menu-button"
                      onClick={(e) => {
                        e.stopPropagation();
                        // 切换显示该玩家的操作菜单
                        setActiveMenu(activeMenu === player.id ? null : player.id);
                      }}
                    >
                      ⚙️ {text.actions}
                    </button>
                    
                    {activeMenu === player.id && (
                      <div className="action-dropdown">
                        <button className='action-button'
                          onClick={(e) => {
                            e.stopPropagation();
                            handleKickClick(e, player.id);
                            setActiveMenu(null);
                          }}
                          >
                          <span>❌</span> {text.kick}
                        </button>
                        
                        {!player.disconnected && (
                          <button className='action-button'
                            onClick={(e) => {
                              e.stopPropagation();
                              handleTransferHostClick(e, player.id);
                              setActiveMenu(null);
                            }}
                            style={{ color: '#007bff' , borderBottom: '0px' }}
                            >
                            <span>👑</span> {text.transferHost}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default PlayerList; 
