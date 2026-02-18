import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@terryscord/db/prisma/generated/client";
import { env } from "@terryscord/env/server";

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

export default prisma;
