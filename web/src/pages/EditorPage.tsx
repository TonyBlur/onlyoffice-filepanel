import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import './EditorPage.css';

interface EditorConfig {
  documentType: string;
  document: {
    title: string;
    url: string;
    key: string;
    fileType?: string;
    permissions?: Record<string, boolean>;
  };
  editorConfig: {
    callbackUrl: string;
    mode: string;
    lang?: string;
    events?: {
      onRequestRefreshFile?: () => void;
      onOutdatedVersion?: () => void;
      onDocumentReady?: () => void;
      onDocumentStateChange?: (event: { data: boolean }) => void;
    };
  };
  token?: string;
  lang?: string;
  browserUrl?: string;
  callbackUrl?: string;
}

interface EditorResponse {
  docConfig: EditorConfig;
  docApiUrl: string;
  token: string;
  browserUrl: string;
  callbackUrl: string;
}

declare global {
  interface Window {
    __BACKEND_URL__?: string;
    __DOC_CONFIG__?: EditorConfig;
    __DOC_TOKEN__?: string;
    DocsAPI?: {
      DocEditor: new (containerId: string, config: EditorConfig) => {
        destroyEditor: () => void;
        refreshFile: () => void;
      };
    };
  }
}

/** Resolve the backend URL, respecting Vite env, window global, and current origin. */
function resolveBackendUrl(): string {
  try {
    const envUrl = import.meta.env?.VITE_BACKEND_URL as string | undefined;
    if (envUrl) return envUrl;
  } catch { /* not in Vite context */ }
  if (window.__BACKEND_URL__) return window.__BACKEND_URL__;
  return `${window.location.protocol}//${window.location.hostname}${window.location.port ? ':' + window.location.port : ''}`;
}

const EditorPage = (): React.ReactElement => {
  const { name } = useParams<{ name: string }>();
  const location = useLocation();
  const userMode = useMemo(() => new URLSearchParams(location.search).get('user') || 'user', [location.search]);
  const { i18n, t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [docConfig, setDocConfig] = useState<EditorConfig | null>(null);
  const [docApiUrl, setDocApiUrl] = useState('');
  const editorRef = useRef<HTMLDivElement>(null);
  const docEditorRef = useRef<{ destroyEditor: () => void; refreshFile: () => void } | null>(null);
  /** Tracks whether the document has unsaved changes (reported by OnlyOffice events). */
  const hasUnsavedChangesRef = useRef(false);
  /** Tracks whether the editor has fully loaded and the user is editing. */
  const isEditingRef = useRef(false);

  const normalizeLang = (lang: string): string => {
    if (!lang) return 'en';
    if (lang === 'zh' || lang.startsWith('zh-')) return 'zh-CN';
    if (lang === 'en' || lang.startsWith('en-')) return 'en';
    return lang;
  };

  useEffect(() => {
    const loadEditor = async () => {
      try {
        setLoading(true);
        setError('');

        const backendUrl = resolveBackendUrl();
        const response = await fetch(`${backendUrl}/api/editor-config/${encodeURIComponent(name || '')}?user=${encodeURIComponent(userMode)}`);

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = (await response.json()) as EditorResponse;
        if (!data.docConfig) {
          throw new Error(t('Failed to parse editor config'));
        }

        const cfg: EditorConfig = { ...data.docConfig };
        if (data.docApiUrl) setDocApiUrl(data.docApiUrl);
        if (data.token && !cfg.token) cfg.token = data.token;
        if (data.browserUrl && !cfg.browserUrl) cfg.browserUrl = data.browserUrl;
        if (data.callbackUrl && !cfg.callbackUrl) cfg.callbackUrl = data.callbackUrl;

        try {
          const appLang = normalizeLang(i18n?.language || 'en');
          cfg.editorConfig = { ...cfg.editorConfig, callbackUrl: cfg.editorConfig?.callbackUrl || '', mode: cfg.editorConfig?.mode || 'edit' };
          cfg.editorConfig.lang = appLang;
          cfg.lang = appLang;

          const appTheme = document.documentElement.getAttribute('data-theme') || 'light';
          (cfg.editorConfig as Record<string, unknown>).customization = {
            uiTheme: appTheme === 'dark' ? 'default-dark' : 'default-light',
          };
        } catch (e) {
          console.warn('Failed to inject language/theme into docConfig', e);
        }

        setDocConfig(cfg);

      } catch (err) {
        console.error('Failed to load editor:', err);
        setError(`${t('Failed to load editor')}: ${(err as Error).message}`);
      } finally {
        setLoading(false);
      }
    };

    if (name) {
      loadEditor();
    }
  }, [name, userMode, i18n, t]);

  // Save on unmount / page close / refresh: trigger OnlyOffice forcesave
  useEffect(() => {
    const forcesaveUrl = resolveBackendUrl();
    const url = `${forcesaveUrl}/api/forcesave-doc/${encodeURIComponent(name || '')}`;

    return () => {
      try { navigator.sendBeacon(url, '{}'); } catch { /* ignore */ }
    };
  }, [name]);

  // Warn user when closing tab/window with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChangesRef.current || isEditingRef.current) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  useEffect(() => {
    if (docConfig && editorRef.current && !docEditorRef.current) {
      const cfg = { ...docConfig };
      try {
        const nameExt = (name || '').toLowerCase();
        const ext = nameExt.includes('.') ? nameExt.substring(nameExt.lastIndexOf('.')) : '';
        if (!cfg.documentType || cfg.documentType === 'word') {
          if (ext === '.ppt' || ext === '.pptx' || ext === '.odp') cfg.documentType = 'slide';
          else if (ext === '.xls' || ext === '.xlsx' || ext === '.ods' || ext === '.csv') cfg.documentType = 'cell';
          else if (ext === '.pdf') cfg.documentType = 'word';
        }
      } catch (e) {
        console.warn('Failed to adjust documentType on client:', e);
      }

      if (typeof window.DocsAPI === 'undefined') {
        const script = document.createElement('script');
        let apiSrc = docApiUrl || (window.location.origin + '/web-apps/apps/api/documents/api.js');
        try {
          if (apiSrc && apiSrc.indexOf('docserver') !== -1) {
            const pathIndex = apiSrc.indexOf('/web-apps');
            const pathPart = pathIndex !== -1 ? apiSrc.substring(pathIndex) : '/web-apps/apps/api/documents/api.js';
            const hostNoPort = window.location.protocol + '//' + window.location.hostname;
            apiSrc = hostNoPort + pathPart;
          }
        } catch (e) {
          console.warn('Failed to rewrite docApiUrl', e);
        }

        script.src = apiSrc;
        script.onload = () => {
          initializeEditor(cfg);
        };
        script.onerror = () => {
          setError(`${t('Failed to load OnlyOffice API script')}: ${script.src}. ${t('Please confirm that the Document Server is accessible.')}`);
        };
        document.head.appendChild(script);
      } else {
        initializeEditor(cfg);
      }
    }

    return () => {
      if (docEditorRef.current) {
        docEditorRef.current.destroyEditor();
        docEditorRef.current = null;
      }
    };
  }, [docConfig, docApiUrl, t]);

  const initializeEditor = (cfg: EditorConfig) => {
    if (docEditorRef.current || !cfg) return;

    try {
      cfg.editorConfig = cfg.editorConfig || { callbackUrl: '', mode: 'edit' };
      cfg.editorConfig.events = cfg.editorConfig.events || {};

      const refreshHandler = () => {
        try {
          if (docEditorRef.current && typeof docEditorRef.current.refreshFile === 'function') {
            try { docEditorRef.current.refreshFile(); return; } catch { /* ignore */ }
          }
          window.location.reload();
        } catch {
          window.location.reload();
        }
      };

      cfg.editorConfig.events.onRequestRefreshFile = refreshHandler;
      cfg.editorConfig.events.onOutdatedVersion = refreshHandler;

      // Track document ready and unsaved state for beforeunload
      cfg.editorConfig.events.onDocumentReady = () => {
        isEditingRef.current = true;
      };
      cfg.editorConfig.events.onDocumentStateChange = (event: { data: boolean }) => {
        // OnlyOffice reports true when there are unsaved changes
        hasUnsavedChangesRef.current = !!event.data;
      };

      docEditorRef.current = new window.DocsAPI!.DocEditor('editor-container', cfg);
    } catch (err) {
      console.error('Failed to initialize editor:', err);
      setError(`${t('Failed to initialize editor')}: ${(err as Error).message}`);
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
      </div>
    </div>
  );
};

export default EditorPage;
