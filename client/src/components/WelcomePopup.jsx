import '../styles/popups.css';
import announcements from '../data/announcements';
import UpdateAnnouncement from './UpdateAnnouncement';

function WelcomePopup({ onClose }) {
  return (
    <div className="popup-overlay">
      <div className="popup-content welcome-popup">
        <button className="popup-close" onClick={onClose}><i className="fas fa-xmark"></i></button>
        <div className="popup-header welcome-header">
          <div className="welcome-header-inner">
            <div className="title-container">
              <div className="title-line title-line-main" data-text="二刺猿笑傳">二刺猿笑傳</div>
              <div className="title-line title-line-separator" data-text="A N I M E &nbsp; C H A R A C T E R &nbsp; G U E S S R &nbsp;">A N I M E &nbsp; C H A R A C T E R &nbsp; G U E S S R &nbsp;</div>
              <div className="title-line title-line-sub" data-text="猜猜唄">猜猜唄</div>
            </div>

            <div className="title-divider" aria-hidden="true" />

            <div className="welcome-qq">
              <a href="https://qm.qq.com/q/2sWbSsCwBu" target="_blank" rel="noopener noreferrer" title="加入QQ群">
                <img src="/assets/qqgroup.png" alt="QQ群" className="welcome-qq-img" />
              </a>
            </div>
          </div>
        </div>
        <div className="popup-body">
          <div className="welcome-content">
            <div className="welcome-text">
              <p className="vote-main-text">
                投票给<span className="highlight-kanade">立华奏</span>喵<br/>
                投票给<span className="highlight-kanade">立华奏</span>谢谢喵
              </p>
              <p className="vote-sub-text">
                现在立刻加入猜猜呗官方Q群参与第二届CCB Moe投票 为<span className="highlight-kanade">立华奏</span>献上宝贵的一票
              </p>
              <div className="vote-action">
                <a href="https://qm.qq.com/q/2sWbSsCwBu" target="_blank" rel="noopener noreferrer" className="join-qq-btn">
                  <i className="fab fa-qq"></i> 加入QQ群
                </a>
              </div>
              
              <hr style={{margin: '20px 0', border: '0', borderTop: '1px solid rgba(0,0,0,0.1)'}} />
              
              <UpdateAnnouncement 
                announcements={announcements} 
                defaultExpanded={false}
                initialVisibleCount={1}
              />

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default WelcomePopup;
