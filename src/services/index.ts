import type { ProcessingServices } from "./processing/interfaces";
import { processingServices } from "./processing/worker-client";

export const services: ProcessingServices = processingServices;

export type * from "./processing/interfaces";
