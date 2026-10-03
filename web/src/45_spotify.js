/* Optional browser-side Spotify adapter for Dynamic. */
(function (root) {
  'use strict';

  const AUTH_URL = 'https://accounts.spotify.com/authorize';
  const TOKEN_URL = 'https://accounts.spotify.com/api/token';
  const API_URL = 'https://api.spotify.com/v1';
  const SCOPES = 'user-read-currently-playing user-read-playback-state user-modify-playback-state';
  const CONFIG_KEY = 'dynamics.spotify.config';
  const SESSION_KEY = 'dynamics.spotify.session';
  const POLL_MS = 5000;

  function storage(which) {
    try { return root[which]; } catch (_) { return null; }
  }
  function randomString(length) {
    const bytes = new Uint8Array(length);
    root.crypto.getRandomValues(bytes);
    return Array.from(bytes, b => String.fromCharCode(65 + (b % 26))).join('');
  }
  function base64url(buffer) {
    let binary = '';
    new Uint8Array(buffer).forEach(b => { binary += String.fromCharCode(b); });
    return root.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }
  function errorMessage(status, body, retryAfter) {
    if (status === 401) return 'Spotify authorization expired or was rejected. Reconnect Spotify.';
    if (status === 403) return 'Spotify denied this request. Check account eligibility and granted scopes.';
    if (status === 429) return 'Spotify rate limited this request.' + (retryAfter ? ' Retry after ' + retryAfter + ' seconds.' : '');
    return (body && body.error && (body.error.message || body.error)) || ('Spotify request failed (' + status + ').');
  }

  class DynamicsSpotify {
    constructor(onState) {
      this.onState = typeof onState === 'function' ? onState : function () {};
      this.config = this._loadConfig();
      this.session = this._loadSession();
      this.status = this.session && this.session.accessToken ? 'connected' : 'disconnected';
      this.error = '';
      this.track = null;
      this.artwork = '';
      this.positionMs = 0;
      this.durationMs = 0;
      this.playing = false;
      this.timer = null;
      this.retryTimer = null;
      this.inFlight = null;
      this.generation = 0;
      this.controllers = new Set();
      this._visibilityHandler = () => this._visibilityChanged();
      if (root.document) root.document.addEventListener('visibilitychange', this._visibilityHandler);
      if (this.status === 'connected') this._startPolling();
      this._emit();
    }

    _loadConfig() {
      try { return JSON.parse(storage('localStorage').getItem(CONFIG_KEY) || '{}'); } catch (_) { return {}; }
    }
    _saveConfig() {
      try { storage('localStorage').setItem(CONFIG_KEY, JSON.stringify(this.config)); } catch (_) {}
    }
    _loadSession() {
      try { return JSON.parse(storage('sessionStorage').getItem(SESSION_KEY) || 'null'); } catch (_) { return null; }
    }
    _saveSession() {
      try {
        const store = storage('sessionStorage');
        if (this.session) store.setItem(SESSION_KEY, JSON.stringify(this.session));
        else store.removeItem(SESSION_KEY);
      } catch (_) {}
    }
    _emit() {
      this.onState({
        status: this.status,
        error: this.error,
        connected: this.status === 'connected',
        needsSetup: !this.config.clientId || !this.config.redirectUri,
        track: this.track,
        artwork: this.artwork,
        positionMs: this.positionMs,
        durationMs: this.durationMs,
        playing: this.playing
      });
    }
    _setError(message, status) {
      this.error = message || '';
      if (status) this.status = status;
      this._emit();
    }

    configure(clientId, redirectUri) {
      const id = String(clientId || '').trim();
      const uri = String(redirectUri || '').trim();
      if (!id || !uri) throw new Error('Spotify Client ID and redirect URI are required.');
      let parsed;
      try { parsed = new URL(uri); } catch (_) { throw new Error('Enter a valid HTTPS redirect URI, or an http://127.0.0.1 loopback URI.'); }
      const isLoopback = parsed.protocol === 'http:' && (parsed.hostname === '127.0.0.1' || parsed.hostname === '[::1]');
      if (parsed.protocol !== 'https:' && !isLoopback) {
        throw new Error('Use HTTPS, or http://127.0.0.1 for local development. Spotify does not allow localhost redirects.');
      }
      this.config = { clientId: id, redirectUri: uri };
      this._saveConfig();
      this.error = '';
      this._emit();
    }

    async connect() {
      if (!this.config.clientId || !this.config.redirectUri) {
        this._setError('Set a Spotify Client ID and registered redirect URI first.', 'needs-setup');
        return;
      }
      if (!root.crypto || !root.crypto.subtle || !root.crypto.getRandomValues) {
        this._setError('Secure browser cryptography is unavailable. Open Dynamic over HTTPS or a supported localhost server.', 'error');
        return;
      }
      const verifier = randomString(64) + randomString(64).toLowerCase();
      const challenge = base64url(await root.crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
      const state = randomString(32) + randomString(32).toLowerCase();
      try {
        storage('sessionStorage').setItem(SESSION_KEY, JSON.stringify({ verifier, state }));
      } catch (_) {
        this._setError('Session storage is unavailable; Spotify sign-in cannot safely continue.', 'error');
        return;
      }
      const authorize = new URL(AUTH_URL);
      authorize.search = new URLSearchParams({
        response_type: 'code', client_id: this.config.clientId,
        redirect_uri: this.config.redirectUri, scope: SCOPES,
        state, code_challenge_method: 'S256', code_challenge: challenge
      }).toString();
      root.location.assign(authorize.toString());
    }

    async completeRedirect() {
      const params = new URLSearchParams(root.location.search || '');
      const code = params.get('code');
      const returnedState = params.get('state');
      const oauthError = params.get('error');
      if (!code && !oauthError) return false;
      let pending;
      try { pending = JSON.parse(storage('sessionStorage').getItem(SESSION_KEY) || 'null'); } catch (_) {}
      const cleanUrl = root.location.pathname + (root.location.hash || '');
      if (root.history && root.history.replaceState) root.history.replaceState({}, '', cleanUrl);
      if (oauthError) {
        this._setError(oauthError === 'access_denied' ? 'Spotify access was declined.' : 'Spotify authorization failed: ' + oauthError, 'disconnected');
        return true;
      }
      if (!pending || !pending.verifier || !pending.state || returnedState !== pending.state) {
        this._setError('Spotify sign-in could not be validated (state mismatch). Please connect again.', 'disconnected');
        return true;
      }
      try {
        const data = await this._tokenRequest({
          grant_type: 'authorization_code', client_id: this.config.clientId,
          code, redirect_uri: this.config.redirectUri, code_verifier: pending.verifier
        });
        this.session = this._tokenSession(data, null);
        this._saveSession();
        this.status = 'connected'; this.error = '';
        this._emit(); this._startPolling();
      } catch (err) {
        this.session = null; this._saveSession();
        this._setError(err.message, 'disconnected');
      }
      return true;
    }

    _tokenSession(data, priorRefreshToken) {
      if (!data || !data.access_token) throw new Error('Spotify returned no access token.');
      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || priorRefreshToken || null,
        expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000,
        scope: data.scope || ''
      };
    }
    async _fetch(url, options) {
      const generation = this.generation;
      const controller = new AbortController();
      this.controllers.add(controller);
      try {
        const response = await fetch(url, Object.assign({}, options, { signal: controller.signal }));
        if (generation !== this.generation) throw new DOMException('Stale Spotify request', 'AbortError');
        return response;
      } finally { this.controllers.delete(controller); }
    }
    async _tokenRequest(fields) {
      const response = await this._fetch(TOKEN_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(fields)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(errorMessage(response.status, data, response.headers.get('Retry-After')));
      return data;
    }
    async _accessToken() {
      if (!this.session || !this.session.accessToken) throw new Error('Connect Spotify to continue.');
      if (Date.now() < this.session.expiresAt - 60000) return this.session.accessToken;
      if (!this.session.refreshToken) throw new Error('Spotify authorization expired. Reconnect Spotify.');
      try {
        const data = await this._tokenRequest({
          grant_type: 'refresh_token', refresh_token: this.session.refreshToken,
          client_id: this.config.clientId
        });
        this.session = this._tokenSession(data, this.session.refreshToken);
        this._saveSession();
        return this.session.accessToken;
      } catch (err) {
        if (/invalid_grant/i.test(err.message)) {
          this.disconnect('Spotify refresh token expired. Reconnect Spotify.');
        }
        throw err;
      }
    }

    async _api(path, options, retried) {
      const token = await this._accessToken();
      const response = await this._fetch(API_URL + path, Object.assign({}, options, {
        headers: Object.assign({}, options && options.headers, { Authorization: 'Bearer ' + token })
      }));
      if (response.status === 401 && !retried && this.session && this.session.refreshToken) {
        this.session.expiresAt = 0;
        return this._api(path, options, true);
      }
      if (response.status === 204) return null;
      const data = response.status === 200 ? await response.json().catch(() => null) : await response.json().catch(() => ({}));
      if (!response.ok) {
        const retryAfter = response.headers.get('Retry-After');
        const err = new Error(errorMessage(response.status, data, retryAfter));
        err.status = response.status; err.retryAfter = Number(retryAfter) || 0;
        throw err;
      }
      return data;
    }

    async poll() {
      if (Date.now() < (this.retryUntil || 0) || this.status !== 'connected' || (root.document && root.document.hidden) || this.inFlight) return this.inFlight;
      const generation = this.generation;
      this.inFlight = (async () => {
        try {
          const data = await this._api('/me/player/currently-playing');
          if (generation !== this.generation || this.status !== 'connected') return;
          const item = data && data.item;
          this.track = item ? {
            title: item.name || '',
            artist: (item.artists || []).map(a => a.name).filter(Boolean).join(', ') || (item.show && item.show.name) || '',
            album: (item.album && item.album.name) || (item.show && item.show.name) || '',
            artworkURL: item.album && item.album.images && item.album.images[0] ? item.album.images[0].url : ''
          } : null;
          this.artwork = this.track ? this.track.artworkURL : '';
          this.positionMs = data && Number.isFinite(data.progress_ms) ? data.progress_ms : 0;
          this.durationMs = item && Number.isFinite(item.duration_ms) ? item.duration_ms : 0;
          this.playing = !!(data && data.is_playing);
          this.error = '';
          this._emit();
        } catch (err) {
          if (generation !== this.generation || this.status !== 'connected') return;
          this._setError(err.message);
          if (err.status === 401) this.disconnect('Spotify authorization expired or was rejected. Reconnect Spotify.');
          if (err.status === 429) this._scheduleRetry(Math.max(POLL_MS, err.retryAfter * 1000));
        } finally { this.inFlight = null; }
      })();
      return this.inFlight;
    }
    _scheduleRetry(delay) {
      root.clearTimeout(this.retryTimer);
      this.retryUntil = Date.now() + delay;
      this.retryTimer = root.setTimeout(() => this.poll(), delay);
    }
    _startPolling() {
      this._stopPolling();
      if (this.status !== 'connected' || (root.document && root.document.hidden)) return;
      this.poll();
      this.timer = root.setInterval(() => this.poll(), POLL_MS);
    }
    _stopPolling() {
      root.clearInterval(this.timer); this.timer = null;
      root.clearTimeout(this.retryTimer); this.retryTimer = null;
    }
    _visibilityChanged() {
      if (root.document && root.document.hidden) this._stopPolling();
      else if (this.status === 'connected') this._startPolling();
    }

    async transport(action, position) {
      const generation = this.generation;
      const endpoints = {
        play: ['PUT', '/me/player/play'], pause: ['PUT', '/me/player/pause'],
        next: ['POST', '/me/player/next'], previous: ['POST', '/me/player/previous']
      };
      let method, path, body;
      if (action === 'seek') {
        const ms = Math.max(0, Math.floor(Number(position) || 0));
        method = 'PUT'; path = '/me/player/seek?position_ms=' + encodeURIComponent(ms);
      } else if (endpoints[action]) [method, path] = endpoints[action];
      else throw new Error('Unsupported Spotify playback action.');
      try {
        await this._api(path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body });
        if (generation !== this.generation) return false;
        this.error = ''; this._emit();
        if (action === 'play') this.playing = true;
        if (action === 'pause') this.playing = false;
        this._emit();
        return true;
      } catch (err) {
        if (generation !== this.generation) return false;
        this._setError(err.message);
        return false;
      }
    }

    disconnect(message) {
      this.generation++;
      this.controllers.forEach(controller => controller.abort());
      this.controllers.clear();
      this._stopPolling();
      this.session = null; this._saveSession();
      this.status = 'disconnected'; this.error = message || '';
      this.track = null; this.artwork = ''; this.positionMs = 0; this.durationMs = 0; this.playing = false;
      this._emit();
    }
    destroy() {
      this.disconnect();
      if (root.document) root.document.removeEventListener('visibilitychange', this._visibilityHandler);
    }
  }

  root.DynamicsSpotify = DynamicsSpotify;
})(window);
