import '@ant-design/v5-patch-for-react-19';
import './i18n';
import React, { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { App as AntdApp, ConfigProvider, theme, Spin } from 'antd';
import App from './pages/App';
import HomePage from './pages/HomePage';
import './styles.css';

const EditorPage = lazy(() => import('./pages/EditorPage'));

/** Resolve initial theme synchronously to avoid first-render flash.
 *  Must match the logic in App.tsx's resolveTheme(). */
function getInitialIsDark(): boolean {
  const saved = localStorage.getItem('theme');
  const pref = saved || 'system';
  if (pref === 'system') {
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  }
  return pref === 'dark';
}

function AntdThemeWrapper({ children }: { children: React.ReactNode }) {
  const [isDark, setIsDark] = useState(getInitialIsDark);

  useEffect(() => {
    const observer = new MutationObserver(() => {
      const dark = document.documentElement.getAttribute('data-theme') === 'dark';
      setIsDark(dark);
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  const antdTheme = useMemo(() => ({
    algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
    token: {
      colorPrimary: '#365BFF',
      controlOutline: 'transparent',
      fontFamily: "'MiSans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'PingFang SC', 'Microsoft YaHei', sans-serif",
    },
    components: {
      Button: {
        primaryShadow: 'none',
        primaryColor: '#fff',
      },
      Select: {
        optionSelectedFontWeight: 600,
      },
    },
  }), [isDark]);

  return (
    <ConfigProvider theme={antdTheme}>
      <AntdApp>
        {children}
      </AntdApp>
    </ConfigProvider>
  );
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}

// Set data-theme before React render so CSS variables are correct from first paint
document.documentElement.setAttribute('data-theme', getInitialIsDark() ? 'dark' : 'light');
// Set html lang attribute from saved preference
document.documentElement.lang = localStorage.getItem('preferred_language') === 'zh' ? 'zh-CN' : 'en';

const RouteFallback = <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}><Spin size="large" /></div>;

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <BrowserRouter>
      <AntdThemeWrapper>
        <Routes>
          <Route path="/" element={<App />}>
            <Route index element={<HomePage />} />
            <Route path="editor/:name" element={<Suspense fallback={RouteFallback}><EditorPage /></Suspense>} />
          </Route>
        </Routes>
      </AntdThemeWrapper>
    </BrowserRouter>
  </React.StrictMode>
);
