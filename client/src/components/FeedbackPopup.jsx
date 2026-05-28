import React, { useState } from 'react';
import '../styles/FeedbackPopup.css';

const FEEDBACK_TEXT = {
  zh: {
    title: 'Bug反馈',
    type: '反馈类型',
    description: '描述',
    placeholder: '简单描述问题',
    includeLogs: '包含客户端日志和报错信息（有助于问题排查）',
    cancel: '取消',
    submitting: '提交中...',
    submit: '提交',
    types: [
      'Bug反馈',
      '标签缺失',
      '标签错误',
      '功能建议',
      '体验问题',
      '其他'
    ]
  },
  en: {
    title: 'Feedback',
    type: 'Feedback type',
    description: 'Description',
    placeholder: 'Briefly describe the issue',
    includeLogs: 'Include client logs and errors to help debugging',
    cancel: 'Cancel',
    submitting: 'Submitting...',
    submit: 'Submit',
    types: [
      'Bug report',
      'Missing tags',
      'Wrong tags',
      'Feature suggestion',
      'Experience issue',
      'Other'
    ]
  }
};

const FeedbackPopup = ({ onClose, onSubmit, locale = 'zh' }) => {
  const text = FEEDBACK_TEXT[locale] || FEEDBACK_TEXT.zh;
  const [type, setType] = useState(text.types[0]);
  const [description, setDescription] = useState('');
  const [includeLogs, setIncludeLogs] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    const trimmed = description.trim();
    if (!trimmed || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onSubmit?.({ type, description: trimmed, includeLogs });
      onClose?.();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="feedback-popup-overlay" role="dialog" aria-modal="true">
      <div className="feedback-popup">
        <div className="feedback-header">
          <h3>{text.title}</h3>
        </div>

        <label className="feedback-label">
          {text.type}
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="feedback-select"
          >
            {text.types.map(option => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </label>

        <label className="feedback-label">
          {text.description}
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={text.placeholder}
            rows={4}
            className="feedback-textarea"
            maxLength={100}
          />
          <div className="feedback-hint">{description.length}/100</div>
        </label>

        <label className="feedback-label checkbox-label">
          <div
            className={`toggle-switch ${includeLogs ? 'active' : ''}`}
            onClick={() => setIncludeLogs(!includeLogs)}
          >
            <div className="toggle-thumb"></div>
          </div>
          <span>{text.includeLogs}</span>
        </label>

        <div className="feedback-actions">
          <button className="feedback-button secondary" onClick={onClose}>{text.cancel}</button>
          <button
            className="feedback-button primary"
            onClick={handleSubmit}
            disabled={!description.trim() || isSubmitting}
          >
            {isSubmitting ? text.submitting : text.submit}
          </button>
        </div>
      </div>
    </div>
  );
};

export default FeedbackPopup;

