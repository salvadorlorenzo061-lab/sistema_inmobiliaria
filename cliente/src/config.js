const runtimeHost =
	typeof window !== 'undefined' && window.location?.hostname
		? window.location.hostname
		: 'localhost';

export const API_BASE_URL = process.env.REACT_APP_API_URL || `http://${runtimeHost}:3001`;
