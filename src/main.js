import { playerTemplate } from './components/player-shell.js';

document.body.insertAdjacentHTML('afterbegin', playerTemplate);

const playerScripts = [
	'core.js',
	'controls.js',
	'servers.js',
	'fallback.js',
	'media.js',
	'subtitles.js',
	'introdb.js',
	'subtitle-renderer.js',
	'episodes.js',
	'ui.js'
];

const scriptLoads = playerScripts.map(file => new Promise((resolve, reject) => {
	const script = document.createElement('script');
	script.src = `/player/${file}?v=17`;
	script.async = false;
	script.onload = resolve;
	script.onerror = () => reject(new Error(`Failed to load player component: ${file}`));
	document.head.appendChild(script);
}));

try {
	await Promise.all(scriptLoads);
} catch (error) {
	console.error('[PlayerStartup] Component loading failed:', error);
	const errorMessage = document.getElementById('error-message');
	if (errorMessage) {
		errorMessage.textContent = 'The player could not start. Please refresh and try again.';
		errorMessage.classList.remove('hidden');
	}
}
