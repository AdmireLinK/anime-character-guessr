import { useState } from 'react';
import '../styles/UpdateAnnouncement.css';

const UPDATE_ANNOUNCEMENT_TEXT = {
  zh: {
    title: '更新公告',
    collapse: '收起 ▼',
    expand: '展开 ▶'
  },
  en: {
    title: 'Updates',
    collapse: 'Collapse ▼',
    expand: 'Expand ▶'
  }
};

/**
 * 更新公告组件
 * @param {Object} props
 * @param {Array} props.announcements - 公告数组，每个元素包含 version, date, content 属性
 * @param {boolean} props.defaultExpanded - 是否默认展开（否则折叠）
 * @param {number} props.initialVisibleCount - 默认显示的公告数量
 */
const UpdateAnnouncement = ({ 
  announcements, 
  defaultExpanded = false,
  initialVisibleCount = 1,
  locale = 'zh'
}) => {
  const text = UPDATE_ANNOUNCEMENT_TEXT[locale] || UPDATE_ANNOUNCEMENT_TEXT.zh;
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  // 如果没有公告，则不显示组件
  if (!announcements || announcements.length === 0) {
    return null;
  }

  // 切换展开/折叠状态
  const toggleExpand = () => {
    setIsExpanded(!isExpanded);
  };

  return (
    <div className="update-announcement">
      <div className="update-header" onClick={toggleExpand}>
        <h3>{text.title}</h3>
        <span className={`expand-icon ${isExpanded ? 'expanded' : ''}`}>
          {isExpanded ? text.collapse : text.expand}
        </span>
      </div>
      
      <div className="announcement-content">
        {(isExpanded ? announcements : announcements.slice(1, initialVisibleCount+1)).map((announcement, index) => (
          <div key={index} className="announcement-item">
            {announcement.version && (
              <div className="announcement-version">
                <span className="version-tag">v{announcement.version}</span>
                {announcement.date && <span className="date">{announcement.date}</span>}
              </div>
            )}
            <div className="announcement-text" dangerouslySetInnerHTML={{ __html: announcement.content }} />
          </div>
        ))}
      </div>
    </div>
  );
};

export default UpdateAnnouncement; 
