const Joi = require('joi');

const productValidation = (req, res, next) => {
  const schema = Joi.object({
    name: Joi.string().min(2).max(200).required(),
    description: Joi.string().optional(),
    brand: Joi.string().min(1).max(100).required(),
    type: Joi.string().valid('synthetic', 'semi-synthetic', 'mineral', 'other').required(),
    viscosity: Joi.string().min(2).max(20).required(),
    volume_ml: Joi.number().integer().positive().required(),
    application: Joi.string().valid('petrol', 'diesel', 'universal', 'commercial').required(),
    price: Joi.number().positive().required(),
    stock: Joi.number().integer().min(0).required(),
    images: Joi.array().items(Joi.string().uri()).optional(),
    characteristics: Joi.object().optional(),
    sku: Joi.string().optional(),
  });

  const { error } = schema.validate(req.body);
  if (error) {
    return res.status(400).json({ error: error.details[0].message });
  }
  next();
};

const orderValidation = (req, res, next) => {
  const itemSchema = Joi.object({
    productId: Joi.number().integer().positive().required(),
    quantity: Joi.number().integer().positive().required(),
  });

  const schema = Joi.object({
    contactName: Joi.string().min(2).max(100).required(),
    phone: Joi.string().pattern(/^[\+]?[0-9]{10,15}$/).required(),
    email: Joi.string().email().optional().allow(''),
    deliveryMethod: Joi.string().valid('pickup', 'delivery').default('pickup'),
    deliveryAddress: Joi.object({
      city: Joi.string().required(),
      street: Joi.string().required(),
      house: Joi.string().required(),
      apartment: Joi.string().optional(),
      comment: Joi.string().optional(),
    }).when('deliveryMethod', {
      is: 'delivery',
      then: Joi.required(),
      otherwise: Joi.optional(),
    }),
    paymentMethod: Joi.string().valid('card', 'cash', 'upon_receipt').default('card'),
    items: Joi.array().items(itemSchema).min(1).required(),
    userId: Joi.number().integer().positive().optional(),
    notes: Joi.string().optional().allow(''),
  });

  const { error } = schema.validate(req.body);
  if (error) {
    return res.status(400).json({ error: error.details[0].message });
  }
  next();
};

module.exports = {
  productValidation,
  orderValidation,
};