import React, { useState } from 'react';
import '../styles/FeedbackPopup.css';

const FEEDBACK_TYPES = [
  'Bug反馈',
  '标签缺失',
  '标签错误',
  '功能建议',
  '体验问题',
  '其他'
];

const FeedbackPopup = ({ onClose, onSubmit }) => {
  const [type, setType] = useState(FEEDBACK_TYPES[0]);
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    const trimmed = description.trim();
    if (!trimmed || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onSubmit?.({ type, description: trimmed });
      onClose?.();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="feedback-popup-overlay" role="dialog" aria-modal="true">
      <div className="feedback-popup">
        <div className="feedback-header">
          <h3>Bug反馈</h3>
        </div>

        <label className="feedback-label">
          反馈类型
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="feedback-select"
          >
            {FEEDBACK_TYPES.map(option => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </label>

        <label className="feedback-label">
          描述
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="简单描述问题"
            rows={4}
            className="feedback-textarea"
            maxLength={100}
          />
          <div className="feedback-hint">{description.length}/100</div>
        </label>

        <div className="feedback-actions">
          <button className="feedback-button secondary" onClick={onClose}>取消</button>
          <button
            className="feedback-button primary"
            onClick={handleSubmit}
            disabled={!description.trim() || isSubmitting}
          >
            {isSubmitting ? '提交中...' : '提交'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default FeedbackPopup;

