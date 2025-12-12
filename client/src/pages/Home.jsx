import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import '../styles/Home.css';
import UpdateAnnouncement from '../components/UpdateAnnouncement';
import WelcomePopup from '../components/WelcomePopup';
import announcements from '../data/announcements';

const Home = () => {
  const [roomCount, setRoomCount] = useState(0);
  const [showWelcomePopup, setShowWelcomePopup] = useState(false);
  // 线路选择当前域名状态
  const [currentOrigin, setCurrentOrigin] = useState('');

  useEffect(() => {
    const serverUrl = import.meta.env.VITE_SERVER_URL || '';
    fetch(`${serverUrl}/room-count`)
      .then(response => {
        if (!response.ok) throw new Error('Failed to fetch');
        return response.json();
      })
      .then(data => setRoomCount(data.count))
      .catch(error => console.error('Error fetching room count:', error));
    
    setShowWelcomePopup(true);
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
      
      <div className="game-modes">
        <Link to="/singleplayer" className="mode-button">
          <h2>单人</h2>
        </Link>
        <Link to="/multiplayer" className="mode-button">
          <h2>多人</h2>
          <small>当前房间数: {roomCount}</small>
        </Link>
      </div>
      
      <UpdateAnnouncement 
        announcements={announcements} 
        defaultExpanded={false}
        initialVisibleCount={1}
      />
      
      <div className="home-footer">
        <p>
          {/* <a href="https://vertikarl.github.io/anime-character-guessr-english/"> ENGLISH ver. </a> */}
          <br/>
          一个猜动漫/游戏角色的网站，建议使用桌面端浏览器游玩。
          <br/>
          <a href="https://www.bilibili.com/video/BV14CVRzUELs">玩法简介视频</a>，灵感来源<a href="https://blast.tv/counter-strikle"> BLAST.tv </a>,
          数据来源<a href="https://bgm.tv/"> Bangumi </a>。<br />
          <a href="https://space.bilibili.com/87983557">@作者</a>："感谢 <a href="https://github.com/trim21">Bangumi 管理员</a> 的优化支持，
          以及各位<a href="https://github.com/kennylimz/anime-character-guessr/graphs/contributors">网友</a>贡献的代码和数据。
          感谢大家这段时间的热情和支持。"<br/>
          有Bug？到<a href="https://github.com/kennylimz/anime-character-guessr/issues/new" target="_blank" rel="noopener noreferrer">Github Issues</a>反馈<br/>
          想找朋友一起玩？QQ群：467740403<br/>
          作者的新玩具：<a href="https://www.bilibili.com/video/BV1MstxzgEhg/">一个桌面挂件</a>
        </p>
      </div>
    </div>
  );
};

export default Home; 
