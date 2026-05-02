import morgan from 'morgan';

// 'combined' in production: includes IP, user-agent, response time — good for ops
// 'dev' locally: colorized one-liner — easy to read during development
export const requestLogger = morgan(
  process.env.NODE_ENV === 'production' ? 'combined' : 'dev'
);
