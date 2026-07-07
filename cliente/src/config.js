const runtimeHost =
	typeof window !== 'undefined' && window.location?.hostname
		? window.location.hostname
		: 'localhost';

const isLocalHost = ['localhost', '127.0.0.1', '::1'].includes(String(runtimeHost).toLowerCase());
const envApiUrl = String(process.env.REACT_APP_API_URL || '').trim();
const envIsLocalUrl = /^https?:\/\/(localhost|127\.0\.0\.1|::1)(:\d+)?/i.test(envApiUrl);

const remoteApiDefault = 'https://api-inmobiliaria-8uln.onrender.com';
const localApiDefault = `http://${runtimeHost}:3001`;

export const API_BASE_URL = envApiUrl
	? (!isLocalHost && envIsLocalUrl ? remoteApiDefault : envApiUrl)
	: (isLocalHost ? localApiDefault : remoteApiDefault);
