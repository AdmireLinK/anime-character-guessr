import '../styles/popups.css';

function WelcomePopup({ onClose }) {
  return (
    <div className="popup-overlay">
      <div className="popup-content">
        <button className="popup-close" onClick={onClose}><i className="fas fa-xmark"></i></button>
        <div className="popup-header">
          <h2>🎉 恭迎猜猜呗地狱归来！</h2>
        </div>
        <div className="popup-header">
            <img src="https://pic.baka.website/i/2025/12/07/69352d92bca52.jpg" alt="加群二维码" style={{width: 'auto', height: '500px'}} />
        </div>
        <div className="popup-body">
          <div className="welcome-content">
            <div className="welcome-text">
              <p>猜猜呗终于<del>和Faze一起</del>从地狱爬回来了！这段时间我们进行了大量优化和修复：</p>
              <ul>
                <li><b>血战模式</b>：第一个猜对的玩家不会立即结束游戏。所有玩家继续猜测，直到最后一人猜对或次数耗尽</li>
                <li><b>同步模式</b>：所有玩家需要等待其他玩家完成当前轮猜测后才能进行下一轮</li>
                <li>此外，还有<b>大量UIUX优化和Bug修复</b></li>
              </ul>
              <p>如果您有任何建议或问题，欢迎加入我们的QQ群或提交Issue！</p>
              <div className="button-group-horizontal" style={{marginTop: '20px'}}>
                <a 
                  href="https://qm.qq.com/q/2sWbSsCwBu" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="contribute-tag-btn"
                  style={{textDecoration: 'none', textAlign: 'center'}}
                >
                  <i className="fab fa-qq" style={{marginRight: '8px'}}></i>加入QQ群
                </a>
                <a 
                  href="https://github.com/kennylimz/anime-character-guessr" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="contribute-tag-btn"
                  style={{textDecoration: 'none', textAlign: 'center'}}
                >
                  <i className="fab fa-github" style={{marginRight: '8px'}}></i>GitHub仓库
                </a>
                <a 
                  href="https://www.bilibili.com/video/BV1Tb2fBhEkN" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="contribute-tag-btn"
                  style={{textDecoration: 'none', textAlign: 'center'}}
                >
                  <i className="fab fa-bilibili" style={{marginRight: '8px'}}></i>宣传视频
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default WelcomePopup;
