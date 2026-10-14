function getCurrentServerMedia() {
    const path = window.location.pathname;
    const tvMatch = path.match(/\/tv\/(\d+)\/(?:S)?(\d+)\/(?:E)?(\d+)/i);
    if (tvMatch) {
        return { type: 'tv', id: tvMatch[1], season: tvMatch[2], episode: tvMatch[3] };
    }

    const movieMatch = path.match(/\/movie\/(\d+)/i);
    if (movieMatch) return { type: 'movie', id: movieMatch[1] };

    const params = new URLSearchParams(window.location.search);
    const type = params.get('type');
    const id = params.get('tmdb') || params.get('id');
    if (id && type === 'tv') {
        return { type, id, season: params.get('s') || '1', episode: params.get('e') || '1' };
    }
    if (id && type === 'movie') return { type, id };
    return { type: null, id: null };
}

function getCurrentServerOptions() {
    const media = getCurrentServerMedia();
    if (!media.id) return [];
    if (media.type === 'movie') {
        return [
            { id: 'primary', name: 'Moonflix Player' },
            { name: 'Nitno', url: `https://vidout.pages.dev/movie/${media.id}` },
            { name: 'Ranger', url: `https://rozgarlelo.modiplay.xyz/embed/tmdb/movie?id=${media.id}` },
            { name: 'Filem', url: `https://embed.filmu.in/movie/${media.id}` },
            { name: 'Hexon', url: `https://nxsha.space/embed/movie/${media.id}` },
        ];
    }
    if (media.type === 'tv') {
        return [
            { id: 'primary', name: 'Moonflix Player' },
            { name: 'Nitno', url: `https://vidout.pages.dev/tv/${media.id}/S${media.season}/E${media.episode}` },
            { name: 'Ranger', url: `https://rozgarlelo.modiplay.xyz/embed/tmdb/tv?id=${media.id}&s=${media.season}&e=${media.episode}` },
            { name: 'Filem', url: `https://embed.filmu.in/tv/${media.id}/${media.season}/${media.episode}` },
            { name: 'Hexon', url: `https://nxsha.space/embed/tv/${media.id}/${media.season}/${media.episode}` },
        ];
    }
    return [];
}

const serverPickerWrapper = document.createElement('div');
serverPickerWrapper.className = 'server-picker-wrapper';

const serverButton = document.createElement('button');
serverButton.id = 'servers-button';
serverButton.type = 'button';
serverButton.className = 'bottom-control-button text-white flex items-center justify-center md:h-9 md:w-9 flex-shrink-0 cursor-pointer focus:outline-none mobile-labeled-btn';
serverButton.title = 'Embed player servers';
serverButton.setAttribute('aria-label', 'Embed player servers');
serverButton.setAttribute('aria-expanded', 'false');
serverButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="w-6 h-6 md:w-full md:h-full flex-shrink-0"><rect x="3" y="4" width="18" height="7" rx="1.5"/><rect x="3" y="13" width="18" height="7" rx="1.5"/><path d="M7 7.5h.01M7 16.5h.01" stroke-width="3"/></svg><span class="mobile-btn-label">Servers</span>';

const serverPickerMenu = document.createElement('div');
serverPickerMenu.id = 'server-picker-menu';
serverPickerMenu.className = 'embed-server-menu hidden';
serverPickerMenu.setAttribute('aria-label', 'Embed player servers');
const serverMenuHeader = document.createElement('div');
serverMenuHeader.className = 'embed-server-menu-header';
const serverMenuTitle = document.createElement('h4');
serverMenuTitle.textContent = 'EMBED PLAYER';
const serverMenuClose = document.createElement('button');
serverMenuClose.type = 'button';
serverMenuClose.className = 'embed-server-menu-close';
serverMenuClose.setAttribute('aria-label', 'Close server list');
serverMenuClose.title = 'Close server list';
serverMenuClose.textContent = '×';
serverMenuHeader.append(serverMenuTitle, serverMenuClose);
const serverOptionList = document.createElement('div');
serverOptionList.className = 'embed-server-options';
serverPickerMenu.append(serverMenuHeader, serverOptionList);
serverPickerWrapper.append(serverButton, serverPickerMenu);
document.getElementById('speed-quality-wrapper')?.insertAdjacentElement('afterend', serverPickerWrapper);
window._embedServerMenu = serverPickerMenu;

const serverFrameOverlay = document.createElement('div');
serverFrameOverlay.className = 'server-frame-overlay hidden';
serverFrameOverlay.innerHTML = '<div class="server-frame-header"><button type="button" class="server-frame-choose">Choose servers</button></div><div class="server-frame-loading hidden" role="status" aria-live="polite"><img class="server-frame-spinner" src="https://assets.nflxext.com/en_us/pages/wiplayer/site-spinner.png" alt=""><span class="server-frame-loading-message">Loading server...</span></div><iframe class="server-frame" allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowfullscreen title="Embedded video player"></iframe>';
videoContainer.appendChild(serverFrameOverlay);
let serverFrame = serverFrameOverlay.querySelector('.server-frame');
const serverFrameLoading = serverFrameOverlay.querySelector('.server-frame-loading');
const serverFrameSpinner = serverFrameOverlay.querySelector('.server-frame-spinner');
const serverFrameLoadingMessage = serverFrameOverlay.querySelector('.server-frame-loading-message');
const frameChooseServersButton = serverFrameOverlay.querySelector('.server-frame-choose');
let selectedServerName = 'Moonflix Player';
let serverFrameLoadTimer = null;
let serverFrameLoadStartedAt = 0;
const SERVER_SPINNER_MIN_VISIBLE_MS = 900;

function watchServerFrame(frame) {
    frame.addEventListener('load', () => {
        if (frame !== serverFrame) return;
        clearTimeout(serverFrameLoadTimer);
        const remainingVisibleMs = SERVER_SPINNER_MIN_VISIBLE_MS - (performance.now() - serverFrameLoadStartedAt);
        if (remainingVisibleMs > 0) {
            serverFrameLoadTimer = setTimeout(() => {
                if (frame !== serverFrame) return;
                serverFrameLoadTimer = null;
                serverFrameLoading.classList.add('hidden');
            }, remainingVisibleMs);
        } else {
            serverFrameLoadTimer = null;
            serverFrameLoading.classList.add('hidden');
        }
    });
}

watchServerFrame(serverFrame);

function stopServerFrame() {
    clearTimeout(serverFrameLoadTimer);
    serverFrameLoadTimer = null;
    serverFrameLoadStartedAt = 0;
    serverFrame.src = 'about:blank';
    serverFrameLoading.classList.add('hidden');
    serverFrameSpinner.classList.remove('hidden');
    serverFrameLoadingMessage.textContent = 'Loading server...';
}

function loadServerFrame(option) {
    clearTimeout(serverFrameLoadTimer);
    serverFrameLoadStartedAt = performance.now();
    serverFrameLoading.classList.remove('hidden');
    serverFrameSpinner.classList.remove('hidden');
    serverFrameLoadingMessage.textContent = `Loading ${option.name}...`;

    const previousFrame = serverFrame;
    const nextFrame = document.createElement('iframe');
    nextFrame.className = 'server-frame';
    nextFrame.setAttribute(
        'allow',
        option.name === 'Filem'
            ? 'autoplay; encrypted-media; picture-in-picture'
            : 'autoplay; fullscreen; picture-in-picture; encrypted-media'
    );
    nextFrame.allowFullscreen = true;
    nextFrame.title = `${option.name} embedded player`;
    serverFrame = nextFrame;
    watchServerFrame(nextFrame);

    previousFrame.src = 'about:blank';
    previousFrame.replaceWith(nextFrame);
    nextFrame.src = option.url;

    serverFrameLoadTimer = setTimeout(() => {
        if (serverFrame !== nextFrame) return;
        serverFrameLoadTimer = null;
        serverFrameSpinner.classList.add('hidden');
        serverFrameLoadingMessage.textContent = `${option.name} is taking too long to respond. Choose another server.`;
    }, 20000);
}

function closeServerPickerMenu() {
    serverPickerMenu.classList.add('hidden');
    serverPickerMenu.classList.remove('server-menu-over-embed');
    if (serverPickerMenu.parentElement === serverFrameOverlay) {
        serverPickerWrapper.appendChild(serverPickerMenu);
    }
    serverButton.setAttribute('aria-expanded', 'false');
    resetInactivityTimer();
}

function openServerPickerMenu(overEmbed = false) {
    if (overEmbed) {
        serverFrameOverlay.appendChild(serverPickerMenu);
        serverPickerMenu.classList.add('server-menu-over-embed');
    } else if (serverPickerMenu.parentElement !== serverPickerWrapper) {
        serverPickerWrapper.appendChild(serverPickerMenu);
        serverPickerMenu.classList.remove('server-menu-over-embed');
    }
    serverPickerMenu.classList.remove('hidden');
    serverButton.setAttribute('aria-expanded', 'true');
    clearTimeout(inactivityTimer);
    showControls();
}

function closeServerFrame() {
    serverFrameOverlay.classList.add('hidden');
    stopServerFrame();
    selectedServerName = 'Moonflix Player';
    renderServerOptions();
    resetInactivityTimer();
}

function openServerFrame(serverName) {
    const option = getCurrentServerOptions().find(item => item.id === serverName || item.name === serverName);
    if (!option) return;

    if (option.id === 'primary') {
        selectedServerName = option.name;
        closeServerPickerMenu();
        closeServerFrame();
        video.play().catch(error => displayError('Play failed: ' + error.message));
        return;
    }

    video.pause();
    selectedServerName = option.name;
    serverFrameOverlay.classList.remove('hidden');
    loadServerFrame(option);
    closeServerPickerMenu();
    serverOptionList.querySelectorAll('button').forEach(button => {
        const selected = button.dataset.server === option.name;
        button.setAttribute('aria-pressed', String(selected));
        button.querySelector('.embed-server-check').textContent = selected ? '✓' : '';
    });
}

function switchToNextEmbedServer(reason) {
    const options = getCurrentServerOptions();
    const primaryOption = options.find(option => option.id === 'primary');
    if (!primaryOption || selectedServerName !== primaryOption.name ||
        !serverFrameOverlay.classList.contains('hidden')) return false;

    const currentIndex = options.indexOf(primaryOption);
    const nextOption = options[currentIndex + 1];
    if (!nextOption) return false;

    console.warn(`[Server fallback] ${reason || 'Primary stream failed'}; switching to ${nextOption.name}.`);
    hideLoader();
    openServerFrame(nextOption.id || nextOption.name);
    return true;
}

window._switchToNextEmbedServer = switchToNextEmbedServer;

function renderServerOptions() {
    serverOptionList.replaceChildren();
    const options = getCurrentServerOptions();
    if (!options.length) {
        const emptyMessage = document.createElement('p');
        emptyMessage.className = 'embed-server-empty';
        emptyMessage.textContent = 'No embed servers available for this page.';
        serverOptionList.appendChild(emptyMessage);
        return;
    }

    options.forEach(option => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'embed-server-option';
        button.dataset.server = option.id || option.name;
        button.setAttribute('aria-pressed', String(selectedServerName === option.name));
        const check = document.createElement('span');
        check.className = 'embed-server-check';
        check.setAttribute('aria-hidden', 'true');
        check.textContent = selectedServerName === option.name ? '✓' : '';
        const label = document.createElement('span');
        label.textContent = option.name;
        button.append(check, label);
        button.addEventListener('click', () => openServerFrame(option.id || option.name));
        serverOptionList.appendChild(button);
    });
}

renderServerOptions();
serverButton.addEventListener('click', event => {
    event.stopPropagation();
    const isHidden = serverPickerMenu.classList.contains('hidden');
    audioSubtitleMenu.classList.add('hidden');
    speedQualityMenu.classList.add('hidden');
    if (isHidden) {
        openServerPickerMenu();
    } else {
        closeServerPickerMenu();
    }
});

serverMenuClose.addEventListener('click', closeServerPickerMenu);
frameChooseServersButton.addEventListener('click', event => {
    event.stopPropagation();
    audioSubtitleMenu.classList.add('hidden');
    speedQualityMenu.classList.add('hidden');
    openServerPickerMenu(true);
});

document.addEventListener('click', event => {
    if (window.innerWidth >= 1000 && !serverPickerMenu.classList.contains('hidden') &&
        !serverPickerMenu.contains(event.target) && !serverButton.contains(event.target) &&
        !frameChooseServersButton.contains(event.target)) {
        closeServerPickerMenu();
    }
});

document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (!serverPickerMenu.classList.contains('hidden')) {
        closeServerPickerMenu();
    } else if (!serverFrameOverlay.classList.contains('hidden')) {
        closeServerFrame();
    }
});