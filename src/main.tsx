import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import './ui/styles.css';
import { EccProvider } from './domain/store';
import { App } from './ui/App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <EccProvider>
      <App />
    </EccProvider>
  </StrictMode>,
);
