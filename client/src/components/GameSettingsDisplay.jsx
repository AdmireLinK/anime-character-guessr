import React from 'react';
import { matchPreset } from '../data/presets';
import '../styles/GameSettingsDisplay.css';
/*这是多人游戏参与者视角，游戏设置的相关内容*/
/**
 * 游戏设置显示组件 - 将JSON格式的游戏设置转换为中文可视化显示
 * 
 * @param {Object} props
 * @param {Object} props.settings - 游戏设置对象
 * @param {string} props.title - 显示标题，默认为"该房间的题库范围"
 * @param {boolean} props.collapsible - 是否可折叠，默认为true
 * @param {boolean} props.defaultExpanded - 默认是否展开，默认为true
 */
const DISPLAY_TEXT = {
  zh: {
    title: '该房间的游戏设置',
    loading: '加载中...',
    yes: '是',
    no: '否',
    unset: '未设置',
    unused: '未使用',
    default: '默认',
    none: '无',
    seconds: '秒',
    unlimited: '无限制',
    modified: '(房主有修改此预设)',
    normalMode: '普通模式',
    globalPick: '角色全局BP',
    tagBan: '标签全局BP',
    syncMode: '同步模式',
    nonstopMode: '血战模式',
    labels: {
      yearRange: '作品时间范围',
      topNSubjects: '热度排行榜作品数',
      useSubjectPerYear: '每年独立计算热度',
      metaTags: '分类筛选',
      useIndex: '使用指定目录',
      indexId: '目录ID',
      mainCharacterOnly: '仅主角',
      characterNum: '每个作品的角色数',
      maxAttempts: '最大尝试次数',
      useHints: '提示出现次数',
      useImageHint: '图片提示',
      timeLimit: '时间限制',
      subjectSearch: '启用作品搜索',
      characterTagNum: '角色标签数量',
      subjectTagNum: '作品标签数量'
    },
    groups: {
      scope: '作品范围',
      index: '目录设置',
      character: '角色设置',
      rules: '游戏规则'
    }
  },
  en: {
    title: 'Room Settings',
    loading: 'Loading...',
    yes: 'Yes',
    no: 'No',
    unset: 'Unset',
    unused: 'Unused',
    default: 'Default',
    none: 'None',
    seconds: 'sec',
    unlimited: 'Unlimited',
    modified: '(modified by host)',
    normalMode: 'Normal Mode',
    globalPick: 'Global Character Ban',
    tagBan: 'Global Tag Ban',
    syncMode: 'Sync Mode',
    nonstopMode: 'Endless Mode',
    labels: {
      yearRange: 'Subject Year Range',
      topNSubjects: 'Subject Pool Size',
      useSubjectPerYear: 'Per-Year Ranking',
      metaTags: 'Meta Filters',
      useIndex: 'Use Index',
      indexId: 'Index ID',
      mainCharacterOnly: 'Main Characters Only',
      characterNum: 'Characters per Subject',
      maxAttempts: 'Max Attempts',
      useHints: 'Text Hint Triggers',
      useImageHint: 'Image Hint',
      timeLimit: 'Time Limit',
      subjectSearch: 'Allow Subject Search',
      characterTagNum: 'Character Tag Number',
      subjectTagNum: 'Subject Tag Number'
    },
    groups: {
      scope: 'Subject Scope',
      index: 'Index',
      character: 'Characters',
      rules: 'Game Rules'
    }
  }
};

const META_TAG_LABELS = {
  en: {
    全部: 'All',
    游戏: 'Games',
    书籍: 'Books',
    三次元: 'Media',
    剧场版: 'Movie',
    动态漫画: 'Motion comic',
    其他: 'Other',
    原创: 'Original',
    漫画改: 'Manga adaptation',
    游戏改: 'Game adaptation',
    小说改: 'Novel adaptation'
  }
};

const GameSettingsDisplay = ({ 
  settings, 
  title,
  collapsible = true,
  defaultExpanded = true,
  locale = 'zh'
}) => {
  const text = DISPLAY_TEXT[locale] || DISPLAY_TEXT.zh;
  const displayTitle = title || text.title;
  const [isExpanded, setIsExpanded] = React.useState(defaultExpanded);

  // 如果没有settings或settings是空对象，显示提示信息
  if (!settings || Object.keys(settings).length === 0) {
    return (
      <div className="game-settings-display">
        <div className="settings-display-header">
          <h3>{displayTitle}</h3>
        </div>
        <div className="settings-display-content">
          <div className="settings-group">
            <div className="settings-items">
              <div className="settings-item">
                <span className="setting-value">{text.loading}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 使用共享预设匹配函数获取预设信息
  const presetInfo = matchPreset(settings);

  // 将布尔值转换为中文显示
  const boolToText = (value) => value ? text.yes : text.no;

  // 将主要设置项映射为中文
  const settingLabels = {
    // 时间范围
    yearRange: {
      label: text.labels.yearRange,
      value: `${settings.startYear || text.unset} - ${settings.endYear || text.unset}`
    },
    // 热度设置
    topNSubjects: {
      label: text.labels.topNSubjects,
      value: settings.topNSubjects || text.unset
    },
    useSubjectPerYear: {
      label: text.labels.useSubjectPerYear,
      value: boolToText(settings.useSubjectPerYear)
    },
    // 筛选设置
    metaTags: {
      label: text.labels.metaTags,
      value: getMetaTagsText(settings.metaTags)
    },
    // 目录设置
    useIndex: {
      label: text.labels.useIndex,
      value: boolToText(settings.useIndex)
    },
    indexId: {
      label: text.labels.indexId,
      value: settings.indexId || text.unused
    },
    // 角色设置
    mainCharacterOnly: {
      label: text.labels.mainCharacterOnly,
      value: boolToText(settings.mainCharacterOnly)
    },
    characterNum: {
      label: text.labels.characterNum,
      value: settings.characterNum || text.default
    },
    // 游戏设置
    maxAttempts: {
      label: text.labels.maxAttempts,
      value: settings.maxAttempts || '10'
    },
    useHints: {
      label: text.labels.useHints,
      value: Array.isArray(settings.useHints) && settings.useHints.length > 0 ? settings.useHints.join(',') : text.none
    },
    useImageHint: {
      label: text.labels.useImageHint,
      value: settings.useImageHint || text.none
    },
    timeLimit: {
      label: text.labels.timeLimit,
      value: settings.timeLimit ? `${settings.timeLimit}${text.seconds}` : text.unlimited
    },
    subjectSearch: {
      label: text.labels.subjectSearch,
      value: boolToText(settings.subjectSearch)
    },
    globalPick: {
      label: text.globalPick,
      value: boolToText(settings.globalPick)
    },
    tagBan: {
      label: text.tagBan,
      value: boolToText(settings.tagBan)
    },
    // 标签设置
    characterTagNum: {
      label: text.labels.characterTagNum,
      value: settings.characterTagNum || text.default
    },
    subjectTagNum: {
      label: text.labels.subjectTagNum,
      value: settings.subjectTagNum || text.default
    },
    // 多人模式设置
    syncMode: {
      label: text.syncMode,
      value: boolToText(settings.syncMode)
    },
    nonstopMode: {
      label: text.nonstopMode,
      value: boolToText(settings.nonstopMode)
    }
  };

  // 解析元标签
  function getMetaTagsText(metaTags) {
    if (!metaTags || !Array.isArray(metaTags) || metaTags.length === 0) return text.none;
    
    const validTags = metaTags.filter(tag => tag && typeof tag === 'string' && tag.trim() !== '');
    if (validTags.length === 0) return text.none;
    
    return validTags.map(tag => META_TAG_LABELS[locale]?.[tag] || tag).join(locale === 'en' ? ', ' : '、');
  }

  // 根据设置类型对设置项进行分组
  const settingGroups = {
    [text.groups.scope]: ['yearRange', 'topNSubjects', 'useSubjectPerYear', 'metaTags'],
    [text.groups.index]: ['useIndex', 'indexId'],
    [text.groups.character]: ['mainCharacterOnly', 'characterNum', 'characterTagNum'],
    [text.groups.rules]: ['maxAttempts', 'useHints', 'timeLimit', 'subjectSearch', 'subjectTagNum']
  };

  const toggleExpand = () => {
    if (collapsible) {
      setIsExpanded(!isExpanded);
    }
  };

  return (
    <div className="game-settings-display">
      <div 
        className={`settings-display-header ${collapsible ? 'collapsible' : ''}`}
        onClick={toggleExpand}
      >
        <div className="settings-title-container">
          <h3>{displayTitle}</h3>
          <div className="header-info-row">
            {presetInfo.name && (
              <div className="preset-info">
                <span className="preset-name">{presetInfo.name}</span>
                {presetInfo.modified && (
                  <span className="preset-modified">{text.modified}</span>
                )}
              </div>
            )}
            <div className="mode-badges">
              {!settings.globalPick && !settings.tagBan && !settings.syncMode && !settings.nonstopMode && (
                <span className="mode-badge normal">{text.normalMode}</span>
              )}
              {settings.globalPick && (
                <span className="mode-badge global-pick">{text.globalPick}</span>
              )}
              {settings.tagBan && (
                <span className="mode-badge tag-ban">{text.tagBan}</span>
              )}
              {settings.syncMode && (
                <span className="mode-badge sync-mode">{text.syncMode}</span>
              )}
              {settings.nonstopMode && (
                <span className="mode-badge nonstop-mode">{text.nonstopMode}</span>
              )}
            </div>
          </div>
        </div>
        {collapsible && (
          <span className={`expand-icon ${isExpanded ? 'expanded' : ''}`}>
            {isExpanded ? '▼' : '▶'}
          </span>
        )}
      </div>

      {(isExpanded || !collapsible) && (
        <div className="settings-display-content">
          {Object.entries(settingGroups).map(([groupName, settingKeys]) => (
            <div key={groupName} className="settings-group">
              <h4>{groupName}</h4>
              <div className="settings-items">
                {settingKeys.map(key => (
                  <div key={key} className="settings-item" data-key={key}>
                    <span className="setting-label">{settingLabels[key].label}:</span>
                    <span className="setting-value">{settingLabels[key].value}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default GameSettingsDisplay;
