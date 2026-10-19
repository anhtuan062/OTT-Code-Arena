process.env.PORT = process.env.PORT || '3001';
process.env.ENABLE_QA_FIXTURES = 'true';

const { startServer } = await import('../server/index.js');

startServer(Number(process.env.PORT) || 3001).catch((error: unknown) => {
  console.error('Failed to start QA fixtures server:', error);
  process.exit(1);
});

