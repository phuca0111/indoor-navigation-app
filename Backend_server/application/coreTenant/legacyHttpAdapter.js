async function invokeLegacyHandler(handler, input) {
  return new Promise((resolve, reject) => {
    const req = {
      user: input.actor,
      params: input.params || {},
      query: input.query || {},
      body: input.body || {},
      ip: input.ip || '',
      headers: input.headers || {}
    };
    const res = {
      statusCode: 200,
      headers: {},
      status(code) {
        this.statusCode = code;
        return this;
      },
      setHeader(name, value) {
        this.headers[name] = value;
        return this;
      },
      json(body) {
        resolve({ status: this.statusCode, body, headers: this.headers });
        return this;
      }
    };
    Promise.resolve(handler(req, res)).catch(reject);
  });
}

module.exports = { invokeLegacyHandler };
