const { z } = require('zod');
const { errorPayload } = require('./errorHandler');

const loginBodySchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(1024)
}).passthrough();

const refreshBodySchema = z.object({
  refreshToken: z.string().min(1).max(4096)
}).passthrough();

const searchQuerySchema = z.object({
  q: z.string().trim().min(2).max(200),
  limit: z.coerce.number().int().min(1).max(100).optional()
}).passthrough();

function safeDetails(issues) {
  return issues.map((issue) => ({
    field: issue.path.map(String).join('.'),
    message: issue.message
  }));
}

function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      return res.status(400).json(errorPayload(
        req,
        'VALIDATION_ERROR',
        'Dữ liệu yêu cầu không hợp lệ.',
        safeDetails(result.error.issues)
      ));
    }
    if (source === 'body') req.body = result.data;
    return next();
  };
}

module.exports = {
  loginBodySchema,
  refreshBodySchema,
  searchQuerySchema,
  validate
};
