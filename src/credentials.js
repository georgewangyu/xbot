import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';

function loadEnvFile(filePath) {
    if (!existsSync(filePath)) return {};
    const loaded = {};
    for (const rawLine of readFileSync(filePath, 'utf8').split('\n')) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#') || !line.includes('=')) continue;
        const [key, ...rest] = line.split('=');
        let value = rest.join('=').trim();
        if (value.length >= 2 && value[0] === value.at(-1) && (value[0] === '"' || value[0] === "'")) {
            value = value.slice(1, -1);
        }
        loaded[key.trim()] = value;
    }
    return loaded;
}

let _fileVars = null;
function getFileVars() {
    if (_fileVars) return _fileVars;
    const dir = fileURLToPath(new URL('.', import.meta.url));
    const localEnv = resolve(dir, '..', '.env');
    const privateEnv = resolve(homedir(), 'Documents/Workspace/georgerepo/.tokens/x-twitter.env');
    _fileVars = { ...loadEnvFile(privateEnv), ...loadEnvFile(localEnv) };
    return _fileVars;
}

export function getEnv(key) {
    return process.env[key] || getFileVars()[key] || '';
}

export function loadApiCredentials() {
    return {
        apiKey: getEnv('X_API_KEY'),
        apiSecret: getEnv('X_API_SECRET'),
        accessToken: getEnv('X_ACCESS_TOKEN'),
        accessTokenSecret: getEnv('X_ACCESS_TOKEN_SECRET'),
    };
}

export function loadCookieCredentials() {
    return {
        authToken: getEnv('AUTH_TOKEN'),
        ct0: getEnv('CT0'),
    };
}
