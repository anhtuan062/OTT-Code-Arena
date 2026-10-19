// Only the development command loads this module; production must remain explicit.
if (!process.env.NODE_ENV?.trim() && !process.env.EXECUTION_POLICY?.trim()) {
  process.env.NODE_ENV = 'development';
}
