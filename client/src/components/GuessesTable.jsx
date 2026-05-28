import '../styles/GuessesTable.css';
import { useState, useMemo, useRef, useEffect } from 'react';
import ModifiedTagDisplay from './ModifiedTagDisplay';
import Image from './Image';
import { subjectsWithExtraTags } from '../data/extra_tag_subjects';
import { getTranslatedTag, hasTagTranslation } from '../data/tag_translations';

const TABLE_TEXT = {
  zh: {
    moreTags: '更多标签',
    name: '名字',
    genderMaybe: '性别？',
    gender: '性别',
    popularity: '热度',
    worksRatingHeader: <>作品数<br/>最高分</>,
    appearanceHeader: <>最晚登场<br/>最早登场</>,
    tags: '标签',
    coappearances: '共同出演',
    avatar: '头像',
    from: '来自',
    player: '玩家',
    externalTags: '外部标签',
    worksRating: '作品 / 最高分',
    appearanceMobile: '登场（晚 / 早）',
    none: '无',
    expand: '展开'
  },
  en: {
    moreTags: 'More Tags',
    name: 'Name',
    genderMaybe: 'Gender?',
    gender: 'Gender',
    popularity: 'Heat',
    worksRatingHeader: <>Works Count<br/>Top Rating</>,
    appearanceHeader: <>Last Appearance<br/>First Appearance</>,
    tags: 'Tags',
    coappearances: 'Co-appearances',
    avatar: 'Avatar',
    from: 'From',
    player: 'Player',
    externalTags: 'Extra Tags',
    worksRating: 'Works / Top Rating',
    appearanceMobile: 'Appearance (last / first)',
    none: 'None',
    expand: 'Expand'
  }
};

function GuessesTable({ guesses, answerCharacter, collapsedCount = 0, bannedTags = [], showNames = true, locale = 'zh' }) {
  const text = TABLE_TEXT[locale] || TABLE_TEXT.zh;
  const [clickedExpandTags, setClickedExpandTags] = useState(new Set());
  const [externalTagMode, setExternalTagMode] = useState(false);
  const getSharedAppearanceName = (sharedAppearances) => {
    if (!sharedAppearances) return '';
    return locale === 'en'
      ? (sharedAppearances.firstOriginal || sharedAppearances.first || '')
      : (sharedAppearances.firstCn || sharedAppearances.first || '');
  };

  const bannedTagSet = useMemo(() => {
    if (!Array.isArray(bannedTags)) {
      return new Set();
    }
    return new Set(
      bannedTags
        .filter(tag => typeof tag === 'string')
        .map(tag => tag.trim())
        .filter(Boolean)
    );
  }, [bannedTags]);


  // 如果指定了折叠数量，只显示最新的 N 条记录
  const displayGuesses = collapsedCount > 0 && guesses.length > collapsedCount
    ? guesses.slice(-collapsedCount)
    : guesses;

  // Determine if any guess could have extra tags
  const hasAnyExtraTags = displayGuesses.some(guess =>
    Array.isArray(guess.appearanceIds) && guess.appearanceIds.some(id => subjectsWithExtraTags.has(id))
  );

  const getGenderEmoji = (gender) => {
    switch (gender) {
      case 'male':
        return '♂️';
      case 'female':
        return '♀️';
      default:
        return '❓';
    }
  };

  const handleExpandTagClick = (guessIndex, tagIndex) => {
    const key = `${guessIndex}-${tagIndex}`;
    setClickedExpandTags(prev => {
      const newSet = new Set(prev);
      newSet.add(key);
      return newSet;
    });
  };

  const handleToggleMode = () => {
    setExternalTagMode((prev) => !prev);
  };

  const listRef = useRef(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !listRef.current) return;

    const updateMaxHeight = () => {
      const el = listRef.current;
      if (!el) return;
      // Only apply mobile behavior on narrow viewports
      if (window.innerWidth <= 768) {
        const rect = el.getBoundingClientRect();
        const bottomSpace = 16; // margin to bottom
        const maxH = Math.max(120, window.innerHeight - rect.top - bottomSpace);
        el.style.maxHeight = `${maxH}px`;
        el.style.overflowY = 'auto';
        el.style.overscrollBehavior = 'contain';
        el.style.WebkitOverflowScrolling = 'touch';
      } else {
        // reset styles on larger screens
        el.style.maxHeight = '';
        el.style.overflowY = '';
        el.style.overscrollBehavior = '';
        el.style.WebkitOverflowScrolling = '';
      }
    };

    updateMaxHeight();
    window.addEventListener('resize', updateMaxHeight);
    window.addEventListener('orientationchange', updateMaxHeight);
    // In case the layout shifts after images load or fonts load
    const ro = new ResizeObserver(updateMaxHeight);
    ro.observe(listRef.current);

    return () => {
      window.removeEventListener('resize', updateMaxHeight);
      window.removeEventListener('orientationchange', updateMaxHeight);
      ro.disconnect();
    };
  }, [listRef]);

  return (
    <div className="table-container">
      {/* Only show toggle if any guess could have extra tags */}
      {hasAnyExtraTags && (
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
          <button
            onClick={handleToggleMode}
            style={{
              padding: '8px 24px',
              borderRadius: '24px',
              border: 'none',
              background: externalTagMode ? '#4a90e2' : '#e0e0e0',
              color: externalTagMode ? '#fff' : '#333',
              fontWeight: 'bold',
              fontSize: '16px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
              cursor: 'pointer',
              transition: 'background 0.2s, color 0.2s',
              outline: 'none',
            }}
            onMouseOver={e => {
              e.target.style.background = externalTagMode ? '#006a91' : '#d0d0d0';
            }}
            onMouseOut={e => {
              e.target.style.background = externalTagMode ? '#0084B4' : '#e0e0e0';
            }}
          >
            {text.moreTags}
          </button>
        </div>
      )}
      <table className={`guesses-table${externalTagMode ? ' external-tag-mode' : ''}`}>
        <thead>
          <tr>
            <th></th>
            <th>{text.name}</th>
            {externalTagMode ? (
              <>
                <th>{text.genderMaybe}</th>
                <th></th>
              </>
            ) : (
              <>
                <th>{text.gender}</th>
                <th>{text.popularity}</th>
                <th>{text.worksRatingHeader}</th>
                <th>{text.appearanceHeader}</th>
              </>
            )}
            <th>{text.tags}</th>
            <th>{text.coappearances}</th>
          </tr>
        </thead>
        <tbody>
          {displayGuesses.map((guess, guessIndex) => (
            <tr key={guessIndex}>
              <td data-label={text.avatar} className="cell-icon">
                <Image src={guess.icon} alt="character" className="character-icon" />
              </td>
              <td data-label={text.name} className="cell-name">
                <div className={`character-name-container ${guess.isAnswer ? 'correct' : ''}`}>
                  {guess.guessrName && (
                    <div className="character-guessr-name" style={{ fontSize: '12px', color: '#888' }}>
                      {text.from}: {showNames ? guess.guessrName : text.player}
                    </div>
                  )}
                  <div className="character-name" translate="no">{guess.name}</div>
                  <div className={locale === 'en' ? 'character-name-en' : 'character-name-cn'}>
                    {locale === 'en' && guess.nameEn && guess.nameEn !== guess.nameCn ? (
                      <span translate="no">{guess.nameEn}</span>
                    ) : (
                      <span>{locale === 'en' ? (guess.nameEn || guess.nameCn) : guess.nameCn}</span>
                    )}
                  </div>
                </div>
              </td>
              <td data-label={text.gender} className="cell-gender">
                <span className={`feedback-cell ${guess.genderFeedback === 'yes' ? 'correct' : ''}`}>
                  {getGenderEmoji(guess.gender)}
                </span>
              </td>
              {externalTagMode ? (
                <td data-label={text.externalTags} className="cell-modified">
                  <ModifiedTagDisplay 
                    guessCharacter={guess} 
                    answerCharacter={answerCharacter}
                    locale={locale}
                  />
                </td>
              ) : (
                <>
                  <td data-label={text.popularity} className="cell-popularity">
                    <span className={`feedback-cell ${guess.popularityFeedback === '=' ? 'correct' : (guess.popularityFeedback === '+' || guess.popularityFeedback === '-') ? 'partial' : ''}`}>
                      {guess.popularity}{(guess.popularityFeedback === '+' || guess.popularityFeedback === '++') ? ' ↓' : (guess.popularityFeedback === '-' || guess.popularityFeedback === '--') ? ' ↑' : ''}
                    </span>
                  </td>
                  <td data-label={text.worksRating} className="cell-works">
                    <div className="appearance-container">
                      <div className={`feedback-cell appearance-count ${guess.appearancesCountFeedback === '=' ? 'correct' : (guess.appearancesCountFeedback === '+' || guess.appearancesCountFeedback === '-') ? 'partial' : guess.appearancesCountFeedback === '?' ? 'unknown' : ''}`}>
                        {guess.appearancesCount}{(guess.appearancesCountFeedback === '+' || guess.appearancesCountFeedback === '++') ? ' ↓' : (guess.appearancesCountFeedback === '-' || guess.appearancesCountFeedback === '--') ? ' ↑' : ''}
                      </div>
                      <div className={`feedback-cell appearance-rating ${guess.ratingFeedback === '=' ? 'correct' : (guess.ratingFeedback === '+' || guess.ratingFeedback === '-') ? 'partial' : guess.ratingFeedback === '?' ? 'unknown' : ''}`}>
                        {guess.highestRating === -1 ? text.none : guess.highestRating}{(guess.ratingFeedback === '+' || guess.ratingFeedback === '++') ? ' ↓' : (guess.ratingFeedback === '-' || guess.ratingFeedback === '--') ? ' ↑' : ''}
                      </div>
                    </div>
                  </td>
                  <td data-label={text.appearanceMobile} className="cell-appearance">
                    <div className="appearance-container">
                      <div className={`feedback-cell latestAppearance ${guess.latestAppearanceFeedback === '=' ? 'correct' : (guess.latestAppearanceFeedback === '+' || guess.latestAppearanceFeedback === '-') ? 'partial' : guess.latestAppearanceFeedback === '?' ? 'unknown' : ''}`}>
                        {guess.latestAppearance === -1 ? text.none : guess.latestAppearance}{(guess.latestAppearanceFeedback === '+' || guess.latestAppearanceFeedback === '++') ? ' ↓' : (guess.latestAppearanceFeedback === '-' || guess.latestAppearanceFeedback === '--') ? ' ↑' : ''}
                      </div>
                      <div className={`feedback-cell earliestAppearance ${guess.earliestAppearanceFeedback === '=' ? 'correct' : (guess.earliestAppearanceFeedback === '+' || guess.earliestAppearanceFeedback === '-') ? 'partial' : guess.earliestAppearanceFeedback === '?' ? 'unknown' : ''}`}>
                        {guess.earliestAppearance === -1 ? text.none : guess.earliestAppearance}{(guess.earliestAppearanceFeedback === '+' || guess.earliestAppearanceFeedback === '++') ? ' ↓' : (guess.earliestAppearanceFeedback === '-' || guess.earliestAppearanceFeedback === '--') ? ' ↑' : ''}
                      </div>
                    </div>
                  </td>
                </>
              )}
              <td data-label={text.tags} className="cell-tags">
                <div className="meta-tags-container" lang={locale === 'en' ? 'zh-CN' : undefined} translate={locale === 'en' ? 'yes' : undefined}>
                  {guess.metaTags.map((tag, tagIndex) => {
                    const isExpandTag = tag === text.expand || tag === '展开';
                    const tagKey = `${guessIndex}-${tagIndex}`;
                    const isClicked = clickedExpandTags.has(tagKey);
                    const isSharedTag = Array.isArray(guess.sharedMetaTags) && guess.sharedMetaTags.includes(tag);
                    const isBanned = bannedTagSet.has(tag);
                    const isTranslated = !isBanned && hasTagTranslation(tag, locale);
                    const displayTag = isBanned ? '???' : getTranslatedTag(tag, locale);
                    
                    return (
                      <span 
                        key={tagIndex}
                        className={`meta-tag ${isSharedTag && !isBanned ? 'shared' : ''} ${isBanned ? 'banned-tag' : ''} ${isExpandTag ? 'expand-tag' : ''}`}
                        onClick={isExpandTag ? () => handleExpandTagClick(guessIndex, tagIndex) : undefined}
                        style={isExpandTag && !isClicked ? { color: '#0084B4', cursor: 'pointer' } : undefined}
                        lang={isTranslated ? 'en' : undefined}
                        translate={isTranslated ? 'no' : undefined}
                      >
                        {displayTag}
                      </span>
                    );
                  })}
                </div>
              </td>
              <td data-label={text.coappearances} className="cell-coappearances">
                <span className={`shared-appearances ${guess.sharedAppearances.count > 0 ? 'has-shared' : ''}`}>
                  {getSharedAppearanceName(guess.sharedAppearances)}
                  {guess.sharedAppearances.count > 1 && ` +${guess.sharedAppearances.count - 1}`}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Mobile-friendly list: shown on small screens */}
      <div className="guesses-list" aria-hidden="false" ref={listRef}>
        {displayGuesses.map((guess, idx) => (
          <div key={idx} className={`guess-card ${guess.isAnswer ? 'correct' : ''}`}>
            <div className="guess-card-header">
              <Image src={guess.icon} alt="character" className="character-icon" />
              <div className="guess-card-names">
                {guess.guessrName && (
                  <div className="character-guessr-name" style={{ fontSize: '12px', color: '#888' }}>
                    {text.from}: {showNames ? guess.guessrName : text.player}
                  </div>
                )}
                <div className="character-name" translate="no">{guess.name}</div>
                <div className={locale === 'en' ? 'character-name-en' : 'character-name-cn'}>
                  {locale === 'en' && guess.nameEn && guess.nameEn !== guess.nameCn ? (
                    <span translate="no">{guess.nameEn}</span>
                  ) : (
                    <span>{locale === 'en' ? (guess.nameEn || guess.nameCn) : guess.nameCn}</span>
                  )}
                </div>
              </div>
              <div className={`guess-card-gender ${guess.genderFeedback === 'yes' ? 'feedback-cell correct' : ''}`}>{getGenderEmoji(guess.gender)}</div>
            </div>

            <div className="guess-card-row">
              <div className="label">{text.popularity}</div>
              <div className="value">
                <span className={`feedback-cell ${guess.popularityFeedback === '=' ? 'correct' : (guess.popularityFeedback === '+' || guess.popularityFeedback === '-') ? 'partial' : ''}`}>
                  {guess.popularity}{(guess.popularityFeedback === '+' || guess.popularityFeedback === '++') ? ' ↓' : (guess.popularityFeedback === '-' || guess.popularityFeedback === '--') ? ' ↑' : ''}
                </span>
              </div>
            </div>

            <div className="guess-card-row">
              <div className="label">{text.worksRating}</div>
              <div className="value">
                <div style={{display: 'flex', gap: '8px', justifyContent: 'flex-end'}}>
                  <div className={`feedback-cell appearance-count ${guess.appearancesCountFeedback === '=' ? 'correct' : (guess.appearancesCountFeedback === '+' || guess.appearancesCountFeedback === '-') ? 'partial' : guess.appearancesCountFeedback === '?' ? 'unknown' : ''}`}>
                    {guess.appearancesCount}{(guess.appearancesCountFeedback === '+' || guess.appearancesCountFeedback === '++') ? ' ↓' : (guess.appearancesCountFeedback === '-' || guess.appearancesCountFeedback === '--') ? ' ↑' : ''}
                  </div>
                  <div className={`feedback-cell appearance-rating ${guess.ratingFeedback === '=' ? 'correct' : (guess.ratingFeedback === '+' || guess.ratingFeedback === '-') ? 'partial' : guess.ratingFeedback === '?' ? 'unknown' : ''}`}>
                    {guess.highestRating === -1 ? text.none : guess.highestRating}{(guess.ratingFeedback === '+' || guess.ratingFeedback === '++') ? ' ↓' : (guess.ratingFeedback === '-' || guess.ratingFeedback === '--') ? ' ↑' : ''}
                  </div>
                </div>
              </div>
            </div>

            <div className="guess-card-row">
              <div className="label">{text.appearanceMobile}</div>
              <div className="value">
                <div style={{display: 'flex', gap: '6px', justifyContent: 'flex-end'}}>
                  <div className={`feedback-cell latestAppearance ${guess.latestAppearanceFeedback === '=' ? 'correct' : (guess.latestAppearanceFeedback === '+' || guess.latestAppearanceFeedback === '-') ? 'partial' : guess.latestAppearanceFeedback === '?' ? 'unknown' : ''}`}>
                    {guess.latestAppearance === -1 ? text.none : guess.latestAppearance}{(guess.latestAppearanceFeedback === '+' || guess.latestAppearanceFeedback === '++') ? ' ↓' : (guess.latestAppearanceFeedback === '-' || guess.latestAppearanceFeedback === '--') ? ' ↑' : ''}
                  </div>
                  <div className={`feedback-cell earliestAppearance ${guess.earliestAppearanceFeedback === '=' ? 'correct' : (guess.earliestAppearanceFeedback === '+' || guess.earliestAppearanceFeedback === '-') ? 'partial' : guess.earliestAppearanceFeedback === '?' ? 'unknown' : ''}`}>
                    {guess.earliestAppearance === -1 ? text.none : guess.earliestAppearance}{(guess.earliestAppearanceFeedback === '+' || guess.earliestAppearanceFeedback === '++') ? ' ↓' : (guess.earliestAppearanceFeedback === '-' || guess.earliestAppearanceFeedback === '--') ? ' ↑' : ''}
                  </div>
                </div>
              </div>
            </div>

            <div className="guess-card-tags">
              <div className="meta-tags-container" aria-label={text.tags} lang={locale === 'en' ? 'zh-CN' : undefined} translate={locale === 'en' ? 'yes' : undefined}>
                {guess.metaTags.map((tag, tagIndex) => {
                  const isExpandTag = tag === text.expand || tag === '展开';
                  const tagKey = `${idx}-${tagIndex}`;
                  const isClicked = clickedExpandTags.has(tagKey);
                  const isSharedTag = Array.isArray(guess.sharedMetaTags) && guess.sharedMetaTags.includes(tag);
                  const isBanned = bannedTagSet.has(tag);
                  const isTranslated = !isBanned && hasTagTranslation(tag, locale);
                  const displayTag = isBanned ? '???' : getTranslatedTag(tag, locale);

                  return (
                    <span
                      key={tagIndex}
                      className={`meta-tag ${isSharedTag && !isBanned ? 'shared' : ''} ${isBanned ? 'banned-tag' : ''} ${isExpandTag ? 'expand-tag' : ''}`}
                      onClick={isExpandTag ? () => handleExpandTagClick(idx, tagIndex) : undefined}
                      style={isExpandTag && !isClicked ? { color: '#0084B4', cursor: 'pointer' } : undefined}
                      lang={isTranslated ? 'en' : undefined}
                      translate={isTranslated ? 'no' : undefined}
                    >
                      {displayTag}
                    </span>
                  );
                })}
              </div>
            </div>

            <div className="guess-card-row" style={{marginTop: 8}}>
              <div className="label">{text.coappearances}</div>
              <div className="value" style={{minWidth: 0}}>
                <span className={`shared-appearances ${guess.sharedAppearances.count > 0 ? 'has-shared' : ''}`}>
                  {getSharedAppearanceName(guess.sharedAppearances)}
                  {guess.sharedAppearances.count > 1 && ` +${guess.sharedAppearances.count - 1}`}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default GuessesTable; 
