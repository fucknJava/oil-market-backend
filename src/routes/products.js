const express = require('express');
const router = express.Router();
const prisma = require('../db');
const Joi = require('joi');

// Get all products with advanced filtering, sorting, and search
router.get('/', async (req, res) => {
  try {
    const {
      q, // search query
      type,
      viscosity,
      brand,
      volume,
      application,
      minPrice,
      maxPrice,
      inStock,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      page = 1,
      limit = 12,
    } = req.query;

    const pageInt = parseInt(page);
    const limitInt = parseInt(limit);
    const skip = (pageInt - 1) * limitInt;

    // Build where clause
    const where = {};

    // Text search across multiple fields
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        { brand: { contains: q, mode: 'insensitive' } },
        { type: { contains: q, mode: 'insensitive' } },
        { viscosity: { contains: q, mode: 'insensitive' } },
        { application: { contains: q, mode: 'insensitive' } },
        { sku: { contains: q, mode: 'insensitive' } },
      ];
    }

    // Filtering
    if (type) where.type = type;
    if (viscosity) where.viscosity = viscosity;
    if (brand) where.brand = brand;
    if (volume) where.volume_ml = parseInt(volume);
    if (application) where.application = application;
    
    // Price range
    if (minPrice || maxPrice) {
      where.price = {};
      if (minPrice) where.price.gte = parseFloat(minPrice);
      if (maxPrice) where.price.lte = parseFloat(maxPrice);
    }

    // Stock filter
    if (inStock === 'true') {
      where.stock = { gt: 0 };
    } else if (inStock === 'false') {
      where.stock = { equals: 0 };
    }

    // Validate sort fields
    const validSortFields = ['name', 'price', 'createdAt', 'brand', 'type'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'createdAt';
    const sortDirection = sortOrder === 'asc' ? 'asc' : 'desc';

    // Get unique values for filters
    const [products, total, filterOptions] = await Promise.all([
      prisma.product.findMany({
        where,
        skip,
        take: limitInt,
        orderBy: { [sortField]: sortDirection },
      }),
      prisma.product.count({ where }),
      prisma.product.findMany({
        where: inStock === 'true' ? { stock: { gt: 0 } } : {},
        select: {
          brand: true,
          type: true,
          viscosity: true,
          application: true,
          volume_ml: true,
        },
      }),
    ]);

    // Extract unique filter values
    const brands = [...new Set(filterOptions.map(p => p.brand).filter(Boolean))].sort();
    const types = [...new Set(filterOptions.map(p => p.type).filter(Boolean))].sort();
    const viscosities = [...new Set(filterOptions.map(p => p.viscosity).filter(Boolean))].sort();
    const applications = [...new Set(filterOptions.map(p => p.application).filter(Boolean))].sort();
    const volumes = [...new Set(filterOptions.map(p => p.volume_ml).filter(Boolean))].sort((a, b) => a - b);

    res.json({
      data: products,
      meta: {
        page: pageInt,
        limit: limitInt,
        total,
        pages: Math.ceil(total / limitInt),
      },
      filters: {
        brands,
        types,
        viscosities,
        applications,
        volumes,
        priceRange: {
          min: await prisma.product.aggregate({ _min: { price: true } }).then(r => r._min.price || 0),
          max: await prisma.product.aggregate({ _max: { price: true } }).then(r => r._max.price || 0),
        },
      },
    });
  } catch (err) {
    console.error('Get products error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get single product by ID
router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const product = await prisma.product.findUnique({
      where: { id },
    });

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Get related products (same brand or type)
    const relatedProducts = await prisma.product.findMany({
      where: {
        AND: [
          { id: { not: id } },
          { stock: { gt: 0 } },
          {
            OR: [
              { brand: product.brand },
              { type: product.type },
              { viscosity: product.viscosity },
            ],
          },
        ],
      },
      take: 4,
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      ...product,
      relatedProducts,
    });
  } catch (err) {
    console.error('Get product error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get products by SKU
router.get('/sku/:sku', async (req, res) => {
  try {
    const { sku } = req.params;
    const product = await prisma.product.findUnique({
      where: { sku },
    });

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json(product);
  } catch (err) {
    console.error('Get product by SKU error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get featured products (for homepage)
router.get('/featured/:type', async (req, res) => {
  try {
    const { type } = req.params; // popular, new, discount
    let orderBy = {};
    let take = 8;

    switch (type) {
      case 'new':
        orderBy = { createdAt: 'desc' };
        break;
      case 'popular':
        // In a real app, you would track views or sales
        orderBy = { createdAt: 'desc' };
        take = 6;
        break;
      case 'top-rated':
        orderBy = { price: 'desc' };
        take = 4;
        break;
      default:
        orderBy = { createdAt: 'desc' };
    }

    const products = await prisma.product.findMany({
      where: { stock: { gt: 0 } },
      orderBy,
      take,
    });

    res.json(products);
  } catch (err) {
    console.error('Get featured products error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;