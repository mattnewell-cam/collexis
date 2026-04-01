const localDocumentBackendOrigin = 'http://127.0.0.1:8000';

function ensureLeadingSlash(path: string) {
  return path.startsWith('/') ? path : `/${path}`;
}

export function documentBackendOrigin() {
  return localDocumentBackendOrigin;
}

export function documentBackendPath(path: string) {
  return `/backend${ensureLeadingSlash(path)}`;
}
