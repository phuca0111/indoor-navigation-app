function strictLifecycleFlag(name, env = process.env) {
  const configured = env[name];
  if (configured !== undefined && configured !== '') {
    return String(configured).toLowerCase() === 'true';
  }
  return env.NODE_ENV === 'production';
}

module.exports = { strictLifecycleFlag };
