import { AppConfig } from '../types';
import configManager from './configManager';

/**
 * Create a Proxy-based config object that always returns the latest values
 * This allows hot-reloading config without restarting the application
 */
const createDynamicConfig = (): AppConfig => {
  return new Proxy({} as AppConfig, {
    get(_target, prop: keyof AppConfig) {
      // Always get fresh config from configManager
      const currentConfig = configManager.getConfig();
      const value = currentConfig[prop];
      
      // If it's an object, return a Proxy for nested properties too
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return new Proxy(value, {
          get(_nestedTarget: any, nestedProp: string | symbol) {
            // Get fresh config again for nested access
            const freshConfig = configManager.getConfig();
            const nestedValue = (freshConfig[prop] as any)?.[nestedProp];
            return nestedValue;
          },
        });
      }
      
      return value;
    },
    // Make it look like a regular object for JSON.stringify, console.log, etc.
    ownKeys() {
      return Object.keys(configManager.getConfig());
    },
    getOwnPropertyDescriptor(_target, prop) {
      const currentConfig = configManager.getConfig();
      return Object.getOwnPropertyDescriptor(currentConfig, prop) || {
        enumerable: true,
        configurable: true,
      };
    },
  });
};

/**
 * Main config object - uses Proxy to always return latest values from ConfigManager
 * This allows config updates to take effect immediately without restarting the app
 */
export const config: AppConfig = createDynamicConfig();

/**
 * Get fresh config snapshot (useful when you need a static copy)
 */
export function getConfig(): AppConfig {
  return configManager.getConfig();
}

export default config;
