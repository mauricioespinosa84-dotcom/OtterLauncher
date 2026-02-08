/**
 * @author Luuxis
 * @license CC-BY-NC 4.0 - https://creativecommons.org/licenses/by-nc/4.0
 */

const pkg = require('../package.json');
const nodeFetch = require("node-fetch");
const { machineIdSync } = require("node-machine-id");
const convert = require('xml-js');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const hwid = machineIdSync();
import { getLauncherKey } from '../MKLib.js';

let url = pkg.user ? `${pkg.url}/${pkg.user}` : pkg.url
let key;

let news = `${url}/launcher/news-launcher/news.json`;

// Función local getLauncherKey para compatibilidad hacia atrás con getInstanceList
async function getLocalLauncherKey() {
    if (!key) {
      const files = [
        path.join(__dirname, '../package.json'),
        ...fs.readdirSync(__dirname).filter(file => file.endsWith('.js')).map(file => path.join(__dirname, file))
      ];
  
      const hash = crypto.createHash('sha256');
      for (const file of files) {
        const data = fs.readFileSync(file);
        hash.update(data);
      }
      key = hash.digest('hex');
    }
    return key;
  };

let Launcherkey = await getLocalLauncherKey();

class Config {
    async GetConfig() {
        const baseUrl = (pkg.url || '').trim();
        if (!baseUrl) {
            return { error: { code: 'CONFIG_URL_MISSING', message: 'pkg.url no está configurado' } };
        }

        const configUrl = `${baseUrl.replace(/\/$/, '')}/launcher/config.json`;

        try {
            const response = await nodeFetch(configUrl, {
                headers: { 'Cache-Control': 'no-cache' }
            });

            if (!response.ok) {
                return {
                    error: {
                        code: response.status,
                        message: `Server returned ${response.status}: ${response.statusText}`
                    }
                };
            }

            const responseText = await response.text();
            if (!responseText || responseText.trim() === '') {
                return { error: { code: 'EMPTY_RESPONSE', message: 'Empty response from server' } };
            }

            try {
                return JSON.parse(responseText);
            } catch (jsonError) {
                return { error: { code: 'JSON_PARSE_ERROR', message: jsonError.message } };
            }
        } catch (err) {
            return { error: { code: 'FETCH_ERROR', message: err.message || String(err) } };
        }
    }

    async getInstanceList() {
        try {
            const normalizeInstance = (instance) => {
                const normalized = { ...instance };

                // Backward compatibility: accept "loader" and map to expected "loadder"
                if (!normalized.loadder && normalized.loader) {
                    normalized.loadder = { ...normalized.loader };
                }
                if (normalized.loadder) {
                    if (normalized.loadder.loader_type && !normalized.loadder.loadder_type) {
                        normalized.loadder.loadder_type = normalized.loadder.loader_type;
                    }
                    if (normalized.loadder.loader_version && !normalized.loadder.loadder_version) {
                        normalized.loadder.loadder_version = normalized.loadder.loader_version;
                    }
                }

                // Ensure status object exists to avoid runtime errors
                if (!normalized.status || typeof normalized.status !== 'object') {
                    normalized.status = {
                        nameServer: normalized.name || 'Servidor',
                        ip: '',
                        port: 25565
                    };
                }

                return normalized;
            };

            const parseInstances = (instancesData) => {
                if (!instancesData) return [];
                if (Array.isArray(instancesData)) {
                    return instancesData.map((i) => normalizeInstance(i));
                }
                if (typeof instancesData !== 'object') return [];
                const instancesList = [];
                for (let [name, data] of Object.entries(instancesData)) {
                    if (data) {
                        let instance = { ...data, name };
                        instancesList.push(normalizeInstance(instance));
                    }
                }
                return instancesList;
            };

            const fetchJsonSafe = async (targetUrl) => {
                try {
                    const response = await nodeFetch(targetUrl, {
                        headers: { 'User-Agent': 'MiguelkiNetworkMCLauncher', 'Cache-Control': 'no-cache' }
                    });
                    if (!response.ok) return null;
                    const text = await response.text();
                    if (!text || text.trim() === '') return null;
                    return JSON.parse(text);
                } catch {
                    return null;
                }
            };

            const fetchInstancesFallback = async () => {
                const fallbackUrl = `${(pkg.url || '').replace(/\/$/, '')}/launcher/instances.json`;
                const fallbackData = await fetchJsonSafe(fallbackUrl);
                if (fallbackData) return parseInstances(fallbackData);
                return null;
            };

            let urlInstance = `${url}/files?checksum=${Launcherkey}&id=${hwid}`;
            let response = await nodeFetch(urlInstance, {
                headers: {
                    'User-Agent': 'MiguelkiNetworkMCLauncher'
                }
            });
            
            if (!response.ok) {
                const fallbackInstances = await fetchInstancesFallback();
                if (fallbackInstances) return fallbackInstances;
                console.error(`Server returned status: ${response.status} ${response.statusText}`);
                return [];
            }
            
            const responseText = await response.text();
            if (!responseText || responseText.trim() === '') {
                console.error('Empty response received from server');
                const fallbackInstances = await fetchInstancesFallback();
                if (fallbackInstances) return fallbackInstances;
                return [];
            }
            
            let instances;
            try {
                instances = JSON.parse(responseText);
            } catch (jsonError) {
                console.error('Error parsing JSON response:', jsonError.message);
                console.error('Response text:', responseText.substring(0, 200));
                const fallbackInstances = await fetchInstancesFallback();
                if (fallbackInstances) return fallbackInstances;
                return [];
            }

            const parsedInstances = parseInstances(instances);
            if (!parsedInstances || parsedInstances.length === 0) {
                const fallbackInstances = await fetchInstancesFallback();
                if (fallbackInstances) return fallbackInstances;
            }
            return parsedInstances;
        } catch (err) {
            console.error("Error fetching instance list:", err);
            const fallbackInstances = await (async () => {
                const fallbackUrl = `${(pkg.url || '').replace(/\/$/, '')}/launcher/instances.json`;
                try {
                    const res = await nodeFetch(fallbackUrl, {
                        headers: { 'User-Agent': 'MiguelkiNetworkMCLauncher', 'Cache-Control': 'no-cache' }
                    });
                    if (!res.ok) return null;
                    const text = await res.text();
                    if (!text || text.trim() === '') return null;
                    const json = JSON.parse(text);
                    return parseInstances(json);
                } catch {
                    return null;
                }
            })();
            if (fallbackInstances) return fallbackInstances;
            return [];
        }
    }

    async getNews() {
        let config = await this.GetConfig() || {}

        if (config.rss) {
            return new Promise((resolve, reject) => {
                nodeFetch(config.rss).then(async config => {
                    if (config.status === 200) {
                        let news = [];
                        let response = await config.text()
                        response = (JSON.parse(convert.xml2json(response, { compact: true })))?.rss?.channel?.item;

                        if (!Array.isArray(response)) response = [response];
                        for (let item of response) {
                            news.push({
                                title: item.title._text,
                                content: item['content:encoded']._text,
                                author: item['dc:creator']._text,
                                publish_date: item.pubDate._text
                            })
                        }
                        return resolve(news);
                    }
                    else return reject({ error: { code: config.statusText, message: 'server not accessible' } });
                }).catch(error => reject({ error }))
            })
        } else {
            return new Promise((resolve, reject) => {
                nodeFetch(news).then(async config => {
                    if (config.status === 200) {
                        try {
                            const responseText = await config.text();
                            if (!responseText || responseText.trim() === '') {
                                return reject({ error: { code: 'EMPTY_RESPONSE', message: 'Empty response from server' } });
                            }
                            const jsonData = JSON.parse(responseText);
                            return resolve(jsonData);
                        } catch (jsonError) {
                            return reject({ error: { code: 'JSON_PARSE_ERROR', message: jsonError.message } });
                        }
                    }
                    else return reject({ error: { code: config.statusText, message: 'server not accessible' } });
                }).catch(error => {
                    return reject({ error });
                })
            })
        }
    }
}

export default new Config;
