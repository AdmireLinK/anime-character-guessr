import { useState, useCallback, useEffect, useRef } from 'react';

/**
 * 带重试功能的图片组件
 * @param {string} src - 图片源地址
 * @param {string} alt - 图片描述
 * @param {number} maxRetries - 最大重试次数，默认3次
 * @param {number} retryDelay - 重试延迟（毫秒），默认1000ms
 * @param {string} fallbackSrc - 加载失败后的备用图片
 * @param {object} props - 其他传递给img标签的属性
 */
function Image({ 
  src, 
  alt = '', 
  maxRetries = 3, 
  retryDelay = 1000, 
  fallbackSrc = null,
  onLoadSuccess,
  onLoadError,
  ...props 
}) {
  const [currentSrc, setCurrentSrc] = useState(src);
  const [retryCount, setRetryCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [hasFailed, setHasFailed] = useState(false);
  const retryTimeoutRef = useRef(null);
  const mountedRef = useRef(true);

  // 当src改变时重置状态
  useEffect(() => {
    mountedRef.current = true;
    setCurrentSrc(src);
    setRetryCount(0);
    setIsLoading(true);
    setHasFailed(false);
    
    return () => {
      mountedRef.current = false;
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, [src]);

  const handleError = useCallback(() => {
    if (!mountedRef.current) return;

    if (retryCount < maxRetries) {
      // 还有重试机会，延迟后重试
      const nextRetry = retryCount + 1;
      console.log(`[Image] 图片加载失败，正在重试 (${nextRetry}/${maxRetries}): ${src}`);
      
      retryTimeoutRef.current = setTimeout(() => {
        if (!mountedRef.current) return;
        setRetryCount(nextRetry);
        // 添加时间戳绕过缓存
        const separator = src.includes('?') ? '&' : '?';
        setCurrentSrc(`${src}${separator}_retry=${Date.now()}`);
      }, retryDelay * nextRetry); // 指数退避
    } else {
      // 已达到最大重试次数
      console.warn(`[Image] 图片加载失败，已达到最大重试次数: ${src}`);
      setIsLoading(false);
      setHasFailed(true);
      
      if (fallbackSrc) {
        setCurrentSrc(fallbackSrc);
      }
      
      if (onLoadError) {
        onLoadError(new Error(`Failed to load image after ${maxRetries} retries: ${src}`));
      }
    }
  }, [src, retryCount, maxRetries, retryDelay, fallbackSrc, onLoadError]);

  const handleLoad = useCallback(() => {
    if (!mountedRef.current) return;
    setIsLoading(false);
    setHasFailed(false);
    if (onLoadSuccess) {
      onLoadSuccess();
    }
  }, [onLoadSuccess]);

  return (
    <img
      src={currentSrc}
      alt={alt}
      onError={handleError}
      onLoad={handleLoad}
      {...props}
    />
  );
}

export default Image;
