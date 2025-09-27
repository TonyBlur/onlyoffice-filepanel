import React, { useState, useEffect, useRef } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import './EditorPage.css';

const EditorPage = () => {
  const { name } = useParams();
  const location = useLocation();
  const userMode = new URLSearchParams(location.search).get('user') || 'user';
  const { i18n } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [docConfig, setDocConfig] = useState(null);
  const [docApiUrl, setDocApiUrl] = useState('');
  const editorRef = useRef(null);
  const docEditorRef = useRef(null);

  const normalizeLang = (lang) => {
    if (!lang) return 'en';
    // convert common i18n short codes to OnlyOffice expected codes
    if (lang === 'zh' || lang.startsWith('zh-')) return 'zh-CN';
    if (lang === 'en' || lang.startsWith('en-')) return 'en';
    // return as-is for other locales like 'de', 'fr', etc.
    return lang;
  };

  useEffect(() => {
    const loadEditor = async () => {
      try {
        setLoading(true);
        setError('');
        
        // 获取JWT token和编辑器配置
        // 后端地址优先从构建时环境变量（Vite: import.meta.env.VITE_BACKEND_URL）或运行时注入的 window.__BACKEND_URL__ 获取，
        // 否则回退到当前 origin（相对路径）。避免在代码中写死端口导致 docker-compose 修改端口后失效。
        let backendUrl = '';
        try {
          // Vite 环境变量（在开发/构建时注入）
          if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_BACKEND_URL) {
            backendUrl = import.meta.env.VITE_BACKEND_URL;
          }
        } catch (e) {
          // ignore
        }
        if (!backendUrl && window.__BACKEND_URL__) backendUrl = window.__BACKEND_URL__;
        if (!backendUrl) backendUrl = `${window.location.protocol}//${window.location.hostname}${window.location.port ? ':' + window.location.port : ''}`;

        const response = await fetch(`${backendUrl}/editor/${encodeURIComponent(name)}?user=${encodeURIComponent(userMode)}`);
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const html = await response.text();
        
        // 解析HTML中的docConfig - 更稳健的提取方式
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const scripts = Array.from(doc.querySelectorAll('script'));
        let found = false;
        for (let i = 0; i < scripts.length; i++) {
          const s = scripts[i];
          const txt = s.textContent || '';
          if (txt.includes('docConfig')) {
            // 提取前一个带 src 的 script 作为 Docs API 地址（如果存在）
            const prevWithSrc = scripts.slice(0, i).reverse().find(x => x.src && x.src.trim());
            if (prevWithSrc && prevWithSrc.src) {
              setDocApiUrl(prevWithSrc.src);
            }

            // 找到 docConfig 的赋值位置并提取 JSON 对象（使用括号匹配以应对嵌套）
            const assignIndex = txt.indexOf('docConfig');
            const eqIndex = txt.indexOf('=', assignIndex);
            const braceStart = txt.indexOf('{', eqIndex);
            if (braceStart === -1) break;
            let depth = 0;
            let endIndex = -1;
            for (let j = braceStart; j < txt.length; j++) {
              const ch = txt[j];
              if (ch === '{') depth++;
              else if (ch === '}') depth--;
              if (depth === 0) { endIndex = j; break; }
            }
            if (endIndex === -1) break;
            const jsonStr = txt.substring(braceStart, endIndex + 1);
            try {
              const cfg = JSON.parse(jsonStr);
              // inject language from app settings so OnlyOffice UI follows admin panel lang
              try {
                const appLang = normalizeLang(i18n && i18n.language ? i18n.language : 'en');
                cfg.editorConfig = cfg.editorConfig || {};
                // set both editorConfig.lang and top-level lang as in the example
                cfg.editorConfig.lang = appLang;
                cfg.lang = appLang;
              } catch (e) {
                console.warn('Failed to inject language into docConfig', e);
              }
              // Try to extract docConfig.token assigned later in the same script
              const tokenMatch = txt.match(/docConfig\.token\s*=\s*['\"]([^'\"]+)['\"]/);
              if (tokenMatch && tokenMatch[1]) {
                cfg.token = tokenMatch[1];
              }
              // Also try to extract browserUrl and callbackUrl if assigned later
              const browserMatch = txt.match(/docConfig\.browserUrl\s*=\s*['\"]([^'\"]+)['\"]/);
              if (browserMatch && browserMatch[1]) cfg.browserUrl = browserMatch[1];
              const callbackMatch = txt.match(/docConfig\.callbackUrl\s*=\s*['\"]([^'\"]+)['\"]/);
              if (callbackMatch && callbackMatch[1]) cfg.callbackUrl = callbackMatch[1];
              setDocConfig(cfg);
              found = true;
              break;
            } catch (e) {
              console.warn('Failed to JSON.parse docConfig:', e);
            }
          }
        }

        if (!found) {
          throw new Error('无法解析编辑器配置');
        }
        
      } catch (err) {
        console.error('Failed to load editor:', err);
        setError(`无法加载编辑器: ${err.message}`);
      } finally {
        setLoading(false);
      }
    };

    if (name) {
      loadEditor();
    }
  }, [name, userMode, i18n]);

  useEffect(() => {
    if (docConfig && editorRef.current && !docEditorRef.current) {
      // Ensure documentType is correct on the client as a final guard
      try {
        const nameExt = (name || '').toLowerCase();
        const ext = nameExt.includes('.') ? nameExt.substring(nameExt.lastIndexOf('.')) : '';
        if (!docConfig.documentType || docConfig.documentType === 'word') {
          if (ext === '.ppt' || ext === '.pptx' || ext === '.odp') docConfig.documentType = 'slide';
          else if (ext === '.xls' || ext === '.xlsx' || ext === '.ods' || ext === '.csv') docConfig.documentType = 'cell';
          else if (ext === '.pdf') docConfig.documentType = 'word';
        }
      } catch (e) {
        console.warn('Failed to adjust documentType on client:', e);
      }

      // Debug: print final docConfig the client will pass to DocsAPI
      try { console.info('Final docConfig before init:', docConfig); } catch (e) {}
       // 动态加载OnlyOffice API
       if (typeof DocsAPI === 'undefined') {
        const script = document.createElement('script');
        // use extracted docApiUrl if available, otherwise fallback to a common path
        let apiSrc = docApiUrl || (window.location.origin + '/web-apps/apps/api/documents/api.js');
        // If backend returned placeholder host 'docserver', replace with current host (no port)
        try {
          // If apiSrc references the placeholder host 'docserver', replace host with current origin's hostname (no port)
          if (apiSrc && apiSrc.indexOf('docserver') !== -1) {
            const pathIndex = apiSrc.indexOf('/web-apps');
            const pathPart = pathIndex !== -1 ? apiSrc.substring(pathIndex) : '/web-apps/apps/api/documents/api.js';
            const hostNoPort = window.location.protocol + '//' + window.location.hostname; // e.g. http://localhost
            apiSrc = hostNoPort + pathPart;
            console.warn('Rewrote docserver api URL to', apiSrc);
          }
        } catch (e) {
          console.warn('Failed to rewrite docApiUrl', e);
        }

        script.src = apiSrc;
        script.onload = () => {
          initializeEditor();
        };
        script.onerror = (e) => {
          console.error('Failed to load DocsAPI script:', script.src, e);
          setError(`无法加载 OnlyOffice API 脚本: ${script.src}。请确认 OnlyOffice Document Server 在可访问的主机上（例如 http://localhost）。`);
        };
        document.head.appendChild(script);
      } else {
        initializeEditor();
      }
    }

    return () => {
      if (docEditorRef.current) {
        docEditorRef.current.destroyEditor();
        docEditorRef.current = null;
      }
    };
  }, [docConfig, docApiUrl]);

  const initializeEditor = () => {
    if (docEditorRef.current) return;

    try {
      docEditorRef.current = new DocsAPI.DocEditor('editor-container', docConfig);
    } catch (err) {
      console.error('Failed to initialize editor:', err);
      setError(`初始化编辑器失败: ${err.message}`);
    }
  };

  if (loading) {
    return (
      <div className="editor-loading">
        <div className="loading-spinner">正在加载编辑器...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="editor-error">
        <h2>编辑器错误</h2>
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="editor-page">
      <div id="editor-container" ref={editorRef} className="editor-container">
        {/* OnlyOffice编辑器将在这里显示 */}
      </div>
    </div>
  );
};

export default EditorPage;
