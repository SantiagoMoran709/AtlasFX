import React from 'react';
import {createRoot} from 'react-dom/client';
import {App} from './App';
import './theme.css';
void document.fonts.load('36px Inter').catch(()=>{});
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
