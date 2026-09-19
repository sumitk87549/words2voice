export const environment = {
  production: true,
  // Relative URL — works when nginx serves frontend and proxies /api/* to Spring Boot
  // Same origin = no CORS headers needed
  apiBaseUrl: 'https://words2voice.onrender.com/api'
};
