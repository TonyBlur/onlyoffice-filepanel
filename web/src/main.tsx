import './i18n';
import React, { useState, useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { App as AntdApp, ConfigProvider, theme } from 'antd';
import App from './pages/App';
import HomePage from './pages/HomePage';
import EditorPage from './pages/EditorPage';
import './styles.css';

function AntdThemeWrapper({ children }: { children: React.ReactNode }) {
  const [isDark, setIsDark] = useState(() => {
    return document.documentElement.getAttribute('data-theme') === 'dark';
  });

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

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <BrowserRouter>
      <AntdThemeWrapper>
        <Routes>
          <Route path="/" element={<App />}>
            <Route index element={<HomePage />} />
            <Route path="editor/:name" element={<EditorPage />} />
          </Route>
        </Routes>
      </AntdThemeWrapper>
    </BrowserRouter>
  </React.StrictMode>
);
