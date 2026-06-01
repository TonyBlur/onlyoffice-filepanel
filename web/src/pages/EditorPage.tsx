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
    };
  };
  token?: string;
  lang?: string;
}

interface EditorResponse {
  docConfig: EditorConfig;
  docApiUrl: string;
  token: string;
}

declare global {
  interface Window {
    __BACKEND_URL__?: string;
    DocsAPI?: {
      DocEditor: new (containerId: string, config: EditorConfig) => {
        destroyEditor: () => void;
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
  const docEditorRef = useRef<{ destroyEditor: () => void } | null>(null);

  // No forced-save on navigation.  OnlyOffice auto-saves when destroyEditor()
  // is called on component unmount, but ONLY if the document was actually edited.

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

  // No sendBeacon safety-net needed.  OnlyOffice's destroyEditor() (called on
  // component unmount) triggers auto-save which fires the webhook callback.

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

      // OnlyOffice may fire onOutdatedVersion when it detects the file on disk
      // has changed after a webhook save.  In our setup the only "external"
      // change comes from our own webhook writing back the same content that
      // OnlyOffice just saved — so the editor already has the latest version.
      // We intentionally do NOTHING here: calling refreshFile() (non-standard
      // API) or window.location.reload() puts the editor into a broken state.
      // A no-op handler causes OnlyOffice to silently dismiss the event.
      cfg.editorConfig.events.onOutdatedVersion = () => {};
      cfg.editorConfig.events.onRequestRefreshFile = () => {};

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
