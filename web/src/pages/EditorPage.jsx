import React, { useState, useEffect, useRef } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import './EditorPage.css';

const EditorPage = () => {
  const { name } = useParams();
  const location = useLocation();
  const userMode = new URLSearchParams(location.search).get('user') || 'user';
  const { i18n, t } = useTranslation();
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

        const response = await fetch(`${backendUrl}/api/editor-config/${encodeURIComponent(name)}?user=${encodeURIComponent(userMode)}`);
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        if (!data.docConfig) {
          throw new Error(t('Failed to parse editor config'));
        }

        const cfg = data.docConfig;
        if (data.docApiUrl) {
          setDocApiUrl(data.docApiUrl);
        }
        if (data.token && !cfg.token) {
          cfg.token = data.token;
        }
        if (data.browserUrl && !cfg.browserUrl) {
          cfg.browserUrl = data.browserUrl;
        }
        if (data.callbackUrl && !cfg.callbackUrl) {
          cfg.callbackUrl = data.callbackUrl;
        }

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

        setDocConfig(cfg);
        
      } catch (err) {
        console.error('Failed to load editor:', err);
        setError(`${t('Failed to load editor')}: ${err.message}`);
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
          setError(`${t('Failed to load OnlyOffice API script')}: ${script.src}. ${t('Please confirm that the Document Server is accessible.')}`);
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
      // Attach compatibility event handlers for OnlyOffice
      try {
        docConfig.editorConfig = docConfig.editorConfig || {};
        docConfig.editorConfig.events = docConfig.editorConfig.events || {};

        const refreshHandler = function () {
          try {
            // If instance exists and supports refreshFile, call it; otherwise reload page as fallback
            if (docEditorRef.current && typeof docEditorRef.current.refreshFile === 'function') {
              try { docEditorRef.current.refreshFile(); return; } catch (e) { /* ignore */ }
            }
            // Fallback: reload whole page to force fresh editor/file
            window.location.reload();
          } catch (e) {
            console.warn('refreshHandler failed, reloading page', e);
            window.location.reload();
          }
        };

        // New recommended event
        docConfig.editorConfig.events.onRequestRefreshFile = refreshHandler;
        // Backwards-compatible deprecated event
        docConfig.editorConfig.events.onOutdatedVersion = function () {
          console.warn("Obsolete: onOutdatedVersion called, delegating to onRequestRefreshFile");
          refreshHandler();
        };
      } catch (e) {
        console.warn('Failed to attach compatibility events to docConfig:', e);
      }

      docEditorRef.current = new DocsAPI.DocEditor('editor-container', docConfig);
    } catch (err) {
      console.error('Failed to initialize editor:', err);
      setError(`${t('Failed to initialize editor')}: ${err.message}`);
    }
  };

  if (loading) {
    return (
      <div className="editor-loading">
        <div className="loading-spinner">{t('Loading editor...')}</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="editor-error">
        <h2>{t('Editor error')}</h2>
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
