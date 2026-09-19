import { PrismaClient } from "@prisma/client";

let prisma: PrismaClient;

declare global {
  // eslint-disable-next-line no-var
  var __orderOpsPrisma: PrismaClient | undefined;
}

if (process.env.NODE_ENV === "production") {
  prisma = new PrismaClient();
} else {
  if (!global.__orderOpsPrisma) {
    global.__orderOpsPrisma = new PrismaClient();
  }
  prisma = global.__orderOpsPrisma;
}

export default prisma;
