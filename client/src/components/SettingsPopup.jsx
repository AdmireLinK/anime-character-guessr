import '../styles/popups.css';
import '../styles/SettingsPopup.css';
import { getIndexInfo, searchSubjects } from '../utils/bangumi';
import { useState, useEffect, useRef } from 'react';
import axiosCache from '../utils/cached-axios';
import { getPresetConfig } from '../data/presets';

// Helper Components
const Tooltip = ({ content }) => (
  <div className="tooltip-wrapper">
    <div className="tooltip-icon">?</div>
    <div className="tooltip-content" dangerouslySetInnerHTML={{ __html: content }} />
  </div>
);

const ToggleSwitch = ({ checked, onChange, disabled }) => (
  <div 
    className={`toggle-switch ${checked ? 'active' : ''}`} 
    onClick={() => !disabled && onChange(!checked)}
    style={{ cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1 }}
  >
    <div className="toggle-thumb" />
  </div>
);

function SettingsPopup({ gameSettings, onSettingsChange, onClose, onRestart, hideRestart = false, isMultiplayer = false }) {
  const [indexInputValue, setIndexInputValue] = useState('');
  const [indexInfo, setIndexInfo] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchContainerRef = useRef(null);
  const [hintInputs, setHintInputs] = useState(['8','5','3']);
  const [localSettings, setLocalSettings] = useState(() => JSON.parse(JSON.stringify(gameSettings)));

  // Handle click outside to close dropdown
  useEffect(() => {
    function handleClickOutside(event) {
      // Add a small delay to allow click events to complete
      setTimeout(() => {
        if (searchContainerRef.current && !searchContainerRef.current.contains(event.target)) {
          setSearchResults([]);
        }
      }, 100);
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Debounced search function
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (searchQuery.trim()) {
        handleSearch();
      } else {
        setSearchResults([]);
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  // Initialize indexInputValue and fetch indexInfo if indexId exists
  useEffect(() => {
    if (gameSettings.useIndex && gameSettings.indexId) {
      setIndexInputValue(gameSettings.indexId);
      getIndexInfo(gameSettings.indexId)
        .then(info => setIndexInfo(info))
        .catch(console.error);
    }
  }, []);

  useEffect(() => {
    if (Array.isArray(gameSettings.useHints) && gameSettings.useHints.length > 0) {
      // Always keep 3 inputs, fill with '' if less than 3
      const arr = gameSettings.useHints.map(String);
      while (arr.length < 3) arr.push('');
      setHintInputs(arr);
    } else {
      setHintInputs(['','','']);
    }
  }, [gameSettings.useHints]);

  // Enforce commonTags to be true
  useEffect(() => {
    if (!gameSettings.commonTags) {
      onSettingsChange('commonTags', true);
    }
  }, []);

  const setIndex = async (indexId) => {
    if (!indexId) {
      onSettingsChange('useIndex', false);
      onSettingsChange('indexId', null);
      setIndexInputValue('');
      setIndexInfo(null);
      return;
    }

    try {
      const info = await getIndexInfo(indexId);
      setIndexInputValue(indexId);
      setIndexInfo(info);
      onSettingsChange('useIndex', true);
      onSettingsChange('indexId', indexId);
    } catch (error) {
      console.error('Failed to fetch index info:', error);
      if (error.message === 'Index not found') {
        alert('目录不存在或者FIFA了');
      } else {
        alert('导入失败，请稍后重试');
      }
      // Reset index settings on error
      onSettingsChange('useIndex', false);
      onSettingsChange('indexId', null);
      setIndexInputValue('');
      setIndexInfo(null);
    }
  };

  const handleImport = async () => {
    if (!indexInputValue) {
      alert('请输入目录ID');
      return;
    }
    try {
      const info = await getIndexInfo(indexInputValue);
      setIndexInputValue(indexInputValue);
      setIndexInfo(info);
      onSettingsChange('useIndex', true); // 修复：确保useIndex为true
      onSettingsChange('indexId', indexInputValue);
    } catch (error) {
      console.error('Failed to fetch index info:', error);
      if (error.message === 'Index not found') {
        alert('目录不存在或者FIFA了');
      } else {
        alert('导入失败，请稍后重试');
      }
      // Reset index settings on error
      onSettingsChange('useIndex', false);
      onSettingsChange('indexId', null);
      setIndexInputValue('');
      setIndexInfo(null);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    
    setIsSearching(true);
    try {
      const results = await searchSubjects(searchQuery);
      setSearchResults(results);
    } catch (error) {
      console.error('Search failed:', error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleAddSubject = (subject) => {
    const newAddedSubjects = [
      ...gameSettings.addedSubjects,
      {
        id: subject.id,
        name: subject.name,
        name_cn: subject.name_cn,
        type: subject.type,
      }
    ];
    onSettingsChange('addedSubjects', newAddedSubjects);
    
    // Clear search
    setSearchQuery('');
    setSearchResults([]);
  };

  const handleRemoveSubject = (id) => {
    // Remove the subject from gameSettings
    const newAddedSubjects = gameSettings.addedSubjects.filter(subject => subject.id !== id);
    onSettingsChange('addedSubjects', newAddedSubjects);
  };

  const handleClearCache = () => {
    axiosCache.clearCache();
    alert('缓存已清空！');
  }

  const applyPresetConfig = async (presetName) => {
    const presetConfig = getPresetConfig(presetName);
    if (!presetConfig) return;
    
    // 处理所有普通配置项
    Object.entries(presetConfig).forEach(([key, value]) => {
      if (key !== 'indexId') { // 特殊处理indexId
        onSettingsChange(key, value);
      }
    });
    
    // 特殊处理indexId，确保使用setIndex函数
    if (presetConfig.useIndex && presetConfig.indexId) {
      await setIndex(presetConfig.indexId);
    } else {
      await setIndex(""); // 清除索引
    }
  };

  // 关闭时放弃本地更改（恢复到父级传入的 gameSettings）
  const handleClose = () => {
    setLocalSettings(JSON.parse(JSON.stringify(gameSettings)));
    onClose();
  };

  // 确认时只同步多人模式相关设置到全局（避免覆盖其他即时生效的设置）
  const handleConfirm = () => {
    if (isMultiplayer) {
      const keysToCommit = ['globalPick', 'tagBan', 'syncMode', 'nonstopMode'];
      keysToCommit.forEach((key) => {
        if (localSettings.hasOwnProperty(key)) onSettingsChange(key, localSettings[key]);
      });
    }
    // 在确认时触发重启（如果提供），并关闭弹窗
    if (typeof onRestart === 'function') onRestart();
    onClose();
  };

  return (
    <div className="popup-overlay">
      <div className="popup-content settings-popup">
        <div className="popup-header group-header" style={{ justifyContent: 'space-between', borderBottom: '1px solid #e5e7eb' }}>
          <div style={{ display: 'flex'}}>
            <h2 style={{ margin: 0 }}>设置</h2>
            <div className="header-subtitle" style={{ alignSelf: 'flex-end' }}>将鼠标移到各设置的标签上可以看到提示，移到输入框上可以看到数值范围</div>
          </div>
            <div className="header-actions">
            <button className="header-btn clear" onClick={handleClearCache} title="清空缓存">
              <i className="fas fa-trash"></i>
            </button>
            <button className="header-btn close" onClick={handleClose} title="关闭">
              <i className="fas fa-xmark"></i>
            </button>
            <button className="header-btn confirm" onClick={handleConfirm} title="确认修改">
              <i className="fas fa-check"></i>
            </button>
            </div>
        </div>
        
        <div className="settings-popup-content">
          <div className="settings-scroll-area">
            
            {isMultiplayer && (
              <div className="settings-group multiplayer-modes-group">
                <div className="group-header">
                    <h3 className="group-title">多人模式</h3>
                    <div className="group-subtitle">这些模式可以自由组合出2⁴=16种模式</div>
                  </div>
                <div className="multiplayer-modes-grid">
                  {/* 角色全局BP */}
                  <div 
                    className={`mode-card ${localSettings.globalPick ? 'active mode-red' : ''}`}
                    onClick={() => setLocalSettings(s => ({ ...s, globalPick: !s.globalPick }))}
                  >
                    <span className="mode-title">角色全局BP</span>
                    <p className="mode-desc">角色只能被猜一次</p>
                  </div>

                  {/* 标签全局BP */}
                  <div 
                    className={`mode-card ${localSettings.tagBan ? 'active mode-orange' : ''}`}
                    onClick={() => setLocalSettings(s => ({ ...s, tagBan: !s.tagBan }))}
                  >
                    <span className="mode-title">标签全局BP</span>
                    <p className="mode-desc">命中的标签会对别的玩家隐藏</p>
                  </div>

                  {/* 同步模式 */}
                  <div 
                    className={`mode-card ${localSettings.syncMode ? 'active mode-cyan' : ''}`}
                    onClick={() => setLocalSettings(s => ({ ...s, syncMode: !s.syncMode }))}
                  >
                    <span className="mode-title">同步模式</span>
                    <p className="mode-desc">全员猜完才进下一轮</p>
                  </div>

                  {/* 血战模式 */}
                  <div 
                    className={`mode-card ${localSettings.nonstopMode ? 'active mode-pink' : ''}`}
                    onClick={() => setLocalSettings(s => ({ ...s, nonstopMode: !s.nonstopMode }))}
                  >
                    <span className="mode-title">血战模式</span>
                    <p className="mode-desc">直到最后一人猜对或次数耗尽</p>
                  </div>
                </div>
              </div>
            )}

            {/* Group 1: Presets */}
            <div className="settings-group">
              <div className="group-header">
                <h3 className="group-title">预设配置</h3>
                <div className="group-subtitle">我们准备了一些开箱即用的难度配置，您可以直接选用</div>
                <div className="group-header-actions">
                    <button
                    className="action-btn"
                    onClick={() => {
                        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(gameSettings, null, 2));
                        const dlAnchorElem = document.createElement('a');
                        dlAnchorElem.setAttribute("href", dataStr);
                        dlAnchorElem.setAttribute("download", "gameSettings.json");
                        document.body.appendChild(dlAnchorElem);
                        dlAnchorElem.click();
                        document.body.removeChild(dlAnchorElem);
                    }}
                    >
                    <i className="fas fa-download"></i> 导出配置
                    </button>
                    <button
                    className="action-btn"
                    onClick={() => {
                        const input = document.createElement('input');
                        input.type = 'file';
                        input.accept = '.json,application/json';
                        input.onchange = (e) => {
                        const file = e.target.files[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = (event) => {
                            try {
                            const imported = JSON.parse(event.target.result);
                            Object.entries(imported).forEach(([key, value]) => {
                                onSettingsChange(key, value);
                            });
                            alert('设置已导入！');
                            } catch (err) {
                            alert('导入失败无效的JSON文件');
                            }
                        };
                        reader.readAsText(file);
                        };
                        input.click();
                    }}
                    >
                    <i className="fas fa-upload"></i> 导入配置
                    </button>
                </div>
              </div>
              <div className="presets-grid">
                {['入门', '冻鳗高手', '老番享受者', '瓶子严选', '木柜子痴', '二游高手', '米哈游高手', 'MOBA糕手'].map(preset => (
                   <button 
                    key={preset}
                    className="preset-card"
                    onClick={() => {
                        if (preset === '木柜子痴') alert('😅');
                        if (preset === '二游高手') alert('那很有生活了😅');
                        if (preset === 'MOBA糕手') alert('风暴要火');
                        applyPresetConfig(preset === '米哈游高手' ? '米哈游高手' : preset);
                    }}
                  >
                    {preset === '米哈游高手' ? '米哈游高高手' : preset}
                  </button>
                ))}
              </div>
            </div>

            {/* Group 2: Game Rules */}
            <div className="settings-group">
              <div className="group-header">
                <h3 className="group-title">猜测设置</h3>
                <div className="group-subtitle">影响和玩家猜测有关的内容</div>
              </div>

              {/* Row 1: Search, Rounds, Time */}
              <div className="settings-row compact-row">
                <div className="setting-item-compact">
                    <label className="settings-label" title="开启后，猜测时可以搜索一个作品中所有人物并从中选择">搜索作品</label>
                    <ToggleSwitch 
                      checked={gameSettings.subjectSearch}
                      onChange={(val) => onSettingsChange('subjectSearch', val)}
                    />
                </div>

                <div className="setting-item-compact">
                    <label className="settings-label" title="一名玩家一局游戏能猜测的次数"  style={{ marginLeft: "58.5px" }}>猜测次数（次）</label>
                    <div className="compact-input-container" title="数值范围 1-15">
                        <input 
                            className="compact-input"
                            type="number"
                            value={gameSettings.maxAttempts || ''}
                            onChange={(e) => {
                                const val = e.target.value;
                                if (val === '') {
                                    onSettingsChange('maxAttempts', '');
                                    return;
                                }
                                const num = parseInt(val);
                                if (!isNaN(num)) onSettingsChange('maxAttempts', Math.min(15, Math.max(1, num)));
                            }}
                            onBlur={() => {
                                if (!gameSettings.maxAttempts) onSettingsChange('maxAttempts', 10);
                            }}
                        />
                    </div>
                </div>

                <div className="setting-item-compact">
                    <label className="settings-label" title="每轮猜测的限制时间，设为0或留空时关闭" style={{ marginLeft: "1px" }}>时间限制（秒/轮）</label>
                    <div className="compact-input-container" title="数值范围 0, 15-120" style={{ marginLeft: "1px" }}>
                        <input 
                            className={`compact-input ${!gameSettings.timeLimit ? 'is-disabled' : ''}`}
                            type="text"
                            value={gameSettings.timeLimit || ''}
                            placeholder="∞"
                            onChange={(e) => {
                                const val = e.target.value;
                                if (val === '' || val === '0') {
                                    onSettingsChange('timeLimit', null);
                                    return;
                                }
                                const num = parseInt(val);
                                if (!isNaN(num)) {
                                    onSettingsChange('timeLimit', num);
                                }
                            }}
                            onBlur={() => {
                                if (gameSettings.timeLimit) {
                                    if (gameSettings.timeLimit < 15) onSettingsChange('timeLimit', 15);
                                    if (gameSettings.timeLimit > 120) onSettingsChange('timeLimit', 120);
                                }
                            }}
                            onFocus={(e) => e.target.select()}
                        />
                    </div>
                </div>
              </div>

              {/* Row 2: Hints */}
              <div className="settings-row compact-row">
                <div className="setting-item-compact">
                    <label className="settings-label" title="剩余x轮时显示一次文本提示，从左到右填入从大到小的数值，留空或为0时关闭" style={{ marginLeft: "1px" }}>文本提示（剩x轮）</label>
                    {[0, 1, 2].map((idx) => (
                        <div key={idx} className="compact-input-container" title={`数值范围 1-${gameSettings.maxAttempts || 15}`}>
                            <input
                                className={`compact-input ${(!hintInputs[idx] || hintInputs[idx] === '0') ? 'is-disabled' : ''}`}
                                type="text"
                                value={hintInputs[idx] || ''}
                                placeholder="-"
                                onChange={e => {
                                  const newInputs = [...hintInputs];
                                  let val = e.target.value;
                                  if (val === '' || val === '0') {
                                    newInputs[idx] = '';
                                  } else {
                                    if (/^\d*$/.test(val)) {
                                        let numVal = Number(val);
                                        const max = gameSettings.maxAttempts || 15;
                                        if (numVal > max) numVal = max;
                                        
                                        val = String(Math.floor(numVal));
                                        if (idx > 0 && newInputs[idx-1] && Number(val) >= Number(newInputs[idx-1])) {
                                            for (let i = idx; i < 3; i++) newInputs[i] = '';
                                        } else {
                                            newInputs[idx] = val;
                                        }
                                    }
                                  }
                                  setHintInputs(newInputs);
                                  
                                  const arr = [];
                                  for (let i = 0; i < 3; i++) {
                                    const n = parseInt(newInputs[i], 10);
                                    if (!isNaN(n) && (i === 0 || n < (arr[i-1] || 999))) {
                                      arr.push(n);
                                    } else {
                                      break;
                                    }
                                  }
                                  onSettingsChange('useHints', arr);
                                }}
                                onFocus={(e) => e.target.select()}
                            />
                        </div>
                    ))}
                </div>

                <div className="setting-item-compact">
                  <label className="settings-label" title={`剩余x轮时显示图片提示，留空或为0时关闭。数值范围 0-${gameSettings.maxAttempts || 15}`}>图片提示（剩x轮）</label>
                  <div className="compact-input-container" title={`数值范围 0-${gameSettings.maxAttempts || 15}`}>
                    <input 
                      className={`compact-input ${!gameSettings.useImageHint ? 'is-disabled' : ''}`}
                      type="number"
                      min="0"
                      max={gameSettings.maxAttempts || 15}
                      value={gameSettings.useImageHint || ''}
                      placeholder="-"
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '' || val === '0') {
                          onSettingsChange('useImageHint', 0);
                          return;
                        }
                        const num = parseInt(val);
                        const max = gameSettings.maxAttempts || 15;
                        if (!isNaN(num)) onSettingsChange('useImageHint', Math.min(max, Math.max(0, num)));
                      }}
                      onFocus={(e) => e.target.select()}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Group 3: Question Scope */}
            <div className="settings-group">
              <div className="group-header">
                <h3 className="group-title">答案设置</h3>
                <div className="group-subtitle">影响和答案角色有关的内容</div>
              </div>

              {/* Row 1: Subject Filter & Related Games */}
              <div className="settings-row compact-row">
                <div className="setting-item-compact" style={{ gap: '16px' }}>
                    <label className="settings-label" style={{ marginBottom: 0, whiteSpace: 'nowrap'}} title="这行选项同时会影响登场作品的信息&#10;比如不想让剧场版计入登场数据，可以只勾选'TV'。&#10;当'使用目录'生效时，这行选项不会影响正确答案的抽取，只会影响表格内显示的信息。">作品筛选</label>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <select 
                          className="settings-select"
                          value={gameSettings.metaTags[0] || ''}
                          onChange={(e) => {
                            const newMetaTags = [...gameSettings.metaTags];
                            newMetaTags[0] = e.target.value;
                            onSettingsChange('metaTags', newMetaTags);
                          }}
                        >
                          <option value="">全部分类</option>
                          <option value="TV">TV</option>
                          <option value="WEB">WEB</option>
                          <option value="OVA">OVA</option>
                          <option value="剧场版">剧场版</option>
                          <option value="动态漫画">动态漫画</option>
                          <option value="其他">其他</option>
                        </select>

                        <select 
                          className="settings-select"
                          value={gameSettings.metaTags[1] || ''}
                          onChange={(e) => {
                            const newMetaTags = [...gameSettings.metaTags];
                            newMetaTags[1] = e.target.value;
                            onSettingsChange('metaTags', newMetaTags);
                          }}
                        >
                          <option value="">全部来源</option>
                          <option value="原创">原创</option>
                          <option value="漫画改">漫画改</option>
                          <option value="游戏改">游戏改</option>
                          <option value="小说改">小说改</option>
                        </select>

                        <select 
                          className="settings-select"
                          value={gameSettings.metaTags[2] || ''}
                          onChange={(e) => {
                            const newMetaTags = [...gameSettings.metaTags];
                            newMetaTags[2] = e.target.value;
                            onSettingsChange('metaTags', newMetaTags);
                          }}
                        >
                          <option value="">全部类型</option>
                          <option value="科幻">科幻</option>
                          <option value="喜剧">喜剧</option>
                          <option value="百合">百合</option>
                          <option value="校园">校园</option>
                          <option value="惊悚">惊悚</option>
                          <option value="后宫">后宫</option>
                          <option value="机战">机战</option>
                          <option value="悬疑">悬疑</option>
                          <option value="恋爱">恋爱</option>
                          <option value="奇幻">奇幻</option>
                          <option value="推理">推理</option>
                          <option value="运动">运动</option>
                          <option value="耽美">耽美</option>
                          <option value="音乐">音乐</option>
                          <option value="战斗">战斗</option>
                          <option value="冒险">冒险</option>
                          <option value="萌系">萌系</option>
                          <option value="穿越">穿越</option>
                          <option value="玄幻">玄幻</option>
                          <option value="乙女">乙女</option>
                          <option value="恐怖">恐怖</option>
                          <option value="历史">历史</option>
                          <option value="日常">日常</option>
                          <option value="剧情">剧情</option>
                          <option value="武侠">武侠</option>
                          <option value="美食">美食</option>
                          <option value="职场">职场</option>
                        </select>
                    </div>
                </div>

                <div className="setting-item-compact" style={{gap: '8px' }}>
                    <label className="settings-label" title="计算登场作品（年份、分数）时会包括游戏。&#10;但是，答案角色还是只会从动画中选取，因为游戏的热度榜有bug。&#10;如果想要猜游戏角色，可以自创一个目录或者添加额外作品。">包含游戏作品数据</label>
                    <ToggleSwitch 
                        checked={gameSettings.includeGame}
                        onChange={(val) => onSettingsChange('includeGame', val)}
                    />
                </div>
              </div>

              {/* Row 2: Year Range & Popularity Range */}
              <div className="settings-row compact-row">
                <div className="setting-item-compact" style={{ gap: '16px' }}>
                    <label className="settings-label" title="开启目录时不可用">年份范围</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <div className="compact-input-container" style={{ width: '78px' }} title="数值范围1800-2038">
                            <input 
                                className="compact-input"
                                type="number" 
                                value={gameSettings.startYear || ''}
                                onChange={(e) => {
                                    const value = e.target.value === '' ? 1800 : parseInt(e.target.value);
                                    onSettingsChange('startYear', value);
                                }}
                                min="1800"
                                max="2038"
                                disabled={gameSettings.useIndex}
                            />
                        </div>
                        <span>-</span>
                        <div className="compact-input-container" style={{ width: '78px' }} title="数值范围1800-2038">
                            <input 
                                className="compact-input"
                                type="number" 
                                value={gameSettings.endYear || ''}
                                onChange={(e) => {
                                    const value = e.target.value === '' ? 2038 : parseInt(e.target.value);
                                    onSettingsChange('endYear', value);
                                }}
                                min="1800"
                                max="2038"
                                disabled={gameSettings.useIndex}
                            />
                        </div>
                    </div>
                </div>

                <div className="setting-item-compact" style={{ gap: '16px' }}>
                    <label className="settings-label" title="使用年榜时会先抽取某一年份，再从中抽取作品。&#10;削弱了新番热度的影响。&#10;利好老二次元！&#10;开启目录时不可用">热度范围</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div className="toggle-text-switch">
                            <span 
                                className={!gameSettings.useSubjectPerYear ? 'active' : ''} 
                                onClick={() => !gameSettings.useIndex && onSettingsChange('useSubjectPerYear', false)}
                                style={gameSettings.useIndex ? { cursor: 'not-allowed', color: '#bdbdbd' } : { cursor: 'pointer' }}
                                title={gameSettings.useIndex ? '使用目录时不可切换' : ''}
                            >总榜</span>
                            <span 
                                className={gameSettings.useSubjectPerYear ? 'active' : ''} 
                                onClick={() => !gameSettings.useIndex && onSettingsChange('useSubjectPerYear', true)}
                                style={gameSettings.useIndex ? { cursor: 'not-allowed', color: '#bdbdbd' } : { cursor: 'pointer' }}
                                title={gameSettings.useIndex ? '使用目录时不可切换' : ''}
                            >年榜</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div className="compact-input-container" style={{ width: '60px' }} title="前N部">
                                <input 
                                    className="compact-input"
                                    type="number" 
                                    value={gameSettings.topNSubjects === undefined ? '' : gameSettings.topNSubjects}
                                    onChange={(e) => {
                                        const value = e.target.value === '' ? 100 : Math.max(0, parseInt(e.target.value));
                                        onSettingsChange('topNSubjects', value);
                                    }}
                                    min="0"
                                    max="1000"
                                    disabled={gameSettings.useIndex}
                                />
                            </div>
                            <span style={{ fontSize: '13px', marginLeft: '8px' }}>部</span>
                        </div>
                    </div>
                </div>
              </div>

              {/* Row 3: Character Count, Tag Count */}
              <div className="settings-row compact-row">
                <div className="setting-item-compact" style={{ gap: '16px' }}>
                    <label className="settings-label"  title="作品中至少有多少名角色，设为0或留空时仅包含主角">角色数量</label>
                    <div className="compact-input-container" title="数值范围 >=0">
                        <input 
                            className="compact-input"
                            type="number"
                            value={gameSettings.mainCharacterOnly ? '' : (gameSettings.characterNum || '')}
                            placeholder="仅主角"
                            onChange={(e) => {
                                const val = e.target.value;
                                if (val === '' || val === '0') {
                                    onSettingsChange('mainCharacterOnly', true);
                                    onSettingsChange('characterNum', 1);
                                } else {
                                    onSettingsChange('mainCharacterOnly', false);
                                    onSettingsChange('characterNum', Math.max(1, Math.min(10, parseInt(val))));
                                }
                            }}
                        />
                    </div>
                </div>

                <div className="setting-item-compact" style={{ marginLeft: '90.4px', gap: '16px' }}>
                    <label className="settings-label" title="猜测时显示的来自作品和角色的标签数量">标签数量</label>
                    <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                            <span style={{ fontSize: '13px', color: '#4b5563' }}>角色</span>
                            <div className="compact-input-container" style={{ width: '50px' }} title="数值范围1-10">
                                <input 
                                    className="compact-input"
                                    type="number"
                                    value={gameSettings.characterTagNum || ''}
                                    onChange={(e) => onSettingsChange('characterTagNum', Math.max(0, Math.min(10, parseInt(e.target.value) || 0)))}
                                />
                            </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                            <span style={{ fontSize: '13px', color: '#4b5563' }}>作品</span>
                            <div className="compact-input-container" style={{ width: '50px' }} title="数值范围1-10">
                                <input 
                                    className="compact-input"
                                    type="number"
                                    value={gameSettings.subjectTagNum || ''}
                                    onChange={(e) => onSettingsChange('subjectTagNum', Math.max(0, Math.min(10, parseInt(e.target.value) || 0)))}
                                />
                            </div>
                        </div>
                    </div>
                </div>
              </div>

              {/* Row 4: Catalog & Extra Subjects */}
              <div className="settings-row compact-row" style={{ alignItems: 'center' }}>
                <div className="setting-item-compact" style={{ gap: '16px' }}>
                    <label className="settings-label"  title="勾选时，正确答案只会从目录（+额外作品）中抽取。&#10;目录id为bangumi.tv/index/目录id">使用目录</label>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'left' }}>
                        <div className="compact-input-container">
                            <input 
                                className="compact-input"
                                type="text"
                                value={indexInputValue}
                                placeholder="目录ID"
                                onChange={(e) => setIndexInputValue(e.target.value)}
                            />
                        </div>
                        <button className="action-btn" onClick={handleImport} style={{ padding: '6px 12px', height: '32px' }}>导入</button>
                    </div>
                </div>

                <div className="setting-item-compact" style={{ flex: 1, marginLeft: '30.8px', gap: '16px' }}>
                    <label className="settings-label" style={{ whiteSpace: 'nowrap' }}>额外作品</label>
                    <div className="search-container-compact" ref={searchContainerRef} >
                            <input 
                                className="large-input"
                                type="text"
                                style={{ width: '214px' }}
                                placeholder="搜索作品..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSearch();
                                }}
                            />
                        {searchResults.length > 0 && (
                            <div className="search-results-list">
                                {searchResults.map((subject) => (
                                <div 
                                    key={subject.id} 
                                    className="search-result-item"
                                    onMouseDown={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        handleAddSubject(subject);
                                    }}
                                >
                                    <span className="result-title">{subject.name}</span>
                                    <span className="result-meta">{subject.name_cn || ''} ({subject.type})</span>
                                </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
              </div>

              {/* Combined Display Area */}
              {(gameSettings.useIndex || gameSettings.addedSubjects.length > 0) && (
                  <div className="combined-display-area">
                      {gameSettings.useIndex && indexInfo && (
                          <div className="catalog-info" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <a
                              href={`https://bangumi.tv/index/${gameSettings.indexId}`}
                              target='_blank'
                              rel='noopener noreferrer'
                              style={{ textDecoration: 'none', color: '#2563eb', fontWeight: 500 }}
                            >
                              {indexInfo.title}
                            </a>
                            <span style={{ color: '#888' }}>共 {indexInfo.total} 部作品</span>
                            <button
                              className="tag-remove-btn"
                              title="移除目录"
                              onClick={() => { onSettingsChange('useIndex', false); onSettingsChange('indexId', ''); }}
                            >×</button>
                          </div>
                      )}
                      
                      {gameSettings.addedSubjects.length > 0 && (
                          <div className="extra-subjects-list">
                              {gameSettings.addedSubjects.map((subject) => (
                                  <div key={subject.id} className="subject-tag-large">
                                      <a href={`https://bangumi.tv/subject/${subject.id}`} target="_blank" rel="noopener noreferrer">{subject.name}</a>
                                      <button 
                                          className="tag-remove-btn"
                                          onClick={() => handleRemoveSubject(subject.id)}
                                      >
                                          ×
                                      </button>
                                  </div>
                              ))}
                          </div>
                      )}
                  </div>
              )}
            </div>

          </div>
        </div>

        {isMultiplayer && !hideRestart && (
          <div className="popup-footer-new">
              <div className="footer-left">
                <span className="footer-hint">*设置改动点了才会生效！否则下一把生效</span>
              </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default SettingsPopup;
