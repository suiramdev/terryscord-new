import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "@terryscord/env/db";

// oxlint-disable-next-line import/no-relative-parent-imports -- avoid self-referential package import during module initialization
import { PrismaClient } from "../prisma/generated/client";

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

export default prisma;
