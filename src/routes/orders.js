const express = require('express');
const router = express.Router();
const prisma = require('../db');
const Joi = require('joi');

// Generate unique order number
function generateOrderNumber() {
  const date = new Date();
  const datePart = date.toISOString().slice(2, 10).replace(/-/g, '');
  const randomPart = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `${process.env.ORDER_PREFIX || 'OM'}${datePart}${randomPart}`;
}

// Generate tracking number
function generateTrackingNumber() {
  const random = Math.random().toString(36).substring(2, 10).toUpperCase();
  return `${process.env.TRACKING_PREFIX || 'OIL'}${random}`;
}

// Validation schemas
const orderItemSchema = Joi.object({
  productId: Joi.number().integer().positive().required(),
  quantity: Joi.number().integer().positive().required(),
});

const orderSchema = Joi.object({
  contactName: Joi.string().min(2).max(100).required(),
  phone: Joi.string().pattern(/^[\+]?[0-9]{10,15}$/).required(),
  email: Joi.string().email().optional().allow(''),
  deliveryMethod: Joi.string().valid('pickup', 'delivery').default('pickup'),
  deliveryAddress: Joi.object({
    city: Joi.string().required(),
    street: Joi.string().required(),
    house: Joi.string().required(),
    apartment: Joi.string().optional().allow(''),
    comment: Joi.string().optional().allow(''),
  }).when('deliveryMethod', {
    is: 'delivery',
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  paymentMethod: Joi.string().valid('card', 'cash', 'upon_receipt').default('card'),
  items: Joi.array().items(orderItemSchema).min(1).required(),
  userId: Joi.number().integer().positive().optional(),
  notes: Joi.string().optional().allow(''),
});

// Create new order
router.post('/', async (req, res) => {
  try {
    const { error, value } = orderSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { items, userId, ...orderData } = value;

    // Fetch products and validate stock
    const productIds = items.map(item => item.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
    });

    if (products.length !== items.length) {
      return res.status(404).json({ error: 'Some products not found' });
    }

    // Check stock and calculate total
    let totalAmount = 0;
    const stockUpdates = [];
    const orderItems = [];

    for (const item of items) {
      const product = products.find(p => p.id === item.productId);
      
      if (!product) {
        return res.status(404).json({ error: `Product ${item.productId} not found` });
      }

      if (product.stock < item.quantity) {
        return res.status(400).json({ 
          error: `Insufficient stock for ${product.name}. Available: ${product.stock}`,
          productId: product.id,
        });
      }

      totalAmount += product.price * item.quantity;
      
      // Prepare stock update
      stockUpdates.push(
        prisma.product.update({
          where: { id: product.id },
          data: { stock: product.stock - item.quantity },
        })
      );

      // Prepare order item
      orderItems.push({
        productId: product.id,
        quantity: item.quantity,
        priceEach: product.price,
      });
    }

    // Generate order and tracking numbers
    const orderNumber = generateOrderNumber();
    const trackingNumber = generateTrackingNumber();

    // Start transaction
    const [order] = await prisma.$transaction([
      prisma.order.create({
        data: {
          orderNumber,
          trackingNumber,
          userId: userId || null,
          totalAmount,
          ...orderData,
          items: {
            create: orderItems,
          },
        },
        include: {
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  brand: true,
                  sku: true,
                },
              },
            },
          },
        },
      }),
      ...stockUpdates,
    ]);

    // If user exists, update user info
    if (userId) {
      await prisma.user.update({
        where: { id: userId },
        data: {
          phone: orderData.phone,
          name: orderData.contactName,
          email: orderData.email || undefined,
        },
      });
    }

    // TODO: Send confirmation email
    // sendOrderConfirmationEmail(order);

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        trackingNumber: order.trackingNumber,
        totalAmount: order.totalAmount,
        status: order.status,
        createdAt: order.createdAt,
      },
      items: order.items,
    });
  } catch (err) {
    console.error('Create order error:', err);
    res.status(500).json({ error: 'Server error creating order' });
  }
});

// Get order by tracking number (public)
router.get('/track/:trackingNumber', async (req, res) => {
  try {
    const { trackingNumber } = req.params;
    const { phone } = req.query;

    if (!phone) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    const order = await prisma.order.findUnique({
      where: { trackingNumber },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                brand: true,
                images: true,
                type: true,
                viscosity: true,
              },
            },
          },
        },
      },
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Verify phone matches
    if (order.phone !== phone) {
      return res.status(403).json({ error: 'Access denied. Phone number does not match.' });
    }

    // Return minimal sensitive data
    const { deliveryAddress, email, ...safeOrder } = order;
    
    res.json(safeOrder);
  } catch (err) {
    console.error('Track order error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get user's orders (by email or userId)
router.get('/user/:identifier', async (req, res) => {
  try {
    const { identifier } = req.params;
    const { phone } = req.query;

    let user;

    if (identifier.includes('@')) {
      // Identifier is email
      user = await prisma.user.findUnique({
        where: { email: identifier },
        include: {
          orders: {
            orderBy: { createdAt: 'desc' },
            include: {
              items: {
                include: {
                  product: {
                    select: {
                      id: true,
                      name: true,
                      brand: true,
                      images: true,
                    },
                  },
                },
              },
            },
          },
        },
      });
    } else {
      // Identifier is numeric ID
      const userId = parseInt(identifier);
      user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          orders: {
            orderBy: { createdAt: 'desc' },
            include: {
              items: {
                include: {
                  product: {
                    select: {
                      id: true,
                      name: true,
                      brand: true,
                      images: true,
                    },
                  },
                },
              },
            },
          },
        },
      });
    }

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify phone if provided
    if (phone && user.phone !== phone) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Remove sensitive data
    const { password, ...safeUser } = user;
    res.json(safeUser.orders);
  } catch (err) {
    console.error('Get user orders error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;