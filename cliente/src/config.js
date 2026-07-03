const runtimeHost =
	typeof window !== 'undefined' && window.location?.hostname
		? window.location.hostname
		: 'localhost';

const fallbackApiUrl =
	runtimeHost.includes('vercel.app')
		? 'https://api-inmobiliaria-8uln.onrender.com'
		: `http://${runtimeHost}:3001`;

export const API_BASE_URL = process.env.REACT_APP_API_URL || fallbackApiUrl;
