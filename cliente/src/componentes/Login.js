import { useState } from 'react';
import Axios from 'axios';
import Swal from 'sweetalert2';
import { API_BASE_URL } from '../config';

function Login({ onLoginSuccess }) {
  const [correo, setCorreo] = useState('');
  const [clave, setClave] = useState('');
  const [cargando, setCargando] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!correo.trim() || !clave.trim()) {
      Swal.fire({ icon: 'warning', title: 'Campos requeridos', text: 'Ingresa correo y contraseña.' });
      return;
    }

    try {
      setCargando(true);
      const response = await Axios.post(`${API_BASE_URL}/api/usuarios/login`, {
        correo: correo.trim(),
        clave: clave.trim()
      });

      const usuario = response.data || {};
      localStorage.setItem('usuario', JSON.stringify(usuario));
      window.dispatchEvent(new Event('usuario-updated'));

      if (typeof onLoginSuccess === 'function') {
        onLoginSuccess(usuario);
      }
    } catch (error) {
      Swal.fire({
        icon: 'error',
        title: 'Acceso denegado',
        text: error.response?.data?.message || 'No se pudo iniciar sesión.'
      });
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="container-fluid min-vh-100 d-flex align-items-center justify-content-center bg-light">
      <div className="card shadow" style={{ width: '100%', maxWidth: '520px' }}>
        <div className="text-center pt-4 pb-2">
          <img
            src="/images/logo.svg"
            alt="Grupo de Inversion"
            style={{ width: '220px', maxWidth: '82%', height: 'auto' }}
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
          <div className="fw-bold text-success mt-2" style={{ fontSize: '1.6rem', letterSpacing: '0.5px' }}>
            GRUPO DE INVERSION
          </div>
        </div>
        <div className="card-header bg-primary text-white">
          <h5 className="mb-0 fw-bold">Ingreso al Sistema</h5>
        </div>
        <div className="card-body">
          <form onSubmit={handleSubmit}>
            <div className="mb-3">
              <label className="form-label fw-bold">Correo electrónico</label>
              <input
                type="email"
                className="form-control"
                value={correo}
                onChange={(e) => setCorreo(e.target.value)}
                placeholder="usuario@correo.com"
                autoComplete="username"
              />
            </div>
            <div className="mb-4">
              <label className="form-label fw-bold">Contraseña</label>
              <input
                type="password"
                className="form-control"
                value={clave}
                onChange={(e) => setClave(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </div>
            <button type="submit" className="btn btn-primary w-100 fw-bold" disabled={cargando}>
              {cargando ? 'Ingresando...' : 'Iniciar sesión'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default Login;
