const { PrismaClient, Role } = require("@prisma/client");
const bcrypt = require("bcrypt");
const db = new PrismaClient();

async function main() {
  // ===== MASTER ADMIN =====
  const masterEmail = process.env.MASTER_EMAIL || "master@company.com";
  const masterPass = process.env.MASTER_PASSWORD || "ChangeMe!123";

  const masterExists = await db.user.findUnique({
    where: { email: masterEmail },
  });

  if (!masterExists) {
    const masterHash = await bcrypt.hash(masterPass, 12);
    await db.user.create({
      data: {
        email: masterEmail,
        name: "Master Admin",
        passwordHash: masterHash,
        role: Role.MASTER_ADMIN,
      },
    });
    console.log("Seeded master admin:", masterEmail);
  }

  // ===== ADMIN =====
  const adminEmail = process.env.ADMIN_EMAIL || "admin@company.com";
  const adminPass = process.env.ADMIN_PASSWORD || "Admin123!";

  const adminExists = await db.user.findUnique({
    where: { email: adminEmail },
  });

  if (!adminExists) {
    const adminHash = await bcrypt.hash(adminPass, 12);
    await db.user.create({
      data: {
        email: adminEmail,
        name: "Admin",
        passwordHash: adminHash,
        role: Role.ADMIN,
      },
    });
    console.log("Seeded admin:", adminEmail);
  }

  // ===== ORGANIZATION =====
  const orgExists = await db.organization.findFirst();
  if (!orgExists) {
    const org = await db.organization.create({
      data: {
        name: "บริษัทตัวอย่าง",
        departments: {
          create: [
            {
              name: "ฝ่ายเทคโนโลยี",
              divisions: {
                create: [
                  {
                    name: "แผนกพัฒนา",
                    units: {
                      create: [{ name: "ทีม A" }, { name: "ทีม B" }],
                    },
                  },
                ],
              },
            },
          ],
        },
      },
    });
    console.log("Seeded organization:", org.name);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
