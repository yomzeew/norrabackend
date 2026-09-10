const { z } = require('zod');
const service = require('./whatsapp.service');
const { BadRequestError } = require('../../utils/errors');

const connectSchema = z.object({
  businessId: z.string().uuid(),
  code: z.string().min(1),
});

async function connect(req, res, next) {
  try {
    const parsed = connectSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('businessId (uuid) and code are required');
    }

    // TODO: replace with real auth - assert the signed-in user owns
    // parsed.data.businessId before allowing a connection.
    const result = await service.connectAccount(parsed.data);
    return res.json(result);
  } catch (err) {
    return next(err);
  }
}

module.exports = { connect };
