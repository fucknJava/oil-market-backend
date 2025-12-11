const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const prisma = require('../db');
const Joi = require('joi');

function requireAdmin(req, res, next) {
  next(); // Просто пропускаем всех
}

// Validation schemas
const adminLoginSchema = Joi.object({
  username: Joi.string().required(),
  password: Joi.string().required(),
});

const productSchema = Joi.object({
  sku: Joi.string().optional(),
  name: Joi.string().required().min(2).max(200),
  description: Joi.string().optional().allow(''),
  brand: Joi.string().required().min(1).max(100),
  type: Joi.string().valid('synthetic', 'semi-synthetic', 'mineral', 'other').required(),
  viscosity: Joi.string().required().min(2).max(20),
  volume_ml: Joi.number().integer().positive().required(),
  application: Joi.string().valid('petrol', 'diesel', 'universal', 'commercial').required(),
  price: Joi.number().positive().required(),
  stock: Joi.number().integer().min(0).required(),
  images: Joi.array().items(Joi.string().uri()).optional(),
  characteristics: Joi.object().optional(),
});

// Initialize admin user if not exists
async function initializeAdmin() {
  try {
    const adminExists = await prisma.admin.findFirst();
    if (!adminExists) {
      const hashedPassword = await bcrypt.hash(process.env.ADMIN_INIT_PASSWORD || 'admin123', 10);
      await prisma.admin.create({
        data: {
          username: process.env.ADMIN_INIT_USERNAME || 'admin',
          password: hashedPassword,
          email: 'admin@oilmarket.ru',
          role: 'admin',
        },
      });
      console.log('Default admin user created');
    }
  } catch (err) {
    console.error('Failed to initialize admin:', err);
  }
}
initializeAdmin();

// Admin login
router.post('/login', async (req, res) => {
  try {
    const { error, value } = adminLoginSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const admin = await prisma.admin.findUnique({
      where: { username: value.username },
    });

    if (!admin || !admin.isActive) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(value.password, admin.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Update last login
    await prisma.admin.update({
      where: { id: admin.id },
      data: { lastLogin: new Date() },
    });

    // Set session
    req.session.adminId = admin.id;
    req.session.adminRole = admin.role;

    res.json({
      message: 'Login successful',
      admin: {
        id: admin.id,
        username: admin.username,
        email: admin.email,
        role: admin.role,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin logout
router.post('/logout', requireAdmin, (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.json({ message: 'Logout successful' });
  });
});

// Check admin status
// Измените роут /status:
router.get('/status', (req, res) => {
  console.log('🔍 Проверка сессии админа:', req.session.adminId);
  
  if (req.session.adminId) {
    res.json({ authenticated: true });
  } else {
    res.status(401).json({ authenticated: false });
  }
});

// Get admin dashboard stats
router.get('/stats', requireAdmin, async (req, res) => {
  try {
    const [
      totalProducts,
      totalOrders,
      totalRevenue,
      lowStockProducts,
      recentOrders,
    ] = await Promise.all([
      prisma.product.count(),
      prisma.order.count(),
      prisma.order.aggregate({
        _sum: { totalAmount: true },
      }),
      prisma.product.count({
        where: { stock: { lt: 10 } },
      }),
      prisma.order.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: {
          items: {
            include: {
              product: {
                select: { name: true },
              },
            },
          },
        },
      }),
    ]);

    res.json({
      stats: {
        totalProducts,
        totalOrders,
        totalRevenue: totalRevenue._sum.totalAmount || 0,
        lowStockProducts,
      },
      recentOrders,
    });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PRODUCTS CRUD

// Get all products with pagination and filters
router.get('/products', requireAdmin, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      search = '',
      brand,
      type,
    } = req.query;

    const pageInt = parseInt(page);
    const limitInt = parseInt(limit);
    const skip = (pageInt - 1) * limitInt;

    const where = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
        { brand: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (brand) where.brand = brand;
    if (type) where.type = type;

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        skip,
        take: limitInt,
        orderBy: { [sortBy]: sortOrder },
      }),
      prisma.product.count({ where }),
    ]);

    res.json({
      data: products,
      meta: {
        page: pageInt,
        limit: limitInt,
        total,
        pages: Math.ceil(total / limitInt),
      },
    });
  } catch (err) {
    console.error('Get products error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get single product
router.get('/products/:id', requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const product = await prisma.product.findUnique({
      where: { id },
    });

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json(product);
  } catch (err) {
    console.error('Get product error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create product
router.post('/products', requireAdmin, async (req, res) => {
  try {
    const { error, value } = productSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    // Generate SKU if not provided
    const sku = value.sku || `OIL-${value.brand.substring(0, 3).toUpperCase()}-${Date.now().toString().slice(-6)}`;

    const product = await prisma.product.create({
      data: {
        ...value,
        sku,
      },
    });

    res.status(201).json(product);
  } catch (err) {
    console.error('Create product error:', err);
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'SKU already exists' });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

// Update product
router.put('/products/:id', requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { error, value } = productSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const product = await prisma.product.update({
      where: { id },
      data: value,
    });

    res.json(product);
  } catch (err) {
    console.error('Update product error:', err);
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete product
router.delete('/products/:id', requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    
    // Check if product is in any orders
    const orderItems = await prisma.orderItem.count({
      where: { productId: id },
    });

    if (orderItems > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete product that is associated with orders',
        orderItems,
      });
    }

    await prisma.product.delete({
      where: { id },
    });

    res.json({ message: 'Product deleted successfully' });
  } catch (err) {
    console.error('Delete product error:', err);
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

// ORDERS MANAGEMENT

// Get all orders with filters
router.get('/orders', requireAdmin, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      startDate,
      endDate,
      search,
    } = req.query;

    const pageInt = parseInt(page);
    const limitInt = parseInt(limit);
    const skip = (pageInt - 1) * limitInt;

    const where = {};
    if (status) where.status = status;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }
    if (search) {
      where.OR = [
        { orderNumber: { contains: search, mode: 'insensitive' } },
        { contactName: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { trackingNumber: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        skip,
        take: limitInt,
        orderBy: { createdAt: 'desc' },
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
          user: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
        },
      }),
      prisma.order.count({ where }),
    ]);

    res.json({
      data: orders,
      meta: {
        page: pageInt,
        limit: limitInt,
        total,
        pages: Math.ceil(total / limitInt),
      },
    });
  } catch (err) {
    console.error('Get orders error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get single order
router.get('/orders/:id', requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                brand: true,
                sku: true,
                price: true,
                images: true,
              },
            },
          },
        },
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            phone: true,
          },
        },
      },
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json(order);
  } catch (err) {
    console.error('Get order error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update order status and tracking
router.put('/orders/:id', requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { status, trackingNumber, notes } = req.body;

    // Validate status
    const validStatuses = ['new', 'processing', 'shipped', 'delivered', 'cancelled'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const updateData = {};
    if (status) updateData.status = status;
    if (trackingNumber) updateData.trackingNumber = trackingNumber;
    if (notes !== undefined) updateData.notes = notes;
    updateData.updatedAt = new Date();

    const order = await prisma.order.update({
      where: { id },
      data: updateData,
      include: {
        user: {
          select: {
            email: true,
            name: true,
          },
        },
      },
    });

    // TODO: Send email notification if status changed to shipped/delivered
    // sendOrderStatusEmail(order);

    res.json(order);
  } catch (err) {
    console.error('Update order error:', err);
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Order not found' });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;