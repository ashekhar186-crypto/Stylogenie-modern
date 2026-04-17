// Seed script — creates default admin + demo user
// Run: npx ts-node prisma/seed.ts
import { PrismaClient } from "@prisma/client";
import * as argon2 from "argon2";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database…");

  // ── Admin account ──
  const adminHash = await argon2.hash("Admin@1234");
  const admin = await prisma.user.upsert({
    where: { email: "admin@stylogenie.com" },
    update: {},
    create: {
      name: "Admin",
      email: "admin@stylogenie.com",
      passwordHash: adminHash,
      role: "ADMIN",
    },
  });
  console.log("✅ Admin user:", admin.email);

  // ── Demo user account ──
  const demoHash = await argon2.hash("Demo@1234");
  const demo = await prisma.user.upsert({
    where: { email: "demo@stylogenie.com" },
    update: {},
    create: {
      name: "Demo User",
      email: "demo@stylogenie.com",
      passwordHash: demoHash,
      role: "MEMBER",
    },
  });
  console.log("✅ Demo user:", demo.email);

  console.log("\n🧞 StyloGenie seeded! Login credentials:");
  console.log("   Admin → admin@stylogenie.com / Admin@1234");
  console.log("   Demo  → demo@stylogenie.com  / Demo@1234");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
