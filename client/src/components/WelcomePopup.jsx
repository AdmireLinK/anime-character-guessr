import '../styles/popups.css';
import announcements from '../data/announcements';
import UpdateAnnouncement from './UpdateAnnouncement';

const WELCOME_TEXT = {
  zh: {
    titleMain: '二刺猿笑傳',
    titleSub: '猜猜唄',
    qqTitle: '加入QQ群',
    qqAlt: 'QQ群',
    intro: <><b>由于不可抗力因素，猜猜呗的运营正在变得更加艰难，可能在不远的将来停止对中国大陆地区访问的优化。</b></>,
    updates: [
      <>近期，由于Bangumi在中国大陆遭到访问阻断，导致本站点在中国大陆游玩体验收到影响。<br></br>
      经过不懈努力，我们已找到临时解决办法，且目前已经上线。然而，此方法仍然不能完美、一劳永逸地解决此问题，且也存在被不可抗力因素阻断的可能性，因此<b>不再对中国大陆可用性做保证，如有持续游玩需求建议优化网络环境</b>。</>,
      <>如果您目前正在使用<a href="https://anime-character-guessr.netlify.app/" target="_blank" rel="noopener noreferrer">anime-character-guessr.netlify.app</a>游玩且位于中国大陆，发现无法游玩时可尝试更换至<a href="https://ccb.baka.website/" target="_blank" rel="noopener noreferrer">ccb.baka.website</a>进行游玩</>,
      <>另外，反馈角色标签问题请在游戏结算后的角色卡片处反馈<br></br>反馈其它游戏Bug可加入<a href="https://qm.qq.com/q/2sWbSsCwBu" target="_blank" rel="noopener noreferrer">QQ群</a>或<a href="https://github.com/kennylimz/anime-character-guessr/issues/new" target="_blank" rel="noopener noreferrer">提交Issue</a></>
    ],
    thanks: (
      <>
        感谢 <a href="https://github.com/trim21" target="_blank" rel="noopener noreferrer">Bangumi 管理员</a> 的优化支持，
        以及各位<a href="https://github.com/kennylimz/anime-character-guessr/graphs/contributors" target="_blank" rel="noopener noreferrer">网友</a>贡献的代码和数据。
        感谢大家这段时间的热情和支持
      </>
    ),
    contact: (
      <b>
        如果您有任何建议或问题，欢迎加入我们的<a href="https://qm.qq.com/q/2sWbSsCwBu" target="_blank" rel="noopener noreferrer">QQ群</a>或<a href="https://github.com/kennylimz/anime-character-guessr/issues/new" target="_blank" rel="noopener noreferrer">提交Issue</a>！
      </b>
    )
  }
};

function WelcomePopup({ onClose, locale = 'zh' }) {
  const text = WELCOME_TEXT[locale] || WELCOME_TEXT.zh;

  return (
    <div className="popup-overlay">
      <div className="popup-content welcome-popup">
        <button className="popup-close" onClick={onClose}><i className="fas fa-xmark"></i></button>
        <div className="popup-header welcome-header">
          <div className="welcome-header-inner">
            <div className="title-container">
              <div className="title-line title-line-main" data-text={text.titleMain}>{text.titleMain}</div>
              <div className="title-line title-line-separator" data-text="A N I M E &nbsp; C H A R A C T E R &nbsp; G U E S S R &nbsp;">A N I M E &nbsp; C H A R A C T E R &nbsp; G U E S S R &nbsp;</div>
              <div className="title-line title-line-sub" data-text={text.titleSub}>{text.titleSub}</div>
            </div>

            <div className="title-divider" aria-hidden="true" />

            <div className="welcome-qq">
              <a href="https://qm.qq.com/q/2sWbSsCwBu" target="_blank" rel="noopener noreferrer" title={text.qqTitle}>
                <img src="/assets/qqgroup.png" alt={text.qqAlt} className="welcome-qq-img" />
              </a>
            </div>
          </div>
        </div>
        <div className="popup-body">
          <div className="welcome-content">
            <div className="welcome-text">
              <p>{text.intro}</p>
              <ul>
                {text.updates.map((update, index) => (
                  <li key={index}>{update}</li>
                ))}
              </ul>
              {text.thanks}
              <br/>
              <p>{text.contact}</p>
              
              <hr style={{margin: '20px 0', border: '0', borderTop: '1px solid rgba(0,0,0,0.1)'}} />
              
              <UpdateAnnouncement 
                announcements={announcements} 
                defaultExpanded={false}
                initialVisibleCount={1}
                locale={locale}
              />

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default WelcomePopup;
