const linkCache = new Map<string, string>();

export const getFromCache = (key: string) => {
  return linkCache.get(key);
};

export const setToCache = (key: string, value: string) => {
  linkCache.set(key, value);
};