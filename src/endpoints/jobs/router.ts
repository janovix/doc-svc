/**
 * Jobs Router
 * Sub-router for job endpoints
 */

import { Hono } from "hono";
import { fromHono } from "chanfana";
import { JobRead } from "./read";
import { JobList } from "./list";

export const jobsRouter = fromHono(new Hono());

jobsRouter.get("/", JobList);
jobsRouter.get("/:id", JobRead);
