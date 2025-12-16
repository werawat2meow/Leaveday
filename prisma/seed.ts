const { PrismaClient, Role } = require("@prisma/client");
const bcrypt = require("bcrypt");
const db = new PrismaClient();

async function main() {
    const email = process.env.MASTER_EMAIL || "master@@company.com";
    const pass = process.env.MASTER_PASSWORD || "ChangeMe!123";

    const exists = await db.user.findUnique({ where: { email } });
    if (exists) {
        console.log("Master admin already exists:", email);
        return;
    }

    const hash = await bcrypt.hash(pass, 12);
    await db.user.create({
        data: {
            email,
            name: "Master Admin",
            passwordHash: hash,
            role: Role.MASTER_ADMIN,
        },
    });
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
                    create: [{ name: "ทีม A" }, { name: "ทีม B" }]
                    }
                }
                ]
            }
            }
        ]
        }
    }
    });
    console.log("Seeded organization:", org.name);

    console.log("Seeded master admin:", email);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await db.$disconnect();
    });