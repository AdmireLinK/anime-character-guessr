import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import '../styles/Home.css';
import WelcomePopup from '../components/WelcomePopup';

const LINE_OPTIONS = [
  { url: 'https://anime-character-guessr.netlify.app/', name: 'Netlify', apiBase: 'https://api.bgm.tv' },
  { url: 'https://ccb.baka.website/', name: 'Baka专线', apiBase: 'https://bgmapi.baka.website' }
];

const HOME_TEXT = {
  zh: {
    singleplayer: '单人',
    multiplayer: '多人',
    roomCount: '当前房间数',
    lineSelector: '线路选择',
    lineSelectorHint: '如搜索、猜测缓慢可尝试切换',
    localDeploy: '本地部署',
    betaLine: '抢先体验',
    showAnnouncements: '显示公告',
    status: '服务状态',
    howToPlay: '玩法简介',
    repository: 'GitHub仓库',
    qqGroup: '加入QQ群',
    newToy: '作者的新玩具',
    description: '一个猜动漫/游戏角色的网站，建议使用桌面端浏览器游玩',
    inspiredBy: '灵感来源',
    dataSource: '数据来源',
    languageLabel: '语言',
    chinese: '中文',
    english: 'English'
  },
  en: {
    singleplayer: 'Singleplayer',
    multiplayer: 'Multiplayer',
    roomCount: 'Active rooms',
    dataSource: 'Data from',
    bangumi: 'Bangumi',
    tagTranslationNote: 'Some parts are not translated. Please use the translation feature of your browser.',
    languageLabel: 'Language',
    chinese: '中文',
    english: 'English'
  }
};

const Home = ({ locale = 'zh' }) => {
  const isEnglish = locale === 'en';
  const text = HOME_TEXT[locale] || HOME_TEXT.zh;
  const [roomCount, setRoomCount] = useState(0);
  const [showWelcomePopup, setShowWelcomePopup] = useState(false);
  // 线路选择当前域名状态
  const [currentOrigin, setCurrentOrigin] = useState('');

  useEffect(() => {
    const serverUrl = import.meta.env.VITE_SERVER_URL || '';
    let mounted = true;

    const fetchRoomCount = () => {
      fetch(`${serverUrl}/room-count`)
        .then(response => {
          if (!response.ok) throw new Error('Failed to fetch');
          return response.json();
        })
        .then(data => { if (mounted) setRoomCount(data.count); })
        .catch(error => console.error('Error fetching room count:', error));
    };

    // initial fetch
    fetchRoomCount();
    // refresh every 5 seconds
    const intervalId = setInterval(fetchRoomCount, 5000);

    if (!isEnglish) {
      setShowWelcomePopup(true);
    }

    return () => { mounted = false; clearInterval(intervalId); };
  }, [isEnglish]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setCurrentOrigin(window.location.origin);
    }
  }, []);

  const handleCloseWelcomePopup = () => {
    setShowWelcomePopup(false);
  };

  // 只在当前域名不在LINE_OPTIONS时才添加，否则只显示两条
  const cleanedOrigin = (currentOrigin || '').replace(/\/$/, '');
  const availableLines = LINE_OPTIONS.some(line => line.url.replace(/\/$/, '') === cleanedOrigin)
    ? LINE_OPTIONS
    : [...LINE_OPTIONS, { url: currentOrigin }];

  if (isEnglish) {
    return (
      <div className="home-container home-container-en" lang="en" translate="no">
        <div className="language-switch" aria-label={text.languageLabel}>
          <Link to="/" className="language-option">{text.chinese}</Link>
          <Link to="/en" className="language-option active">{text.english}</Link>
        </div>

        <div className="center-block center-block-en">
          <div className="game-modes game-modes-en">
            <Link to="/singleplayer?lang=en" className="mode-button">
              <h2>{text.singleplayer}</h2>
            </Link>
            <Link to="/multiplayer?lang=en" className="mode-button">
              <h2>{text.multiplayer}</h2>
              <small>{text.roomCount}: {roomCount}</small>
            </Link>
          </div>
          <p className="home-data-source">
            {text.dataSource}{' '}
            <a href="https://bgm.tv/" target="_blank" rel="noopener noreferrer">
              {text.bangumi}
            </a>
          </p>
          <p className="home-tag-note">{text.tagTranslationNote}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="home-container" lang="zh-CN" translate="no">
      <div className="language-switch" aria-label={text.languageLabel}>
        <Link to="/" className="language-option active">{text.chinese}</Link>
        <Link to="/en" className="language-option">{text.english}</Link>
      </div>

      {showWelcomePopup && (
        <WelcomePopup onClose={handleCloseWelcomePopup} locale={locale} />
      )}

      <div className="center-block">
      <div className="game-modes">
        <Link to="/singleplayer" className="mode-button">
          <h2>{text.singleplayer}</h2>
        </Link>
        <Link to="/multiplayer" className="mode-button">
          <h2>{text.multiplayer}</h2>
          <small>{text.roomCount}: {roomCount}</small>
        </Link>
      </div>

      <div className="line-selector">
        <div className="line-selector-header">
          <span className="line-selector-title">{text.lineSelector}</span>
          <span className="line-selector-hint">{text.lineSelectorHint}</span>
        </div>
        <div className="line-selector-list">
          {availableLines.map((line, idx) => {
            if (!line.url) return null;
            const cleanedOrigin = (currentOrigin || '').replace(/\/$/, '');
            const cleanedLine = line.url.replace(/\/$/, '');
            const isCurrent = cleanedOrigin && cleanedOrigin === cleanedLine;
            // 判断是否为本地/局域网
            let displayName = line.name || line.url;
            if (idx === 2 || (!line.name && availableLines.length > 2 && idx === availableLines.length - 1)) {
              // 仅对第三线路或动态添加的线路做本地判断
              try {
                const urlObj = new URL(line.url, window.location.origin);
                const host = urlObj.hostname;
                if (
                  host === 'localhost' ||
                  host === '127.0.0.1' ||
                  /^192\.168\./.test(host) ||
                  /^10\./.test(host) ||
                  /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)
                ) {
                  displayName = text.localDeploy;
                }
              } catch {
                // Ignore malformed line URLs and keep the original display text.
              }
            }

            // 仅对第三线路或动态添加的线路显示为“抢先体验”（如果匹配 ccbeta.baka.website）
            if (idx === 2 || (!line.name && availableLines.length > 2 && idx === availableLines.length - 1)) {
              try {
                const lineHost = new URL(line.url, window.location.origin).hostname;
                const originHost = currentOrigin ? new URL(currentOrigin).hostname : '';
                if (lineHost === 'ccbeta.baka.website' || originHost === 'ccbeta.baka.website') {
                  displayName = text.betaLine;
                }
              } catch {
                // Ignore malformed line URLs and keep the original display text.
              }
            }

            return (
              <a
                key={`${line.url}-${idx}`}
                className={`domain-link${isCurrent ? ' active' : ''}`}
                data-url={line.url}
                href={isCurrent ? '#' : line.url}
                onClick={e => { if (isCurrent) e.preventDefault(); }}
                style={{ pointerEvents: isCurrent ? 'none' : 'auto' }}
              >
                <div className="domain-info">
                  <span className="line-name">{displayName}</span>
                </div>
              </a>
            );
          })}
        </div>
      </div>
      </div>

      <div className="home-footer">
        <div className="button-group-grid">
          <a
            href="#"
            className="fotter-btn"
            onClick={e => { e.preventDefault(); setShowWelcomePopup(true); }}
          >
            <i className="fas fa-bullhorn" style={{marginRight: '8px'}}></i>{text.showAnnouncements}
          </a>
          <a
            href="https://status.baka.website/status/ccb"
            target="_blank"
            rel="noopener noreferrer"
            className="fotter-btn"
          >
            <i className="fas fa-server" style={{marginRight: '8px'}}></i>{text.status}
          </a>
          <a 
            href="https://www.bilibili.com/video/BV14CVRzUELs" 
            target="_blank" 
            rel="noopener noreferrer"
            className="fotter-btn"
          >
            <i className="fab fa-bilibili" style={{marginRight: '8px'}}></i>{text.howToPlay}
          </a>
          <a 
            href="https://github.com/kennylimz/anime-character-guessr" 
            target="_blank" 
            rel="noopener noreferrer"
            className="fotter-btn"
          >
            <i className="fab fa-github" style={{marginRight: '8px'}}></i>{text.repository}
          </a>
          <a 
            href="https://qm.qq.com/q/2sWbSsCwBu" 
            target="_blank" 
            rel="noopener noreferrer"
            className="fotter-btn"
          >
            <i className="fab fa-qq" style={{marginRight: '8px'}}></i>{text.qqGroup}
          </a>
          <a 
            href="https://www.bilibili.com/video/BV1MstxzgEhg/" 
            target="_blank" 
            rel="noopener noreferrer"
            className="fotter-btn"
          >
            <i className="fas fa-desktop" style={{marginRight: '8px'}}></i>{text.newToy}
          </a>
        </div>
        <p>
          {/* <a href="https://vertikarl.github.io/anime-character-guessr-english/"> ENGLISH ver. </a> */}
          {text.description}
          <br/>
          {text.inspiredBy}<a href="https://blast.tv/counter-strikle"> BLAST.tv </a> &nbsp;
          {text.dataSource}<a href="https://bgm.tv/"> Bangumi </a>
        </p>
      </div>
    </div>
  );
};

export default Home;
