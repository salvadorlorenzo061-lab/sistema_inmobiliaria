import React from 'react';
import ReactDOM from 'react-dom/client';


import App from './App';
import reportWebVitals from './reportWebVitals';
import Axios from 'axios';

// Envia el usuario activo en cada peticion para que la bitacora registre quien hizo cada accion.
Axios.interceptors.request.use((config) => {
  try {
    const usuario = JSON.parse(localStorage.getItem('usuario') || '{}');
    if (usuario?.id_usuario) {
      config.headers = config.headers || {};
      config.headers['x-user-id'] = String(usuario.id_usuario);
      config.headers['x-user-name'] = encodeURIComponent(usuario.nombre_usuario || usuario.nombre || '');
    }
  } catch (error) {
    // Sin sesion valida: la peticion sigue sin encabezados de usuario.
  }
  return config;
});

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
