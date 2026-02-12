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
              <p>目前正在举办<b>第二届LBC</b>：2.1-2.15，本次为团队赛，总奖金52W韩元，最后一名也有奖金，参赛名单为从报名的人里面挑选直邀选手并由主办方兼出资人老鸨手动分组。</p>
              <p>本次比赛特殊规则：禁止所有bang dream的角色，出现一次扣5分。</p>
              <ul>
                <p><b>比赛分组：</b></p>
                <li>1．玩设备，akizawa，阿赵</li>
                <li>2.安格，绫依骑士，Shaw</li>
                <li>3．切尔茜，水映天虹，新条茜</li>
                <li>4. lese，顶碗人，gura</li>
                <li>5．非也非也，Ishmael，大当家</li>
              </ul>
              <p>欢迎大家加入QQ群立即捡钱或参与未来的比赛！</p>
              <p><b>如果您有任何建议或问题，欢迎加入我们的<a href="https://qm.qq.com/q/2sWbSsCwBu" target="_blank" >QQ群</a>或<a href="https://github.com/kennylimz/anime-character-guessr/issues/new" target="_blank" >提交Issue</a>！</b></p>
              <p><b><a href="https://space.bilibili.com/87983557" target="_blank" rel="noopener noreferrer">作者</a>的话</b>：“感谢 <a href="https://github.com/trim21" target="_blank" rel="noopener noreferrer">Bangumi 管理员</a> 的优化支持，
              以及各位<a href="https://github.com/kennylimz/anime-character-guessr/graphs/contributors" target="_blank" rel="noopener noreferrer">网友</a>贡献的代码和数据。
              感谢大家这段时间的热情和支持”</p>
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
