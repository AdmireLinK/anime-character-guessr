import { Link } from 'react-router-dom';
import { useState, useEffect, useCallback } from 'react';
import '../styles/Home.css';
import WelcomePopup from '../components/WelcomePopup';

const LINE_OPTIONS = [
  { url: 'https://anime-character-guessr.netlify.app/', name: 'Netlify' },
  { url: 'https://ccb.baka.website/', name: 'Baka专线' }
];

const Home = () => {
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

    setShowWelcomePopup(true);

    return () => { mounted = false; clearInterval(intervalId); };
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setCurrentOrigin(window.location.origin);
    }
  }, []);

  const handleCloseWelcomePopup = () => {
    setShowWelcomePopup(false);
  };

  const testLatency = useCallback(async () => {
    const links = document.querySelectorAll('.domain-link');
    for (const link of links) {
      const url = link.getAttribute('data-url');
      const latencyText = link.querySelector('.latency-text');
      const indicator = link.querySelector('.status-indicator');
      const latencyDot = link.querySelector('.latency-dot');
      if (!url || !latencyText) continue;
      // 保持旧延迟显示直到新结果到达；仅添加半透明以提示正在刷新
      latencyText.classList.remove('text-green-600', 'text-yellow-600', 'text-red-600');
      latencyText.classList.add('opacity-50');
      const start = performance.now();
      let latency = -1;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        await fetch(url, { mode: 'no-cors', cache: 'no-store', signal: controller.signal });
        clearTimeout(timeoutId);
        const end = performance.now();
        latency = Math.round(end - start);
      } catch (e) {}
      latencyText.classList.remove('opacity-50');
      const isActive = link.classList.contains('active');
      if (latency >= 0) {
        latencyText.textContent = `${latency}ms`;
        // 决定颜色：绿/黄/红
        let color = '#ef4444';
        if (latency < 100) color = '#22c55e';
        else if (latency < 500) color = '#f59e0b';

        // 更新延迟文本颜色（仅影响文字颜色）
        latencyText.classList.remove('text-green-600', 'text-yellow-600', 'text-red-600');
        if (color === '#22c55e') latencyText.classList.add('text-green-600');
        else if (color === '#f59e0b') latencyText.classList.add('text-yellow-600');
        else latencyText.classList.add('text-red-600');

        // 小点与左侧指示器都使用相同的颜色
        if (latencyDot) latencyDot.style.backgroundColor = color;
        if (indicator) indicator.style.backgroundColor = color;

        // 如果是当前已选线路，仅设置边框为延迟色，背景与文字恢复默认
        if (isActive) {
          link.style.backgroundColor = '';
          link.style.borderColor = color;
          link.style.color = '';
        } else {
          link.style.backgroundColor = '';
          link.style.borderColor = '';
          link.style.color = '';
        }
      } else {
        latencyText.textContent = '-';
        latencyText.classList.add('text-red-600');
        if (latencyDot) latencyDot.style.backgroundColor = '#ef4444';
        if (indicator) indicator.style.backgroundColor = '#ef4444';
      }
    }
  }, []);

  useEffect(() => {
    if (!currentOrigin) return;
    testLatency();
    const timer = setInterval(testLatency, 5000);
    return () => clearInterval(timer);
  }, [currentOrigin, testLatency]);

  // 只在当前域名不在LINE_OPTIONS时才添加，否则只显示两条
  const cleanedOrigin = (currentOrigin || '').replace(/\/$/, '');
  const availableLines = LINE_OPTIONS.some(line => line.url.replace(/\/$/, '') === cleanedOrigin)
    ? LINE_OPTIONS
    : [...LINE_OPTIONS, { url: currentOrigin }];

  return (
    <div className="home-container">

      {showWelcomePopup && (
        <WelcomePopup onClose={handleCloseWelcomePopup} />
      )}

      <div className="center-block">
      <div className="game-modes">
        <Link to="/singleplayer" className="mode-button">
          <h2>单人</h2>
        </Link>
        <Link to="/multiplayer" className="mode-button">
          <h2>多人</h2>
          <small>当前房间数: {roomCount}</small>
        </Link>
      </div>

      <div className="line-selector">
        <div className="line-selector-header">
          <span className="line-selector-title">线路选择</span>
          <span className="line-selector-hint">如页面加载缓慢可尝试切换</span>
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
                  displayName = '本地部署';
                }
              } catch {}
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
                  <span className="status-indicator"></span>
                  <span className="line-name">{displayName}</span>
                </div>
                <span className="latency-text">-</span>
                <span className="latency-dot"></span>
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
            <i className="fas fa-bullhorn" style={{marginRight: '8px'}}></i>显示公告
          </a>
          <a
            href="https://status.baka.website/status/ccb"
            target="_blank"
            rel="noopener noreferrer"
            className="fotter-btn"
          >
            <i className="fas fa-server" style={{marginRight: '8px'}}></i>服务状态
          </a>
          <a 
            href="https://www.bilibili.com/video/BV14CVRzUELs" 
            target="_blank" 
            rel="noopener noreferrer"
            className="fotter-btn"
          >
            <i className="fab fa-bilibili" style={{marginRight: '8px'}}></i>玩法简介
          </a>
          <a 
            href="https://github.com/kennylimz/anime-character-guessr" 
            target="_blank" 
            rel="noopener noreferrer"
            className="fotter-btn"
          >
            <i className="fab fa-github" style={{marginRight: '8px'}}></i>GitHub仓库
          </a>
          <a 
            href="https://qm.qq.com/q/2sWbSsCwBu" 
            target="_blank" 
            rel="noopener noreferrer"
            className="fotter-btn"
          >
            <i className="fab fa-qq" style={{marginRight: '8px'}}></i>加入QQ群
          </a>
          <a 
            href="https://www.bilibili.com/video/BV1MstxzgEhg/" 
            target="_blank" 
            rel="noopener noreferrer"
            className="fotter-btn"
          >
            <i className="fas fa-desktop" style={{marginRight: '8px'}}></i>作者的新玩具
          </a>
        </div>
        <p>
          {/* <a href="https://vertikarl.github.io/anime-character-guessr-english/"> ENGLISH ver. </a> */}
          一个猜动漫/游戏角色的网站，建议使用桌面端浏览器游玩
          <br/>
          灵感来源<a href="https://blast.tv/counter-strikle"> BLAST.tv </a> &nbsp;
          数据来源<a href="https://bgm.tv/"> Bangumi </a>
        </p>
      </div>
    </div>
  );
};

export default Home;
