// Single place to swap placeholder services for real implementations.
import type { ProcessingServices } from "./processing/interfaces";
import { placeholderServices } from "./processing/placeholder";

export const services: ProcessingServices = placeholderServices;

export type * from "./processing/interfaces";
