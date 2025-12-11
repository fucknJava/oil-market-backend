const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('Starting seed...');

  // Create admin user
  const hashedPassword1 = await bcrypt.hash('admin123', 10);
  await prisma.admin.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      password: hashedPassword1,
      email: 'admin@oilmarket.ru',
      role: 'admin',
    },
  });
  console.log('Admin user created');

  const hashedPassword2 = await bcrypt.hash('7395018_$&^', 10);
  await prisma.admin.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      password: hashedPassword2,
      email: 'admin@oilmarket.ru',
      role: 'admin',
    },
  });
  console.log('Admin user created')

  // Sample products
  const sampleProducts = [
    {
      sku: 'OIL-SHELL-001',
      name: 'Shell Helix Ultra 5W-40',
      description: 'Полностью синтетическое моторное масло для бензиновых и дизельных двигателей. Обеспечивает превосходную защиту от износа и чистоту двигателя.',
      brand: 'Shell',
      type: 'synthetic',
      viscosity: '5W-40',
      volume_ml: 4000,
      application: 'universal',
      price: 3499.99,
      stock: 50,
      images: ['https://via.placeholder.com/600x600/1e293b/94a3b8?text=Test+Oil'],
      characteristics: {
        acea: 'A3/B4',
        api: 'SN/CF',
        sae: '5W-40',
        viscosityIndex: 180,
        flashPoint: '230°C',
        pourPoint: '-39°C',
      },
    },
    {
      sku: 'OIL-CASTROL-002',
      name: 'Castrol Edge 5W-30',
      description: 'Технология Fluid Titanium для максимальной производительности. Подходит для современных турбированных двигателей.',
      brand: 'Castrol',
      type: 'synthetic',
      viscosity: '5W-30',
      volume_ml: 5000,
      application: 'petrol',
      price: 4199.99,
      stock: 30,
      images: ['https://via.placeholder.com/600x600/1e293b/94a3b8?text=Test+Oil'],
      characteristics: {
        acea: 'A5/B5',
        api: 'SP',
        sae: '5W-30',
        viscosityIndex: 170,
        flashPoint: '220°C',
        pourPoint: '-42°C',
      },
    },
    {
      sku: 'OIL-MOBIL-003',
      name: 'Mobil 1 0W-40',
      description: 'Моторное масло премиум-класса. Защита двигателя в экстремальных условиях эксплуатации.',
      brand: 'Mobil',
      type: 'synthetic',
      viscosity: '0W-40',
      volume_ml: 4000,
      application: 'universal',
      price: 3799.99,
      stock: 25,
      images: ['https://via.placeholder.com/600x600/1e293b/94a3b8?text=Test+Oil'],
      characteristics: {
        acea: 'A3/B4',
        api: 'SN',
        sae: '0W-40',
        viscosityIndex: 185,
        flashPoint: '235°C',
        pourPoint: '-45°C',
      },
    },
    {
      sku: 'OIL-LUKOIL-004',
      name: 'Lukoil Genesis 5W-40',
      description: 'Полусинтетическое масло для бензиновых и дизельных двигателей. Оптимальное соотношение цены и качества.',
      brand: 'Lukoil',
      type: 'semi-synthetic',
      viscosity: '5W-40',
      volume_ml: 4000,
      application: 'universal',
      price: 2199.99,
      stock: 100,
      images: ['https://via.placeholder.com/600x600/1e293b/94a3b8?text=Test+Oil'],
      characteristics: {
        acea: 'A3/B4',
        api: 'SN/CF',
        sae: '5W-40',
        viscosityIndex: 160,
        flashPoint: '210°C',
        pourPoint: '-35°C',
      },
    },
    {
      sku: 'OIL-TOTAL-005',
      name: 'Total Quartz 9000 5W-40',
      description: '100% синтетическое масло для высоконагруженных двигателей. Экономия топлива до 2%.',
      brand: 'Total',
      type: 'synthetic',
      viscosity: '5W-40',
      volume_ml: 4000,
      application: 'diesel',
      price: 3299.99,
      stock: 40,
      images: ['https://via.placeholder.com/600x600/1e293b/94a3b8?text=Test+Oil'],
      characteristics: {
        acea: 'C3',
        api: 'CI-4',
        sae: '5W-40',
        viscosityIndex: 175,
        flashPoint: '228°C',
        pourPoint: '-40°C',
      },
    },
    {
      sku: 'OIL-ZIC-006',
      name: 'ZIC X9 5W-30',
      description: 'Масло с технологией титана для корейских и японских автомобилей. Полная синтетика.',
      brand: 'ZIC',
      type: 'synthetic',
      viscosity: '5W-30',
      volume_ml: 4000,
      application: 'petrol',
      price: 2899.99,
      stock: 60,
      images: ['https://via.placeholder.com/600x600/1e293b/94a3b8?text=Test+Oil'],
      characteristics: {
        acea: 'A5/B5',
        api: 'SN',
        sae: '5W-30',
        viscosityIndex: 165,
        flashPoint: '218°C',
        pourPoint: '-38°C',
      },
    },
    {
      sku: 'OIL-SHELL-007',
      name: 'Shell Helix HX7 10W-40',
      description: 'Полусинтетическое масло для старых автомобилей. Защита от износа и шламообразования.',
      brand: 'Shell',
      type: 'semi-synthetic',
      viscosity: '10W-40',
      volume_ml: 4000,
      application: 'universal',
      price: 1899.99,
      stock: 80,
      images: ['https://via.placeholder.com/600x600/1e293b/94a3b8?text=Test+Oil'],
      characteristics: {
        acea: 'A3/B3',
        api: 'SL/CF',
        sae: '10W-40',
        viscosityIndex: 150,
        flashPoint: '205°C',
        pourPoint: '-30°C',
      },
    },
    {
      sku: 'OIL-MANNOL-008',
      name: 'Mannol Classic 15W-40',
      description: 'Минеральное масло для коммерческого транспорта и старых автомобилей.',
      brand: 'Mannol',
      type: 'mineral',
      viscosity: '15W-40',
      volume_ml: 5000,
      application: 'commercial',
      price: 1499.99,
      stock: 120,
      images: ['https://via.placeholder.com/600x600/1e293b/94a3b8?text=Test+Oil'],
      characteristics: {
        acea: 'A3/B4',
        api: 'CH-4',
        sae: '15W-40',
        viscosityIndex: 140,
        flashPoint: '200°C',
        pourPoint: '-25°C',
      },
    },
  ];

  // Create products
  for (const product of sampleProducts) {
    await prisma.product.upsert({
      where: { sku: product.sku },
      update: {},
      create: product,
    });
  }
  console.log(`${sampleProducts.length} sample products created`);

  console.log('Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('Error during seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });