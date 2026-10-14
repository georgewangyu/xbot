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

function configuredEnvPath() {
    const configPath = resolve(homedir(), '.config', 'xbot', 'config.json');
    if (!existsSync(configPath)) return resolve(homedir(), '.config', 'xbot', 'credentials.env');
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    if (typeof config.envFile !== 'string' || !config.envFile.trim()) {
        throw new Error('The local credential config requires a nonempty envFile.');
    }
    return resolve(config.envFile);
}

function getFileVars() {
    if (_fileVars) return _fileVars;
    const overrideEnv = process.env.XBOT_ENV_FILE ? resolve(process.cwd(), process.env.XBOT_ENV_FILE) : '';
    if (overrideEnv) {
        _fileVars = loadEnvFile(overrideEnv);
        return _fileVars;
    }
    const privateEnv = configuredEnvPath();
    _fileVars = {
        ...loadEnvFile(privateEnv),
    };
    return _fileVars;
}

export function getEnv(key) {
    if (process.env.XBOT_ENV_FILE) {
        return getFileVars()[key] || '';
    }
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

export function resolvedEnvPaths() {
    const dir = fileURLToPath(new URL('.', import.meta.url));
    return {
        localEnvPath: resolve(dir, '..', '.env'),
        privateEnvPath: process.env.XBOT_ENV_FILE ? '' : configuredEnvPath(),
        overrideEnvPath: process.env.XBOT_ENV_FILE ? resolve(process.cwd(), process.env.XBOT_ENV_FILE) : '',
    };
}
