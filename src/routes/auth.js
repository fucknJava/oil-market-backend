const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const prisma = require('../db');
const Joi = require('joi');

// Validation schemas
const loginSchema = Joi.object({
  username: Joi.string().required(),
  password: Joi.string().required(),
});

const registerSchema = Joi.object({
  email: Joi.string().email().required(),
  phone: Joi.string().pattern(/^[\+]?[0-9]{10,15}$/).required(),
  name: Joi.string().min(2).max(100).required(),
});

// User registration
router.post('/register', async (req, res) => {
  try {
    const { error, value } = registerSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: value.email },
    });

    if (existingUser) {
      return res.status(409).json({ error: 'User already exists' });
    }

    // Create user
    const user = await prisma.user.create({
      data: {
        email: value.email,
        phone: value.phone,
        name: value.name,
      },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        createdAt: true,
      },
    });

    // In a real app, you might want to send a confirmation email
    // For now, we'll just return the user data
    res.status(201).json({
      message: 'User registered successfully',
      user,
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Server error during registration' });
  }
});

// Get user profile (by email/phone for order tracking)
router.get('/profile', async (req, res) => {
  try {
    const { email, phone } = req.query;
    
    if (!email && !phone) {
      return res.status(400).json({ error: 'Email or phone is required' });
    }

    const where = {};
    if (email) where.email = email;
    if (phone) where.phone = phone;

    const user = await prisma.user.findFirst({
      where,
      include: {
        orders: {
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
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        favorites: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                brand: true,
                price: true,
                images: true,
                type: true,
                viscosity: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Remove password hash from response
    const { password, ...userWithoutPassword } = user;
    res.json(userWithoutPassword);
  } catch (err) {
    console.error('Profile error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Add product to favorites
router.post('/favorites/:productId', async (req, res) => {
  try {
    const { email } = req.body;
    const productId = parseInt(req.params.productId);

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const favorite = await prisma.favorite.upsert({
      where: {
        userId_productId: {
          userId: user.id,
          productId: productId,
        },
      },
      create: {
        userId: user.id,
        productId: productId,
      },
      update: {},
      include: {
        product: {
          select: {
            id: true,
            name: true,
            brand: true,
            price: true,
            images: true,
          },
        },
      },
    });

    res.json({ message: 'Added to favorites', favorite });
  } catch (err) {
    console.error('Favorite error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Remove from favorites
router.delete('/favorites/:productId', async (req, res) => {
  try {
    const { email } = req.body;
    const productId = parseInt(req.params.productId);

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    await prisma.favorite.deleteMany({
      where: {
        userId: user.id,
        productId: productId,
      },
    });

    res.json({ message: 'Removed from favorites' });
  } catch (err) {
    console.error('Favorite remove error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;